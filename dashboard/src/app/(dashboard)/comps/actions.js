'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { sql } from '@/lib/db';
import { requireGuildAction } from '@/lib/guilds';

/** Stellt sicher, dass die Comp zu einem Server gehoert, den man sehen darf. */
async function compDesServers(compId) {
  const [comp] = await sql`select id, guild_id, name from comp where id = ${compId}`;
  if (!comp) throw new Error('Diese Comp gibt es nicht mehr.');
  await requireGuildAction(comp.guild_id);
  return comp;
}

export async function createComp(formData) {
  const guildId = String(formData.get('guild_id') || '');
  const { session } = await requireGuildAction(guildId);

  const name = (formData.get('name') || '').toString().trim();
  if (!name) throw new Error('Die Comp braucht einen Namen.');

  const existing = await sql`
    select id from comp where guild_id = ${guildId} and name = ${name}
  `;
  if (existing.length) throw new Error(`Auf diesem Server gibt es schon eine Comp namens "${name}".`);

  const [comp] = await sql`
    insert into comp (guild_id, name, created_by)
    values (${guildId}, ${name}, ${session.user.discordId})
    returning id
  `;

  revalidatePath('/comps');
  redirect(`/comps/${comp.id}`);
}

export async function deleteComp(formData) {
  const compId = Number(formData.get('comp_id'));
  if (!Number.isInteger(compId)) throw new Error('Unbekannte Comp.');

  await compDesServers(compId);
  await sql`delete from comp where id = ${compId}`;
  revalidatePath('/comps');
}

/**
 * Ersetzt die Slots einer Comp komplett.
 * Laufende Events sind davon nicht betroffen - deren Slots wurden beim
 * Erstellen des Events eingefroren.
 */
export async function saveCompSlots(compId, slots, notes) {
  await compDesServers(compId);

  const clean = [];
  slots.forEach((slot, index) => {
    const weaponId = Number(slot.weaponId);
    const count = Number(slot.count);
    const priority = Number(slot.priority);

    // Frueher sind unvollstaendige Zeilen hier stillschweigend
    // verschwunden. Wer eine 35er-Comp speichert und 33 zurueckbekommt,
    // sucht den Fehler ueberall - nur nicht beim Speichern. Lieber
    // abbrechen und sagen, welche Zeile klemmt.
    const zeile = index + 1;
    if (!Number.isInteger(weaponId) || weaponId <= 0) {
      throw new Error(`Zeile ${zeile}: es ist keine Waffe ausgewählt.`);
    }
    if (!Number.isInteger(count) || count < 1 || count > 40) {
      throw new Error(`Zeile ${zeile}: die Anzahl muss zwischen 1 und 40 liegen.`);
    }
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      throw new Error(`Zeile ${zeile}: die Priorität muss zwischen 1 und 5 liegen.`);
    }

    // Alternativen: gleichwertige Waffen fuer denselben Platz. Doppelte
    // und die erste Wahl selbst fliegen raus - sonst stuende dieselbe
    // Waffe zweimal im Rennen und die Anzeige schriebe "Axt / Axt".
    const alternativen = [...new Set((slot.altWeaponIds ?? []).map(Number))].filter(
      (id) => Number.isInteger(id) && id > 0 && id !== weaponId,
    );

    clean.push({
      comp_id: compId,
      weapon_id: weaponId,
      alt_weapon_ids: alternativen,
      count,
      priority,
      label: (slot.label || '').trim() || null,
      sort_order: index,
    });
  });

  await sql.begin(async (tx) => {
    await tx`update comp set notes = ${notes || null} where id = ${compId}`;
    await tx`delete from comp_slot where comp_id = ${compId}`;
    if (clean.length) {
      await tx`
        insert into comp_slot ${tx(clean, 'comp_id', 'weapon_id', 'alt_weapon_ids', 'count', 'priority', 'label', 'sort_order')}
      `;
    }
  });

  revalidatePath('/comps');
  revalidatePath(`/comps/${compId}`);
  return { slots: clean.reduce((sum, slot) => sum + slot.count, 0) };
}

/**
 * Bild und Ping einer Comp.
 *
 * Der Ping ist bewusst eine Auswahl aus drei Werten und kein freies Feld:
 * ein Textfeld wuerde frueher oder spaeter eine fremde Rollen-Erwaehnung
 * enthalten, und die schickt der Bot dann ungeprueft raus.
 */
export async function setCompMeta(formData) {
  const compId = Number(formData.get('comp_id'));
  await compDesServers(compId);

  const bild = String(formData.get('image_url') || '').trim();
  const ping = String(formData.get('ping') || 'none');

  if (!['none', 'here', 'everyone'].includes(ping)) {
    throw new Error('Unbekannte Ping-Einstellung.');
  }

  // Nur http(s). Ein "javascript:"-Link im Embed waere zwar in Discord
  // harmlos, aber das Dashboard zeigt ihn auch an.
  if (bild && !/^https?:\/\/\S+$/i.test(bild)) {
    throw new Error('Der Bild-Link muss mit http:// oder https:// anfangen.');
  }

  await sql`
    update comp set image_url = ${bild || null}, ping = ${ping}
    where id = ${compId}
  `;

  revalidatePath(`/comps/${compId}`);
}
