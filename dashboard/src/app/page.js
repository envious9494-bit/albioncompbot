import { redirect } from 'next/navigation';

import { auth, DEV_LOGIN } from '@/auth';
import { devLoginAction, loginAction } from './actions/auth';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await auth();
  if (session) redirect('/server');

  return (
    <div className="login-wrap">
      <div>
        <h1>Albion Comp</h1>
        <p className="subtitle" style={{ maxWidth: 400, margin: '8px auto 24px' }}>
          Comps zusammenstellen und Aufstellungen live mitverfolgen.
          <br />
          <span className="small">
            Waffenprofile pflegen die Member im Discord mit <code>/waffen</code>.
          </span>
        </p>
        <form action={loginAction}>
          <button type="submit">Mit Discord anmelden</button>
        </form>

        {DEV_LOGIN && (
          <form action={devLoginAction} style={{ marginTop: 28 }}>
            <div className="small muted" style={{ marginBottom: 8 }}>
              Test-Login (nur lokal)
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <input name="name" defaultValue="Testnutzer" style={{ width: 140 }} />
              <input name="discordId" defaultValue="dev-1" style={{ width: 120 }} />
              <button type="submit" className="btn-ghost">
                Rein
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
