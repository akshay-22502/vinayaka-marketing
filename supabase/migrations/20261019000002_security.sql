-- Who may do what: is_admin(), table grants, row level security and storage buckets.
--
-- Model: visitors read published content; admins (rows in public.admins) do
-- everything; quote tables and the admins table are admin-only. The server
-- writes quote requests with the service role, which bypasses RLS.

-- is_admin() -------------------------------------------------------------

-- Security definer so the check can read public.admins, which callers cannot.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Functions are executable by PUBLIC (and, on Supabase, by the API roles through
-- default privileges) unless revoked. Grant only what each role needs.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Table privileges ---------------------------------------------------------
-- Supabase grants every API role full access to new tables and relies on RLS.
-- Start from nothing and grant only what is needed, so RLS is not the only barrier.

revoke all on all tables in schema public from anon, authenticated;

-- Visitors: read-only, and only the tables that have a public policy below.
grant select on
  public.categories, public.products, public.spec_properties, public.spec_models,
  public.spec_values, public.applications, public.product_applications,
  public.certifications, public.projects, public.project_products, public.site_settings
to anon;

-- Signed-in users: every table, but RLS limits non-admins to the public reads.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- The server's service role bypasses RLS but still needs table privileges.
grant all on all tables in schema public to service_role;

-- Row level security -------------------------------------------------------

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.spec_properties enable row level security;
alter table public.spec_models enable row level security;
alter table public.spec_values enable row level security;
alter table public.applications enable row level security;
alter table public.product_applications enable row level security;
alter table public.certifications enable row level security;
alter table public.projects enable row level security;
alter table public.project_products enable row level security;
alter table public.site_settings enable row level security;
alter table public.quote_recipients enable row level security;
alter table public.quote_requests enable row level security;
alter table public.admins enable row level security;

-- Public reads: published rows only.
create policy "Anyone can read published categories" on public.categories
  for select using (published);
create policy "Anyone can read published products" on public.products
  for select using (published);
create policy "Anyone can read published applications" on public.applications
  for select using (published);
create policy "Anyone can read published certifications" on public.certifications
  for select using (published);
create policy "Anyone can read published projects" on public.projects
  for select using (published);

-- Spec tables follow their product.
create policy "Anyone can read specs of published products" on public.spec_properties
  for select using (
    exists (select 1 from public.products p where p.id = spec_properties.product_id and p.published)
  );
create policy "Anyone can read spec models of published products" on public.spec_models
  for select using (
    exists (select 1 from public.products p where p.id = spec_models.product_id and p.published)
  );
create policy "Anyone can read spec values of published products" on public.spec_values
  for select using (
    exists (
      select 1
      from public.spec_properties sp
      join public.products p on p.id = sp.product_id
      where sp.id = spec_values.property_id and p.published
    )
  );

-- Link tables expose a link only when both ends are published.
create policy "Anyone can read links between published rows" on public.product_applications
  for select using (
    exists (select 1 from public.products p where p.id = product_applications.product_id and p.published)
    and exists (
      select 1 from public.applications a where a.id = product_applications.application_id and a.published
    )
  );
create policy "Anyone can read links between published rows" on public.project_products
  for select using (
    exists (select 1 from public.projects j where j.id = project_products.project_id and j.published)
    and exists (select 1 from public.products p where p.id = project_products.product_id and p.published)
  );

create policy "Anyone can read the site settings" on public.site_settings
  for select using (true);

-- Admins: full access to every table. quote_recipients, quote_requests and admins
-- have no other policy, so nobody else can read or write them.
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'products', 'spec_properties', 'spec_models', 'spec_values',
    'applications', 'product_applications', 'certifications', 'projects',
    'project_products', 'site_settings', 'quote_recipients', 'quote_requests', 'admins'
  ]
  loop
    execute format(
      'create policy "Admins have full access" on public.%I
         for all to authenticated
         using ((select public.is_admin()))
         with check ((select public.is_admin()))',
      t
    );
  end loop;
end;
$$;

-- Storage ------------------------------------------------------------------

-- public-media: product/category images, datasheets, certificates. Public buckets
-- serve objects by URL without any policy; listing and writing need one.
-- quote-attachments: buyer files, at most 4 MB. Written by the server with the
-- service role (which bypasses RLS) and read by admins through signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('public-media', 'public-media', true, null),
  ('quote-attachments', 'quote-attachments', false, 4194304)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

create policy "Admins manage public media" on storage.objects
  for all to authenticated
  using (bucket_id = 'public-media' and (select public.is_admin()))
  with check (bucket_id = 'public-media' and (select public.is_admin()));

create policy "Admins read quote attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'quote-attachments' and (select public.is_admin()));
