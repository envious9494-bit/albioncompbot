// =====================================================================
//  Item-Bilder als App-Emojis hochladen
//
//  Holt zu jeder Waffe mit Item-ID das offizielle Render von Albion,
//  laedt es als Emoji der Discord-App hoch und schreibt die fertige
//  Auszeichnung in weapon.emoji.
//
//  Mehrfach ausfuehrbar: was die App schon hat, wird wiederverwendet
//  statt neu hochgeladen. Nach einem Waffen-Nachtrag also einfach noch
//  einmal laufen lassen.
//
//    node scripts/sync-emojis.mjs          # fehlende ergaenzen
//    node scripts/sync-emojis.mjs --alle   # auch vorhandene neu laden
//    node scripts/sync-emojis.mjs --weg    # alle wieder loeschen
//
//  Grenzen von Discord: 2000 Emojis je App, 256 KB je Bild, und der Name
//  darf nur Buchstaben, Ziffern und Unterstriche haben (2-32 Zeichen).
// =====================================================================

import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

import { sql } from '../src/db.js';

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('DISCORD_TOKEN fehlt in der .env.');
  process.exit(1);
}

const ALLE = process.argv.includes('--alle');
const WEG = process.argv.includes('--weg');

/** Groesse des Renders. 128 ist Discords Emoji-Aufloesung - mehr bringt nichts. */
const BILD = 128;
const RENDER = (itemId) => `https://render.albiononline.com/v1/item/${itemId}.png?size=${BILD}&quality=1`;

/** Discord nimmt nur [A-Za-z0-9_], 2 bis 32 Zeichen. */
function emojiName(itemId) {
  const sauber = itemId.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
  return sauber.length >= 2 ? sauber : `w_${sauber}`;
}

const warte = (ms) => new Promise((fertig) => setTimeout(fertig, ms));

/**
 * Holt ein Render. Der Dienst antwortet unter Last gern mit 504 - das ist
 * keine Aussage ueber das Item, sondern ueber den Moment. Also nochmal
 * fragen, mit wachsendem Abstand. Ein 404 dagegen bleibt ein 404: die
 * Item-ID stimmt dann nicht, da hilft kein Warten.
 */
async function holeBild(itemId) {
  let letzter = '';
  for (let versuch = 1; versuch <= 3; versuch += 1) {
    try {
      const antwort = await fetch(RENDER(itemId));
      if (antwort.ok) return Buffer.from(await antwort.arrayBuffer());
      if (antwort.status === 404) throw new Error('404 - Item-ID stimmt nicht');
      letzter = `${antwort.status}`;
    } catch (fehler) {
      if (fehler.message.startsWith('404')) throw fehler;
      letzter = fehler.message;
    }
    if (versuch < 3) await warte(versuch * 2000);
  }
  throw new Error(`Render ${letzter} (nach 3 Versuchen)`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  try {
    await lauf();
  } catch (fehler) {
    console.error('Abgebrochen:', fehler.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
    client.destroy();
  }
});

async function lauf() {
  const vorhandene = await client.application.emojis.fetch();
  console.log(`App besitzt aktuell ${vorhandene.size} Emojis.`);

  if (WEG) {
    for (const emoji of vorhandene.values()) {
      await client.application.emojis.delete(emoji.id);
      await warte(250);
    }
    await sql`update weapon set emoji = null`;
    console.log(`${vorhandene.size} Emojis geloescht, Waffen fallen auf ihr Kategorie-Emoji zurueck.`);
    return;
  }

  const waffen = await sql`
    select id, name, item_id, emoji
    from weapon
    where active and item_id is not null
    order by sort_order, name
  `;

  // Zwei Waffen mit derselben Item-ID bekaemen dasselbe Bild - und das faellt
  // niemandem auf, weil das Bild ja "richtig aussieht". Lieber abbrechen.
  const doppelt = await sql`
    select item_id, string_agg(name, ', ') as namen
    from weapon
    where active and item_id is not null
    group by item_id having count(*) > 1
  `;
  if (doppelt.length) {
    for (const d of doppelt) console.error(`  ${d.item_id}: ${d.namen}`);
    throw new Error(`${doppelt.length}× dieselbe Item-ID an mehreren Waffen - erst klaeren.`);
  }

  const ohneItem = await sql`select count(*)::int n from weapon where active and item_id is null`;
  if (ohneItem[0].n) {
    console.log(`${ohneItem[0].n} Waffen haben keine Item-ID und behalten ihr Kategorie-Emoji.`);
  }

  // Was die App schon hat, nach Namen greifbar machen
  const nachName = new Map(vorhandene.map((emoji) => [emoji.name, emoji]));

  let neu = 0;
  let wiederverwendet = 0;
  let gescheitert = 0;

  for (const waffe of waffen) {
    const name = emojiName(waffe.item_id);

    if (waffe.emoji && !ALLE && nachName.has(name)) {
      wiederverwendet += 1;
      continue;
    }

    let emoji = nachName.get(name);

    if (!emoji || ALLE) {
      try {
        const bild = await holeBild(waffe.item_id);
        if (bild.length > 256 * 1024) throw new Error(`Bild zu gross (${bild.length} Bytes)`);

        if (emoji) await client.application.emojis.delete(emoji.id);
        emoji = await client.application.emojis.create({ attachment: bild, name });
        neu += 1;

        // Discord drosselt das Anlegen von Emojis. Lieber gemuetlich laufen
        // als auf halber Strecke in einen 429 rennen.
        await warte(400);
      } catch (fehler) {
        console.error(`  ${waffe.name} (${waffe.item_id}): ${fehler.message}`);
        gescheitert += 1;
        continue;
      }
    } else {
      wiederverwendet += 1;
    }

    await sql`update weapon set emoji = ${`<:${emoji.name}:${emoji.id}>`} where id = ${waffe.id}`;
  }

  console.log(`\nNeu hochgeladen: ${neu} · wiederverwendet: ${wiederverwendet} · gescheitert: ${gescheitert}`);

  const [stand] = await sql`select count(emoji)::int mit, count(*)::int gesamt from weapon where active`;
  console.log(`${stand.mit} von ${stand.gesamt} Waffen haben jetzt ein Item-Bild.`);
}

client.login(TOKEN);
