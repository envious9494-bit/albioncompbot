import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL fehlt. Trag den Connection-String aus Supabase in die .env ein.');
  process.exit(1);
}

// prepare:false ist noetig, weil Supabase im Transaction-Pooler-Modus (Port 6543)
// keine Prepared Statements unterstuetzt. Mit dem Session-Pooler schadet es nicht.
export const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.PGSSL === 'disable' ? false : 'require',
  prepare: false,
  max: 4,
  idle_timeout: 30,
  connect_timeout: 15,
});

/** Legt den Spieler an oder aktualisiert seinen Anzeigenamen. */
export async function upsertPlayer(discordId, displayName) {
  await sql`
    insert into player (discord_id, display_name)
    values (${discordId}, ${displayName})
    on conflict (discord_id) do update
      set display_name = excluded.display_name,
          updated_at = now()
  `;
}

// Die Waffenliste aendert sich selten, wird im Fragebogen aber bei jedem Klick
// gebraucht - deshalb ein paar Sekunden Zwischenspeicher.
let weaponCache = null;
let weaponCacheUntil = 0;
const WEAPON_CACHE_MS = 30_000;

/** Alle aktiven Waffen, fuer Autocomplete und Anzeige. */
export async function getWeapons() {
  if (weaponCache && Date.now() < weaponCacheUntil) return weaponCache;

  weaponCache = await sql`
    select id, name, category, icon, item_id, aliases, sort_order
    from weapon
    where active
    order by sort_order, name
  `;
  weaponCacheUntil = Date.now() + WEAPON_CACHE_MS;
  return weaponCache;
}

/** Waffenprofil eines Spielers als Map weaponId -> Skill. */
export async function getPlayerWeapons(discordId) {
  const rows = await sql`
    select weapon_id, rating from player_weapon where discord_id = ${discordId}
  `;
  return new Map(rows.map((row) => [row.weapon_id, row.rating]));
}

/** Setzt einen einzelnen Skill. rating = null loescht die Waffe aus dem Profil. */
export async function setRating(discordId, weaponId, rating) {
  if (rating == null) {
    await sql`delete from player_weapon where discord_id = ${discordId} and weapon_id = ${weaponId}`;
    return;
  }
  await sql`
    insert into player_weapon (discord_id, weapon_id, rating)
    values (${discordId}, ${weaponId}, ${rating})
    on conflict (discord_id, weapon_id) do update set rating = excluded.rating
  `;
}

/**
 * Gleicht die Auswahl einer Fragebogen-Seite ab: abgehakte Waffen kommen mit
 * Standardwert dazu, abgewaehlte fliegen raus. Waffen ausserhalb dieser Seite
 * bleiben unberuehrt.
 */
export async function syncGroupSelection(discordId, groupWeaponIds, selectedIds, defaultRating) {
  if (groupWeaponIds.length === 0) return;
  const selected = new Set(selectedIds);
  const removed = groupWeaponIds.filter((id) => !selected.has(id));

  await sql.begin(async (tx) => {
    if (removed.length) {
      await tx`
        delete from player_weapon
        where discord_id = ${discordId} and weapon_id in ${tx(removed)}
      `;
    }
    if (selected.size) {
      const rows = [...selected].map((weaponId) => ({
        discord_id: discordId,
        weapon_id: weaponId,
        rating: defaultRating,
      }));
      // do nothing: ein schon vorhandener Skill soll nicht auf den Standard zurueckfallen
      await tx`
        insert into player_weapon ${tx(rows, 'discord_id', 'weapon_id', 'rating')}
        on conflict (discord_id, weapon_id) do nothing
      `;
    }
  });
}

/** Comps mit Slotanzahl, fuer die Autocomplete-Liste bei /timer. */
export async function getComps() {
  return sql`
    select c.id,
           c.name,
           coalesce(sum(s.count), 0)::int as size
    from comp c
    left join comp_slot s on s.comp_id = c.id
    group by c.id, c.name
    order by c.name
  `;
}

/**
 * Erstellt das Event und friert die Comp in event_slot ein.
 * Spaetere Aenderungen an der Vorlage beruehren laufende Events damit nicht.
 */
export async function createEvent({ compId, compName, title, guildId, channelId, startsAt, lockMinutes, createdBy }) {
  return sql.begin(async (tx) => {
    const [event] = await tx`
      insert into event (comp_id, comp_name, title, guild_id, channel_id, starts_at, lock_minutes, created_by)
      values (${compId}, ${compName}, ${title}, ${guildId}, ${channelId}, ${startsAt}, ${lockMinutes}, ${createdBy})
      returning *
    `;

    const slots = await tx`
      select weapon_id, count, priority, label
      from comp_slot
      where comp_id = ${compId}
      order by sort_order, id
    `;

    const rows = [];
    let index = 0;
    for (const slot of slots) {
      for (let i = 0; i < slot.count; i++) {
        rows.push({
          event_id: event.id,
          slot_index: index++,
          weapon_id: slot.weapon_id,
          priority: slot.priority,
          label: slot.label,
        });
      }
    }

    if (rows.length === 0) {
      throw new Error('Diese Comp hat keine Slots. Leg im Dashboard erst Waffen an.');
    }

    await tx`insert into event_slot ${tx(rows, 'event_id', 'slot_index', 'weapon_id', 'priority', 'label')}`;
    return { ...event, slotCount: rows.length };
  });
}

/** Laedt alles, was fuer eine Neuberechnung und das Embed gebraucht wird. */
export async function loadEventState(eventId) {
  const [event] = await sql`select * from event where id = ${eventId}`;
  if (!event) return null;

  const slots = await sql`
    select s.slot_index, s.weapon_id, s.priority, s.label, s.locked_discord_id,
           w.name as weapon_name, w.category, w.icon
    from event_slot s
    join weapon w on w.id = s.weapon_id
    where s.event_id = ${eventId}
    order by s.slot_index
  `;

  const signups = await sql`
    select discord_id, display_name, status, created_at
    from signup
    where event_id = ${eventId}
    order by created_at
  `;

  // Ratings fuer alle Angemeldeten und alle festgenagelten Spieler
  const relevantIds = [
    ...new Set([
      ...signups.map((s) => s.discord_id),
      ...slots.map((s) => s.locked_discord_id).filter(Boolean),
    ]),
  ];

  const ratings = relevantIds.length
    ? await sql`
        select pw.discord_id, pw.weapon_id, pw.rating
        from player_weapon pw
        where pw.discord_id in ${sql(relevantIds)}
      `
    : [];

  // Namen auch fuer Spieler, die vom Leader festgenagelt, aber nicht angemeldet sind
  const people = relevantIds.length
    ? await sql`select discord_id, display_name from player where discord_id in ${sql(relevantIds)}`
    : [];

  return { event, slots, signups, ratings, people };
}

/** Schreibt das Ergebnis der Zuordnung zurueck. */
export async function saveAssignments(eventId, slots) {
  if (slots.length === 0) return;
  await sql.begin(async (tx) => {
    for (const slot of slots) {
      await tx`
        update event_slot
        set assigned_discord_id = ${slot.discordId},
            assigned_rating = ${slot.rating}
        where event_id = ${eventId} and slot_index = ${slot.slotIndex}
      `;
    }
  });
}

export async function setSignup(eventId, discordId, displayName, status) {
  await sql`
    insert into signup (event_id, discord_id, display_name, status)
    values (${eventId}, ${discordId}, ${displayName}, ${status})
    on conflict (event_id, discord_id) do update
      set status = excluded.status,
          display_name = excluded.display_name
  `;
}

export async function removeSignup(eventId, discordId) {
  await sql`delete from signup where event_id = ${eventId} and discord_id = ${discordId}`;
}

/**
 * Lebenszeichen fuer das Dashboard. Faellt still aus, wenn die Tabelle noch
 * fehlt (db/002_bot_status.sql nicht eingespielt) - der Bot soll deswegen
 * nicht stehenbleiben.
 */
export async function touchBotStatus(botTag, guildIds) {
  try {
    await sql`
      insert into bot_status (id, last_seen, bot_tag, guild_ids)
      values (1, now(), ${botTag}, ${guildIds})
      on conflict (id) do update
        set last_seen = now(),
            bot_tag = excluded.bot_tag,
            guild_ids = excluded.guild_ids
    `;
  } catch (error) {
    if (error.code !== '42P01') throw error; // 42P01 = Tabelle existiert nicht
  }
}

export async function getOpenEvents() {
  return sql`select id, starts_at, lock_minutes, status, render_hash from event where status = 'open' order by starts_at`;
}

export async function setRenderHash(eventId, hash) {
  await sql`update event set render_hash = ${hash} where id = ${eventId}`;
}

export async function lockEvent(eventId) {
  await sql`update event set status = 'locked', locked_at = now() where id = ${eventId}`;
}

export async function cancelEvent(eventId) {
  await sql`update event set status = 'cancelled' where id = ${eventId}`;
}

export async function setMessageId(eventId, messageId) {
  await sql`update event set message_id = ${messageId} where id = ${eventId}`;
}

export async function getEventByMessage(messageId) {
  const [event] = await sql`select * from event where message_id = ${messageId}`;
  return event ?? null;
}
