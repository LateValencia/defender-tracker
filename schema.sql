-- ============================================================
-- DEFENDER TRACKER — Schema Supabase
-- Coller intégralement dans : Supabase > SQL Editor > New Query
-- ============================================================

create table if not exists vehicle (
  id text primary key default 'default',
  name text default 'Mon Defender',
  model text default '110',
  year integer default 2020,
  km integer default 0,
  plate text default '',
  updated_at timestamptz default now()
);

-- Ligne par défaut (app mono-utilisateur)
insert into vehicle (id) values ('default') on conflict (id) do nothing;

create table if not exists maintenance (
  id text primary key,
  date date,
  type text,
  km integer,
  cost numeric(10,2),
  next_km integer,
  next_date date,
  garage text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists trips (
  id text primary key,
  date date,
  origin text,
  destination text,
  km numeric(8,1),
  end_km integer,
  purpose text,
  created_at timestamptz default now()
);

create table if not exists fuel (
  id text primary key,
  date date,
  km integer,
  liters numeric(6,2),
  price_per_liter numeric(6,3),
  total_price numeric(8,2),
  full_tank boolean default true,
  station text,
  created_at timestamptz default now()
);

create table if not exists expenses (
  id text primary key,
  date date,
  category text,
  description text,
  amount numeric(10,2),
  created_at timestamptz default now()
);

-- App personnelle sans auth → RLS désactivé
alter table vehicle disable row level security;
alter table maintenance disable row level security;
alter table trips disable row level security;
alter table fuel disable row level security;
alter table expenses disable row level security;
