-- TerraTechBharat: content tables, quote tables and triggers.
-- Row level security and grants live in 20261019000002_security.sql.

-- Keeps updated_at current. Only called by triggers, so it is not exposed to API roles.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Content ---------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  intro text not null default '',
  image_path text,
  sort_order int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null,
  summary text not null default '',
  overview text not null default '',            -- markdown
  features text[] not null default '{}',
  images text[] not null default '{}',          -- storage paths in public-media
  datasheet_path text,
  sort_order int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_id_idx on public.products (category_id);

-- Spec table: properties are the rows, models the columns, values the cells.
create table public.spec_properties (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  unit text not null default '',
  test_method text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index spec_properties_product_id_idx on public.spec_properties (product_id, sort_order);

create table public.spec_models (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  code text not null,                           -- e.g. BX1515
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index spec_models_product_id_idx on public.spec_models (product_id, sort_order);

create table public.spec_values (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.spec_properties (id) on delete cascade,
  model_id uuid not null references public.spec_models (id) on delete cascade,
  value text not null default '',               -- text, e.g. "15 / 15" for MD/XMD
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, model_id)
);
create index spec_values_model_id_idx on public.spec_values (model_id);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  summary text not null default '',
  body text not null default '',                -- markdown
  image_path text,
  sort_order int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_applications (
  product_id uuid not null references public.products (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  primary key (product_id, application_id)
);
create index product_applications_application_id_idx on public.product_applications (application_id);

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  issuer text not null default '',
  valid_until date,
  file_path text,
  image_path text,
  sort_order int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  location text not null default '',
  country text not null check (country in ('IN', 'AE')),
  summary text not null default '',
  body text not null default '',                -- markdown
  images text[] not null default '{}',          -- storage paths in public-media
  sort_order int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_products (
  project_id uuid not null references public.projects (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (project_id, product_id)
);
create index project_products_product_id_idx on public.project_products (product_id);

-- One row of site-wide text and office details.
create table public.site_settings (
  id int primary key default 1 check (id = 1),
  tagline text not null default '',
  hero_title text not null default '',
  hero_text text not null default '',
  about_md text not null default '',
  india_address text not null default '',
  india_phone text not null default '',
  india_whatsapp text not null default '',
  india_email text not null default '',
  uae_address text not null default '',
  uae_phone text not null default '',
  uae_whatsapp text not null default '',
  uae_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (1);

-- Quotes ----------------------------------------------------------------

-- Where each country's quote notifications go. Kept apart so it is never readable by visitors.
create table public.quote_recipients (
  country text primary key check (country in ('IN', 'AE')),
  email text not null
);

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text not null,
  phone text not null,
  country text not null check (country in ('IN', 'AE')),
  products text[] not null default '{}',
  quantity text,
  project_location text,
  message text not null,
  attachment_path text,
  status text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'closed')),
  admin_notes text,
  email_sent boolean not null default false,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quote_requests_ip_hash_created_at_idx on public.quote_requests (ip_hash, created_at);
create index quote_requests_status_created_at_idx on public.quote_requests (status, created_at desc);

-- Users allowed into /admin.
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- updated_at triggers -----------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'products', 'spec_properties', 'spec_models', 'spec_values',
    'applications', 'certifications', 'projects', 'site_settings', 'quote_requests'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;
