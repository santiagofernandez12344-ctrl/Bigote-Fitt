-- Bigote Fitt · setup de base de datos
-- Pegar todo esto en Supabase → SQL Editor → Run

create table if not exists bigote_programa (
  id int primary key default 1,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists bigote_users (
  name text primary key,
  created_at timestamptz default now()
);

create table if not exists bigote_rms (
  user_name text primary key references bigote_users(name) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists bigote_lifts (
  id int primary key default 1,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);

alter table bigote_programa enable row level security;
alter table bigote_users   enable row level security;
alter table bigote_rms     enable row level security;
alter table bigote_lifts   enable row level security;

-- Grupo de amigos de confianza: lectura y escritura pública vía anon key.
-- (No hay datos sensibles acá, solo pesos de entrenamiento.)
create policy "public read programa"  on bigote_programa for select using (true);
create policy "public write programa" on bigote_programa for all    using (true) with check (true);

create policy "public read users"  on bigote_users for select using (true);
create policy "public write users" on bigote_users for all    using (true) with check (true);

create policy "public read rms"  on bigote_rms for select using (true);
create policy "public write rms" on bigote_rms for all    using (true) with check (true);

create policy "public read lifts"  on bigote_lifts for select using (true);
create policy "public write lifts" on bigote_lifts for all    using (true) with check (true);
