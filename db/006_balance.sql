-- =====================================================================
--  Balance-Board
--
--  Pro Server abschaltbar. Ist es an, koennen benannte Personen Gold
--  vergeben und abziehen; alle sehen die Rangliste.
--
--  Jede Buchung landet zusaetzlich in balance_log. Der Kontostand ist
--  also jederzeit nachvollziehbar - wer, wem, wie viel, wann und warum.
--  Ohne das waere bei Streit nichts zu klaeren.
-- =====================================================================

-- Schalter pro Server
alter table guild add column if not exists balance_enabled boolean not null default false;

-- ---------------------------------------------------------------------
--  Kontostaende
--  amount ist bigint: Albion-Silber und -Gold werden schnell gross.
-- ---------------------------------------------------------------------
create table if not exists balance (
  guild_id     text   not null references guild (id) on delete cascade,
  discord_id   text   not null,
  display_name text,
  amount       bigint not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (guild_id, discord_id)
);

create index if not exists balance_rangliste_idx on balance (guild_id, amount desc);

-- ---------------------------------------------------------------------
--  Buchungshistorie
-- ---------------------------------------------------------------------
create table if not exists balance_log (
  id           bigserial primary key,
  guild_id     text   not null references guild (id) on delete cascade,
  discord_id   text   not null,
  delta        bigint not null,
  saldo_danach bigint not null,
  reason       text,
  created_by   text   not null,
  created_at   timestamptz not null default now()
);

create index if not exists balance_log_guild_idx on balance_log (guild_id, created_at desc);
create index if not exists balance_log_person_idx on balance_log (guild_id, discord_id, created_at desc);

-- ---------------------------------------------------------------------
--  Wer Gold vergeben und abziehen darf
--  Unabhaengig vom Dashboard-Zugang: ein Caller kann Gold verteilen
--  duerfen, ohne Comps aendern zu koennen - und umgekehrt.
-- ---------------------------------------------------------------------
create table if not exists balance_manager (
  guild_id     text not null references guild (id) on delete cascade,
  discord_id   text not null,
  display_name text,
  added_by     text,
  added_at     timestamptz not null default now(),
  primary key (guild_id, discord_id)
);

alter table balance         enable row level security;
alter table balance_log     enable row level security;
alter table balance_manager enable row level security;
