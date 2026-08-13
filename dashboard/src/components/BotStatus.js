import { sql } from '@/lib/db';

/** Als "läuft" gilt der Bot, wenn sein Lebenszeichen keine Minute alt ist. */
const HEARTBEAT_TIMEOUT_MS = 60_000;

const BOT_PERMISSIONS = '216064';

/**
 * Warnstreifen ueber jeder Seite - aber nur, wenn etwas nicht stimmt.
 *
 * Laeuft alles, ist hier nichts zu sehen: eine gruene Erfolgsmeldung, die
 * dauerhaft im Weg steht, liest nach zwei Tagen niemand mehr. Ist der Bot
 * dagegen aus, funktioniert im Discord gar nichts, und ohne diesen Hinweis
 * sucht man den Fehler bei sich.
 */
export default async function BotStatus({ guild }) {
  let status = null;
  try {
    [status] = await sql`select last_seen, guild_ids from bot_status where id = 1`;
  } catch (error) {
    if (error.code !== '42P01') throw error; // Tabelle fehlt: nichts anzeigen
    return null;
  }

  const lastSeen = status?.last_seen ? new Date(status.last_seen) : null;
  const laeuft = Boolean(lastSeen && Date.now() - lastSeen.getTime() < HEARTBEAT_TIMEOUT_MS);
  const aufDiesemServer = (status?.guild_ids ?? []).includes(guild.id);

  if (laeuft && aufDiesemServer) return null;

  const clientId = process.env.AUTH_DISCORD_ID || null;

  if (!laeuft) {
    return (
      <div className="notice" style={{ borderLeftColor: 'hsl(var(--state-critical))' }}>
        <strong>Der Bot läuft gerade nicht.</strong> Im Discord reagiert er auf keinen Befehl, und
        laufende Timer werden nicht aktualisiert. Was hier im Dashboard steht, bleibt davon
        unberührt.
        {lastSeen && (
          <span className="small muted">
            {' '}
            Zuletzt gesehen: {lastSeen.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="notice">
      <strong>Der Bot ist nicht auf {guild.name ?? 'diesem Server'}.</strong> Comps und Zugänge
      kannst du hier trotzdem vorbereiten — Timer erstellen geht erst, wenn er eingeladen ist.
      {clientId && (
        <>
          {' '}
          <a
            href={`https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${BOT_PERMISSIONS}&integration_type=0&scope=bot+applications.commands&guild_id=${guild.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Jetzt einladen
          </a>
        </>
      )}
    </div>
  );
}
