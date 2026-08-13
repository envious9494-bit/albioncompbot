import { logoutAction } from '../actions/auth';

export default function NoAccessPage() {
  return (
    <div className="login-wrap">
      <div style={{ maxWidth: 480 }}>
        <h1>Kein Zutritt</h1>
        <p className="subtitle">
          Für keinen deiner Discord-Server ist ein Zugang hinterlegt. Ins Dashboard kommt, wer auf
          dem Server <strong>Server verwalten</strong> darf oder von einem Offizier unter „Zugang"
          freigeschaltet wurde.
        </p>
        <p className="subtitle small">
          Deine Waffen trägst du im Discord ein – tipp dort einfach <code>/waffen</code>. Dafür
          brauchst du das Dashboard nicht.
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
