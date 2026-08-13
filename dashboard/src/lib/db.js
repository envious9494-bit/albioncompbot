import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL fehlt - siehe .env.example.');
}

// Im Dev-Modus laedt Next das Modul bei jeder Aenderung neu. Ohne den Cache
// auf globalThis wuerde dabei jedes Mal ein neuer Verbindungspool entstehen,
// bis Supabase die Verbindungen ablehnt.
const globalForDb = globalThis;

export const sql =
  globalForDb.__albionSql ??
  postgres(process.env.DATABASE_URL, {
    ssl: process.env.PGSSL === 'disable' ? false : 'require',
    prepare: false, // noetig fuer den Transaction-Pooler von Supabase
    max: 4,
    idle_timeout: 30,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__albionSql = sql;
}
