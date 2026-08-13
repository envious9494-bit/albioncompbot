-- =====================================================================
--  Standard-Sperrfrist je Server
--
--  Bisher stand die 10 als Vorgabe im Bot. Wer immer mit 15 Minuten
--  faehrt, musste sie bei jedem /timer mittippen. Jetzt haelt der Server
--  seinen eigenen Standard; das Feld lock bei /timer schlaegt ihn weiter.
--
--  Die laufenden Events bleiben unberuehrt: die haben ihre lock_minutes
--  beim Anlegen eingefroren, genau wie ihre Slots.
-- =====================================================================

alter table guild
  add column if not exists default_lock_minutes int not null default 10;

alter table guild
  drop constraint if exists guild_default_lock_minutes_check;

alter table guild
  add constraint guild_default_lock_minutes_check
  check (default_lock_minutes between 0 and 180);
