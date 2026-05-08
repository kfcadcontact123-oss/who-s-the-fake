create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  status text default 'lobby',
  created_at timestamptz default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  created_at timestamptz default now()
);