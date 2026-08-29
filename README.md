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
  Trainingsanlage, Tierarzt/Reproduktion, Vermarktung), **Futter & Pflege**
  (je 3 Stufen: mehr Kosten je Pferd/Woche, dafür mehr Energie/Training/
  Fruchtbarkeit bzw. weniger Krankheiten, Turnier-Bonus, langsamerer
  Altersverschleiß), Chronik.
- **🐴 Stall** – jedes Pferd mit Genotyp, den sechs Begabungen (Ausbildung
  vs. Potenzial), Exterieur (6 Einzelnoten), Interieur (5 Einzelnoten),
  Gesundheit (5 Einzelnoten: Fundament & Sehnen, Atemwege, Herz-Kreislauf,
  Hufe, Immunsystem), Energie. **Wochen-Trainingsplan** aus bis zu 6 Einheiten,
  wird beim „Woche weiter" abgearbeitet (kostet Energie, Ruhetage erholen).
- **🧬 Zucht** – eigener Hengst **oder Deckstation**. Die Deckstation ist ein
  **Suchwerkzeug**: du setzt die Kriterien (Rasse, Mindest-Exterieur/-Interieur/
  -Gesundheit, Mindest-Begabung, max. Deckgeld) und Sortierung – das Spiel
  filtert nur danach und empfiehlt nichts. Die Vorschau zeigt je Einzelnote
  Hengst/Stute/Erwartung, COI, Farb- und Gesundheitsprognose.
- **🏆 Schauen** – je Disziplin eigene Prüfungsklassen (E → S bzw. Rennklassen)
  mit Mindestanforderung an die Ausbildung, Jungpferde-Prüfungen (3–7 J.),
  Nenn- + Reisekosten, Energieverbrauch. Ergebnislisten, Saisonpunkte je
  Disziplin, Saisonwertung.
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
  - **Deckhengst** – öffentlicher, **mehrfach nutzbarer** Code; der Hengst landet
    dauerhaft in der Deckstation des Freundes, deiner bleibt bei dir.
  Das Spiel macht **keine Netzwerkanfragen**.

Auf dem Tab **Gestüt** steht eine **To-do-Liste**, was vor dem Wochenwechsel
noch offen ist. Mit **„Woche weiter"** vergeht Zeit: Nachfrage driftet, Pferde
altern und arbeiten ihren Trainingsplan ab, Fohlen werden geboren, Turniere
und Auktionen laufen, Unterhalt wird fällig.

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
