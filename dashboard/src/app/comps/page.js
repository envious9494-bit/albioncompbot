import Link from 'next/link';

import { sql } from '@/lib/db';
import { requireOfficerPage } from '@/lib/guards';
import { createComp, deleteComp } from './actions';

export const dynamic = 'force-dynamic';

export default async function CompsPage() {
  await requireOfficerPage();

  const comps = await sql`
    select c.id,
           c.name,
           c.notes,
           coalesce(sum(s.count), 0)::int as size,
           count(s.id)::int as lines
    from comp c
    left join comp_slot s on s.comp_id = c.id
    group by c.id, c.name, c.notes
    order by c.name
  `;

  return (
    <>
      <h1>Comps</h1>
      <p className="subtitle">
        Eine Comp ist eine Liste aus Waffen mit Anzahl und Priorität. Im Discord wird sie mit
        <code style={{ margin: '0 4px' }}>/timer</code> ausgewählt.
      </p>

      <div className="card">
        <form action={createComp} className="row">
          <input name="name" placeholder="Name, z.B. ZvZ 20er" required style={{ flex: 1 }} />
          <button type="submit">Neue Comp</button>
        </form>
      </div>

      {comps.length === 0 && (
        <p className="muted">Noch keine Comp angelegt.</p>
      )}

      {comps.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 100 }}>Plätze</th>
                <th style={{ width: 110 }}>Waffenarten</th>
                <th style={{ width: 170 }} />
              </tr>
            </thead>
            <tbody>
              {comps.map((comp) => (
                <tr key={comp.id}>
                  <td>
                    <Link href={`/comps/${comp.id}`}>{comp.name}</Link>
                    {comp.notes && <div className="small muted">{comp.notes}</div>}
                  </td>
                  <td>{comp.size}</td>
                  <td>{comp.lines}</td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <Link className="btn btn-ghost small" href={`/comps/${comp.id}`}>
                        Bearbeiten
                      </Link>
                      <form action={deleteComp}>
                        <input type="hidden" name="comp_id" value={comp.id} />
                        <button type="submit" className="btn-danger small">
                          Löschen
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
