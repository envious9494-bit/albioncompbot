'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getAccessibleGuilds, GUILD_COOKIE } from '@/lib/guilds';

/** Wechselt den aktiven Server. Nur auf welche, die man auch sehen darf. */
export async function selectGuild(formData) {
  const guildId = String(formData.get('guild_id') || '');
  const { guilds } = await getAccessibleGuilds();
  if (!guilds.some((guild) => guild.id === guildId)) {
    throw new Error('Für diesen Server fehlen dir die Rechte.');
  }

  const store = await cookies();
  store.set(GUILD_COOKIE, guildId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });

  revalidatePath('/', 'layout');

  // Aus der Serverauswahl heraus soll es direkt weitergehen; der Umschalter in
  // der Seitenleiste laesst einen dagegen dort, wo man gerade ist.
  if (formData.get('weiter') !== 'nein') redirect('/events');
}
