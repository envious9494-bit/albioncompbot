-- =====================================================================
--  Nachtrag: Wer die Buchung gemacht hat, mit Namen
--
--  Bisher stand in balance_log nur die Discord-ID des Urhebers. Den Namen
--  dazu ueber einen Verbund zu holen geht schief, sobald jemand selbst
--  kein Konto hat - und liefert bei Umbenennungen den heutigen statt des
--  damaligen Namens. In einem Protokoll gehoert der Stand von damals.
-- =====================================================================

alter table balance_log add column if not exists created_by_name text;
