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

/** So viele Plaetze gehoeren untereinander, bevor daneben weitergeht. */
const PRO_SPALTE = 20;

/**
 * Kuerzt die Emoji-Auszeichnung auf das Noetige.
 *
 * In "<:name:id>" loest Discord das Bild allein ueber die ID auf; der Name
 * ist nur eine Beschriftung. Deshalb bleiben Bilder auch sichtbar, wenn
 * jemand ein Emoji umbenennt - und deshalb duerfen wir ihn hier wegkuerzen.
 *
 * Das ist kein Geiz: "<:T4_MAIN_SWORD:1537414852631470080>" sind 36 Zeichen,
 * und bei 1024 Zeichen je Feld entscheidet das darueber, ob 20 Plaetze in
 * eine Spalte passen oder in zwei zerfallen.
 */
function kompaktesEmoji(icon) {
  if (!icon) return '•';
  const treffer = icon.match(/^<(a?):[^:]+:(\d+)>$/);
  return treffer ? `<${treffer[1]}:w:${treffer[2]}>` : icon;
}

/** Ein Platz, eine Zeile - in der Reihenfolge der Comp. */
function slotZeile(slot) {
  // Ist der Platz frei und laesst mehrere Waffen zu, gehoeren alle dran -
  // sonst weiss niemand, dass er sich auch mit der Alternative meldet.
  // Sobald jemand drauf steht, zeigt der Platz nur noch dessen Waffe.
  const waffe =
    !slot.discordId && slot.optionen?.length > 1
      ? slot.optionen.map((o) => o.name).join(' / ')
      : slot.weaponName;

  const name = slot.label ? `${slot.label} · ${waffe}` : waffe;
  const kopf = `${kompaktesEmoji(slot.icon)} **${name}**`;

  if (!slot.discordId) return `${kopf} — *frei*`;

  // Als Erwaehnung statt als Name: Discord hebt sie im Embed hervor,
  // benachrichtigt aber nicht - eine Erwaehnung im Embed pingt nie. Genau
  // deshalb steht der echte Ping im Nachrichtentext daneben.
  const person = slot.discordId ? `<@${slot.discordId}>` : slot.displayName;
  const rating = slot.rating != null ? ` \`${slot.rating}\`` : '';
  return `${kopf} — ${person}${rating}${slot.locked ? ' 📌' : ''}`;
}

/**
 * Verteilt die Zeilen auf Embed-Felder.
 *
 * Bis 20 Plaetze eine Spalte - das ist die uebliche Gruppengroesse, und
 * untereinander liest sich eine Aufstellung am schnellsten. Darueber wird
 * nebeneinander gesetzt statt eine zweite Nachricht anzufangen: die
 * Aufstellung soll immer auf einen Blick da sein.
 *
 * Die 1024-Zeichen-Grenze je Feld kann trotzdem reissen, wenn Waffen lange
 * Bezeichnungen tragen. Dann wird weiter aufgeteilt - lieber drei schmale
 * Spalten als eine abgeschnittene.
 */
function inSpalten(zeilen) {
  if (zeilen.length === 0) return ['—'];

  // Der Wunschschnitt: genau 20 je Spalte. Das ist keine willkuerliche
  // Zahl, sondern eine Gruppe - die erste Spalte ist die erste Gruppe,
  // die zweite der Rest. Bei 35 Plaetzen also 20 und 15, nicht 18 und 17.
  const wunsch = [];
  for (let i = 0; i < zeilen.length; i += PRO_SPALTE) {
    wunsch.push(zeilen.slice(i, i + PRO_SPALTE).join('\n'));
  }
  if (wunsch.every((stueck) => stueck.length <= FELD_GRENZE)) return wunsch;

  // Passen 20 nicht ins Feld - lange Waffennamen fressen die Zeichen -,
  // dann lieber eine Spalte mehr und alle gleich lang, als eine volle
  // Spalte und ein einsamer Rest daneben.
  // Der Rest wird einzeln auf die vorderen Spalten verteilt. Mit einem
  // schlichten Math.ceil ergaeben 41 Zeilen auf 4 Spalten 11/11/11/8 - die
  // letzte sichtbar kuerzer. So werden es 11/10/10/10.
  const verteile = (anzahl) => {
    const basis = Math.floor(zeilen.length / anzahl);
    const rest = zeilen.length % anzahl;
    const stuecke = [];
    let i = 0;
    for (let s = 0; s < anzahl; s += 1) {
      const laenge = basis + (s < rest ? 1 : 0);
      stuecke.push(zeilen.slice(i, i + laenge).join('\n'));
      i += laenge;
    }
    return stuecke;
  };

  for (let anzahl = wunsch.length + 1; anzahl <= zeilen.length; anzahl += 1) {
    const stuecke = verteile(anzahl);
    if (stuecke.every((stueck) => stueck.length <= FELD_GRENZE)) return stuecke;
  }

  // Notausgang: eine einzelne Zeile ist laenger als ein ganzes Feld.
  return zeilen.map((zeile) => zeile.slice(0, FELD_GRENZE));
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

  // Kopf: wann, und was als Naechstes passiert.
  // Ist die Sperrfrist schon durch, der Poll aber noch nicht gelaufen, waere
  // "wird vor 3 Minuten eingefroren" Unsinn - dann steht da "gleich".
  const sperreOffen = lockAt.getTime() > Date.now();
  const niemandDa =
    !steht && composition.filled === 0 && composition.bench.length === 0 && maybes.length === 0;

  embed.setDescription(
    [
      `${discordTime(startsAt, 'F')} · ${discordTime(startsAt, 'R')}`,
      steht
        ? '**Die Aufstellung steht.**'
        : sperreOffen
          ? `Wird ${discordTime(lockAt, 'R')} eingefroren.`
          : 'Wird **gleich** eingefroren.',
      // In die Kopfzeile statt in ein eigenes Feld: ein Feld mit leerem Namen
      // waere von einer Folgespalte der Aufstellung nicht zu unterscheiden.
      niemandDa ? '-# Noch hat sich niemand angemeldet.' : null,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  const spalten = inSpalten(composition.slots.map(slotZeile));
  spalten.forEach((spalte, index) => {
    embed.addFields({
      name: index === 0 ? 'Aufstellung' : '​',
      value: spalte,
      // Nur nebeneinander, wenn es mehr als eine Spalte gibt - ein
      // einzelnes inline-Feld waere sonst unnoetig schmal.
      inline: spalten.length > 1,
    });
  });

  // Die Bank hat zwei voellig verschiedene Gruende, und genau die stand
  // bisher nirgends: wer keine der gesuchten Waffen im Profil hat (bestRating
  // 0), sitzt aus einem anderen Grund da als wer nur knapp zweiter war. Fuer
  // den Ersten ist es eine Aufforderung, fuer den Zweiten eine Information.
  const nachruecker = composition.bench.filter((p) => p.bestRating > 0);
  const ohneWaffe = composition.bench.filter((p) => !p.bestRating);

  // Steht die Aufstellung schon zweispaltig, duerfen diese Felder nicht auch
  // inline sein: Discord fuellt Reihen zu dritt, und dann rutscht "Nachruecker"
  // neben die zweite Spalte der Aufstellung.
  const nebeneinander = spalten.length === 1;

  if (nachruecker.length) {
    embed.addFields({
      name: `Nachrücker · ${nachruecker.length}`,
      value: namensliste(nachruecker.map((p) => `${p.displayName} \`${p.bestRating}\``)),
      inline: nebeneinander,
    });
  }

  if (maybes.length) {
    embed.addFields({
      name: `Vielleicht · ${maybes.length}`,
      value: namensliste(maybes.map((m) => m.display_name)),
      inline: nebeneinander,
    });
  }

  if (ohneWaffe.length) {
    embed.addFields({
      name: `Keine passende Waffe · ${ohneWaffe.length}`,
      value: `${namensliste(ohneWaffe.map((p) => p.displayName), FELD_GRENZE - 80)}\n-# Trag mit \`/waffen\` ein, was du spielen kannst — sonst kann dich der Bot nirgends einsetzen.`,
    });
  }

  // Bild der Comp. setImage haengt es gross unter die Aufstellung - das ist
  // die einzige Stelle, an der Discord ein Bild fest an ein Embed bindet.
  if (event.image_url) embed.setImage(event.image_url);

  embed.setFooter({
    text: [`Event #${event.id}`, event.comp_name, `${composition.filled}/${composition.total} besetzt`].join(' · '),
  });

  return embed;
}

/**
 * Was ausserhalb des Embeds stehen muss, damit es wirklich pingt.
 *
 * Erwaehnungen in einem Embed werden hervorgehoben, loesen aber keine
 * Benachrichtigung aus - das ist eine Eigenheit von Discord, kein Fehler.
 * Wer @here erreichen will, muss es in den Nachrichtentext schreiben.
 */
export function pingText(event) {
  if (event.ping === 'here') return '@here';
  if (event.ping === 'everyone') return '@everyone';
  return '';
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

  // Absagen und die Abmeldungsliste haengen nicht mehr hier, sondern an
  // /event. Discord blendet Slash-Befehle aus, wenn die Berechtigung
  // fehlt - Knoepfe an einer Nachricht sieht dagegen immer jeder, das
  // laesst sich nicht pro Person steuern.
  if (dashboardUrl) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Im Dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL(`${dashboardUrl}/events/${event.id}`),
      ),
    );
  }

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

/**
 * Die Liste der Abmeldungen - nur fuer Berechtigte, deshalb ephemer.
 *
 * Mit Zeitpunkt: eine Absage zwei Minuten vor Start ist etwas anderes als
 * eine von gestern, und genau danach sucht der Leader.
 */
export function renderSignOffs(abmeldungen) {
  if (abmeldungen.length === 0) {
    return 'Bisher hat sich niemand wieder abgemeldet.';
  }

  const zeilen = abmeldungen.map(
    (a) => `<@${a.discord_id}> — ${discordTime(new Date(a.updated_at), 'R')}`,
  );

  const kopf = `**${abmeldungen.length} ${abmeldungen.length === 1 ? 'Abmeldung' : 'Abmeldungen'}**`;
  const text = [kopf, ...zeilen].join('\n');

  // Ephemere Antworten sind auch nur Nachrichten - 2000 Zeichen.
  if (text.length <= 1950) return text;
  return [kopf, ...zeilen.slice(0, 25), '-# …und weitere'].join('\n');
}

/** Billiger Hash, um das Embed nur bei echten Aenderungen neu zu schreiben. */
export function hashComposition(event, composition, maybes) {
  const teile = [
    event.status,
    String(event.starts_at),
    ...composition.slots.map((s) => `${s.slotIndex}:${s.discordId ?? '-'}:${s.rating ?? '-'}`),
    // bestRating gehoert dazu: es entscheidet, ob jemand unter "Nachruecker"
    // oder unter "Keine passende Waffe" steht. Traegt er eine Waffe nach,
    // aendert sich sonst nur die Anzeige - und die wuerde nie neu geschrieben.
    ...composition.bench.map((p) => `${p.discordId}:${p.bestRating ?? 0}`),
    ...maybes.map((m) => m.discord_id),
  ];
  const eingabe = teile.join('|');

  let hash = 5381;
  for (let i = 0; i < eingabe.length; i++) {
    hash = ((hash * 33) ^ eingabe.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
