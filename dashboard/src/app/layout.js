import './globals.css';

import { auth } from '@/auth';
import NavLink from '@/components/NavLink';
import { logoutAction } from './actions/auth';

export const metadata = {
  title: 'Albion Comp',
  description: 'Aufstellungen fuer die Gilde',
};

export default async function RootLayout({ children }) {
  const session = await auth();
  const showShell = Boolean(session?.user?.isOfficer);

  return (
    <html lang="de">
      <body>
        {showShell ? (
          <div className="shell">
            <nav className="sidebar">
              <div className="brand">Albion Comp</div>
              <NavLink href="/events">Events</NavLink>
              <NavLink href="/comps">Comps</NavLink>
              <NavLink href="/spieler">Spieler</NavLink>
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
