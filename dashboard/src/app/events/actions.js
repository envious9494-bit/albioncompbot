'use server';

import { revalidatePath } from 'next/cache';

import { sql } from '@/lib/db';
import { requireGuildAction } from '@/lib/guilds';

/** Prueft, dass das Event zu einem Server gehoert, den man sehen darf. */
async function eventDesServers(eventId) {
  const [event] = await sql`select id, guild_id from event where id = ${eventId}`;
  if (!event) throw new Error('Dieses Event gibt es nicht mehr.');
  await requireGuildAction(event.guild_id);
  return event;
}

/**
 * Nagelt einen Spieler auf einem Slot fest - oder loest die Festlegung wieder.
 * Der Bot rechnet beim naechsten Durchlauf (max. 5 Sekunden) drumherum neu und
 * aktualisiert das Embed im Discord.
 */
export async function setSlotLock(eventId, slotIndex, discordId) {
  await eventDesServers(eventId);

  await sql.begin(async (tx) => {
    // Derselbe Spieler kann nicht auf zwei Slots festgenagelt sein
    if (discordId) {
      await tx`
        update event_slot set locked_discord_id = null
        where event_id = ${eventId} and locked_discord_id = ${discordId}
      `;
    }
    await tx`
      update event_slot set locked_discord_id = ${discordId || null}
      where event_id = ${eventId} and slot_index = ${slotIndex}
    `;
    // Erzwingt ein Neuzeichnen des Embeds, auch wenn sich sonst nichts aendert
    await tx`update event set render_hash = null where id = ${eventId}`;
  });

  revalidatePath(`/events/${eventId}`);
}

export async function clearAllLocks(formData) {
  const eventId = Number(formData.get('event_id'));
  if (!Number.isInteger(eventId)) throw new Error('Unbekanntes Event.');
  await eventDesServers(eventId);

  await sql`update event_slot set locked_discord_id = null where event_id = ${eventId}`;
  await sql`update event set render_hash = null where id = ${eventId}`;
  revalidatePath(`/events/${eventId}`);
}
