-- Suppliers (the manufacturers we buy from, mostly in China) and purchases from them: one purchase
-- is one order or shipment, with its product lines and its shipping and import costs. The landed
-- cost (goods plus costs, per roll and per square metre) is worked out by the admin pages from
-- these rows. Admin-only, like the buyers list: purchase prices never reach the public site.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name <> ''),
  country text not null default 'China',
  location text not null default '',            -- city / province
  contact_person text not null default '',
  phone text not null default '',
  mobile text not null default '',              -- mobile, WhatsApp or WeChat
  email text not null default '',
  website text not null default '',
  makes text not null default '',               -- what they make
  payment_terms text not null default '',       -- e.g. 30% advance, 70% against B/L
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  -- A supplier with purchases cannot be deleted: the purchases are the record of what was paid.
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  reference text not null default '',           -- PO, proforma or invoice number
  destination text not null check (destination in ('IN', 'AE')),
  status text not null default 'ordered' check (status in ('ordered', 'shipped', 'arrived', 'cancelled')),
  order_date date,
  arrival_date date,
  -- Supplier prices are in this currency; exchange_rate is how much one unit of it cost in the
  -- destination currency (INR for India, AED for the UAE).
  currency text not null default 'USD' check (currency in ('USD', 'CNY')),
  exchange_rate numeric(14, 6) not null check (exchange_rate > 0),
  container_type text check (container_type in ('20ft', '40ft', '40ft_hc', 'lcl')),
  container_count integer not null default 1 check (container_count between 0 and 1000),
  container_numbers text not null default '',
  bl_number text not null default '',           -- bill of lading
  port_of_loading text not null default '',
  port_of_discharge text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchases_supplier_id_idx on public.purchases (supplier_id);
create index purchases_order_date_idx on public.purchases (order_date desc nulls last, created_at desc);

-- One product on a purchase: how many rolls of what size, and the supplier price per square
-- metre or per roll. The product link is optional (a product not in the catalogue is described in
-- `description`), and deleting a catalogue product keeps the line.
create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text not null default '',         -- grade, thickness, roll size...
  rolls integer not null check (rolls > 0),
  sqm_per_roll numeric(12, 3) not null check (sqm_per_roll > 0),
  price_basis text not null default 'sqm' check (price_basis in ('sqm', 'roll')),
  unit_price numeric(14, 4) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);
create index purchase_items_purchase_id_idx on public.purchase_items (purchase_id, created_at);
create index purchase_items_product_id_idx on public.purchase_items (product_id);

-- Shipping, import and other costs of a purchase, each in the supplier currency or the
-- destination currency. A cost that is claimed back (IGST or VAT credit) can be kept out of the landed cost.
create table public.purchase_costs (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  kind text not null check (
    kind in ('freight', 'insurance', 'customs_duty', 'import_tax', 'clearance', 'port', 'transport', 'other')
  ),
  description text not null default '',
  amount numeric(14, 2) not null check (amount >= 0),
  in_purchase_currency boolean not null default false,
  in_landed_cost boolean not null default true,
  created_at timestamptz not null default now()
);
create index purchase_costs_purchase_id_idx on public.purchase_costs (purchase_id, created_at);

create trigger set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();

-- Who may do what: admins only (see 20261019000002_security.sql for the model).
revoke all on public.suppliers, public.purchases, public.purchase_items, public.purchase_costs from anon, authenticated;
grant select, insert, update, delete on public.suppliers, public.purchases, public.purchase_items, public.purchase_costs to authenticated;
grant all on public.suppliers, public.purchases, public.purchase_items, public.purchase_costs to service_role;

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchase_costs enable row level security;

create policy "Admins have full access" on public.suppliers
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins have full access" on public.purchases
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins have full access" on public.purchase_items
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins have full access" on public.purchase_costs
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
