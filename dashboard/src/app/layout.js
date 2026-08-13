import './globals.css';

export const metadata = {
  title: 'Albion Comp',
  description: 'Aufstellungen fuer die Gilde',
};

/**
 * Nur das Geruest. Die Seitenleiste haengt an der Gruppe (dashboard) - die
 * Anmeldung und die Serverauswahl sollen sie bewusst nicht haben.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
