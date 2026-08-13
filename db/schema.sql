-- =====================================================================
--  Albion Comp Bot - Datenbankschema
--  Einmalig im Supabase SQL Editor ausfuehren.
--  Kann gefahrlos erneut ausgefuehrt werden (alles "if not exists").
-- =====================================================================

-- ---------------------------------------------------------------------
--  Waffen
--  Die kanonische Waffenliste. Wird im Dashboard unter /waffen gepflegt.
--  "aliases" sind Schreibweisen, nach denen die Suche zusaetzlich greift
--  (z.B. "GH" -> "Great Holy Staff").
-- ---------------------------------------------------------------------
create table if not exists weapon (
  id          serial primary key,
  name        text not null unique,
  category    text not null default 'Sonstiges',  -- Waffenfamilie, z.B. "Heiligenstäbe"
  item_id     text,                               -- Albion-Kennung, z.B. "T4_2H_HOLYSTAFF"
  icon        text,                               -- Symbol der Familie fuers Discord-Embed
  aliases     text[] not null default '{}',
  active      boolean not null default true,
  sort_order  int not null default 100
);

create index if not exists weapon_active_idx on weapon (active);
create index if not exists weapon_category_idx on weapon (category, sort_order);

-- ---------------------------------------------------------------------
--  Spieler + ihre Waffenskills
-- ---------------------------------------------------------------------
create table if not exists player (
  discord_id    text primary key,
  display_name  text not null,
  ingame_name   text,
  updated_at    timestamptz not null default now()
);

create table if not exists player_weapon (
  discord_id  text not null references player (discord_id) on delete cascade,
  weapon_id   int  not null references weapon (id) on delete cascade,
  rating      int  not null check (rating between 1 and 10),
  primary key (discord_id, weapon_id)
);

create index if not exists player_weapon_weapon_idx on player_weapon (weapon_id);

-- ---------------------------------------------------------------------
--  Comps (Vorlagen)
--  Ein comp_slot ist "N mal diese Waffe mit dieser Prioritaet".
--  priority: 1 = wichtigster Slot ... 5 = verzichtbar.
--  Die Prioritaet steuert zweierlei:
--    a) bei zu wenig Anmeldungen bleiben unwichtige Slots zuerst leer
--    b) ein Skillpunkt auf einem Prio-1-Slot wiegt schwerer als auf Prio 5
-- ---------------------------------------------------------------------
create table if not exists comp (
  id          serial primary key,
  name        text not null unique,
  notes       text,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists comp_slot (
  id         serial primary key,
  comp_id    int  not null references comp (id) on delete cascade,
  weapon_id  int  not null references weapon (id) on delete restrict,
  count      int  not null default 1 check (count between 1 and 40),
  priority   int  not null default 3 check (priority between 1 and 5),
  label      text,
  sort_order int  not null default 100
);

create index if not exists comp_slot_comp_idx on comp_slot (comp_id);

-- ---------------------------------------------------------------------
--  Events (ein konkreter Timer im Discord)
--  status: open = Anmeldung laeuft | locked = Comp steht | cancelled
-- ---------------------------------------------------------------------
create table if not exists event (
  id            serial primary key,
  comp_id       int  references comp (id) on delete set null,
  comp_name     text not null,
  title         text,
  guild_id      text not null,
  channel_id    text not null,
  message_id    text,
  starts_at     timestamptz not null,
  lock_minutes  int  not null default 10,
  status        text not null default 'open',
  created_by    text not null,
  created_at    timestamptz not null default now(),
  render_hash   text,
  locked_at     timestamptz
);

create index if not exists event_status_idx on event (status, starts_at);

-- ---------------------------------------------------------------------
--  Event-Slots
--  Beim Erstellen des Events wird die Comp hier eingefroren. Aendert der
--  Leader die Vorlage spaeter, bleibt ein laufendes Event unberuehrt.
--    locked_discord_id  = vom Leader im Dashboard festgenagelt
--    assigned_discord_id = Ergebnis der automatischen Zuordnung
-- ---------------------------------------------------------------------
create table if not exists event_slot (
  event_id            int  not null references event (id) on delete cascade,
  slot_index          int  not null,
  weapon_id           int  not null references weapon (id) on delete restrict,
  priority            int  not null default 3,
  label               text,
  locked_discord_id   text,
  assigned_discord_id text,
  assigned_rating     int,
  primary key (event_id, slot_index)
);

-- ---------------------------------------------------------------------
--  Anmeldungen
--  status: yes = dabei | maybe = vielleicht | out = abgemeldet
--  "maybe" wird nicht zugeordnet, aber im Embed separat aufgefuehrt.
-- ---------------------------------------------------------------------
create table if not exists signup (
  event_id     int  not null references event (id) on delete cascade,
  discord_id   text not null,
  display_name text not null,
  status       text not null default 'yes',
  created_at   timestamptz not null default now(),
  primary key (event_id, discord_id)
);

-- ---------------------------------------------------------------------
--  Lebenszeichen des Bots
--  Wird bei jedem Poll-Durchlauf aktualisiert. Das Dashboard zeigt unter
--  /einrichtung daraus, ob der Bot laeuft und auf welchen Servern er ist.
-- ---------------------------------------------------------------------
create table if not exists bot_status (
  id         int primary key default 1,
  last_seen  timestamptz not null default now(),
  bot_tag    text,
  guild_ids  text[] not null default '{}',
  constraint bot_status_single_row check (id = 1)
);

-- =====================================================================
--  Waffenliste
--
--  Die wird nicht hier eingetragen, sondern im Dashboard unter "Waffen" mit
--  einem Klick auf "Aus Albion-Daten aktualisieren". Das traegt alle 137
--  Spielerwaffen samt Familie, Symbol und Item-Kennung ein und laesst
--  bestehende Spielerprofile unberuehrt. Nach einem Albion-Patch einfach
--  noch einmal draufklicken.
-- =====================================================================
