-- =====================================================================
--  Nachtrag: Item-Kennung und Symbol pro Waffe
--
--    item_id  Albion-Kennung wie "T4_2H_HOLYSTAFF". Daraus baut das
--             Dashboard den Bildpfad /items/<item_id>.png.
--    icon     Symbol der Waffenfamilie, wird im Discord-Embed benutzt.
--
--  Danach im Dashboard unter "Waffen" einmal auf
--  "Aus Albion-Daten aktualisieren" klicken - das traegt alle 137 Waffen
--  ein, ohne bestehende Spielerprofile anzufassen.
--
--  In einer Datenbank, die schon nach db/schema.sql angelegt wurde,
--  einmalig ausfuehren.
-- =====================================================================

alter table weapon add column if not exists item_id text;
alter table weapon add column if not exists icon text;

create index if not exists weapon_category_idx on weapon (category, sort_order);
