-- =====================================================================
--  Umbau auf mehrere Discord-Server
--
--  Bisher ging alles davon aus, dass es genau eine Gilde gibt. Ab jetzt
--  traegt jede Zeile, die zu einer Gilde gehoert, deren Server-ID.
--  Getrennt sind: Comps, Events, Anmeldungen, Spieler und Waffenprofile.
--  Geteilt bleibt nur die Waffenliste - Albion-Waffen sind ueberall
--  dieselben.
--
--  Wer ins Dashboard darf, steht nicht mehr in OFFICER_IDS, sondern in
--  guild_access. Zusaetzlich kommt rein, wer auf dem Discord-Server
--  "Server verwalten" darf - das wird beim Anmelden geprueft.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Die Server selbst
-- ---------------------------------------------------------------------
create table if not exists guild (
  id         text primary key,          -- Discord-Server-ID
  name       text,
  icon       text,
  joined_at  timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  Wer ins Dashboard darf
--  Zusaetzlich zu denen, die auf dem Server "Server verwalten" duerfen.
-- ---------------------------------------------------------------------
create table if not exists guild_access (
  guild_id     text not null references guild (id) on delete cascade,
  discord_id   text not null,
  display_name text,
  added_by     text,
  added_at     timestamptz not null default now(),
  primary key (guild_id, discord_id)
);

-- ---------------------------------------------------------------------
--  Bestehende Zeilen der Gilde zuordnen, aus der sie stammen
--  Falls schon Events da sind, wird deren Server genommen.
-- ---------------------------------------------------------------------
do $$
declare
  standard_guild text;
begin
  select guild_id into standard_guild from event order by id limit 1;

  -- Server nachtragen, damit die Fremdschluessel greifen
  insert into guild (id, name)
  select distinct guild_id, null from event
  on conflict (id) do nothing;

  -- --- player -------------------------------------------------------
  if not exists (select 1 from information_schema.columns
                 where table_name = 'player' and column_name = 'guild_id') then
    alter table player add column guild_id text;
    update player set guild_id = standard_guild where guild_id is null;
    delete from player where guild_id is null;   -- ohne Gilde nicht zuordenbar
    alter table player alter column guild_id set not null;

    alter table player_weapon drop constraint if exists player_weapon_discord_id_fkey;
    alter table player drop constraint if exists player_pkey;
    alter table player add primary key (guild_id, discord_id);
  end if;

  -- --- player_weapon ------------------------------------------------
  if not exists (select 1 from information_schema.columns
                 where table_name = 'player_weapon' and column_name = 'guild_id') then
    alter table player_weapon add column guild_id text;
    update player_weapon set guild_id = standard_guild where guild_id is null;
    delete from player_weapon where guild_id is null;
    alter table player_weapon alter column guild_id set not null;

    alter table player_weapon drop constraint if exists player_weapon_pkey;
    alter table player_weapon add primary key (guild_id, discord_id, weapon_id);
    alter table player_weapon
      add constraint player_weapon_player_fkey
      foreign key (guild_id, discord_id) references player (guild_id, discord_id) on delete cascade;
  end if;

  -- --- comp ---------------------------------------------------------
  if not exists (select 1 from information_schema.columns
                 where table_name = 'comp' and column_name = 'guild_id') then
    alter table comp add column guild_id text;
    update comp set guild_id = standard_guild where guild_id is null;
    delete from comp where guild_id is null;
    alter table comp alter column guild_id set not null;

    -- Comp-Namen muessen nur innerhalb einer Gilde eindeutig sein
    alter table comp drop constraint if exists comp_name_key;
    alter table comp add constraint comp_guild_name_key unique (guild_id, name);
  end if;
end $$;

-- Ohne Row Level Security waeren die neuen Tabellen ueber Supabases
-- oeffentliche REST-Schnittstelle erreichbar. Bot und Dashboard verbinden
-- sich als Rolle postgres und umgehen RLS ohnehin.
alter table guild        enable row level security;
alter table guild_access enable row level security;

create index if not exists player_guild_idx       on player (guild_id);
create index if not exists player_weapon_guild_idx on player_weapon (guild_id, discord_id);
create index if not exists comp_guild_idx          on comp (guild_id);
create index if not exists guild_access_user_idx   on guild_access (discord_id);
