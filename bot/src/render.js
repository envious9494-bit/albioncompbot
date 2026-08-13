import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { discordTime } from './time.js';

const COLOR_OPEN = 0x3ba55d;
const COLOR_LOCKED = 0x5865f2;
const COLOR_CANCELLED = 0x99aab5;

/** Discord erlaubt 1024 Zeichen pro Feld - laengere Comps werden aufgeteilt. */
const FIELD_LIMIT = 950;

function chunkLines(lines) {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    if (current.length + line.length + 1 > FIELD_LIMIT) {
      chunks.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + line;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : ['—'];
}

function slotLine(slot) {
  // Symbol kommt aus der Waffenfamilie in der Datenbank
  const icon = slot.icon || '•';
  const weapon = slot.label ? `${slot.label} (${slot.weaponName})` : slot.weaponName;

  if (!slot.discordId) {
    return `${icon} **${weapon}** · *frei*`;
  }
  const rating = slot.rating != null ? ` \`${slot.rating}\`` : '';
  const pin = slot.locked ? ' 📌' : '';
  return `${icon} **${weapon}** · ${slot.displayName}${rating}${pin}`;
}

/**
 * Baut das Embed fuer ein Event.
 *
 * @param {object} event
 * @param {object} composition Ergebnis aus buildComposition()
 * @param {Array} maybes  Anmeldungen mit Status "maybe"
 * @param {string} dashboardUrl
 */
export function buildEventEmbed(event, composition, maybes, dashboardUrl) {
  const startsAt = new Date(event.starts_at);
  const lockAt = new Date(startsAt.getTime() - event.lock_minutes * 60_000);

  const isLocked = event.status === 'locked';
  const isCancelled = event.status === 'cancelled';

  const header = [
    `**Start:** ${discordTime(startsAt, 'F')} · ${discordTime(startsAt, 'R')}`,
    isCancelled
      ? '**Abgesagt.**'
      : isLocked
        ? '**Aufstellung steht.**'
        : `Aufstellung wird ${discordTime(lockAt, 'R')} eingefroren.`,
    `**Comp:** ${event.comp_name} · ${composition.filled}/${composition.total} besetzt`,
  ].join('\n');

  const embed = new EmbedBuilder()
    .setTitle(event.title || event.comp_name)
    .setDescription(header)
    .setColor(isCancelled ? COLOR_CANCELLED : isLocked ? COLOR_LOCKED : COLOR_OPEN)
    .setFooter({ text: `Event #${event.id}` });

  if (!isCancelled) {
    const chunks = chunkLines(composition.slots.map(slotLine));
    chunks.forEach((chunk, i) => {
      embed.addFields({ name: i === 0 ? 'Aufstellung' : '​', value: chunk });
    });

    if (composition.bench.length) {
      const bench = composition.bench
        .map((p) => (p.bestRating ? `${p.displayName} \`${p.bestRating}\`` : p.displayName))
        .join(', ');
      embed.addFields({
        name: `Bank (${composition.bench.length})`,
        value: bench.slice(0, FIELD_LIMIT),
      });
    }

    if (maybes.length) {
      embed.addFields({
        name: `Vielleicht (${maybes.length})`,
        value: maybes.map((m) => m.display_name).join(', ').slice(0, FIELD_LIMIT),
      });
    }
  }

  if (!isCancelled) {
    embed.addFields({
      name: '​',
      value: 'Noch kein Waffenprofil? Tipp `/waffen` in den Chat — sonst wirst du keiner Rolle zugeordnet.',
    });
  }

  return embed;
}

/** Buttons unter dem Embed. Nach dem Einfrieren gibt es nichts mehr zu klicken. */
export function buildEventButtons(event, dashboardUrl) {
  if (event.status !== 'open') {
    if (!dashboardUrl) return [];
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Im Dashboard ansehen')
          .setStyle(ButtonStyle.Link)
          .setURL(`${dashboardUrl}/events/${event.id}`),
      ),
    ];
  }

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`su:yes:${event.id}`)
        .setLabel('Anmelden')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`su:maybe:${event.id}`)
        .setLabel('Vielleicht')
        .setEmoji('❔')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`su:out:${event.id}`)
        .setLabel('Abmelden')
        .setEmoji('✖️')
        .setStyle(ButtonStyle.Danger),
    ),
  ];

  const second = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ev:cancel:${event.id}`)
      .setLabel('Event absagen')
      .setStyle(ButtonStyle.Secondary),
  );
  if (dashboardUrl) {
    second.addComponents(
      new ButtonBuilder()
        .setLabel('Comp bearbeiten')
        .setStyle(ButtonStyle.Link)
        .setURL(`${dashboardUrl}/events/${event.id}`),
    );
  }
  rows.push(second);

  return rows;
}

/** Ping-Nachricht beim Einfrieren: jeder erfaehrt, was er spielt. */
export function buildLockMessage(event, composition, pingRoleId) {
  const lines = [];
  if (pingRoleId) lines.push(`<@&${pingRoleId}>`);
  lines.push(`**${event.title || event.comp_name}** startet gleich — die Aufstellung steht:`);
  lines.push('');

  for (const slot of composition.slots) {
    if (!slot.discordId) continue;
    lines.push(`<@${slot.discordId}> → **${slot.weaponName}**`);
  }

  const missing = composition.slots.filter((s) => !s.discordId);
  if (missing.length) {
    const grouped = new Map();
    for (const slot of missing) {
      grouped.set(slot.weaponName, (grouped.get(slot.weaponName) ?? 0) + 1);
    }
    lines.push('');
    lines.push(
      `⚠️ Noch offen: ${[...grouped].map(([weapon, count]) => `${count}× ${weapon}`).join(', ')}`,
    );
  }

  if (composition.bench.length) {
    lines.push('');
    lines.push(`Bank: ${composition.bench.map((p) => `<@${p.discordId}>`).join(' ')}`);
  }

  // Discord erlaubt 2000 Zeichen pro Nachricht
  const text = lines.join('\n');
  return text.length > 1990 ? `${text.slice(0, 1980)}\n…` : text;
}

/** Billiger Hash, um das Embed nur bei echten Aenderungen neu zu schreiben. */
export function hashComposition(event, composition, maybes) {
  const parts = [
    event.status,
    String(event.starts_at),
    ...composition.slots.map((s) => `${s.slotIndex}:${s.discordId ?? '-'}:${s.rating ?? '-'}`),
    ...composition.bench.map((p) => p.discordId),
    ...maybes.map((m) => m.discord_id),
  ];
  const input = parts.join('|');

  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash * 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
