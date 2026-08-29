/* ============================================================================
   Pferde-Modell: Erzeugung, Alterung, Bewertung, Inzucht (COI).
   Globales `Model`. Haengt an `Genetics` und `Names`.
   ========================================================================== */
const Model = (function () {
  'use strict';

  const DISC = Names.DISCIPLINES;
  const WEEKS_PER_YEAR = 52;
  const GESTATION_WEEKS = 48;         // ~11 Monate
  const MATURITY_YEARS = 3;           // ab hier Training/Sport/Zucht
  const MAX_BREED_AGE = 22;

  let _seq = 1;
  function nextId() { return 'h' + (Date.now().toString(36)) + '_' + (_seq++); }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function gauss(mean, sd) {
    // Box-Muller
    const u = 1 - Math.random(), v = Math.random();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

  function ageYears(horse, currentWeek) {
    return (currentWeek - horse.bornWeek) / WEEKS_PER_YEAR;
  }
  function isAdult(horse, currentWeek) { return ageYears(horse, currentWeek) >= MATURITY_YEARS; }

  // Alters-Leistungskurve (0..1): Aufbau bis ~7, Plateau, Abbau ab ~16.
  function ageFactor(y) {
    if (y < 3) return clamp(0.35 + (y - 1) * 0.18, 0.1, 0.75);
    if (y < 7) return clamp(0.75 + (y - 3) * 0.0625, 0.75, 1);
    if (y < 15) return 1;
    if (y < 24) return clamp(1 - (y - 15) * 0.07, 0.2, 1);
    return 0.2;
  }

  function emptySkill() { const s = {}; DISC.forEach((d) => (s[d] = 0)); return s; }

  // --- Neues Pferd "aus dem Nichts" (Markt / Auktion / Startbestand).
  function generateHorse(opts) {
    opts = opts || {};
    const breed = opts.breed || Names.BREED_KEYS[randInt(0, Names.BREED_KEYS.length - 1)];
    const bdef = Names.BREEDS[breed];
    const sex = opts.sex || (Math.random() < 0.5 ? 'hengst' : 'stute');
    const quality = opts.quality != null ? opts.quality : clamp(gauss(0.5, 0.16), 0.05, 0.98); // 0..1
    const y = opts.ageYears != null ? opts.ageYears : (3 + Math.random() * 8);
    const bornWeek = (opts.currentWeek || 0) - Math.round(y * WEEKS_PER_YEAR);

    const genotype = opts.genotype || Genetics.randomGenotype(bdef.af);
    const potential = {};
    DISC.forEach((d) => {
      const aff = bdef.aff[d] || 1;
      potential[d] = clamp(Math.round((30 + quality * 55 + gauss(0, 9)) * aff), 5, 100);
    });
    const conformation = clamp(Math.round(bdef.conf + (quality - 0.5) * 34 + gauss(0, 5)), 20, 100);

    const skill = emptySkill();
    if (y >= MATURITY_YEARS && !opts.untrained) {
      // Marktpferde sind meist schon etwas angeritten.
      const trainedFrac = clamp(gauss(0.45, 0.22), 0, 0.92);
      DISC.forEach((d) => { skill[d] = Math.round(potential[d] * trainedFrac * clamp((y - 2) / 5, 0.2, 1)); });
    }

    const h = {
      id: opts.id || nextId(),
      name: opts.name || Names.randName(),
      sex: sex,
      breed: breed,
      bornWeek: bornWeek,
      genotype: genotype,
      potential: potential,
      skill: skill,
      conformation: conformation,
      temperament: clamp(Math.round(gauss(60, 15)), 15, 98),
      health: clamp(Math.round(gauss(88, 8)), 40, 100),
      energy: 100,
      quality: quality,
      trainingFocus: null,
      pregnancy: null,
      forSale: null,
      wins: 0,
      shows: 0,
      earnings: 0,
      showLog: [],
      sireId: opts.sireId || null,
      damId: opts.damId || null,
      sireName: opts.sireName || null,
      damName: opts.damName || null,
      // Vorfahren-Karte { schluessel: kuerzeste Generationsdistanz } fuer COI.
      ancestors: opts.ancestors || syntheticAncestors(),
      bred: !!opts.bred,
      origin: opts.origin || 'generiert',
      acquiredWeek: opts.currentWeek || 0,
    };
    return h;
}

  // Kuenstliche Ahnen fuer generierte Pferde, damit COI zwischen zwei
  // fremden Pferden praktisch 0 ist, aber Wiederverwenden desselben
  // Marktpferds als Elternteil spaeter Inzucht erzeugt.
  function syntheticAncestors() {
    const m = {};
    const base = 'X' + Math.random().toString(36).slice(2, 8);
    for (let i = 0; i < randInt(2, 4); i++) m[base + '_' + i] = randInt(2, 4);
    return m;
  }

  // --- Fohlen aus zwei Elternpferden.
  function breed(sire, dam, currentWeek) {
    const gt = Genetics.breedGenotype(sire.genotype, dam.genotype);
    const lethal = Genetics.lethalCheck(gt);
    const coi = inbreedingCoefficient(sire, dam);

    if (lethal) {
      return { alive: false, reason: lethal.text, code: lethal.code, coi: coi };
    }

    const sex = Math.random() < 0.5 ? 'hengst' : 'stute';
    const bdef = Names.BREEDS[sire.breed] || Names.BREEDS[dam.breed];

    const potential = {};
    DISC.forEach((d) => {
      const mid = (sire.potential[d] + dam.potential[d]) / 2;
      let v = mid + gauss(0, 7);              // Rekombination/Streuung
      v -= coi * 45;                          // Inzuchtdepression
      potential[d] = clamp(Math.round(v), 3, 100);
    });
    let conf = (sire.conformation + dam.conformation) / 2 + gauss(0, 5) - coi * 40;
    const health = clamp(Math.round(gauss(90, 6) - coi * 70 - (lethal ? 30 : 0)), 20, 100);

    const ancestors = mergeAncestors(sire, dam);

    const foal = {
      id: nextId(),
      name: null,                            // wird bei Geburt benannt
      sex: sex,
      breed: sire.breed === dam.breed ? sire.breed : (Math.random() < 0.5 ? sire.breed : dam.breed),
      bornWeek: currentWeek,
      genotype: gt,
      potential: potential,
      skill: emptySkill(),
      conformation: clamp(Math.round(conf), 15, 100),
      temperament: clamp(Math.round((sire.temperament + dam.temperament) / 2 + gauss(0, 12)), 10, 99),
      health: health,
      energy: 100,
      quality: clamp((sire.quality + dam.quality) / 2 + gauss(0, 0.08) - coi * 0.3, 0.02, 0.99),
      trainingFocus: null,
      pregnancy: null,
      forSale: null,
      wins: 0, shows: 0, earnings: 0, showLog: [],
      sireId: sire.id, damId: dam.id,
      sireName: sire.name, damName: dam.name,
      ancestors: ancestors,
      bred: true,
      origin: 'eigene Zucht',
      acquiredWeek: currentWeek,
    };
    return { alive: true, foal: foal, coi: coi };
  }

  function mergeAncestors(sire, dam) {
    const out = {};
    // Eltern selbst = Distanz 1
    out[sire.id] = 1;
    out[dam.id] = 1;
    [sire, dam].forEach((p) => {
      const anc = p.ancestors || {};
      Object.keys(anc).forEach((k) => {
        const d = anc[k] + 1;
        if (d <= 5 && (out[k] == null || d < out[k])) out[k] = d;
      });
    });
    return out;
  }

  // Naeherung des Inzuchtkoeffizienten aus den Vorfahren-Karten beider
  // Eltern: gemeinsame Ahnen mit Distanzen n1, n2 tragen (1/2)^(n1+n2+1) bei.
  // Kein voller Wright-Pfadalgorithmus, aber fuer Spielzwecke aussagekraeftig
  // und im Geist des Schwester-Tools (COI-Spalte).
  function inbreedingCoefficient(sire, dam) {
    const a = sire.ancestors || {};
    const b = dam.ancestors || {};
    // Eltern selbst zaehlen auch: wenn Vater == Ahn der Mutter usw.
    const aFull = Object.assign({}, a); aFull[sire.id] = 0;
    const bFull = Object.assign({}, b); bFull[dam.id] = 0;
    let f = 0;
    Object.keys(aFull).forEach((k) => {
      if (bFull[k] != null) {
        const n1 = aFull[k], n2 = bFull[k];
        f += Math.pow(0.5, n1 + n2 + 1);
      }
    });
    return clamp(f, 0, 0.75);
  }

  // --- Marktwert / Bewertung in Euro.
  function valuation(horse, currentWeek, prestigeMult) {
    const y = ageYears(horse, currentWeek);
    const af = ageFactor(y);
    const maxPot = Math.max.apply(null, DISC.map((d) => horse.potential[d]));
    const maxSkill = Math.max.apply(null, DISC.map((d) => horse.skill[d]));
    const sumSkill = DISC.reduce((s, d) => s + horse.skill[d], 0);
    const pheno = Genetics.describe(horse.genotype, y);
    const bdef = Names.BREEDS[horse.breed] || { value: 1 };

    let v = 1500;
    v += horse.conformation * 42;
    v += maxPot * 34;
    v += maxSkill * 42 * af;
    v += sumSkill * 5;
    v += pheno.rarity * 9000;
    v += horse.wins * 650;
    v += horse.earnings * 0.25;
    v += (horse.temperament - 50) * 12;
    v -= (100 - horse.health) * 60;

    // Alterskurve auf den Gesamtwert.
    if (y < 1) v *= 0.6;                 // Fohlen: Risiko-Abschlag
    else if (y < 3) v *= 0.82;
    else if (y <= 12) v *= 1;
    else v *= clamp(1 - (y - 12) * 0.09, 0.25, 1);

    v *= bdef.value;
    v *= (prestigeMult || 1);

    // Traechtige Stute: Aufschlag.
    if (horse.pregnancy) v *= 1.12;

    return Math.max(300, Math.round(v / 50) * 50);
  }

  function bestDiscipline(horse) {
    let best = DISC[0], bv = -1;
    DISC.forEach((d) => { const s = horse.skill[d] + horse.potential[d] * 0.3; if (s > bv) { bv = s; best = d; } });
    return best;
  }

  return {
    WEEKS_PER_YEAR: WEEKS_PER_YEAR,
    GESTATION_WEEKS: GESTATION_WEEKS,
    MATURITY_YEARS: MATURITY_YEARS,
    MAX_BREED_AGE: MAX_BREED_AGE,
    DISC: DISC,
    clamp: clamp, gauss: gauss, randInt: randInt,
    nextId: nextId,
    ageYears: ageYears,
    isAdult: isAdult,
    ageFactor: ageFactor,
    generateHorse: generateHorse,
    breed: breed,
    inbreedingCoefficient: inbreedingCoefficient,
    valuation: valuation,
    bestDiscipline: bestDiscipline,
  };
})();
