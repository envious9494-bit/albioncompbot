'use client';

import { useRef, useState } from 'react';

/**
 * Nur-lesen-Feld mit Kopierknopf - fuer IDs, die in eine .env wandern.
 *
 * Der Zugriff auf die Zwischenablage ist nicht ueberall erlaubt (fehlende
 * Berechtigung, kein sicherer Kontext, Browser-Einstellung). Deshalb wird der
 * Text vorher markiert: klappt das Kopieren nicht, steht er wenigstens bereit
 * fuer Strg+C - und der Knopf sagt das auch, statt so zu tun als waere es
 * gelaufen.
 */
export default function CopyField({ value, label }) {
  const inputRef = useRef(null);
  const [state, setState] = useState('idle'); // idle | copied | selected

  async function copy() {
    // Erst markieren, und zwar sofort: falls der Zugriff auf die Zwischenablage
    // scheitert oder haengt, steht der Text trotzdem fuer Strg+C bereit.
    inputRef.current?.select();

    // Manche Browser lassen writeText weder scheitern noch fertig werden,
    // solange eine Berechtigungsabfrage offen ist. Nach einer Sekunde gilt es
    // deshalb als nicht bestaetigt, statt ohne Rueckmeldung zu bleiben.
    const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 1000));
    const write = navigator.clipboard
      ?.writeText(value)
      .then(() => true)
      .catch(() => false) ?? Promise.resolve(false);

    setState((await Promise.race([write, timeout])) ? 'copied' : 'selected');
    setTimeout(() => setState('idle'), 2500);
  }

  return (
    <div className="row">
      <input
        ref={inputRef}
        readOnly
        value={value}
        aria-label={label}
        onFocus={(event) => event.target.select()}
        style={{ flex: 1, fontFamily: 'monospace' }}
      />
      <button type="button" className="btn-ghost" onClick={copy} style={{ whiteSpace: 'nowrap' }}>
        {state === 'copied' ? 'Kopiert' : state === 'selected' ? 'Markiert – Strg+C' : 'Kopieren'}
      </button>
    </div>
  );
}
