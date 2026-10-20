-- TerraTechBharat starter catalogue.
--
-- Loaded by `supabase db reset` and by the launch runbook after `supabase db push`.
-- Run it once on an empty catalogue: a second run stops at the first insert
-- (duplicate category slug), so it can never overwrite what the owner has edited.
--
-- Everything here is a starting point for the owner to correct in /admin:
--   * categories and applications are published, so the site has structure from day one;
--   * every product is UNPUBLISHED, because the spec values are typical industry
--     figures and must be checked against the manufacturer's datasheet first;
--   * no certifications, projects or quote recipients are created;
--   * images are left empty; the site falls back to /placeholders/<category-slug>.svg.
--
-- Copy is original. The brand name is TerraTechBharat.

-- Categories -------------------------------------------------------------

insert into public.categories (slug, name, intro, sort_order, published) values
  ('geogrid', 'Geogrid',
   'Polymer grids that reinforce soil and aggregate. Their open apertures lock into the fill, which spreads loads, limits settlement and lets roads, platforms and retaining structures be built thinner or steeper.',
   1, true),
  ('geomembrane', 'Geomembrane',
   'Impermeable polyethylene sheets used as liners and covers. They keep liquids and gases where they belong in landfills, ponds, canals and tanks.',
   2, true),
  ('geotextile', 'Geotextile',
   'Permeable fabrics that separate, filter, drain and protect. They keep soil layers apart, let water pass without carrying soil with it, and cushion liners against damage.',
   3, true),
  ('geocell', 'Geocell',
   'Three-dimensional honeycomb panels that confine infill. Filled with soil, sand or aggregate they build stable working platforms, protect slopes and channels, and support weak subgrades.',
   4, true);

-- Spec table helper ------------------------------------------------------
-- Fills one product's spec table from {"models": [...], "rows": [{name, unit,
-- test_method, values: [...]}]}, the same shape save_spec_table() takes. The
-- seed runs as the database owner, so it cannot call that admin-only RPC.
-- Lives in pg_temp, so it disappears when the seed's session ends.

create function pg_temp.seed_spec_table(p_product_slug text, p_grid jsonb)
returns void
language plpgsql
as $$
declare
  v_product_id uuid;
  v_model_ids uuid[];
  v_row jsonb;
  v_index int := 0;
  v_property_id uuid;
begin
  select id into strict v_product_id from public.products where slug = p_product_slug;

  insert into public.spec_models (product_id, code, sort_order)
  select v_product_id, m.code, (m.position - 1)::int
  from jsonb_array_elements_text(p_grid -> 'models') with ordinality as m(code, position);

  select array_agg(id order by sort_order) into v_model_ids
  from public.spec_models where product_id = v_product_id;

  for v_row in select value from jsonb_array_elements(p_grid -> 'rows') loop
    if jsonb_array_length(v_row -> 'values') <> cardinality(v_model_ids) then
      raise exception '% / %: expected % values, got %',
        p_product_slug, v_row ->> 'name', cardinality(v_model_ids), jsonb_array_length(v_row -> 'values');
    end if;

    insert into public.spec_properties (product_id, name, unit, test_method, sort_order)
    values (v_product_id, v_row ->> 'name', v_row ->> 'unit', v_row ->> 'test_method', v_index)
    returning id into v_property_id;

    insert into public.spec_values (property_id, model_id, value)
    select v_property_id, v_model_ids[v.position::int], v.cell
    from jsonb_array_elements_text(v_row -> 'values') with ordinality as v(cell, position);

    v_index := v_index + 1;
  end loop;
end;
$$;

-- Products: Geogrid ------------------------------------------------------

insert into public.products (slug, category_id, name, summary, overview, features, sort_order, published)
values (
  'pp-biaxial-geogrid',
  (select id from public.categories where slug = 'geogrid'),
  'PP Biaxial Geogrid',
  'Punched and drawn polypropylene grid with equal strength in both directions, used to stabilise weak subgrades and strengthen granular bases.',
  $md$Made by punching a polypropylene sheet and stretching it in both directions, this geogrid has stiff ribs and rigid junctions that interlock with the surrounding aggregate. Tensile strength is the same along and across the roll, so a single layer confines the fill whichever way the load spreads. It is used under roads, hardstands, rail ballast and working platforms to cut base thickness and reduce rutting over soft ground.$md$,
  array[
    'Equal strength in the machine and cross-machine directions',
    'Rigid, high-efficiency junctions that do not pull apart under load',
    'Open apertures that lock granular fill in place',
    'Carbon black stabilised against UV and weathering',
    'Resistant to rot, soil chemistry and alkaline fills',
    'Supplied in wide rolls for fast laying'
  ],
  1, false
);

select pg_temp.seed_spec_table('pp-biaxial-geogrid', $grid$
{
  "models": ["BX1515", "BX2020", "BX3030", "BX4040"],
  "rows": [
    {"name": "Tensile strength, MD / XMD", "unit": "kN/m", "test_method": "ASTM D6637",
     "values": ["15 / 15", "20 / 20", "30 / 30", "40 / 40"]},
    {"name": "Tensile strength at 2% strain, MD / XMD", "unit": "kN/m", "test_method": "ASTM D6637",
     "values": ["5 / 5", "7 / 7", "10.5 / 10.5", "14 / 14"]},
    {"name": "Tensile strength at 5% strain, MD / XMD", "unit": "kN/m", "test_method": "ASTM D6637",
     "values": ["10 / 10", "14 / 14", "21 / 21", "28 / 28"]},
    {"name": "Junction efficiency", "unit": "%", "test_method": "GRI-GG2",
     "values": ["≥ 93", "≥ 93", "≥ 93", "≥ 93"]},
    {"name": "Aperture size, MD x XMD", "unit": "mm", "test_method": "",
     "values": ["40 x 40", "40 x 40", "40 x 40", "40 x 40"]},
    {"name": "Carbon black content", "unit": "%", "test_method": "ASTM D4218",
     "values": ["≥ 2.0", "≥ 2.0", "≥ 2.0", "≥ 2.0"]},
    {"name": "Roll size (W x L)", "unit": "m", "test_method": "",
     "values": ["3.95 x 50", "3.95 x 50", "3.95 x 50", "3.95 x 50"]}
  ]
}
$grid$::jsonb);

insert into public.products (slug, category_id, name, summary, overview, features, sort_order, published)
values (
  'polyester-uniaxial-geogrid',
  (select id from public.categories where slug = 'geogrid'),
  'Polyester Uniaxial Geogrid',
  'High-tenacity polyester geogrid with its strength in one direction, for reinforced soil walls, steep slopes and embankments on soft ground.',
  $md$Warp-knitted from high-tenacity polyester yarn and protected with a polymer coating, this geogrid carries its strength along the roll direction. It combines high tensile capacity with low elongation under sustained load, which is what reinforced soil walls, steep slopes and basal reinforcement of embankments need. The coating shields the yarns from installation damage and from the chemistry of the fill.$md$,
  array[
    'High tensile strength along the roll, from 50 to 200 kN/m',
    'Low elongation and low creep under sustained load',
    'Polymer coating protects the yarns during installation',
    'Resistant to biological degradation in the soil',
    'Flexible rolls that follow the contour of the ground'
  ],
  2, false
);

select pg_temp.seed_spec_table('polyester-uniaxial-geogrid', $grid$
{
  "models": ["PET50", "PET80", "PET100", "PET150", "PET200"],
  "rows": [
    {"name": "Ultimate tensile strength", "unit": "kN/m", "test_method": "ISO 10319",
     "values": ["50", "80", "100", "150", "200"]},
    {"name": "Elongation at break", "unit": "%", "test_method": "ISO 10319",
     "values": ["≤ 12", "≤ 12", "≤ 12", "≤ 12", "≤ 12"]},
    {"name": "Creep reduction factor (120 years)", "unit": "", "test_method": "ISO 13431",
     "values": ["1.60", "1.60", "1.60", "1.60", "1.60"]},
    {"name": "Roll size (W x L)", "unit": "m", "test_method": "",
     "values": ["5 x 100", "5 x 100", "5 x 100", "5 x 50", "5 x 50"]}
  ]
}
$grid$::jsonb);

-- Products: Geomembrane --------------------------------------------------

insert into public.products (slug, category_id, name, summary, overview, features, sort_order, published)
values (
  'hdpe-geomembrane',
  (select id from public.categories where slug = 'geomembrane'),
  'HDPE Geomembrane',
  'Smooth high-density polyethylene liner for landfills, ponds, canals and tanks, supplied from 0.5 mm to 2.0 mm thick.',
  $md$Smooth HDPE geomembrane is extruded from high-density polyethylene resin with carbon black and antioxidant additives. It has very low permeability to liquids and gases, strong chemical resistance and good UV stability, which makes it a standard liner for landfills, mining ponds and water storage. Sheets are joined on site by hot-wedge or extrusion welding and the seams are tested before the liner is covered.$md$,
  array[
    'Very low permeability to liquids and gases',
    'Resistant to most acids, alkalis and landfill leachate',
    'Carbon black and antioxidant package for outdoor exposure',
    'High yield strength and puncture resistance',
    'Seamed on site by hot-wedge or extrusion welding'
  ],
  1, false
);

select pg_temp.seed_spec_table('hdpe-geomembrane', $grid$
{
  "models": ["0.5 mm", "0.75 mm", "1.0 mm", "1.5 mm", "2.0 mm"],
  "rows": [
    {"name": "Thickness (nominal)", "unit": "mm", "test_method": "ASTM D5199",
     "values": ["0.50", "0.75", "1.00", "1.50", "2.00"]},
    {"name": "Density", "unit": "g/cm³", "test_method": "ASTM D1505",
     "values": ["≥ 0.940", "≥ 0.940", "≥ 0.940", "≥ 0.940", "≥ 0.940"]},
    {"name": "Tensile strength at yield", "unit": "kN/m", "test_method": "ASTM D6693",
     "values": ["≥ 7", "≥ 11", "≥ 15", "≥ 22", "≥ 29"]},
    {"name": "Tensile strength at break", "unit": "kN/m", "test_method": "ASTM D6693",
     "values": ["≥ 13", "≥ 20", "≥ 27", "≥ 40", "≥ 53"]},
    {"name": "Elongation at yield", "unit": "%", "test_method": "ASTM D6693",
     "values": ["≥ 12", "≥ 12", "≥ 12", "≥ 12", "≥ 12"]},
    {"name": "Elongation at break", "unit": "%", "test_method": "ASTM D6693",
     "values": ["≥ 700", "≥ 700", "≥ 700", "≥ 700", "≥ 700"]},
    {"name": "Tear resistance", "unit": "N", "test_method": "ASTM D1004",
     "values": ["≥ 62", "≥ 93", "≥ 125", "≥ 187", "≥ 249"]},
    {"name": "Puncture resistance", "unit": "N", "test_method": "ASTM D4833",
     "values": ["≥ 160", "≥ 240", "≥ 320", "≥ 480", "≥ 640"]},
    {"name": "Carbon black content", "unit": "%", "test_method": "ASTM D4218",
     "values": ["2.0–3.0", "2.0–3.0", "2.0–3.0", "2.0–3.0", "2.0–3.0"]},
    {"name": "Roll size (W x L)", "unit": "m", "test_method": "",
     "values": ["7 x 300", "7 x 200", "7 x 150", "7 x 100", "7 x 75"]}
  ]
}
$grid$::jsonb);

insert into public.products (slug, category_id, name, summary, overview, features, sort_order, published)
values (
  'lldpe-geomembrane',
  (select id from public.categories where slug = 'geomembrane'),
  'LLDPE Geomembrane',
  'Flexible linear low-density polyethylene liner that follows uneven subgrades and tolerates differential settlement.',
  $md$LLDPE geomembrane trades some of the stiffness of HDPE for much higher flexibility and elongation. It follows uneven subgrades, tolerates differential settlement and is easier to fold and deploy in cool weather. It suits pond and canal liners, heap leach pads, tank linings and landfill caps.$md$,
  array[
    'Flexible sheet that conforms to uneven ground',
    'High elongation at break for movement and settlement',
    'Good tear and puncture resistance for its thickness',
    'Carbon black stabilised for outdoor exposure',
    'Seamed on site by hot-wedge or extrusion welding'
  ],
  2, false
);

select pg_temp.seed_spec_table('lldpe-geomembrane', $grid$
{
  "models": ["0.5 mm", "0.75 mm", "1.0 mm", "1.5 mm", "2.0 mm"],
  "rows": [
    {"name": "Thickness (nominal)", "unit": "mm", "test_method": "ASTM D5199",
     "values": ["0.50", "0.75", "1.00", "1.50", "2.00"]},
    {"name": "Density", "unit": "g/cm³", "test_method": "ASTM D1505",
     "values": ["≤ 0.939", "≤ 0.939", "≤ 0.939", "≤ 0.939", "≤ 0.939"]},
    {"name": "Tensile strength at break", "unit": "kN/m", "test_method": "ASTM D6693",
     "values": ["≥ 9", "≥ 13", "≥ 18", "≥ 27", "≥ 36"]},
    {"name": "Elongation at break", "unit": "%", "test_method": "ASTM D6693",
     "values": ["≥ 800", "≥ 800", "≥ 800", "≥ 800", "≥ 800"]},
    {"name": "Tear resistance", "unit": "N", "test_method": "ASTM D1004",
     "values": ["≥ 50", "≥ 70", "≥ 90", "≥ 140", "≥ 185"]},
    {"name": "Puncture resistance", "unit": "N", "test_method": "ASTM D4833",
     "values": ["≥ 120", "≥ 170", "≥ 220", "≥ 330", "≥ 440"]},
    {"name": "Carbon black content", "unit": "%", "test_method": "ASTM D4218",
     "values": ["2.0–3.0", "2.0–3.0", "2.0–3.0", "2.0–3.0", "2.0–3.0"]},
    {"name": "Roll size (W x L)", "unit": "m", "test_method": "",
     "values": ["7 x 300", "7 x 200", "7 x 150", "7 x 100", "7 x 75"]}
  ]
}
$grid$::jsonb);

-- Products: Geotextile ---------------------------------------------------

insert into public.products (slug, category_id, name, summary, overview, features, sort_order, published)
values (
  'woven-geotextile',
  (select id from public.categories where slug = 'geotextile'),
  'Woven Geotextile',
  'Woven polypropylene geotextile with high tensile strength for separation and reinforcement over soft ground.',
  $md$Woven geotextile is made by weaving polypropylene slit-film tapes into a strong, dimensionally stable fabric. It has high strength at low elongation, so it works as both a separator and a basal reinforcement layer under roads, hardstands and embankments on soft soil. The tight weave stops fine soil mixing into the aggregate above while still letting water through. Typical weights run from 100 to 300 g/m².$md$,
  array[
    'High tensile strength at low elongation',
    'Keeps subgrade and aggregate apart so the base keeps its thickness',
    'Stable under load and unaffected by soil chemistry',
    'UV stabilised for storage and the construction period',
    'Rolls 4 m wide for fewer overlaps'
  ],
  1, false
);

select pg_temp.seed_spec_table('woven-geotextile', $grid$
{
  "models": ["WG100", "WG150", "WG200", "WG250", "WG300"],
  "rows": [
    {"name": "Mass per unit area", "unit": "g/m²", "test_method": "ISO 9864",
     "values": ["100", "150", "200", "250", "300"]},
    {"name": "Tensile strength, MD / XMD", "unit": "kN/m", "test_method": "ISO 10319",
     "values": ["18 / 16", "28 / 26", "38 / 35", "48 / 44", "58 / 53"]},
    {"name": "CBR puncture strength", "unit": "N", "test_method": "ISO 12236",
     "values": ["1700", "2600", "3500", "4400", "5300"]},
    {"name": "Apparent opening size, O90", "unit": "mm", "test_method": "ISO 12956",
     "values": ["0.45", "0.40", "0.35", "0.30", "0.25"]},
    {"name": "Water permeability, normal to plane", "unit": "mm/s", "test_method": "ISO 11058",
     "values": ["30", "25", "20", "15", "10"]},
    {"name": "Roll size (W x L)", "unit": "m", "test_method": "",
     "values": ["4 x 100", "4 x 100", "4 x 75", "4 x 60", "4 x 50"]}
  ]
}
$grid$::jsonb);

insert into public.products (slug, category_id, name, summary, overview, features, sort_order, published)
values (
  'nonwoven-geotextile',
  (select id from public.categories where slug = 'geotextile'),
  'Nonwoven Geotextile',
  'Needle-punched nonwoven geotextile for filtration, drainage, separation and protection of geomembranes.',
  $md$Needle-punched nonwoven geotextile is a thick, felt-like fabric of polypropylene staple fibres bonded mechanically. It filters fine soil from flowing water, carries water in its own plane and cushions geomembranes against stones and uneven subgrade. It is a common choice behind retaining walls, around drains, under riprap and above or below landfill and pond liners. Weights from 150 to 500 g/m² cover light separation duty through to heavy protection.$md$,
  array[
    'Filters soil while letting water pass freely',
    'High permeability and some flow within the fabric plane',
    'Cushions geomembranes against puncture damage',
    'High elongation, so it follows uneven ground',
    'Rot-proof and resistant to soil chemicals',
    'Available from 150 to 500 g/m²'
  ],
  2, false
);

select pg_temp.seed_spec_table('nonwoven-geotextile', $grid$
{
  "models": ["NW150", "NW200", "NW300", "NW400", "NW500"],
  "rows": [
    {"name": "Mass per unit area", "unit": "g/m²", "test_method": "ISO 9864",
     "values": ["150", "200", "300", "400", "500"]},
    {"name": "Tensile strength, MD / XMD", "unit": "kN/m", "test_method": "ISO 10319",
     "values": ["6.5 / 6.0", "9.0 / 8.5", "13.5 / 13.0", "18.0 / 17.0", "23.0 / 22.0"]},
    {"name": "CBR puncture strength", "unit": "N", "test_method": "ISO 12236",
     "values": ["1100", "1500", "2300", "3200", "4000"]},
    {"name": "Apparent opening size, O90", "unit": "mm", "test_method": "ISO 12956",
     "values": ["0.13", "0.11", "0.09", "0.08", "0.07"]},
    {"name": "Water permeability, normal to plane", "unit": "mm/s", "test_method": "ISO 11058",
     "values": ["110", "95", "70", "55", "40"]},
    {"name": "Roll size (W x L)", "unit": "m", "test_method": "",
     "values": ["4 x 100", "4 x 75", "4 x 50", "4 x 40", "4 x 30"]}
  ]
}
$grid$::jsonb);

-- Products: Geocell ------------------------------------------------------

insert into public.products (slug, category_id, name, summary, overview, features, sort_order, published)
values (
  'hdpe-geocell',
  (select id from public.categories where slug = 'geocell'),
  'HDPE Geocell',
  'Welded honeycomb panels of HDPE strip that confine soil or aggregate for load support, slope protection and channel lining.',
  $md$HDPE geocell is a honeycomb of polyethylene strips welded at regular intervals. It folds flat for transport and expands on site into a three-dimensional cellular mattress. Once filled with sand, aggregate or soil, or with concrete for channel lining, the cells confine the fill and spread loads, which allows thinner bases over weak ground and holds topsoil on slopes. Cell depths of 50 to 200 mm cover most road, slope and channel work.$md$,
  array[
    'Expands on site into a three-dimensional cellular structure',
    'Confines infill to spread loads and reduce settlement',
    'Folds flat for compact transport and storage',
    'Welded joints with a tested peel strength',
    'Works with soil, aggregate or concrete infill',
    'Five cell depths from 50 to 200 mm'
  ],
  1, false
);

select pg_temp.seed_spec_table('hdpe-geocell', $grid$
{
  "models": ["GC50", "GC75", "GC100", "GC150", "GC200"],
  "rows": [
    {"name": "Cell depth", "unit": "mm", "test_method": "",
     "values": ["50", "75", "100", "150", "200"]},
    {"name": "Weld spacing", "unit": "mm", "test_method": "",
     "values": ["330", "330", "330", "330", "330"]},
    {"name": "Sheet thickness", "unit": "mm", "test_method": "ASTM D5199",
     "values": ["1.1", "1.1", "1.1", "1.5", "1.5"]},
    {"name": "Weld peel strength", "unit": "N", "test_method": "ISO 13426-1",
     "values": ["≥ 700", "≥ 1050", "≥ 1400", "≥ 2100", "≥ 2800"]},
    {"name": "Section size, expanded (W x L)", "unit": "m", "test_method": "",
     "values": ["2.5 x 5.6", "2.5 x 5.6", "2.5 x 5.6", "2.5 x 5.6", "2.5 x 5.6"]}
  ]
}
$grid$::jsonb);

-- Every seeded product carries the same reminder as its last line. The owner
-- deletes it when the values have been checked against the datasheet.
update public.products
set overview = overview || E'\n\n_Typical values. Confirm against the manufacturer''s datasheet before publishing._'
where slug in (
  'pp-biaxial-geogrid', 'polyester-uniaxial-geogrid', 'hdpe-geomembrane', 'lldpe-geomembrane',
  'woven-geotextile', 'nonwoven-geotextile', 'hdpe-geocell'
);

-- Applications -----------------------------------------------------------

insert into public.applications (slug, name, summary, body, sort_order, published) values
  ('roads-and-pavements', 'Roads and pavements',
   'Separation and reinforcement layers that let roads and hardstands carry traffic over soft or variable ground with less aggregate.',
   $md$Weak subgrades rut, and they pump fine soil up into the stone base so the road loses strength long before its design life. A geotextile between subgrade and aggregate keeps the layers apart, while a geogrid or geocell in the base confines the stone and spreads wheel loads over a wider area.

The result is a thinner or longer-lasting base for the same traffic. Typical uses include rural and urban roads, haul roads, container yards, industrial hardstands and working platforms for cranes and piling rigs.$md$,
   1, true),
  ('slopes-and-retaining-walls', 'Slopes and retaining walls',
   'Soil reinforcement that lets embankments, cuttings and walls stand steeper than the soil could on its own.',
   $md$Layers of high-strength geogrid laid between compacted fill hold the soil together and carry the lateral load that would otherwise push a wall or steep slope outward. Facing options range from wrap-around geotextile and vegetated faces to modular blocks and gabions.

This approach can replace tall concrete walls, reduce the land needed for embankments and speed up construction. Geocells and geotextiles add surface protection and drainage behind the face.$md$,
   2, true),
  ('landfills-and-containment', 'Landfills and containment',
   'Liner and cover systems that keep leachate, process liquids and gases out of the soil and groundwater.',
   $md$Landfill bases, caps and process ponds rely on a geomembrane as the main barrier, usually with a nonwoven geotextile above and below it to cushion the sheet against stones and sharp edges. Seams are welded on site and tested, so the barrier is continuous across the whole area.

The same systems are used for mining and heap leach pads, industrial effluent lagoons, secondary containment around storage tanks and sludge storage. The liner type and thickness depend on the chemistry, exposure and settlement expected.$md$,
   3, true),
  ('ponds-and-canals', 'Ponds and canals',
   'Lining systems that stop seepage from reservoirs, irrigation canals, farm ponds and aquaculture ponds.',
   $md$Unlined earth ponds and canals lose a large share of their water to seepage. A geomembrane liner, protected by a geotextile on rough or stony ground, seals the bed and sides so stored and conveyed water reaches the people who need it.

Geocells can be added on canal slopes to hold a concrete or soil cover in place, and flexible LLDPE sheet copes well with the irregular shapes common in farm ponds. Typical projects include irrigation canals, rainwater harvesting tanks, aquaculture ponds and storage reservoirs.$md$,
   4, true),
  ('erosion-control', 'Erosion control',
   'Surface protection for slopes, channels, shorelines and embankments exposed to rain, runoff and flowing water.',
   $md$Bare slopes and drainage channels wash away in heavy rain. Geocells filled with topsoil and seeded, or with stone or concrete in steeper and wetter spots, keep the fill in place until vegetation takes over. Geotextiles placed under rock armour or riprap filter the soil beneath so that water cannot carry it away.

These systems are used on road and rail embankments, river and canal banks, coastal edges, quarry faces and the batter slopes of reservoirs and ponds.$md$,
   5, true),
  ('railways', 'Railways',
   'Ballast and subgrade solutions that keep track geometry longer and cut maintenance.',
   $md$Under a railway track the ballast breaks down, and fine soil from the formation can pump up into it. A geogrid in or under the ballast locks the stones in place, while a geotextile separates ballast from the subgrade and filters water away from the track bed. Geocells can confine ballast or sub-ballast on soft formations.

The benefit is steadier track geometry, so tamping is needed less often and speed restrictions are less likely. They are used in new construction and in track renewal on mainlines, sidings, and metro and freight corridors.$md$,
   6, true);

-- Which products each application uses ------------------------------------

insert into public.product_applications (product_id, application_id)
select p.id, a.id
from (values
  ('roads-and-pavements',        'pp-biaxial-geogrid'),
  ('roads-and-pavements',        'polyester-uniaxial-geogrid'),
  ('roads-and-pavements',        'woven-geotextile'),
  ('roads-and-pavements',        'nonwoven-geotextile'),
  ('roads-and-pavements',        'hdpe-geocell'),
  ('slopes-and-retaining-walls', 'polyester-uniaxial-geogrid'),
  ('slopes-and-retaining-walls', 'pp-biaxial-geogrid'),
  ('slopes-and-retaining-walls', 'nonwoven-geotextile'),
  ('slopes-and-retaining-walls', 'hdpe-geocell'),
  ('landfills-and-containment',  'hdpe-geomembrane'),
  ('landfills-and-containment',  'lldpe-geomembrane'),
  ('landfills-and-containment',  'nonwoven-geotextile'),
  ('ponds-and-canals',           'hdpe-geomembrane'),
  ('ponds-and-canals',           'lldpe-geomembrane'),
  ('ponds-and-canals',           'nonwoven-geotextile'),
  ('ponds-and-canals',           'hdpe-geocell'),
  ('erosion-control',            'hdpe-geocell'),
  ('erosion-control',            'woven-geotextile'),
  ('erosion-control',            'nonwoven-geotextile'),
  ('railways',                   'pp-biaxial-geogrid'),
  ('railways',                   'woven-geotextile'),
  ('railways',                   'nonwoven-geotextile'),
  ('railways',                   'hdpe-geocell')
) as link(application_slug, product_slug)
join public.applications a on a.slug = link.application_slug
join public.products p on p.slug = link.product_slug;

-- Site settings ------------------------------------------------------------
-- The row (id = 1) already exists from the schema migration, so this only fills
-- it in, and only while it is still blank: it never overwrites the owner's text.
-- Office details stay as [bracketed] placeholders until the owner enters the real ones.

update public.site_settings
set
  tagline = 'Geosynthetic solutions for India and the UAE',
  hero_title = 'Reinforce, line and protect with geosynthetics',
  hero_text = 'TerraTechBharat supplies geogrids, geomembranes, geotextiles and geocells to contractors, consultants and project owners across India and the UAE. Compare specifications, then request a quote for your project.',
  about_md = $md$TerraTechBharat supplies geosynthetic products for civil, transport, water and environmental projects in India and the UAE. We help contractors, consultants and project owners choose materials that suit their ground conditions, design requirements and site schedule.

## What we supply

- **Geogrids** for soil and aggregate reinforcement
- **Geomembranes** for liners and covers
- **Geotextiles** for separation, filtration and protection
- **Geocells** for load support and for slope and channel protection

## How we work

Send us your drawings, bill of quantities or a short description of the project. We come back with product recommendations, technical datasheets and a quotation, and we stay in touch through delivery. With offices in India and the UAE, you can talk to someone in your own time zone.$md$,
  india_address = '[India address]',
  india_phone = '[India phone]',
  india_whatsapp = '[India WhatsApp]',
  india_email = '[India email]',
  uae_address = '[UAE address]',
  uae_phone = '[UAE phone]',
  uae_whatsapp = '[UAE WhatsApp]',
  uae_email = '[UAE email]'
where id = 1
  and tagline = ''
  and about_md = ''
  and india_address = ''
  and uae_address = '';
