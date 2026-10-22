-- Documents kept with each purchase: the supplier's invoice, packing list, bill of lading, bill
-- of entry, the agent's and transporter's bills, payment receipts, photos. Each document has a
-- category, and the admin adds, renames and removes the categories. The files themselves are in
-- the private purchase-documents bucket and are opened through short-lived signed links.
-- Admin-only, like the purchases they belong to.

create table public.document_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name <> ''),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Two categories may not share a name, whatever the capitals.
create unique index document_categories_name_key on public.document_categories (lower(name));

create table public.purchase_documents (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  -- Deleting a category keeps its documents, without a category.
  category_id uuid references public.document_categories (id) on delete set null,
  title text not null check (title <> ''),
  -- Path in the purchase-documents bucket: purchases/<purchase id>/<uuid>-<file name>.
  file_path text not null unique check (file_path like 'purchases/%'),
  document_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchase_documents_purchase_id_idx on public.purchase_documents (purchase_id, created_at);
create index purchase_documents_category_id_idx on public.purchase_documents (category_id);

create trigger set_updated_at before update on public.document_categories
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.purchase_documents
  for each row execute function public.set_updated_at();

insert into public.document_categories (name, sort_order) values
  ('Supplier invoice', 10),
  ('Packing list', 20),
  ('Bill of lading', 30),
  ('Bill of entry / customs', 40),
  ('Freight and agent bills', 50),
  ('Payment receipts', 60),
  ('Other', 100);

-- Who may do what: admins only (see 20261019000002_security.sql for the model).
revoke all on public.document_categories, public.purchase_documents from anon, authenticated;
grant select, insert, update, delete on public.document_categories, public.purchase_documents to authenticated;
grant all on public.document_categories, public.purchase_documents to service_role;

alter table public.document_categories enable row level security;
alter table public.purchase_documents enable row level security;

create policy "Admins have full access" on public.document_categories
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins have full access" on public.purchase_documents
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Storage: a private bucket, read and written only by admins. It takes what the admin screen
-- offers (src/lib/admin/upload.ts: DOCUMENT_ACCEPT and MAX_DOCUMENT_BYTES, 20 MB);
-- tests/db/storage-limits.test.ts fails if the two drift apart.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'purchase-documents',
  'purchase-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/csv'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins manage purchase documents" on storage.objects
  for all to authenticated
  using (bucket_id = 'purchase-documents' and (select public.is_admin()))
  with check (bucket_id = 'purchase-documents' and (select public.is_admin()));
