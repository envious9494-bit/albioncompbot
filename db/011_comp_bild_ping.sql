-- =====================================================================
--  Bild und Ping je Comp
--
--  image_url wird beim Timer als Bild ins Embed gehaengt.
--
--  ping steht bewusst NICHT im Embed: Erwaehnungen in einem Embed werden
--  zwar hervorgehoben, loesen aber keine Benachrichtigung aus. Wer @here
--  wirklich erreichen will, muss es in den Nachrichtentext schreiben.
--  Deshalb eine eigene Spalte statt "schreib es in die Notizen".
--
--  Beides wird beim Anlegen ins Event eingefroren, genau wie die Slots -
--  aendert jemand die Comp, bleibt ein laufender Timer, wie er war.
-- =====================================================================

alter table comp add column if not exists image_url text;
alter table comp add column if not exists ping text not null default 'none';

alter table comp drop constraint if exists comp_ping_check;
alter table comp add constraint comp_ping_check check (ping in ('none', 'here', 'everyone'));

alter table event add column if not exists image_url text;
alter table event add column if not exists ping text not null default 'none';
