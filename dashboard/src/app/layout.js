import './globals.css';

import { Inter, JetBrains_Mono } from 'next/font/google';

// Dieselben Schriften wie im Noxa-Dashboard: Inter fuer alles, JetBrains Mono
// ausschliesslich fuer gemessene Werte (Betraege, IDs, Zeiten, Skills).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Albion Comp',
  description: 'Aufstellungen für die Gilde',
};

/**
 * Nur das Geruest. Die Seitenleiste haengt an der Gruppe (dashboard) - die
 * Anmeldung und die Serverauswahl sollen sie bewusst nicht haben.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="de" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
