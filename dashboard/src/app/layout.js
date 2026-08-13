import './globals.css';

import { cookies } from 'next/headers';

import GuildSwitcher from '@/components/GuildSwitcher';
import NavLink from '@/components/NavLink';
import { getAccessibleGuilds, GUILD_COOKIE } from '@/lib/guilds';
import { logoutAction } from './actions/auth';

export const metadata = {
  title: 'Albion Comp',
  description: 'Aufstellungen fuer die Gilde',
};

export default async function RootLayout({ children }) {
  const { session, guilds } = await getAccessibleGuilds();

  let current = null;
  if (guilds.length) {
    const store = await cookies();
    const gewaehlt = store.get(GUILD_COOKIE)?.value;
    current = guilds.find((guild) => guild.id === gewaehlt) ?? guilds[0];
  }

  const zeigeRahmen = Boolean(session) && guilds.length > 0;

  return (
    <html lang="de">
      <body>
        {zeigeRahmen ? (
          <div className="shell">
            <nav className="sidebar">
              <div className="brand">Albion Comp</div>
              <GuildSwitcher guilds={guilds} current={current} />
              <NavLink href="/events">Events</NavLink>
              <NavLink href="/comps">Comps</NavLink>
              <NavLink href="/spieler">Spieler</NavLink>
              <NavLink href="/zugang">Zugang</NavLink>
              <NavLink href="/waffen">Waffen</NavLink>
              <NavLink href="/einrichtung">Einrichtung</NavLink>
              <div className="sidebar-footer">
                <div>{session.user.displayName}</div>
                <form action={logoutAction}>
                  <button type="submit" className="btn-ghost small" style={{ marginTop: 8 }}>
                    Abmelden
                  </button>
                </form>
              </div>
            </nav>
            <main className="content">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
