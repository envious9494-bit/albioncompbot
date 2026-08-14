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

    // max: 1 statt 4. Auf Vercel laeuft jede Anfrage in einer eigenen
    // Funktionsinstanz, die danach eingefroren oder verworfen wird - ihre
    // Verbindungen bleiben am Server als halboffen stehen, und der Pooler
    // haelt den Platz besetzt. Mit vier Verbindungen je Instanz ist der
    // Pool nach ein paar Aufrufen voll, neue Anfragen warten dann bis zum
    // Timeout. Eine Instanz braucht ohnehin nie mehr als eine.
    max: 1,
    // Kurz halten, damit eine Verbindung schnell zurueckgegeben wird,
    // solange die Instanz noch lebt.
    idle_timeout: 10,
    // Nicht ewig auf einer Verbindung sitzen bleiben, die niemand mehr
    // schliesst - der Server merkt das sonst erst nach Stunden.
    max_lifetime: 60 * 5,
    // Ohne Frist wartet eine haengende Verbindung sehr lange, und die Seite
    // haengt mit. Nach 15 Sekunden lieber mit einem Fehler abbrechen - den
    // sieht man, ein Ladebalken ohne Ende sagt nichts.
    connect_timeout: 15,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__albionSql = sql;
}
