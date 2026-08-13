import { sql } from '@/lib/db';
import { requireGuild } from '@/lib/guilds';
import { addManager, removeManager, setBalanceEnabled } from './actions';

export const dynamic = 'force-dynamic';

const gold = new Intl.NumberFormat('de-DE');

export default async function BalancePage() {
  const { guild } = await requireGuild();

  const [[einstellung], manager, konten, buchungen] = await Promise.all([
    sql`select balance_enabled from guild where id = ${guild.id}`,
    sql`
      select m.discord_id, coalesce(m.display_name, b.display_name) as display_name
      from balance_manager m
      left join balance b on b.guild_id = m.guild_id and b.discord_id = m.discord_id
      where m.guild_id = ${guild.id}
      order by lower(coalesce(m.display_name, b.display_name, m.discord_id))
    `,
    sql`
      select discord_id, display_name, amount
      from balance
      where guild_id = ${guild.id} and amount <> 0
      order by amount desc
      limit 25
    `,
    sql`
      select l.discord_id, l.delta, l.saldo_danach, l.reason, l.created_by, l.created_at,
             b.display_name
      from balance_log l
      left join balance b on b.guild_id = l.guild_id and b.discord_id = l.discord_id
      where l.guild_id = ${guild.id}
      order by l.id desc
      limit 20
    `,
  ]);

  const aktiv = Boolean(einstellung?.balance_enabled);

  return (
    <>
      <h1>Balance</h1>
      <p className="subtitle">
        Gold-Konten für <strong>{guild.name ?? guild.id}</strong>. Jeder Server hat eigene.
      </p>

      <div className="card">
        <div className="spread">
          <div>
            <strong>{aktiv ? 'Eingeschaltet' : 'Ausgeschaltet'}</strong>
            <div className="small muted">
              {aktiv
                ? 'Alle können /leaderboard und !leaderboard benutzen.'
                : 'Die Befehle antworten mit einem Hinweis, dass das Board aus ist.'}
            </div>
          </div>
          <form action={setBalanceEnabled}>
            <input type="hidden" name="guild_id" value={guild.id} />
            <input type="hidden" name="enabled" value={aktiv ? 'aus' : 'an'} />
            <button type="submit" className={aktiv ? 'btn-ghost' : ''}>
              {aktiv ? 'Ausschalten' : 'Einschalten'}
            </button>
          </form>
        </div>
      </div>

      {!aktiv && (
        <div className="notice">
          Solange das Board aus ist, bleiben vorhandene Kontostände erhalten — sie sind nur nicht
          abrufbar. Ausschalten löscht also nichts.
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Wer Gold vergeben darf ({manager.length})</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Zusätzlich darf jeder, der auf dem Discord-Server „Server verwalten" hat. Das Recht hängt
          nicht am Dashboard-Zugang: ein Caller kann Gold verteilen, ohne Comps ändern zu können.
        </p>

        {manager.length > 0 && (
          <table style={{ marginBottom: 16 }}>
            <tbody>
              {manager.map((person) => (
                <tr key={person.discord_id}>
                  <td>{person.display_name ?? <span className="muted">unbekannt</span>}</td>
                  <td className="small muted" style={{ fontFamily: 'monospace', width: 200 }}>
                    {person.discord_id}
                  </td>
                  <td style={{ width: 110 }}>
                    <form action={removeManager}>
                      <input type="hidden" name="guild_id" value={guild.id} />
                      <input type="hidden" name="discord_id" value={person.discord_id} />
                      <button type="submit" className="btn-danger small">
                        Entfernen
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form action={addManager} className="row" style={{ flexWrap: 'wrap' }}>
          <input type="hidden" name="guild_id" value={guild.id} />
          <input
            name="discord_id"
            placeholder="Discord-ID"
            required
            inputMode="numeric"
            style={{ flex: '1 1 200px', fontFamily: 'monospace' }}
          />
          <input name="display_name" placeholder="Name (optional)" style={{ flex: '1 1 150px' }} />
          <button type="submit" className="btn-ghost">
            Hinzufügen
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Kontostände</h2>
        {konten.length === 0 ? (
          <p className="muted small" style={{ marginBottom: 0 }}>
            Noch keine Buchungen. Im Discord: <code>/balance geben</code> oder{' '}
            <code>!balance add @Name 500</code>.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Spieler</th>
                <th style={{ width: 150, textAlign: 'right' }}>Gold</th>
              </tr>
            </thead>
            <tbody>
              {konten.map((konto, index) => (
                <tr key={konto.discord_id}>
                  <td className="muted">{index + 1}</td>
                  <td>{konto.display_name ?? konto.discord_id}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {gold.format(BigInt(konto.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {buchungen.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Letzte Buchungen</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Damit bei Streit nachvollziehbar bleibt, wer wem was gegeben hat.
          </p>
          <table>
            <thead>
              <tr>
                <th style={{ width: 130 }}>Wann</th>
                <th>Wer</th>
                <th style={{ width: 120, textAlign: 'right' }}>Änderung</th>
                <th style={{ width: 120, textAlign: 'right' }}>Danach</th>
                <th>Grund</th>
              </tr>
            </thead>
            <tbody>
              {buchungen.map((eintrag, index) => (
                <tr key={`${eintrag.created_at}-${index}`}>
                  <td className="small muted">
                    {new Date(eintrag.created_at).toLocaleString('de-DE', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td>{eintrag.display_name ?? eintrag.discord_id}</td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: BigInt(eintrag.delta) < 0n ? 'var(--red)' : 'var(--green)',
                    }}
                  >
                    {BigInt(eintrag.delta) > 0n ? '+' : ''}
                    {gold.format(BigInt(eintrag.delta))}
                  </td>
                  <td
                    className="muted"
                    style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {gold.format(BigInt(eintrag.saldo_danach))}
                  </td>
                  <td className="small muted">{eintrag.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
