-- Wholesale buyers: companies in India and the UAE that could buy in bulk, where each one is
-- on the way to becoming a customer (status), and a dated log of notes about them.
-- Admin-only, like the quote tables: visitors and signed-in non-admins see nothing.

create table public.wholesale_buyers (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  country text not null check (country in ('IN', 'AE')),
  buyer_type text not null default '',          -- e.g. Trader, EPC contractor
  interested_in text not null default '',       -- what they would buy
  location text not null default '',            -- city / state or emirate / area
  contact_person text not null default '',
  phone text not null default '',
  mobile text not null default '',              -- mobile or WhatsApp
  email text not null default '',
  website text not null default '',
  priority text check (priority in ('high', 'medium', 'low')),
  status text not null default 'not_contacted' check (
    status in ('not_contacted', 'contacted', 'in_discussion', 'quoted', 'onboarded', 'not_interested')
  ),
  source text not null default '',              -- where the contact details came from
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wholesale_buyers_country_status_idx on public.wholesale_buyers (country, status);

-- One entry per update about a buyer. A note can also move the buyer to a new status; the
-- status it set is kept on the note, so the log shows when each step happened.
create table public.wholesale_buyer_notes (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.wholesale_buyers (id) on delete cascade,
  body text not null default '',
  status text check (
    status in ('not_contacted', 'contacted', 'in_discussion', 'quoted', 'onboarded', 'not_interested')
  ),
  created_at timestamptz not null default now(),
  check (body <> '' or status is not null)
);
create index wholesale_buyer_notes_buyer_id_created_at_idx on public.wholesale_buyer_notes (buyer_id, created_at desc);

create trigger set_updated_at before update on public.wholesale_buyers
  for each row execute function public.set_updated_at();

-- A note that sets a status moves its buyer to that status in the same statement, so the
-- buyer's status and the log never disagree. Runs as the caller, so RLS still applies.
create function public.apply_buyer_note_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not null then
    update public.wholesale_buyers set status = new.status where id = new.buyer_id;
  end if;
  return new;
end;
$$;
revoke all on function public.apply_buyer_note_status() from public, anon, authenticated;

create trigger apply_status after insert on public.wholesale_buyer_notes
  for each row execute function public.apply_buyer_note_status();

-- Who may do what: admins only (see 20261019000002_security.sql for the model).
revoke all on public.wholesale_buyers, public.wholesale_buyer_notes from anon, authenticated;
grant select, insert, update, delete on public.wholesale_buyers, public.wholesale_buyer_notes to authenticated;
grant all on public.wholesale_buyers, public.wholesale_buyer_notes to service_role;

alter table public.wholesale_buyers enable row level security;
alter table public.wholesale_buyer_notes enable row level security;

create policy "Admins have full access" on public.wholesale_buyers
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins have full access" on public.wholesale_buyer_notes
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
