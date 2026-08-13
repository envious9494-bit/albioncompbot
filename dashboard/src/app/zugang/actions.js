'use server';

import { revalidatePath } from 'next/cache';

import { sql } from '@/lib/db';
import { requireGuildAction } from '@/lib/guilds';

/** Schaltet jemanden fuer diesen Server frei. */
export async function grantAccess(formData) {
  const guildId = String(formData.get('guild_id') || '');
  const { session } = await requireGuildAction(guildId);

  const discordId = String(formData.get('discord_id') || '').trim();
  const displayName = String(formData.get('display_name') || '').trim() || null;

  // Discord-IDs sind 17-20 stellige Zahlen
  if (!/^\d{17,20}$/.test(discordId)) {
    throw new Error(
      'Das sieht nicht nach einer Discord-ID aus. Die besteht nur aus Ziffern — Rechtsklick auf die Person → „Nutzer-ID kopieren".',
    );
  }

  await sql`
    insert into guild_access (guild_id, discord_id, display_name, added_by)
    values (${guildId}, ${discordId}, ${displayName}, ${session.user.discordId})
    on conflict (guild_id, discord_id) do update
      set display_name = coalesce(excluded.display_name, guild_access.display_name)
  `;

  revalidatePath('/zugang');
}

/** Nimmt jemandem den Zugang zu diesem Server wieder. */
export async function revokeAccess(formData) {
  const guildId = String(formData.get('guild_id') || '');
  const { session } = await requireGuildAction(guildId);

  const discordId = String(formData.get('discord_id') || '');
  if (discordId === session.user.discordId) {
    throw new Error('Du kannst dir nicht selbst den Zugang entziehen.');
  }

  await sql`
    delete from guild_access where guild_id = ${guildId} and discord_id = ${discordId}
  `;

  revalidatePath('/zugang');
}
