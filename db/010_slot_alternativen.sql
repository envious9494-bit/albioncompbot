-- =====================================================================
--  Mehrere zugelassene Waffen je Platz
--
--  Manche Rollen sind austauschbar: eine Axt oder ein Realmbreaker tun
--  dasselbe. Bisher musste man sich fuer eine entscheiden - wer nur die
--  andere spielt, landete auf der Bank, obwohl der Platz zu ihm passt.
--
--  weapon_id bleibt die erste Wahl und traegt die Anzeige. alt_weapon_ids
--  sind gleichwertige Alternativen: besetzt wird der Platz genau einmal,
--  und zwar auf der Waffe, die die Person am besten kann.
--
--  assigned_weapon_id haelt fest, welche das war. Ohne die Spalte liesse
--  sich nach dem Einfrieren nicht mehr sagen, womit jemand antritt - und
--  genau das steht im Ping.
-- =====================================================================

alter table comp_slot
  add column if not exists alt_weapon_ids int[] not null default '{}';

alter table event_slot
  add column if not exists alt_weapon_ids int[] not null default '{}';

alter table event_slot
  add column if not exists assigned_weapon_id int references weapon (id) on delete set null;
