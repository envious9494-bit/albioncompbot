-- =====================================================================
--  Nachtrag: Reste der ersten, handgeschriebenen Waffenliste aufraeumen
--
--  Die urspruengliche Liste in schema.sql hatte zwei Fehler drin:
--    "Astral Aegis"     ist ein Offhand, keine Waffe
--    "Black Monk Stave" heisst richtig "Black Monk Staff"
--  Beide werden entfernt - aber nur, wenn nichts mehr daran haengt.
--
--  "Battlemount" und "Scout" sind keine Albion-Items, sondern bewusst
--  angelegte Platzhalter fuer Comps. Die bleiben und bekommen hier nur
--  eine passende Familie, ein Symbol und einen Platz am Ende der Liste.
--
--  Einmalig ausfuehren, nachdem im Dashboard "Aus Albion-Daten
--  aktualisieren" gelaufen ist.
-- =====================================================================

delete from weapon w
where w.name in ('Astral Aegis', 'Black Monk Stave')
  and not exists (select 1 from comp_slot     where weapon_id = w.id)
  and not exists (select 1 from event_slot    where weapon_id = w.id)
  and not exists (select 1 from player_weapon where weapon_id = w.id);

update weapon set category = 'Sonstiges', icon = '🐎', sort_order = 9000
where name = 'Battlemount';

update weapon set category = 'Sonstiges', icon = '🔭', sort_order = 9010
where name = 'Scout';
