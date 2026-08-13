import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';

import {
  cancelEvent,
  createEvent,
  getComps,
  getDefaultLockMinutes,
  hasGuildAccess,
  getOpenEvents,
  getPlayerWeapons,
  getWeapons,
  loadEventState,
  lockEvent,
  removeSignup,
  saveAssignments,
  setMessageId,
  setRating,
  setRenderHash,
  setSignup,
  sql,
  secondsSinceLastHeartbeat,
  touchBotStatus,
  upsertGuild,
  upsertPlayer,
} from './db.js';
import {
  adjustBalance,
  buildLeaderboard,
  canManageBalance,
  getBalance,
  isBalanceEnabled,
  parseAmount,
  PREFIX,
  renderBalance,
  renderBooking,
  resolveMember,
} from './balance.js';
import { buildComposition } from './matching.js';
import { handleQuestionnaire, renderQuestionnaire } from './profile.js';
import { buildEventButtons, buildEventEmbed, buildLockMessage, hashComposition } from './render.js';
import { discordTime, parseStartTime, TIMEZONE } from './time.js';

const TOKEN = requireEnv('DISCORD_TOKEN');
const CLIENT_ID = requireEnv('DISCORD_CLIENT_ID');
requireEnv('DATABASE_URL');
// Optional: ohne Angabe registriert der Bot seine Befehle auf jedem Server,
// auf dem er ist - und automatisch, sobald er auf einen neuen eingeladen wird.
const GUILD_ID = process.env.DISCORD_GUILD_ID || null;
const DASHBOARD_URL = (process.env.DASHBOARD_URL || '').replace(/\/$/, '');
const PING_ROLE_ID = process.env.PING_ROLE_ID || null;
// Gilt auf ALLEN Servern - gedacht fuer den Betreiber des Bots. Wer nur auf
// einem bestimmten Server Offizier sein soll, wird im Dashboard unter
// "Zugang" eingetragen.
const SUPERADMIN_IDS = new Set(
  (process.env.OFFICER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

const POLL_INTERVAL_MS = 5000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} fehlt in der .env - siehe .env.example.`);
    process.exit(1);
  }
  return value;
}

// MessageContent ist eine privilegierte Berechtigung und muss im Developer
// Portal eingeschaltet sein. Sie wird nur fuer die !-Befehle gebraucht - die
// Slash-Befehle laufen auch ohne.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ---------------------------------------------------------------------
//  Slash-Commands
// ---------------------------------------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName('timer')
    .setDescription('Erstellt einen Timer mit Anmeldung und automatischer Aufstellung')
    .addStringOption((option) =>
      option
        .setName('comp')
        .setDescription('Welche Comp gespielt wird')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('zeit')
        .setDescription('20:30 · 2030 · 20 · +45 · 90m · 2h · 14.08 20:30')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('titel').setDescription('Überschrift, sonst der Comp-Name'),
    )
    .addIntegerOption((option) =>
      option
        .setName('lock')
        .setDescription('Minuten vor Start, ab denen die Aufstellung steht (sonst der Server-Standard)')
        .setMinValue(0)
        .setMaxValue(180),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Zeigt die Gold-Rangliste dieses Servers')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Gold ansehen, vergeben oder abziehen')
    .addSubcommand((sub) =>
      sub
        .setName('zeigen')
        .setDescription('Kontostand ansehen')
        .addUserOption((option) =>
          option.setName('spieler').setDescription('Wessen Stand, sonst deiner'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('geben')
        .setDescription('Gold gutschreiben')
        .addUserOption((option) =>
          option.setName('spieler').setDescription('Wer bekommt es').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('menge').setDescription('z.B. 500, 1.5k oder 2m').setRequired(true),
        )
        .addStringOption((option) => option.setName('grund').setDescription('Wofür')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('abziehen')
        .setDescription('Gold abziehen')
        .addUserOption((option) =>
          option.setName('spieler').setDescription('Von wem').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('menge').setDescription('z.B. 500, 1.5k oder 2m').setRequired(true),
        )
        .addStringOption((option) => option.setName('grund').setDescription('Warum')),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('waffen')
    .setDescription('Trag ein, welche Waffen du spielen kannst und wie gut')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('waffe')
    .setDescription('Einzelne Waffe schnell setzen oder entfernen')
    .addStringOption((option) =>
      option
        .setName('waffe')
        .setDescription('Welche Waffe')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('skill')
        .setDescription('1 bis 10, oder 0 zum Entfernen')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(10),
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommandsOn(guildId) {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
}

async function registerCommands() {
  const targets = GUILD_ID ? [GUILD_ID] : [...client.guilds.cache.keys()];

  if (targets.length === 0) {
    console.log(
      'Der Bot ist auf keinem Server. Lade ihn im Dashboard unter "Server wählen" ein, ' +
        'die Befehle kommen dann von selbst.',
    );
    return;
  }

  for (const guildId of targets) {
    try {
      await registerCommandsOn(guildId);
    } catch (error) {
      console.error(`Befehle konnten auf Server ${guildId} nicht registriert werden:`, error.message);
    }
  }
  console.log(`Slash-Commands registriert auf ${targets.length} Server(n).`);
}

// ---------------------------------------------------------------------
//  Berechnung + Anzeige
// ---------------------------------------------------------------------

/**
 * Rechnet die Aufstellung neu, schreibt sie in die DB und aktualisiert das
 * Embed - letzteres nur, wenn sich tatsaechlich etwas geaendert hat.
 */
async function refreshEvent(eventId, { force = false } = {}) {
  const state = await loadEventState(eventId);
  if (!state) return null;

  const { event, slots, signups, ratings, people } = state;

  const ratingsByPlayer = new Map();
  for (const row of ratings) {
    if (!ratingsByPlayer.has(row.discord_id)) ratingsByPlayer.set(row.discord_id, new Map());
    ratingsByPlayer.get(row.discord_id).set(row.weapon_id, row.rating);
  }

  const directory = new Map(
    people.map((p) => [
      p.discord_id,
      { displayName: p.display_name, ratings: ratingsByPlayer.get(p.discord_id) ?? new Map() },
    ]),
  );

  const attending = signups.filter((s) => s.status === 'yes');
  const maybes = signups.filter((s) => s.status === 'maybe');

  const players = attending.map((s) => ({
    discordId: s.discord_id,
    displayName: s.display_name,
    ratings: ratingsByPlayer.get(s.discord_id) ?? new Map(),
  }));

  const slotInput = slots.map((s) => ({
    slotIndex: s.slot_index,
    weaponId: s.weapon_id,
    weaponName: s.weapon_name,
    category: s.category,
    icon: s.icon,
    priority: s.priority,
    label: s.label,
    lockedDiscordId: s.locked_discord_id,
  }));

  const composition = buildComposition(slotInput, players, directory);
  await saveAssignments(eventId, composition.slots);

  const hash = hashComposition(event, composition, maybes);
  if (!force && hash === event.render_hash) {
    return { event, composition, maybes, changed: false };
  }

  await updateMessage(event, composition, maybes);
  await setRenderHash(eventId, hash);
  return { event, composition, maybes, changed: true };
}

async function updateMessage(event, composition, maybes) {
  if (!event.message_id) return;
  try {
    const channel = await client.channels.fetch(event.channel_id);
    const message = await channel.messages.fetch(event.message_id);
    await message.edit({
      embeds: [buildEventEmbed(event, composition, maybes)],
      components: buildEventButtons(event, DASHBOARD_URL),
    });
  } catch (error) {
    // Nachricht geloescht oder Kanal weg - Event stilllegen statt endlos weiterprobieren
    if (error?.code === 10008 || error?.code === 10003) {
      console.warn(`Nachricht zu Event #${event.id} nicht mehr da - Event wird abgesagt.`);
      await cancelEvent(event.id);
      return;
    }
    console.error(`Embed zu Event #${event.id} konnte nicht aktualisiert werden:`, error.message);
  }
}

/** Friert die Aufstellung ein und pingt alle mit ihrer Rolle. */
async function lockAndAnnounce(eventId) {
  await lockEvent(eventId);
  const result = await refreshEvent(eventId, { force: true });
  if (!result) return;

  const { event, composition } = result;
  try {
    const channel = await client.channels.fetch(event.channel_id);
    await channel.send({
      content: buildLockMessage(event, composition, PING_ROLE_ID),
      allowedMentions: { parse: ['users', 'roles'] },
      reply: event.message_id ? { messageReference: event.message_id, failIfNotExists: false } : undefined,
    });
    console.log(`Event #${eventId} eingefroren: ${composition.filled}/${composition.total} besetzt.`);
  } catch (error) {
    console.error(`Ping für Event #${eventId} fehlgeschlagen:`, error.message);
  }
}

// ---------------------------------------------------------------------
//  Poll-Schleife
//
//  Der Bot fragt die Datenbank regelmaessig ab statt Timer im Speicher zu
//  halten. So ueberleben laufende Events einen Neustart des Bots - im
//  Free-Tier passiert das oefter.
// ---------------------------------------------------------------------
let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await touchBotStatus(client.user.tag, [...client.guilds.cache.keys()]);

    const events = await getOpenEvents();
    for (const event of events) {
      const lockAt = new Date(event.starts_at).getTime() - event.lock_minutes * 60_000;
      if (Date.now() >= lockAt) {
        await lockAndAnnounce(event.id);
      } else {
        await refreshEvent(event.id);
      }
    }
  } catch (error) {
    console.error('Poll-Durchlauf fehlgeschlagen:', error.message);
  } finally {
    ticking = false;
  }
}

// ---------------------------------------------------------------------
//  Interaktionen
// ---------------------------------------------------------------------
/**
 * Darf die Person auf diesem Server Timer erstellen und ins Dashboard?
 * Drei Wege: das Discord-Recht "Server verwalten", ein Eintrag in der
 * Zugangsliste dieses Servers, oder Betreiber des Bots.
 */
async function isOfficer(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (SUPERADMIN_IDS.has(interaction.user.id)) return true;
  if (!interaction.guildId) return false;
  return hasGuildAccess(interaction.guildId, interaction.user.id);
}

function displayNameOf(interaction) {
  return (
    interaction.member?.nickname ||
    interaction.user.globalName ||
    interaction.user.username
  );
}

/**
 * Fehler, bei denen Discord die Interaktion schon verworfen hat. Passiert,
 * wenn eine Antwort laenger als drei Sekunden braucht - etwa weil die
 * Datenbank gerade traege ist. Nichts, was man reparieren koennte, und
 * erst recht kein Grund, den Bot zu beenden.
 */
const VERFALLEN = new Set([
  10062, // Unknown interaction
  10008, // Unknown message
  40060, // Interaction has already been acknowledged
]);

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Das "await" ist wichtig: ohne es liefe ein Fehler aus diesen Funktionen
    // am catch vorbei und wuerde den Prozess beenden.
    if (interaction.isAutocomplete()) return await handleAutocomplete(interaction);
    if (interaction.isChatInputCommand()) return await handleCommand(interaction);

    // Fragebogen zuerst - der bringt eigene Knoepfe und Auswahlmenues mit
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
      if (await handleQuestionnaire(interaction)) return undefined;
    }
    if (interaction.isButton()) return await handleButton(interaction);
  } catch (error) {
    if (VERFALLEN.has(error?.code)) {
      console.warn(`Interaktion war schon abgelaufen (${error.code}) - ignoriert.`);
      return undefined;
    }

    console.error('Interaktion fehlgeschlagen:', error);
    const payload = { content: `Fehler: ${error.message}`, flags: MessageFlags.Ephemeral };
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
  return undefined;
});

// Letztes Netz: ein Fehler aus der Discord-Bibliothek darf den Bot nicht
// beenden. Ohne diesen Zuhoerer wirft Node bei einem "error"-Ereignis.
client.on(Events.Error, (error) => {
  console.error('Discord-Client-Fehler:', error.message);
});

client.on(Events.ShardError, (error) => {
  console.error('Verbindungsfehler zu Discord:', error.message);
});

async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const query = focused.value.toLowerCase();

  if (interaction.commandName === 'timer' && focused.name === 'comp') {
    const comps = await getComps(interaction.guildId);
    await interaction.respond(
      comps
        .filter((c) => c.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((c) => ({ name: `${c.name} (${c.size} Slots)`, value: String(c.id) })),
    );
    return;
  }

  if (interaction.commandName === 'waffe' && focused.name === 'waffe') {
    const weapons = await getWeapons();
    // Kurzformen mitdurchsuchen, damit "GH" auch "Great Holy Staff" findet
    await interaction.respond(
      weapons
        .filter((weapon) =>
          [weapon.name, ...(weapon.aliases ?? [])].join(' ').toLowerCase().includes(query),
        )
        .slice(0, 25)
        .map((weapon) => ({ name: weapon.name, value: String(weapon.id) })),
    );
  }
}

/** Gemeinsame Absage, wenn das Balance-Board auf dem Server aus ist. */
const BALANCE_AUS =
  'Das Balance-Board ist auf diesem Server nicht aktiv. Ein Offizier kann es im Dashboard unter „Balance" einschalten.';

async function handleCommand(interaction) {
  if (interaction.commandName === 'leaderboard') {
    if (!(await isBalanceEnabled(interaction.guildId))) {
      await interaction.reply({ content: BALANCE_AUS, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply(await buildLeaderboard(interaction.guildId, 0, interaction.guild?.name));
    return;
  }

  if (interaction.commandName === 'balance') {
    if (!(await isBalanceEnabled(interaction.guildId))) {
      await interaction.reply({ content: BALANCE_AUS, flags: MessageFlags.Ephemeral });
      return;
    }

    const unterbefehl = interaction.options.getSubcommand();

    if (unterbefehl === 'zeigen') {
      const ziel = interaction.options.getUser('spieler') ?? interaction.user;
      const saldo = await getBalance(interaction.guildId, ziel.id);
      await interaction.reply({
        embeds: [renderBalance(ziel.id, saldo, ziel.id === interaction.user.id)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const darf = await canManageBalance(
      interaction.guildId,
      interaction.user.id,
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false,
    );
    if (!darf) {
      await interaction.reply({
        content: 'Du darfst kein Gold vergeben. Wer das darf, steht im Dashboard unter „Balance".',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const ziel = interaction.options.getUser('spieler', true);
    const menge = parseAmount(interaction.options.getString('menge', true));
    if (menge === null) {
      await interaction.reply({
        content: 'Die Menge verstehe ich nicht. Möglich sind z.B. `500`, `1.5k` oder `2m`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const abziehen = unterbefehl === 'abziehen';
    const grund = interaction.options.getString('grund');
    const mitglied = await interaction.guild.members.fetch(ziel.id).catch(() => null);

    const saldo = await adjustBalance({
      guildId: interaction.guildId,
      discordId: ziel.id,
      displayName: mitglied?.nickname || ziel.globalName || ziel.username,
      delta: abziehen ? -menge : menge,
      reason: grund,
      byId: interaction.user.id,
      byName: displayNameOf(interaction),
    });

    await interaction.reply({
      embeds: [renderBooking({ menge, abziehen, zielId: ziel.id, saldo, grund })],
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (interaction.commandName === 'waffen') {
    await upsertPlayer(interaction.guildId, interaction.user.id, displayNameOf(interaction));
    const view = await renderQuestionnaire(interaction.guildId, interaction.user.id);
    await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'waffe') {
    await upsertPlayer(interaction.guildId, interaction.user.id, displayNameOf(interaction));

    const weaponId = Number(interaction.options.getString('waffe', true));
    const skill = interaction.options.getInteger('skill', true);
    const weapons = await getWeapons();
    const weapon = weapons.find((entry) => entry.id === weaponId);

    if (!weapon) {
      await interaction.reply({
        content: 'Bitte eine Waffe aus der Vorschlagsliste auswählen.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await setRating(interaction.guildId, interaction.user.id, weaponId, skill === 0 ? null : skill);
    const ratings = await getPlayerWeapons(interaction.guildId, interaction.user.id);

    await interaction.reply({
      content:
        skill === 0
          ? `**${weapon.name}** aus deinem Profil entfernt. Du hast jetzt ${ratings.size} Waffen.`
          : `**${weapon.name}** auf \`${skill}\` gesetzt. Du hast jetzt ${ratings.size} Waffen.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName !== 'timer') return;

  if (!(await isOfficer(interaction))) {
    await interaction.reply({
      content: 'Nur Offiziere können Timer erstellen.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const compValue = interaction.options.getString('comp', true);
  const compId = Number(compValue);
  if (!Number.isInteger(compId)) {
    await interaction.reply({
      content: 'Bitte eine Comp aus der Vorschlagsliste auswählen.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const startsAt = parseStartTime(interaction.options.getString('zeit', true));
  // Ohne Angabe der Standard dieses Servers - im Dashboard einstellbar,
  // damit eine Gilde, die immer mit 15 Minuten faehrt, sie nicht jedes Mal
  // mittippen muss.
  const lockMinutes =
    interaction.options.getInteger('lock') ?? (await getDefaultLockMinutes(interaction.guildId));

  if (startsAt.getTime() <= Date.now()) {
    await interaction.reply({
      content: 'Die Startzeit liegt in der Vergangenheit.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const comps = await getComps(interaction.guildId);
  const comp = comps.find((c) => c.id === compId);
  if (!comp) {
    await interaction.reply({ content: 'Diese Comp gibt es nicht mehr.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const event = await createEvent({
    compId,
    compName: comp.name,
    title: interaction.options.getString('titel'),
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    startsAt,
    lockMinutes,
    createdBy: interaction.user.id,
  });

  const composition = { slots: [], bench: [], filled: 0, total: event.slotCount };
  const state = await loadEventState(event.id);
  const emptySlots = state.slots.map((s) => ({
    slotIndex: s.slot_index,
    weaponId: s.weapon_id,
    weaponName: s.weapon_name,
    category: s.category,
    priority: s.priority,
    label: s.label,
    discordId: null,
    rating: null,
    locked: false,
  }));
  composition.slots = emptySlots;

  const message = await interaction.channel.send({
    embeds: [buildEventEmbed(event, composition, [])],
    components: buildEventButtons(event, DASHBOARD_URL),
  });

  await setMessageId(event.id, message.id);
  await refreshEvent(event.id, { force: true });

  // Die verstandene Zeit zurueckspiegeln. Wer "2030" tippt und "20:30" liest,
  // merkt einen Vertipper sofort - vorher stand hier nur die Slot-Zahl.
  const bestaetigung = [
    `Timer erstellt: **${comp.name}**, ${event.slotCount} Slots.`,
    `Start ${discordTime(startsAt, 'F')} (${discordTime(startsAt, 'R')}).`,
  ];

  // Sperrfrist laenger als der Vorlauf: die Aufstellung steht praktisch
  // sofort, und niemand kommt zum Anmelden. Anlegen tun wir den Timer
  // trotzdem - es kann gewollt sein -, aber ungesagt bleibt es nicht.
  const vorlaufMs = startsAt.getTime() - Date.now();
  const sperreMs = lockMinutes * 60_000;
  if (sperreMs >= vorlaufMs - 60_000) {
    const vorlaufMin = Math.max(1, Math.round(vorlaufMs / 60_000));
    bestaetigung.push(
      `⚠️ Die Sperrfrist von ${lockMinutes} Min ist fast so lang wie der Vorlauf von ${vorlaufMin} Min — ` +
        `die Aufstellung friert sofort ein. Mit \`lock:0\` bleibt sie bis zum Start offen.`,
    );
  }

  await interaction.editReply(bestaetigung.join('\n'));
}

async function handleButton(interaction) {
  const [kind, action, rawEventId] = interaction.customId.split(':');
  const eventId = Number(rawEventId);

  if (kind === 'lb') {
    const seite = Number(action);
    await interaction.update(
      await buildLeaderboard(interaction.guildId, Number.isFinite(seite) ? seite : 0, interaction.guild?.name),
    );
    return;
  }

  if (kind === 'ev' && action === 'cancel') {
    const [event] = await sql`select created_by from event where id = ${eventId}`;
    if (!event) {
      await interaction.reply({ content: 'Event nicht gefunden.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (event.created_by !== interaction.user.id && !(await isOfficer(interaction))) {
      await interaction.reply({
        content: 'Absagen darf nur, wer den Timer erstellt hat.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferUpdate();
    await cancelEvent(eventId);
    await refreshEvent(eventId, { force: true });
    return;
  }

  if (kind !== 'su') return;

  const [event] = await sql`select status from event where id = ${eventId}`;
  if (!event) {
    await interaction.reply({ content: 'Event nicht gefunden.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (event.status !== 'open') {
    await interaction.reply({
      content: 'Die Anmeldung ist zu - die Aufstellung steht schon.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const name = displayNameOf(interaction);
  await upsertPlayer(interaction.guildId, interaction.user.id, name);

  if (action === 'out') {
    await removeSignup(eventId, interaction.user.id);
  } else {
    await setSignup(eventId, interaction.user.id, name, action);
  }

  await interaction.deferUpdate();
  const result = await refreshEvent(eventId, { force: true });

  if (action === 'yes' && result) {
    const mine = result.composition.slots.find((s) => s.discordId === interaction.user.id);
    const hasProfile = result.composition.bench
      .concat(result.composition.slots)
      .some((entry) => entry.discordId === interaction.user.id);

    let hint;
    if (mine) {
      hint = `Angemeldet. Stand jetzt spielst du **${mine.weaponName}**. Das kann sich bis zum Einfrieren noch ändern.`;
    } else if (hasProfile) {
      hint = 'Angemeldet - aktuell reicht es nur für die Bank.';
    } else {
      hint =
        'Angemeldet. Du hast aber noch kein Waffenprofil — tipp `/waffen`, sonst kannst du keiner Rolle zugeordnet werden.';
    }
    await interaction.followUp({ content: hint, flags: MessageFlags.Ephemeral });
  }
}

// ---------------------------------------------------------------------
//  Befehle mit Ausrufezeichen
//
//  Dasselbe wie /balance und /leaderboard, nur getippt. Braucht die
//  MessageContent-Berechtigung; fehlt die, kommen hier schlicht keine
//  Nachrichten an und die Slash-Befehle funktionieren trotzdem.
// ---------------------------------------------------------------------

/** Zerlegt "add \"Name\" 500 Grund" in seine Teile, Anfuehrungszeichen inklusive. */
function naechstesWort(text) {
  const treffer = String(text).match(/^(?:"([^"]*)"|'([^']*)'|(\S+))\s*([\s\S]*)$/);
  if (!treffer) return { wort: null, rest: '' };
  return { wort: treffer[1] ?? treffer[2] ?? treffer[3] ?? null, rest: treffer[4] ?? '' };
}

async function handlePrefixCommand(message) {
  const { wort: befehl, rest } = naechstesWort(message.content.slice(PREFIX.length).trim());
  const name = (befehl || '').toLowerCase();
  if (!['balance', 'bal', 'leaderboard', 'lb'].includes(name)) return;

  if (!(await isBalanceEnabled(message.guildId))) {
    await message.reply(BALANCE_AUS);
    return;
  }

  if (name === 'leaderboard' || name === 'lb') {
    await message.reply(await buildLeaderboard(message.guildId, 0, message.guild?.name));
    return;
  }

  const { wort: unterbefehl, rest: argumente } = naechstesWort(rest);
  const aktion = (unterbefehl || '').toLowerCase();

  // Ohne add/remove: Kontostand anzeigen
  if (aktion !== 'add' && aktion !== 'remove') {
    const erwaehnt = message.mentions.users.first();
    const ziel = erwaehnt ?? message.author;
    const saldo = await getBalance(message.guildId, ziel.id);
    await message.reply({
      embeds: [renderBalance(ziel.id, saldo, ziel.id === message.author.id)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const darf = await canManageBalance(
    message.guildId,
    message.author.id,
    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ?? false,
  );
  if (!darf) {
    await message.reply('Du darfst kein Gold vergeben. Wer das darf, steht im Dashboard unter „Balance".');
    return;
  }

  const { wort: zielRoh, rest: nachZiel } = naechstesWort(argumente);
  const ziel = await resolveMember(message, zielRoh);
  if (ziel.fehler) {
    await message.reply(ziel.fehler);
    return;
  }

  const { wort: mengeRoh, rest: grundRoh } = naechstesWort(nachZiel);
  const menge = parseAmount(mengeRoh);
  if (menge === null) {
    await message.reply(
      'Die Menge verstehe ich nicht. Möglich sind z.B. `500`, `1.5k` oder `2m`.\n' +
        `Beispiel: \`${PREFIX}balance add @Name 500 Castle-Fight\``,
    );
    return;
  }

  const abziehen = aktion === 'remove';
  const grund = grundRoh.trim() || null;

  const saldo = await adjustBalance({
    guildId: message.guildId,
    discordId: ziel.id,
    displayName: ziel.name,
    delta: abziehen ? -menge : menge,
    reason: grund,
    byId: message.author.id,
    byName: message.member?.nickname || message.author.globalName || message.author.username,
  });

  await message.reply({
    embeds: [renderBooking({ menge, abziehen, zielId: ziel.id, saldo, grund })],
    allowedMentions: { parse: [] },
  });
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guildId) return;
  if (!message.content.startsWith(PREFIX)) return;

  try {
    await handlePrefixCommand(message);
  } catch (error) {
    console.error('Befehl fehlgeschlagen:', error);
    await message.reply(`Fehler: ${error.message}`).catch(() => {});
  }
});

// ---------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------
// Events.ClientReady heisst je nach discord.js-Version "ready" oder "clientReady" -
// ueber die Konstante trifft es in beiden Faellen zu.
// Frisch eingeladen? Dann sofort die Befehle nachziehen, damit man nicht
// erst den Bot neu starten muss.
client.on(Events.GuildCreate, async (guild) => {
  if (GUILD_ID && guild.id !== GUILD_ID) return;
  try {
    await upsertGuild(guild.id, guild.name, guild.icon);
    await registerCommandsOn(guild.id);
    console.log(`Auf "${guild.name}" (${guild.id}) eingeladen — Befehle registriert.`);
  } catch (error) {
    console.error(`Befehle auf "${guild.name}" fehlgeschlagen:`, error.message);
  }
});

/** Traegt alle Server ein, auf denen der Bot gerade ist. */
async function syncGuilds() {
  for (const guild of client.guilds.cache.values()) {
    try {
      await upsertGuild(guild.id, guild.name, guild.icon);
    } catch (error) {
      console.error(`Server "${guild.name}" konnte nicht eingetragen werden:`, error.message);
    }
  }
}

/**
 * Warnt, wenn anderswo noch ein Bot mit demselben Token laeuft.
 *
 * Zwei Instanzen sind kein theoretisches Problem: sie schreiben dieselbe
 * Timer-Nachricht abwechselnd in ihrem eigenen Stand um, und bei jeder
 * Anmeldung gewinnt eine, die andere bekommt "Interaktion abgelaufen".
 * Von aussen sieht das aus wie ein kaputter Bot.
 *
 * Nur eine Warnung, kein Abbruch: beim Neustart auf dem Hoster ist das
 * Lebenszeichen der eben beendeten Instanz zwangslaeufig noch frisch.
 */
async function warnBeiZweitemBot() {
  try {
    const alter = await secondsSinceLastHeartbeat();
    if (alter == null || alter > 15) return;

    console.warn(
      `Achtung: vor ${alter.toFixed(0)}s hat schon ein Bot mit diesem Token ein Lebenszeichen geschrieben.\n` +
        '  Läuft der noch, schreiben euch beide die Timer-Nachrichten um und streiten sich um jede Anmeldung.\n' +
        '  Bei einem Neustart ist das normal und verschwindet von selbst.',
    );
  } catch (error) {
    console.error('Konnte nicht prüfen, ob ein zweiter Bot läuft:', error.message);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Eingeloggt als ${client.user.tag} · Zeitzone ${TIMEZONE}`);
  await warnBeiZweitemBot();
  await syncGuilds();
  await registerCommands();

  // Waffenliste und Datenbankverbindung vorwaermen. Discord verwirft
  // Autovervollstaendigungen nach drei Sekunden - die erste Anfrage darf
  // also nicht auf einen kalten Verbindungsaufbau warten.
  try {
    const start = Date.now();
    const weapons = await getWeapons();
    console.log(`Waffenliste geladen: ${weapons.length} Stueck in ${Date.now() - start} ms`);
  } catch (error) {
    console.error('Waffenliste konnte nicht vorgeladen werden:', error.message);
  }

  // Nach einem Neustart alle laufenden Events wieder aufnehmen
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
});

process.on('unhandledRejection', (error) => {
  console.error('Unbehandelter Fehler:', error);
});

client.login(TOKEN);
