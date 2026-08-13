import Link from 'next/link';

import { sql } from '@/lib/db';
import { requireGuild } from '@/lib/guilds';
import { setDefaultLock } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  open: ['Anmeldung läuft', 'badge-open'],
  locked: ['Aufstellung steht', 'badge-locked'],
  cancelled: ['Abgesagt', ''],
};

export default async function EventsPage() {
  const { guild } = await requireGuild();

  const [[einstellung], events] = await Promise.all([
    sql`select default_lock_minutes from guild where id = ${guild.id}`,
    sql`
    select e.id, e.comp_name, e.title, e.starts_at, e.status,
           count(s.slot_index) filter (where s.assigned_discord_id is not null)::int as filled,
           count(s.slot_index)::int as total,
           (select count(*) from signup where event_id = e.id and status = 'yes')::int as signups
    from event e
    left join event_slot s on s.event_id = e.id
    where e.guild_id = ${guild.id}
    group by e.id
    order by e.starts_at desc
    limit 40
  `,
  ]);

  const sperrfrist = einstellung?.default_lock_minutes ?? 10;

  return (
    <>
      <h1>Events</h1>
      <p className="subtitle">
        Timer werden im Discord mit <code>/timer</code> erstellt. Hier siehst du live, wer sich
        angemeldet hat und wo er landen würde.
      </p>

      <div className="card">
        <div className="spread">
          <div>
            <strong>Standard-Sperrfrist: {sperrfrist} Minuten</strong>
            <div className="small muted">
              So lange vor Start friert die Aufstellung ein und alle werden gepingt. Gilt für neue
              Timer; bei <code>/timer</code> schlägt das Feld <code>lock</code> diesen Wert weiter.
              Laufende Events behalten ihre Frist.
            </div>
          </div>
          <form action={setDefaultLock} className="row">
            <input type="hidden" name="guild_id" value={guild.id} />
            <input
              name="minutes"
              type="number"
              min={0}
              max={180}
              defaultValue={sperrfrist}
              className="ip-data"
              style={{ width: 90 }}
            />
            <button type="submit">Speichern</button>
          </form>
        </div>
      </div>

      {events.length === 0 && <p className="muted">Noch keine Events.</p>}

      {events.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Start</th>
                <th>Comp</th>
                <th style={{ width: 130 }}>Status</th>
                <th style={{ width: 110 }}>Besetzt</th>
                <th style={{ width: 110 }}>Angemeldet</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const [label, className] = STATUS_LABEL[event.status] ?? [event.status, ''];
                return (
                  <tr key={event.id}>
                    <td>
                      <Link href={`/events/${event.id}`}>
                        {new Date(event.starts_at).toLocaleString('de-DE', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </Link>
                    </td>
                    <td>{event.title || event.comp_name}</td>
                    <td>
                      <span className={`badge ${className}`}>{label}</span>
                    </td>
                    <td>
                      {event.filled}/{event.total}
                    </td>
                    <td>{event.signups}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
