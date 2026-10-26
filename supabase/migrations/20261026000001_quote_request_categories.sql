-- The quote form now asks which product categories (Geogrid, Geomembrane, ...) the buyer wants,
-- instead of listing every product. Category slugs are kept here; `products` stays for older
-- requests and for API callers that still send product slugs.
alter table public.quote_requests add column categories text[] not null default '{}';
