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

## Spielprinzip

- **🏡 Gestüt** – Kasse, Prestige/Rang, Anlagen ausbauen (Stallplätze,
  Trainingsanlage, Tierarzt/Reproduktion, Vermarktung), Chronik.
- **🐴 Stall** – jedes Pferd mit Genotyp, den sechs Begabungen (Ausbildung
  vs. Potenzial), Exterieur, Interieur, Gesundheit, Energie. Trainings-Fokus
  setzen, verkaufen, in die Auktion geben.
- **🧬 Zucht** – eigener Hengst **oder Deckstation** (fremde Hengste gegen
  Deckgeld). Die Vorschau zeigt die erwarteten Fohlenwerte, den Streubereich,
  COI, Empfängnischance, mögliche Fohlenfarben und ob der Hengst die
  Begabungen der Stute hebt oder senkt.
- **🏆 Schauen** – Sport-Turniere je Disziplin und Zuchtschauen. Preisgeld
  und Prestige, steigert den Pferdewert.
- **🔨 Auktion** – gegen KI bieten, eigene Pferde mit Limit einliefern.
- **🛒 Markt** – Pferde kaufen und verkaufen.

Mit **„Woche weiter"** vergeht Zeit: Pferde altern und trainieren, Fohlen
werden geboren, Turniere und Auktionen laufen ab, Unterhalt wird fällig.

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
