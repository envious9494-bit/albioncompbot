-- =====================================================================
--  Nachtrag: Lebenszeichen des Bots
--
--  Der Bot traegt hier bei jedem Durchlauf ein, dass er laeuft und auf
--  welchen Servern er sitzt. Das Dashboard liest es unter /einrichtung,
--  damit man nach dem Einladen sofort sieht, ob es geklappt hat.
--
--  In einer Datenbank, die schon nach db/schema.sql angelegt wurde,
--  einmalig ausfuehren. Bei neuen Datenbanken steckt es schon in
--  schema.sql drin.
-- =====================================================================

create table if not exists bot_status (
  id         int primary key default 1,
  last_seen  timestamptz not null default now(),
  bot_tag    text,
  guild_ids  text[] not null default '{}',
  constraint bot_status_single_row check (id = 1)
);
