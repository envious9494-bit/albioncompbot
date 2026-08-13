import { logoutAction } from '../actions/auth';

export default function NoAccessPage() {
  return (
    <div className="login-wrap">
      <div style={{ maxWidth: 440 }}>
        <h1>Kein Zutritt</h1>
        <p className="subtitle">
          Dieses Dashboard ist der Gildenleitung vorbehalten. Deine Waffen trägst du im Discord ein
          – tipp dort einfach <code>/waffen</code>.
        </p>
        <form action={logoutAction}>
          <button type="submit" className="btn-ghost">
            Abmelden
          </button>
        </form>
      </div>
    </div>
  );
}
