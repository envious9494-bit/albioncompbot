import Link from 'next/link';
import { notFound } from 'next/navigation';

import AutoRefresh from '@/components/AutoRefresh';
import WeaponIcon from '@/components/WeaponIcon';
import { sql } from '@/lib/db';
import { requireGuild } from '@/lib/guilds';
import { clearAllLocks } from '../actions';
import SlotLockPicker from './SlotLockPicker';

export const dynamic = 'force-dynamic';

export default async function EventPage({ params }) {
  const { session, guild } = await requireGuild();
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const [events, slots, signups, ratingRows] = await Promise.all([
    sql`select * from event where id = ${eventId} and guild_id = ${guild.id}`,
    sql`
      select s.slot_index, s.weapon_id, s.priority, s.label,
             s.locked_discord_id, s.assigned_discord_id, s.assigned_rating,
             w.name as weapon_name, w.category, w.icon, w.item_id
      from event_slot s
      join weapon w on w.id = s.weapon_id
      where s.event_id = ${eventId}
      order by s.slot_index
    `,
    sql`
      select discord_id, display_name, status
      from signup
      where event_id = ${eventId}
      order by created_at
    `,
    sql`
      select pw.discord_id, pw.weapon_id, pw.rating
      from player_weapon pw
      where pw.guild_id = ${guild.id}
        and pw.discord_id in (select discord_id from signup where event_id = ${eventId})
    `,
  ]);

  const event = events[0];
  if (!event) notFound();

  const nameById = new Map(signups.map((s) => [s.discord_id, s.display_name]));
  const ratingsByPlayer = new Map();
  for (const row of ratingRows) {
    if (!ratingsByPlayer.has(row.discord_id)) ratingsByPlayer.set(row.discord_id, new Map());
    ratingsByPlayer.get(row.discord_id).set(row.weapon_id, row.rating);
  }

  const attending = signups.filter((s) => s.status === 'yes');
  const maybes = signups.filter((s) => s.status === 'maybe');
  const assignedIds = new Set(slots.map((s) => s.assigned_discord_id).filter(Boolean));
  const bench = attending.filter((s) => !assignedIds.has(s.discord_id));

  const filled = slots.filter((s) => s.assigned_discord_id).length;
  const isOpen = event.status === 'open';

  return (
    <>
      <AutoRefresh seconds={5} enabled={isOpen} />

      <div className="spread">
        <div>
          <h1>{event.title || event.comp_name}</h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {new Date(event.starts_at).toLocaleString('de-DE', {
              dateStyle: 'full',
              timeStyle: 'short',
            })}{' '}
            · {event.comp_name} · {filled}/{slots.length} besetzt · {attending.length} angemeldet
          </p>
        </div>
        <Link className="btn btn-ghost" href="/events">
          Zurück
        </Link>
      </div>

      <div style={{ height: 20 }} />

      {!isOpen && (
        <div className="notice">
          {event.status === 'cancelled'
            ? 'Dieses Event wurde abgesagt.'
            : 'Die Aufstellung ist eingefroren – Änderungen wirken sich nicht mehr auf den Discord-Ping aus.'}
        </div>
      )}

      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Aufstellung</h2>
          {session.user.isOfficer && isOpen && (
            <form action={clearAllLocks}>
              <input type="hidden" name="event_id" value={eventId} />
              <button type="submit" className="btn-ghost small">
                Alle Festlegungen lösen
              </button>
            </form>
          )}
        </div>

        <div className="comp-grid">
          {slots.map((slot) => {
            const holder = slot.assigned_discord_id;
            const candidates = attending
              .map((s) => ({
                discordId: s.discord_id,
                displayName: s.display_name,
                rating: ratingsByPlayer.get(s.discord_id)?.get(slot.weapon_id) ?? null,
              }))
              .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));

            return (
              <div key={slot.slot_index} className={`comp-slot${holder ? '' : ' empty'}`}>
                <WeaponIcon
                  itemId={slot.item_id}
                  icon={slot.icon}
                  name={slot.weapon_name}
                  size={34}
                />
                <div>
                  <div className="weapon">
                    {slot.label ? `${slot.label} · ${slot.weapon_name}` : slot.weapon_name}
                  </div>
                  <div className="who">
                    {holder ? (
                      <>
                        {nameById.get(holder) ?? holder}
                        {slot.assigned_rating != null && ` · Skill ${slot.assigned_rating}`}
                        {slot.locked_discord_id === holder && ' · 📌 festgelegt'}
                      </>
                    ) : (
                      'frei'
                    )}
                  </div>
                  <div className="prio">Priorität {slot.priority}</div>
                </div>

                {session.user.isOfficer ? (
                  <SlotLockPicker
                    eventId={eventId}
                    slotIndex={slot.slot_index}
                    lockedId={slot.locked_discord_id}
                    candidates={candidates}
                    disabled={!isOpen}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Bank ({bench.length})</h2>
        {bench.length === 0 ? (
          <p className="muted small">Niemand – alle Angemeldeten haben einen Platz.</p>
        ) : (
          <p className="small">{bench.map((s) => s.display_name).join(', ')}</p>
        )}

        <h2>Vielleicht ({maybes.length})</h2>
        {maybes.length === 0 ? (
          <p className="muted small">Niemand.</p>
        ) : (
          <p className="small">{maybes.map((s) => s.display_name).join(', ')}</p>
        )}
      </div>
    </>
  );
}
