import { redirect } from 'next/navigation';

import { auth } from '@/auth';

/**
 * Das Dashboard ist Leitungssache. Waffenprofile pflegen die Member im
 * Discord mit /waffen - hier kommt nur rein, wer in OFFICER_IDS steht.
 */
export async function requireOfficerPage() {
  const session = await auth();
  if (!session) redirect('/');
  if (!session.user.isOfficer) redirect('/kein-zutritt');
  return session;
}

/** Fuer Server Actions - dort ist ein Redirect unpassend, wir wollen einen Fehler. */
export async function requireOfficerAction() {
  const session = await auth();
  if (!session) throw new Error('Nicht angemeldet.');
  if (!session.user.isOfficer) throw new Error('Dafuer fehlen dir die Rechte.');
  return session;
}
