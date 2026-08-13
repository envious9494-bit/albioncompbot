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

/**
 * Erlaubte Eingaben:
 *   "20:30"              -> heute 20:30, falls schon vorbei: morgen
 *   "14.08 20:30"        -> naechstes Vorkommen dieses Datums
 *   "14.08.2026 20:30"   -> genau dieses Datum
 *   "+45"                -> in 45 Minuten (praktisch zum Testen)
 *
 * @returns {Date}
 * @throws {Error} bei unbrauchbarer Eingabe - die Meldung geht direkt an den Nutzer
 */
export function parseStartTime(input, timeZone = TIMEZONE) {
  const raw = String(input).trim().replace(/\s+/g, ' ');

  const relative = raw.match(/^\+(\d{1,4})$/);
  if (relative) {
    return new Date(Date.now() + Number(relative[1]) * 60_000);
  }

  const withDate = raw.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?\s+(\d{1,2})[:.](\d{2})$/);
  if (withDate) {
    const [, d, m, y, h, min] = withDate;
    const now = todayInZone(timeZone);
    const year = y ? Number(y) : now.year;
    const date = zonedToUtc(year, Number(m), Number(d), Number(h), Number(min), timeZone);
    if (Number.isNaN(date.getTime())) throw new Error(`"${input}" ergibt kein gueltiges Datum.`);
    // Ohne Jahresangabe und schon vorbei -> naechstes Jahr gemeint
    if (!y && date.getTime() < Date.now()) {
      return zonedToUtc(year + 1, Number(m), Number(d), Number(h), Number(min), timeZone);
    }
    return date;
  }

  const timeOnly = raw.match(/^(\d{1,2})[:.](\d{2})$/);
  if (timeOnly) {
    const [, h, min] = timeOnly;
    if (Number(h) > 23 || Number(min) > 59) throw new Error(`"${input}" ist keine gueltige Uhrzeit.`);
    const today = todayInZone(timeZone);
    const date = zonedToUtc(today.year, today.month, today.day, Number(h), Number(min), timeZone);
    if (date.getTime() > Date.now()) return date;
    // Uhrzeit heute schon vorbei -> morgen gemeint
    return new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }

  throw new Error(
    `Mit "${input}" kann ich nichts anfangen. Moeglich sind: \`20:30\`, \`14.08 20:30\`, \`14.08.2026 20:30\` oder \`+45\` (in 45 Minuten).`,
  );
}

/** Discord-Timestamp - jeder Member sieht seine lokale Zeit. */
export function discordTime(date, style = 'f') {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
