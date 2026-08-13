import Link from 'next/link';
import { redirect } from 'next/navigation';

import BotStatus from '@/components/BotStatus';
import GuildSwitcher from '@/components/GuildSwitcher';
import NavLink from '@/components/NavLink';
import { requireGuild } from '@/lib/guilds';
import { logoutAction } from '../actions/auth';

export default async function DashboardLayout({ children }) {
  const { session, guild, guilds } = await requireGuild();
  if (!guild) redirect('/server');

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">Albion Comp</div>
        <GuildSwitcher guilds={guilds} current={guild} />
        <NavLink href="/events">Events</NavLink>
        <NavLink href="/comps">Comps</NavLink>
        <NavLink href="/spieler">Spieler</NavLink>
        <NavLink href="/balance">Balance</NavLink>
        <NavLink href="/zugang">Zugang</NavLink>
        <NavLink href="/waffen">Waffen</NavLink>
        <div className="sidebar-footer">
          <Link href="/server" className="small" style={{ display: 'block', marginBottom: 8 }}>
            Server wechseln
          </Link>
          <div className="small muted">{session.user.displayName}</div>
          <form action={logoutAction}>
            <button type="submit" className="btn-ghost small" style={{ marginTop: 8 }}>
              Abmelden
            </button>
          </form>
        </div>
      </nav>
      <main className="content">
        {/* Steht nur da, wenn etwas nicht stimmt - siehe BotStatus. */}
        <BotStatus guild={guild} />
        {children}
      </main>
    </div>
  );
}
