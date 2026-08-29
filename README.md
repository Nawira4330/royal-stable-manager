# Gestütsspiel

Ein browserbasiertes Pferdegestüt-Aufbauspiel. Reines HTML/CSS/JavaScript,
kein Build-Schritt, keine Abhängigkeiten, kein Server nötig – alles läuft
lokal im Browser, Spielstand in `localStorage`.

**Eigenständiges Projekt** – unabhängig von anderen Repos.

## Starten

Entweder `index.html` direkt im Browser öffnen, **oder** den mitgelieferten
Mini-Server nutzen (empfohlen, sauberere Pfade):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
```

Dann `http://localhost:8080/` aufrufen.

## Spielprinzip

- **🏡 Gestüt** – Kasse, Prestige/Rang, Anlagen ausbauen (Stallplätze,
  Trainingsanlage, Tierarzt/Reproduktion, Vermarktung), Chronik.
- **🐴 Stall** – Pferde mit Genotyp, Ausbildungs-/Potenzialwerten für sechs
  Disziplinen, Exterieur, Temperament, Gesundheit, Energie. Trainings-Fokus
  setzen, verkaufen, in die Auktion geben.
- **🧬 Zucht** – Hengst × Stute; Fohlenfarben-Vorschau per Mendel-Simulation,
  Inzuchtkoeffizient (COI), Empfängnischance, letale Kombinationen.
- **🏆 Schauen** – Sport-Turniere (je Disziplin) und Zuchtschauen; Preisgeld
  und Prestige.
- **🔨 Auktion** – gegen KI bieten, eigene Pferde mit Limit einliefern.
- **🛒 Markt** – Pferde kaufen und verkaufen.

Mit **„Woche weiter"** vergeht Zeit: Pferde altern und trainieren, Fohlen
werden geboren, Turniere und Auktionen laufen ab, Unterhalt wird fällig.

## Farbgenetik

15 diploide Genorte, strikt Mendelsch vererbt (`js/genetics.js`):

| Gruppe | Genorte |
|---|---|
| Basis | Extension (E/e), Agouti (A/a) |
| Aufhellung | Cream/Pearl (ein Genort), Dun, Champagne, Silver |
| Muster | Grey, Tobiano, Frame Overo, Splashed White, Sabino 1, W20, Leopard-Komplex, PATN1 |

Homozygotes Frame Overo (OLWS) und homozygotes Roan führen zu nicht
lebensfähigen Fohlen. Inzucht senkt Potenzial, Gesundheit und Fruchtbarkeit.

Zehn Rassen mit realistischen Allel-Frequenzen und Disziplin-Affinitäten
(Friese = Rappe, Haflinger = Fuchs, Araber = oft Schimmel, Vollblut ohne
Verdünnungen, …).

## Dateien

```
index.html
css/game.css
js/genetics.js   – Farbgenetik-Motor (Vererbung, Phänotyp, Vorschau)
js/names.js      – Rassen, Affinitäten, Namenslisten
js/model.js      – Pferde-Erzeugung, Alterung, Bewertung, COI
js/economy.js    – Markt, Auktion, Schauen, Anlagen
js/state.js      – Spielzustand, Speichern/Laden, Wochen-Tick
js/ui.js         – Oberfläche (Tabs, Rendering, Events)
js/main.js       – Einstiegspunkt
serve.ps1        – optionaler statischer Webserver
```
