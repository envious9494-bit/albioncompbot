import assert from 'node:assert/strict';
import test from 'node:test';

import { buildComposition, hungarianMin } from '../src/matching.js';

const HEAVY_MACE = 1;
const GREAT_HOLY = 2;
const SPIRITHUNTER = 3;

function slot(slotIndex, weaponId, priority = 3, extra = {}) {
  return { slotIndex, weaponId, weaponName: `W${weaponId}`, category: 'DPS', priority, label: null, lockedDiscordId: null, ...extra };
}

function player(id, name, ratings) {
  return { discordId: id, displayName: name, ratings: new Map(Object.entries(ratings).map(([k, v]) => [Number(k), v])) };
}

test('hungarianMin findet das Minimum', () => {
  const cost = [
    [4, 1, 3],
    [2, 0, 5],
    [3, 2, 2],
  ];
  const result = hungarianMin(cost);
  const total = result.reduce((sum, col, row) => sum + cost[row][col], 0);
  assert.equal(total, 5); // 4 + 0 + ... bzw. 3 + 0 + 2
  assert.equal(new Set(result).size, 3, 'jede Spalte genau einmal');
});

test('das globale Optimum schlaegt die gierige Zuordnung', () => {
  // Anna ist auf beidem stark, Ben kann nur Heal. Gierig wuerde Anna auf den
  // Tank-Slot gehen und Ben auf Heal - unterm Strich schlechter, als wenn Anna
  // heilt und Ben ... nicht spielen kann. Der Algorithmus muss die Variante
  // waehlen, die in Summe am meisten Skill auf das Feld bringt.
  const slots = [slot(0, HEAVY_MACE), slot(1, GREAT_HOLY)];
  const players = [
    player('anna', 'Anna', { [HEAVY_MACE]: 9, [GREAT_HOLY]: 10 }),
    player('ben', 'Ben', { [HEAVY_MACE]: 7 }),
  ];

  const result = buildComposition(slots, players);
  const tank = result.slots.find((s) => s.weaponId === HEAVY_MACE);
  const heal = result.slots.find((s) => s.weaponId === GREAT_HOLY);

  assert.equal(tank.discordId, 'ben');
  assert.equal(heal.discordId, 'anna');
  assert.equal(result.filled, 2);
});

test('wer die Waffe nicht im Profil hat, wird nie zugeordnet', () => {
  const slots = [slot(0, HEAVY_MACE), slot(1, GREAT_HOLY)];
  const players = [player('cara', 'Cara', { [SPIRITHUNTER]: 10 })];

  const result = buildComposition(slots, players);

  assert.equal(result.filled, 0);
  assert.equal(result.bench.length, 1);
  assert.equal(result.bench[0].discordId, 'cara');
});

test('Prioritaet entscheidet, welcher Slot leer bleibt', () => {
  // Nur ein Spieler fuer zwei Slots, die er beide kann.
  // Der wichtigere Slot (Prio 1) muss gewinnen.
  const slots = [slot(0, HEAVY_MACE, 5), slot(1, GREAT_HOLY, 1)];
  const players = [player('dana', 'Dana', { [HEAVY_MACE]: 8, [GREAT_HOLY]: 8 })];

  const result = buildComposition(slots, players);

  assert.equal(result.slots[0].discordId, null);
  assert.equal(result.slots[1].discordId, 'dana');
});

test('festgenagelte Slots bleiben stehen, der Rest rechnet drumherum', () => {
  const slots = [
    slot(0, HEAVY_MACE, 3, { lockedDiscordId: 'ben' }),
    slot(1, GREAT_HOLY),
  ];
  const players = [
    player('anna', 'Anna', { [HEAVY_MACE]: 10, [GREAT_HOLY]: 6 }),
    player('ben', 'Ben', { [HEAVY_MACE]: 3, [GREAT_HOLY]: 9 }),
  ];

  const result = buildComposition(slots, players);

  assert.equal(result.slots[0].discordId, 'ben', 'Lock hat Vorrang vor dem Optimum');
  assert.equal(result.slots[0].locked, true);
  assert.equal(result.slots[1].discordId, 'anna');
});

test('Ueberzaehlige landen nach Skill sortiert auf der Bank', () => {
  const slots = [slot(0, GREAT_HOLY)];
  const players = [
    player('anna', 'Anna', { [GREAT_HOLY]: 5 }),
    player('ben', 'Ben', { [GREAT_HOLY]: 9 }),
    player('cara', 'Cara', { [GREAT_HOLY]: 7 }),
  ];

  const result = buildComposition(slots, players);

  assert.equal(result.slots[0].discordId, 'ben');
  assert.deepEqual(result.bench.map((p) => p.discordId), ['cara', 'anna']);
});

test('20er-Comp mit 30 Anmeldungen laeuft durch', () => {
  const weapons = [HEAVY_MACE, GREAT_HOLY, SPIRITHUNTER];
  const slots = Array.from({ length: 20 }, (_, i) => slot(i, weapons[i % 3], (i % 5) + 1));
  const players = Array.from({ length: 30 }, (_, i) =>
    player(`p${i}`, `Spieler ${i}`, {
      [weapons[i % 3]]: (i % 10) + 1,
      [weapons[(i + 1) % 3]]: ((i * 3) % 10) + 1,
    }),
  );

  const result = buildComposition(slots, players);

  assert.equal(result.total, 20);
  assert.equal(result.filled, 20);
  assert.equal(result.bench.length, 10);

  const assigned = result.slots.map((s) => s.discordId);
  assert.equal(new Set(assigned).size, 20, 'niemand steht auf zwei Slots');
});

// ---------------------------------------------------------------------
//  Ein Platz, mehrere zugelassene Waffen
// ---------------------------------------------------------------------

/** Axt (1) oder Realmbreaker (2) - derselbe Platz. */
function austauschbarerSlot(index, extra = {}) {
  return {
    slotIndex: index,
    weaponId: 1,
    weaponIds: [1, 2],
    weaponName: 'Axt',
    priority: 1,
    label: null,
    ...extra,
  };
}

function spieler(id, name, ratings) {
  return { discordId: id, displayName: name, ratings: new Map(ratings) };
}

test('wer nur die Alternative kann, passt trotzdem auf den Platz', () => {
  const ergebnis = buildComposition(
    [austauschbarerSlot(0)],
    [spieler('1', 'Nurrealm', [[2, 8]])],
  );
  assert.equal(ergebnis.slots[0].discordId, '1');
  assert.equal(ergebnis.slots[0].weaponId, 2, 'tritt auf dem Realmbreaker an');
  assert.equal(ergebnis.slots[0].rating, 8);
  assert.equal(ergebnis.bench.length, 0);
});

test('kann jemand beide, zaehlt die bessere', () => {
  const ergebnis = buildComposition(
    [austauschbarerSlot(0)],
    [spieler('1', 'Beides', [[1, 4], [2, 9]])],
  );
  assert.equal(ergebnis.slots[0].weaponId, 2);
  assert.equal(ergebnis.slots[0].rating, 9);
});

test('ein Platz mit Alternativen wird trotzdem nur einmal besetzt', () => {
  const ergebnis = buildComposition(
    [austauschbarerSlot(0)],
    [spieler('1', 'Axt', [[1, 7]]), spieler('2', 'Realm', [[2, 7]])],
  );
  assert.equal(ergebnis.filled, 1);
  assert.equal(ergebnis.total, 1);
  assert.equal(ergebnis.bench.length, 1, 'der zweite sitzt auf der Bank');
});

test('wer keine der zugelassenen Waffen kann, bleibt draussen', () => {
  const ergebnis = buildComposition(
    [austauschbarerSlot(0)],
    [spieler('1', 'Fremd', [[99, 10]])],
  );
  assert.equal(ergebnis.slots[0].discordId, null);
  assert.equal(ergebnis.bench[0].bestRating, 0);
});

test('die Bank kennt auch die Alternativen', () => {
  // Zwei Plaetze, drei Leute: der Uebrige muss als Nachruecker erkannt
  // werden, obwohl er nur die zweite Waffe spielt.
  const ergebnis = buildComposition(
    [austauschbarerSlot(0), austauschbarerSlot(1)],
    [
      spieler('1', 'A', [[1, 9]]),
      spieler('2', 'B', [[1, 8]]),
      spieler('3', 'C', [[2, 6]]),
    ],
  );
  assert.equal(ergebnis.bench.length, 1);
  assert.equal(ergebnis.bench[0].displayName, 'C');
  assert.equal(ergebnis.bench[0].bestRating, 6, 'zaehlt als Nachruecker, nicht als waffenlos');
});
