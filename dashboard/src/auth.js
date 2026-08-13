import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Discord from 'next-auth/providers/discord';

const REQUIRED_GUILD_ID = process.env.DISCORD_GUILD_ID || null;

/**
 * Test-Login ohne Discord, nur zum lokalen Ausprobieren.
 * Die zweite Bedingung sorgt dafuer, dass das auf Vercel gar nicht erst
 * eingeschaltet werden kann - dort ist NODE_ENV immer "production".
 */
export const DEV_LOGIN = process.env.DEV_LOGIN === '1' && process.env.NODE_ENV !== 'production';

/** Discord-Rechtebit "Server verwalten". */
const MANAGE_GUILD = 1n << 5n;

/**
 * Holt die Server, auf denen der Angemeldete Adminrechte hat. Daraus baut die
 * Serverauswahl ihre Liste - auch die Server, auf denen der Bot noch fehlt und
 * die man deshalb einladen koennen muss.
 *
 * Gespeichert wird nur {id, name}, nicht das Zugriffstoken.
 */
async function fetchAdminGuilds(accessToken) {
  try {
    const response = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return [];
    const guilds = await response.json();
    return guilds
      .filter((guild) => guild.owner || (BigInt(guild.permissions ?? 0) & MANAGE_GUILD) === MANAGE_GUILD)
      .slice(0, 25)
      .map((guild) => ({ id: guild.id, name: guild.name }));
  } catch {
    return [];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Discord({
      // "guilds" wird gebraucht, um die Mitgliedschaft im Gilden-Discord zu pruefen
      authorization: { params: { scope: 'identify guilds' } },
    }),
    ...(DEV_LOGIN
      ? [
          Credentials({
            id: 'dev-login',
            name: 'Test-Login',
            credentials: { discordId: {}, name: {} },
            authorize: (credentials) => ({
              id: String(credentials?.discordId || 'dev-1'),
              discordId: String(credentials?.discordId || 'dev-1'),
              name: String(credentials?.name || 'Testnutzer'),
            }),
          }),
        ]
      : []),
  ],
  callbacks: {
    /** Torwaechter: nur wer im Gilden-Discord ist, kommt rein. */
    async signIn({ account }) {
      if (account?.provider === 'dev-login') return DEV_LOGIN;
      if (!REQUIRED_GUILD_ID) return true;
      if (!account?.access_token) return false;

      try {
        const response = await fetch('https://discord.com/api/users/@me/guilds', {
          headers: { Authorization: `Bearer ${account.access_token}` },
        });
        if (!response.ok) return false;
        const guilds = await response.json();
        return guilds.some((guild) => guild.id === REQUIRED_GUILD_ID);
      } catch {
        return false;
      }
    },

    async jwt({ token, profile, user, account }) {
      if (profile) {
        token.discordId = profile.id;
        token.displayName = profile.global_name || profile.username;
      } else if (user?.discordId) {
        token.discordId = user.discordId;
        token.displayName = user.name;
      }
      if (account?.access_token) {
        token.guilds = await fetchAdminGuilds(account.access_token);
      }
      return token;
    },

    async session({ session, token }) {
      session.user.discordId = token.discordId;
      session.user.displayName = token.displayName ?? session.user.name;
      session.user.guilds = token.guilds ?? [];
      return session;
    },
  },
  pages: {
    error: '/kein-zutritt',
  },
});
