import AutoRefresh from '@/components/AutoRefresh';
import CopyField from '@/components/CopyField';
import { sql } from '@/lib/db';
import { requireOfficerPage } from '@/lib/guards';

export const dynamic = 'force-dynamic';

/**
 * Genau die Rechte, die der Bot braucht: Kanaele ansehen, Nachrichten senden,
 * Links einbetten, Nachrichtenverlauf anzeigen, Alle erwaehnen.
 */
const BOT_PERMISSIONS = '216064';

const PERMISSION_LABELS = [
  'Kanäle ansehen',
  'Nachrichten senden',
  'Links einbetten',
  'Nachrichtenverlauf anzeigen',
  'Alle erwähnen',
];

/** Als "läuft" gilt der Bot, wenn sein Lebenszeichen keine Minute alt ist. */
const HEARTBEAT_TIMEOUT_MS = 60_000;

async function loadBotStatus() {
  try {
    const [status] = await sql`select last_seen, bot_tag, guild_ids from bot_status where id = 1`;
    return status ?? null;
  } catch (error) {
    // 42P01 = Tabelle fehlt, also db/002_bot_status.sql noch nicht eingespielt
    if (error.code === '42P01') return { missingTable: true };
    throw error;
  }
}

function Check({ ok, children, hint }) {
  return (
    <li style={{ marginBottom: 8 }}>
      <span style={{ color: ok ? 'var(--green)' : 'var(--muted)', marginRight: 8 }}>
        {ok ? '✓' : '○'}
      </span>
      {children}
      {!ok && hint && <div className="small muted" style={{ marginLeft: 22 }}>{hint}</div>}
    </li>
  );
}

export default async function SetupPage() {
  const session = await requireOfficerPage();
  const status = await loadBotStatus();

  const clientId = process.env.AUTH_DISCORD_ID || null;
  const configuredGuildId = process.env.DISCORD_GUILD_ID || null;
  const officerIdsSet = Boolean((process.env.OFFICER_IDS || '').trim());

  const inviteUrl = clientId
    ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${BOT_PERMISSIONS}&integration_type=0&scope=bot+applications.commands`
    : null;

  const lastSeen = status?.last_seen ? new Date(status.last_seen) : null;
  const botAlive = Boolean(lastSeen && Date.now() - lastSeen.getTime() < HEARTBEAT_TIMEOUT_MS);
  const botGuilds = status?.guild_ids ?? [];
  const botOnConfiguredGuild = Boolean(configuredGuildId && botGuilds.includes(configuredGuildId));

  const guilds = session.user.guilds ?? [];

  return (
    <>
      <AutoRefresh seconds={5} />

      <h1>Einrichtung</h1>
      <p className="subtitle">
        Bot einladen und die IDs abgreifen, die in die Konfiguration gehören.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Stand</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <Check ok={botAlive}>
            {botAlive ? (
              <>
                Bot läuft{status.bot_tag ? ` als ${status.bot_tag}` : ''} — auf {botGuilds.length}{' '}
                {botGuilds.length === 1 ? 'Server' : 'Servern'}
              </>
            ) : (
              'Bot läuft nicht'
            )}
          </Check>

          <Check
            ok={configuredGuildId ? botOnConfiguredGuild : botGuilds.length > 0}
            hint={
              configuredGuildId
                ? 'Lade ihn unten ein und wähle dabei genau diesen Server aus.'
                : 'Lade ihn unten ein — dann registriert er seine Befehle dort von selbst.'
            }
          >
            {configuredGuildId ? 'Bot ist auf dem eingestellten Server' : 'Bot ist auf einem Server'}
          </Check>

          <Check
            ok={officerIdsSet}
            hint="Solange die Liste leer ist, kommt jeder ins Dashboard, der sich mit Discord anmeldet."
          >
            <code>OFFICER_IDS</code> gesetzt
          </Check>

          {/* Optional, deshalb kein Haken, der Fehlendes anmahnt */}
          <li className="small muted" style={{ marginTop: 12 }}>
            <code>DISCORD_GUILD_ID</code>{' '}
            {configuredGuildId ? (
              <>ist auf <code>{configuredGuildId}</code> gesetzt — der Bot bedient nur diesen Server.</>
            ) : (
              <>ist nicht gesetzt. Das ist in Ordnung: der Bot bedient dann jeden Server, auf dem
              er ist. Eintragen lohnt nur, wenn du ihn auf mehreren Servern hast und einschränken
              willst.</>
            )}
          </li>
        </ul>

        {status?.missingTable && (
          <div className="notice" style={{ marginTop: 12, marginBottom: 0 }}>
            Die Tabelle <code>bot_status</code> fehlt noch. Spiel dafür einmal
            <code> db/002_bot_status.sql</code> im Supabase SQL Editor ein, sonst bleibt das
            Lebenszeichen oben immer leer.
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Bot einladen</h2>
        {inviteUrl ? (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>
              Öffnet Discord, dort den Gilden-Server auswählen. Der Bot fragt nur diese Rechte an:{' '}
              {PERMISSION_LABELS.join(', ')}. Kein Kicken, kein Bannen, keine Rollenverwaltung.
            </p>
            <a className="btn" href={inviteUrl} target="_blank" rel="noreferrer">
              Bot auf einen Server holen
            </a>
            <div style={{ marginTop: 12 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>
                Oder den Link weitergeben:
              </div>
              <CopyField value={inviteUrl} label="Einladungslink" />
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Nach dem Einladen aktualisiert sich der Stand oben von selbst — sobald der Bot läuft
              und den Server sieht.
            </p>
          </>
        ) : (
          <p className="muted small">
            Ohne <code>AUTH_DISCORD_ID</code> in der <code>.env.local</code> kann ich keinen
            Einladungslink bauen.
          </p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Server-ID</h2>
        {guilds.length === 0 ? (
          <p className="muted small" style={{ marginBottom: 0 }}>
            Keine Server gefunden, auf denen du „Server verwalten" darfst. Beim Test-Login gibt es
            diese Liste nicht — melde dich mit Discord an, dann steht sie hier.
          </p>
        ) : (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>
              Deine Server mit Adminrechten. Die ID gehört als <code>DISCORD_GUILD_ID</code> in{' '}
              <code>bot/.env</code> <em>und</em> <code>dashboard/.env.local</code>.
            </p>
            {guilds.map((guild) => {
              const isConfigured = guild.id === configuredGuildId;
              const hasBot = botGuilds.includes(guild.id);
              return (
                <div key={guild.id} style={{ marginBottom: 14 }}>
                  <div className="row" style={{ marginBottom: 4 }}>
                    <strong>{guild.name}</strong>
                    {isConfigured && <span className="badge badge-open">eingestellt</span>}
                    {hasBot && <span className="badge badge-locked">Bot ist drauf</span>}
                  </div>
                  <CopyField value={guild.id} label={`Server-ID von ${guild.name}`} />
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Deine Discord-ID</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Gehört als <code>OFFICER_IDS</code> in beide <code>.env</code>-Dateien. Mehrere Offiziere
          mit Komma trennen. Wer dort steht, darf Timer erstellen und ins Dashboard.
        </p>
        <CopyField value={session.user.discordId} label="Deine Discord-ID" />
      </div>
    </>
  );
}
