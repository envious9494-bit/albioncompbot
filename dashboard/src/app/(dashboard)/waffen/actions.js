'use server';

import { revalidatePath } from 'next/cache';

import weaponData from '@/data/weapons.json';
import { sql } from '@/lib/db';
import { getAccessibleGuilds } from '@/lib/guilds';

/** Die Waffenliste gilt fuer alle Server - es reicht, irgendwo Zugang zu haben. */
async function requireAnyGuild() {
  const { session, guilds } = await getAccessibleGuilds();
  if (!session) throw new Error('Nicht angemeldet.');
  if (guilds.length === 0) throw new Error('Dafür fehlen dir die Rechte.');
  return session;
}

/**
 * Traegt die Waffenliste aus den Albion-Daten ein.
 *
 * Abgeglichen wird ueber den Namen: bekannte Waffen bekommen Familie, Symbol
 * und Item-Kennung aktualisiert, neue kommen dazu. Kurzformen und der
 * Aktiv-Haken bleiben, wie der Leader sie gesetzt hat - und Spielerprofile
 * werden ueberhaupt nicht angefasst, weil die an der weapon-id haengen.
 *
 * Waffen, die in der Datenbank stehen, aber nicht in den Albion-Daten (etwa
 * selbst angelegte wie "Battlemount"), bleiben unveraendert und werden nur
 * gemeldet.
 */
export async function importWeapons() {
  await requireAnyGuild();

  const rows = weaponData.map((weapon) => ({
    name: weapon.name,
    category: weapon.category,
    item_id: weapon.itemId,
    icon: weapon.icon,
    sort_order: weapon.sortOrder,
  }));

  const vorher = await sql`select name from weapon`;
  const bekannt = new Set(vorher.map((row) => row.name));

  await sql`
    insert into weapon ${sql(rows, 'name', 'category', 'item_id', 'icon', 'sort_order')}
    on conflict (name) do update
      set category = excluded.category,
          item_id = excluded.item_id,
          icon = excluded.icon,
          sort_order = excluded.sort_order
  `;

  const neu = rows.filter((row) => !bekannt.has(row.name));
  const ausDenDaten = new Set(rows.map((row) => row.name));
  const fremd = vorher.map((row) => row.name).filter((name) => !ausDenDaten.has(name));

  revalidatePath('/waffen');
  return {
    neu: neu.length,
    aktualisiert: rows.length - neu.length,
    fremd,
    weapons: await ladeWaffen(),
  };
}

async function ladeWaffen() {
  const weapons = await sql`
    select id, name, category, item_id, icon, aliases, active
    from weapon
    order by sort_order, name
  `;
  return weapons.map((weapon) => ({
    id: weapon.id,
    name: weapon.name,
    category: weapon.category,
    itemId: weapon.item_id,
    icon: weapon.icon,
    aliases: (weapon.aliases ?? []).join(', '),
    active: weapon.active,
  }));
}

/**
 * Speichert die Waffenliste in einem Rutsch.
 *
 * Geloescht wird nur, wenn die Waffe nirgends mehr haengt. Steckt sie noch in
 * einer Comp oder in einem Spielerprofil, wird sie stattdessen auf inaktiv
 * gesetzt - sonst zerreisst es bestehende Aufstellungen.
 */
export async function saveWeapons(rows, removedIds) {
  await requireAnyGuild();

  const deactivated = [];

  await sql.begin(async (tx) => {
    for (const id of removedIds) {
      const [{ used }] = await tx`
        select (
          (select count(*) from comp_slot where weapon_id = ${id}) +
          (select count(*) from player_weapon where weapon_id = ${id}) +
          (select count(*) from event_slot where weapon_id = ${id})
        )::int as used
      `;

      if (used > 0) {
        const [weapon] = await tx`update weapon set active = false where id = ${id} returning name`;
        if (weapon) deactivated.push(weapon.name);
      } else {
        await tx`delete from weapon where id = ${id}`;
      }
    }

    for (const [index, row] of rows.entries()) {
      const name = (row.name || '').trim();
      if (!name) continue;

      const aliases = (row.aliases || '')
        .split(',')
        .map((alias) => alias.trim())
        .filter(Boolean);

      if (row.id) {
        await tx`
          update weapon
          set name = ${name},
              category = ${row.category},
              aliases = ${aliases},
              active = ${Boolean(row.active)},
              sort_order = ${index}
          where id = ${row.id}
        `;
      } else {
        await tx`
          insert into weapon (name, category, aliases, active, sort_order)
          values (${name}, ${row.category}, ${aliases}, ${Boolean(row.active)}, ${index})
          on conflict (name) do update
            set category = excluded.category,
                aliases = excluded.aliases,
                active = true
        `;
      }
    }
  });

  // Den frischen Stand zurueckgeben, damit der Client neu angelegten Zeilen
  // ihre echte id verpassen kann. Ohne das haetten sie weiterhin id = null und
  // liessen sich in derselben Sitzung nicht mehr loeschen.
  revalidatePath('/waffen');
  return { deactivated, weapons: await ladeWaffen() };
}
