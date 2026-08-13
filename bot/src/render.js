import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { discordTime } from './time.js';

// =====================================================================
//  Anzeige im Discord
//
//  Farbe bedeutet Zustand, nichts sonst. Die Beschreibung traegt das
//  Layout; Felder sind fuer abgegrenzte Bloecke da, nicht fuer jede Zeile.
//
//  Wichtigste Entscheidung: die Aufstellung wird nach Waffe gebuendelt
//  statt Platz fuer Platz aufgelistet. Bei einer 20er-Comp sind das vier
//  Zeilen statt zwanzig, und man sieht auf einen Blick, wo es klemmt.
// =====================================================================

const FARBE_OFFEN = 0x5865f2; // Blurple: Anmeldung laeuft
const FARBE_STEHT = 0x57f287; // Gruen: Aufstellung steht
const FARBE_ABGESAGT = 0x99aab5; // Grau: erledigt

/** Discord erlaubt 1024 Zeichen pro Feld. */
const FELD_GRENZE = 1000;

/**
 * Fasst gleiche Plaetze zusammen. Zwei Plaetze gehoeren zusammen, wenn
 * Waffe und Bezeichnung uebereinstimmen - ein "Main Tank" bleibt also vom
 * gewoehnlichen Heavy Mace getrennt.
 */
function gruppiere(slots) {
  const gruppen = new Map();

  for (const slot of slots) {
    const schluessel = `${slot.weaponId}|${slot.label ?? ''}`;
    if (!gruppen.has(schluessel)) {
      gruppen.set(schluessel, {
        icon: slot.icon || '•',
        name: slot.label ? `${slot.label} · ${slot.weaponName}` : slot.weaponName,
        besetzt: [],
        frei: 0,
      });
    }
    const gruppe = gruppen.get(schluessel);
    if (slot.discordId) {
      gruppe.besetzt.push({
        name: slot.displayName ?? slot.discordId,
        rating: slot.rating,
        locked: slot.locked,
      });
    } else {
      gruppe.frei += 1;
    }
  }

  return [...gruppen.values()];
}

function gruppeAlsZeilen(gruppe) {
  const gesamt = gruppe.besetzt.length + gruppe.frei;
  const kopf = `${gruppe.icon} **${gruppe.name}**${gesamt > 1 ? ` ×${gesamt}` : ''}`;

  const namen = gruppe.besetzt.map(
    (person) => `${person.name}${person.rating != null ? ` \`${person.rating}\`` : ''}${person.locked ? ' 📌' : ''}`,
  );
  if (gruppe.frei > 0) namen.push(`*${gruppe.frei}× frei*`);

  return `${kopf}\n${namen.join(' · ')}`;
}

/** Teilt lange Aufstellungen auf mehrere Felder auf. */
function inFelder(bloecke) {
  const felder = [];
  let aktuell = '';

  for (const block of bloecke) {
    if (aktuell && aktuell.length + block.length + 2 > FELD_GRENZE) {
      felder.push(aktuell);
      aktuell = '';
    }
    aktuell += (aktuell ? '\n\n' : '') + block;
  }
  if (aktuell) felder.push(aktuell);
  return felder.length ? felder : ['—'];
}

function namensliste(namen, grenze = FELD_GRENZE) {
  const text = namen.join(' · ');
  return text.length > grenze ? `${text.slice(0, grenze - 1)}…` : text;
}

/**
 * Baut das Embed fuer ein Event.
 *
 * @param {object} event
 * @param {object} composition Ergebnis aus buildComposition()
 * @param {Array} maybes  Anmeldungen mit Status "maybe"
 */
export function buildEventEmbed(event, composition, maybes) {
  const startsAt = new Date(event.starts_at);
  const lockAt = new Date(startsAt.getTime() - event.lock_minutes * 60_000);

  const abgesagt = event.status === 'cancelled';
  const steht = event.status === 'locked';

  const embed = new EmbedBuilder()
    .setTitle(event.title || event.comp_name)
    .setColor(abgesagt ? FARBE_ABGESAGT : steht ? FARBE_STEHT : FARBE_OFFEN);

  if (abgesagt) {
    embed.setDescription(`~~${discordTime(startsAt, 'f')}~~\n**Abgesagt.**`);
    embed.setFooter({ text: `Event #${event.id}` });
    return embed;
  }

  // Kopf: wann, und was als Naechstes passiert
  embed.setDescription(
    [
      `${discordTime(startsAt, 'F')} · ${discordTime(startsAt, 'R')}`,
      steht
        ? '**Die Aufstellung steht.**'
        : `Wird ${discordTime(lockAt, 'R')} eingefroren.`,
    ].join('\n'),
  );

  const gruppen = gruppiere(composition.slots);
  const felder = inFelder(gruppen.map(gruppeAlsZeilen));
  felder.forEach((feld, index) => {
    embed.addFields({ name: index === 0 ? 'Aufstellung' : '​', value: feld });
  });

  // Bank und Vielleicht nebeneinander - beides sind kurze Namenslisten
  if (composition.bench.length) {
    embed.addFields({
      name: `Bank · ${composition.bench.length}`,
      value: namensliste(
        composition.bench.map((p) => (p.bestRating ? `${p.displayName} \`${p.bestRating}\`` : p.displayName)),
      ),
      inline: true,
    });
  }

  if (maybes.length) {
    embed.addFields({
      name: `Vielleicht · ${maybes.length}`,
      value: namensliste(maybes.map((m) => m.display_name)),
      inline: true,
    });
  }

  embed.setFooter({
    text: [
      `Event #${event.id}`,
      event.comp_name,
      `${composition.filled}/${composition.total} besetzt`,
      steht ? null : '/waffen für dein Profil',
    ]
      .filter(Boolean)
      .join(' · '),
  });

  return embed;
}

/** Buttons unter dem Embed. Nach dem Einfrieren gibt es nichts mehr zu klicken. */
export function buildEventButtons(event, dashboardUrl) {
  if (event.status !== 'open') {
    if (!dashboardUrl) return [];
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Im Dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL(`${dashboardUrl}/events/${event.id}`),
      ),
    ];
  }

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`su:yes:${event.id}`)
        .setLabel('Dabei')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`su:maybe:${event.id}`)
        .setLabel('Vielleicht')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`su:out:${event.id}`)
        .setLabel('Abmelden')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  const zweite = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ev:cancel:${event.id}`)
      .setLabel('Event absagen')
      .setStyle(ButtonStyle.Danger),
  );
  if (dashboardUrl) {
    zweite.addComponents(
      new ButtonBuilder()
        .setLabel('Im Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(`${dashboardUrl}/events/${event.id}`),
    );
  }
  rows.push(zweite);

  return rows;
}

/**
 * Ping beim Einfrieren. Auch hier nach Waffe gebuendelt: wer sucht, sucht
 * nach seiner Waffe, nicht nach seinem Namen in einer Liste von zwanzig.
 */
export function buildLockMessage(event, composition, pingRoleId) {
  const zeilen = [];
  if (pingRoleId) zeilen.push(`<@&${pingRoleId}>`);
  zeilen.push(`**${event.title || event.comp_name}** — Aufstellung steht:`);
  zeilen.push('');

  for (const gruppe of gruppiere(composition.slots)) {
    const besetzt = composition.slots.filter(
      (slot) => slot.discordId && (slot.label ? `${slot.label} · ${slot.weaponName}` : slot.weaponName) === gruppe.name,
    );
    if (besetzt.length === 0) continue;
    zeilen.push(`${gruppe.icon} **${gruppe.name}**`);
    zeilen.push(besetzt.map((slot) => `<@${slot.discordId}>`).join(' '));
  }

  const offen = composition.slots.filter((slot) => !slot.discordId);
  if (offen.length) {
    const nachWaffe = new Map();
    for (const slot of offen) {
      nachWaffe.set(slot.weaponName, (nachWaffe.get(slot.weaponName) ?? 0) + 1);
    }
    zeilen.push('');
    zeilen.push(
      `⚠️ Offen: ${[...nachWaffe].map(([waffe, anzahl]) => `${anzahl}× ${waffe}`).join(', ')}`,
    );
  }

  if (composition.bench.length) {
    zeilen.push('');
    zeilen.push(`Bank: ${composition.bench.map((p) => `<@${p.discordId}>`).join(' ')}`);
  }

  const text = zeilen.join('\n');
  return text.length > 1990 ? `${text.slice(0, 1980)}\n…` : text;
}

/** Billiger Hash, um das Embed nur bei echten Aenderungen neu zu schreiben. */
export function hashComposition(event, composition, maybes) {
  const teile = [
    event.status,
    String(event.starts_at),
    ...composition.slots.map((s) => `${s.slotIndex}:${s.discordId ?? '-'}:${s.rating ?? '-'}`),
    ...composition.bench.map((p) => p.discordId),
    ...maybes.map((m) => m.discord_id),
  ];
  const eingabe = teile.join('|');

  let hash = 5381;
  for (let i = 0; i < eingabe.length; i++) {
    hash = ((hash * 33) ^ eingabe.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
