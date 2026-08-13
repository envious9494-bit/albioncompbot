-- =====================================================================
--  Echte Item-Bilder statt Kategorie-Emojis
--
--  Bisher trug jede Waffe das Emoji ihrer Kategorie - alle Schwerter ein
--  ⚔️. Damit sehen Broadsword, Claymore und Clarent Blade gleich aus,
--  und genau das ist die Zeile, die man in einer Aufstellung lesen will.
--
--  Discord-Apps duerfen bis zu 2000 eigene Emojis besitzen und ueberall
--  benutzen, wo sie schreiben - ohne dass die auf einem Server liegen.
--  Hier steht die fertige Auszeichnung, also "<:T4_MAIN_SWORD:123…>".
--
--  icon bleibt als Rueckfall stehen: fuer die zwei Waffen ohne Item-ID,
--  und falls die Emojis mal geloescht werden.
-- =====================================================================

alter table weapon add column if not exists emoji text;
