// =====================================================================
//  Bot-Dateien zu bot-hosting.net schieben und neu starten
//
//  Der Hoster klont das Repo nur einmal beim Anlegen - im Container liegt
//  danach kein Git mehr, ein "git pull" gibt es dort also nicht. Sein
//  GitHub-Sync-Knopf im Dateibrowser muesste jedes Mal von Hand gedrueckt
//  werden. Darum den Weg ueber die API: sie kann Textdateien schreiben und
//  neu starten, und beides laesst sich von GitHub Actions aus ausloesen.
//
//  Geschickt wird nur, was git kennt - so landet nichts Lokales und vor
//  allem keine .env versehentlich auf dem Server. Die Zugangsdaten stehen
//  dort in den Umgebungsvariablen des Hosters und werden hier nie beruehrt.
//
//  Erwartet zwei Umgebungsvariablen:
//    BOTHOST_API_KEY     - Schluessel aus bot-hosting.net/developer
//    BOTHOST_DEPLOYMENT  - die ID aus der Adresszeile des Deployments
// =====================================================================

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const SCHLUESSEL = process.env.BOTHOST_API_KEY;
const DEPLOYMENT = process.env.BOTHOST_DEPLOYMENT;
// Ueberschreibbar, damit sich der Ablauf gegen einen Attrappen-Server
// durchspielen laesst, ohne am echten Deployment herumzuschreiben.
const BASIS = process.env.BOTHOST_API_BASE || 'https://bot-hosting.net/api/v1';

/** So lange warten wir nach dem Neustart auf die Bereitmeldung. */
const START_TIMEOUT_MS = 90_000;
const BEREIT = 'Eingeloggt als';

if (!SCHLUESSEL || !DEPLOYMENT) {
  console.error(
    'BOTHOST_API_KEY oder BOTHOST_DEPLOYMENT fehlt.\n' +
      'Beide gehoeren in die Repository-Secrets unter Settings -> Secrets and variables -> Actions.',
  );
  process.exit(1);
}

/**
 * Ein API-Aufruf. Bei 429 einmal warten und wiederholen - das Limit liegt
 * bei 120 Aufrufen je Minute, wir brauchen gut ein Dutzend, aber zwei
 * Auslieferungen kurz hintereinander koennen sich beruehren.
 */
async function api(pfad, init = {}) {
  for (let versuch = 0; versuch < 2; versuch += 1) {
    const antwort = await fetch(BASIS + pfad, {
      ...init,
      headers: {
        Authorization: `Bearer ${SCHLUESSEL}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (antwort.status === 429 && versuch === 0) {
      const warten = Number(antwort.headers.get('Retry-After') || 5);
      console.log(`  Limit erreicht, ${warten}s warten`);
      await new Promise((fertig) => setTimeout(fertig, warten * 1000));
      continue;
    }

    if (!antwort.ok) {
      throw new Error(`${init.method ?? 'GET'} ${pfad} -> ${antwort.status} ${await antwort.text()}`);
    }

    return antwort.json();
  }
  throw new Error(`${pfad}: auch nach dem zweiten Versuch abgewiesen`);
}

// ---------------------------------------------------------------------
//  Dateien
// ---------------------------------------------------------------------

// Nur der Bot und die Manifeste der Wurzel. Das Dashboard laeuft auf
// Vercel und hat auf dem Bot-Host nichts verloren, db/ sind Migrationen
// fuer Supabase - beides wuerde nur Platz kosten.
const dateien = execFileSync('git', ['ls-files', 'bot', 'package.json', 'package-lock.json'], {
  encoding: 'utf8',
})
  .split('\n')
  .map((zeile) => zeile.trim())
  .filter(Boolean);

if (dateien.length === 0) {
  console.error('git ls-files liefert nichts - laeuft das hier ueberhaupt im Repo?');
  process.exit(1);
}

console.log(`${dateien.length} Dateien nach ${DEPLOYMENT}:`);

for (const datei of dateien) {
  const inhalt = await readFile(datei, 'utf8');
  await api(`/deployments/${DEPLOYMENT}/files/content`, {
    method: 'POST',
    body: JSON.stringify({ path: `/${datei}`, content: inhalt }),
  });
  console.log(`  ${datei}`);
}

// Geloeschte Dateien bleiben als Leichen auf dem Server liegen; dieses
// Skript schreibt nur. Solange nichts sie importiert, stoert das nicht -
// wer aufraeumen will, loescht sie im Dateibrowser des Hosters.

// ---------------------------------------------------------------------
//  Neustart und Nachschauen, ob er hochkommt
// ---------------------------------------------------------------------

console.log('Neustart...');
await api(`/deployments/${DEPLOYMENT}/power`, {
  method: 'POST',
  body: JSON.stringify({ action: 'restart' }),
});

// Ohne diese Kontrolle waere jede Auslieferung gruen, auch wenn der Bot
// beim Start sofort wieder stirbt. Die Konsole verraet den Unterschied.
const frist = Date.now() + START_TIMEOUT_MS;
let letzte = '';

while (Date.now() < frist) {
  await new Promise((fertig) => setTimeout(fertig, 5000));

  // size sind ZEILEN und hoechstens 500 - auch wenn das Beispiel in der Doku
  // "size=1048576" zeigt, als waeren es Bytes. Darueber antwortet sie mit 400.
  const { lines = [] } = await api(`/deployments/${DEPLOYMENT}/logs?size=200`);
  letzte = lines.slice(-25).join('\n');

  if (lines.some((zeile) => zeile.includes(BEREIT))) {
    console.log('Bot ist oben.');
    console.log(letzte);
    process.exit(0);
  }
}

console.error(`Nach ${START_TIMEOUT_MS / 1000}s keine Bereitmeldung. Letzte Konsolenzeilen:`);
console.error(letzte || '(Konsole leer)');
process.exit(1);
