-- Buyers get their own City and State (emirate in the UAE) fields, so the admin list can filter
-- by city. `location` stays for the area or street address. Existing rows kept the place in
-- `location` as "City, State" (India) or "City (Area)" (UAE); it is split into the new fields here.
-- Every step only touches rows still in the old shape, so running it twice changes nothing.
alter table public.wholesale_buyers
  add column if not exists city text not null default '',
  add column if not exists state text not null default '';

create index if not exists wholesale_buyers_country_city_idx on public.wholesale_buyers (country, city);

-- 1. City and state from the old location text.
with parsed as (
  select
    id,
    country,
    trim(split_part(regexp_replace(location, '\s*\(.*\)\s*$', ''), ',', 1)) as head,
    trim(split_part(regexp_replace(location, '\s*\(.*\)\s*$', ''), ',', 2)) as tail
  from public.wholesale_buyers
  where city = '' and state = '' and location <> ''
)
update public.wholesale_buyers b
set
  city = case when p.head in ('India', 'UAE') then '' else p.head end,
  state = case
    when p.tail <> '' then p.tail
    when p.country = 'IN' and p.head in ('New Delhi', 'Delhi') then 'Delhi'
    when p.country = 'AE' and p.head in ('Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah')
      then p.head
    else ''
  end
from parsed p
where b.id = p.id;

-- 2. What is left of the old text is the area: "Dubai (Deira)" keeps "Deira", "Ahmedabad, Gujarat" keeps nothing.
update public.wholesale_buyers
set location = trim(coalesce(substring(location from '\((.*)\)\s*$'), ''))
where city <> '' and location like city || '%';

update public.wholesale_buyers set location = '' where city = '' and location in ('India', 'UAE');
