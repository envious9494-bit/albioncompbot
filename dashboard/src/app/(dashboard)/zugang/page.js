import { sql } from '@/lib/db';
import { requireGuild } from '@/lib/guilds';
import { grantAccess, revokeAccess } from './actions';

export const dynamic = 'force-dynamic';

export default async function AccessPage() {
  const { session, guild } = await requireGuild();

  const [freigeschaltet, kandidaten] = await Promise.all([
    sql`
      select a.discord_id,
             coalesce(a.display_name, p.display_name) as display_name,
             a.added_by,
             a.added_at
      from guild_access a
      left join player p on p.guild_id = a.guild_id and p.discord_id = a.discord_id
      where a.guild_id = ${guild.id}
      order by lower(coalesce(a.display_name, p.display_name, a.discord_id))
    `,
    // Leute, die der Bot auf diesem Server schon gesehen hat und die noch
    // keinen Zugang haben - damit man keine IDs abtippen muss.
    sql`
      select p.discord_id, p.display_name
      from player p
      where p.guild_id = ${guild.id}
        and not exists (
          select 1 from guild_access a
          where a.guild_id = p.guild_id and a.discord_id = p.discord_id
        )
      order by lower(p.display_name)
      limit 100
    `,
  ]);

  return (
    <>
      <h1>Zugang</h1>
      <p className="subtitle">
        Wer für <strong>{guild.name ?? guild.id}</strong> ins Dashboard darf.
      </p>

      <div className="notice">
        Wer auf dem Discord-Server das Recht <strong>Server verwalten</strong> hat, kommt
        automatisch rein und muss hier nicht eingetragen werden. Diese Liste ist für alle anderen —
        etwa Caller, die Comps bauen sollen, aber keine Serverrechte haben.
        <br />
        <span className="small">
          Freigeschaltete sehen alles: Comps, Events und die Waffenprofile aller Member dieses
          Servers. Andere Server bleiben unsichtbar.
        </span>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Freigeschaltet ({freigeschaltet.length})</h2>
        {freigeschaltet.length === 0 ? (
          <p className="muted small" style={{ marginBottom: 0 }}>
            Noch niemand — bisher kommt nur rein, wer auf dem Server „Server verwalten" darf.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 200 }}>Discord-ID</th>
                <th style={{ width: 120 }}>Seit</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {freigeschaltet.map((eintrag) => (
                <tr key={eintrag.discord_id}>
                  <td>{eintrag.display_name ?? <span className="muted">unbekannt</span>}</td>
                  <td className="small muted ip-data">{eintrag.discord_id}</td>
                  <td className="small muted ip-data">
                    {new Date(eintrag.added_at).toLocaleDateString('de-DE')}
                  </td>
                  <td>
                    {eintrag.discord_id === session.user.discordId ? (
                      <span className="badge">du selbst</span>
                    ) : (
                      <form action={revokeAccess}>
                        <input type="hidden" name="guild_id" value={guild.id} />
                        <input type="hidden" name="discord_id" value={eintrag.discord_id} />
                        <button type="submit" className="btn-danger small">
                          Entfernen
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {kandidaten.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Aus deinem Server</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Leute, die den Bot hier schon benutzt haben. Ein Klick genügt, keine ID nötig.
          </p>
          <table>
            <tbody>
              {kandidaten.map((person) => (
                <tr key={person.discord_id}>
                  <td>{person.display_name}</td>
                  <td className="small muted ip-data" style={{ width: 200 }}>
                    {person.discord_id}
                  </td>
                  <td style={{ width: 130 }}>
                    <form action={grantAccess}>
                      <input type="hidden" name="guild_id" value={guild.id} />
                      <input type="hidden" name="discord_id" value={person.discord_id} />
                      <input type="hidden" name="display_name" value={person.display_name} />
                      <button type="submit" className="btn-ghost small">
                        Freischalten
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Per Discord-ID freischalten</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Für Leute, die den Bot noch nie benutzt haben. Die ID bekommst du mit Rechtsklick auf die
          Person im Discord → <em>Nutzer-ID kopieren</em> (dafür muss unter Einstellungen →
          Erweitert der Entwicklermodus an sein).
        </p>
        <form action={grantAccess} className="row" style={{ flexWrap: 'wrap' }}>
          <input type="hidden" name="guild_id" value={guild.id} />
          <input
            name="discord_id"
            placeholder="z.B. 244423111204667392"
            required
            inputMode="numeric"
            className="ip-data" style={{ flex: '1 1 220px' }}
          />
          <input name="display_name" placeholder="Name (optional)" style={{ flex: '1 1 160px' }} />
          <button type="submit">Freischalten</button>
        </form>
      </div>
    </>
  );
}
