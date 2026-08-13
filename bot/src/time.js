// =====================================================================
//  Zeitparsing in der Gildenzeitzone (Standard: Europe/Berlin)
//
//  Der Leader tippt "20:30" und meint 20:30 seiner Zeit - nicht UTC und
//  nicht die Zeitzone des Servers, auf dem der Bot laeuft. Im Discord
//  bekommt danach jeder Member die Zeit in seiner eigenen Zone angezeigt,
//  weil Discord-Timestamps clientseitig umgerechnet werden.
// =====================================================================

export const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin';

/** Offset der Zone zu UTC in Millisekunden, zum gegebenen Zeitpunkt. */
function zoneOffset(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** Wandelt eine Wanduhrzeit in der Zone in einen echten Zeitpunkt um (sommerzeitfest). */
function zonedToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = zoneOffset(new Date(guess), timeZone);
  let ts = guess - first;
  const second = zoneOffset(new Date(ts), timeZone);
  if (second !== first) ts = guess - second;
  return new Date(ts);
}

/** Heutiges Datum in der Zone. */
function todayInZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = parts.split('-').map(Number);
  return { year, month, day };
}

/** Die Formate, die wir verstehen - einmal aufgeschrieben, damit Hilfe und
 *  Fehlermeldung nicht auseinanderlaufen. */
export const ZEIT_BEISPIELE = '`20:30` · `2030` · `20` · `+45` · `90m` · `2h` · `14.08 20:30`';

/**
 * Zerlegt eine Uhrzeit: "20:30", "20.30", "2030" oder "20".
 * Bewusst eine Alternation statt optionaler Trenner - sonst laesst sich "203"
 * als 2:03 lesen, und stillschweigend die falsche Stunde zu nehmen ist
 * schlimmer, als die Eingabe abzulehnen.
 *
 * @returns {{stunde: number, minute: number} | null} null, wenn es keine Uhrzeit ist
 * @throws {Error} wenn es eine sein soll, aber ausserhalb von 23:59 liegt
 */
function parseUhrzeit(text, original) {
  const treffer =
    text.match(/^(\d{1,2})[:.](\d{2})$/) || // 20:30, 20.30
    text.match(/^(\d{1,2})(\d{2})$/) || // 2030
    text.match(/^(\d{1,2})$/); // 20
  if (!treffer) return null;

  const stunde = Number(treffer[1]);
  const minute = treffer[2] ? Number(treffer[2]) : 0;
  if (stunde > 23 || minute > 59) {
    throw new Error(`\`${original}\` ist keine gueltige Uhrzeit.`);
  }
  return { stunde, minute };
}

/** Uhrzeit -> Zeitpunkt. Heute, und wenn das schon vorbei ist, morgen. */
function heuteOderMorgen(stunde, minute, timeZone) {
  const heute = todayInZone(timeZone);
  const datum = zonedToUtc(heute.year, heute.month, heute.day, stunde, minute, timeZone);
  if (datum.getTime() > Date.now()) return datum;
  // Ueber zonedToUtc statt +24h: an Zeitumstellungstagen hat ein Tag 23 oder
  // 25 Stunden, und 20:30 soll 20:30 bleiben.
  return zonedToUtc(heute.year, heute.month, heute.day + 1, stunde, minute, timeZone);
}

/**
 * Erlaubte Eingaben:
 *   "20:30" / "20.30"    -> heute 20:30, falls schon vorbei: morgen
 *   "2030"               -> dasselbe, ohne Doppelpunkt
 *   "20"                 -> heute 20:00, falls schon vorbei: morgen
 *   "+45" / "45m"        -> in 45 Minuten
 *   "2h" / "1h30"        -> in 2 Stunden bzw. 1,5 Stunden
 *   "14.08 20:30"        -> naechstes Vorkommen dieses Datums
 *   "14.08.2026 20:30"   -> genau dieses Datum
 *
 * @returns {Date}
 * @throws {Error} bei unbrauchbarer Eingabe - die Meldung geht direkt an den Nutzer
 */
export function parseStartTime(input, timeZone = TIMEZONE) {
  const raw = String(input).trim().replace(/\s+/g, ' ').toLowerCase();

  // --- relativ: "+45", "45m", "2h", "+2h", "1h30" ---------------------
  // Das "+" ist ueberall erlaubt, nicht nur bei der blossen Zahl: wer "+45"
  // und "2h" als Beispiele nebeneinander sieht, tippt irgendwann "+2h".
  // Ohne "+" bleibt eine blosse Zahl aber die Uhrzeit - "20" ist 20:00,
  // "+20" sind zwanzig Minuten.
  const relativMinuten = raw.match(/^\+(\d{1,4})$/) || raw.match(/^\+?(\d{1,4})\s*m(?:in)?$/);
  if (relativMinuten) {
    return new Date(Date.now() + Number(relativMinuten[1]) * 60_000);
  }

  const relativStunden = raw.match(/^\+?(\d{1,2})(?:[.,](\d{1,2}))?\s*h(?:\s*(\d{1,2}))?$/);
  if (relativStunden) {
    const [, h, bruch, min] = relativStunden;
    // "1.5h" und "1h30" meinen dasselbe, duerfen sich aber nicht addieren.
    const zusatz = min ? Number(min) : bruch ? Number(`0.${bruch}`) * 60 : 0;
    const minuten = Number(h) * 60 + Math.round(zusatz);
    if (minuten <= 0) throw new Error(`"${input}" ist keine Dauer in der Zukunft.`);
    return new Date(Date.now() + minuten * 60_000);
  }

  // --- mit Datum: "14.08 20:30", "14.08.2026 2030", "14.08 20" --------
  const mitDatum = raw.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?\s+(\S+)$/);
  if (mitDatum) {
    const [, d, m, y, zeitteil] = mitDatum;
    const uhr = parseUhrzeit(zeitteil, input);
    if (!uhr) throw new Error(`Mit \`${zeitteil}\` als Uhrzeit kann ich nichts anfangen.`);

    const jahr = y ? Number(y) : todayInZone(timeZone).year;
    const datum = zonedToUtc(jahr, Number(m), Number(d), uhr.stunde, uhr.minute, timeZone);
    if (Number.isNaN(datum.getTime())) throw new Error(`\`${input}\` ergibt kein gueltiges Datum.`);
    // Ohne Jahresangabe und schon vorbei -> naechstes Jahr gemeint
    if (!y && datum.getTime() < Date.now()) {
      return zonedToUtc(jahr + 1, Number(m), Number(d), uhr.stunde, uhr.minute, timeZone);
    }
    return datum;
  }

  // --- reine Uhrzeit: "20:30", "2030", "20" ---------------------------
  // Eine blosse Zahl ueber 23 ist keine Stunde. Fast immer sind Minuten
  // gemeint, also den passenden Vorschlag mitgeben statt nur zu meckern.
  if (/^\d{1,2}$/.test(raw) && Number(raw) > 23) {
    throw new Error(`\`${input}\` ist keine Stunde. Meintest du \`${input}m\` (in ${input} Minuten)?`);
  }

  const uhr = parseUhrzeit(raw, input);
  if (uhr) return heuteOderMorgen(uhr.stunde, uhr.minute, timeZone);

  throw new Error(`Mit \`${input}\` kann ich nichts anfangen. Moeglich sind: ${ZEIT_BEISPIELE}`);
}

/** Discord-Timestamp - jeder Member sieht seine lokale Zeit. */
export function discordTime(date, style = 'f') {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
