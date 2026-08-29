/* ============================================================================
   Pferde-Modell: Erzeugung, Alterung, Bewertung, Inzucht (COI) und die
   komplette Werte-Vererbung (Exterieur / Interieur / Begabungen).
   Globales `Model`. Hängt an `Genetics` und `Names`.

   ----------------------------------------------------------------------------
   VERERBUNG DER WERTE  (siehe breed() und foalStatForecast())

   Alle vererbten Werte laufen nach demselben Schema:

       Erwartung = Elternmittel * (1 - k) + Zugkraft * k
                   + Rasse-Typkorrektur
                   - Inzucht-Abzug (COI)
                   - Mix-Abzug (nur bei Rassenkreuzung)
       Ergebnis  = Erwartung + Zufallsstreuung (Rekombination)

   - Elternmittel = (Vater + Mutter) / 2. Das ist der beste Schätzer -
     deshalb kann man sich passende Anpaarungen ausrechnen.
   - k = "Regression zur Mitte": ein Teil zieht Richtung Durchschnitt (50)
     bzw. Richtung Rasse-Standard. Zwei Spitzenpferde bekommen im Schnitt
     ein leicht schwächeres Fohlen -> man muss weiter aufwerten.
   - COI senkt Begabungen, Exterieur, Interieur und vor allem Gesundheit.
   - Mix (Vater- und Mutterrasse verschieden): das Fohlen ist typlos, Ø der
     Begabungen sinkt, Exterieur sinkt, und der Marktwert wird zusätzlich
     halbiert (siehe valuation()).
   - Zufallsstreuung: Begabungen ±~6, Exterieur ±~4, Interieur ±~9 (Charakter
     ist am wenigsten erblich), Gesundheit ±~4.
   ========================================================================== */
const Model = (function () {
  'use strict';

  const DISC = Names.DISCIPLINES;
  const WEEKS_PER_YEAR = 52;
  const GESTATION_WEEKS = 48;         // ~11 Monate
  const MATURITY_YEARS = 3;           // ab hier Training/Sport/Zucht
  const MAX_BREED_AGE = 22;

  // Vererbungs-Parameter (zentral, damit die Vorschau exakt zur echten
  // Zucht passt).
  const INH = {
    begabungRegression: 0.06,   // k Richtung 50
    begabungSpread: 6,
    begabungCoi: 38,
    begabungMix: 5,
    exterieurTypePull: 0.08,    // k Richtung Rasse-Standard-Exterieur
    exterieurSpread: 4,
    exterieurCoi: 30,
    exterieurMix: 5,
    interieurCoi: 8,
    interieurSpread: 9,
    gesundheitBase: 96,
    gesundheitCoi: 72,
    gesundheitMix: 3,
    gesundheitSpread: 4,
  };

  let _seq = 1;
  function nextId() { return 'h' + (Date.now().toString(36)) + '_' + (_seq++); }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function gauss(mean, sd) {
    // Box-Muller
    const u = 1 - Math.random(), v = Math.random();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function round(v) { return Math.round(v); }

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

  function isMixBreed(breed) { return typeof breed === 'string' && breed.indexOf('Mix') === 0; }
  function breedDef(breed) {
    return Names.BREEDS[breed] || { conf: 66, value: isMixBreed(breed) ? 0.55 : 1, aff: {} };
  }

  // --- Neues Pferd "aus dem Nichts" (Markt / Auktion / Deckstation / Start).
  function generateHorse(opts) {
    opts = opts || {};
    const breed = opts.breed || Names.BREED_KEYS[randInt(0, Names.BREED_KEYS.length - 1)];
    const bdef = breedDef(breed);
    const sex = opts.sex || (Math.random() < 0.5 ? 'hengst' : 'stute');
    const quality = opts.quality != null ? opts.quality : clamp(gauss(0.5, 0.16), 0.05, 0.98); // 0..1
    const y = opts.ageYears != null ? opts.ageYears : (3 + Math.random() * 8);
    const bornWeek = (opts.currentWeek || 0) - Math.round(y * WEEKS_PER_YEAR);

    const genotype = opts.genotype || Genetics.randomGenotype(bdef.af);
    const potential = {};
    DISC.forEach((d) => {
      const aff = (bdef.aff && bdef.aff[d]) || 1;
      potential[d] = clamp(round((30 + quality * 55 + gauss(0, 9)) * aff), 5, 100);
    });
    const conformation = clamp(round(bdef.conf + (quality - 0.5) * 34 + gauss(0, 5)), 20, 100);

    const skill = emptySkill();
    if (y >= MATURITY_YEARS && !opts.untrained) {
      const trainedFrac = clamp(gauss(0.45, 0.22), 0, 0.92);
      DISC.forEach((d) => { skill[d] = round(potential[d] * trainedFrac * clamp((y - 2) / 5, 0.2, 1)); });
    }

    return {
      id: opts.id || nextId(),
      name: opts.name || Names.randName(),
      sex: sex,
      breed: breed,
      isMix: isMixBreed(breed),
      bornWeek: bornWeek,
      genotype: genotype,
      potential: potential,
      skill: skill,
      conformation: conformation,
      temperament: clamp(round(gauss(60, 15)), 15, 98),   // = Interieur
      health: clamp(round(gauss(88, 8)), 40, 100),
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
      ancestors: opts.ancestors || syntheticAncestors(),
      bred: !!opts.bred,
      origin: opts.origin || 'generiert',
      acquiredWeek: opts.currentWeek || 0,
    };
  }

  function syntheticAncestors() {
    const m = {};
    const base = 'X' + Math.random().toString(36).slice(2, 8);
    for (let i = 0; i < randInt(2, 4); i++) m[base + '_' + i] = randInt(2, 4);
    return m;
  }

  // Kompakter "Steckbrief" eines Elternteils - so viel muss zum Zeitpunkt
  // der Bedeckung gespeichert werden, damit das Fohlen später korrekt erbt,
  // auch wenn der Hengst verkauft wurde oder aus der Deckstation rotiert ist.
  function parentSnapshot(h) {
    return {
      id: h.id, name: h.name, sex: h.sex, breed: h.breed,
      genotype: h.genotype, potential: Object.assign({}, h.potential),
      conformation: h.conformation, temperament: h.temperament,
      quality: h.quality, ancestors: Object.assign({}, h.ancestors || {}),
    };
  }

  // --- Deterministische Erwartungswerte einer Anpaarung (für die Vorschau
  //     im Zuchtplaner). KEINE Zufallsstreuung - das ist der Mittelwert,
  //     um den das echte Fohlen dann streut.
  function foalStatForecast(sire, dam) {
    const coi = inbreedingCoefficient(sire, dam);
    const mix = sire.breed !== dam.breed;
    const foalBreed = mix ? ('Mix (' + sire.breed + ' × ' + dam.breed + ')') : sire.breed;
    const bdef = breedDef(mix ? sire.breed : foalBreed);

    const begabungen = {};
    DISC.forEach((d) => {
      const pm = (sire.potential[d] + dam.potential[d]) / 2;
      let e = pm * (1 - INH.begabungRegression) + 50 * INH.begabungRegression;
      e -= coi * INH.begabungCoi;
      if (mix) e -= INH.begabungMix;
      e = clamp(round(e), 3, 100);
      begabungen[d] = {
        parentMean: round(pm),
        expect: e,
        min: clamp(round(e - 2 * INH.begabungSpread), 3, 100),
        max: clamp(round(e + 2 * INH.begabungSpread), 3, 100),
      };
    });

    const cm = (sire.conformation + dam.conformation) / 2;
    let ce = cm * (1 - INH.exterieurTypePull) + bdef.conf * INH.exterieurTypePull;
    ce -= coi * INH.exterieurCoi;
    if (mix) ce -= INH.exterieurMix;
    ce = clamp(round(ce), 10, 100);

    const tm = (sire.temperament + dam.temperament) / 2;
    const te = clamp(round(tm - coi * INH.interieurCoi), 10, 99);

    const ge = clamp(round(INH.gesundheitBase - coi * INH.gesundheitCoi - (mix ? INH.gesundheitMix : 0)), 20, 100);

    return {
      coi: coi,
      mix: mix,
      foalBreed: foalBreed,
      begabungen: begabungen,
      exterieur: { parentMean: round(cm), expect: ce, min: clamp(ce - 2 * INH.exterieurSpread, 10, 100), max: clamp(ce + 2 * INH.exterieurSpread, 10, 100) },
      interieur: { parentMean: round(tm), expect: te, min: clamp(te - 2 * INH.interieurSpread, 10, 99), max: clamp(te + 2 * INH.interieurSpread, 10, 99) },
      gesundheit: { expect: ge, min: clamp(ge - 2 * INH.gesundheitSpread, 20, 100), max: 100 },
    };
  }

  // --- Fohlen aus zwei Elternpferden (bzw. Eltern-Steckbriefen).
  function breed(sire, dam, currentWeek) {
    const gt = Genetics.breedGenotype(sire.genotype, dam.genotype);
    const lethal = Genetics.lethalCheck(gt);
    const fc = foalStatForecast(sire, dam);
    const coi = fc.coi;

    if (lethal) return { alive: false, reason: lethal.text, code: lethal.code, coi: coi };

    const sex = Math.random() < 0.5 ? 'hengst' : 'stute';

    const potential = {};
    DISC.forEach((d) => {
      potential[d] = clamp(round(fc.begabungen[d].expect + gauss(0, INH.begabungSpread)), 3, 100);
    });
    const conformation = clamp(round(fc.exterieur.expect + gauss(0, INH.exterieurSpread)), 12, 100);
    const temperament = clamp(round(fc.interieur.expect + gauss(0, INH.interieurSpread)), 10, 99);
    const health = clamp(round(fc.gesundheit.expect + gauss(0, INH.gesundheitSpread)), 15, 100);

    const foal = {
      id: nextId(),
      name: null,
      sex: sex,
      breed: fc.foalBreed,
      isMix: fc.mix,
      bornWeek: currentWeek,
      genotype: gt,
      potential: potential,
      skill: emptySkill(),
      conformation: conformation,
      temperament: temperament,
      health: health,
      energy: 100,
      quality: clamp((sire.quality + dam.quality) / 2 + gauss(0, 0.06) - coi * 0.3 - (fc.mix ? 0.08 : 0), 0.02, 0.99),
      trainingFocus: null,
      pregnancy: null,
      forSale: null,
      wins: 0, shows: 0, earnings: 0, showLog: [],
      sireId: sire.id, damId: dam.id,
      sireName: sire.name, damName: dam.name,
      ancestors: mergeAncestors(sire, dam),
      bred: true,
      origin: 'eigene Zucht',
      acquiredWeek: currentWeek,
    };
    return { alive: true, foal: foal, coi: coi };
  }

  function mergeAncestors(sire, dam) {
    const out = {};
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

  // Näherung des Inzuchtkoeffizienten aus den Vorfahren-Karten beider
  // Eltern: gemeinsame Ahnen mit Distanzen n1, n2 tragen (1/2)^(n1+n2+1) bei.
  function inbreedingCoefficient(sire, dam) {
    const a = sire.ancestors || {};
    const b = dam.ancestors || {};
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
    const bdef = breedDef(horse.breed);

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

    if (y < 1) v *= 0.6;
    else if (y < 3) v *= 0.82;
    else if (y <= 12) v *= 1;
    else v *= clamp(1 - (y - 12) * 0.09, 0.25, 1);

    v *= (bdef.value || 1);
    // Mixe verlieren deutlich an Wert (kein Zuchtbuch, kein Typ).
    if (horse.isMix || isMixBreed(horse.breed)) v *= 0.5;
    v *= (prestigeMult || 1);

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
    INH: INH,
    clamp: clamp, gauss: gauss, randInt: randInt,
    nextId: nextId,
    ageYears: ageYears,
    isAdult: isAdult,
    ageFactor: ageFactor,
    isMixBreed: isMixBreed,
    breedDef: breedDef,
    generateHorse: generateHorse,
    parentSnapshot: parentSnapshot,
    foalStatForecast: foalStatForecast,
    breed: breed,
    inbreedingCoefficient: inbreedingCoefficient,
    valuation: valuation,
    bestDiscipline: bestDiscipline,
  };
})();
