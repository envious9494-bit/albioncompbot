import { redirect } from 'next/navigation';

import { getGuildOverview } from '@/lib/guilds';
import { logoutAction } from '../actions/auth';
import { selectGuild } from '../actions/guild';

export const dynamic = 'force-dynamic';

const BOT_PERMISSIONS = '216064';

export default async function ServerPage() {
  const { session, guilds } = await getGuildOverview();
  if (!session) redirect('/');

  const clientId = process.env.AUTH_DISCORD_ID || null;
  const einladen = (guildId) =>
    `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${BOT_PERMISSIONS}&integration_type=0&scope=bot+applications.commands&guild_id=${guildId}`;

  const mitBot = guilds.filter((guild) => guild.hatBot);
  const ohneBot = guilds.filter((guild) => !guild.hatBot);

  return (
    <div className="server-wahl">
      <div className="spread" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Server wählen</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Angemeldet als {session.user.displayName}
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="btn-ghost small">
            Abmelden
          </button>
        </form>
      </div>

      {guilds.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Auf keinem deiner Discord-Server hast du das Recht „Server verwalten", und
            freigeschaltet wurdest du bisher auch nirgends. Wenn du Gildenmitglied bist: deine
            Waffen trägst du im Discord mit <code>/waffen</code> ein, dafür brauchst du das
            Dashboard nicht.
          </p>
        </div>
      )}

      {mitBot.length > 0 && (
        <>
          <h2>Bereit</h2>
          <div className="server-liste">
          {mitBot.map((guild) => (
            <div className="server-karte" key={guild.id}>
              <div>
                <strong>{guild.name}</strong>
                <div className="small muted" style={{ marginTop: 2 }}>
                  {guild.istAdmin ? 'Du bist Admin' : 'Du wurdest freigeschaltet'}
                </div>
              </div>
              <form action={selectGuild}>
                <input type="hidden" name="guild_id" value={guild.id} />
                <button type="submit">Öffnen</button>
              </form>
            </div>
          ))}
          </div>
        </>
      )}

      {/* Die Liste der eigenen Server kommt aus der Discord-Anmeldung. Ist sie
          leer, liegt das an der Sitzung und nicht daran, dass es keine gibt -
          das muss dastehen, sonst sucht man an der falschen Stelle. */}
      {ohneBot.length === 0 && (session.user.guilds ?? []).length === 0 && (
        <>
          <h2>Bot fehlt noch</h2>
          <div className="card">
            <p className="small muted" style={{ margin: 0 }}>
              Deine übrigen Discord-Server kann ich gerade nicht sehen. Die Liste kommt beim
              Anmelden von Discord — melde dich einmal ab und wieder an, dann stehen hier alle
              Server, auf denen du den Bot einladen dürftest. Beim Test-Login gibt es sie gar
              nicht.
            </p>
          </div>
        </>
      )}

      {ohneBot.length > 0 && (
        <>
          <h2>Bot fehlt noch</h2>
          <p className="small muted" style={{ marginTop: -4 }}>
            Deine Server, auf denen der Bot noch nicht ist. Nach dem Einladen tauchen sie oben auf.
          </p>
          <div className="server-liste">
          {ohneBot.map((guild) => (
            <div className="server-karte" key={guild.id}>
              <div>
                <strong>{guild.name}</strong>
                <div className="small muted">Bot noch nicht eingeladen</div>
              </div>
              {clientId ? (
                <a className="btn btn-ghost" href={einladen(guild.id)} target="_blank" rel="noreferrer">
                  Bot einladen
                </a>
              ) : (
                <span className="small muted">AUTH_DISCORD_ID fehlt</span>
              )}
            </div>
          ))}
          </div>
        </>
      )}
    </div>
  );
}
