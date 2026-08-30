/* ============================================================================
   Pferde-Modell: Erzeugung, Alterung, Bewertung, Inzucht (COI) und die
   komplette Werte-Vererbung.
   Globales `Model`. Hängt an `Genetics` und `Names`.

   ----------------------------------------------------------------------------
   WERTE EINES PFERDES

   - Begabungen: 6 Disziplinen (Dressur, Springen, ...), je Ausbildung + Potenzial.
   - Exterieur (Gebäude): 6 Einzelnoten - Kopf & Hals, Schulter, Rücken,
     Hinterhand, Fundament, Bewegung. `conformation` = Mittel daraus.
   - Interieur (Charakter/Rittigkeit): 5 Einzelnoten - Nervenstärke,
     Leistungsbereitschaft, Rittigkeit, Lernwille, Umgänglichkeit.
     `temperament` = Mittel daraus.
   - Gesundheit, Energie.

   VERERBUNG (siehe breed() und foalStatForecast()) - jede Einzelnote erbt
   unabhängig nach demselben Schema:

       Erwartung  = Ø(Vater, Mutter) * (1 - k) + Zugkraft * k
                    - COI-Abzug  - Mix-Abzug
       Fohlenwert = Erwartung + Zufallsstreuung

   Weil jede Einzelnote getrennt vererbt, kann eine im Rücken schwache Stute
   an einem im Rücken starken Hengst ein Fohlen bekommen, das im Rücken etwa
   in der Mitte liegt - genau wie in der echten Zucht. Der Zuchtplaner rechnet
   das vor (matingMatch()).
   ========================================================================== */
const Model = (function () {
  'use strict';

  const DISC = Names.DISCIPLINES;
  const WEEKS_PER_YEAR = 52;
  const GESTATION_WEEKS = 48;
  const MATURITY_YEARS = 3;
  const MAX_BREED_AGE = 22;

  const EXTERIEUR_TRAITS = ['Kopf & Hals', 'Schulter', 'Rücken', 'Hinterhand', 'Fundament', 'Bewegung'];
  const INTERIEUR_TRAITS = ['Nervenstärke', 'Leistungsbereitschaft', 'Rittigkeit', 'Lernwille', 'Umgänglichkeit'];
  const GESUNDHEIT_TRAITS = ['Fundament & Sehnen', 'Atemwege', 'Herz-Kreislauf', 'Hufe', 'Immunsystem'];

  const INH = {
    begabungRegression: 0.06,
    begabungSpread: 6,
    begabungCoi: 38,
    begabungMix: 5,
    exterieurTypePull: 0.08,      // Zug Richtung Rasse-Standard
    exterieurTraitSpread: 6,
    exterieurCoi: 30,
    exterieurMix: 5,
    interieurRegression: 0.05,    // Zug Richtung 55 (etwas "gutmütiger" Schnitt)
    interieurTraitSpread: 11,
    interieurCoi: 10,
    gesundheitRegression: 0.15,   // Zug Richtung "gesund" (92)
    gesundheitPull: 92,
    gesundheitTraitSpread: 6,
    gesundheitCoi: 72,
    gesundheitMix: 3,
  };

  let _seq = 1;
  function nextId() { return 'h' + (Date.now().toString(36)) + '_' + (_seq++); }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function gauss(mean, sd) {
    const u = 1 - Math.random(), v = Math.random();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function round(v) { return Math.round(v); }
  function mean(obj, keys) { return keys.reduce((s, k) => s + obj[k], 0) / keys.length; }

  function ageYears(horse, currentWeek) { return (currentWeek - horse.bornWeek) / WEEKS_PER_YEAR; }
  function isAdult(horse, currentWeek) { return ageYears(horse, currentWeek) >= MATURITY_YEARS; }

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
    // value: 1 auch für Mixe — der Mix-Malus steckt in valuation() (× 0.5),
    // sonst würde er hier ein zweites Mal greifen.
    return Names.BREEDS[breed] || { conf: 66, value: 1, aff: {} };
  }

  // Einzelnoten lesen - auch für alte Spielstände ohne Detailwerte (dann
  // wird die Sammelnote gleichmäßig auf alle Einzelnoten verteilt).
  function exterieurOf(h) {
    if (h.exterieur) return h.exterieur;
    const o = {}; EXTERIEUR_TRAITS.forEach((t) => (o[t] = h.conformation != null ? h.conformation : 60));
    return o;
  }
  function interieurOf(h) {
    if (h.interieur) return h.interieur;
    const o = {}; INTERIEUR_TRAITS.forEach((t) => (o[t] = h.temperament != null ? h.temperament : 60));
    return o;
  }
  function gesundheitOf(h) {
    if (h.gesundheit) return h.gesundheit;
    const o = {}; GESUNDHEIT_TRAITS.forEach((t) => (o[t] = h.health != null ? h.health : 88));
    return o;
  }

  // Fehlende Detailwerte für alte Spielstände nachrüsten.
  function ensureTraits(h) {
    if (!h.exterieur) { h.exterieur = {}; EXTERIEUR_TRAITS.forEach((t) => (h.exterieur[t] = h.conformation != null ? h.conformation : 62)); }
    if (!h.interieur) { h.interieur = {}; INTERIEUR_TRAITS.forEach((t) => (h.interieur[t] = h.temperament != null ? h.temperament : 60)); }
    if (!h.gesundheit) { h.gesundheit = {}; GESUNDHEIT_TRAITS.forEach((t) => (h.gesundheit[t] = h.health != null ? h.health : 88)); }
    if (h.zuchtzulassung === undefined) h.zuchtzulassung = null;
    if (h.praemie === undefined) h.praemie = null;
    if (h.titel === undefined) h.titel = null;
    if (h.leistungspruefung === undefined) h.leistungspruefung = null;
    if (h.pendingTest === undefined) h.pendingTest = null;
    if (h.noPapers === undefined) h.noPapers = false;
    if (h.foalsBred === undefined) h.foalsBred = 0;
    if (h.foalQualSum === undefined) h.foalQualSum = 0;
    if (h.genoTested === undefined) h.genoTested = true;   // Altbestand gilt als getestet
    if (h.jungPunkte === undefined) h.jungPunkte = {};
    return h;
  }

  // Verdeckte letale Träger, die ein Farbtest aufdeckt (heterozygot O bzw. Rn).
  function lethalCarriers(h) {
    if (!h || h.genoTested === false || !h.genotype) return [];
    const out = [];
    const o = h.genotype.O || [];
    if (o.indexOf('O') !== -1 && !(o[0] === 'O' && o[1] === 'O')) out.push('Frame Overo (OLWS)');
    const rn = h.genotype.RN || [];
    if (rn.indexOf('Rn') !== -1 && !(rn[0] === 'Rn' && rn[1] === 'Rn')) out.push('Roan');
    return out;
  }

  function recalcHealth(h) {
    if (h.gesundheit) h.health = clamp(round(mean(h.gesundheit, GESUNDHEIT_TRAITS)), 5, 100);
    return h.health;
  }
  // Signierte Anpassung, gleichmäßig auf alle Gesundheits-Einzelnoten.
  function adjustHealth(h, delta) {
    if (!h.gesundheit) { h.health = clamp(h.health + delta, 0, 100); return; }
    const per = delta / GESUNDHEIT_TRAITS.length;
    GESUNDHEIT_TRAITS.forEach((t) => { h.gesundheit[t] = clamp(h.gesundheit[t] + per, 5, 100); });
    recalcHealth(h);
  }
  // Konzentrierter Schaden auf eine zufällige Einzelnote (Verletzung/Alter).
  function injureHealth(h, amount, keys) {
    keys = keys || GESUNDHEIT_TRAITS;
    if (!h.gesundheit) { h.health = clamp(h.health - amount, 0, 100); return; }
    const t = keys[randInt(0, keys.length - 1)];
    h.gesundheit[t] = clamp(h.gesundheit[t] - amount, 5, 100);
    recalcHealth(h);
  }

  // --- Neues Pferd "aus dem Nichts".
  function generateHorse(opts) {
    opts = opts || {};
    const breed = opts.breed || Names.BREED_KEYS[randInt(0, Names.BREED_KEYS.length - 1)];
    const bdef = breedDef(breed);
    const sex = opts.sex || (Math.random() < 0.5 ? 'hengst' : 'stute');
    const quality = opts.quality != null ? opts.quality : clamp(gauss(0.5, 0.16), 0.05, 0.98);
    const y = opts.ageYears != null ? opts.ageYears : (3 + Math.random() * 8);
    const bornWeek = (opts.currentWeek || 0) - Math.round(y * WEEKS_PER_YEAR);

    const genotype = opts.genotype || Genetics.randomGenotype(bdef.af);
    const potential = {};
    DISC.forEach((d) => {
      const aff = (bdef.aff && bdef.aff[d]) || 1;
      potential[d] = clamp(round((30 + quality * 55 + gauss(0, 9)) * aff), 5, 100);
    });

    // Exterieur: Einzelnoten um ein qualitätsabhängiges Zentrum streuen.
    const confCenter = bdef.conf + (quality - 0.5) * 34 + gauss(0, 4);
    const exterieur = {};
    EXTERIEUR_TRAITS.forEach((t) => { exterieur[t] = clamp(round(confCenter + gauss(0, 8)), 10, 100); });
    const conformation = clamp(round(mean(exterieur, EXTERIEUR_TRAITS)), 10, 100);

    // Interieur: Einzelnoten um ein eigenes Zentrum.
    const tempCenter = gauss(58, 12) + (quality - 0.5) * 10;
    const interieur = {};
    INTERIEUR_TRAITS.forEach((t) => { interieur[t] = clamp(round(tempCenter + gauss(0, 11)), 10, 99); });
    const temperament = clamp(round(mean(interieur, INTERIEUR_TRAITS)), 10, 99);

    // Gesundheit: Einzelnoten um ein Zentrum nahe "gesund".
    const healthCenter = gauss(90, 6) + (quality - 0.5) * 6;
    const gesundheit = {};
    GESUNDHEIT_TRAITS.forEach((t) => { gesundheit[t] = clamp(round(healthCenter + gauss(0, 6)), 25, 100); });
    const health = clamp(round(mean(gesundheit, GESUNDHEIT_TRAITS)), 25, 100);

    const skill = emptySkill();
    if (y >= MATURITY_YEARS && !opts.untrained) {
      const trainedFrac = clamp(gauss(0.45, 0.22), 0, 0.92);
      DISC.forEach((d) => { skill[d] = round(potential[d] * trainedFrac * clamp((y - 2) / 5, 0.2, 1)); });
    }

    // Zuchtzulassung: Deckstation-/Markt-/Auktions-/Rivalenpferde können
    // bereits gekört/eingetragen sein. Fohlen und Startbestand nicht.
    let zul = null, prm = null, lp = null;
    if (opts.approved) {
      zul = (sex === 'hengst' ? 'gekört, ' : 'eingetragen, ') + (quality > 0.7 ? 'Zuchtbuch I' : 'Zuchtbuch II');
      if (quality > 0.85) prm = quality > 0.93 ? 'Staatsprämie' : 'Ia-Prämie';
      else if (quality > 0.72) prm = 'Ib-Prämie';
      if (quality > 0.6) lp = { index: clamp(round(60 + quality * 70 + gauss(0, 10)), 40, 155), gaits: 0, ride: 0, jump: 0, char: 0, week: opts.currentWeek || 0 };
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
      exterieur: exterieur,
      interieur: interieur,
      gesundheit: gesundheit,
      conformation: conformation,
      temperament: temperament,
      health: health,
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
      zuchtzulassung: zul,
      praemie: prm,
      titel: null,
      leistungspruefung: lp,
      pendingTest: null,
      noPapers: false,
      foalsBred: 0,
      foalQualSum: 0,
      bred: !!opts.bred,
      genoTested: opts.genoTested != null ? opts.genoTested : true,
      origin: opts.origin || 'generiert',
      acquiredWeek: opts.currentWeek || 0,
    };
  }

  function approvalRank(s) {
    if (!s) return 0;
    if (/Zuchtbuch I\b/.test(s)) return 3;
    if (/gekört|eingetragen/.test(s)) return 2;
    return 1;
  }

  function syntheticAncestors() {
    const m = {};
    const base = 'X' + Math.random().toString(36).slice(2, 8);
    for (let i = 0; i < randInt(2, 4); i++) m[base + '_' + i] = randInt(2, 4);
    return m;
  }

  // Aus einem per Tauschcode empfangenen "packHorse"-Objekt ein vollwertiges
  // Pferd im eigenen Bestand machen (frische ID, konsistente Sammelnoten).
  function hydratePackedHorse(p, currentWeek, origin) {
    const h = {
      id: nextId(),
      name: p.name || Names.randName(),
      sex: p.sex || 'stute',
      breed: p.breed,
      isMix: !!p.isMix || isMixBreed(p.breed),
      bornWeek: currentWeek - (p.ageWeeks || 3 * WEEKS_PER_YEAR),
      genotype: p.genotype,
      potential: Object.assign({}, p.potential),
      skill: Object.assign(emptySkill(), p.skill || {}),
      exterieur: p.exterieur ? Object.assign({}, p.exterieur) : null,
      interieur: p.interieur ? Object.assign({}, p.interieur) : null,
      gesundheit: p.gesundheit ? Object.assign({}, p.gesundheit) : null,
      conformation: p.conformation, temperament: p.temperament, health: p.health,
      energy: 100,
      quality: p.quality != null ? p.quality : 0.5,
      trainingFocus: null, trainingPlan: [],
      pregnancy: null, forSale: null,
      wins: p.wins || 0, shows: 0, earnings: p.earnings || 0, showLog: [],
      turnierPunkte: p.turnierPunkte || {},
      sireId: null, damId: null, sireName: p.sireName || null, damName: p.damName || null,
      ancestors: p.ancestors && Object.keys(p.ancestors).length ? p.ancestors : syntheticAncestors(),
      genoTested: p.genoTested !== false,
      zuchtzulassung: p.zuchtzulassung || null, praemie: p.praemie || null,
      titel: p.titel || null, leistungspruefung: p.leistungspruefung || null,
      noPapers: !!p.noPapers, pendingTest: null,
      foalsBred: p.foalsBred || 0, foalQualSum: p.foalQualSum || 0,
      bred: false, origin: origin || 'von Freund', acquiredWeek: currentWeek,
    };
    ensureTraits(h);
    h.conformation = clamp(round(mean(h.exterieur, EXTERIEUR_TRAITS)), 5, 100);
    h.temperament = clamp(round(mean(h.interieur, INTERIEUR_TRAITS)), 5, 100);
    h.health = clamp(round(mean(h.gesundheit, GESUNDHEIT_TRAITS)), 5, 100);
    return h;
  }

  function parentSnapshot(h) {
    return {
      id: h.id, name: h.name, sex: h.sex, breed: h.breed,
      genotype: h.genotype, potential: Object.assign({}, h.potential),
      exterieur: Object.assign({}, exterieurOf(h)),
      interieur: Object.assign({}, interieurOf(h)),
      gesundheit: Object.assign({}, gesundheitOf(h)),
      zuchtzulassung: h.zuchtzulassung || null, praemie: h.praemie || null, titel: h.titel || null,
      leistungspruefung: h.leistungspruefung || null, noPapers: !!h.noPapers,
      genoTested: h.genoTested !== false,
      conformation: h.conformation, temperament: h.temperament, health: h.health,
      quality: h.quality, ancestors: Object.assign({}, h.ancestors || {}),
    };
  }

  // Ein Einzelwert-Forecast: Ø Eltern -> Erwartung -> Streubereich.
  function traitForecast(sv, dv, opts) {
    const pm = (sv + dv) / 2;
    let e = pm * (1 - opts.k) + opts.pull * opts.k - opts.coi + opts.mix;
    e = clamp(round(e), opts.lo, opts.hi);
    return {
      sire: round(sv), dam: round(dv), parentMean: round(pm), expect: e,
      min: clamp(round(e - 2 * opts.spread), opts.lo, opts.hi),
      max: clamp(round(e + 2 * opts.spread), opts.lo, opts.hi),
    };
  }

  // --- Deterministische Erwartungswerte einer Anpaarung (ohne Zufall).
  function foalStatForecast(sire, dam) {
    const coi = inbreedingCoefficient(sire, dam);
    const mix = sire.breed !== dam.breed;
    const foalBreed = mix ? ('Mix (' + sire.breed + ' × ' + dam.breed + ')') : sire.breed;
    const bdef = breedDef(mix ? sire.breed : foalBreed);

    const begabungen = {};
    DISC.forEach((d) => {
      begabungen[d] = traitForecast(sire.potential[d], dam.potential[d], {
        k: INH.begabungRegression, pull: 50,
        coi: coi * INH.begabungCoi, mix: mix ? -INH.begabungMix : 0,
        spread: INH.begabungSpread, lo: 3, hi: 100,
      });
    });

    const sEx = exterieurOf(sire), dEx = exterieurOf(dam);
    const exterieurTraits = {};
    EXTERIEUR_TRAITS.forEach((t) => {
      exterieurTraits[t] = traitForecast(sEx[t], dEx[t], {
        k: INH.exterieurTypePull, pull: bdef.conf,
        coi: coi * INH.exterieurCoi, mix: mix ? -INH.exterieurMix : 0,
        spread: INH.exterieurTraitSpread, lo: 10, hi: 100,
      });
    });

    const sIn = interieurOf(sire), dIn = interieurOf(dam);
    const interieurTraits = {};
    INTERIEUR_TRAITS.forEach((t) => {
      interieurTraits[t] = traitForecast(sIn[t], dIn[t], {
        k: INH.interieurRegression, pull: 55,
        coi: coi * INH.interieurCoi, mix: 0,
        spread: INH.interieurTraitSpread, lo: 10, hi: 99,
      });
    });

    const sHe = gesundheitOf(sire), dHe = gesundheitOf(dam);
    const gesundheitTraits = {};
    GESUNDHEIT_TRAITS.forEach((t) => {
      gesundheitTraits[t] = traitForecast(sHe[t], dHe[t], {
        k: INH.gesundheitRegression, pull: INH.gesundheitPull,
        coi: coi * INH.gesundheitCoi, mix: mix ? -INH.gesundheitMix : 0,
        spread: INH.gesundheitTraitSpread, lo: 15, hi: 100,
      });
    });

    const aggr = (traits, keys, spread, lo, hi) => {
      const expect = round(keys.reduce((s, k) => s + traits[k].expect, 0) / keys.length);
      const pmean = round(keys.reduce((s, k) => s + traits[k].parentMean, 0) / keys.length);
      const band = 2 * spread / Math.sqrt(keys.length);
      return { parentMean: pmean, expect: expect, min: clamp(round(expect - band), lo, hi), max: clamp(round(expect + band), lo, hi) };
    };

    return {
      coi: coi, mix: mix, foalBreed: foalBreed,
      begabungen: begabungen,
      exterieurTraits: exterieurTraits,
      interieurTraits: interieurTraits,
      gesundheitTraits: gesundheitTraits,
      exterieur: aggr(exterieurTraits, EXTERIEUR_TRAITS, INH.exterieurTraitSpread, 10, 100),
      interieur: aggr(interieurTraits, INTERIEUR_TRAITS, INH.interieurTraitSpread, 10, 99),
      gesundheit: aggr(gesundheitTraits, GESUNDHEIT_TRAITS, INH.gesundheitTraitSpread, 15, 100),
    };
  }

  // --- Wie gut ergänzt der Hengst die Stute? Bewertet die Schwächen der
  //     Stute (Einzelnoten < 70) und wie stark sie das erwartete Fohlen hebt.
  function matingMatch(sire, dam) {
    const fc = foalStatForecast(sire, dam);
    const dEx = exterieurOf(dam), dIn = interieurOf(dam);
    const improves = [], keepsHigh = [], worsens = [];
    let weakGain = 0, weakCount = 0, strongDrop = 0, strongCount = 0;

    EXTERIEUR_TRAITS.forEach((t) => {
      const dv = dEx[t], fe = fc.exterieurTraits[t].expect;
      if (dv < 70) { weakCount++; weakGain += (fe - dv); if (fe - dv >= 3) improves.push({ group: 'Exterieur', trait: t, from: dv, to: fe }); }
      else { strongCount++; strongDrop += Math.min(0, fe - dv); if (fe >= dv - 2) keepsHigh.push({ group: 'Exterieur', trait: t, to: fe }); }
      if (fe < dv - 5) worsens.push({ group: 'Exterieur', trait: t, from: dv, to: fe });
    });
    INTERIEUR_TRAITS.forEach((t) => {
      const dv = dIn[t], fe = fc.interieurTraits[t].expect;
      if (dv < 70) { weakCount++; weakGain += (fe - dv); if (fe - dv >= 3) improves.push({ group: 'Interieur', trait: t, from: dv, to: fe }); }
      else { strongCount++; strongDrop += Math.min(0, fe - dv); if (fe >= dv - 2) keepsHigh.push({ group: 'Interieur', trait: t, to: fe }); }
      if (fe < dv - 5) worsens.push({ group: 'Interieur', trait: t, from: dv, to: fe });
    });
    const dHe = gesundheitOf(dam);
    GESUNDHEIT_TRAITS.forEach((t) => {
      const dv = dHe[t], fe = fc.gesundheitTraits[t].expect;
      if (dv < 75) { weakCount++; weakGain += (fe - dv); if (fe - dv >= 3) improves.push({ group: 'Gesundheit', trait: t, from: dv, to: fe }); }
      if (fe < dv - 6) worsens.push({ group: 'Gesundheit', trait: t, from: dv, to: fe });
    });

    let score = 50;
    if (weakCount) score += (weakGain / weakCount) * 2.0;          // Schwächen ausgleichen zählt am meisten
    if (strongCount) score += (strongDrop / strongCount) * 1.4;    // Stärken nicht verlieren
    score += (fc.exterieur.expect - dam.conformation) * 0.5;
    score -= (92 - fc.gesundheit.expect) * 0.45;                   // niedrige Fohlengesundheit ist schlecht
    score -= fc.coi * 100 * 0.6;
    score -= fc.mix ? 12 : 0;
    score = clamp(round(score), 0, 100);

    return { score: score, improves: improves, worsens: worsens, keepsHigh: keepsHigh, coi: fc.coi, mix: fc.mix, forecast: fc };
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
    const exterieur = {};
    EXTERIEUR_TRAITS.forEach((t) => {
      exterieur[t] = clamp(round(fc.exterieurTraits[t].expect + gauss(0, INH.exterieurTraitSpread)), 8, 100);
    });
    const interieur = {};
    INTERIEUR_TRAITS.forEach((t) => {
      interieur[t] = clamp(round(fc.interieurTraits[t].expect + gauss(0, INH.interieurTraitSpread)), 8, 99);
    });
    const gesundheit = {};
    GESUNDHEIT_TRAITS.forEach((t) => {
      gesundheit[t] = clamp(round(fc.gesundheitTraits[t].expect + gauss(0, INH.gesundheitTraitSpread)), 12, 100);
    });

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
      exterieur: exterieur,
      interieur: interieur,
      gesundheit: gesundheit,
      conformation: clamp(round(mean(exterieur, EXTERIEUR_TRAITS)), 8, 100),
      temperament: clamp(round(mean(interieur, INTERIEUR_TRAITS)), 8, 99),
      health: clamp(round(mean(gesundheit, GESUNDHEIT_TRAITS)), 8, 100),
      energy: 100,
      quality: clamp((sire.quality + dam.quality) / 2 + gauss(0, 0.06) - coi * 0.3 - (fc.mix ? 0.08 : 0), 0.02, 0.99),
      trainingFocus: null,
      pregnancy: null,
      forSale: null,
      wins: 0, shows: 0, earnings: 0, showLog: [],
      sireId: sire.id, damId: dam.id,
      sireName: sire.name, damName: dam.name,
      ancestors: mergeAncestors(sire, dam),
      zuchtzulassung: null, praemie: null, titel: null, leistungspruefung: null, pendingTest: null,
      genoTested: false,   // Fohlen: Farbträger erst per Farbtest bekannt
      foalsBred: 0, foalQualSum: 0,
      // Ohne Zuchtbucheintrag, wenn der Vater nicht (mind.) gekört/eingetragen ist.
      noPapers: fc.mix || approvalRank(sire.zuchtzulassung) < 2,
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

  // --- Stammbaum: rekursiv über die Herde/Steckbriefe auflösen, bis Tiefe
  //     `depth`. `lookup(id)` liefert ein Pferd oder null; unbekannte Ahnen
  //     werden als Blatt mit Namen (oder "?") dargestellt.
  function pedigree(h, lookup, depth) {
    function node(ref, name, d) {
      const horse = ref ? lookup(ref) : null;
      if (horse) {
        return {
          name: horse.name, id: horse.id, breed: horse.breed,
          zuchtzulassung: horse.zuchtzulassung || null, praemie: horse.praemie || null, titel: horse.titel || null,
          conf: Math.round(horse.conformation), health: Math.round(horse.health),
          sire: d > 1 ? node(horse.sireId, horse.sireName, d - 1) : null,
          dam: d > 1 ? node(horse.damId, horse.damName, d - 1) : null,
        };
      }
      if (name) return { name: name, unknown: true, sire: null, dam: null };
      return { name: '—', empty: true, sire: null, dam: null };
    }
    return {
      self: { name: h.name, id: h.id },
      sire: node(h.sireId, h.sireName, depth),
      dam: node(h.damId, h.damName, depth),
    };
  }

  // --- Vererber-Rating: wie gut fallen die Fohlen dieses Pferdes aus.
  //     Wird bei Geburten fortgeschrieben (foalsBred, foalQualSum).
  function breederRating(h) {
    const n = h.foalsBred || 0;
    if (n < 3) return null;
    const avg = (h.foalQualSum || 0) / n;
    const stars = clamp(Math.round(avg * 5.2), 1, 5);
    return { count: n, avg: avg, stars: stars };
  }

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

    // Zuchtzulassung / Prämierung / Leistungsprüfung.
    v += [0, 700, 2400, 4800][approvalRank(horse.zuchtzulassung)];
    v += { 'Ib-Prämie': 1500, 'Ia-Prämie': 4000, 'Staatsprämie': 9000 }[horse.praemie] || 0;
    if (horse.titel) v += 6000;
    if (horse.leistungspruefung) v += (horse.leistungspruefung.index - 40) * 30;
    const br = breederRating(horse);
    if (br) v += (br.stars - 2) * 2600 + br.count * 200;   // Vererber-Bonus
    if (horse.noPapers) v *= 0.62;   // Fohlen ohne Zuchtbucheintrag
    if (horse.genoTested === false) v *= 0.96;             // Farbträger unbekannt
    else if (lethalCarriers(horse).length) v *= 0.93;      // trägt eine Letalfarbe

    if (y < 1) v *= 0.6;
    else if (y < 3) v *= 0.82;
    else if (y <= 12) v *= 1;
    else v *= clamp(1 - (y - 12) * 0.09, 0.25, 1);

    v *= (bdef.value || 1);
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
    EXTERIEUR_TRAITS: EXTERIEUR_TRAITS,
    INTERIEUR_TRAITS: INTERIEUR_TRAITS,
    GESUNDHEIT_TRAITS: GESUNDHEIT_TRAITS,
    INH: INH,
    clamp: clamp, gauss: gauss, randInt: randInt,
    nextId: nextId,
    ageYears: ageYears,
    isAdult: isAdult,
    ageFactor: ageFactor,
    isMixBreed: isMixBreed,
    approvalRank: approvalRank,
    pedigree: pedigree,
    breederRating: breederRating,
    breedDef: breedDef,
    lethalCarriers: lethalCarriers,
    exterieurOf: exterieurOf,
    interieurOf: interieurOf,
    gesundheitOf: gesundheitOf,
    ensureTraits: ensureTraits,
    recalcHealth: recalcHealth,
    adjustHealth: adjustHealth,
    injureHealth: injureHealth,
    generateHorse: generateHorse,
    hydratePackedHorse: hydratePackedHorse,
    parentSnapshot: parentSnapshot,
    foalStatForecast: foalStatForecast,
    matingMatch: matingMatch,
    breed: breed,
    inbreedingCoefficient: inbreedingCoefficient,
    valuation: valuation,
    bestDiscipline: bestDiscipline,
  };
})();
