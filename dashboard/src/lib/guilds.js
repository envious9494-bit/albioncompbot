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
/**
 * Alle Server, die diese Person im Dashboard sehen darf.
 * Es kommen nur Server in Frage, auf denen der Bot auch ist.
 */
export async function getAccessibleGuilds() {
  const session = await auth();
  if (!session) return { session: null, guilds: [] };

  const discordId = session.user.discordId;
  const adminIds = (session.user.guilds ?? []).map((guild) => guild.id);

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
 * Fuer die Serverauswahl: alle Discord-Server, auf denen die Person Admin ist,
 * plus die, auf denen sie freigeschaltet wurde. Auch solche, auf denen der Bot
 * noch gar nicht ist - genau die will man ja einladen.
 */
export async function getGuildOverview() {
  const session = await auth();
  if (!session) return { session: null, guilds: [] };

  const adminGuilds = session.user.guilds ?? [];
  const [mitBot, botStatus] = await Promise.all([
    getAccessibleGuilds().then((ergebnis) => ergebnis.guilds),
    sql`select guild_ids from bot_status where id = 1`.then((rows) => rows[0]?.guild_ids ?? []),
  ]);

  const bekannt = new Map();

  for (const guild of mitBot) {
    bekannt.set(guild.id, {
      id: guild.id,
      name: guild.name ?? guild.id,
      hatBot: botStatus.includes(guild.id),
      istAdmin: Boolean(guild.via_discord),
      freigeschaltet: Boolean(guild.via_liste),
    });
  }

  // Discord-Server, auf denen der Bot noch fehlt
  for (const guild of adminGuilds) {
    if (bekannt.has(guild.id)) {
      bekannt.get(guild.id).istAdmin = true;
      if (!bekannt.get(guild.id).name) bekannt.get(guild.id).name = guild.name;
      continue;
    }
    bekannt.set(guild.id, {
      id: guild.id,
      name: guild.name,
      hatBot: false,
      istAdmin: true,
      freigeschaltet: false,
    });
  }

  const guilds = [...bekannt.values()].sort(
    (a, b) => Number(b.hatBot) - Number(a.hatBot) || a.name.localeCompare(b.name),
  );

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
