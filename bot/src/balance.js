// =====================================================================
//  Balance-Board
//
//  Gold pro Server. Vergeben und abziehen duerfen nur benannte Personen;
//  die Rangliste sieht jeder. Jede Buchung landet in balance_log, damit
//  spaeter nachvollziehbar ist, wer wem was gegeben hat.
//
//  Es gibt beides: Slash-Befehle (/balance, /leaderboard) und die
//  klassischen mit Ausrufezeichen (!balance, !leaderboard).
// =====================================================================

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import { sql } from './db.js';

export const PREFIX = '!';
const PRO_SEITE = 10;

/** Groesste Einzelbuchung. Fuer Gold weit jenseits von allem Realistischen. */
export const MAX_BUCHUNG = 1_000_000_000;

// ---------------------------------------------------------------------
//  Datenbank
// ---------------------------------------------------------------------

export async function isBalanceEnabled(guildId) {
  const [row] = await sql`select balance_enabled from guild where id = ${guildId}`;
  return Boolean(row?.balance_enabled);
}

/** Darf die Person Gold vergeben und abziehen? */
export async function canManageBalance(guildId, discordId, hatServerVerwalten) {
  if (hatServerVerwalten) return true;
  const [row] = await sql`
    select 1 from balance_manager where guild_id = ${guildId} and discord_id = ${discordId}
  `;
  return Boolean(row);
}

export async function getBalance(guildId, discordId) {
  const [row] = await sql`
    select amount from balance where guild_id = ${guildId} and discord_id = ${discordId}
  `;
  return row ? BigInt(row.amount) : 0n;
}

/**
 * Bucht eine Aenderung und schreibt sie in die Historie.
 * Beides in einer Transaktion - ein Kontostand ohne passende Buchung
 * waere schlimmer als gar keine Aenderung.
 */
export async function adjustBalance({ guildId, discordId, displayName, delta, reason, byId }) {
  return sql.begin(async (tx) => {
    const [row] = await tx`
      insert into balance (guild_id, discord_id, display_name, amount)
      values (${guildId}, ${discordId}, ${displayName}, ${String(delta)})
      on conflict (guild_id, discord_id) do update
        set amount = balance.amount + ${String(delta)},
            display_name = coalesce(excluded.display_name, balance.display_name),
            updated_at = now()
      returning amount
    `;

    const saldo = BigInt(row.amount);

    await tx`
      insert into balance_log (guild_id, discord_id, delta, saldo_danach, reason, created_by)
      values (${guildId}, ${discordId}, ${String(delta)}, ${String(saldo)}, ${reason || null}, ${byId})
    `;

    return saldo;
  });
}

export async function getLeaderboard(guildId, page = 0) {
  const [{ n }] = await sql`
    select count(*)::int as n from balance where guild_id = ${guildId} and amount <> 0
  `;
  const seiten = Math.max(1, Math.ceil(n / PRO_SEITE));
  const seite = Math.min(Math.max(0, page), seiten - 1);

  const rows = await sql`
    select discord_id, display_name, amount
    from balance
    where guild_id = ${guildId} and amount <> 0
    order by amount desc, lower(coalesce(display_name, discord_id))
    offset ${seite * PRO_SEITE}
    limit ${PRO_SEITE}
  `;

  return { rows, seite, seiten, gesamt: n };
}

// ---------------------------------------------------------------------
//  Betraege
// ---------------------------------------------------------------------

/**
 * Versteht "500", "1.5k", "2m", "1.000.000" und "1,000,000".
 * @returns {bigint|null} null, wenn es kein brauchbarer Betrag ist
 */
export function parseAmount(text) {
  if (!text) return null;
  const roh = String(text).trim().toLowerCase().replace(/[.,](?=\d{3}\b)/g, '');

  const treffer = roh.match(/^(\d+(?:[.,]\d+)?)\s*([km])?$/);
  if (!treffer) return null;

  const zahl = Number(treffer[1].replace(',', '.'));
  if (!Number.isFinite(zahl) || zahl <= 0) return null;

  const faktor = treffer[2] === 'm' ? 1_000_000 : treffer[2] === 'k' ? 1_000 : 1;
  const gesamt = Math.round(zahl * faktor);

  // Obergrenze je Buchung. Nicht weil mehr technisch nicht ginge, sondern
  // damit ein Vertipper wie "999999m" auffaellt statt durchzurutschen.
  if (gesamt <= 0 || gesamt > MAX_BUCHUNG) return null;
  return BigInt(gesamt);
}

/** 1500000 -> "1.500.000" */
export function formatAmount(betrag) {
  return new Intl.NumberFormat('de-DE').format(betrag);
}

// ---------------------------------------------------------------------
//  Anzeige
// ---------------------------------------------------------------------

const FARBE_GOLD = 0xd9a441;
const FARBE_PLUS = 0x57f287;
const FARBE_MINUS = 0xed4245;

/**
 * Rangliste als Codeblock. Anders als in Fliesstext stehen die Betraege
 * dadurch wirklich untereinander - bei einer Tabelle aus Zahlen ist genau
 * das der Punkt. Die ersten drei bekommen ihre Medaille davor.
 */
export function renderLeaderboard({ rows, seite, seiten, gesamt }, guildName) {
  const embed = new EmbedBuilder()
    .setTitle('Rangliste')
    .setColor(FARBE_GOLD)
    .setFooter({
      text: [guildName, seiten > 1 ? `Seite ${seite + 1}/${seiten}` : null, `${gesamt} Einträge`]
        .filter(Boolean)
        .join(' · '),
    });

  if (rows.length === 0) {
    embed.setDescription(
      'Noch hat niemand Gold.\nVergeben geht mit `/balance geben` oder `!balance add @Name 500`.',
    );
    return embed;
  }

  // Bewusst keine Medaillen-Emoji im Block: die sind breiter als eine Ziffer,
  // und schon eine einzige davon schiebt alle folgenden Zeilen aus der Spalte.
  // In einer Tabelle aus Zahlen ist die Ausrichtung der ganze Zweck.
  const breite = Math.max(...rows.map((row) => formatAmount(BigInt(row.amount)).length));
  const platzBreite = String(seite * PRO_SEITE + rows.length).length;

  const zeilen = rows.map((row, index) => {
    const platz = String(seite * PRO_SEITE + index + 1).padStart(platzBreite);
    const betrag = formatAmount(BigInt(row.amount)).padStart(breite);
    const name = row.display_name ?? row.discord_id;
    return `${platz}  ${betrag}  ${name}`;
  });

  embed.setDescription(`\`\`\`\n${zeilen.join('\n')}\n\`\`\``);
  return embed;
}

/** Bestaetigung einer Buchung. */
export function renderBooking({ menge, abziehen, zielId, saldo, grund }) {
  const embed = new EmbedBuilder()
    .setColor(abziehen ? FARBE_MINUS : FARBE_PLUS)
    .setDescription(
      `${abziehen ? '−' : '+'} **${formatAmount(menge)}** Gold ${abziehen ? 'abgezogen von' : 'für'} <@${zielId}>`,
    )
    .addFields({ name: 'Neuer Stand', value: `**${formatAmount(saldo)}**`, inline: true });

  if (grund) embed.addFields({ name: 'Grund', value: grund, inline: true });
  return embed;
}

/** Kontostand einer Person. */
export function renderBalance(zielId, saldo, selbst) {
  return new EmbedBuilder()
    .setColor(FARBE_GOLD)
    .setDescription(`${selbst ? 'Du hast' : `<@${zielId}> hat`} **${formatAmount(saldo)}** Gold.`);
}

export function leaderboardButtons(seite, seiten) {
  if (seiten <= 1) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`lb:${seite - 1}`)
        .setLabel('Zurück')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(seite === 0),
      new ButtonBuilder()
        .setCustomId(`lb:${seite + 1}`)
        .setLabel('Weiter')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(seite >= seiten - 1),
    ),
  ];
}

/** Baut die komplette Rangliste-Antwort. */
export async function buildLeaderboard(guildId, page, guildName) {
  const daten = await getLeaderboard(guildId, page);
  return {
    embeds: [renderLeaderboard(daten, guildName)],
    components: leaderboardButtons(daten.seite, daten.seiten),
  };
}

// ---------------------------------------------------------------------
//  Personen aus Text erkennen (fuer die !-Befehle)
// ---------------------------------------------------------------------

/**
 * Findet die gemeinte Person: Erwaehnung, rohe ID oder Name in
 * Anfuehrungszeichen. Bei mehrdeutigen Namen wird abgebrochen statt geraten -
 * Gold auf dem falschen Konto ist schwer zu erklaeren.
 *
 * @returns {{ id, name } | { fehler: string }}
 */
export async function resolveMember(message, roh) {
  const erwaehnt = message.mentions.users.first();
  if (erwaehnt) {
    const mitglied = message.guild.members.cache.get(erwaehnt.id);
    return { id: erwaehnt.id, name: mitglied?.nickname || erwaehnt.globalName || erwaehnt.username };
  }

  const text = String(roh || '').replace(/^["']|["']$/g, '').trim();
  if (!text) return { fehler: 'Wen meinst du? Erwähne die Person mit @ oder schreib den Namen in Anführungszeichen.' };

  if (/^\d{17,20}$/.test(text)) {
    const mitglied = await message.guild.members.fetch(text).catch(() => null);
    if (!mitglied) return { fehler: `Auf diesem Server ist niemand mit der ID \`${text}\`.` };
    return { id: text, name: mitglied.nickname || mitglied.user.globalName || mitglied.user.username };
  }

  // Nach Namen suchen - erst unter denen, die schon ein Konto haben,
  // dann im Server selbst
  const konten = await sql`
    select discord_id, display_name
    from balance
    where guild_id = ${message.guildId} and lower(display_name) = ${text.toLowerCase()}
  `;
  if (konten.length === 1) return { id: konten[0].discord_id, name: konten[0].display_name };
  if (konten.length > 1) {
    return { fehler: `Mehrere Leute heißen „${text}". Erwähne die richtige Person lieber mit @.` };
  }

  // Serversuche ueber die REST-Schnittstelle. Der Mitglieder-Zwischenspeicher
  // waere hier nutzlos, weil er ohne die privilegierte Mitglieder-Berechtigung
  // leer bleibt - die Suche kommt ohne aus.
  const treffer = await message.guild.members
    .search({ query: text, limit: 10 })
    .catch(() => null);

  if (treffer) {
    const genau = treffer.filter((mitglied) => {
      const namen = [mitglied.nickname, mitglied.user.globalName, mitglied.user.username]
        .filter(Boolean)
        .map((n) => n.toLowerCase());
      return namen.includes(text.toLowerCase());
    });

    if (genau.size === 1) {
      const mitglied = genau.first();
      return {
        id: mitglied.id,
        name: mitglied.nickname || mitglied.user.globalName || mitglied.user.username,
      };
    }
    if (genau.size > 1) {
      return { fehler: `Mehrere Leute heißen „${text}". Erwähne die richtige Person lieber mit @.` };
    }
  }

  return {
    fehler: `„${text}" finde ich hier nicht. Erwähne die Person mit @ — das ist ohnehin sicherer als der Name.`,
  };
}
