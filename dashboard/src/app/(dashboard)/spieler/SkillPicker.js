'use client';

import { useState, useTransition } from 'react';

import { setPlayerRating } from './actions';

/**
 * Die Bedeutung der Stufen.
 *
 * Achtung: dieselbe Staffelung steht in bot/src/profile.js (SKILL_STUFEN)
 * und wird dort im Fragebogen angezeigt. Bot und Dashboard sind getrennte
 * Pakete, deshalb steht sie hier ein zweites Mal - wer sie aendert, muss
 * beide anfassen, sonst liest ein Member im Discord etwas anderes als der
 * Leader hier.
 */
const STUFEN = {
  10: 'Fullspec · beherrsche ich blind',
  9: 'Fullspec · sehr sicher',
  8: 'Fullspec · sitzt',
  7: 'Fullspec · noch am Üben',
  6: 'Specs angefangen, will ich lernen',
  5: 'Grundlagen da, brauche Übung',
  4: 'schon gespielt, aber selten',
  3: 'kaum Erfahrung',
  2: 'nur mal ausprobiert',
  1: 'zur Not, wenn sonst niemand da ist',
};

export default function SkillPicker({ guildId, discordId, weaponId, weaponName, rating }) {
  const [wert, setWert] = useState(rating);
  const [weg, setWeg] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [laeuft, starte] = useTransition();

  if (weg) return null;

  function aendern(neu) {
    const vorher = wert;
    setWert(neu);
    setFehler(null);

    starte(async () => {
      try {
        // Den Wert uebernehmen, den die Datenbank zurueckmeldet - nicht den,
        // den wir geschickt haben. Sonst zeigt das Feld eine 8, waehrend im
        // Profil weiter eine 1 steht, und im Discord taucht die 1 auf.
        const antwort = await setPlayerRating(guildId, discordId, weaponId, neu);
        if (!antwort.ok) {
          setWert(vorher);
          setFehler(antwort.fehler);
          return;
        }
        if (antwort.rating === 0) setWeg(true);
        else setWert(antwort.rating);
      } catch (error) {
        // Zuruecksetzen statt einen Wert stehenzulassen, den die Datenbank
        // gar nicht hat - sonst glaubt der Leader, er haette gespeichert.
        setWert(vorher);
        setFehler(error.message);
      }
    });
  }

  return (
    <span
      style={{ marginRight: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
      title={fehler ?? STUFEN[wert]}
    >
      {weaponName}
      <select
        value={wert}
        disabled={laeuft}
        aria-label={`Skill für ${weaponName}`}
        onChange={(event) => aendern(Number(event.target.value))}
        style={{
          padding: '0 2px',
          width: 46,
          borderColor: fehler ? 'hsl(var(--state-critical))' : undefined,
        }}
      >
        {Object.keys(STUFEN)
          .map(Number)
          .sort((a, b) => b - a)
          .map((stufe) => (
            <option key={stufe} value={stufe}>
              {stufe}
            </option>
          ))}
        <option value={0}>—</option>
      </select>
      {fehler && (
        <span className="small" style={{ color: 'hsl(var(--state-critical))' }}>
          {fehler}
        </span>
      )}
    </span>
  );
}
