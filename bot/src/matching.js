// =====================================================================
//  Zuordnung Spieler -> Slots
//
//  Der naive Weg waere: Slot fuer Slot durchgehen und jeweils den besten
//  freien Spieler nehmen. Das geht regelmaessig schief, weil der beste
//  Healer oft auch der beste Tank ist - wird er zuerst als Tank vergeben,
//  steht auf Heal nur noch eine 4.
//
//  Deshalb wird hier das globale Optimum gesucht: die Zuordnung mit der
//  hoechsten Gesamtsumme ueber alle Slots. Das ist das klassische
//  Zuordnungsproblem, geloest mit dem Ungarischen Algorithmus.
// =====================================================================

/** Prio 1 = wichtigster Slot. Ein Skillpunkt dort wiegt doppelt so viel wie auf Prio 5. */
const PRIORITY_WEIGHT = { 1: 2.0, 2: 1.5, 3: 1.0, 4: 0.8, 5: 0.6 };

const MAX_PROFIT = 10 * 2.0 * 100; // beste denkbare Zelle: Skill 10 auf Prio 1
const IMPOSSIBLE = 1e7;            // Kosten fuer "Spieler hat diese Waffe nicht"

/**
 * Ungarischer Algorithmus (O(n^3), Variante mit Potentialen).
 * Erwartet eine quadratische Kostenmatrix und minimiert die Gesamtkosten.
 *
 * @param {number[][]} cost quadratische Matrix
 * @returns {number[]} Index = Zeile, Wert = zugeordnete Spalte
 */
export function hungarianMin(cost) {
  const n = cost.length;
  if (n === 0) return [];

  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1);   // p[j] = Zeile (1-basiert), die Spalte j belegt
  const way = new Int32Array(n + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(Infinity);
    const used = new Uint8Array(n + 1);

    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const rowToCol = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0) rowToCol[p[j] - 1] = j - 1;
  }
  return rowToCol;
}

/**
 * Stellt die Comp zusammen.
 *
 * @param {Array} slots   [{ slotIndex, weaponId, weaponName, category, priority, label, lockedDiscordId }]
 * @param {Array} players [{ discordId, displayName, ratings: Map<weaponId, rating> }]
 *                        Reihenfolge sollte stabil sein (z.B. nach Anmeldezeit),
 *                        damit das Ergebnis zwischen zwei Berechnungen nicht springt.
 * @param {Map} directory Alle bekannten Spieler, auch nicht angemeldete. Wird nur
 *                        gebraucht, wenn der Leader jemanden festnagelt, der sich
 *                        (noch) nicht angemeldet hat.
 * @returns {{ slots: Array, bench: Array, filled: number, total: number }}
 */
/**
 * Welche zugelassene Waffe kann diese Person am besten?
 *
 * Ein Platz darf mehrere Waffen zulassen - eine Axt oder ein Realmbreaker
 * tun dasselbe. Besetzt wird er trotzdem nur einmal, und zwar auf der
 * Waffe mit dem hoechsten Skill. Wer keine davon im Profil hat, kommt fuer
 * den Platz nicht in Frage.
 *
 * @returns {{weaponId: number, rating: number} | null}
 */
export function besteWaffe(ratings, slot) {
  let beste = null;
  for (const weaponId of erlaubteWaffen(slot)) {
    const rating = ratings.get(weaponId);
    if (rating == null) continue;
    if (!beste || rating > beste.rating) beste = { weaponId, rating };
  }
  return beste;
}

/**
 * Traegt die tatsaechlich gespielte Waffe in den Platz ein - samt Name und
 * Bild. Ohne das zeigte die Aufstellung weiter die erste Wahl an, obwohl
 * die Person mit der Alternative antritt.
 */
function uebernehmeWaffe(slot, weaponId) {
  slot.weaponId = weaponId;
  const option = slot.optionen?.find((o) => o.id === weaponId);
  if (option) {
    slot.weaponName = option.name;
    slot.icon = option.icon ?? slot.icon;
  }
}

/** Alle zugelassenen Waffen eines Platzes, erste Wahl zuerst. */
export function erlaubteWaffen(slot) {
  return slot.weaponIds?.length ? slot.weaponIds : [slot.weaponId];
}

export function buildComposition(slots, players, directory = new Map()) {
  const byId = new Map(players.map((p) => [p.discordId, p]));
  const result = slots.map((s) => ({ ...s, discordId: null, rating: null, locked: false }));

  const takenPlayers = new Set();
  const openSlotIdx = [];

  // --- 1. Vom Leader festgenagelte Slots zuerst -----------------------
  // Die werden aus der Optimierung herausgenommen, der Rest rechnet drumherum.
  result.forEach((slot, i) => {
    const lockedId = slot.lockedDiscordId;
    if (lockedId && !takenPlayers.has(lockedId)) {
      const player = byId.get(lockedId) ?? directory.get(lockedId);
      slot.discordId = lockedId;
      // Auch hier die beste zugelassene Waffe - ein festgenagelter Spieler
      // soll auf der Alternative stehen, wenn er die besser kann.
      const beste = player ? besteWaffe(player.ratings, slot) : null;
      slot.rating = beste?.rating ?? null;
      if (beste) uebernehmeWaffe(slot, beste.weaponId);
      slot.displayName = player ? player.displayName : `Unbekannt (${lockedId})`;
      slot.locked = true;
      takenPlayers.add(lockedId);
    } else {
      openSlotIdx.push(i);
    }
  });

  const pool = players.filter((p) => !takenPlayers.has(p.discordId));

  if (openSlotIdx.length === 0 || pool.length === 0) {
    return finish(result, pool, slots);
  }

  // --- 2. Gewinnmatrix Spieler x Slot ---------------------------------
  const n = Math.max(pool.length, openSlotIdx.length);
  const cost = [];
  const feasible = [];

  for (let i = 0; i < n; i++) {
    const row = new Array(n);
    const feasRow = new Array(n).fill(false);
    const player = i < pool.length ? pool[i] : null;

    for (let j = 0; j < n; j++) {
      const slot = j < openSlotIdx.length ? result[openSlotIdx[j]] : null;

      if (!player || !slot) {
        // Fuellzelle: kostet so viel wie "gar nichts zuordnen"
        row[j] = MAX_PROFIT;
        continue;
      }

      const beste = besteWaffe(player.ratings, slot);
      if (!beste) {
        row[j] = IMPOSSIBLE; // keine zugelassene Waffe im Profil
        continue;
      }

      const weight = PRIORITY_WEIGHT[slot.priority] ?? 1.0;
      row[j] = MAX_PROFIT - beste.rating * weight * 100;
      feasRow[j] = true;
    }
    cost.push(row);
    feasible.push(feasRow);
  }

  // --- 3. Optimum bestimmen -------------------------------------------
  const rowToCol = hungarianMin(cost);

  for (let i = 0; i < pool.length; i++) {
    const j = rowToCol[i];
    if (j < 0 || j >= openSlotIdx.length) continue; // Fuellspalte -> Bank
    if (!feasible[i][j]) continue;                  // erzwungene Notloesung -> verwerfen

    const slot = result[openSlotIdx[j]];
    const player = pool[i];
    const beste = besteWaffe(player.ratings, slot);
    slot.discordId = player.discordId;
    slot.displayName = player.displayName;
    slot.rating = beste?.rating ?? null;
    // Festhalten, auf welcher der zugelassenen Waffen er antritt - genau
    // das steht spaeter im Ping.
    if (beste) uebernehmeWaffe(slot, beste.weaponId);
    takenPlayers.add(player.discordId);
  }

  return finish(result, pool.filter((p) => !takenPlayers.has(p.discordId)), slots);
}

function finish(result, bench, slots) {
  // Bank nach bestem Skill auf einer der gesuchten Waffen sortieren -
  // wer als Erster nachrueckt, steht oben.
  const wantedWeapons = [...new Set(slots.flatMap(erlaubteWaffen))];
  const sortedBench = bench
    .map((p) => {
      let best = 0;
      let bestWeaponId = null;
      for (const wid of wantedWeapons) {
        const r = p.ratings.get(wid) ?? 0;
        if (r > best) {
          best = r;
          bestWeaponId = wid;
        }
      }
      return { ...p, bestRating: best, bestWeaponId };
    })
    .sort((a, b) => b.bestRating - a.bestRating || a.displayName.localeCompare(b.displayName));

  return {
    slots: result,
    bench: sortedBench,
    filled: result.filter((s) => s.discordId).length,
    total: result.length,
  };
}
