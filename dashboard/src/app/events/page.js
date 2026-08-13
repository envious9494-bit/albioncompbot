import Link from 'next/link';

import { sql } from '@/lib/db';
import { requireOfficerPage } from '@/lib/guards';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  open: ['Anmeldung läuft', 'badge-open'],
  locked: ['Aufstellung steht', 'badge-locked'],
  cancelled: ['Abgesagt', ''],
};

export default async function EventsPage() {
  await requireOfficerPage();

  const events = await sql`
    select e.id, e.comp_name, e.title, e.starts_at, e.status,
           count(s.slot_index) filter (where s.assigned_discord_id is not null)::int as filled,
           count(s.slot_index)::int as total,
           (select count(*) from signup where event_id = e.id and status = 'yes')::int as signups
    from event e
    left join event_slot s on s.event_id = e.id
    group by e.id
    order by e.starts_at desc
    limit 40
  `;

  return (
    <>
      <h1>Events</h1>
      <p className="subtitle">
        Timer werden im Discord mit <code>/timer</code> erstellt. Hier siehst du live, wer sich
        angemeldet hat und wo er landen würde.
      </p>

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
