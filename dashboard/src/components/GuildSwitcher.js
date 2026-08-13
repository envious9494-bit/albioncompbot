'use client';

import { useRef } from 'react';

import { selectGuild } from '@/app/actions/guild';

/** Serverauswahl in der Seitenleiste. Bei nur einem Server nur der Name. */
export default function GuildSwitcher({ guilds, current }) {
  const formRef = useRef(null);

  if (guilds.length <= 1) {
    return (
      <div className="small muted" style={{ padding: '0 10px 12px' }}>
        {current?.name ?? current?.id ?? 'Kein Server'}
      </div>
    );
  }

  return (
    <form ref={formRef} action={selectGuild} style={{ padding: '0 10px 12px' }}>
      <select
        name="guild_id"
        defaultValue={current?.id}
        onChange={() => formRef.current?.requestSubmit()}
        style={{ width: '100%' }}
        aria-label="Server wählen"
      >
        {guilds.map((guild) => (
          <option key={guild.id} value={guild.id}>
            {guild.name ?? guild.id}
          </option>
        ))}
      </select>
    </form>
  );
}
