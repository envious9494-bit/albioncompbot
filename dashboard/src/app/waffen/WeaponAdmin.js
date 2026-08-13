'use client';

import { useMemo, useState } from 'react';

import WeaponIcon from '@/components/WeaponIcon';
import { importWeapons, saveWeapons } from './actions';

let nextKey = 1;

export default function WeaponAdmin({ initialWeapons, categories }) {
  const [rows, setRows] = useState(() =>
    initialWeapons.map((weapon) => ({ ...weapon, key: nextKey++ })),
  );
  const [removedIds, setRemovedIds] = useState([]);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null); // null | 'speichern' | 'import'

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      `${row.name} ${row.aliases} ${row.category}`.toLowerCase().includes(needle),
    );
  }, [rows, filter]);

  function update(key, patch) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [
      {
        key: nextKey++,
        id: null,
        name: '',
        category: 'Sonstiges',
        itemId: null,
        icon: null,
        aliases: '',
        active: true,
      },
      ...prev,
    ]);
    setFilter('');
  }

  function removeRow(key) {
    const row = rows.find((entry) => entry.key === key);
    if (row?.id) setRemovedIds((prev) => [...prev, row.id]);
    setRows((prev) => prev.filter((entry) => entry.key !== key));
  }

  function uebernehmen(weapons) {
    setRows(weapons.map((weapon) => ({ ...weapon, key: nextKey++ })));
    setRemovedIds([]);
  }

  async function save() {
    setBusy('speichern');
    setStatus(null);
    try {
      const result = await saveWeapons(
        rows.map(({ key, ...row }) => row),
        removedIds,
      );
      uebernehmen(result.weapons);
      setStatus(
        result.deactivated.length
          ? `Gespeichert. Noch in Benutzung und daher nur deaktiviert: ${result.deactivated.join(', ')}.`
          : 'Gespeichert.',
      );
    } catch (error) {
      setStatus(`Fehler: ${error.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function importieren() {
    setBusy('import');
    setStatus(null);
    try {
      const result = await importWeapons();
      uebernehmen(result.weapons);
      const teile = [`${result.neu} neu`, `${result.aktualisiert} aktualisiert`];
      if (result.fremd.length) {
        teile.push(`nicht in den Albion-Daten und unverändert gelassen: ${result.fremd.join(', ')}`);
      }
      setStatus(teile.join(' · '));
    } catch (error) {
      setStatus(`Fehler: ${error.message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Waffe oder Familie suchen…"
            style={{ flex: 1, minWidth: 200 }}
          />
          <button type="button" className="btn-ghost" onClick={addRow} disabled={Boolean(busy)}>
            + Waffe
          </button>
          <button type="button" onClick={importieren} disabled={Boolean(busy)}>
            {busy === 'import' ? 'Lädt…' : 'Aus Albion-Daten aktualisieren'}
          </button>
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>
          Der Knopf trägt alle Spielerwaffen aus den Albion-Daten ein — Familie, Symbol und Bild.
          Kurzformen, der Aktiv-Haken und die Waffenprofile deiner Member bleiben unangetastet.
        </div>
      </div>

      <div className="card">
        <div className="small muted" style={{ marginBottom: 8 }}>
          {visible.length} von {rows.length} Waffen
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }} />
              <th>Name</th>
              <th style={{ width: 180 }}>Familie</th>
              <th style={{ width: 170 }}>Kurzformen</th>
              <th style={{ width: 60 }}>Aktiv</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key}>
                <td>
                  <WeaponIcon itemId={row.itemId} icon={row.icon} name={row.name} />
                </td>
                <td>
                  <input
                    value={row.name}
                    onChange={(event) => update(row.key, { name: event.target.value })}
                    style={{ width: '100%' }}
                  />
                </td>
                <td>
                  <input
                    list="waffenfamilien"
                    value={row.category}
                    onChange={(event) => update(row.key, { category: event.target.value })}
                    style={{ width: '100%' }}
                  />
                </td>
                <td>
                  <input
                    value={row.aliases}
                    onChange={(event) => update(row.key, { aliases: event.target.value })}
                    placeholder="GH, Great Holy"
                    style={{ width: '100%' }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row.active}
                    onChange={(event) => update(row.key, { active: event.target.checked })}
                    style={{ width: 16, height: 16 }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => removeRow(row.key)}
                    aria-label="Entfernen"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <datalist id="waffenfamilien">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </div>

      <div className="sticky-save">
        <button type="button" onClick={save} disabled={Boolean(busy)}>
          {busy === 'speichern' ? 'Speichert…' : 'Waffenliste speichern'}
        </button>
        {status && <span className="small muted">{status}</span>}
      </div>
    </>
  );
}
