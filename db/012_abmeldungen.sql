-- =====================================================================
--  Abmeldungen aufheben statt loeschen
--
--  Bisher hat "Abmelden" die Zeile geloescht. Fuer die Aufstellung war
--  das richtig - fuer den Leader nicht: er sah nicht, ob sich jemand nie
--  gemeldet oder erst zugesagt und dann abgesagt hat. Das ist ein
--  Unterschied, wenn man kurz vor Start zehn Leute sucht.
--
--  Jetzt bleibt die Zeile mit status = 'out' stehen. Fuer die Aufstellung
--  aendert sich nichts: die filtert ohnehin auf 'yes'.
--
--  updated_at haelt fest, WANN - eine Absage zwei Minuten vor Start ist
--  etwas anderes als eine von gestern.
-- =====================================================================

alter table signup add column if not exists updated_at timestamptz not null default now();
