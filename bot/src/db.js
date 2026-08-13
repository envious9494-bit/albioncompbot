import postgres from 'postgres';

// Bewusst kein process.exit hier: dieses Modul wird auch von Dateien
// importiert, die reine Hilfsfunktionen enthalten, und die sollen sich ohne
// Datenbank testen lassen. Ob die Zugangsdaten da sind, prueft src/index.js
// beim Start - dort gehoert der Abbruch hin.
const VERBINDUNG = process.env.DATABASE_URL || 'postgres://ohne-konfiguration/none';

// prepare:false ist noetig, weil Supabase im Transaction-Pooler-Modus (Port 6543)
// keine Prepared Statements unterstuetzt. Mit dem Session-Pooler schadet es nicht.
export const sql = postgres(VERBINDUNG, {
  ssl: process.env.PGSSL === 'disable' ? false : 'require',
  prepare: false,
  max: 4,
  idle_timeout: 30,
  connect_timeout: 15,
});

// =====================================================================
//  Server (Gilden)
//
//  Fast alles haengt an einer Server-ID: Comps, Events, Spieler und deren
//  Waffenprofile. Nur die Waffenliste selbst ist geteilt.
// =====================================================================

/** Traegt den Server ein oder frischt Name und Zeitstempel auf. */
export async function upsertGuild(guildId, name, icon = null) {
  await sql`
    insert into guild (id, name, icon)
    values (${guildId}, ${name}, ${icon})
    on conflict (id) do update
      set name = excluded.name,
          icon = excluded.icon,
          last_seen = now()
  `;
}

/**
 * Standard-Sperrfrist dieses Servers in Minuten, einstellbar im Dashboard.
 * Faellt auf 10 zurueck, solange db/008_default_lock.sql nicht eingespielt
 * ist - der Bot soll deswegen keine Timer verweigern.
 */
export async function getDefaultLockMinutes(guildId) {
  try {
    const [row] = await sql`select default_lock_minutes from guild where id = ${guildId}`;
    return row?.default_lock_minutes ?? 10;
  } catch (error) {
    if (error.code === '42703') return 10; // Spalte existiert nicht
    throw error;
  }
}

/** Steht die Person auf der Zugangsliste dieses Servers? */
export async function hasGuildAccess(guildId, discordId) {
  const [row] = await sql`
    select 1 from guild_access where guild_id = ${guildId} and discord_id = ${discordId}
  `;
  return Boolean(row);
}

// =====================================================================
//  Spieler und Waffenprofile
// =====================================================================

/** Legt den Spieler auf diesem Server an oder aktualisiert seinen Namen. */
export async function upsertPlayer(guildId, discordId, displayName) {
  await sql`
    insert into player (guild_id, discord_id, display_name)
    values (${guildId}, ${discordId}, ${displayName})
    on conflict (guild_id, discord_id) do update
      set display_name = excluded.display_name,
          updated_at = now()
  `;
}

// Die Waffenliste aendert sich selten, wird im Fragebogen und bei jeder
// Autovervollstaendigung aber staendig gebraucht. Discord verwirft
// Autovervollstaendigungen nach drei Sekunden, deshalb darf der Abruf nie
// auf die Datenbank warten: ist der Zwischenspeicher abgelaufen, wird der
// alte Stand sofort zurueckgegeben und im Hintergrund erneuert.
let weaponCache = null;
let weaponCacheUntil = 0;
let weaponRefresh = null;
const WEAPON_CACHE_MS = 60_000;

function ladeWaffen() {
  return sql`
    select id, name, category, icon, item_id, aliases, sort_order
    from weapon
    where active
    order by sort_order, name
  `;
}

/** Alle aktiven Waffen. Serveruebergreifend - Albion-Waffen sind ueberall gleich. */
export async function getWeapons() {
  if (weaponCache && Date.now() < weaponCacheUntil) return weaponCache;

  if (!weaponRefresh) {
    weaponRefresh = ladeWaffen()
      .then((rows) => {
        weaponCache = rows;
        weaponCacheUntil = Date.now() + WEAPON_CACHE_MS;
        return rows;
      })
      .catch((error) => {
        // Nicht weiterwerfen, solange ein alter Stand da ist - lieber leicht
        // veraltete Waffen anzeigen als eine kaputte Autovervollstaendigung.
        if (weaponCache) {
          console.error('Waffenliste konnte nicht erneuert werden:', error.message);
          return weaponCache;
        }
        throw error;
      })
      .finally(() => {
        weaponRefresh = null;
      });
  }

  return weaponCache ?? weaponRefresh;
}

/** Waffenprofil eines Spielers auf diesem Server als Map weaponId -> Skill. */
export async function getPlayerWeapons(guildId, discordId) {
  const rows = await sql`
    select weapon_id, rating
    from player_weapon
    where guild_id = ${guildId} and discord_id = ${discordId}
  `;
  return new Map(rows.map((row) => [row.weapon_id, row.rating]));
}

/** Setzt einen einzelnen Skill. rating = null loescht die Waffe aus dem Profil. */
export async function setRating(guildId, discordId, weaponId, rating) {
  if (rating == null) {
    await sql`
      delete from player_weapon
      where guild_id = ${guildId} and discord_id = ${discordId} and weapon_id = ${weaponId}
    `;
    return;
  }
  await sql`
    insert into player_weapon (guild_id, discord_id, weapon_id, rating)
    values (${guildId}, ${discordId}, ${weaponId}, ${rating})
    on conflict (guild_id, discord_id, weapon_id) do update set rating = excluded.rating
  `;
}

/**
 * Gleicht die Auswahl einer Fragebogen-Seite ab: abgehakte Waffen kommen mit
 * Standardwert dazu, abgewaehlte fliegen raus. Waffen ausserhalb dieser Seite
 * bleiben unberuehrt.
 */
export async function syncGroupSelection(guildId, discordId, groupWeaponIds, selectedIds, defaultRating) {
  if (groupWeaponIds.length === 0) return;
  const selected = new Set(selectedIds);
  const removed = groupWeaponIds.filter((id) => !selected.has(id));

  await sql.begin(async (tx) => {
    if (removed.length) {
      await tx`
        delete from player_weapon
        where guild_id = ${guildId} and discord_id = ${discordId} and weapon_id in ${tx(removed)}
      `;
    }
    if (selected.size) {
      const rows = [...selected].map((weaponId) => ({
        guild_id: guildId,
        discord_id: discordId,
        weapon_id: weaponId,
        rating: defaultRating,
      }));
      // do nothing: ein schon vorhandener Skill soll nicht auf den Standard zurueckfallen
      await tx`
        insert into player_weapon ${tx(rows, 'guild_id', 'discord_id', 'weapon_id', 'rating')}
        on conflict (guild_id, discord_id, weapon_id) do nothing
      `;
    }
  });
}

// =====================================================================
//  Comps und Events
// =====================================================================

/** Comps dieses Servers mit Slotanzahl, fuer die Autocomplete-Liste bei /timer. */
export async function getComps(guildId) {
  return sql`
    select c.id,
           c.name,
           coalesce(sum(s.count), 0)::int as size
    from comp c
    left join comp_slot s on s.comp_id = c.id
    where c.guild_id = ${guildId}
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
    // Sicherstellen, dass die Comp wirklich zu diesem Server gehoert
    const [comp] = await tx`select id from comp where id = ${compId} and guild_id = ${guildId}`;
    if (!comp) throw new Error('Diese Comp gehört nicht zu diesem Server.');

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

  // Ratings fuer alle Angemeldeten und alle festgenagelten Spieler -
  // ausschliesslich aus der Gilde dieses Events
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
        where pw.guild_id = ${event.guild_id} and pw.discord_id in ${sql(relevantIds)}
      `
    : [];

  const people = relevantIds.length
    ? await sql`
        select discord_id, display_name
        from player
        where guild_id = ${event.guild_id} and discord_id in ${sql(relevantIds)}
      `
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

export async function getOpenEvents() {
  return sql`
    select id, starts_at, lock_minutes, status, render_hash
    from event
    where status = 'open'
    order by starts_at
  `;
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

/**
 * Lebenszeichen fuer das Dashboard. Faellt still aus, wenn die Tabelle noch
 * fehlt (db/002_bot_status.sql nicht eingespielt) - der Bot soll deswegen
 * nicht stehenbleiben.
 */
/**
 * Wie viele Sekunden ist das letzte Lebenszeichen her? null, wenn es noch
 * keines gibt oder die Tabelle fehlt.
 *
 * Gedacht fuer den Start: ist das Lebenszeichen frisch, laeuft anderswo noch
 * ein Bot mit demselben Token. Beide schreiben dann dieselben Nachrichten
 * abwechselnd um, und beide streiten sich um jede Anmeldung.
 */
export async function secondsSinceLastHeartbeat() {
  try {
    const [row] = await sql`
      select extract(epoch from (now() - last_seen)) as alter_sekunden
      from bot_status where id = 1
    `;
    return row ? Number(row.alter_sekunden) : null;
  } catch (error) {
    if (error.code === '42P01') return null; // Tabelle existiert nicht
    throw error;
  }
}

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
