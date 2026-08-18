import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const jsonPath = resolve(projectRoot, "public", "yupdduk-all-stores.json");
const outputPath = resolve(
  projectRoot,
  "supabase",
  "migrations",
  "20260818000000_import_capital_stores.sql",
);
const capitalRegions = new Set(["서울특별시", "경기도", "인천광역시"]);

const source = JSON.parse(readFileSync(jsonPath, "utf8"));
const stores = source.stores
  .filter((store) => capitalRegions.has(store.sido))
  .filter((store) => {
    const latitude = Number(store.lat);
    const longitude = Number(store.lng);

    return (
      store.lat !== "" &&
      store.lng !== "" &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  });

if (stores.length !== 412) {
  throw new Error(`Expected 412 valid capital stores, received ${stores.length}.`);
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const rows = stores
  .map(
    (store) =>
      `  (${[
        sqlText(store.sido),
        sqlText(store.gugun),
        sqlText(store.name),
        sqlText(store.address),
        Number(store.lat),
        Number(store.lng),
        sqlText(store.tel),
      ].join(", ")})`,
  )
  .join(",\n");

const migration = `-- Generated from public/yupdduk-all-stores.json (${source.fetched_at}).
-- This transaction deliberately does not use CASCADE. If reviews reference the
-- three test stores, DELETE will fail and the whole migration will roll back.

begin;

alter table public.stores
  add column if not exists sido text,
  add column if not exists gugun text;

delete from public.stores;

insert into public.stores (
  sido,
  gugun,
  name,
  address,
  latitude,
  longitude,
  phone
)
values
${rows};

alter table public.stores
  alter column sido set not null,
  alter column gugun set not null,
  alter column name set not null,
  alter column address set not null,
  alter column latitude set not null,
  alter column longitude set not null,
  alter column phone set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stores_name_address_key'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_name_address_key unique (name, address);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stores_valid_coordinates_check'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_valid_coordinates_check check (
        latitude between -90 and 90
        and longitude between -180 and 180
      );
  end if;
end
$$;

do $$
begin
  if (select count(*) from public.stores) <> 412 then
    raise exception 'Store import validation failed: expected 412 rows.';
  end if;

  if (select count(distinct id) from public.stores) <> 412 then
    raise exception 'Store import validation failed: store ids are not unique.';
  end if;

  if exists (
    select 1 from public.stores
    where name is null or btrim(name) = ''
       or address is null or btrim(address) = ''
       or latitude is null or longitude is null
  ) then
    raise exception 'Store import validation failed: required data is missing.';
  end if;

  if exists (
    select 1 from public.stores
    group by name, address
    having count(*) > 1
  ) then
    raise exception 'Store import validation failed: duplicate stores exist.';
  end if;
end
$$;

commit;
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, migration, "utf8");
console.log(`Generated ${outputPath} with ${stores.length} stores.`);
