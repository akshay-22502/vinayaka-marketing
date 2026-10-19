-- save_spec_table(): replaces a product's whole spec table in one call, and
-- therefore in one transaction: either every row is saved or nothing changes.
--
-- p_grid = {
--   "models": ["BX1515", "BX2020"],
--   "rows":   [{"name": "Tensile strength", "unit": "kN/m", "test_method": "ASTM D6637",
--               "values": ["15", "20"]}]       -- one value per model, in model order
-- }
-- Array order becomes sort_order (from 0).
--
-- Security invoker: the caller's own RLS applies, and the function refuses
-- anyone who is not an admin before touching anything.
create function public.save_spec_table(p_product_id uuid, p_grid jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_models jsonb;
  v_rows jsonb;
  v_model_count int;
  v_model_ids uuid[];
  v_row jsonb;
  v_row_name text;
  v_property_id uuid;
  v_row_index int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can save a spec table' using errcode = '42501';
  end if;

  if p_grid is null
     or jsonb_typeof(p_grid) <> 'object'
     or jsonb_typeof(p_grid -> 'models') is distinct from 'array'
     or jsonb_typeof(p_grid -> 'rows') is distinct from 'array' then
    raise exception 'Spec grid must be an object with "models" and "rows" arrays'
      using errcode = '22023';
  end if;
  v_models := p_grid -> 'models';
  v_rows := p_grid -> 'rows';
  v_model_count := jsonb_array_length(v_models);

  -- Lock the product so two simultaneous saves cannot interleave.
  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product % not found', p_product_id using errcode = 'P0002';
  end if;

  -- Validate everything before deleting anything.
  if exists (
    select 1 from jsonb_array_elements(v_models) m
    where jsonb_typeof(m) <> 'string' or btrim(m #>> '{}') = ''
  ) then
    raise exception 'Every model code must be a non-empty string' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(v_rows) loop
    v_row_index := v_row_index + 1;
    if jsonb_typeof(v_row) <> 'object'
       or jsonb_typeof(v_row -> 'name') is distinct from 'string'
       or btrim(v_row ->> 'name') = '' then
      raise exception 'Row % needs a non-empty name', v_row_index using errcode = '22023';
    end if;
    v_row_name := btrim(v_row ->> 'name');
    if jsonb_typeof(v_row -> 'values') is distinct from 'array' then
      raise exception 'Row "%" needs a "values" array', v_row_name using errcode = '22023';
    end if;
    if jsonb_array_length(v_row -> 'values') <> v_model_count then
      raise exception 'Row "%" has % values but there are % models',
        v_row_name, jsonb_array_length(v_row -> 'values'), v_model_count
        using errcode = '22023';
    end if;
  end loop;

  -- Replace. spec_values rows go with their property and model (on delete cascade).
  delete from public.spec_properties where product_id = p_product_id;
  delete from public.spec_models where product_id = p_product_id;

  insert into public.spec_models (product_id, code, sort_order)
  select p_product_id, btrim(m.code), (m.position - 1)::int
  from jsonb_array_elements_text(v_models) with ordinality as m(code, position);

  select coalesce(array_agg(id order by sort_order), '{}')
    into v_model_ids
    from public.spec_models
   where product_id = p_product_id;

  v_row_index := 0;
  for v_row in select value from jsonb_array_elements(v_rows) loop
    insert into public.spec_properties (product_id, name, unit, test_method, sort_order)
    values (
      p_product_id,
      btrim(v_row ->> 'name'),
      coalesce(v_row ->> 'unit', ''),
      coalesce(v_row ->> 'test_method', ''),
      v_row_index
    )
    returning id into v_property_id;

    insert into public.spec_values (property_id, model_id, value)
    select v_property_id, v_model_ids[v.position::int], coalesce(v.cell, '')
    from jsonb_array_elements_text(v_row -> 'values') with ordinality as v(cell, position);

    v_row_index := v_row_index + 1;
  end loop;
end;
$$;

-- Only signed-in users may call it (and it still refuses non-admins).
revoke all on function public.save_spec_table(uuid, jsonb) from public, anon;
grant execute on function public.save_spec_table(uuid, jsonb) to authenticated;
