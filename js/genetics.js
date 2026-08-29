/* ============================================================================
   Farbgenetik-Motor für das Gestütsspiel.

   Diploid: jeder Genort (Locus) hat zwei Allele. Vererbung ist strikt
   Mendelsch - jedes Elternteil gibt pro Locus zufällig eines seiner beiden
   Allele weiter. Angelehnt an horsereality.wiki (Colour Genetics Guide) und
   reale Pferdegenetik. Kein Framework, nur ein globales `Genetics`-Objekt.
   ========================================================================== */
const Genetics = (function () {
  'use strict';

  // --- Locus-Katalog. Reihenfolge grob nach Wirkung: Basis -> Aufhellung
  //     (Dilution) -> Scheckung/Muster. Das erste Allel je Liste ist das
  //     "aktive" (dominante bzw. wirksame), "n" = Wildtyp/keine Wirkung.
  const LOCI = {
    E:    { label: 'Extension',        alleles: ['E', 'e'] },       // Schwarz- vs. Rotpigment
    A:    { label: 'Agouti',           alleles: ['A', 'a'] },       // verteilt Schwarz auf Punkte (Brauner)
    G:    { label: 'Grey',             alleles: ['G', 'n'] },       // fortschreitendes Ausschimmeln
    CR:   { label: 'Cream / Pearl',    alleles: ['Cr', 'prl', 'n'] },
    D:    { label: 'Dun',              alleles: ['D', 'nd1', 'nd2'] },
    CH:   { label: 'Champagne',        alleles: ['Ch', 'n'] },
    Z:    { label: 'Silver',           alleles: ['Z', 'n'] },
    RN:   { label: 'Roan',             alleles: ['Rn', 'n'] },
    TO:   { label: 'Tobiano',          alleles: ['TO', 'n'] },
    O:    { label: 'Frame Overo',      alleles: ['O', 'n'] },
    SW:   { label: 'Splashed White',   alleles: ['SW1', 'n'] },
    SB:   { label: 'Sabino 1',         alleles: ['SB1', 'n'] },
    W20:  { label: 'W20',              alleles: ['W20', 'n'] },
    LP:   { label: 'Leopard-Komplex',  alleles: ['LP', 'n'] },
    PATN: { label: 'PATN1',            alleles: ['PATN1', 'n'] },
  };
  const LOCUS_KEYS = Object.keys(LOCI);

  function pick(arr, rng) { return arr[Math.floor((rng ? rng() : Math.random()) * arr.length)]; }

  // Zieht pro Locus ein Allel von jedem Elternteil. `af` (Allel-Frequenzen)
  // wird nur für frisch generierte Pferde ohne Eltern gebraucht.
  function randomGenotype(alleleFreq, rng) {
    const gt = {};
    LOCUS_KEYS.forEach((k) => {
      gt[k] = [drawAllele(k, alleleFreq, rng), drawAllele(k, alleleFreq, rng)];
    });
    return gt;
  }

  function drawAllele(locus, alleleFreq, rng) {
    const table = (alleleFreq && alleleFreq[locus]) || null;
    const alleles = LOCI[locus].alleles;
    if (!table) {
      // Ohne Vorgabe: praktisch immer Wildtyp. Rassen, die eine Farbe/ein
      // Muster führen sollen, geben dafür explizite Frequenzen an.
      const r = (rng ? rng() : Math.random());
      if (r < 0.006) return alleles[0];
      return alleles[alleles.length - 1];
    }
    let r = (rng ? rng() : Math.random());
    for (const allele of alleles) {
      const p = table[allele] || 0;
      if (r < p) return allele;
      r -= p;
    }
    return alleles[alleles.length - 1];
  }

  // Ein Fohlen-Genotyp aus zwei Eltern-Genotypen.
  function breedGenotype(sireGt, damGt, rng) {
    const gt = {};
    LOCUS_KEYS.forEach((k) => {
      gt[k] = [pick(sireGt[k], rng), pick(damGt[k], rng)];
    });
    return gt;
  }

  // Letale / nicht lebensfähige Kombinationen. Gibt `null` zurück, wenn
  // das Fohlen lebt, sonst { code, text }.
  function lethalCheck(gt) {
    if (gt.O[0] === 'O' && gt.O[1] === 'O') {
      return { code: 'OLWS', text: 'Overo Lethal White Syndrome - homozygotes Frame-Fohlen ist nicht lebensfähig.' };
    }
    if (gt.RN[0] === 'Rn' && gt.RN[1] === 'Rn') {
      return { code: 'ROAN', text: 'Homozygot Roan - Embryo wird sehr früh resorbiert (klassische Spielregel).' };
    }
    return null;
  }

  function count(pair, allele) { return pair.filter((a) => a === allele).length; }
  function has(pair, allele) { return pair.indexOf(allele) !== -1; }

  // --- Phänotyp: was man dem Pferd ansieht. `ageYears` steuert das
  //     Ausschimmeln bei Grey.
  function describe(gt, ageYears) {
    const red = gt.E[0] === 'e' && gt.E[1] === 'e';
    const bay = !red && has(gt.A, 'A');
    const baseKind = red ? 'red' : bay ? 'bay' : 'black';
    let name = red ? 'Fuchs' : bay ? 'Brauner' : 'Rappe';

    const crN = count(gt.CR, 'Cr');
    const prlN = count(gt.CR, 'prl');
    const champ = has(gt.CH, 'Ch');
    const dun = has(gt.D, 'D');
    const silver = has(gt.Z, 'Z') && baseKind !== 'red'; // Silver braucht Schwarzpigment
    let blueEyes = false;

    // Aufhellungen - stärkster Effekt gewinnt für den Kurznamen.
    if (crN === 2) {
      name = red ? 'Cremello' : bay ? 'Perlino' : 'Smoky Cream';
      blueEyes = true;
    } else if (crN === 1 && prlN === 1) {
      name = red ? 'Palomino-Pearl' : bay ? 'Buckskin-Pearl' : 'Smoky-Pearl';
      blueEyes = true;
    } else if (crN === 1) {
      name = red ? 'Palomino' : bay ? 'Buckskin' : 'Smoky Black';
    } else if (prlN === 2) {
      name = red ? 'Pearl (Apricot)' : bay ? 'Bay-Pearl' : 'Black-Pearl';
    } else if (champ) {
      name = red ? 'Gold Champagne' : bay ? 'Amber Champagne' : 'Classic Champagne';
    } else if (dun) {
      name = red ? 'Red Dun' : bay ? 'Braunfalbe' : 'Mausfalbe (Grullo)';
    } else if (silver) {
      name = bay ? 'Silver Bay' : 'Silver Black';
    }
    if (champ && (crN > 0)) { name = red ? 'Gold Cream Champagne (Ivory)' : bay ? 'Amber Cream Champagne (Ivory)' : 'Classic Cream Champagne (Ivory)'; blueEyes = true; }
    if (champ) blueEyes = blueEyes || false;

    // Muster / Scheckung als Zusatz.
    const patterns = [];
    const spotFlags = [];
    if (has(gt.TO, 'TO')) spotFlags.push('Tobiano');
    if (has(gt.O, 'O')) spotFlags.push('Frame');
    const swN = count(gt.SW, 'SW1');
    if (swN >= 1) spotFlags.push(swN === 2 ? 'Splash+' : 'Splash');
    if (spotFlags.length >= 2 && (spotFlags.indexOf('Tobiano') !== -1 || spotFlags.indexOf('Frame') !== -1)) {
      patterns.push('Tovero (' + spotFlags.join('/') + ')');
    } else {
      spotFlags.forEach((f) => patterns.push(f === 'Tobiano' ? 'Tobiano' : f === 'Frame' ? 'Frame Overo' : f === 'Splash+' ? 'Splashed White (stark)' : 'Splashed White'));
    }
    const sbN = count(gt.SB, 'SB1');
    if (sbN === 2) patterns.push('Sabino (stark)');
    else if (sbN === 1) patterns.push('Sabino');
    if (has(gt.RN, 'Rn')) patterns.push('Roan');

    const lpN = count(gt.LP, 'LP');
    const patn = has(gt.PATN, 'PATN1');
    if (lpN === 2) patterns.push(patn ? 'Volltiger (Fewspot)' : 'Schneeflockentiger');
    else if (lpN === 1) patterns.push(patn ? 'Schabrackentiger (Blanket)' : 'Stichelhaar-Tiger (Varnish)');

    if (swN === 2 || crN === 2) blueEyes = true;

    // Grey überdeckt alles mit der Zeit.
    let greyStage = 0; // 0 keins, 1 beginnt, 2 stark, 3 (fast) weiss
    if (has(gt.G, 'G')) {
      const y = ageYears || 0;
      if (y < 1) greyStage = 1;
      else if (y < 4) greyStage = 2;
      else greyStage = 3;
    }

    let display = name;
    if (patterns.length) display += ' ' + patterns.join(' ');
    if (greyStage === 1) display += ' (schimmelt aus)';
    else if (greyStage === 2) display = 'Schimmel i.E. (' + display + ')';
    else if (greyStage === 3) display = 'Schimmel (Basis: ' + name + ')';

    return {
      base: name,
      baseKind: baseKind,
      patterns: patterns,
      greyStage: greyStage,
      blueEyes: blueEyes,
      display: display,
      tokens: genotypeTokens(gt),
      rarity: rarityScore(gt),
    };
  }

  // Kompakte Genotyp-Schreibweise, Stil wie im Schwester-Tool
  // ("Ee AA nCr Gn SW1n ...").
  function genotypeTokens(gt) {
    const out = [];
    LOCUS_KEYS.forEach((k) => {
      const [a, b] = gt[k];
      const alleles = LOCI[k].alleles;
      const wild = alleles[alleles.length - 1];
      if (a === wild && b === wild) return; // rein Wildtyp -> weglassen
      // sortiere aktives Allel nach vorne
      const sorted = [a, b].sort((x, y) => alleles.indexOf(x) - alleles.indexOf(y));
      out.push(sorted.join(''));
    });
    return out.join(' ') || 'Wildtyp (Fuchs)';
  }

  // Grober "Seltenheitswert" der Farbe für Preis/Bewertung (0..1).
  function rarityScore(gt) {
    let s = 0;
    if (count(gt.CR, 'Cr') === 2) s += 0.25;
    else if (count(gt.CR, 'Cr') === 1) s += 0.12;
    if (count(gt.CR, 'prl') >= 1) s += 0.08;
    if (has(gt.CH, 'Ch')) s += 0.18;
    if (has(gt.D, 'D')) s += 0.12;
    if (has(gt.Z, 'Z')) s += 0.1;
    if (has(gt.TO, 'TO')) s += 0.14;
    if (has(gt.O, 'O')) s += 0.12;
    if (count(gt.SW, 'SW1') >= 1) s += 0.1;
    if (count(gt.SB, 'SB1') >= 1) s += 0.06;
    if (has(gt.RN, 'Rn')) s += 0.08;
    if (count(gt.LP, 'LP') >= 1) s += 0.14;
    if (has(gt.G, 'G')) s += 0.05;
    return Math.min(1, s);
  }

  // --- Vorschau für den Zuchtplaner: Verteilung möglicher Fohlenfarben
  //     durch Ausmultiplizieren aller Locus-Kombinationen (Punnett).
  function foalColorForecast(sireGt, damGt, opts) {
    opts = opts || {};
    const maxOutcomes = opts.limit || 8;
    // Wir simulieren, weil das volle Kreuzprodukt (3^n) zu groß ist.
    const N = 4000;
    const tally = new Map();
    let lethal = 0;
    for (let i = 0; i < N; i++) {
      const gt = breedGenotype(sireGt, damGt);
      const le = lethalCheck(gt);
      if (le) { lethal++; continue; }
      const d = describe(gt, 5); // bei "erwachsen" bewerten
      tally.set(d.display, (tally.get(d.display) || 0) + 1);
    }
    const rows = [...tally.entries()]
      .map(([label, c]) => ({ label: label, pct: Math.round((c / N) * 100) }))
      .sort((a, b) => b.pct - a.pct);
    const top = rows.slice(0, maxOutcomes);
    const restPct = rows.slice(maxOutcomes).reduce((s, r) => s + r.pct, 0);
    if (restPct > 0) top.push({ label: 'sonstige Kombinationen', pct: restPct });
    return { outcomes: top, lethalPct: Math.round((lethal / N) * 100) };
  }

  return {
    LOCI: LOCI,
    LOCUS_KEYS: LOCUS_KEYS,
    randomGenotype: randomGenotype,
    breedGenotype: breedGenotype,
    lethalCheck: lethalCheck,
    describe: describe,
    genotypeTokens: genotypeTokens,
    foalColorForecast: foalColorForecast,
  };
})();
