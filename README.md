# Gestütsspiel

Ein Pferdegestüt-Aufbauspiel als **Desktop-App** (Electron). Baue ein Gestüt
auf, kaufe und verkaufe Pferde, züchte mit echter Farbgenetik, trainiere für
sechs Disziplinen und starte bei Zuchtschauen, Turnieren und Auktionen.

Eigenständiges Projekt. Der Spielstand liegt lokal auf dem Gerät
(`localStorage` des App-Fensters).

## Starten

**Einfach:** Doppelklick auf **`Gestütsspiel starten.bat`**. Beim ersten Start
wird Electron heruntergeladen (einmalig, einige Minuten, Internet nötig).

**Über die Konsole:**

```bash
npm install
npm start
```

**Als Browser-Variante** (ohne Electron) geht weiterhin `serve.ps1` +
`http://localhost:8080/`.

### Windows-Installer / portable EXE bauen

```bash
npm run dist            # NSIS-Installer + portable EXE nach dist/
npm run dist:portable   # nur portable EXE
```

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
```
