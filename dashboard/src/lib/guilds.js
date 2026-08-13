import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { sql } from '@/lib/db';

const GUILD_COOKIE = 'albion_guild';

/**
 * Betreiber des Bots - sehen alle Server. Fuer alle anderen entscheidet
 * entweder das Discord-Recht "Server verwalten" oder ein Eintrag in der
 * Zugangsliste des jeweiligen Servers.
 */
const SUPERADMIN_IDS = new Set(
  (process.env.OFFICER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

/**
 * Alle Server, die diese Person im Dashboard sehen darf.
 * Es kommen nur Server in Frage, auf denen der Bot auch ist.
 */
export async function getAccessibleGuilds() {
  const session = await auth();
  if (!session) return { session: null, guilds: [] };

  const discordId = session.user.discordId;
  const adminIds = (session.user.guilds ?? []).map((guild) => guild.id);

  if (SUPERADMIN_IDS.has(discordId)) {
    const alle = await sql`
      select id, name, icon, true as via_discord, false as via_liste
      from guild
      order by name nulls last, id
    `;
    return { session, guilds: alle };
  }

  const guilds = await sql`
    select g.id,
           g.name,
           g.icon,
           (g.id = any(${adminIds})) as via_discord,
           exists (
             select 1 from guild_access a
             where a.guild_id = g.id and a.discord_id = ${discordId}
           ) as via_liste
    from guild g
    where g.id = any(${adminIds})
       or exists (
         select 1 from guild_access a
         where a.guild_id = g.id and a.discord_id = ${discordId}
       )
    order by g.name nulls last, g.id
  `;

  return { session, guilds };
}

/**
 * Fuer Seiten: liefert Sitzung, den gerade gewaehlten Server und alle
 * verfuegbaren. Wer keinen Server hat, landet auf "Kein Zutritt".
 */
export async function requireGuild() {
  const { session, guilds } = await getAccessibleGuilds();
  if (!session) redirect('/');
  if (guilds.length === 0) redirect('/kein-zutritt');

  const store = await cookies();
  const gewaehlt = store.get(GUILD_COOKIE)?.value;
  const guild = guilds.find((entry) => entry.id === gewaehlt) ?? guilds[0];

  return { session, guild, guilds };
}

/** Fuer Server Actions - dort ist ein Redirect unpassend, wir wollen einen Fehler. */
export async function requireGuildAction(guildId) {
  const { session, guilds } = await getAccessibleGuilds();
  if (!session) throw new Error('Nicht angemeldet.');

  const guild = guilds.find((entry) => entry.id === guildId);
  if (!guild) throw new Error('Für diesen Server fehlen dir die Rechte.');

  return { session, guild };
}

export { GUILD_COOKIE };
