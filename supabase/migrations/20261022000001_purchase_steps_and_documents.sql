-- Purchases step by step, as they happen in the market, with documents at each step.
--
--  1. Supplier quotation: quotation number and date, validity, delivery terms (incoterm), payment
--     terms, the products and prices, and the exchange rate we expect.
--  2. At the port: containers, bill of lading, bill of entry, and the port and import costs.
--  3. Delivery: when and where the goods went, the transporter, and the delivery costs.
--  4. Bank payment: the rate the bank actually charged (it replaces the expected rate in the final
--     price), bank charges, and the rates to show the final price in US dollars and dirhams too.
--
-- Every cost and every document belongs to one step. A cost added without a step (an older
-- script, a hand-made insert) gets its kind's usual step from a trigger.

-- Purchases: the new statuses and each step's fields -------------------------------------

alter table public.purchases drop constraint purchases_status_check;
alter table public.purchases add constraint purchases_status_check
  check (status in ('quotation', 'ordered', 'shipped', 'arrived', 'delivered', 'cancelled'));

alter table public.purchases
  add column quotation_number text not null default '',
  add column quotation_date date,
  add column quote_valid_until date,
  add column incoterm text check (incoterm in ('EXW', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP')),
  add column payment_terms text not null default '',
  add column bill_of_entry_number text not null default '',
  add column delivery_date date,
  add column delivered_to text not null default '',      -- warehouse, or the buyer's site
  add column transporter text not null default '',       -- transporter, vehicle number
  add column payment_date date,
  add column bank_name text not null default '',
  -- What one unit of the supplier's currency cost at the bank, in the destination currency. Once
  -- set, the final price uses it instead of exchange_rate (the rate expected at quotation).
  add column bank_rate numeric(14, 6) check (bank_rate > 0),
  -- One US dollar in the destination currency: only needed when the supplier is paid in yuan.
  add column usd_rate numeric(14, 6) check (usd_rate > 0),
  -- One dirham in rupees: shows an Indian purchase in AED, or a UAE purchase in INR.
  add column inr_per_aed numeric(14, 6) check (inr_per_aed > 0);

-- Costs: more kinds, and the step each one belongs to -------------------------------------

alter table public.purchase_costs drop constraint purchase_costs_kind_check;
alter table public.purchase_costs add constraint purchase_costs_kind_check check (
  kind in (
    'supplier_charges', 'freight', 'insurance', 'customs_duty', 'import_tax', 'clearance', 'port',
    'shipping_line', 'cfs', 'stamp_duty', 'transport', 'unloading', 'bank_charges', 'other'
  )
);

alter table public.purchase_costs add column stage text
  check (stage in ('quotation', 'port', 'delivery', 'payment'));

-- A cost saved without a step gets its kind's usual step. Keep in step with DEFAULT_COST_STEP in
-- src/lib/admin/purchases.ts. (A trigger function needs no EXECUTE grant for the roles that fire it.)
create function public.set_cost_stage() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.stage is null then
    new.stage := case
      when new.kind = 'supplier_charges' then 'quotation'
      when new.kind in ('transport', 'unloading') then 'delivery'
      when new.kind = 'bank_charges' then 'payment'
      else 'port'
    end;
  end if;
  return new;
end;
$$;

create trigger set_cost_stage before insert or update on public.purchase_costs
  for each row execute function public.set_cost_stage();

-- The costs already saved get their step from the trigger, then the step is required.
update public.purchase_costs set stage = null;
alter table public.purchase_costs alter column stage set not null;

-- Documents --------------------------------------------------------------------------------
--
-- The supplier's quotation and invoice, packing list, bill of lading, bill of entry, the agent's
-- and transporter's bills, the bank's remittance advice, photos. Each document has a step and a
-- category, and the admin adds, renames and removes the categories. The files themselves are in
-- the private purchase-documents bucket and are opened through short-lived signed links.

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
  stage text not null default 'quotation' check (stage in ('quotation', 'port', 'delivery', 'payment')),
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
  ('Quotation / proforma invoice', 10),
  ('Commercial invoice', 20),
  ('Packing list', 30),
  ('Bill of lading', 40),
  ('Bill of entry / customs', 50),
  ('CHA and freight bills', 60),
  ('Transport and delivery bills', 70),
  ('Bank remittance advice', 80),
  ('Payment receipts', 90),
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
