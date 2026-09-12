/* ============================================================================
   Wirtschaft & Wettbewerb: Markt, Auktionen, Schauen, Anlagen.
   Reine Logikfunktionen auf dem Spielzustand -> globales `Economy`.
   ========================================================================== */
const Economy = (function () {
  'use strict';

  const clamp = Model.clamp;
  const DISC = Model.DISC;

  // Energiekosten je Trainingseinheit (bis zu 6/Woche). Energie ist reine
  // Trainingsressource - Turniere/Zuchtschauen/Körungen haben keine
  // Energiekosten oder -Mindestwerte mehr (das gehörte zusammen mit der
  // Gesundheit doppelt geprüft, siehe minHealth je Schau, und erlaubte
  // sonst beliebig viele gleichzeitige Nennungen desselben Pferds pro Woche,
  // ohne dass die sinkende Energie sich je auf die Turnierleistung auswirkte).
  //
  // 9 Punkte sind bei Standard-/Premiumfutter bewusst so bemessen, dass eine
  // volle Trainingswoche (6/6, kein Ruhetag) in der Folgewoche NICHT mehr für
  // volles 6/6-Training reicht (ein paar Einheiten werden übersprungen),
  // während eine Woche mit mindestens 1 Ruhetag (5/6) genug Energie für ein
  // volles 6/6-Training in der Folgewoche übrig lässt. Ruhetage werden damit
  // spielerisch relevant, ohne Turniere zu blockieren (siehe oben).
  const TRAIN_ENERGY_COST = 9;

  // Trächtige Stuten dürfen noch bis zum 3. Trächtigkeitsmonat im Sport
  // starten (danach nicht mehr) - Zuchtschauen/Körung bleiben unabhängig
  // davon erlaubt, da dort gerade die tragende Stute gezeigt wird.
  const PREGNANT_SPORT_LIMIT_WEEKS = 13;

  // --- Fohlen-/Jungpferde-Aufzucht (bis MATURITY_YEARS). Grundausbildung
  // statt Turnierdisziplinen - Skills/Potenzial werden erst ab der Reife
  // trainiert, aber Interieur/Exterieur lassen sich schon vorher gezielt
  // fördern, statt dass die Jahre bis zur Reife nur Leerlauf sind.
  const FOAL_ENERGY_COST = 8;
  const FOAL_GAIN = 0.4;
  const FOAL_ACTIVITIES = {
    'Bodenarbeit': { group: 'interieur', traits: ['Lernwille', 'Umgänglichkeit'], minAge: 0 },
    'Sozialisierung': { group: 'interieur', traits: ['Nervenstärke', 'Umgänglichkeit'], minAge: 0 },
    'Freispringen': { group: 'exterieur', traits: ['Bewegung', 'Hinterhand'], minAge: 1, injureChance: 0.015 },
  };

  // --- Hengst-Absamung / Gefriersperma.
  const SEMEN_COST = 260;          // Labor-/Tierarztgebühr je Absamung
  const SEMEN_ENERGY = 15;         // Energiekosten für den Hengst
  const SEMEN_DOSES = 4;           // Portionen (Pailletten) je Absamung
  const SEMEN_COOLDOWN_WEEKS = 2;  // Mindestabstand zwischen zwei Absamungen
  const SEMEN_FERT_MULT = 0.82;    // Gefriersperma befruchtet seltener als Natursprung/Frischsamen
  const SEMEN_THAW_FEE = 180;      // Auftau-/Besamungsgebühr je Einsatz einer Portion

  // --- Anlagen / Gebäude. Jede Stufe: Kosten + Effekt. Stufe 0 = Startwert.
  const FACILITIES = {
    stalls: {
      label: 'Stallplätze', unit: 'Plätze',
      levels: [
        { cap: 6, upkeep: 0, cost: 0 },
        { cap: 10, upkeep: 120, cost: 8000 },
        { cap: 16, upkeep: 220, cost: 22000 },
        { cap: 24, upkeep: 360, cost: 55000 },
        { cap: 40, upkeep: 600, cost: 120000 },
      ],
      describe: (l) => l.cap + ' Plätze',
    },
    arena: {
      label: 'Trainingsanlage', unit: 'Stufe',
      levels: [
        { mult: 1.0, upkeep: 60, cost: 0 },
        { mult: 1.35, upkeep: 160, cost: 12000 },
        { mult: 1.7, upkeep: 300, cost: 34000 },
        { mult: 2.1, upkeep: 520, cost: 78000 },
      ],
      describe: (l) => 'Trainingswirkung x' + l.mult.toFixed(2),
    },
    vet: {
      label: 'Tierarzt / Reproduktion', unit: 'Stufe',
      levels: [
        { fert: 1.0, foalHealth: 0, upkeep: 50, cost: 0 },
        { fert: 1.2, foalHealth: 4, upkeep: 150, cost: 15000 },
        { fert: 1.45, foalHealth: 9, upkeep: 320, cost: 40000 },
      ],
      describe: (l) => 'Fruchtbarkeit x' + l.fert.toFixed(2) + ', Fohlengesundheit +' + l.foalHealth,
    },
    marketing: {
      label: 'Vermarktung', unit: 'Stufe',
      levels: [
        { saleSpeed: 1.0, priceMult: 1.0, upkeep: 40, cost: 0 },
        { saleSpeed: 1.4, priceMult: 1.05, upkeep: 130, cost: 10000 },
        { saleSpeed: 1.9, priceMult: 1.12, upkeep: 280, cost: 30000 },
      ],
      describe: (l) => 'Verkauf x' + l.saleSpeed.toFixed(1) + ' Tempo, +' + Math.round((l.priceMult - 1) * 100) + '% Preis',
    },
    pasture: {
      label: 'Weide / Koppeln', unit: 'Plätze',
      levels: [
        { slots: 0, upkeep: 0, cost: 0 },
        { slots: 4, upkeep: 40, cost: 6000 },
        { slots: 10, upkeep: 90, cost: 16000 },
        { slots: 20, upkeep: 160, cost: 38000 },
      ],
      describe: (l) => (l.slots ? l.slots + ' Koppelplätze' : 'keine Weide'),
    },
    silo: {
      label: 'Futter-Lager', unit: 'Kapazität',
      levels: [
        { capacity: 0, upkeep: 0, cost: 0 },
        { capacity: 60, upkeep: 20, cost: 4500 },
        { capacity: 160, upkeep: 45, cost: 12000 },
        { capacity: 400, upkeep: 90, cost: 28000 },
      ],
      describe: (l) => (l.capacity ? l.capacity + ' Pferdewochen Futter' : 'kein Lager'),
    },
  };

  function facLevel(state, key) {
    return FACILITIES[key].levels[state.facilities[key] || 0];
  }
  function stallCapacity(state) { return facLevel(state, 'stalls').cap; }

  // --- Fütterung: Kosten je Pferd/Woche + Wirkung auf Energie, Training,
  //     Fruchtbarkeit, Fohlengesundheit und leichte Gesundheits-Regeneration.
  const FEED = [
    { label: 'Sparration', desc: 'nur Heu', cost: 35,
      energyRegen: 12, trainMult: 0.9, fertMult: 0.95, foalHealth: -2, healthRegen: 0 },
    { label: 'Standard', desc: 'Heu + Hafer', cost: 62,
      energyRegen: 16, trainMult: 1.0, fertMult: 1.0, foalHealth: 0, healthRegen: 0.3 },
    { label: 'Premium', desc: 'Heu, Hafer, Mineralfutter, Zusatzfutter', cost: 112,
      energyRegen: 20, trainMult: 1.12, fertMult: 1.08, foalHealth: 3, healthRegen: 0.8 },
  ];
  // --- Pflege / Stallmanagement: senkt Krankheits-/Verletzungsrisiko, bringt
  //     Turnier-Bonus (Ausstrahlung), bremst Altersverschleiß, hebt langsam
  //     das Interieur.
  const CARE = [
    { label: 'Minimal', desc: 'nötigstes Ausmisten', cost: 18,
      eventMult: 1.35, showBonus: -3, ageHealthMult: 1.3, interieurDrift: 0 },
    { label: 'Solide', desc: 'tägl. Pflege, regelm. Hufschmied', cost: 38,
      eventMult: 1.0, showBonus: 0, ageHealthMult: 1.0, interieurDrift: 0 },
    { label: 'Intensiv', desc: 'Vollpflege, Physio, Koppelgang', cost: 82,
      eventMult: 0.65, showBonus: 5, ageHealthMult: 0.6, interieurDrift: 0.05 },
  ];
  function feedDef(state) { return FEED[state.feedLevel != null ? state.feedLevel : 1]; }
  function careDef(state) { return CARE[state.careLevel != null ? state.careLevel : 1]; }

  // --- Futter: Verbrauch je Pferd/Woche in "Pferdewochen" (1 = volle Stallration).
  //     Weidepferde grasen und brauchen außerhalb des Winters nur einen Zuschuss.
  const FEED_BULK_DISCOUNT = 0.8;   // Mengenrabatt beim Einlagern
  function pastureSlots(state) { return facLevel(state, 'pasture').slots || 0; }
  function siloCapacity(state) { return facLevel(state, 'silo').capacity || 0; }
  function pastureUsed(state) { return (state.horses || []).filter((h) => h.onPasture).length; }
  function feedNeed(state, horse) {
    if (!horse.onPasture) return 1;
    return season(state.week).idx === 3 ? 1 : 0.4;   // Winter: keine Weide
  }
  function herdFeedNeed(state) {
    return (state.horses || []).reduce((s, h) => s + feedNeed(state, h), 0);
  }
  function feedUnitCost(state) { return feedDef(state).cost * seasonFeedMult(state.week); }
  function feedFromStock(state) { return Math.min(state.feedStock || 0, herdFeedNeed(state)); }
  function weeklyFeedCost(state) {
    return Math.round((herdFeedNeed(state) - feedFromStock(state)) * feedUnitCost(state));
  }

  function weeklyUpkeep(state) {
    let u = 0;
    Object.keys(FACILITIES).forEach((k) => { u += facLevel(state, k).upkeep; });
    const stallmeister = (state.staff || []).some((x) => x.role === 'stallmeister');
    const careMult = stallmeister ? 0.8 : 1;
    u += (state.horses || []).length * careDef(state).cost * careMult;
    u += weeklyFeedCost(state);
    (state.staff || []).forEach((x) => { u += x.salary; });
    return Math.round(u);
  }

  // --- Jahreszeiten (13 Wochen je Saison). Frühling = Decksaison.
  const SEASONS = [
    { name: 'Frühling', icon: '🌱' },
    { name: 'Sommer', icon: '☀️' },
    { name: 'Herbst', icon: '🍂' },
    { name: 'Winter', icon: '❄️' },
  ];
  function season(week) {
    const idx = Math.floor(((week % 52) + 52) % 52 / 13);
    return { idx: idx, name: SEASONS[idx].name, icon: SEASONS[idx].icon };
  }
  function seasonFertMult(week) { return [1.35, 1.0, 0.95, 0.7][season(week).idx]; }
  function seasonFeedMult(week) { return season(week).idx === 3 ? 1.25 : 1.0; }   // Winter: kein Weidegang
  function seasonTrainMult(week) { return season(week).idx === 3 ? 0.92 : (season(week).idx === 1 ? 1.03 : 1.0); }
  function seasonEnergyBonus(week) { return [1, 2, 0, -2][season(week).idx]; }

  // --- Bank: Kredithöchstgrenze abhängig von Rang und Anlagenwert.
  const LOAN_RATE = 0.011;   // Zins pro Woche auf die Restschuld
  function maxLoan(state) {
    const base = 20000 + state.prestige * 120;
    const facVal = Object.keys(FACILITIES).reduce((s, k) => s + (state.facilities[k] || 0) * 15000, 0);
    return Math.round((base + facVal) / 1000) * 1000;
  }

  // --- Routinebehandlungen: Hufschmied (alle 7 Wo.) + Wurmkur/Impfung
  //     (alle 13 Wo.). Kosten je Pferd; ausgelassen -> Hufe/Immunsystem sinken.
  const FARRIER_EVERY = 7, FARRIER_COST = 110;
  const VETROUTINE_EVERY = 13, VETROUTINE_COST = 95;

  function prestigeMult(state) {
    // Prestige 0..1000 -> Preis-/Wert-Multiplikator ~0.9..1.6
    return 0.9 + clamp(state.prestige / 1000, 0, 1) * 0.7;
  }
  function prestigeTier(state) {
    const p = state.prestige;
    if (p >= 800) return { name: 'Elite-Gestüt', stars: 5 };
    if (p >= 450) return { name: 'Renommiertes Gestüt', stars: 4 };
    if (p >= 220) return { name: 'Etabliertes Gestüt', stars: 3 };
    if (p >= 80) return { name: 'Aufstrebendes Gestüt', stars: 2 };
    return { name: 'Kleiner Hof', stars: 1 };
  }

  // --- Angebot & Nachfrage -------------------------------------------------
  //     `state.demand` hält je Rasse und je Disziplin einen Index (~0.6..1.5,
  //     1.0 = neutral) plus einen Index für Sonderfarben. Jede Woche driftet
  //     alles langsam Richtung 1.0 + Rauschen; gelegentlich ein Trend. Wenn DU
  //     ein Pferd verkaufst, drückst du die Nachfrage in dessen Segment
  //     ("Markt geflutet"); Zeit lässt sie sich erholen.
  function initDemand() {
    const d = { breeds: {}, disciplines: {}, rareColor: 1.0 };
    Names.BREED_KEYS.forEach((b) => (d.breeds[b] = 1.0));
    DISC.forEach((x) => (d.disciplines[x] = 1.0));
    return d;
  }
  function driftDemand(state) {
    const d = state.demand;
    if (!d) return null;
    const step = (v) => clamp(v + (1.0 - v) * 0.06 + Model.gauss(0, 0.035), 0.6, 1.5);
    Object.keys(d.breeds).forEach((k) => (d.breeds[k] = step(d.breeds[k])));
    Object.keys(d.disciplines).forEach((k) => (d.disciplines[k] = step(d.disciplines[k])));
    d.rareColor = step(d.rareColor);
    if (Math.random() < 0.16) {
      const up = Math.random() < 0.5;
      if (Math.random() < 0.55) {
        const k = Names.BREED_KEYS[Model.randInt(0, Names.BREED_KEYS.length - 1)];
        d.breeds[k] = clamp(d.breeds[k] + (up ? 0.35 : -0.3), 0.6, 1.5);
        return up ? 'Nachfrage-Trend: ' + k + ' ist stark gefragt.' : 'Der Markt für ' + k + ' ist eingebrochen.';
      }
      const k = DISC[Model.randInt(0, DISC.length - 1)];
      d.disciplines[k] = clamp(d.disciplines[k] + (up ? 0.35 : -0.3), 0.6, 1.5);
      return up ? 'Nachfrage-Trend: ' + k + '-Pferde sind stark gefragt.' : 'Für ' + k + '-Pferde interessiert sich kaum jemand.';
    }
    return null;
  }
  function demandMultiplier(state, horse) {
    const d = state.demand;
    if (!d) return 1;
    let m = Math.pow(d.breeds[horse.breed] || 1, 0.6);
    m *= Math.pow(d.disciplines[Model.bestDiscipline(horse)] || 1, 0.45);
    const rare = Genetics.describe(horse.genotype, Model.ageYears(horse, state.week)).rarity;
    if (rare >= 0.15) m *= Math.pow(d.rareColor || 1, 0.7);
    return clamp(m, 0.55, 1.75);
  }
  function demandBreakdown(state, horse) {
    const d = state.demand;
    if (!d) return [];
    const pct = (v) => Math.round((v - 1) * 100);
    const rows = [
      { label: horse.breed, pct: pct(d.breeds[horse.breed] || 1) },
      { label: Model.bestDiscipline(horse), pct: pct(d.disciplines[Model.bestDiscipline(horse)] || 1) },
    ];
    const rare = Genetics.describe(horse.genotype, Model.ageYears(horse, state.week)).rarity;
    if (rare >= 0.15) rows.push({ label: 'Sonderfarbe', pct: pct(d.rareColor || 1) });
    return rows;
  }
  // Beim Verkauf: Nachfrage im Segment des Pferdes sinkt.
  function applySaleImpact(state, horse) {
    const d = state.demand;
    if (!d) return;
    if (d.breeds[horse.breed] != null) d.breeds[horse.breed] = clamp(d.breeds[horse.breed] * 0.93, 0.6, 1.5);
    const bd = Model.bestDiscipline(horse);
    if (d.disciplines[bd] != null) d.disciplines[bd] = clamp(d.disciplines[bd] * 0.965, 0.6, 1.5);
    const rare = Genetics.describe(horse.genotype, Model.ageYears(horse, state.week)).rarity;
    if (rare >= 0.15 && d.rareColor != null) d.rareColor = clamp(d.rareColor * 0.97, 0.6, 1.5);
  }
  // Top/Flop-Segmente für die Marktlage-Anzeige.
  function demandOverview(state) {
    const d = state.demand;
    if (!d) return { hot: [], cold: [], rareColor: 0 };
    const all = [];
    Object.keys(d.breeds).forEach((k) => all.push({ label: k, pct: Math.round((d.breeds[k] - 1) * 100) }));
    Object.keys(d.disciplines).forEach((k) => all.push({ label: k, pct: Math.round((d.disciplines[k] - 1) * 100) }));
    all.sort((a, b) => b.pct - a.pct);
    return { hot: all.slice(0, 3), cold: all.slice(-3).reverse(), rareColor: Math.round((d.rareColor - 1) * 100) };
  }

  // --- Marktangebot erzeugen (Kaufpferde). Preise skalieren mit der Nachfrage.
  function rollMarket(state) {
    const tier = prestigeTier(state).stars;
    const n = 4 + Model.randInt(0, 2);
    const list = [];
    for (let i = 0; i < n; i++) {
      const q = clamp(Model.gauss(0.4 + tier * 0.05, 0.16), 0.05, 0.98);
      const h = Model.generateHorse({ quality: q, currentWeek: state.week, origin: 'Markt', approved: Math.random() < 0.5, genoTested: false });
      const val = Model.valuation(h, state.week, prestigeMult(state));
      const dm = demandMultiplier(state, h);
      const ask = Math.round(val * dm * (0.88 + Math.random() * 0.4) / 50) * 50;
      list.push({ horse: h, price: ask, demand: dm });
    }
    return list;
  }

  // --- Personal. Vier Rollen:
  //     • Bereiter/in    – hebt die Trainingswirkung in 1–2 Disziplinen
  //     • Stallmeister/in – −20 % Pflegekosten, seltener Zwischenfälle
  //     • Tierarzt/in     – senkt Tierarztkosten, Geburts- und Krankheitsrisiko
  //     • Vermarkter/in   – hebt Verkaufserlös/-tempo, Deckstation & Pensionsstall
  const STAFF_FIRST = ['Anna', 'Lena', 'Marie', 'Julia', 'Sophie', 'Nele', 'Paul', 'Jan', 'Tom', 'Ben', 'Finn', 'Lars'];
  const STAFF_LAST = ['Berger', 'Krause', 'Wolf', 'Frank', 'Böhm', 'Sander', 'Reuter', 'Hahn', 'Vogt', 'Kern'];
  const STAFF_ROLE_POOL = ['bereiter', 'bereiter', 'bereiter', 'stallmeister', 'tierarzt', 'vermarkter'];
  function rollStaffMarket(state) {
    const tier = prestigeTier(state).stars;
    const n = 3 + Model.randInt(0, 1);
    const out = [];
    for (let i = 0; i < n; i++) {
      const role = i === 0 ? 'bereiter' : STAFF_ROLE_POOL[Model.randInt(0, STAFF_ROLE_POOL.length - 1)];
      const skill = clamp(Math.round(Model.gauss(45 + tier * 8, 16)), 15, 96);
      const name = STAFF_FIRST[Model.randInt(0, STAFF_FIRST.length - 1)] + ' ' + STAFF_LAST[Model.randInt(0, STAFF_LAST.length - 1)];
      let discs = [];
      if (role === 'bereiter') {
        const pool = DISC.slice().sort(() => Math.random() - 0.5);
        discs = pool.slice(0, 2);
      }
      const salary = role === 'tierarzt' ? 360 + Math.round(skill * 8)
        : role === 'stallmeister' ? 300 + Math.round(skill * 6)
        : role === 'vermarkter' ? 260 + Math.round(skill * 7)
        : 220 + Math.round(skill * 7);
      out.push({ id: 's' + Math.random().toString(36).slice(2, 7), name: name, role: role, disciplines: discs, skill: skill, salary: salary });
    }
    return out;
  }
  function maxStaff(state) { return 2 + (state.facilities.arena || 0); }
  function bestStaffSkill(state, role) {
    let best = 0;
    (state.staff || []).forEach((x) => { if (x.role === role) best = Math.max(best, x.skill); });
    return best;
  }
  // Trainings-Multiplikator-Bonus durch Bereiter für eine Disziplin.
  function staffTrainBonus(state, disc) {
    let best = 0;
    (state.staff || []).forEach((x) => {
      if (x.role === 'bereiter' && x.disciplines.indexOf(disc) !== -1) best = Math.max(best, x.skill);
    });
    return 1 + best / 220;   // bis ~ +0.44
  }
  // Stallmeister + Tierarzt senken die Häufigkeit von Zwischenfällen.
  function staffEventMult(state) {
    let m = 1;
    if ((state.staff || []).some((x) => x.role === 'stallmeister')) m *= 0.8;
    if (bestStaffSkill(state, 'tierarzt') > 0) m *= 0.85;
    return m;
  }
  // Tierarzt/in: Multiplikator auf Tierarztkosten und Geburts-/Krankheitsrisiko.
  function staffVetMult(state) {
    const s = bestStaffSkill(state, 'tierarzt');
    return s ? clamp(0.85 - s / 200, 0.35, 0.9) : 1;
  }
  // Vermarkter/in: Multiplikator auf Verkaufserlös/-tempo, Deckstation, Pension.
  function staffSalesMult(state) {
    const s = bestStaffSkill(state, 'vermarkter');
    return s ? 1 + s / 300 : 1;   // bis ~ +0.32
  }

  // --- Sponsoren: ab etwas Prestige tauchen Vertragsangebote auf. Wöchentliche
  //     Zahlung + Bonus am Ende, wenn die Startauflage erfüllt wurde.
  const SPONSORS = ['EquiFeed', 'Reitsport Hansen', 'Nordland Versicherung', 'GreenPaddock', 'Sattlerei Vogt', 'HorseCare24', 'Weidezaun-Profi'];
  function rollSponsorOffers(state) {
    if (state.prestige < 60) return [];
    const n = 1 + (Math.random() < 0.4 ? 1 : 0);
    const out = [];
    for (let i = 0; i < n; i++) {
      const weeks = [20, 26, 39, 52][Model.randInt(0, 3)];
      const weeklyPay = Math.round((250 + state.prestige * 1.4 + Model.gauss(0, 120)) / 10) * 10;
      const reqStarts = Math.max(2, Math.round(weeks / 3));
      const bonus = Math.round(weeklyPay * weeks * 0.35 / 100) * 100;
      out.push({
        id: 'sp' + Math.random().toString(36).slice(2, 7),
        name: SPONSORS[Model.randInt(0, SPONSORS.length - 1)],
        weeklyPay: Math.max(120, weeklyPay), weeks: weeks, reqStarts: reqStarts, bonus: bonus,
      });
    }
    return out;
  }

  // --- Deckstation: fremde Hengste, die gegen Deckgebühr zur Verfügung
  //     stehen. So kann man ohne eigenen Spitzenhengst züchten. Der Hengst
  //     kommt NICHT in den Stall; für die Vererbung wird bei der Bedeckung
  //     ein Steckbrief in der Trächtigkeit gespeichert.
  function rollStudRoster(state) {
    const tier = prestigeTier(state).stars;
    const n = 4 + Model.randInt(0, 2);
    const roster = [];
    // Eine Auswahl über verschiedene Rassen, plus (falls Prestige hoch) ein
    // absoluter Spitzenvererber.
    const breeds = Names.BREED_KEYS.slice();
    for (let i = 0; i < n; i++) {
      const elite = i === 0 && tier >= 3;
      const q = elite
        ? clamp(Model.gauss(0.9, 0.05), 0.75, 0.99)
        : clamp(Model.gauss(0.55 + tier * 0.05, 0.16), 0.25, 0.97);
      const breed = breeds[Model.randInt(0, breeds.length - 1)];
      const h = Model.generateHorse({
        sex: 'hengst', breed: breed, quality: q, approved: true,
        ageYears: 4 + Math.random() * 11, currentWeek: state.week, origin: 'Deckstation',
      });
      h.external = true;
      const val = Model.valuation(h, state.week, prestigeMult(state));
      // Deckgebühr: 5-12 % des Hengstwerts, Mindestbetrag steigt mit Qualität.
      const fee = Math.max(600 + Math.round(q * 4000), Math.round(val * (0.05 + q * 0.07) / 50) * 50);
      roster.push({ horse: h, studFee: fee, elite: elite });
    }
    roster.sort((a, b) => b.studFee - a.studFee);
    return roster;
  }

  // --- Auktion: Lose + KI-Bieter.
  function rollAuction(state) {
    const tier = prestigeTier(state).stars;
    const n = 3 + Model.randInt(0, 2);
    const lots = [];
    for (let i = 0; i < n; i++) {
      const q = clamp(Model.gauss(0.5 + tier * 0.06, 0.18), 0.1, 0.99);
      const h = Model.generateHorse({ quality: q, currentWeek: state.week, origin: 'Auktion', approved: Math.random() < 0.6, genoTested: Math.random() < 0.5 });
      const dm = demandMultiplier(state, h);
      const val = Math.round(Model.valuation(h, state.week, prestigeMult(state)) * dm);
      lots.push({
        horse: h,
        estimate: val,
        demand: dm,
        startBid: Math.round(val * 0.4 / 50) * 50,
        currentBid: Math.round(val * 0.4 / 50) * 50,
        leader: null,
        // KI-Maximalgebot: um den Schätzwert herum gestreut.
        aiMax: Math.round(val * (0.7 + Math.random() * 0.7) / 50) * 50,
        closed: false,
        consignedByPlayer: false,
      });
    }
    return lots;
  }

  // Spieler bietet auf ein Los. Danach kontert die KI evtl.
  function placeBid(lot, amount) {
    if (lot.closed) return { ok: false, msg: 'Los ist bereits geschlossen.' };
    const minNext = lot.currentBid + bidIncrement(lot.currentBid);
    if (amount < minNext) return { ok: false, msg: 'Mindestgebot: ' + fmtEur(minNext) };
    lot.currentBid = amount;
    lot.leader = 'player';
    // KI-Konter
    if (!lot.consignedByPlayer && amount < lot.aiMax) {
      const counter = Math.min(lot.aiMax, amount + bidIncrement(amount) * Model.randInt(1, 3));
      lot.currentBid = Math.round(counter / 50) * 50;
      lot.leader = 'ai';
      return { ok: true, msg: 'Geboten. Gegengebot der Konkurrenz: ' + fmtEur(lot.currentBid), outbid: true };
    }
    return { ok: true, msg: 'Du führst mit ' + fmtEur(amount) + '.', outbid: false };
  }

  function bidIncrement(v) {
    if (v < 5000) return 250;
    if (v < 20000) return 500;
    if (v < 60000) return 1000;
    return 2500;
  }

  // Auktion abschließen (beim Wochenwechsel).
  function closeAuction(state, lots) {
    const results = [];
    lots.forEach((lot) => {
      if (lot.closed) return;
      lot.closed = true;
      if (lot.consignedByPlayer) {
        // Spielerpferd: die KI bietet bis zu ihrem verdeckten Maximum (aiMax).
        // Verkauft, wenn dieses Maximum das Limit (Reserve) erreicht; der
        // Zuschlagspreis liegt zwischen Limit/Startgebot und aiMax
        // (simulierte Bietkonkurrenz).
        const reserve = lot.reserve || 0;
        const floor = Math.max(reserve, lot.startBid || 0);
        const sold = (lot.aiMax || 0) >= floor;
        let amount = 0;
        if (sold) {
          amount = Math.round((floor + Math.max(0, (lot.aiMax || 0) - floor) * (0.3 + Math.random() * 0.5)) / 50) * 50;
          amount = Math.max(amount, Math.round(floor / 50) * 50);
        }
        lot.currentBid = sold ? amount : lot.currentBid;
        results.push({ lot: lot, type: 'consign', sold: sold, amount: amount });
      } else if (lot.leader === 'player') {
        results.push({ lot: lot, type: 'buy', sold: true, amount: lot.currentBid });
      } else {
        results.push({ lot: lot, type: 'buy', sold: false, amount: 0 });
      }
    });
    return results;
  }

  // --- Schauen / Turniere -----------------------------------------------
  //     Realistischer: je Disziplin eigene Prüfungsklassen (E..S bzw.
  //     Rennklassen), Mindestanforderung an die Ausbildung (Qualifikation),
  //     eigene Jungpferde-Prüfungen (3-7 Jahre), Nenn- + Reisekosten,
  //     Turnier kostet Kraft (Energie), Saison-Punkte je Disziplin.
  const CLASS_NAMES = {
    Dressur: ['Dressur E', 'Dressur A', 'Dressur L', 'Dressur M', 'Grand Prix'],
    Springen: ['Stilspringen E', 'Springen A', 'Springen L', 'Springen M', 'Großer Preis (S)'],
    Galopprennen: ['Maidenrennen', 'Ausgleich IV', 'Ausgleich II', 'Listenrennen', 'Gruppe I'],
    Vielseitigkeit: ['Geländeprüfung CE', 'VS CN*', 'VS CN**', 'VS CN***', 'CN**** Lang'],
    Distanzritt: ['Distanz 30 km', 'Distanz 60 km', 'Distanz 90 km', 'Distanz 120 km', 'Distanz 160 km'],
    Fahren: ['Fahren E', 'Fahren A', 'Fahren L', 'Fahren M', 'Fahren S'],
  };
  const ZUCHT_CLASS_NAMES = ['Ortsschau', 'Bezirksschau', 'Landesschau', 'Elite-Stutenschau', 'Bundeschampionat'];
  const KOER_CLASS_NAMES = ['Vorauswahl', 'Bezirkskörung', 'Landeskörung', 'Elitekörung', 'Bundeskörung'];
  const SPORT_MIN_SKILL = [0, 18, 35, 52, 70];
  const ZUCHT_MIN_CONF = [0, 48, 60, 70, 80];
  const KOER_MIN_CONF = [0, 55, 63, 71, 78];

  // Rang der Zuchtzulassung: 0 keine · 1 Zuchtbuch II · 2 gekört/eingetragen
  // (Zuchtbuch II) · 3 Zuchtbuch I (mit bestandener Leistungsprüfung).
  function approvalRank(s) {
    if (!s) return 0;
    if (/Zuchtbuch I\b/.test(s)) return 3;
    if (/gekört|eingetragen/.test(s)) return 2;
    return 1;
  }
  function praemieRank(s) { return { 'Ib-Prämie': 1, 'Ia-Prämie': 2, 'Staatsprämie': 3 }[s] || 0; }
  function lpPassed(h) { return !!(h.leistungspruefung && h.leistungspruefung.index >= 80); }

  function rollShows(state) {
    const tier = prestigeTier(state).stars;
    const shows = [];
    const si = season(state.week).idx;
    // Winter weniger Sport, Sommer mehr.
    const nSport = si === 3 ? (2 + Model.randInt(0, 1)) : si === 1 ? (4 + Model.randInt(0, 2)) : (3 + Model.randInt(0, 2));
    for (let i = 0; i < nSport; i++) {
      const disc = DISC[Model.randInt(0, DISC.length - 1)];
      const level = clamp(Model.randInt(1, tier + 1), 1, 5);
      const youngster = level <= 2 && Math.random() < 0.3;
      shows.push(makeShow('sport', disc, level, youngster));
    }
    const nZ = 1 + Model.randInt(0, 1);
    for (let i = 0; i < nZ; i++) {
      shows.push(makeShow('zucht', null, clamp(Model.randInt(1, tier + 1), 1, 5), false));
    }
    // Körung / Prämierung: nicht in jedem Kalender.
    if (Math.random() < 0.6) {
      shows.push(makeShow('koerung', null, clamp(Model.randInt(2, tier + 2), 2, 5), false));
    }
    return shows;
  }

  function makeShow(type, disc, level, youngster) {
    const pool = [1500, 4000, 9000, 20000, 45000][level - 1];
    let baseName;
    if (type === 'zucht') baseName = ZUCHT_CLASS_NAMES[level - 1];
    else if (type === 'koerung') baseName = 'Körung / Prämierung — ' + KOER_CLASS_NAMES[level - 1];
    else baseName = (CLASS_NAMES[disc] ? CLASS_NAMES[disc][level - 1] : disc + ' ' + level);
    return {
      id: 'show_' + Math.random().toString(36).slice(2, 8),
      type: type,
      discipline: disc,
      level: level,
      youngster: !!youngster,
      name: baseName + (youngster ? ' (Jungpferde)' : ''),
      entryFee: type === 'koerung' ? Math.round(pool * 0.06) : Math.round(pool * 0.03),
      travelCost: Math.round(pool * 0.012) + 60 * level,
      minSkill: type === 'sport' ? SPORT_MIN_SKILL[level - 1] : 0,
      minConf: type === 'zucht' ? ZUCHT_MIN_CONF[level - 1] : (type === 'koerung' ? KOER_MIN_CONF[level - 1] : 0),
      minHealth: type === 'koerung' ? 50 : 55,
      prizePool: type === 'koerung' ? Math.round(pool * 0.35) : pool,
      fieldStrength: 30 + level * 12,
      entered: [],
      done: false,
    };
  }

  // Prüft, ob ein Pferd bei dieser Schau starten darf. Gibt null zurück,
  // wenn es passt, sonst einen Klartext-Grund.
  function eligibilityReason(horse, show, currentWeek) {
    const y = Model.ageYears(horse, currentWeek);
    if (y < Model.MATURITY_YEARS) return horse.name + ' ist zu jung (< 3 Jahre).';
    if (show.youngster && y > 7) return 'Jungpferde-Prüfung: nur 3-7 Jahre.';
    if (horse.pregnancy && show.type === 'sport') {
      const weeksGone = Model.GESTATION_WEEKS - horse.pregnancy.weeksLeft;
      if (weeksGone > PREGNANT_SPORT_LIMIT_WEEKS) return 'Trächtige Stute (> 3. Monat) startet nicht mehr im Sport.';
    }
    if (show.type === 'sport' && horse.skill[show.discipline] < show.minSkill) {
      return 'Nicht qualifiziert: ' + show.discipline + ' ' + Math.round(horse.skill[show.discipline]) +
        ' < geforderte ' + show.minSkill + '.';
    }
    if ((show.type === 'zucht' || show.type === 'koerung')) {
      if (horse.noPapers || horse.isMix) return 'Ohne Zuchtbucheintrag (Vater nicht gekört) — keine Zuchtschau/Körung.';
      if (horse.conformation < show.minConf) return 'Exterieur ' + Math.round(horse.conformation) + ' < geforderte ' + show.minConf + '.';
    }
    // Körung/Prämierung bringt nur etwas, solange sich Zuchtzulassung oder
    // Prämie noch verbessern können - sonst ließe sich dieselbe Körung immer
    // wieder für Preisgeld/Prestige "farmen", ohne dass sich am Status etwas
    // ändert.
    if (show.type === 'koerung') {
      const bestBuch = lpPassed(horse) ? 'Zuchtbuch I' : 'Zuchtbuch II';
      const bestStatus = (horse.sex === 'hengst' ? 'gekört, ' : 'eingetragen, ') + bestBuch;
      const canImproveApproval = approvalRank(bestStatus) > approvalRank(horse.zuchtzulassung);
      const canImprovePraemie = praemieRank('Staatsprämie') > praemieRank(horse.praemie);
      if (!canImproveApproval && !canImprovePraemie) {
        return horse.name + ' hat bereits die bestmögliche Körung/Prämierung erreicht (' +
          (horse.zuchtzulassung || 'ohne Zuchtzulassung') + ', ' + (horse.praemie || 'keine Prämie') + ') — erneute Anmeldung bringt nichts mehr.';
      }
    }
    if (horse.health < show.minHealth) return horse.name + ' ist nicht fit genug (Gesundheit < ' + show.minHealth + ').';
    return null;
  }

  // Disziplin-gerechte Darstellung der Wertung.
  function showScoreLabel(show, rawScore, leaderScore) {
    if (show.type === 'zucht' || show.type === 'koerung') return clamp(5 + rawScore / 18, 3, 10).toFixed(1) + '/10';
    switch (show.discipline) {
      case 'Dressur':
      case 'Fahren':
        return clamp(48 + rawScore * 0.36, 40, 85).toFixed(2) + ' %';
      case 'Springen':
      case 'Vielseitigkeit': {
        const faults = clamp(Math.round((88 - rawScore) / 4), 0, 60);
        return faults === 0 ? '0 Fehler' : faults + ' Fehler';
      }
      case 'Galopprennen': {
        const behind = Math.max(0, (leaderScore - rawScore) * 0.14);
        return behind < 0.05 ? 'Sieg' : behind.toFixed(1) + ' Lg. zurück';
      }
      case 'Distanzritt': {
        const h = 3 + show.level * 0.8 + (100 - rawScore) * 0.035;
        const hh = Math.floor(h);
        const mm = Math.round((h - hh) * 60);
        return hh + ':' + String(mm).padStart(2, '0') + ' h';
      }
      default:
        return Math.round(rawScore) + ' P.';
    }
  }

  // Welche Einzelnoten in welcher Disziplin besonders zählen (Realismus).
  const DISC_TRAITS = {
    Dressur:        { ex: ['Rücken', 'Bewegung'], in: ['Rittigkeit', 'Lernwille'], he: [] },
    Springen:       { ex: ['Hinterhand', 'Bewegung'], in: ['Nervenstärke', 'Leistungsbereitschaft'], he: [] },
    Galopprennen:   { ex: ['Schulter', 'Fundament'], in: ['Leistungsbereitschaft'], he: ['Herz-Kreislauf', 'Atemwege'] },
    Vielseitigkeit: { ex: ['Fundament', 'Bewegung'], in: ['Nervenstärke', 'Rittigkeit'], he: ['Herz-Kreislauf'] },
    Distanzritt:    { ex: ['Fundament'], in: ['Leistungsbereitschaft'], he: ['Herz-Kreislauf', 'Atemwege', 'Fundament & Sehnen'] },
    Fahren:         { ex: ['Schulter', 'Rücken'], in: ['Umgänglichkeit', 'Rittigkeit'], he: [] },
  };
  function disciplineFit(horse, disc) {
    const spec = DISC_TRAITS[disc];
    if (!spec) return 60;
    const ex = Model.exterieurOf(horse), inr = Model.interieurOf(horse), he = Model.gesundheitOf(horse);
    const vals = spec.ex.map((t) => ex[t]).concat(spec.in.map((t) => inr[t])).concat(spec.he.map((t) => he[t]));
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }

  // Wettkampf-Punktzahl eines Pferdes für eine Schau (0..~120).
  function scoreHorse(horse, show, currentWeek) {
    const y = Model.ageYears(horse, currentWeek);
    const af = Model.ageFactor(y);
    const form = 60 + Model.gauss(0, 22);         // Tagesform
    const tempBonus = (horse.temperament - 50) * 0.2;
    const healthBonus = (horse.health - 80) * 0.3;
    if (show.type === 'sport') {
      const d = show.discipline;
      const fit = (disciplineFit(horse, d) - 60) * 0.16;   // passende Einzelnoten
      if (show.jung) {
        // Jungpferde-Wertung: Potenzial, Typ, Rittigkeit/Gangqualität — nicht die
        // (noch geringe) aktuelle Ausbildung.
        const inr = Model.interieurOf(horse);
        const rideab = (inr['Rittigkeit'] + inr['Lernwille'] + inr['Nervenstärke']) / 3;
        return horse.potential[d] * 0.5
          + horse.conformation * 0.22
          + (rideab - 55) * 0.35
          + fit * 0.9 + tempBonus + healthBonus * 0.4
          + form * 0.16;
      }
      return horse.skill[d] * 0.68 * af
        + horse.conformation * 0.1
        + fit + tempBonus + healthBonus
        + form * 0.16;
    }
    // Zuchtschau / Körung: Exterieur + Typ + Abstammung + Leistungsprüfung.
    const bdef = Model.breedDef(horse.breed);
    const typeBonus = (horse.conformation - bdef.conf) * 0.2;
    const pedigreeBonus = (horse.sireName ? 4 : 0) + (horse.damName ? 4 : 0) + horse.wins * 1.5
      + praemieRank(horse.praemie) * 3;
    const rarity = Genetics.describe(horse.genotype, y).rarity * 10;
    const mixMalus = (horse.isMix || Model.isMixBreed(horse.breed)) ? 20 : 0;
    const lpBonus = horse.leistungspruefung ? (horse.leistungspruefung.index - 55) * (show.type === 'koerung' ? 0.28 : 0.14) : 0;
    return horse.conformation * (show.type === 'koerung' ? 0.55 : 0.66)
      + typeBonus + pedigreeBonus + rarity - mixMalus + lpBonus
      + tempBonus + healthBonus * 0.5
      + form * 0.13;
  }

  // --- Rivalen-Gestüte: benannte KI-Konkurrenz mit eigenen Pferden, die
  //     bei Turnieren immer wieder auftauchen und eine Saison-Rangliste
  //     füllen.
  const RIVAL_NAMES = ['Gestüt Falkenhof', 'Gestüt Lindenau', 'Hof Rabenstein', 'Gestüt Morgentau', 'Sonnenhof Weber', 'Gestüt Drei Eichen'];

  function initRivals(state) {
    const list = RIVAL_NAMES.slice().sort(() => Math.random() - 0.5).slice(0, 5);
    return list.map((name, i) => {
      const prestige = clamp(Math.round(Model.gauss(150 + i * 25, 70)), 30, 480);
      const n = 5 + Model.randInt(0, 2);
      const horses = [];
      for (let k = 0; k < n; k++) {
        horses.push(Model.generateHorse({
          quality: clamp(Model.gauss(0.5 + prestige / 900, 0.14), 0.2, 0.96), approved: true,
          ageYears: 4 + Math.random() * 9, currentWeek: state.week, origin: 'Rivale',
        }));
      }
      return { id: 'rv' + i + Math.random().toString(36).slice(2, 6), name: name, prestige: prestige, seasonPoints: 0, horses: horses };
    });
  }

  function advanceRivals(state) {
    (state.rivals || []).forEach((rv) => {
      rv.prestige = Math.max(20, rv.prestige * 0.997);
      rv.horses.forEach((h) => {
        const d = DISC[Model.randInt(0, DISC.length - 1)];
        if (h.skill[d] < h.potential[d]) h.skill[d] = clamp(h.skill[d] + Model.gauss(0.35, 0.15), 0, h.potential[d]);
      });
      rv.horses.forEach((h, i) => {
        if (Model.ageYears(h, state.week) > 19 || Math.random() < 0.008) {
          rv.horses[i] = Model.generateHorse({
            quality: clamp(0.5 + rv.prestige / 900 + Model.gauss(0, 0.12), 0.2, 0.97), approved: true,
            ageYears: 3 + Math.random() * 4, currentWeek: state.week, origin: 'Rivale',
          });
        }
      });
    });
  }

  // Aktuelle Saison-Rangliste: dein Gestüt + alle Rivalen nach Saisonpunkten.
  function mySeasonPoints(state) {
    return state.horses.reduce((s, h) => s + Object.keys(h.turnierPunkte || {}).reduce((a, k) => a + h.turnierPunkte[k], 0), 0);
  }
  function seasonStandings(state) {
    const rows = [{ name: state.studName, points: Math.round(mySeasonPoints(state)), isPlayer: true, prestige: Math.round(state.prestige) }];
    (state.rivals || []).forEach((rv) => rows.push({ name: rv.name, points: Math.round(rv.seasonPoints || 0), isPlayer: false, prestige: Math.round(rv.prestige) }));
    rows.sort((a, b) => b.points - a.points || b.prestige - a.prestige);
    return rows;
  }

  // Füllt das Starterfeld: passende Rivalenpferde + anonyme Auffüllung.
  function buildField(state, show) {
    const field = [];
    const pool = [];
    (state.rivals || []).forEach((rv) => rv.horses.forEach((h) => {
      const rel = show.type === 'sport' ? (h.skill[show.discipline] || 0) : h.conformation;
      pool.push({ rv: rv, h: h, rel: rel });
    }));
    pool.sort((a, b) => Math.abs(a.rel - show.fieldStrength) - Math.abs(b.rel - show.fieldStrength));
    const nRivals = Math.min(pool.length, 4 + show.level);
    for (let i = 0; i < nRivals; i++) {
      const p = pool[i];
      field.push({ id: 'rv:' + p.rv.id + ':' + i, name: p.h.name + ' — ' + p.rv.name, player: false, rival: p.rv, rivalHorse: p.h,
        score: scoreHorse(p.h, show, state.week) });
    }
    const nFill = Math.max(3, (7 + show.level) - nRivals);
    for (let i = 0; i < nFill; i++) {
      field.push({ id: 'ai' + i, name: Names.randName(), player: false, score: show.fieldStrength + Model.gauss(0, 14) });
    }
    return field;
  }

  // Führt eine Schau aus: Spielerpferde + Rivalen + Auffüllung.
  function runShow(state, show) {
    const careShow = careDef(state).showBonus;
    const field = buildField(state, show);
    show.entered.forEach((id) => {
      const h = state.horses.find((x) => x.id === id);
      if (h) field.push({ id: id, name: h.name, player: true, hRef: h, score: scoreHorse(h, show, state.week) + careShow });
    });
    field.sort((a, b) => b.score - a.score);
    const leaderScore = field.length ? field[0].score : 0;

    const split = [0.4, 0.25, 0.15, 0.12, 0.08];
    const ptsTable = [10, 7, 5, 4, 3, 2, 1];
    const key = show.type === 'sport' ? show.discipline : 'Zucht';
    let totalPrize = 0, prestigeGain = 0, travelCost = 0;
    const results = [];

    field.forEach((f, idx) => {
      const place = idx + 1;
      const prize = place <= 5 ? Math.round(show.prizePool * split[place - 1]) : 0;
      const pts = (place <= 7 ? ptsTable[place - 1] : 0) * show.level;
      results.push({ name: f.name, player: !!f.player, rival: f.rival ? f.rival.name : null, id: f.id, place: place,
        score: Math.round(f.score), scoreLabel: showScoreLabel(show, f.score, leaderScore), prize: prize });

      if (f.player && f.hRef) {
        const h = f.hRef;
        totalPrize += prize;
        travelCost += show.travelCost || 0;
        h.earnings += prize;
        h.shows += 1;
        if (place === 1) { h.wins += 1; prestigeGain += 6 + show.level * 4; }
        else if (place <= 3) prestigeGain += 3 + show.level * 2;
        else if (place <= 5) prestigeGain += 1 + show.level;
        if (!show.champ && show.type === 'sport' && pts) {
          h.turnierPunkte = h.turnierPunkte || {}; h.turnierPunkte[key] = (h.turnierPunkte[key] || 0) + pts;
          if (show.youngster) { h.jungPunkte = h.jungPunkte || {}; h.jungPunkte[key] = (h.jungPunkte[key] || 0) + pts; }
        }
        h.showLog.unshift({ week: state.week, show: show.name, place: place, field: field.length, prize: prize, scoreLabel: results[results.length - 1].scoreLabel });
        if (h.showLog.length > 12) h.showLog.pop();
        if (show.type === 'sport') h.skill[show.discipline] = clamp(h.skill[show.discipline] + (place <= 3 ? 1.2 : 0.5), 0, h.potential[show.discipline]);

        // Zuchtschau: Top 3 bekommen mindestens eine Ib-Prämie.
        if (show.type === 'zucht' && place <= 3 && praemieRank(h.praemie) < 1) {
          h.praemie = 'Ib-Prämie';
          results[results.length - 1].note = 'Ib-Prämie';
        }
        // Körung / Prämierung: Zuchtzulassung + Prämie + evtl. Siegertitel.
        if (show.type === 'koerung') {
          const passLine = Math.ceil(field.length * 0.6);
          const buch = lpPassed(h) ? 'Zuchtbuch I' : 'Zuchtbuch II';
          const status = (h.sex === 'hengst' ? 'gekört, ' : 'eingetragen, ') + buch;
          if (place <= passLine && approvalRank(status) > approvalRank(h.zuchtzulassung)) {
            h.zuchtzulassung = status;
            results[results.length - 1].note = status;
          } else if (place > passLine && !h.zuchtzulassung) {
            results[results.length - 1].note = 'nicht zugelassen';
          }
          let pr = null;
          if (place === 1) pr = (lpPassed(h) && f.score > 78) ? 'Staatsprämie' : 'Ia-Prämie';
          else if (place <= 3) pr = 'Ia-Prämie';
          else if (place <= 8) pr = 'Ib-Prämie';
          if (pr && praemieRank(pr) > praemieRank(h.praemie)) {
            h.praemie = pr;
            results[results.length - 1].note = (results[results.length - 1].note ? results[results.length - 1].note + ' · ' : '') + pr;
          }
          if (place === 1) h.titel = h.sex === 'hengst' ? 'Siegerhengst' : 'Siegerstute';
        }
        // Bundeschampionat der Jungpferde: Siegertitel.
        if (show.jung && place === 1) {
          h.titel = 'Bundeschampion ' + show.discipline + ' ' + (show.year || '');
          results[results.length - 1].note = h.titel;
        }
      } else if (f.rival) {
        if (pts) f.rival.seasonPoints = (f.rival.seasonPoints || 0) + pts;
        if (place === 1) f.rival.prestige += 2 + show.level;
        else if (place <= 3) f.rival.prestige += 1 + show.level * 0.4;
      }
    });

    show.done = true;
    return { results: results, totalPrize: totalPrize, prestigeGain: prestigeGain, travelCost: travelCost };
  }

  // --- Jahres-Championat: am Ende jedes Spieljahrs (52 Wochen). Je Disziplin
  //     ein Finale für alle Pferde ab CHAMP_QUAL Saisonpunkten, plus ein
  //     Gesamt-Titel für das Gestüt mit den meisten Saisonpunkten.
  const CHAMP_QUAL = 20;
  function championshipQualified(state) {
    const out = {};
    DISC.forEach((d) => {
      out[d] = state.horses.filter((h) => h.turnierPunkte && (h.turnierPunkte[d] || 0) >= CHAMP_QUAL);
    });
    return out;
  }
  function runChampionship(state) {
    const year = state.seasonYear || 1;
    const qual = championshipQualified(state);
    const summary = { year: year, disciplines: {}, results: {}, overall: null, playerPrize: 0, playerPrestige: 0 };

    DISC.forEach((d) => {
      const qs = qual[d];
      if (!qs.length) { summary.disciplines[d] = null; return; }
      const show = {
        id: 'champ_' + d, type: 'sport', discipline: d, level: 5, champ: true,
        name: 'Championat ' + d + ' (Jahr ' + year + ')', prizePool: 90000,
        entryFee: 0, travelCost: 0, minSkill: 0, minConf: 0, minHealth: 0,
        fieldStrength: 80, entered: qs.map((h) => h.id), done: false,
      };
      const r = runShow(state, show);
      summary.disciplines[d] = r.results[0] ? r.results[0].name : null;
      summary.results[d] = r.results.slice(0, 8);
      summary.playerPrize += r.totalPrize;
      summary.playerPrestige += r.prestigeGain;
      state.cash += r.totalPrize;
      state.prestige += r.prestigeGain;
    });

    const standings = seasonStandings(state);
    const champ = standings[0];
    summary.overall = champ ? champ.name : null;
    if (champ && champ.isPlayer) { state.prestige += 60; summary.playerPrestige += 60; }

    state.championHistory = state.championHistory || [];
    state.championHistory.unshift({ year: year, overall: summary.overall, disciplines: summary.disciplines });
    if (state.championHistory.length > 10) state.championHistory.pop();

    // Saison zurücksetzen.
    state.horses.forEach((h) => { h.turnierPunkte = {}; });
    (state.rivals || []).forEach((rv) => { rv.seasonPoints = 0; });
    state.seasonYear = year + 1;
    return summary;
  }

  // --- Bundeschampionat der Jungpferde (3–6 Jahre): eigene Saisonwertung
  //     aus den Jungpferde-Prüfungen. Am Jahresende ein Finale je Disziplin,
  //     bewertet nach Potenzial/Typ/Rittigkeit statt aktueller Ausbildung.
  const JUNGCHAMP_QUAL = 12, JUNGCHAMP_MAX_AGE = 6;
  function jungChampionshipQualified(state) {
    const out = {};
    DISC.forEach((d) => {
      out[d] = (state.horses || []).filter((h) => h.jungPunkte && (h.jungPunkte[d] || 0) >= JUNGCHAMP_QUAL &&
        Model.ageYears(h, state.week) <= JUNGCHAMP_MAX_AGE);
    });
    return out;
  }
  function runJungChampionship(state) {
    const year = state.seasonYear || 1;   // vor runChampionship aufrufen (dort wird seasonYear erhöht)
    const qual = jungChampionshipQualified(state);
    const summary = { year: year, disciplines: {}, results: {}, playerPrize: 0, playerPrestige: 0 };
    DISC.forEach((d) => {
      const qs = qual[d];
      if (!qs.length) { summary.disciplines[d] = null; return; }
      const show = {
        id: 'jchamp_' + d, type: 'sport', discipline: d, level: 4, champ: true, jung: true, year: year,
        name: 'Bundeschampionat der Jungpferde — ' + d + ' (Jahr ' + year + ')', prizePool: 42000,
        entryFee: 0, travelCost: 0, minSkill: 0, minConf: 0, minHealth: 0,
        fieldStrength: 62, entered: qs.map((h) => h.id), done: false,
      };
      const r = runShow(state, show);
      summary.disciplines[d] = r.results[0] ? r.results[0].name : null;
      summary.results[d] = r.results.slice(0, 8);
      summary.playerPrize += r.totalPrize;
      summary.playerPrestige += r.prestigeGain;
      state.cash += r.totalPrize;
      state.prestige += r.prestigeGain;
    });
    state.jungChampHistory = state.jungChampHistory || [];
    state.jungChampHistory.unshift({ year: year, disciplines: summary.disciplines });
    if (state.jungChampHistory.length > 10) state.jungChampHistory.pop();
    state.horses.forEach((h) => { h.jungPunkte = {}; });
    return summary;
  }

  // --- Zuchtaufträge: Verbände & Kunden suchen Pferde nach Vorgabe. Erfüllt
  //     man einen Auftrag mit einem passenden Pferd, gibt es Prämie + Prestige;
  //     läuft er aus, kostet das etwas Prestige. Die Vorgaben werden mit dem
  //     Rang strenger (und die Prämien höher).
  const ORDER_CLIENTS = ['Zuchtverband Nord', 'Reitverein Falkensee', 'Landgestüt Celle',
    'Turnierstall Brandt', 'Ponyhof Sonnenwiese', 'Distanzsport-Team Süd', 'Fahrverein Grün-Weiß',
    'Rennstall Meder', 'Vielseitigkeitskader', 'Gestüt Auersberg (Zukauf)', 'Reitschule Morgenstern'];

  function makeBreedingOrder(state, tier) {
    const disc = Math.random() < 0.72 ? DISC[Model.randInt(0, DISC.length - 1)] : null;
    const breed = Math.random() < 0.4 ? Names.BREED_KEYS[Model.randInt(0, Names.BREED_KEYS.length - 1)] : null;
    const strict = clamp(0.45 + tier * 0.09 + Model.gauss(0, 0.08), 0.35, 0.95);
    const minTalent = disc ? clamp(Math.round(52 + strict * 38), 40, 95) : 0;
    const minConf = clamp(Math.round(48 + strict * 34), 40, 90);
    const minHealth = clamp(Math.round(62 + strict * 22), 55, 92);
    const wantRare = Math.random() < 0.22;
    const sexReq = Math.random() < 0.25 ? (Math.random() < 0.5 ? 'hengst' : 'stute') : null;
    const needPapers = Math.random() < 0.5;
    const maxAge = Math.random() < 0.45 ? 3 : 12;   // "junges Pferd" vs. Alter egal
    const weeks = [10, 14, 18, 24][Model.randInt(0, 3)];
    let reward = 4000 + strict * 16000 + (disc ? minTalent * 90 : 0) + minConf * 70;
    if (wantRare) reward += 6000;
    if (needPapers) reward += 3500;
    reward = Math.round(reward * prestigeMult(state) / 500) * 500;
    return {
      id: 'ord' + Math.random().toString(36).slice(2, 8),
      client: ORDER_CLIENTS[Model.randInt(0, ORDER_CLIENTS.length - 1)],
      breed: breed, disc: disc, minTalent: minTalent, minConf: minConf, minHealth: minHealth,
      wantRare: wantRare, sexReq: sexReq, needPapers: needPapers, maxAge: maxAge,
      reward: Math.max(3000, reward), prestige: 6 + Math.round(strict * 14),
      createdWeek: state.week, deadlineWeek: state.week + weeks,
    };
  }
  // Liste periodisch auf ein Ziel auffüllen (bestehende Aufträge behalten).
  function rollBreedingOrders(state, keep) {
    const tier = prestigeTier(state).stars;
    const target = 2 + (tier >= 3 ? 1 : 0);
    const out = (keep || []).slice();
    let guard = 0;
    while (out.length < target && guard++ < 20) out.push(makeBreedingOrder(state, tier));
    return out;
  }
  // Prüft ein Pferd gegen einen Auftrag. { ok, reasons:[...] }.
  function orderMatch(order, horse, currentWeek) {
    const reasons = [];
    const y = Model.ageYears(horse, currentWeek);
    if (y > order.maxAge) reasons.push(order.maxAge < 12 ? 'nur junge Pferde (≤ ' + order.maxAge + ' J.)' : 'zu alt (≤ ' + order.maxAge + ' J.)');
    if (order.breed && horse.breed !== order.breed) reasons.push('Rasse ' + order.breed + ' gefordert');
    if (order.sexReq && horse.sex !== order.sexReq) reasons.push((order.sexReq === 'hengst' ? 'Hengst' : 'Stute') + ' gefordert');
    if (order.disc && horse.potential[order.disc] < order.minTalent) reasons.push(order.disc + '-Potenzial ' + Math.round(horse.potential[order.disc]) + ' < ' + order.minTalent);
    if (horse.conformation < order.minConf) reasons.push('Exterieur ' + Math.round(horse.conformation) + ' < ' + order.minConf);
    if (horse.health < order.minHealth) reasons.push('Gesundheit ' + Math.round(horse.health) + ' < ' + order.minHealth);
    if (order.needPapers && (horse.noPapers || horse.isMix || Model.isMixBreed(horse.breed))) reasons.push('mit Zuchtbucheintrag gefordert');
    if (order.wantRare && Genetics.describe(horse.genotype, y).rarity < 0.25) reasons.push('besondere Fellfarbe gefordert');
    return { ok: reasons.length === 0, reasons: reasons };
  }
  function orderSummary(order) {
    const p = [order.breed || 'Rasse egal'];
    if (order.sexReq) p.push(order.sexReq === 'hengst' ? 'Hengst' : 'Stute');
    if (order.disc) p.push(order.disc + ' ≥ ' + order.minTalent);
    p.push('Exterieur ≥ ' + order.minConf, 'Gesundheit ≥ ' + order.minHealth);
    if (order.needPapers) p.push('Zuchtbucheintrag');
    if (order.wantRare) p.push('Sonderfarbe');
    p.push(order.maxAge < 12 ? 'max. ' + order.maxAge + ' J.' : 'Alter ≤ 12 J.');
    return p.join(' · ');
  }

  // --- Pensionsstall: freie Boxen an Gastpferde vermieten. Passives
  //     Wocheneinkommen je Box, skaliert mit Rang und Pflegestufe. Belegte
  //     Gastboxen zählen gegen die Stallkapazität.
  function boardIncomePerBox(state) {
    const base = 45 + state.prestige * 0.22 + (state.careLevel != null ? state.careLevel : 1) * 12 + prestigeTier(state).stars * 8;
    return Math.round(base * staffSalesMult(state));
  }
  function freeStallSlots(state) {
    return Math.max(0, stallCapacity(state) - state.horses.length - (state.boarding || 0));
  }

  // --- Eigene Deckstation: einen gekörten/eingetragenen Hengst fremden
  //     Zuchtstuten gegen Deckgeld anbieten. Erwartete Buchungen/Woche hängen
  //     an Rang, Qualität, Zuchtzulassung und (invers) am gesetzten Deckgeld.
  function studServiceBookings(state, horse) {
    if (!horse.studService) return 0;
    const rank = approvalRank(horse.zuchtzulassung);
    if (rank < 2) return 0;
    const val = Model.valuation(horse, state.week, prestigeMult(state));
    const fair = Math.max(400, val * 0.05);
    const attractiveness = clamp(fair / Math.max(horse.studService.fee, 1), 0.15, 1.7);
    const base = (0.22 + prestigeTier(state).stars * 0.12 + (horse.quality - 0.4) * 0.5 + rank * 0.12) * staffSalesMult(state);
    return clamp(base * attractiveness, 0, 2.6);
  }

  // --- Versicherung: pro Pferd, zwei Stufen.
  //     OP-Schutz   – erstattet 80 % von Tierarzt-Behandlungskosten (Ereignisse,
  //                   Kolik, Schwergeburt), nicht von Routine (Hufschmied/Wurmkur).
  //     Vollschutz  – zusätzlich Lebensversicherung: 70 % des Schätzwerts (max.
  //                   INSURE_LIFE_CAP) bei Tod durch Alter oder Geburt.
  //     Wartezeit: OP 2 Wochen, Leben 4 Wochen ab Abschluss.
  const INSURE_VET_WAIT = 2, INSURE_LIFE_WAIT = 4;
  const INSURE_VET_COVER = 0.8, INSURE_LIFE_SHARE = 0.7, INSURE_LIFE_CAP = 120000;
  function insurancePremium(state, horse, tier) {
    const val = Model.valuation(horse, state.week, prestigeMult(state));
    if (tier === 'voll') return Math.max(20, Math.round(val * 0.0016 + 15));
    if (tier === 'op') return Math.max(9, Math.round(val * 0.0006 + 8));
    return 0;
  }
  function insuranceVetCover(state, horse) {
    const ins = horse.insurance;
    if (!ins) return 0;
    return (state.week - (ins.since || 0) >= INSURE_VET_WAIT) ? INSURE_VET_COVER : 0;
  }
  function insuranceLifePayout(state, horse) {
    const ins = horse.insurance;
    if (!ins || ins.tier !== 'voll') return 0;
    if (state.week - (ins.since || 0) < INSURE_LIFE_WAIT) return 0;
    const val = Model.valuation(horse, state.week, prestigeMult(state));
    return Math.round(Math.min(val, INSURE_LIFE_CAP) * INSURE_LIFE_SHARE);
  }
  function insurancePremiums(state) {
    return (state.horses || []).reduce((s, h) => s + (h.insurance ? insurancePremium(state, h, h.insurance.tier) : 0), 0);
  }

  // --- Turnier-Challenge: zwei Pferde unter identischen Bedingungen (gleicher
  //     Seed = gleiche Tagesform) in einer Sportklasse bewerten.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function runChallengeScore(state, horse, disc, level, seed) {
    const show = { type: 'sport', discipline: disc, level: clamp(level | 0, 1, 5), fieldStrength: 30 + level * 12 };
    const orig = Math.random;
    Math.random = mulberry32((seed >>> 0) || 1);
    let sc;
    try { sc = scoreHorse(horse, show, state.week); }
    finally { Math.random = orig; }
    return sc;
  }

  function fmtEur(v) {
    return (Math.round(v)).toLocaleString('de-DE') + ' €';
  }

  return {
    FACILITIES: FACILITIES,
    FEED: FEED,
    CARE: CARE,
    feedDef: feedDef,
    careDef: careDef,
    facLevel: facLevel,
    stallCapacity: stallCapacity,
    weeklyUpkeep: weeklyUpkeep,
    FEED_BULK_DISCOUNT: FEED_BULK_DISCOUNT,
    pastureSlots: pastureSlots,
    siloCapacity: siloCapacity,
    pastureUsed: pastureUsed,
    feedNeed: feedNeed,
    herdFeedNeed: herdFeedNeed,
    feedUnitCost: feedUnitCost,
    feedFromStock: feedFromStock,
    weeklyFeedCost: weeklyFeedCost,
    prestigeMult: prestigeMult,
    prestigeTier: prestigeTier,
    maxLoan: maxLoan,
    LOAN_RATE: LOAN_RATE,
    FARRIER_EVERY: FARRIER_EVERY, FARRIER_COST: FARRIER_COST,
    VETROUTINE_EVERY: VETROUTINE_EVERY, VETROUTINE_COST: VETROUTINE_COST,
    season: season,
    seasonFertMult: seasonFertMult,
    seasonTrainMult: seasonTrainMult,
    seasonEnergyBonus: seasonEnergyBonus,
    rollStaffMarket: rollStaffMarket,
    maxStaff: maxStaff,
    bestStaffSkill: bestStaffSkill,
    staffTrainBonus: staffTrainBonus,
    staffEventMult: staffEventMult,
    staffVetMult: staffVetMult,
    staffSalesMult: staffSalesMult,
    rollSponsorOffers: rollSponsorOffers,
    rollBreedingOrders: rollBreedingOrders,
    makeBreedingOrder: makeBreedingOrder,
    orderMatch: orderMatch,
    orderSummary: orderSummary,
    boardIncomePerBox: boardIncomePerBox,
    freeStallSlots: freeStallSlots,
    studServiceBookings: studServiceBookings,
    INSURE_VET_WAIT: INSURE_VET_WAIT, INSURE_LIFE_WAIT: INSURE_LIFE_WAIT,
    insurancePremium: insurancePremium,
    insuranceVetCover: insuranceVetCover,
    insuranceLifePayout: insuranceLifePayout,
    insurancePremiums: insurancePremiums,
    initDemand: initDemand,
    driftDemand: driftDemand,
    demandMultiplier: demandMultiplier,
    demandBreakdown: demandBreakdown,
    demandOverview: demandOverview,
    applySaleImpact: applySaleImpact,
    eligibilityReason: eligibilityReason,
    showScoreLabel: showScoreLabel,
    approvalRank: approvalRank,
    praemieRank: praemieRank,
    lpPassed: lpPassed,
    rollMarket: rollMarket,
    rollStudRoster: rollStudRoster,
    rollAuction: rollAuction,
    placeBid: placeBid,
    bidIncrement: bidIncrement,
    closeAuction: closeAuction,
    rollShows: rollShows,
    scoreHorse: scoreHorse,
    runShow: runShow,
    initRivals: initRivals,
    advanceRivals: advanceRivals,
    seasonStandings: seasonStandings,
    mySeasonPoints: mySeasonPoints,
    championshipQualified: championshipQualified,
    runChampionship: runChampionship,
    CHAMP_QUAL: CHAMP_QUAL,
    JUNGCHAMP_QUAL: JUNGCHAMP_QUAL,
    JUNGCHAMP_MAX_AGE: JUNGCHAMP_MAX_AGE,
    jungChampionshipQualified: jungChampionshipQualified,
    runJungChampionship: runJungChampionship,
    mulberry32: mulberry32,
    runChallengeScore: runChallengeScore,
    fmtEur: fmtEur,
    TRAIN_ENERGY_COST: TRAIN_ENERGY_COST,
    FOAL_ENERGY_COST: FOAL_ENERGY_COST,
    FOAL_GAIN: FOAL_GAIN,
    FOAL_ACTIVITIES: FOAL_ACTIVITIES,
    SEMEN_COST: SEMEN_COST,
    SEMEN_ENERGY: SEMEN_ENERGY,
    SEMEN_DOSES: SEMEN_DOSES,
    SEMEN_COOLDOWN_WEEKS: SEMEN_COOLDOWN_WEEKS,
    SEMEN_FERT_MULT: SEMEN_FERT_MULT,
    SEMEN_THAW_FEE: SEMEN_THAW_FEE,
  };
})();
