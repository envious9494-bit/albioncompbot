import Link from 'next/link';
import { notFound } from 'next/navigation';

import { sql } from '@/lib/db';
import { requireGuild } from '@/lib/guilds';
import SlotEditor from './SlotEditor';

export const dynamic = 'force-dynamic';

export default async function CompEditorPage({ params }) {
  const { guild } = await requireGuild();
  const { id } = await params;
  const compId = Number(id);
  if (!Number.isInteger(compId)) notFound();

  const [comps, weapons, slots, coverageRows] = await Promise.all([
    sql`select id, name, notes from comp where id = ${compId} and guild_id = ${guild.id}`,
    sql`select id, name, category, item_id, icon from weapon where active order by sort_order, name`,
    sql`select weapon_id, count, priority, label from comp_slot where comp_id = ${compId} order by sort_order, id`,
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
