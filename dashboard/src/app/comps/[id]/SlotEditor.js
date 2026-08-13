'use client';

import { useMemo, useState } from 'react';

import WeaponIcon from '@/components/WeaponIcon';
import { saveCompSlots } from '../actions';

const PRIORITIES = [
  { value: 1, label: '1 – kritisch' },
  { value: 2, label: '2 – wichtig' },
  { value: 3, label: '3 – normal' },
  { value: 4, label: '4 – nachrangig' },
  { value: 5, label: '5 – Bonus' },
];

let nextKey = 1;

export default function SlotEditor({ compId, weapons, initialSlots, initialNotes, coverage }) {
  const [slots, setSlots] = useState(() =>
    initialSlots.map((slot) => ({ ...slot, key: nextKey++ })),
  );
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const total = slots.reduce((sum, slot) => sum + (Number(slot.count) || 0), 0);

  const weaponById = useMemo(() => new Map(weapons.map((w) => [w.id, w])), [weapons]);

  // Bei 137 Waffen ist die Auswahl ohne Gruppierung unbenutzbar
  const byFamily = useMemo(() => {
    const groups = new Map();
    for (const weapon of weapons) {
      const family = weapon.category || 'Sonstiges';
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family).push(weapon);
    }
    return [...groups.entries()];
  }, [weapons]);

  function update(key, patch) {
    setSlots((prev) => prev.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)));
  }

  function addSlot() {
    setSlots((prev) => [
      ...prev,
      { key: nextKey++, weaponId: weapons[0]?.id ?? 0, count: 1, priority: 3, label: '' },
    ]);
  }

  function removeSlot(key) {
    setSlots((prev) => prev.filter((slot) => slot.key !== key));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const result = await saveCompSlots(compId, slots, notes);
      setStatus(`Gespeichert – ${result.slots} Plätze.`);
    } catch (error) {
      setStatus(`Fehler: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="card">
        <label className="small muted">Notiz (optional, nur hier sichtbar)</label>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="z.B. Standard-Setup für Castle-Fights"
          style={{ width: '100%', marginTop: 6 }}
        />
      </div>

      <div className="card">
        <div className="slot-head">
          <span />
          <span>Waffe</span>
          <span>Anzahl</span>
          <span>Priorität</span>
          <span>Bezeichnung (optional)</span>
          <span />
        </div>

        {slots.length === 0 && (
          <p className="muted small">Noch keine Waffe in dieser Comp.</p>
        )}

        {slots.map((slot) => {
          const players = coverage[slot.weaponId] ?? 0;
          const tight = players < Number(slot.count);

          return (
            <div key={slot.key}>
              <div className="slot-row">
                <WeaponIcon
                  itemId={weaponById.get(slot.weaponId)?.itemId}
                  icon={weaponById.get(slot.weaponId)?.icon}
                  name={weaponById.get(slot.weaponId)?.name}
                />
                <select
                  value={slot.weaponId}
                  onChange={(event) => update(slot.key, { weaponId: Number(event.target.value) })}
                >
                  {byFamily.map(([family, list]) => (
                    <optgroup key={family} label={family}>
                      {list.map((weapon) => (
                        <option key={weapon.id} value={weapon.id}>
                          {weapon.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={slot.count}
                  onChange={(event) => update(slot.key, { count: Number(event.target.value) })}
                />
                <select
                  value={slot.priority}
                  onChange={(event) => update(slot.key, { priority: Number(event.target.value) })}
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </select>
                <input
                  className="label-input"
                  value={slot.label ?? ''}
                  onChange={(event) => update(slot.key, { label: event.target.value })}
                  placeholder="z.B. Main Tank"
                />
                <button
                  type="button"
                  className="btn-danger remove-btn"
                  onClick={() => removeSlot(slot.key)}
                  aria-label="Zeile entfernen"
                >
                  ×
                </button>
              </div>
              <div className="prio" style={{ margin: '-4px 0 8px 2px' }}>
                {players === 0
                  ? '⚠️ niemand hat diese Waffe im Profil'
                  : tight
                    ? `⚠️ nur ${players} Spieler können das – Slot bleibt womöglich leer`
                    : `${players} Spieler können das`}
              </div>
            </div>
          );
        })}

        <button type="button" className="btn-ghost" onClick={addSlot} style={{ marginTop: 8 }}>
          + Waffe hinzufügen
        </button>
      </div>

      <div className="sticky-save">
        <button type="button" onClick={save} disabled={saving}>
          {saving ? 'Speichert…' : 'Comp speichern'}
        </button>
        <span className="badge">{total} Plätze</span>
        {status && <span className="small muted">{status}</span>}
      </div>
    </>
  );
}
