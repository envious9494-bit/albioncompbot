'use client';

import { useState } from 'react';

/**
 * Item-Bild aus public/items. Fehlt eines (die Albion-Render-API kennt nicht
 * jedes Item), wird auf das Symbol der Waffenfamilie zurueckgefallen.
 */
export default function WeaponIcon({ itemId, icon, name, size = 30 }) {
  const [kaputt, setKaputt] = useState(false);

  if (!itemId || kaputt) {
    return (
      <span
        title={name}
        style={{
          width: size,
          height: size,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.6),
          flex: '0 0 auto',
        }}
      >
        {icon || '•'}
      </span>
    );
  }

  return (
    <img
      src={`/items/${itemId}.png`}
      alt=""
      title={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setKaputt(true)}
      style={{ width: size, height: size, flex: '0 0 auto', objectFit: 'contain' }}
    />
  );
}
