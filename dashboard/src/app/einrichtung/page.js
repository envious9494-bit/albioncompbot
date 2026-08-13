import Link from 'next/link';

import AutoRefresh from '@/components/AutoRefresh';
import CopyField from '@/components/CopyField';
import { sql } from '@/lib/db';
import { requireGuild } from '@/lib/guilds';

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
  const { session, guild, guilds } = await requireGuild();

  const [status, [zugaenge], [comps]] = await Promise.all([
    loadBotStatus(),
    sql`select count(*)::int as n from guild_access where guild_id = ${guild.id}`,
    sql`select count(*)::int as n from comp where guild_id = ${guild.id}`,
  ]);

  const clientId = process.env.AUTH_DISCORD_ID || null;
  const inviteUrl = clientId
    ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${BOT_PERMISSIONS}&integration_type=0&scope=bot+applications.commands`
    : null;

  const lastSeen = status?.last_seen ? new Date(status.last_seen) : null;
  const botAlive = Boolean(lastSeen && Date.now() - lastSeen.getTime() < HEARTBEAT_TIMEOUT_MS);
  const botGuilds = status?.guild_ids ?? [];
  const botHier = botGuilds.includes(guild.id);

  return (
    <>
      <AutoRefresh seconds={5} />

      <h1>Einrichtung</h1>
      <p className="subtitle">
        Stand für <strong>{guild.name ?? guild.id}</strong>
        {guilds.length > 1 && (
          <span className="small"> · du verwaltest {guilds.length} Server</span>
        )}
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Stand</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <Check ok={botAlive} hint="Der Bot läuft gerade nirgends — er muss durchgehend online sein.">
            {botAlive
              ? `Bot läuft${status.bot_tag ? ` als ${status.bot_tag}` : ''} — auf ${botGuilds.length} ${botGuilds.length === 1 ? 'Server' : 'Servern'}`
              : 'Bot läuft nicht'}
          </Check>

          <Check
            ok={botHier}
            hint="Lade ihn unten ein und wähle dabei genau diesen Server aus."
          >
            Bot ist auf diesem Server
          </Check>

          <Check ok={comps.n > 0} hint="Ohne Comp kann niemand einen Timer erstellen.">
            {comps.n > 0 ? `${comps.n} ${comps.n === 1 ? 'Comp' : 'Comps'} angelegt` : 'Noch keine Comp'}
          </Check>

          <li className="small muted" style={{ marginTop: 12 }}>
            {zugaenge.n > 0 ? (
              <>
                {zugaenge.n} {zugaenge.n === 1 ? 'Person ist' : 'Personen sind'} zusätzlich
                freigeschaltet — verwalten unter <Link href="/zugang">Zugang</Link>.
              </>
            ) : (
              <>
                Bisher kommt nur ins Dashboard, wer auf dem Server „Server verwalten" darf. Weitere
                Leute schaltest du unter <Link href="/zugang">Zugang</Link> frei.
              </>
            )}
          </li>
        </ul>

        {status?.missingTable && (
          <div className="notice" style={{ marginTop: 12, marginBottom: 0 }}>
            Die Tabelle <code>bot_status</code> fehlt noch. Spiel dafür einmal
            <code> db/002_bot_status.sql</code> ein, sonst bleibt das Lebenszeichen oben leer.
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Bot einladen</h2>
        {inviteUrl ? (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>
              Öffnet Discord, dort den Server auswählen. Der Bot fragt nur diese Rechte an:{' '}
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
              Der Bot registriert seine Befehle beim Einladen von selbst. Jeder Server bekommt
              eigene Comps, Events und Waffenprofile — nichts wird zwischen Servern geteilt außer
              der Waffenliste.
            </p>
          </>
        ) : (
          <p className="muted small">
            Ohne <code>AUTH_DISCORD_ID</code> in der Konfiguration kann ich keinen Einladungslink
            bauen.
          </p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Kennungen</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Braucht man normalerweise nicht — nur falls mal etwas hakt.
        </p>
        <div className="small muted" style={{ marginBottom: 4 }}>
          Server-ID von {guild.name ?? 'diesem Server'}
        </div>
        <CopyField value={guild.id} label="Server-ID" />
        <div className="small muted" style={{ margin: '12px 0 4px' }}>
          Deine Discord-ID
        </div>
        <CopyField value={session.user.discordId} label="Deine Discord-ID" />
      </div>
    </>
  );
}
