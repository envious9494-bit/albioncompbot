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

| Ordner | Was | Läuft als |
| --- | --- | --- |
| `bot/` | Discord-Bot | Dienst `albion-bot` |
| `dashboard/` | Weboberfläche | Dienst `albion-dashboard`, hinter Caddy |
| `db/` | Schema und Migrationen | lokale Postgres |
| `deploy/` | Dienste, Caddy-Block, Ausliefern | — |

Alles drei liegt auf einem eigenen Server (Hetzner, neben einem anderen
Projekt). Vorher lag der Bot auf bot-hosting.net, das Dashboard auf Vercel und
die Datenbank bei Supabase — dazu unten unter *Warum ein eigener Server*.

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

### 1. Datenbank

Eine Postgres, erreichbar nur über `localhost` — Bot und Dashboard laufen auf
demselben Rechner, von außen muss niemand herankommen.

```bash
sudo -u postgres createuser --pwprompt albion
sudo -u postgres createdb -O albion albion
psql "postgresql://albion:PASSWORT@127.0.0.1:5432/albion" -f db/schema.sql
```

Bei einer Datenbank, die schon vor späteren Nachträgen angelegt wurde,
zusätzlich `db/002_bot_status.sql` bis `db/012_abmeldungen.sql` der Reihe nach
einspielen.

In beiden `.env` dann:

```
DATABASE_URL=postgresql://albion:PASSWORT@127.0.0.1:5432/albion
PGSSL=disable
```

`PGSSL=disable`, weil die Verbindung den Rechner nie verlässt. Ohne das
verlangt der Treiber TLS und die Verbindung scheitert.

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

- Redirect-URLs für `localhost:3100`, `localhost:3000` und die öffentliche
  Adresse des Dashboards, also `https://DEINE-DOMAIN/api/auth/callback/discord`.
  Fehlt die letzte, bricht der Login mit „Invalid OAuth2 redirect_uri" ab.
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
> das letzte Lebenszeichen jünger als 15 Sekunden ist. Läuft er schon auf dem
> Server, vorher dort stoppen: `systemctl stop albion-bot`.

### 4. Online stellen

Beide Teile laufen als systemd-Dienst unter einem eigenen Nutzer; die
Unit-Dateien liegen in `deploy/`. Das Dashboard hört nur auf `127.0.0.1:3200`
— von außen kommt ausschließlich Caddy dran, und der bringt TLS mit.

```bash
bash deploy/deploy.sh
```

Das legt beim ersten Mal Nutzer und Dienste an, danach liefert es nur noch aus.
Was der Server braucht: Node ≥ 20, Postgres, Caddy.

**Caddy.** `deploy/albion.caddy` enthält den Block für das Dashboard. Er wird
per `import` eingebunden, statt in die Hauptdatei geschrieben zu werden — auf
demselben Server liegt noch ein anderes Projekt, und ein Fehler hier soll das
nicht mitreißen:

```
import /etc/caddy/albion.caddy
```

Vor dem Neuladen `caddy validate --config /etc/caddy/Caddyfile` laufen lassen.

> **Logdatei vorher anlegen.** Caddy darf sich seine Logdatei nicht selbst
> erzeugen; der Reload scheitert sonst mit „permission denied", und `caddy
> validate` merkt das nicht — es öffnet keine Dateien.
>
> ```bash
> install -o caddy -g caddy -m 644 /dev/null /var/log/caddy/albion.log
> ```

**DNS.** Ein `A`- und ein `AAAA`-Eintrag der Subdomain auf den Server. Sobald
sie auflösen, holt Caddy das Zertifikat von Let's Encrypt selbst.

### Warum ein eigener Server

Anfangs lag der Bot auf bot-hosting.net, das Dashboard auf Vercel und die
Datenbank bei Supabase. Das ist am Serverless-Modell gescheitert: Vercel
friert eine Funktion nach der Antwort ein, ohne ihre Postgres-Verbindung zu
schließen. Die blieb halboffen stehen und hielt Sperren; die Abfragen des Bots
liefen in `statement timeout` (Fehler 57014), und weil das Lebenszeichen als
Erstes geschrieben wird, wirkte er dabei kerngesund — nur aktualisierte kein
Timer mehr und keine Anmeldung kam an.

Ein Prozess, der einfach durchläuft, kennt das Problem nicht. Nebenbei
verschwand die zweite Hälfte: vorher rechnete Vercel in Washington gegen eine
Datenbank in Frankfurt, jede Abfrage ein Atlantiküberflug.

### Ausliefern

Der Bot läuft auf einem eigenen Server als systemd-Dienst `albion-bot` in
`/opt/albion-bot`, gegen eine lokale Postgres-Datenbank. Neuer Stand:

```bash
bash deploy/deploy.sh
```

Das schiebt per `git archive` genau das rüber, was im Repo ist — kein
`node_modules`, keine `.env` —, installiert, startet den Dienst neu und wartet
auf `Eingeloggt als` im Journal. Kommt die Meldung nicht, schlägt es fehl.

> Die GitHub-Action liefert **nicht** aus, sie lässt nur die Tests laufen. Vorher
> stand dort ein Deploy nach bot-hosting.net — der hat nach dem Umzug jeden Push
> genutzt, um den dort bewusst gestoppten Bot wieder zu starten, inklusive
> `power: restart`. Zwei Instanzen mit demselben Token schreiben sich die
> Timer-Nachrichten gegenseitig um.

## Befehle

| Befehl | Wer | Was |
| --- | --- | --- |
| `/waffen` | alle | Fragebogen: Kategorie wählen, ankreuzen, Skill per Knopf setzen |
| `/timer <comp> <zeit>` | Offis | Timer mit Anmeldung erstellen |
| `/event abmeldungen` | Offis | Wer hat zugesagt und dann abgesagt — nur für dich sichtbar |
| `/event einfrieren` | Offis | Aufstellung sofort schließen, ohne auf die Sperrfrist zu warten |
| `/balance erlauben <@person>` | Offis | Erlaubt jemandem, Gold zu vergeben und abzuziehen |
| `/balance entziehen <@person>` | Offis | Nimmt das Recht wieder weg |
| `/balance wer` | Offis | Wer darf Gold vergeben? |
| `/event absagen` | Ersteller | Timer absagen |

„Absagen" und „Abmeldungen" gibt es zusätzlich als Knopf unter dem Timer.
`einfrieren` bewusst nur als Befehl: es pingt die halbe Gilde, das soll niemand
aus Versehen anklicken.

Das Feld *zeit* bei `/timer` versteht:

| Eingabe | Bedeutung |
| --- | --- |
| `20:30` · `20.30` · `2030` | heute um 20:30, falls schon vorbei: morgen |
| `20` | heute um 20:00 — eine bloße Zahl ist die volle Stunde |
| `24:00` · `2400` · `24` | Mitternacht, also die kommende Nacht |
| `+45` · `45m` | in 45 Minuten |
| `2h` · `1h30` · `1.5h` | in zwei bzw. anderthalb Stunden |
| `14.08 20:30` | nächstes Vorkommen dieses Datums |
| `14.08.2026 20:30` | genau dieses Datum |

Ein führendes `+` ist bei jeder Dauer erlaubt, also auch `+2h` und `+90m`.
Ohne `+` bleibt eine bloße Zahl die Uhrzeit: `20` ist 20:00, `+20` sind zwanzig
Minuten.

Uhrzeiten gelten in der Zeitzone aus `TIMEZONE`; im Discord sieht danach jeder
seine eigene Ortszeit. Der Bot spiegelt die verstandene Zeit in der Bestätigung
zurück — wer sich vertippt, sieht es sofort statt erst beim Start.

Zahlen über 24 sind keine Stunde: auf `90` kommt der Hinweis, dass wohl `90m`
gemeint war. Und wenn die Sperrfrist fast so lang ist wie der Vorlauf (`/timer`
in 11 Minuten bei 10 Minuten Sperre), warnt er — sonst friert die Aufstellung
ein, bevor sich jemand anmelden konnte.

**Rechte gelten immer nur für einen Server.** Timer erstellen darf, wer dort
*Server verwalten* hat oder im Dashboard unter **Zugang** eingetragen ist —
sonst niemand. Es gibt bewusst kein serverübergreifendes Recht: wer den Bot
betreibt, sieht deswegen keine fremden Comps, Profile oder Kontostände.

**Absagen darf nur, wer den Timer erstellt hat** — auch kein Offizier sonst.
Wer es trotzdem versucht, erfährt, wer der Ersteller war. Die Kehrseite: ist
derjenige nicht erreichbar, lässt sich der Timer im Discord nicht mehr stoppen
und friert zur Sperrfrist mit Ping ein.

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

### Knopf und Befehl — beides

„Event absagen" und „Abmeldungen" gibt es als **Knopf** unter dem Timer und
zusätzlich als **`/event`**. Beide Wege landen im selben Code.

Der Unterschied ist die Sichtbarkeit: Knöpfe hängen an der **Nachricht**, nicht
am Betrachter — alle sehen dieselben, daran lässt sich nichts drehen.
Slash-Befehle blendet Discord dagegen aus, wenn die Berechtigung fehlt. Wer
will, dass Member die Knöpfe gar nicht erst sehen, nimmt den Befehl; wer einen
Klick statt Tippen will, den Knopf.

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

> **Der Zugang gilt auch im Discord.** Wer unter *Zugang* steht, zählt für den
> Bot als Offizier — kann also `/timer` setzen, `/event einfrieren`, die
> Abmeldungen sehen und mit `/balance erlauben` bestimmen, wer Gold verteilt.
> Auch ohne „Server verwalten" auf dem Discord.
>
> Das ist Absicht: die Liste ist die Offiziersliste der Gilde, nicht bloß eine
> Login-Erlaubnis. Es überrascht trotzdem — wer jemanden nur zum Comps-Bauen
> hereinlassen will, gibt ihm damit mehr, als er denkt.
>
> Wer das getrennt haben will, braucht ein eigenes Häkchen je Person; die
> Prüfung sitzt an einer Stelle (`isOfficer` in `bot/src/index.js`).

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
npm test
```

92 Tests, ohne Datenbank und ohne Discord — sie laufen in zwei Sekunden und
sind Teil des Ausliefern-Skripts: schlagen sie fehl, geht nichts auf den
Server.

Geprüft werden die Stellen, an denen stille Fehler wehtun: die Zuordnung (dass
das globale Optimum die gierige Variante schlägt, dass Prioritäten greifen,
dass niemand auf zwei Plätzen landet, dass Waffen-Alternativen zählen), die
Zeitangaben bei `/timer`, und vor allem die Grenzen von Discord — 1024 Zeichen
je Embed-Feld, 2000 je Nachricht. Genau daran ist der Fragebogen schon einmal
gescheitert, ohne dass jemand einen Fehler gesehen hätte.

## Lokale Testdatenbank

Zum Entwickeln auf dem eigenen Rechner, ohne die Datenbank des Servers
anzufassen:

```bash
docker run -d --name albion-pg -e POSTGRES_PASSWORD=albion -e POSTGRES_DB=albion -p 55432:5432 postgres:16-alpine
```

Schema einspielen:

```bash
docker exec -i albion-pg psql -U postgres -d albion < db/schema.sql
```

In `.env.local` dann `DATABASE_URL=postgres://postgres:albion@localhost:55432/albion`
und `PGSSL=disable` setzen. Mit `DEV_LOGIN=1` gibt es auf der Startseite einen
Test-Login ohne Discord. Der ist bewusst nur für die Entwicklung: auf dem
Server steht `DEV_LOGIN` leer, und `deploy.sh` fasst die `.env.local` dort
nicht an.

Wieder loswerden:

```bash
docker rm -f albion-pg
```
