# Albion Comp Bot

Timer im Discord, Anmeldung per Knopf, und der Bot verteilt die Waffen auf die
Leute, die sie am besten spielen.

- **Member** tragen im Discord mit `/waffen` ein, welche Waffen sie können und
  wie gut (1–10). Sonst haben sie mit dem Dashboard nichts zu tun.
- **Der Leader** baut im Dashboard die Comps (Waffe × Anzahl × Priorität) und
  sieht dort live, wer wo landen würde.
- **Der Bot** postet den Timer, sammelt Anmeldungen, rechnet die Aufstellung bei
  jeder Änderung neu und friert sie kurz vor Start ein — mit Ping, wer was
  spielt. Wie kurz, stellt der Leader im Dashboard ein (Standard 10 Minuten).

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
- **Ein Platz kann mehrere Waffen zulassen.** Axt *oder* Realmbreaker tun
  dasselbe — im Comp-Editor trägst du unter der Zeile Alternativen ein.
  Besetzt wird der Platz trotzdem nur einmal, und zwar auf der Waffe, die die
  Person am besten kann. Solange er frei ist, stehen alle zugelassenen Waffen
  dran; sobald jemand drauf steht, nur noch dessen.
- **Wer keine der zugelassenen Waffen im Profil hat, wird nie zugeordnet** — er
  landet auf der Bank, egal wie leer der Slot ist.
- **Festlegungen des Leaders gewinnen.** Ein im Dashboard festgenagelter Spieler
  bleibt stehen, der Rest wird drumherum neu optimiert.
- Die Bank ist nach dem besten Skill auf einer der gesuchten Waffen sortiert —
  oben steht, wer als Erster nachrückt.

## Einrichtung

### 1. Datenbank (Supabase)

> Für das eingerichtete Projekt ist das **komplett erledigt** —
> 9 Tabellen mit RLS, alle Migrationen eingespielt, 139 Waffen importiert.
> Bot und Dashboard sind darauf umgestellt. Diese Anleitung gilt für ein
> neues Projekt.

1. Auf [supabase.com](https://supabase.com) ein Projekt anlegen.
2. Im **SQL Editor** den Inhalt von `db/schema.sql` einfügen und ausführen —
   das legt alle Tabellen an. Die Waffen kommen später per Knopfdruck im
   Dashboard dazu.
   Bei einer Datenbank, die schon vor diesen Nachträgen angelegt wurde,
   zusätzlich `db/002_bot_status.sql` bis `db/011_comp_bild_ping.sql` der Reihe
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
- **Message Content Intent** ist eingeschaltet (Bot → Privileged Gateway
  Intents). Die braucht nur das Balance-Board: `!balance` und `!leaderboard`
  stehen als normale Nachrichten im Kanal, und ohne diese Berechtigung kämen
  sie beim Bot inhaltsleer an. Wer nur die Slash-Befehle nutzt, kann sie
  auslassen — die laufen auch ohne.

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

> **Immer nur einen Bot laufen lassen.** Zwei Instanzen mit demselben Token
> schreiben dieselbe Timer-Nachricht abwechselnd in ihrem eigenen Stand um und
> streiten sich um jede Anmeldung — von außen sieht das aus, als würde der Bot
> zwischen zwei Versionen hin- und herspringen. Der Bot warnt beim Start, wenn
> das letzte Lebenszeichen jünger als 15 Sekunden ist. Läuft er schon auf
> bot-hosting.net, ihn lokal also erst starten, wenn er dort gestoppt ist.

### 4. Online stellen

**Dashboard → Vercel:** Repo zu GitHub pushen, auf
[vercel.com](https://vercel.com) mit GitHub anmelden, das Repo importieren.
Wichtig: als **Root Directory** `dashboard` angeben.

> **Region.** `dashboard/vercel.json` heftet die Serverfunktionen auf `fra1`
> (Frankfurt), weil die Supabase-Datenbank in `eu-central-1` steht. Ohne das
> rechnet Vercel in seiner Standardregion `iad1` (Washington) — jede
> Datenbankabfrage macht dann rund 100 ms Atlantiküberflug, und eine Seite
> macht mehrere nacheinander. Steht die Datenbank woanders, die Region hier
> anpassen. Prüfen lässt sich das am Antwort-Header `X-Vercel-Id`: der zweite
> Teil ist die Region, in der ausgeführt wurde. Alle Werte aus `.env.local`
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
| `BOTHOST_API_KEY` | [bot-hosting.net/a/developer](https://bot-hosting.net/a/developer), Rechte `files:write` (Dateien schreiben), `deployments:power` (neu starten) und `deployments:read` (Konsole mitlesen) |
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
| `/timer <comp> <zeit>`     | Offis   | Timer mit Anmeldung erstellen                               |
| `/event abmeldungen`       | Offis   | Wer hat zugesagt und dann abgesagt — nur für dich sichtbar   |
| `/event absagen`           | Ersteller | Timer absagen                                             |

Das Feld *zeit* bei `/timer` versteht:

| Eingabe | Bedeutung |
| --- | --- |
| `20:30` · `20.30` · `2030` | heute um 20:30, falls schon vorbei: morgen |
| `20` | heute um 20:00 — eine blosse Zahl ist die volle Stunde |
| `+45` · `45m` | in 45 Minuten |
| `2h` · `1h30` · `1.5h` | in zwei bzw. anderthalb Stunden |

Ein führendes `+` ist bei jeder Dauer erlaubt, also auch `+2h` und `+90m`.
Ohne `+` bleibt eine bloße Zahl die Uhrzeit: `20` ist 20:00, `+20` sind zwanzig
Minuten.
| `14.08 20:30` | nächstes Vorkommen dieses Datums |
| `14.08.2026 20:30` | genau dieses Datum |

Uhrzeiten gelten in der Zeitzone aus `TIMEZONE`; im Discord sieht danach jeder
seine eigene Ortszeit. Der Bot spiegelt die verstandene Zeit in der Bestätigung
zurück — wer sich vertippt, sieht es sofort statt erst beim Start.

Zahlen über 23 sind keine Stunde: auf `90` kommt der Hinweis, dass wohl `90m`
gemeint war. Und wenn die Sperrfrist fast so lang ist wie der Vorlauf (`/timer`
in 11 Minuten bei 10 Minuten Sperre), warnt er — sonst friert die Aufstellung
ein, bevor sich jemand anmelden konnte.

**Rechte gelten immer nur für einen Server.** Timer erstellen darf, wer dort
*Server verwalten* hat oder im Dashboard unter **Zugang** eingetragen ist —
sonst niemand. Es gibt bewusst kein serverübergreifendes Recht: wer den Bot
betreibt, sieht deswegen keine fremden Comps, Profile oder Kontostände.

**Absagen darf nur, wer den Timer erstellt hat** — auch kein Offizier sonst.
Der Knopf steht zwar unter jeder Nachricht, weist aber jeden anderen ab und
nennt den Ersteller. Die Kehrseite: ist derjenige nicht erreichbar, lässt sich
der Timer im Discord nicht mehr stoppen und friert zur Sperrfrist mit Ping ein.

### Item-Bilder statt Emojis

Jede Waffe trägt ihr echtes Albion-Item-Bild — in der Aufstellung, im Ping
beim Einfrieren und im Fragebogen. Möglich macht das Discords
*Application Emojis*: die App darf bis zu 2000 eigene Emojis besitzen und
überall benutzen, wo sie schreibt, ohne dass die auf einem Server liegen.

```bash
cd bot && node scripts/sync-emojis.mjs
```

Holt zu jeder Waffe mit Item-ID das offizielle Render von Albion, lädt es
hoch und schreibt die Auszeichnung nach `weapon.emoji`. Mehrfach ausführbar:
Vorhandenes wird wiederverwendet, nach einem Waffen-Nachtrag also einfach
nochmal laufen lassen. `--alle` lädt auch Vorhandenes neu, `--weg` löscht
alles wieder (die Anzeige fällt dann von selbst auf die Kategorie-Emojis
zurück).

Stand: **136 von 139**. Ohne Bild bleiben `Battlemount` und `Scout` — beides
keine Waffen — sowie `Black Hands`: für dessen Item-ID hat Albions
Render-Dienst auf keiner Tier-Stufe ein Bild. Die ID ist nachweislich richtig
(sie steht so im offiziellen Item-Dump), es fehlt auf deren Seite.

### Warum `/event` ein Befehl ist und kein Knopf

Knöpfe hängen an der **Nachricht**, nicht am Betrachter — alle sehen
dieselben. Es gibt keine Einstellung, die einen Knopf für einzelne Leute
ausblendet. Slash-Befehle dagegen blendet Discord aus, wenn die Berechtigung
fehlt. Deshalb liegen „Absagen" und die Abmeldungsliste dort und nicht mehr
unter dem Timer.

`/event` verlangt **Server verwalten**. Wer nur im Dashboard unter *Zugang*
freigeschaltet ist, sieht den Befehl damit nicht — Discord kennt unsere
Zugangsliste nicht. Für solche Leute lässt er sich einmalig unter
*Servereinstellungen → Integrationen → Albion Bot* freigeben.

Geprüft wird trotzdem im Bot: `abmeldungen` nur für Offiziere, `absagen` nur
für den Ersteller. Das Ausblenden ist Bequemlichkeit, nicht die Absicherung.

### Die Skala im Waffenprofil

`/waffen` fragt Kategorie für Kategorie ab: erst ankreuzen, was du spielen
kannst, dann pro Waffe den Skill. Die Zahlen sind nicht Geschmackssache —
ohne feste Bedeutung hält sich der eine für eine 7 und der nächste mit
demselben Können für eine 4, und der Bot rechnet mit beidem, als wäre es
dasselbe Maß. Der Schnitt liegt bei 7: ab da steht Fullspec.

| | |
| --- | --- |
| `10` | Fullspec · beherrsche ich blind |
| `9` | Fullspec · sehr sicher |
| `8` | Fullspec · sitzt |
| `7` | Fullspec · noch am Üben |
| `6` | Specs angefangen, will ich lernen |
| `5` | Grundlagen da, brauche Übung |
| `4` | schon gespielt, aber selten |
| `3` | kaum Erfahrung |
| `2` | nur mal ausprobiert |
| `1` | zur Not, wenn sonst niemand da ist |

Es gab mal ein `/waffe` für einzelne Waffen. Bei 139 Waffen war dessen
Autovervollständigung unbrauchbar — der Fragebogen ersetzt es vollständig.

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

### Bild und Ping je Comp

Auf der Comp-Seite lässt sich ein **Bild-Link** hinterlegen — der hängt beim
Timer unter der Aufstellung — und ein **Ping** wählen: kein Ping, `@here` oder
`@everyone`.

Der Ping steht bewusst als Text *über* dem Embed und nicht darin: Erwähnungen
innerhalb eines Embeds werden zwar hervorgehoben, lösen aber **keine**
Benachrichtigung aus. Das ist eine Eigenheit von Discord. Genau deshalb sind die
Spieler in der Aufstellung als `@Name` geschrieben — das sieht besser aus und
pingt niemanden, während der eine echte Ping oben steht.

Beides wird beim Anlegen ins Event eingefroren, genau wie die Slots: ändert
jemand die Comp, bleibt ein laufender Timer, wie er war.

### Sperrfrist

### Balance aus heißt weg

Ist das Board unter *Balance* ausgeschaltet, registriert der Bot `/balance`
und `/leaderboard` auf diesem Server gar nicht erst — sie stehen dann nicht
in der Befehlsauswahl. `!balance` und `!leaderboard` werden stillschweigend
ignoriert, und die Blätter-Knöpfe an älteren Ranglisten tun nichts mehr.

Der Umweg ist nötig, weil ein Slash-Befehl sich nicht ignorieren lässt:
antwortet der Bot nicht, zeigt Discord „Die Anwendung hat nicht geantwortet".
Der Schalter greift binnen fünf Sekunden — der Poll merkt die Änderung und
registriert die Befehle neu.

Unter *Events* steht ganz oben die **Standard-Sperrfrist** dieses Servers: so
lange vor Start friert die Aufstellung ein und alle werden gepingt. Wer immer
mit 15 Minuten fährt, stellt sie einmal ein statt sie bei jedem `/timer`
mitzutippen. Das Feld `lock` bei `/timer` schlägt den Wert für einen einzelnen
Timer weiter; laufende Events behalten ihre Frist, die wird beim Anlegen
eingefroren.

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

Zwei Wege, in dieser Reihenfolge geprüft:

1. **Discord-Recht „Server verwalten"** auf dem betreffenden Server — kommt
   automatisch rein, muss nirgends eingetragen werden.
2. **Freischaltung unter *Zugang*** im Dashboard. Dort kann jeder Berechtigte
   weitere Leute für *seinen* Server freischalten — entweder per Klick aus der
   Liste derer, die den Bot dort schon benutzt haben, oder per Discord-ID.

Ein serverübergreifendes Recht gibt es **nicht** — auch nicht für den Betreiber.
Früher konnte `OFFICER_IDS` das: wer dort stand, sah im Dashboard jeden Server,
auf dem der Bot sitzt, und war dort als Admin markiert. Die Variable wird nicht
mehr ausgewertet.

Freigeschaltete sehen alles ihres Servers: Comps, Events und die Waffenprofile
aller Member. Andere Server bleiben unsichtbar.

Unter *Spieler* lässt sich der **Skill fremder Waffen nachbessern** — für den
Fall, dass sich jemand falsch einschätzt. `—` nimmt die Waffe aus dem Profil.
Neue Waffen kann dort niemand *hinzufügen*: eintragen tut jeder selbst mit
`/waffen`. Sonst könnte man jemandem eine Waffe unterschieben, die er nie
angegeben hat, und ihn damit auf einen Slot stellen, den er nicht spielen kann.

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
