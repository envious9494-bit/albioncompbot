// =====================================================================
//  Waffen-Fragebogen im Discord
//
//  Ablauf, alles in ephemeren Nachrichten (sieht nur der Spieler selbst):
//    /waffen  ->  Kategorie waehlen
//             ->  ankreuzen, welche Waffen man spielen kann
//             ->  je Waffe den Skill per Knopf 1-10 setzen
//
//  Der Zustand steckt komplett in der Datenbank und in der customId des
//  angeklickten Elements. Es wird nichts im Speicher gehalten - ein
//  Neustart des Bots mitten im Fragebogen macht also nichts kaputt.
// =====================================================================

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';

import { getPlayerWeapons, getWeapons, setRating, syncGroupSelection } from './db.js';

/** Discord laesst nur 25 Optionen pro Auswahlmenue zu. */
const MAX_OPTIONS = 25;
const DEFAULT_RATING = 5;

/**
 * Was die Zahlen bedeuten.
 *
 * Ohne das ist "7" eine Meinung: der eine haelt sich fuer eine 7, der
 * naechste mit demselben Koennen fuer eine 4. Der Bot rechnet aber damit,
 * als waere es dasselbe Mass. Der Schnitt bei 7 ist bewusst gesetzt - ab da
 * steht Fullspec, darunter geht es ums Lernen.
 */
export const SKILL_STUFEN = {
  10: 'Fullspec · beherrsche ich blind',
  9: 'Fullspec · sehr sicher',
  8: 'Fullspec · sitzt',
  7: 'Fullspec · noch am Üben',
  6: 'Specs angefangen, will ich lernen',
  5: 'Grundlagen da, brauche Übung',
  4: 'schon gespielt, aber selten',
  3: 'kaum Erfahrung',
  2: 'nur mal ausprobiert',
  1: 'zur Not, wenn sonst niemand da ist',
};

/** Die Staffelung als Liste, aktuelle Stufe hervorgehoben. */
function skalaAlsText(aktuell) {
  return Object.keys(SKILL_STUFEN)
    .map(Number)
    .sort((a, b) => b - a)
    .map((stufe) => {
      const zeile = `\`${String(stufe).padStart(2)}\` ${SKILL_STUFEN[stufe]}`;
      return stufe === aktuell ? `**${zeile}** ←` : `-# ${zeile}`;
    })
    .join('\n');
}

/**
 * Teilt die Waffenliste in Gruppen von hoechstens 25 auf, Kategorie fuer
 * Kategorie. Grosse Kategorien werden zu "DPS (1/2)", "DPS (2/2)".
 * Die Aufteilung ergibt sich allein aus der Reihenfolge in der Datenbank,
 * ist also bei jedem Aufruf dieselbe.
 */
export function buildGroups(weapons) {
  // Die Reihenfolge kommt aus sort_order in der Datenbank - die Familien
  // erscheinen also in derselben Ordnung wie im Dashboard.
  const byCategory = new Map();
  for (const weapon of weapons) {
    const category = weapon.category || 'Sonstiges';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(weapon);
  }

  const groups = [];
  for (const [category, list] of byCategory) {
    const pages = Math.ceil(list.length / MAX_OPTIONS);
    for (let page = 0; page < pages; page++) {
      groups.push({
        category,
        icon: list[0].icon || null,
        label: pages > 1 ? `${category} (${page + 1}/${pages})` : category,
        weapons: list.slice(page * MAX_OPTIONS, (page + 1) * MAX_OPTIONS),
      });
    }
  }
  return groups;
}

function summarise(weapons, ratings) {
  if (ratings.size === 0) {
    return 'Du hast noch keine Waffe eingetragen. Fang mit einer Kategorie an.';
  }

  const byCategory = new Map();
  for (const weapon of weapons) {
    const rating = ratings.get(weapon.id);
    if (rating == null) continue;
    const category = weapon.category || 'Sonstiges';
    if (!byCategory.has(category)) byCategory.set(category, { icon: weapon.icon, entries: [] });
    byCategory.get(category).entries.push(`${weapon.name} \`${rating}\``);
  }

  const lines = [`**Dein Waffenprofil** — ${ratings.size} Waffen`];
  for (const [, { icon, entries }] of byCategory) {
    lines.push(`${icon || '•'} ${entries.join(' · ')}`);
  }

  const text = lines.join('\n');
  return text.length > 1900 ? `${text.slice(0, 1880)}\n…` : text;
}

function categoryRow(groups, activeIndex) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('wq:cat')
    .setPlaceholder('Kategorie wählen')
    .addOptions(
      groups.slice(0, MAX_OPTIONS).map((group, index) => ({
        label: group.label,
        value: String(index),
        emoji: group.icon ?? undefined,
        default: index === activeIndex,
      })),
    );
  return new ActionRowBuilder().addComponents(menu);
}

function pickRow(group, groupIndex, ratings) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`wq:pick:${groupIndex}`)
    .setPlaceholder('Welche davon kannst du spielen?')
    .setMinValues(0)
    .setMaxValues(group.weapons.length)
    .addOptions(
      group.weapons.map((weapon) => ({
        label: weapon.name,
        value: String(weapon.id),
        default: ratings.has(weapon.id),
      })),
    );
  return new ActionRowBuilder().addComponents(menu);
}

function rateRow(group, groupIndex, ratings) {
  const chosen = group.weapons.filter((weapon) => ratings.has(weapon.id));
  if (chosen.length === 0) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`wq:rate:${groupIndex}`)
    .setPlaceholder('Skill anpassen …')
    .addOptions(
      chosen.map((weapon) => {
        const stufe = ratings.get(weapon.id);
        return {
          label: `${weapon.name} — ${stufe}`,
          // Discord laesst 100 Zeichen zu; die laengste Stufe bleibt darunter.
          description: SKILL_STUFEN[stufe],
          value: String(weapon.id),
        };
      }),
    );
  return new ActionRowBuilder().addComponents(menu);
}

/** Baut die Fragebogen-Nachricht komplett aus dem aktuellen Datenbankstand. */
export async function renderQuestionnaire(guildId, discordId, groupIndex = null) {
  const [weapons, ratings] = await Promise.all([getWeapons(), getPlayerWeapons(guildId, discordId)]);
  const groups = buildGroups(weapons);

  const components = [categoryRow(groups, groupIndex)];
  const lines = [summarise(weapons, ratings)];

  if (groupIndex != null && groups[groupIndex]) {
    const group = groups[groupIndex];
    components.push(pickRow(group, groupIndex, ratings));

    const rating = rateRow(group, groupIndex, ratings);
    if (rating) components.push(rating);

    lines.push('');
    lines.push(
      `**${group.label}** — hak an, was du spielen kannst. Neu angehakte Waffen starten bei ${DEFAULT_RATING}; über das untere Menü stellst du den Skill genau ein.`,
    );
  } else {
    lines.push('');
    lines.push(
      `Skala **1–10**: ab **7** heißt es Fullspec, darunter geht es ums Lernen. ` +
        `Die genaue Bedeutung steht bei jeder Waffe dran.`,
    );
  }

  return { content: lines.join('\n'), components };
}

/** Die Knopfreihen 1-10 fuer eine einzelne Waffe. */
export async function renderRatePrompt(guildId, discordId, weaponId, groupIndex) {
  const [weapons, ratings] = await Promise.all([getWeapons(), getPlayerWeapons(guildId, discordId)]);
  const weapon = weapons.find((entry) => entry.id === weaponId);
  if (!weapon) return renderQuestionnaire(guildId, discordId, groupIndex);

  const current = ratings.get(weaponId);

  const makeRow = (from, to) =>
    new ActionRowBuilder().addComponents(
      Array.from({ length: to - from + 1 }, (_, offset) => {
        const value = from + offset;
        return new ButtonBuilder()
          .setCustomId(`wq:set:${weaponId}:${value}:${groupIndex}`)
          .setLabel(String(value))
          .setStyle(value === current ? ButtonStyle.Primary : ButtonStyle.Secondary);
      }),
    );

  return {
    content: [
      `**${weapon.name}** — wie gut spielst du das?`,
      '',
      skalaAlsText(current),
    ].join('\n'),
    components: [
      makeRow(1, 5),
      makeRow(6, 10),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`wq:back:${groupIndex}`)
          .setLabel('Zurück')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`wq:remove:${weaponId}:${groupIndex}`)
          .setLabel('Kann ich doch nicht')
          .setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

/**
 * Verarbeitet alle Interaktionen des Fragebogens.
 * @returns {boolean} true, wenn die Interaktion hier behandelt wurde
 */
export async function handleQuestionnaire(interaction) {
  const parts = interaction.customId.split(':');
  if (parts[0] !== 'wq') return false;

  const discordId = interaction.user.id;
  const guildId = interaction.guildId;
  const action = parts[1];

  if (action === 'cat') {
    const groupIndex = Number(interaction.values[0]);
    await interaction.update(await renderQuestionnaire(guildId, discordId, groupIndex));
    return true;
  }

  if (action === 'pick') {
    const groupIndex = Number(parts[2]);
    const weapons = await getWeapons();
    const group = buildGroups(weapons)[groupIndex];
    if (!group) {
      await interaction.update(await renderQuestionnaire(guildId, discordId));
      return true;
    }

    const selected = interaction.values.map(Number);
    await syncGroupSelection(
      guildId,
      discordId,
      group.weapons.map((weapon) => weapon.id),
      selected,
      DEFAULT_RATING,
    );

    await interaction.update(await renderQuestionnaire(guildId, discordId, groupIndex));
    return true;
  }

  if (action === 'rate') {
    const groupIndex = Number(parts[2]);
    const weaponId = Number(interaction.values[0]);
    await interaction.update(await renderRatePrompt(guildId, discordId, weaponId, groupIndex));
    return true;
  }

  if (action === 'set') {
    const weaponId = Number(parts[2]);
    const value = Number(parts[3]);
    const groupIndex = Number(parts[4]);
    await setRating(guildId, discordId, weaponId, value);
    await interaction.update(await renderQuestionnaire(guildId, discordId, groupIndex));
    return true;
  }

  if (action === 'remove') {
    const weaponId = Number(parts[2]);
    const groupIndex = Number(parts[3]);
    await setRating(guildId, discordId, weaponId, null);
    await interaction.update(await renderQuestionnaire(guildId, discordId, groupIndex));
    return true;
  }

  if (action === 'back') {
    const groupIndex = Number(parts[2]);
    await interaction.update(await renderQuestionnaire(guildId, discordId, groupIndex));
    return true;
  }

  return false;
}
