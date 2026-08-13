'use server';

import { revalidatePath } from 'next/cache';

import { sql } from '@/lib/db';
import { requireGuildAction } from '@/lib/guilds';

/**
 * Setzt den Skill einer fremden Waffe - gedacht fuer den Fall, dass sich
 * jemand falsch einschaetzt.
 *
 * rating 0 loescht die Waffe aus dem Profil. Angelegt wird hier nichts:
 * eintragen tut jeder selbst mit /waffen, hier wird nur korrigiert.
 * Deshalb "update" ohne "insert" - eine Waffe, die die Person nie
 * angegeben hat, soll ihr auch niemand unterschieben koennen.
 */
export async function setPlayerRating(guildId, discordId, weaponId, rating) {
  await requireGuildAction(guildId);

  const stufe = Number(rating);
  if (!Number.isInteger(stufe) || stufe < 0 || stufe > 10) {
    throw new Error('Der Skill muss zwischen 1 und 10 liegen (oder 0 zum Entfernen).');
  }

  if (stufe === 0) {
    await sql`
      delete from player_weapon
      where guild_id = ${guildId} and discord_id = ${discordId} and weapon_id = ${Number(weaponId)}
    `;
  } else {
    await sql`
      update player_weapon set rating = ${stufe}
      where guild_id = ${guildId} and discord_id = ${discordId} and weapon_id = ${Number(weaponId)}
    `;
  }

  revalidatePath('/spieler');
  return { ok: true };
}
