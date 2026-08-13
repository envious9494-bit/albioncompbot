'use server';

import { revalidatePath } from 'next/cache';

import { sql } from '@/lib/db';
import { requireGuildAction } from '@/lib/guilds';

/** Schaltet das Balance-Board fuer diesen Server an oder aus. */
export async function setBalanceEnabled(formData) {
  const guildId = String(formData.get('guild_id') || '');
  await requireGuildAction(guildId);

  const an = formData.get('enabled') === 'an';
  await sql`update guild set balance_enabled = ${an} where id = ${guildId}`;

  revalidatePath('/balance');
}

/** Erlaubt jemandem, Gold zu vergeben und abzuziehen. */
export async function addManager(formData) {
  const guildId = String(formData.get('guild_id') || '');
  const { session } = await requireGuildAction(guildId);

  const discordId = String(formData.get('discord_id') || '').trim();
  const displayName = String(formData.get('display_name') || '').trim() || null;

  if (!/^\d{17,20}$/.test(discordId)) {
    throw new Error(
      'Das sieht nicht nach einer Discord-ID aus. Rechtsklick auf die Person → „Nutzer-ID kopieren".',
    );
  }

  await sql`
    insert into balance_manager (guild_id, discord_id, display_name, added_by)
    values (${guildId}, ${discordId}, ${displayName}, ${session.user.discordId})
    on conflict (guild_id, discord_id) do update
      set display_name = coalesce(excluded.display_name, balance_manager.display_name)
  `;

  revalidatePath('/balance');
}

export async function removeManager(formData) {
  const guildId = String(formData.get('guild_id') || '');
  await requireGuildAction(guildId);

  const discordId = String(formData.get('discord_id') || '');
  await sql`
    delete from balance_manager where guild_id = ${guildId} and discord_id = ${discordId}
  `;

  revalidatePath('/balance');
}
