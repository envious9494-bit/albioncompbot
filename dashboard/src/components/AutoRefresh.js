'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Holt die Serverdaten regelmaessig nach, damit Anmeldungen live erscheinen. */
export default function AutoRefresh({ seconds = 5, enabled = true }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds, enabled]);

  return null;
}
