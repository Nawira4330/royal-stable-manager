/* ============================================================================
   Namens- und Rassen-Daten. Reines Nachschlagewerk (globales `Names`).
   ========================================================================== */
const Names = (function () {
  'use strict';

  const PREFIXES = ['Sun', 'Moon', 'Storm', 'Fire', 'Silver', 'Golden', 'Night', 'Wild', 'Royal', 'Shadow',
    'Winter', 'Summer', 'Star', 'Wind', 'Frost', 'Amber', 'Iron', 'Velvet', 'Crimson', 'Noble'];
  const SUFFIXES = ['dancer', 'runner', 'song', 'heart', 'fire', 'wind', 'storm', 'light', 'spirit', 'shadow',
    'blaze', 'grace', 'chaser', 'whisper', 'crown', 'legend', 'dream', 'echo', 'flight', 'star'];
  const GERMAN = ['Fabelhaft', 'Donnerwetter', 'Wolkentanz', 'Feuerherz', 'Morgenstern', 'Nordwind', 'Goldregen',
    'Sturmvogel', 'Abendrot', 'Freiheit', 'Kastanie', 'Diamant', 'Lavendel', 'Bernstein', 'Rabenschwarz',
    'Schneekoenig', 'Mondschein', 'Sommerwind', 'Wildrose', 'Zephyr'];

  const STUD_WORDS = ['Eichenhof', 'Talblick', 'Rosenau', 'Sonnenweide', 'Nebelmoor', 'Hochland', 'Birkengrund',
    'Silbersee', 'Adlerhorst', 'Weissdorn', 'Kastanienhof', 'Morgentau'];

  function randName(rng) {
    const r = rng ? rng() : Math.random();
    if (r < 0.33) return GERMAN[Math.floor((rng ? rng() : Math.random()) * GERMAN.length)];
    return PREFIXES[Math.floor((rng ? rng() : Math.random()) * PREFIXES.length)] +
      SUFFIXES[Math.floor((rng ? rng() : Math.random()) * SUFFIXES.length)];
  }

  function randStudName(rng) {
    const w = STUD_WORDS[Math.floor((rng ? rng() : Math.random()) * STUD_WORDS.length)];
    return 'Gestuet ' + w;
  }

  // --- Rassen. `aff` = Disziplin-Affinitaet (Multiplikator aufs genetische
  //     Potenzial). `conf` = typischer Exterieur-Mittelwert. `af` =
  //     Allel-Frequenzen fuer die Farbgenetik (realistisch pro Rasse:
  //     Friese fast nur Rappe, Haflinger Fuchs mit hellem Langhaar, Araber
  //     kein Tobiano/kein Cream, dafuer oft Grey, ...).
  const DISCIPLINES = ['Dressur', 'Springen', 'Galopprennen', 'Vielseitigkeit', 'Distanzritt', 'Fahren'];

  const BREEDS = {
    'Deutsches Sportpferd': {
      conf: 74, value: 1.15,
      aff: { Dressur: 1.15, Springen: 1.15, Galopprennen: 0.85, Vielseitigkeit: 1.1, Distanzritt: 0.8, Fahren: 0.95 },
      af: { E: { E: 0.55, e: 0.45 }, A: { A: 0.65, a: 0.35 }, G: { G: 0.12, n: 0.88 },
        CR: { Cr: 0.03, prl: 0.0, n: 0.97 }, D: { D: 0, nd1: 0.05, nd2: 0.95 },
        Z: { Z: 0.02, n: 0.98 }, TO: { TO: 0.03, n: 0.97 }, SB: { SB1: 0.05, n: 0.95 } },
    },
    'Hannoveraner': {
      conf: 78, value: 1.25,
      aff: { Dressur: 1.2, Springen: 1.15, Galopprennen: 0.85, Vielseitigkeit: 1.05, Distanzritt: 0.75, Fahren: 0.9 },
      af: { E: { E: 0.5, e: 0.5 }, A: { A: 0.6, a: 0.4 }, G: { G: 0.1, n: 0.9 },
        CR: { Cr: 0.01, prl: 0, n: 0.99 } },
    },
    'Englisches Vollblut': {
      conf: 70, value: 1.2,
      aff: { Dressur: 0.85, Springen: 0.95, Galopprennen: 1.4, Vielseitigkeit: 1.0, Distanzritt: 0.9, Fahren: 0.6 },
      af: { E: { E: 0.4, e: 0.6 }, A: { A: 0.7, a: 0.3 }, G: { G: 0.13, n: 0.87 },
        CR: { Cr: 0, prl: 0, n: 1 }, TO: { TO: 0, n: 1 } },
    },
    'Araber': {
      conf: 76, value: 1.1,
      aff: { Dressur: 0.95, Springen: 0.8, Galopprennen: 1.05, Vielseitigkeit: 0.95, Distanzritt: 1.45, Fahren: 0.7 },
      af: { E: { E: 0.45, e: 0.55 }, A: { A: 0.75, a: 0.25 }, G: { G: 0.35, n: 0.65 },
        CR: { Cr: 0, prl: 0, n: 1 }, D: { D: 0, nd1: 0, nd2: 1 }, TO: { TO: 0, n: 1 },
        O: { O: 0, n: 1 }, LP: { LP: 0, n: 1 }, SB: { SB1: 0.08, n: 0.92 } },
    },
    'Friese': {
      conf: 77, value: 1.15,
      aff: { Dressur: 1.05, Springen: 0.7, Galopprennen: 0.55, Vielseitigkeit: 0.7, Distanzritt: 0.7, Fahren: 1.35 },
      // Friesen sind praktisch immer Rappe: Schwarzpigment (E) vorhanden,
      // Agouti rezessiv (aa), keine Aufhellungen oder Scheckungen.
      af: { E: { E: 0.98, e: 0.02 }, A: { A: 0.01, a: 0.99 }, G: { G: 0, n: 1 },
        CR: { Cr: 0, prl: 0, n: 1 }, D: { D: 0, nd1: 0, nd2: 1 }, CH: { Ch: 0, n: 1 },
        Z: { Z: 0, n: 1 }, TO: { TO: 0, n: 1 }, O: { O: 0, n: 1 }, SW: { SW1: 0, n: 1 },
        SB: { SB1: 0, n: 1 }, LP: { LP: 0, n: 1 }, RN: { Rn: 0, n: 1 } },
    },
    'Andalusier': {
      conf: 79, value: 1.15,
      aff: { Dressur: 1.25, Springen: 0.8, Galopprennen: 0.7, Vielseitigkeit: 0.8, Distanzritt: 0.85, Fahren: 1.1 },
      af: { E: { E: 0.55, e: 0.45 }, A: { A: 0.5, a: 0.5 }, G: { G: 0.45, n: 0.55 },
        CR: { Cr: 0.03, prl: 0.02, n: 0.95 }, TO: { TO: 0, n: 1 }, LP: { LP: 0, n: 1 } },
    },
    'Quarter Horse': {
      conf: 72, value: 1.0,
      aff: { Dressur: 0.85, Springen: 0.95, Galopprennen: 1.2, Vielseitigkeit: 0.9, Distanzritt: 0.9, Fahren: 0.8 },
      af: { E: { E: 0.45, e: 0.55 }, A: { A: 0.55, a: 0.45 }, G: { G: 0.08, n: 0.92 },
        CR: { Cr: 0.08, prl: 0.02, n: 0.9 }, D: { D: 0.05, nd1: 0.1, nd2: 0.85 },
        CH: { Ch: 0.03, n: 0.97 }, RN: { Rn: 0.12, n: 0.88 }, TO: { TO: 0.05, n: 0.95 },
        O: { O: 0.06, n: 0.94 }, SW: { SW1: 0.08, n: 0.92 }, LP: { LP: 0.02, n: 0.98 } },
    },
    'Islaender': {
      conf: 68, value: 0.85,
      aff: { Dressur: 0.8, Springen: 0.6, Galopprennen: 0.75, Vielseitigkeit: 0.8, Distanzritt: 1.2, Fahren: 0.95 },
      af: { E: { E: 0.5, e: 0.5 }, A: { A: 0.55, a: 0.45 }, G: { G: 0.12, n: 0.88 },
        CR: { Cr: 0.1, prl: 0.02, n: 0.88 }, D: { D: 0.12, nd1: 0.15, nd2: 0.73 },
        CH: { Ch: 0.02, n: 0.98 }, Z: { Z: 0.04, n: 0.96 }, RN: { Rn: 0.06, n: 0.94 },
        TO: { TO: 0.1, n: 0.9 }, SW: { SW1: 0.12, n: 0.88 }, SB: { SB1: 0.08, n: 0.92 },
        LP: { LP: 0.06, n: 0.94 }, PATN: { PATN1: 0.3, n: 0.7 } },
    },
    'Haflinger': {
      conf: 66, value: 0.8,
      aff: { Dressur: 0.8, Springen: 0.7, Galopprennen: 0.6, Vielseitigkeit: 0.7, Distanzritt: 0.85, Fahren: 1.15 },
      // Haflinger sind durchweg Fuchs (ee), meist mit hellem Langhaar
      // (Flaxen, hier nicht getrennt modelliert), sonst einfarbig.
      af: { E: { E: 0.01, e: 0.99 }, A: { A: 0.3, a: 0.7 }, G: { G: 0, n: 1 },
        CR: { Cr: 0, prl: 0, n: 1 }, D: { D: 0, nd1: 0.05, nd2: 0.95 }, CH: { Ch: 0, n: 1 },
        Z: { Z: 0, n: 1 }, RN: { Rn: 0, n: 1 }, TO: { TO: 0, n: 1 }, O: { O: 0, n: 1 },
        SW: { SW1: 0, n: 1 }, SB: { SB1: 0, n: 1 }, LP: { LP: 0, n: 1 } },
    },
    'Connemara-Pony': {
      conf: 69, value: 0.82,
      aff: { Dressur: 0.95, Springen: 1.1, Galopprennen: 0.8, Vielseitigkeit: 1.05, Distanzritt: 0.95, Fahren: 0.9 },
      af: { E: { E: 0.5, e: 0.5 }, A: { A: 0.6, a: 0.4 }, G: { G: 0.4, n: 0.6 },
        CR: { Cr: 0.06, prl: 0.02, n: 0.92 }, D: { D: 0.08, nd1: 0.1, nd2: 0.82 } },
    },
  };
  const BREED_KEYS = Object.keys(BREEDS);

  return {
    DISCIPLINES: DISCIPLINES,
    BREEDS: BREEDS,
    BREED_KEYS: BREED_KEYS,
    randName: randName,
    randStudName: randStudName,
  };
})();
