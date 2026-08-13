import weaponData from '@/data/weapons.json';
import { sql } from '@/lib/db';
import { requireGuild } from '@/lib/guilds';
import WeaponAdmin from './WeaponAdmin';

export const dynamic = 'force-dynamic';

export default async function WeaponsPage() {
  await requireGuild();

  const weapons = await sql`
    select id, name, category, item_id, icon, aliases, active
    from weapon
    order by sort_order, name
  `;

  const categories = [...new Set(weaponData.map((weapon) => weapon.category)), 'Sonstiges'];

  return (
    <>
      <h1>Waffen</h1>
      <p className="subtitle">
        Die Liste, aus der Spieler ihr Profil bauen und du deine Comps zusammenstellst.
      </p>

      {weapons.length === 0 && (
        <div className="notice">
          Noch keine Waffen in der Datenbank. Klick auf <strong>Aus Albion-Daten aktualisieren</strong>,
          dann sind alle {weaponData.length} Spielerwaffen drin.
        </div>
      )}

      <WeaponAdmin
        initialWeapons={weapons.map((weapon) => ({
          id: weapon.id,
          name: weapon.name,
          category: weapon.category,
          itemId: weapon.item_id,
          icon: weapon.icon,
          aliases: (weapon.aliases ?? []).join(', '),
          active: weapon.active,
        }))}
        categories={categories}
      />
    </>
  );
}
