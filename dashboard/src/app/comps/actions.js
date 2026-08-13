'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { sql } from '@/lib/db';
import { requireOfficerAction } from '@/lib/guards';

export async function createComp(formData) {
  const session = await requireOfficerAction();
  const name = (formData.get('name') || '').toString().trim();
  if (!name) throw new Error('Die Comp braucht einen Namen.');

  const existing = await sql`select id from comp where name = ${name}`;
  if (existing.length) throw new Error(`Es gibt schon eine Comp namens "${name}".`);

  const [comp] = await sql`
    insert into comp (name, created_by) values (${name}, ${session.user.discordId})
    returning id
  `;

  revalidatePath('/comps');
  redirect(`/comps/${comp.id}`);
}

export async function deleteComp(formData) {
  await requireOfficerAction();
  const compId = Number(formData.get('comp_id'));
  if (!Number.isInteger(compId)) throw new Error('Unbekannte Comp.');

  await sql`delete from comp where id = ${compId}`;
  revalidatePath('/comps');
}

/**
 * Ersetzt die Slots einer Comp komplett.
 * Laufende Events sind davon nicht betroffen - deren Slots wurden beim
 * Erstellen des Events eingefroren.
 */
export async function saveCompSlots(compId, slots, notes) {
  await requireOfficerAction();

  const clean = [];
  slots.forEach((slot, index) => {
    const weaponId = Number(slot.weaponId);
    const count = Number(slot.count);
    const priority = Number(slot.priority);
    if (!Number.isInteger(weaponId) || weaponId <= 0) return;
    if (!Number.isInteger(count) || count < 1 || count > 40) return;
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) return;

    clean.push({
      comp_id: compId,
      weapon_id: weaponId,
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
        insert into comp_slot ${tx(clean, 'comp_id', 'weapon_id', 'count', 'priority', 'label', 'sort_order')}
      `;
    }
  });

  revalidatePath('/comps');
  revalidatePath(`/comps/${compId}`);
  return { slots: clean.reduce((sum, slot) => sum + slot.count, 0) };
}
