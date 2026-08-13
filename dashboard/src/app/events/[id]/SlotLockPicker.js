'use client';

import { useState, useTransition } from 'react';

import { setSlotLock } from '../actions';

/**
 * Dropdown pro Slot. "Automatisch" ueberlaesst den Platz der Optimierung,
 * jede andere Auswahl nagelt den Spieler fest (📌 im Discord-Embed).
 */
export default function SlotLockPicker({ eventId, slotIndex, lockedId, candidates, disabled }) {
  const [value, setValue] = useState(lockedId ?? '');
  const [pending, startTransition] = useTransition();

  function handleChange(event) {
    const next = event.target.value;
    setValue(next);
    startTransition(async () => {
      await setSlotLock(eventId, slotIndex, next || null);
    });
  }

  return (
    <select value={value} onChange={handleChange} disabled={disabled || pending}>
      <option value="">Automatisch</option>
      {candidates.map((candidate) => (
        <option key={candidate.discordId} value={candidate.discordId}>
          {candidate.displayName}
          {candidate.rating != null ? ` (${candidate.rating})` : ' (kein Skill)'}
        </option>
      ))}
    </select>
  );
}
