import Link from 'next/link';
import { notFound } from 'next/navigation';

import { sql } from '@/lib/db';
import { requireGuild } from '@/lib/guilds';
import SlotEditor from './SlotEditor';
import { setCompMeta } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CompEditorPage({ params }) {
  const { guild } = await requireGuild();
  const { id } = await params;
  const compId = Number(id);
  if (!Number.isInteger(compId)) notFound();

  const [comps, weapons, slots, coverageRows] = await Promise.all([
    sql`select id, name, notes, image_url, ping from comp where id = ${compId} and guild_id = ${guild.id}`,
    sql`select id, name, category, item_id, icon from weapon where active order by sort_order, name`,
    sql`select weapon_id, alt_weapon_ids, count, priority, label from comp_slot where comp_id = ${compId} order by sort_order, id`,
    sql`select weapon_id, count(*)::int as players from player_weapon where guild_id = ${guild.id} group by weapon_id`,
  ]);

  const comp = comps[0];
  if (!comp) notFound();

  const coverage = Object.fromEntries(coverageRows.map((row) => [row.weapon_id, row.players]));

  return (
    <>
      <div className="spread">
        <div>
          <h1>{comp.name}</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            Priorität 1 heißt: dieser Platz wird zuerst besetzt und Skill zählt dort am meisten.
          </p>
        </div>
        <Link className="btn btn-ghost" href="/comps">
          Zurück
        </Link>
      </div>

      <div style={{ height: 20 }} />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Bild und Ping</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Das Bild hängt unter der Aufstellung im Timer. Der Ping steht als Text über dem Embed —
          anders geht es nicht: Erwähnungen <em>im</em> Embed werden zwar hervorgehoben,
          benachrichtigen aber niemanden.
        </p>

        <form action={setCompMeta} className="row" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
          <input type="hidden" name="comp_id" value={compId} />

          <label style={{ flex: '1 1 320px' }}>
            <span className="small muted">Bild-Link</span>
            <input
              name="image_url"
              type="url"
              defaultValue={comp.image_url ?? ''}
              placeholder="https://…/aufstellung.png"
            />
          </label>

          <label>
            <span className="small muted">Ping beim Posten</span>
            <select name="ping" defaultValue={comp.ping ?? 'none'}>
              <option value="none">kein Ping</option>
              <option value="here">@here</option>
              <option value="everyone">@everyone</option>
            </select>
          </label>

          <button type="submit">Speichern</button>
        </form>

        {comp.image_url && (
          <img
            src={comp.image_url}
            alt=""
            style={{ marginTop: 12, maxWidth: '100%', maxHeight: 200, objectFit: 'contain' }}
          />
        )}
      </div>

      <SlotEditor
        compId={compId}
        weapons={weapons.map((weapon) => ({
          id: weapon.id,
          name: weapon.name,
          category: weapon.category,
          itemId: weapon.item_id,
          icon: weapon.icon,
        }))}
        initialSlots={slots.map((slot) => ({
          weaponId: slot.weapon_id,
          altWeaponIds: slot.alt_weapon_ids ?? [],
          count: slot.count,
          priority: slot.priority,
          label: slot.label ?? '',
        }))}
        initialNotes={comp.notes}
        coverage={coverage}
      />
    </>
  );
}
