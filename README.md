# Albion Comp Bot

Timer im Discord, Anmeldung per Knopf, und der Bot verteilt die Waffen auf die
Leute, die sie am besten spielen.

- **Member** tragen im Discord mit `/waffen` ein, welche Waffen sie können und
  wie gut (1–10). Sonst haben sie mit dem Dashboard nichts zu tun.
- **Der Leader** baut im Dashboard die Comps (Waffe × Anzahl × Priorität) und
  sieht dort live, wer wo landen würde.
- **Der Bot** postet den Timer, sammelt Anmeldungen, rechnet die Aufstellung bei
  jeder Änderung neu und friert sie 10 Minuten vor Start ein — mit Ping, wer was
  spielt.

## Aufbau

Drei Teile, die sich eine Datenbank teilen. Einen direkten Draht zwischen Bot und
Dashboard gibt es nicht — die Datenbank ist die Verbindung.

| Ordner       | Was            | Läuft auf                 |
| ------------ | -------------- | ------------------------- |
| `bot/`       | Discord-Bot    | bot-hosting.net           |
| `dashboard/` | Weboberfläche  | Vercel                    |
| `db/`        | Schema         | Supabase (Postgres)       |

## Wie die Zuordnung funktioniert

Der naive Weg wäre, Slot für Slot den besten freien Spieler zu nehmen. Das geht
schief: der beste Healer ist oft auch der beste Tank — wird er zuerst als Tank
vergeben, steht auf Heal nur noch eine 4.

Stattdessen wird das **globale Optimum** gesucht, also die Zuordnung mit der
höchsten Gesamtsumme über alle Slots (Ungarischer Algorithmus, siehe
`bot/src/matching.js`). Dazu:

- **Priorität 1–5 pro Slot.** Auf einem Prio-1-Slot zählt ein Skillpunkt doppelt
  so viel wie auf Prio 5. Wenn zu wenige da sind, bleiben die unwichtigen Slots
  zuerst leer.
- **Wer die Waffe nicht im Profil hat, wird nie zugeordnet** — er landet auf der
  Bank, egal wie leer der Slot ist.
- **Festlegungen des Leaders gewinnen.** Ein im Dashboard festgenagelter Spieler
  bleibt stehen, der Rest wird drumherum neu optimiert.
- Die Bank ist nach dem besten Skill auf einer der gesuchten Waffen sortiert —
  oben steht, wer als Erster nachrückt.

## Einrichtung

### 1. Datenbank (Supabase)

> Für das Projekt `yzbphovtcwecerrlsqmh` ist das **komplett erledigt** —
> 9 Tabellen mit RLS, alle Migrationen eingespielt, 139 Waffen importiert.
> Bot und Dashboard sind darauf umgestellt. Diese Anleitung gilt für ein
> neues Projekt.

1. Auf [supabase.com](https://supabase.com) ein Projekt anlegen.
2. Im **SQL Editor** den Inhalt von `db/schema.sql` einfügen und ausführen —
   das legt alle Tabellen an. Die Waffen kommen später per Knopfdruck im
   Dashboard dazu.
   Bei einer Datenbank, die schon vor diesen Nachträgen angelegt wurde,
   zusätzlich `db/002_bot_status.sql` bis `db/005_multi_guild.sql` der Reihe
   nach einspielen.
3. Beim Ausführen fragt Supabase nach **Row Level Security**. Antwort:
   *Run and enable RLS*. Warum das wichtig ist, steht unten.
4. Oben auf **Connect → Direct connection string → Transaction pooler** und den
   String kopieren. Das `[YOUR-PASSWORD]` durch das echte Datenbank-Passwort
   ersetzen — das ist das, was du bei der Projekterstellung gesetzt hast.
   Supabase zeigt es nachträglich nicht mehr an; wenn es weg ist, unter
   *Database → Settings → Reset database password* ein neues setzen.

Der Transaction Pooler (Port 6543) ist die richtige Wahl: die Direktverbindung
läuft über IPv6, was auf Vercel und bot-hosting.net Ärger macht. Deshalb setzen
beide Teile `prepare: false` — Prepared Statements kann der Pooler nicht.

**Zu RLS:** Supabase stellt jede Tabelle im Schema `public` zusätzlich über eine
öffentliche REST-Schnittstelle bereit. Ohne Row Level Security könnte damit
jeder, der den (absichtlich öffentlichen) anon-Key kennt, alle Waffenprofile und
Aufstellungen lesen und ändern. Mit aktivem RLS und ohne Policies kommen `anon`
und `authenticated` an gar nichts. Bot und Dashboard verbinden sich als Rolle
`postgres`, die RLS ohnehin umgeht (`rolbypassrls`) — für sie ändert sich also
nichts.

### 2. Discord-App

> Für die App **Albion Bot** (`1537191851545858088`) ist das **weitgehend
> erledigt** — siehe unten, was noch fehlt.

Im [Developer Portal](https://discord.com/developers/applications) eine
Application anlegen. Daraus kommen:

| Wo                                    | Was                     |
| ------------------------------------- | ----------------------- |
| General Information → Application ID  | `DISCORD_CLIENT_ID` / `AUTH_DISCORD_ID` |
| Bot → Token → Reset Token             | `DISCORD_TOKEN`         |
| OAuth2 → Client Secret                | `AUTH_DISCORD_SECRET`   |
| Rechtsklick auf deinen Server         | `DISCORD_GUILD_ID`      |

Für die Server-ID muss in Discord unter *Einstellungen → Erweitert* der
Entwicklermodus an sein.

**Schon eingestellt:**

- Redirect-URLs für `localhost:3100` und `localhost:3000`. Nach dem ersten
  Deploy kommt `https://DEINE-DOMAIN.vercel.app/api/auth/callback/discord`
  als dritter Eintrag dazu.
- Der Bot steht auf **privat** — nur du kannst ihn auf einen Server holen.
  Discord verlangt dafür, dass der Installations-Link unter *Installation* auf
  „Keine" steht; deshalb läuft die Einladung über die URL unten.
- Nur **Gildeninstallation**, keine Nutzerinstallation.
- Keine Privileged Intents nötig — der Bot kommt mit `Guilds` aus und liest
  keine Nachrichteninhalte.

**Bot einladen:** am einfachsten über das Dashboard. Nach dem Login kommt die
Serverauswahl; dort steht neben jedem Server ohne Bot ein Einladen-Knopf. Der
Link dahinter lautet:

```
https://discord.com/oauth2/authorize?client_id=1537191851545858088&permissions=216064&integration_type=0&scope=bot+applications.commands
```

`permissions=216064` sind genau: Kanäle ansehen, Nachrichten senden, Links
einbetten, Nachrichtenverlauf anzeigen, Alle erwähnen. Mehr braucht er nicht —
kein Kicken, kein Bannen, keine Rollenverwaltung.

### 3. Lokal starten

```bash
cd dashboard && npm install && cp .env.example .env.local
```

`.env.local` ausfüllen (`AUTH_SECRET` erzeugst du mit `npx auth secret`), dann:

```bash
npm run dev
```

Und in einem zweiten Fenster:

```bash
cd bot && npm install && cp .env.example .env && npm start
```

Beim Start registriert der Bot seine Slash-Commands auf deinem Server — das
dauert ein paar Sekunden, dann sind sie im Discord da.

### 4. Online stellen

**Dashboard → Vercel:** Repo zu GitHub pushen, auf
[vercel.com](https://vercel.com) mit GitHub anmelden, das Repo importieren.
Wichtig: als **Root Directory** `dashboard` angeben. Alle Werte aus `.env.local`
als Environment Variables eintragen, `DEV_LOGIN` weglassen. Nach dem ersten
Deploy die Vercel-Adresse als zweite Redirect-URL im Discord-Portal ergänzen.

**Bot → bot-hosting.net:** Deployment mit Quelle *GitHub* aus diesem Repo
anlegen, Runtime Node.js. Zwei Einstellungen entscheiden, ob er startet:

- **Startup → Entry file:** `bot/src/index.js` — nicht die Vorgabe `index.js`,
  der Einstiegspunkt liegt hier eine Ebene tiefer. Dafür gibt es die
  `package.json` in der Wurzel: ohne sie fände der Hoster weder Abhängigkeiten
  noch einen Startbefehl.
- **Env → Raw .env:** den Inhalt von `bot/.env` einfügen. `DASHBOARD_URL` auf
  die Vercel-Adresse zeigen lassen.

### Automatisch ausliefern

Der Hoster klont das Repo nur einmal. Im Container liegt danach kein Git — ein
`git pull` gibt es dort also nicht, und sein *GitHub sync*-Knopf im
Dateibrowser müsste jedes Mal von Hand gedrückt werden.

Stattdessen erledigt das
[`.github/workflows/bot-ausliefern.yml`](.github/workflows/bot-ausliefern.yml):
bei jedem Push auf `main`, der `bot/` berührt, laufen erst die Tests, dann
schiebt [`push-to-host.mjs`](.github/scripts/push-to-host.mjs) die Dateien über
die Hoster-API hoch und startet neu. Danach liest es die Konsole mit und bricht
ab, wenn dort binnen 90 Sekunden kein `Eingeloggt als …` auftaucht — sonst wäre
jede Auslieferung grün, auch wenn der Bot beim Start sofort wieder stirbt.

Dafür braucht das Repo zwei Secrets unter *Settings → Secrets and variables →
Actions*:

| Secret | Woher |
| --- | --- |
| `BOTHOST_API_KEY` | [bot-hosting.net/developer](https://bot-hosting.net/developer) → *Manage API keys*, Rechte `files:write` und `deployments:power` |
| `BOTHOST_DEPLOYMENT` | die ID aus der Adresszeile des Deployments |

Geschickt wird nur, was git kennt — Lokales und vor allem die `.env` bleiben
draußen. Die Zugangsdaten stehen in den Umgebungsvariablen des Hosters und
werden nie überschrieben. Gelöschte Dateien bleiben als Leichen auf dem Server
liegen; das Skript schreibt nur.

> Im Free-Tier von bot-hosting.net wird der Server neu aufgesetzt, wenn die
> Coins ausgehen. Deshalb liegen alle Daten in Supabase und keine Timer im
> Speicher — der Bot nimmt laufende Events nach einem Neustart von selbst wieder
> auf.

## Befehle

| Befehl                     | Wer     | Was                                                        |
| -------------------------- | ------- | ---------------------------------------------------------- |
| `/waffen`                  | alle    | Fragebogen: Kategorie wählen, ankreuzen, Skill per Knopf setzen |
| `/waffe <waffe> <0–10>`    | alle    | Einzelne Waffe schnell setzen; `0` entfernt sie             |
| `/timer <comp> <zeit>`     | Offis   | Timer mit Anmeldung erstellen                               |

Bei `/timer` versteht das Feld *zeit*: `20:30`, `14.08 20:30`,
`14.08.2026 20:30` und `+45` (in 45 Minuten, praktisch zum Ausprobieren).
Uhrzeiten gelten in der Zeitzone aus `TIMEZONE`; im Discord sieht danach jeder
seine eigene Ortszeit.

Wer Timer erstellen darf, steht in `OFFICER_IDS`. Ist die Liste leer, darf jeder
mit dem Recht *Server verwalten*.

## Dashboard

| Seite     | Was                                                                 |
| --------- | ------------------------------------------------------------------- |
| Events    | laufende und vergangene Timer, live wer wo steht                     |
| Comps     | Vorlagen bauen: Waffe, Anzahl, Priorität                             |
| Spieler   | wer welche Waffen eingetragen hat, und wer noch gar keine            |
| Waffen    | die Waffenliste pflegen                                              |
| Balance   | Gold-Konten: Schalter, Berechtigte, Kontostände, Buchungen           |
| Zugang    | wer für diesen Server ins Dashboard darf                            |

Die Seite **Einrichtung** ist der Startpunkt: sie zeigt, ob der Bot läuft und
auf welchen Servern er sitzt, ob `DISCORD_GUILD_ID` und `OFFICER_IDS` gesetzt
sind, und liefert die IDs zum Kopieren. Der Bot meldet sich dafür alle fünf
Sekunden in der Tabelle `bot_status`; bleibt das Lebenszeichen länger als eine
Minute aus, gilt er als aus.

### Mehrere Discord-Server

Der Bot bedient beliebig viele Server gleichzeitig. **Jeder Server hat seine
eigenen Comps, Events, Anmeldungen und Waffenprofile** — nichts davon ist
zwischen Servern sichtbar. Geteilt ist nur die Waffenliste, weil Albion-Waffen
überall dieselben sind.

Wer mehrere Server verwaltet, wählt oben links in der Seitenleiste aus.

Technisch steckt das nicht in getrennten Tabellen, sondern in einer
Server-Kennung auf jeder Zeile. Ein neuer Server braucht deshalb keine
Datenbankänderung: Bot einladen, fertig.

### Wer ins Dashboard darf

Drei Wege, in dieser Reihenfolge geprüft:

1. **Discord-Recht „Server verwalten"** auf dem betreffenden Server — kommt
   automatisch rein, muss nirgends eingetragen werden.
2. **Freischaltung unter *Zugang*** im Dashboard. Dort kann jeder Berechtigte
   weitere Leute für *seinen* Server freischalten — entweder per Klick aus der
   Liste derer, die den Bot dort schon benutzt haben, oder per Discord-ID.
3. **`OFFICER_IDS`** in der Konfiguration. Das gilt auf *allen* Servern und ist
   für den Betreiber des Bots gedacht. Für den normalen Betrieb kann es leer
   bleiben.

Freigeschaltete sehen alles ihres Servers: Comps, Events und die Waffenprofile
aller Member. Andere Server bleiben unsichtbar.

In der Event-Ansicht kannst du pro Slot einen Spieler festnageln. Der Bot
übernimmt das innerhalb von fünf Sekunden und rechnet den Rest drumherum neu.

### Waffenliste

Alle **137 Spielerwaffen**, direkt aus den Albion-Datendumps
([ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps)) — nichts von
Hand abgetippt. Sortiert in 17 Familien:

Schwerter · Äxte · Streitkolben · Hämmer · Kampfstäbe · Speere · Dolche ·
Kriegshandschuhe · Bögen · Armbrüste · Feuerstäbe · Heiligenstäbe · Naturstäbe ·
Arkanstäbe · Froststäbe · Fluchstäbe · Gestaltwandlerstäbe

Eingetragen wird das im Dashboard unter *Waffen* mit **Aus Albion-Daten
aktualisieren**. Der Abgleich läuft über den Namen: bekannte Waffen bekommen
Familie, Symbol und Item-Kennung aktualisiert, neue kommen dazu. Kurzformen, der
Aktiv-Haken und **die Waffenprofile deiner Member bleiben unangetastet**. Nach
einem Albion-Patch einfach noch einmal draufklicken.

Weil jede Familie höchstens neun Waffen hat, passt im Discord-Fragebogen jede
Familie in ein einziges Auswahlmenü — kein Blättern.

**Bilder:** liegen als PNG in `dashboard/public/items/` (136 Stück, 4,1 MB),
geladen von der Albion-Render-API. Der Dateiname ist die Item-Kennung, also
`T4_2H_HOLYSTAFF.png`. Für *Black Hands* hat die API auf keiner Tier-Stufe ein
Bild; dort zeigt das Dashboard das Familiensymbol. Zum Aktualisieren nach einem
Patch:

```bash
curl -s "https://render.albiononline.com/v1/item/T4_2H_HOLYSTAFF.png?size=128" -o dashboard/public/items/T4_2H_HOLYSTAFF.png
```

Waffen, die schon in einer Comp oder in einem Profil stecken, werden beim
Löschen nur deaktiviert — sonst würde es bestehende Aufstellungen zerreißen.

## Tests

```bash
cd bot && node --test test/matching.test.js
```

Prüft den Zuordnungsalgorithmus: dass das globale Optimum die gierige Variante
schlägt, dass Prioritäten greifen, dass Festlegungen gewinnen und dass niemand
auf zwei Slots landet.

## Lokale Testdatenbank

Statt Supabase kann lokal eine Postgres im Docker laufen:

```bash
docker run -d --name albion-pg -e POSTGRES_PASSWORD=albion -e POSTGRES_DB=albion -p 55432:5432 postgres:16-alpine
```

Schema einspielen:

```bash
docker exec -i albion-pg psql -U postgres -d albion < db/schema.sql
```

In `.env.local` dann `DATABASE_URL=postgres://postgres:albion@localhost:55432/albion`
und `PGSSL=disable` setzen. Mit `DEV_LOGIN=1` gibt es auf der Startseite einen
Test-Login ohne Discord — der funktioniert ausschließlich lokal und lässt sich
auf Vercel technisch nicht einschalten.

Wieder loswerden:

```bash
docker rm -f albion-pg
```
