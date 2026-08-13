import { sql } from '@/lib/db';
import { requireGuild } from '@/lib/guilds';

export const dynamic = 'force-dynamic';

export default async function PlayersPage() {
  const { guild } = await requireGuild();

  const [players, entries] = await Promise.all([
    sql`
      select p.discord_id, p.display_name, p.ingame_name,
             count(pw.weapon_id)::int as weapons
      from player p
      left join player_weapon pw on pw.guild_id = p.guild_id and pw.discord_id = p.discord_id
      where p.guild_id = ${guild.id}
      group by p.discord_id
      order by lower(p.display_name)
    `,
    sql`
      select pw.discord_id, pw.rating, w.name, w.category, w.icon
      from player_weapon pw
      join weapon w on w.id = pw.weapon_id
      where pw.guild_id = ${guild.id}
      order by pw.rating desc, w.sort_order
    `,
  ]);

  const byPlayer = new Map();
  for (const entry of entries) {
    if (!byPlayer.has(entry.discord_id)) byPlayer.set(entry.discord_id, []);
    byPlayer.get(entry.discord_id).push(entry);
  }

  const withProfile = players.filter((player) => player.weapons > 0);
  const without = players.filter((player) => player.weapons === 0);

  return (
    <>
      <h1>Spieler</h1>
      <p className="subtitle">
        Was die Member im Discord mit <code>/waffen</code> eingetragen haben. Nur lesen – ändern
        kann das jeder nur für sich selbst.
      </p>

      {players.length === 0 && (
        <p className="muted">
          Noch niemand da. Sobald jemand <code>/waffen</code> benutzt oder sich für ein Event
          anmeldet, taucht er hier auf.
        </p>
      )}

      {without.length > 0 && (
        <div className="notice">
          Ohne Waffenprofil und damit nicht einteilbar: {without.map((p) => p.display_name).join(', ')}
        </div>
      )}

      {withProfile.map((player) => (
        <div className="card" key={player.discord_id}>
          <div className="spread" style={{ marginBottom: 8 }}>
            <strong>
              {player.display_name}
              {player.ingame_name && <span className="muted small"> · {player.ingame_name}</span>}
            </strong>
            <span className="badge">{player.weapons} Waffen</span>
          </div>
          <div className="small">
            {(byPlayer.get(player.discord_id) ?? []).map((entry, index) => (
              <span key={`${entry.name}-${index}`} style={{ marginRight: 12 }}>
                {entry.icon || '•'} {entry.name}{' '}
                <span className="muted">{entry.rating}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
