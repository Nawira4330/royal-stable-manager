# Royal Stable Manager

Ein Pferdegestüt-Aufbauspiel (deutsche Oberfläche). Läuft **im Browser**
(auch am Handy) oder als **Desktop-App** (Electron). Baue ein Gestüt auf,
kaufe und verkaufe Pferde, züchte mit echter Farbgenetik, trainiere für
sechs Disziplinen und starte bei Zuchtschauen, Turnieren und Auktionen.

Eigenständiges Projekt. Der Spielstand liegt lokal auf dem Gerät
(`localStorage`).

## Starten

Das Projekt hält **keine lokalen Abhängigkeiten** vor – kein `node_modules`,
kein `package-lock.json` im Repo. Der Ordner (und die OneDrive-Sync) bleibt
damit bei ~0,4 MB statt ~560 MB.

**Als Browser-Variante** (braucht gar nichts): `serve.ps1` starten, dann
`http://localhost:8080/` öffnen. Kein Node.js, kein Internet, kein Electron.

**Als Desktop-App:** Doppelklick auf **`Royal Stable Manager.bat`** – oder über
die Konsole:

```bash
npm start            # = node tools/get-electron.js --run
```

`tools/get-electron.js` stellt Electron bereit, **ohne** dass es dauerhaft im
Projektordner liegen muss:

- schon entpackt (`node_modules/electron/`) → sofort starten
- ZIP im Electron-Cache (`%LOCALAPPDATA%\electron\Cache`, außerhalb OneDrive,
  überlebt `npm run clean`) → in ~1 s von dort entpacken, **kein Download**
- sonst → ZIP einmalig laden (~115 MB, Internet nötig), in den Cache legen,
  entpacken

Ein `npm install` ist **nicht** nötig – `tools/get-electron.js` provisioniert
Electron direkt. (Das mitgelieferte `.npmrc` gibt einem manuellen `npm install`
die Installations-Skripte von Electron frei, die neuere npm-Versionen sonst
blockieren; verlassen sollte man sich darauf aber nicht.)

### Aufräumen

```bash
npm run clean        # entfernt node_modules/, dist/, package-lock.json
```

Danach läuft die Browser-Variante unverändert; `npm start` holt Electron beim
nächsten Aufruf in ~1 s aus dem Cache zurück (nur ohne Cache erneut aus dem
Netz).

### Als App aufs Handy (PWA) – ohne Hosting, nur per Datei

Das Spiel ist eine **installierbare, offlinefähige PWA** (`manifest.webmanifest`
+ `sw.js`). Ein Service Worker braucht einen **sicheren Kontext** – HTTPS
**oder** `http://localhost`. Ein reines `http://<LAN-IP>` reicht **nicht**.
Ohne Server ins Internet zu stellen geht es auf **Android** so:

1. **Bundle bauen:** `npm run bundle` → `royal-stable-manager-web.zip`
   (nur die Laufzeitdateien, ~160 KB).
2. Die ZIP aufs Handy kopieren (USB, Messenger, OneDrive …) und in einen
   Ordner **entpacken**.
3. Auf dem Handy eine schlanke **lokale Webserver-App** installieren, die
   einen Ordner unter `http://localhost:<Port>` ausliefert
   (Play Store, Stichwort „http server local", z. B. *Simple HTTP Server*).
   Als Wurzel den entpackten Ordner wählen, **Port fest 8080**, starten.
4. In **Chrome** `http://localhost:8080/` öffnen → Menü **⋮** →
   **„App installieren"** / „Zum Startbildschirm hinzufügen". Chrome legt
   eine echte App mit eigenem Icon an.
5. Ab jetzt startet das 🐴-Icon das Spiel im **Vollbild** und **komplett
   offline** – die Webserver-App muss dafür nicht mehr laufen.

> **Immer denselben Port (8080) verwenden.** Spielstand und App-Cache hängen
> an der Herkunft `http://localhost:8080`; bei anderem Port ist der
> Spielstand „weg" (liegt dann unter der alten Herkunft).

Weitergeben = die ZIP weitergeben; der Empfänger macht Schritt 2–5 einmalig.

*(Alternativ mit Hosting:* Inhalt auf einen statischen HTTPS-Host legen –
GitHub Pages, Netlify, Cloudflare Pages; `.nojekyll` liegt bei. Dann nur die
URL am Handy öffnen und installieren.*)*

Icons neu erzeugen: `npm run icons`. Bei einer neuen Version in `sw.js`
`CACHE` hochzählen (`rsm-v1` → `rsm-v2`), damit die App die neuen Dateien
lädt (Bundle neu bauen und wieder rüberkopieren).

**Der Spielstand liegt pro Browser/Herkunft lokal** (`localStorage`) und wird
*nicht* zwischen Geräten synchronisiert. Übertragen: Menü → „Spielstand als
Text exportieren", Text ans andere Gerät, dort „Spielstand importieren".

### Windows-Installer / portable EXE bauen

```bash
npm run dist            # NSIS-Installer + portable EXE nach dist/
npm run dist:portable   # nur portable EXE
```

`electron-builder` wird dabei nur temporär über `npx` bezogen und braucht
Internet.

Im Spiel erklärt der Knopf **„❔ Anleitung"** (oben) bzw. **„How to Play"**
auf dem Startbildschirm alle Regeln.

## Spielprinzip

- **🏡 Gestüt** – Kasse, Prestige/Rang, Anlagen ausbauen (Stallplätze,
  Trainingsanlage, Tierarzt/Reproduktion, Vermarktung, **Weide/Koppeln**,
  **Futter-Lager**), **Futter & Pflege**
  (je 3 Stufen: mehr Kosten je Pferd/Woche, dafür mehr Energie/Training/
  Fruchtbarkeit bzw. weniger Krankheiten, Turnier-Bonus, langsamerer
  Altersverschleiß), **Personal** (Bereiter → mehr Trainingszuwachs in ihren
  Disziplinen; Stallmeister → weniger Pflegekosten/Zwischenfälle; Tierarzt →
  weniger Tierarztkosten und Geburts-/Krankheitsrisiko; Vermarkter → mehr
  Verkaufserlös, Deckstation- und Pensionsstall-Einnahmen), **Sponsoren**
  (ab Prestige 60: Wochenzahlung gegen
  Startauflage + Abschlussbonus), **Zuchtaufträge** (Verbände/Kunden suchen
  Pferde nach Vorgabe: Prämie + Prestige, verfallene Aufträge kosten Prestige),
  **Zuchtbuch/Zuchtstempel** (Präfix wird eigenen Nachzuchten vorangestellt),
  **Pensionsstall** (freie Boxen an Gastpferde vermieten – passives
  Wocheneinkommen, belegt echte Stallplätze), **Weidegang** je Pferd
  (−60 % Kraftfutter, erholt, hebt Nervenstärke/Umgänglichkeit; −20 %
  Training; im Winter wirkungslos), **Futter-Lager** (Mengeneinkauf mit
  20 % Rabatt, Vorrat zehrt wöchentlich ab), **Versicherung** je Pferd
  (OP-Schutz: 80 % der Tierarzt-Behandlungskosten; Vollschutz zusätzlich
  70 % des Schätzwerts bei Tod), Chronik.
- **🐴 Stall** – jedes Pferd mit Genotyp, den sechs Begabungen (Ausbildung
  vs. Potenzial), Exterieur (6 Einzelnoten), Interieur (5 Einzelnoten),
  Gesundheit (5 Einzelnoten: Fundament & Sehnen, Atemwege, Herz-Kreislauf,
  Hufe, Immunsystem), Energie. **Wochen-Trainingsplan** aus bis zu 6 Einheiten,
  wird beim „Woche weiter" abgearbeitet (kostet Energie, Ruhetage erholen).
- **🧬 Zucht** – eigener Hengst **oder Deckstation**. Die Deckstation ist ein
  **Suchwerkzeug**: du setzt die Kriterien (Rasse, Mindest-Exterieur/-Interieur/
  -Gesundheit, Mindest-Begabung, max. Deckgeld) und Sortierung – das Spiel
  filtert nur danach und empfiehlt nichts. Die Vorschau zeigt je Einzelnote
  Hengst/Stute/Erwartung, COI, Farb- und Gesundheitsprognose. Die
  **Empfängnischance** hängt zusätzlich an der **Decksaison** (Frühling +,
  Winter −). Bei der Geburt drohen je nach Alter, Gesundheit und COI der Stute
  **Verfohlen, Schwergeburt** (Tierarztrechnung, schwächeres Fohlen) oder – sehr
  selten – der Verlust der Stute; die Tierarzt-Anlage senkt das Risiko stark.
  Umgekehrt lässt sich ein **eigener gekörter Hengst** in der Stall-Detailansicht
  fremden Zuchtstuten anbieten: du setzt das Deckgeld, wöchentlich buchen einige
  Stuten (Einnahme minus 8 % Vermittlung), ohne Fohlen im eigenen Stall.
  **Verdeckte Genetik:** Von Markt-/Auktionspferden und eigenen Fohlen ist nur der
  Phänotyp bekannt; verdeckte Letalfarb-Träger (Frame Overo/OLWS, Roan) deckt erst
  ein **Farbtest** (500 €) auf. Der Zuchtplaner zeigt die Farb-/Letalrisiko-Prognose
  nur, wenn beide Elterntiere getestet sind.
- **🏆 Schauen** – je Disziplin eigene Prüfungsklassen (E → S bzw. Rennklassen)
  mit Mindestanforderung, Jungpferde-Prüfungen, Nenn-/Reisekosten,
  Energieverbrauch. Dazu **Zuchtschauen** und **Körungen/Prämierungen**
  (Zuchtbuch-Eintrag, Ia/Ib/Staatsprämie, Siegertitel) und die
  **Leistungsprüfung** (Stationsprüfung, Leistungsindex, Voraussetzung fürs
  Zuchtbuch I). **Rivalen-Gestüte** treten überall mit an; **Gestüts-Rangliste**
  und ein **Jahres-Championat** (52 Wochen, Finale je Disziplin + Gesamt-Titel,
  danach Saisonpunkt-Reset) sowie das **Bundeschampionat der Jungpferde**
  (3–6-jährige: Jungpferde-Prüfungen sammeln eigene Punkte, Jahresend-Finale
  nach Potenzial/Typ/Rittigkeit, Titel „Bundeschampion <Disziplin>"). Fohlen
  von nicht gekörten Hengsten bekommen **keinen Zuchtbucheintrag** (−38 % Wert).
- **🔨 Auktion** – gegen KI bieten, eigene Pferde mit Limit einliefern.
- **🛒 Markt** – kaufen und verkaufen. **Angebot & Nachfrage**: Preise und
  Verkaufstempo folgen der Nachfrage je Segment (Rasse + beste Disziplin +
  Sonderfarben); viel verkaufen drückt die Preise im eigenen Segment.

- **👥 Freunde** (Tab Gestüt) – ohne Anmeldung, ohne Server, ohne Datenerhebung.
  Zufälliger **Freundschaftscode** (nur lokal im Browser). Alle Tauschcodes sind
  reiner Text, den du selbst weitergibst; **geräteübergreifend**. Beim „Öffnen"
  eines Codes wird **erst das Pferd mit allen Werten angezeigt**, dann bestätigst
  du Kauf/Übernahme selbst. Drei Arten:
  - **Privater Verkauf** – an einen bestimmten Freundescode gebunden, einmalig.
  - **Öffentlicher Verkauf** – jeder mit dem Code kann bieten; du nimmst *ein*
    Kaufgebot an (wer zuerst bietet). 4-Schritt-Ablauf mit Angebot → Kaufgebot →
    Verkaufen/Lieferung → Übernehmen; Geld fließt erst am Ende.
  - **Freundesliste** – Codes mit Spitznamen speichern (nach dem ersten Tausch
    automatisch vorgemerkt); Spitzname statt Code beim privaten Verkauf.
  - **Freundes-Rangliste** (Tab Schauen) – eigene Saisonpunkte als Code teilen,
    Codes von Freunden öffnen → gemeinsame Tabelle (reine Anzeige).
  - **Turnier-Challenge** (Stall, beim Pferd) – Pferd + Disziplin + Klasse +
    Seed als Code; der Freund tritt mit einem eigenen Pferd an, beide werden
    mit demselben Seed bewertet. Ergebnis-Code zeigt beide Wertungen.
  - **Co-Zucht** – Deckhengst ohne Deckgeld gegen festen Prozentanteil
    (1–80 %) am Verkaufserlös jeder Nachzucht; Anteil wird beim Verkauf
    abgezogen und per Abrechnungs-Code/Quittung ausgezahlt. „Entfernen"
    legt den Hengst bei offener Abrechnung nur still (kein Decken mehr),
    bis alles verkauft und beglichen ist.
  - **Deckhengst** – öffentlicher, **mehrfach nutzbarer** Code; der Hengst landet
    dauerhaft in der Deckstation des Freundes, deiner bleibt bei dir. Jede
    Bedeckung sammelt Decktaxe beim Nutzer; er schickt dir per **Abrechnungscode**
    die Summe, die du gutgeschrieben bekommst, und bekommt von dir eine
    **Quittung** zurück – nur deren Einlösen schließt die Abrechnung bei ihm ab
    (so ist geprüft, dass der Code wirklich eingelöst wurde). Verlorene Quittung:
    der Besitzer erzeugt sie über denselben Abrechnungscode neu.
  Das Spiel macht **keine Netzwerkanfragen**.

Weitere Bausteine: **Stall-Filter/Sortierung**, **Stammbaum-Grafik** (🌳 in der
Detailansicht), **Pferde-Vergleich** (⚖ an zwei Pferden), **Sammel-Trainingsplan**,
**Vererber-Rating** (★ nach ≥ 3 Fohlen), **Bank/Kredit** (Zins pro Woche),
**Übertraining → Sehnenreizung**, **Hufschmied- und Wurmkur-/Impf-Zyklen**
(ausgelassen → Hufe/Immunsystem sinken) und ein **Statistik-Dashboard**
(Kassenverlauf, bester Verkauf, größter Turniertag).

Ein Spieljahr = 52 Wochen in **vier Jahreszeiten** zu je 13 Wochen (Anzeige in
der Kopfzeile). Sie beeinflussen Empfängnischance (Frühling = Decksaison),
Turnierdichte, Trainingszuwachs, Energie und Futterkosten (Winter +25 %).

Auf dem Tab **Gestüt** steht eine **To-do-Liste**, was vor dem Wochenwechsel
noch offen ist. Mit **„Woche weiter"** vergeht Zeit: Nachfrage driftet, Pferde
altern und arbeiten ihren Trainingsplan ab, Fohlen werden geboren, Turniere
und Auktionen laufen, Sponsoren zahlen, Unterhalt wird fällig.

## Wie die Werte vererbt werden

**Begabungen** (6 Disziplinen), **Exterieur** und **Interieur** (Charakter)
erben nach demselben Schema:

```
Erwartung = Ø(Vater, Mutter) × 0,94  +  50 × 0,06      (Regression zur Mitte)
            − COI-Abzug                                 (Inzucht)
            − Mix-Abzug                                 (nur bei Rassenkreuzung)
Fohlenwert = Erwartung + Zufallsstreuung
```

- **Ø der Eltern** ist der beste Schätzer – deshalb lässt sich im Zuchtplaner
  ausrechnen, welcher Hengst zu welcher Stute passt.
- **Regression zur Mitte** (6 %): zwei Spitzenpferde geben im Schnitt ein
  minimal schwächeres Fohlen. Fortschritt kommt nur durch konsequente Auswahl.
- **Streuung**: Begabung ±6, Exterieur ±4, Interieur ±9 (Charakter ist am
  wenigsten erblich).
- **COI** (Inzuchtkoeffizient) senkt Begabungen (× 38), Exterieur (× 30),
  Interieur (× 8) und vor allem **Gesundheit** (× 72). Gesundheit startet
  sonst bei ~96.
- **Mix** (Vater- und Mutterrasse verschieden): Fohlen ist „Mix (X × Y)",
  hat kein Zuchtbuch → Marktwert etwa **halbiert**, deutlicher Zuchtschau-
  Malus, Begabungen und Exterieur im Schnitt −5.
- **Farbe**: strikt Mendelsch, je Genort ein Allel von jedem Elternteil.

## Farbgenetik

15 diploide Genorte (`js/genetics.js`):

| Gruppe | Genorte |
|---|---|
| Basis | Extension (E/e), Agouti (A/a) |
| Aufhellung | Cream/Pearl (ein Genort), Dun, Champagne, Silver |
| Muster | Grey, Tobiano, Frame Overo, Splashed White, Sabino 1, W20, Leopard-Komplex, PATN1 |

Homozygotes Frame Overo (OLWS) und homozygotes Roan → nicht lebensfähiges
Fohlen. Zehn Rassen mit realistischen Allel-Frequenzen und
Disziplin-Affinitäten (Friese = Rappe, Haflinger = Fuchs, Araber = oft
Schimmel, Vollblut ohne Verdünnungen, …).

## Dateien

```
index.html          Renderer (UI)
electron-main.js     Electron-Hauptprozess (App-Fenster)
package.json         npm-Scripts + electron-builder-Konfiguration
css/game.css
js/genetics.js       Farbgenetik-Motor (Vererbung, Phänotyp, Vorschau)
js/names.js          Rassen, Affinitäten, Namenslisten
js/model.js          Erzeugung, Alterung, Bewertung, COI, Werte-Vererbung
js/economy.js        Markt, Deckstation, Auktion, Schauen, Anlagen
js/state.js          Spielzustand, Speichern/Laden, Wochen-Tick
js/ui.js             Oberfläche (Tabs, Rendering, Events)
js/main.js           Einstiegspunkt (Renderer)
serve.ps1            optionaler statischer Webserver (Browser-Variante)
tools/get-electron.js stellt Electron bereit (Cache-first, sonst Download)
tools/make-icons.js  erzeugt die App-Icons (icons/*.png, favicon.png)
tools/bundle.js      packt die Web-Laufzeit in royal-stable-manager-web.zip
tools/clean.js       entfernt node_modules/, dist/, ZIP, package-lock.json
manifest.webmanifest PWA-Manifest (installierbar aufs Handy)
sw.js                Service Worker (App-Shell-Cache, Offline-Betrieb)
js/pwa.js            registriert den Service Worker
.npmrc               erlaubt Electron-Installations-Skripte (fuer npm install)
```
