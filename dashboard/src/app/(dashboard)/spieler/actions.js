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

  // Erwartbare Fehler werden zurueckgegeben, nicht geworfen: Next.js
  // ersetzt in der Produktion die Meldung geworfener Fehler durch einen
  // nichtssagenden Platzhalter. Geworfen wird nur, was ein Programmierfehler
  // waere - das darf ruhig im Log landen.
  const stufe = Number(rating);
  if (!Number.isInteger(stufe) || stufe < 0 || stufe > 10) {
    return { ok: false, fehler: 'Der Skill muss zwischen 1 und 10 liegen (oder 0 zum Entfernen).' };
  }

  const waffe = Number(weaponId);
  if (!Number.isInteger(waffe) || waffe <= 0) {
    return { ok: false, fehler: 'Zu dieser Zeile fehlt die Waffe — lad die Seite neu.' };
  }

  if (stufe === 0) {
    const weg = await sql`
      delete from player_weapon
      where guild_id = ${guildId} and discord_id = ${discordId} and weapon_id = ${waffe}
    `;
    if (weg.count === 0) return { ok: false, fehler: 'Diese Waffe steht nicht (mehr) im Profil.' };
    revalidatePath('/spieler');
    return { ok: true, rating: 0 };
  }

  // Zurueckgeben, was wirklich in der Datenbank steht - nicht das, was
  // geschickt wurde. Trifft ein update keine Zeile, meldet Postgres keinen
  // Fehler, sondern schlicht "null Zeilen". Ohne diese Pruefung sagt die
  // Oberflaeche "gespeichert" und zeigt einen Wert, den es nirgends gibt.
  const [zeile] = await sql`
    update player_weapon set rating = ${stufe}
    where guild_id = ${guildId} and discord_id = ${discordId} and weapon_id = ${waffe}
    returning rating
  `;

  if (!zeile) {
    return {
      ok: false,
      fehler:
        'Nichts gespeichert — zu diesem Server, Spieler und dieser Waffe gibt es keinen Eintrag.',
    };
  }

  revalidatePath('/spieler');
  return { ok: true, rating: zeile.rating };
}
