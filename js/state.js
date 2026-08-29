/* ============================================================================
   Spielzustand, Persistenz (localStorage) und der Wochen-Tick, der alle
   Systeme fortschreibt. Globales `Game`.
   ========================================================================== */
const Game = (function () {
  'use strict';

  const SAVE_KEY = 'gestuetsspiel_save_v1';   // interner Schlüssel, bewusst ASCII
  const clamp = Model.clamp;
  const DISC = Model.DISC;

  let state = null;
  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach((fn) => fn(state)); }

  function log(msg, kind) {
    state.eventLog.unshift({ week: state.week, msg: msg, kind: kind || 'info' });
    if (state.eventLog.length > 200) state.eventLog.pop();
  }

  // Zuchtstempel aus dem Gestütsnamen ableiten ("Gestüt Eichenhof" -> "Eichenhof").
  function derivePrefix(name) {
    if (!name) return '';
    const n = String(name).replace(/^(Gestüt|Gestuet|Stall|Hof|Reitstall|Zuchtstall)\s+/i, '').trim();
    return (n.split(/\s+/)[0] || n).slice(0, 16);
  }

  // --- Neues Spiel.
  function newGame(studName) {
    const sName = studName || Names.randStudName();
    state = {
      version: 4,
      studName: sName,
      studPrefix: derivePrefix(sName),
      prefixOn: true,
      week: 0,
      cash: 60000,
      prestige: 0,
      facilities: { stalls: 0, arena: 0, vet: 0, marketing: 0, pasture: 0, silo: 0 },
      feedLevel: 1,       // Fütterung: 0 Spar / 1 Standard / 2 Premium
      feedStock: 0,       // eingelagerte Pferdewochen Futter
      careLevel: 1,       // Pflege:    0 Minimal / 1 Solide / 2 Intensiv
      demand: Economy.initDemand(),   // Angebot & Nachfrage je Rasse/Disziplin
      friendCode: Friend.playerCode(),
      friends: [],        // gespeicherte Freundescodes mit Spitznamen
      friendRankings: [], // importierte Saisonwertungen von Freunden
      friendStuds: [],    // von Freunden übernommene Deckhengste
      pendingOffers: [],  // eigene offene Verkaufsangebote { id, horseId, price, to }
      pendingPurchases: [], // abgegebene Kaufgebote, auf Lieferung wartend
      paidReceipts: [],   // angenommene Decktaxe-Abrechnungen (für Quittungs-Neuausgabe)
      redeemedCodes: [],  // Prüfsummen bereits genutzter Codes
      horses: [],
      market: [],
      studRoster: [],     // Deckstation: fremde Hengste gegen Gebühr
      auction: { lots: [], nextWeek: 2 },
      shows: [],
      saleListings: [],   // { horseId, price, weeks }
      showResults: [],    // letzte Turnier-Ergebnislisten
      eventLog: [],
      nextMarketWeek: 0,
      nextShowWeek: 0,
      nextStudWeek: 0,
      nextFarrierWeek: Economy.FARRIER_EVERY,
      nextVetRoutineWeek: Economy.VETROUTINE_EVERY,
      debt: 0,
      history: [],
      staff: [],
      staffMarket: [],
      nextStaffWeek: 0,
      sponsors: [],
      sponsorOffers: [],
      nextSponsorWeek: 8,
      breedingOrders: [],
      nextOrderWeek: 5,
      boarding: 0,
      lastSeasonIdx: -1,
      rivals: [],
      seasonYear: 1,
      championHistory: [],
      jungChampHistory: [],
      stats: { foalsBred: 0, horsesSold: 0, showWins: 0, totalEarnings: 0, bestSale: null, biggestWin: 0 },
    };

    // Startbestand: 1 Hengst, 3 Stuten, gemischte Rassen.
    const startBreeds = ['Deutsches Sportpferd', 'Hannoveraner', 'Isländer', 'Araber'];
    state.horses.push(Model.generateHorse({ sex: 'hengst', breed: startBreeds[0], quality: 0.55, ageYears: 6, currentWeek: 0, origin: 'Startbestand' }));
    for (let i = 1; i < 4; i++) {
      state.horses.push(Model.generateHorse({ sex: 'stute', breed: startBreeds[i], quality: 0.45 + Math.random() * 0.2, ageYears: 4 + Math.random() * 5, currentWeek: 0, origin: 'Startbestand' }));
    }

    state.rivals = Economy.initRivals(state);
    state.staffMarket = Economy.rollStaffMarket(state);
    state.breedingOrders = Economy.rollBreedingOrders(state);
    state.market = Economy.rollMarket(state);
    state.studRoster = Economy.rollStudRoster(state);
    state.shows = Economy.rollShows(state);
    state.auction.lots = Economy.rollAuction(state);
    log('Willkommen auf ' + state.studName + '! Startkapital: ' + Economy.fmtEur(state.cash) + '.', 'good');
    save();
    emit();
    return state;
  }

  // --- Persistenz.
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }
  // Ältere Spielstände auf den aktuellen Aufbau bringen (Detailwerte,
  // Nachfrage, ...), damit nichts abstürzt.
  function migrate() {
    if (!state) return;
    if (!state.demand) state.demand = Economy.initDemand();
    if (!state.showResults) state.showResults = [];
    if (!Array.isArray(state.rivals) || !state.rivals.length) state.rivals = Economy.initRivals(state);
    if (state.seasonYear == null) state.seasonYear = 1;
    if (!Array.isArray(state.championHistory)) state.championHistory = [];
    if (!Array.isArray(state.jungChampHistory)) state.jungChampHistory = [];
    if (state.debt == null) state.debt = 0;
    if (state.nextFarrierWeek == null) state.nextFarrierWeek = state.week + 2;
    if (state.nextVetRoutineWeek == null) state.nextVetRoutineWeek = state.week + 4;
    if (!Array.isArray(state.history)) state.history = [];
    if (!Array.isArray(state.staff)) state.staff = [];
    if (!Array.isArray(state.staffMarket)) state.staffMarket = Economy.rollStaffMarket(state);
    if (state.nextStaffWeek == null) state.nextStaffWeek = state.week + 4;
    if (!Array.isArray(state.sponsors)) state.sponsors = [];
    if (!Array.isArray(state.sponsorOffers)) state.sponsorOffers = [];
    if (state.nextSponsorWeek == null) state.nextSponsorWeek = state.week + 4;
    if (!Array.isArray(state.breedingOrders)) state.breedingOrders = Economy.rollBreedingOrders(state);
    if (state.nextOrderWeek == null) state.nextOrderWeek = state.week + 5;
    if (state.studPrefix == null) state.studPrefix = derivePrefix(state.studName);
    if (state.prefixOn == null) state.prefixOn = true;
    if (state.boarding == null) state.boarding = 0;
    if (state.lastSeasonIdx == null) state.lastSeasonIdx = Economy.season(state.week).idx;
    if (!state.stats) state.stats = {};
    if (state.stats.bestSale === undefined) state.stats.bestSale = null;
    if (state.stats.biggestWin === undefined) state.stats.biggestWin = 0;
    if (!state.friendCode) state.friendCode = Friend.playerCode();
    if (!Array.isArray(state.friends)) state.friends = [];
    if (!Array.isArray(state.friendRankings)) state.friendRankings = [];
    if (!Array.isArray(state.friendStuds)) state.friendStuds = [];
    if (!Array.isArray(state.pendingOffers)) state.pendingOffers = [];
    if (!Array.isArray(state.pendingPurchases)) state.pendingPurchases = [];
    if (!Array.isArray(state.paidReceipts)) state.paidReceipts = [];
    if (!Array.isArray(state.redeemedCodes)) state.redeemedCodes = [];
    if (state.feedLevel == null) state.feedLevel = 1;
    if (state.careLevel == null) state.careLevel = 1;
    if (state.facilities.pasture == null) state.facilities.pasture = 0;
    if (state.facilities.silo == null) state.facilities.silo = 0;
    if (state.feedStock == null) state.feedStock = 0;
    state.friendStuds.forEach((x) => Model.ensureTraits(x.horse));
    const fix = (h) => { if (h) Model.ensureTraits(h); };
    (state.horses || []).forEach((h) => {
      fix(h);
      if (h.trainingFocus && !h.trainingPlan) h.trainingPlan = [h.trainingFocus, h.trainingFocus, h.trainingFocus];
      if (h.pregnancy && h.pregnancy.sireSnapshot) fix(h.pregnancy.sireSnapshot);
    });
    (state.market || []).forEach((o) => fix(o.horse));
    (state.studRoster || []).forEach((x) => fix(x.horse));
    if (state.auction && state.auction.lots) state.auction.lots.forEach((l) => fix(l.horse));
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      state = JSON.parse(raw);
      migrate();
      emit();
      return true;
    } catch (e) { return false; }
  }
  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }
  function exportSave() { return JSON.stringify(state, null, 2); }
  function importSave(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.horses)) throw new Error('Ungültiger Spielstand.');
    state = parsed; migrate(); save(); emit(); return true;
  }
  function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} state = null; }

  // --- Helfer.
  function getHorse(id) { return state.horses.find((h) => h.id === id) || null; }

  // Löst eine Hengst-Auswahl auf: entweder ein eigenes Pferd oder ein
  // Hengst aus der Deckstation. Gibt { horse, external, fee } zurück.
  function findSire(id) {
    const own = getHorse(id);
    if (own) {
      return { horse: own, external: false, fee: 800 + Math.round(Model.valuation(own, state.week, 1) * 0.03) };
    }
    const entry = (state.studRoster || []).find((x) => x.horse.id === id);
    if (entry) return { horse: entry.horse, external: true, fee: entry.studFee };
    const fr = (state.friendStuds || []).find((x) => x.horse.id === id);
    if (fr) return { horse: fr.horse, external: true, fee: fr.studFee, friend: fr.friend };
    return null;
  }
  function stallFree() { return Economy.stallCapacity(state) - state.horses.length - (state.boarding || 0); }
  // "Fairer" Schätzwert (ohne Tagesnachfrage).
  function valuation(h) { return Model.valuation(h, state.week, Economy.prestigeMult(state)); }
  // Was der Markt gerade zahlt (Schätzwert × aktuelle Nachfrage im Segment).
  function marketPrice(h) {
    return Math.round(valuation(h) * Economy.demandMultiplier(state, h) / 50) * 50;
  }

  function addCash(v, reason) {
    state.cash += v;
    if (reason) log((v >= 0 ? '+' : '') + Economy.fmtEur(v) + ' - ' + reason, v >= 0 ? 'good' : 'cost');
  }
  function recordSale(name, amount) {
    if (!state.stats.bestSale || amount > state.stats.bestSale.amount) {
      state.stats.bestSale = { name: name, amount: Math.round(amount), week: state.week };
    }
  }

  // --- Bank -----------------------------------------------------------
  function takeLoan(amount) {
    amount = Math.max(0, Math.round(amount || 0));
    const room = Economy.maxLoan(state) - (state.debt || 0);
    if (room <= 0) return { ok: false, msg: 'Kein Kreditrahmen mehr (max. ' + Economy.fmtEur(Economy.maxLoan(state)) + ').' };
    amount = Math.min(amount, room);
    state.debt = (state.debt || 0) + amount;
    state.cash += amount;
    log('Kredit aufgenommen: +' + Economy.fmtEur(amount) + ' (Restschuld ' + Economy.fmtEur(state.debt) + ', ' + (Economy.LOAN_RATE * 100).toFixed(1) + '% Zins/Woche).', 'info');
    save(); emit();
    return { ok: true, amount: amount };
  }
  function repayLoan(amount) {
    amount = Math.max(0, Math.round(amount || 0));
    amount = Math.min(amount, state.debt || 0, Math.max(0, state.cash));
    if (amount <= 0) return { ok: false, msg: 'Nichts zu tilgen (oder kein Geld).' };
    state.debt -= amount;
    state.cash -= amount;
    log('Kredit getilgt: -' + Economy.fmtEur(amount) + ' (Restschuld ' + Economy.fmtEur(state.debt) + ').', 'good');
    save(); emit();
    return { ok: true, amount: amount };
  }

  // --- Personal ------------------------------------------------------
  function hireStaff(idx) {
    const cand = (state.staffMarket || [])[idx];
    if (!cand) return { ok: false, msg: 'Angebot nicht mehr da.' };
    if ((state.staff || []).length >= Economy.maxStaff(state)) return { ok: false, msg: 'Kein Platz für weiteres Personal (max. ' + Economy.maxStaff(state) + ', Trainingsanlage ausbauen).' };
    const signOn = cand.salary * 2;
    if (state.cash < signOn) return { ok: false, msg: 'Antrittsgeld ' + Economy.fmtEur(signOn) + ' nicht bezahlbar.' };
    state.cash -= signOn;
    state.staff.push(cand);
    state.staffMarket.splice(idx, 1);
    const roleTxt = cand.role === 'bereiter' ? 'Bereiter/in — ' + cand.disciplines.join(', ')
      : cand.role === 'stallmeister' ? 'Stallmeister/in'
      : cand.role === 'tierarzt' ? 'Tierarzt/in'
      : 'Vermarkter/in';
    log('Eingestellt: ' + cand.name + ' (' + roleTxt + ', Gehalt ' + Economy.fmtEur(cand.salary) + '/Wo., Antrittsgeld -' + Economy.fmtEur(signOn) + ').', 'cost');
    save(); emit();
    return { ok: true };
  }
  function fireStaff(id) {
    const x = (state.staff || []).find((s) => s.id === id);
    state.staff = (state.staff || []).filter((s) => s.id !== id);
    if (x) log(x.name + ' wurde entlassen.', 'info');
    save(); emit();
    return { ok: true };
  }

  // --- Sponsoren ---------------------------------------------------
  function signSponsor(idx) {
    const off = (state.sponsorOffers || [])[idx];
    if (!off) return { ok: false, msg: 'Angebot nicht mehr da.' };
    if ((state.sponsors || []).length >= 2) return { ok: false, msg: 'Maximal 2 Sponsorenverträge gleichzeitig.' };
    state.sponsors.push({ id: off.id, name: off.name, weeklyPay: off.weeklyPay, weeksLeft: off.weeks,
      reqStarts: off.reqStarts, bonus: off.bonus, starts: 0, startWeek: state.week });
    state.sponsorOffers.splice(idx, 1);
    log('Sponsorenvertrag mit ' + off.name + ' unterschrieben: +' + Economy.fmtEur(off.weeklyPay) + '/Wo. für ' + off.weeks + ' Wochen, Auflage ' + off.reqStarts + ' Turnierstarts.', 'good');
    save(); emit();
    return { ok: true };
  }
  function dropSponsor(id) {
    state.sponsors = (state.sponsors || []).filter((c) => c.id !== id);
    log('Sponsorenvertrag vorzeitig beendet.', 'warn');
    save(); emit();
    return { ok: true };
  }

  // --- Zuchtbuch / Zuchtstempel -----------------------------------------
  function setStudPrefix(str) {
    state.studPrefix = String(str || '').trim().slice(0, 16);
    save(); emit();
    return { ok: true };
  }
  function setPrefixOn(on) { state.prefixOn = !!on; save(); emit(); return { ok: true }; }

  // --- Pensionsstall: Anzahl vermieteter Gastboxen setzen (max. freie Plätze).
  function setBoarding(n) {
    n = Math.max(0, Math.round(n || 0));
    const room = Economy.stallCapacity(state) - state.horses.length;
    n = Math.min(n, Math.max(0, room));
    state.boarding = n;
    log('🏨 Pensionsstall: ' + n + ' Gastbox' + (n === 1 ? '' : 'en') + ' vermietet (' + Economy.fmtEur(Economy.boardIncomePerBox(state)) + '/Box/Wo.).', 'info');
    save(); emit();
    return { ok: true };
  }

  // --- Weidegang: ein Pferd auf die Koppel stellen (spart Futter, erholt,
  //     hebt langsam das Interieur; dafür −20 % Trainingszuwachs).
  function setPasture(horseId, on) {
    const h = getHorse(horseId);
    if (!h) return { ok: false, msg: 'Pferd nicht gefunden.' };
    if (on) {
      if (Economy.pastureUsed(state) >= Economy.pastureSlots(state)) {
        return { ok: false, msg: 'Keine freien Koppelplätze — Weide ausbauen.' };
      }
      h.onPasture = true;
      log('🌾 ' + h.name + ' kommt auf die Weide.', 'info');
    } else {
      delete h.onPasture;
      log('🌾 ' + h.name + ' kommt zurück in den Stall.', 'info');
    }
    save(); emit();
    return { ok: true };
  }

  // --- Futter-Lager: Futter im Voraus einlagern (Mengenrabatt), zehrt sich
  //     wöchentlich mit dem Verbrauch ab.
  function buyFeed(weeks) {
    weeks = Math.max(1, Math.round(weeks || 0));
    const cap = Economy.siloCapacity(state);
    if (cap <= 0) return { ok: false, msg: 'Kein Futter-Lager gebaut (Anlagen).' };
    const room = cap - (state.feedStock || 0);
    if (room <= 0) return { ok: false, msg: 'Das Futter-Lager ist voll.' };
    let units = Math.min(weeks * Math.max(1, state.horses.length), room);
    const cost = Math.round(units * Economy.feedDef(state).cost * Economy.FEED_BULK_DISCOUNT);
    if (state.cash < cost) return { ok: false, msg: 'Nicht genug Geld (' + Economy.fmtEur(cost) + ').' };
    state.cash -= cost;
    state.feedStock = (state.feedStock || 0) + units;
    log('🌾 Futter eingelagert: ' + Math.round(units) + ' Pferdewochen für ' + Economy.fmtEur(cost) +
      ' (' + Math.round((1 - Economy.FEED_BULK_DISCOUNT) * 100) + ' % Mengenrabatt). Vorrat: ' + Math.round(state.feedStock) + '/' + cap + '.', 'cost');
    save(); emit();
    return { ok: true, units: units, cost: cost };
  }

  // --- Eigene Deckstation: eigenen Hengst fremden Zuchtstuten anbieten.
  function offerStudService(horseId, fee) {
    const h = getHorse(horseId);
    if (!h) return { ok: false, msg: 'Pferd nicht gefunden.' };
    if (h.sex !== 'hengst') return { ok: false, msg: h.name + ' ist kein Hengst.' };
    if (Model.ageYears(h, state.week) < Model.MATURITY_YEARS) return { ok: false, msg: h.name + ' ist zu jung.' };
    if (Model.approvalRank(h.zuchtzulassung) < 2) return { ok: false, msg: h.name + ' ist nicht gekört/eingetragen — keine Nachfrage von Zuchtstuten.' };
    fee = Math.max(100, Math.round(fee || 0));
    const prev = h.studService || { bookings: 0, income: 0 };
    h.studService = { fee: fee, bookings: prev.bookings || 0, income: prev.income || 0 };
    log(h.name + ' wird als Deckhengst für fremde Zuchtstuten angeboten (Deckgeld ' + Economy.fmtEur(fee) + ').', 'info');
    save(); emit();
    return { ok: true };
  }
  function stopStudService(horseId) {
    const h = getHorse(horseId);
    if (h && h.studService) { delete h.studService; log(h.name + ' steht fremden Zuchtstuten nicht mehr zur Verfügung.', 'info'); }
    save(); emit();
    return { ok: true };
  }

  // --- Farbtest: deckt bei einem Pferd den vollständigen Genotyp und
  //     verdeckte Farbträger (Frame Overo / Roan) auf.
  const COLORTEST_COST = 500;
  function colorTest(horseId) {
    const h = getHorse(horseId);
    if (!h) return { ok: false, msg: 'Pferd nicht gefunden.' };
    if (h.genoTested !== false) return { ok: false, msg: h.name + ' ist bereits farbgetestet.' };
    if (state.cash < COLORTEST_COST) return { ok: false, msg: 'Farbtest ' + Economy.fmtEur(COLORTEST_COST) + ' nicht bezahlbar.' };
    state.cash -= COLORTEST_COST;
    h.genoTested = true;
    const carriers = Model.lethalCarriers(h);
    const tok = Genetics.describe(h.genotype, Model.ageYears(h, state.week)).tokens;
    log('🔬 Farbtest ' + h.name + ' (-' + Economy.fmtEur(COLORTEST_COST) + '): ' + tok +
      (carriers.length ? ' — trägt: ' + carriers.join(', ') + '!' : ' — keine Letalfarb-Träger.'),
      carriers.length ? 'warn' : 'good');
    save(); emit();
    return { ok: true, carriers: carriers };
  }

  // --- Versicherung ------------------------------------------------------
  function setInsurance(horseId, tier) {
    const h = getHorse(horseId);
    if (!h) return { ok: false, msg: 'Pferd nicht gefunden.' };
    tier = (tier === 'op' || tier === 'voll') ? tier : null;
    if (!tier) {
      if (h.insurance) log('Versicherung für ' + h.name + ' gekündigt.', 'info');
      delete h.insurance;
      save(); emit();
      return { ok: true };
    }
    if (!h.insurance) {
      const y = Model.ageYears(h, state.week);
      if (y > 20) return { ok: false, msg: h.name + ' ist zu alt für einen Neuabschluss (> 20 Jahre).' };
      if (h.health < 40) return { ok: false, msg: h.name + ' ist zu angeschlagen (Gesundheit < 40) für einen Neuabschluss.' };
      h.insurance = { tier: tier, since: state.week };
      log('Versicherung ' + (tier === 'voll' ? 'Vollschutz' : 'OP-Schutz') + ' für ' + h.name + ' abgeschlossen (' +
        Economy.fmtEur(Economy.insurancePremium(state, h, tier)) + '/Wo., Wartezeit ' +
        (tier === 'voll' ? Economy.INSURE_LIFE_WAIT + ' Wo.' : Economy.INSURE_VET_WAIT + ' Wo.') + ').', 'info');
    } else {
      h.insurance.tier = tier;   // Stufe wechseln, Abschlussdatum bleibt
      log('Versicherung für ' + h.name + ' auf ' + (tier === 'voll' ? 'Vollschutz' : 'OP-Schutz') + ' geändert.', 'info');
    }
    save(); emit();
    return { ok: true };
  }
  // Tierarztrechnung teilweise erstatten. Gibt den erstatteten Betrag zurück.
  function claimVetInsurance(h, bill) {
    const cover = Economy.insuranceVetCover(state, h);
    if (!cover || bill <= 0) return 0;
    const refund = Math.round(bill * cover);
    state.cash += refund;
    state.stats.insuranceClaims = (state.stats.insuranceClaims || 0) + refund;
    log('🛡️ Versicherung erstattet ' + Economy.fmtEur(refund) + ' der Tierarztkosten für ' + h.name + '.', 'good');
    return refund;
  }
  // Lebensversicherung bei Tod auszahlen.
  function payLifeInsurance(h, cause) {
    const payout = Economy.insuranceLifePayout(state, h);
    if (!payout) return 0;
    state.cash += payout;
    state.stats.insuranceClaims = (state.stats.insuranceClaims || 0) + payout;
    log('🛡️ Lebensversicherung zahlt ' + Economy.fmtEur(payout) + ' für ' + h.name + ' (' + cause + ').', 'good');
    return payout;
  }

  function foalName() {
    const base = Names.randName();
    return (state.prefixOn && state.studPrefix) ? state.studPrefix + ' ' + base : base;
  }

  // --- Zuchtaufträge -------------------------------------------------
  function fulfillBreedingOrder(orderId, horseId) {
    const order = (state.breedingOrders || []).find((o) => o.id === orderId);
    const h = getHorse(horseId);
    if (!order || !h) return { ok: false, msg: 'Auftrag oder Pferd nicht gefunden.' };
    if (h.offered) return { ok: false, msg: h.name + ' ist in einem Freundes-Verkaufsangebot.' };
    if (h.pregnancy) return { ok: false, msg: 'Trächtige Stute lässt sich nicht abgeben.' };
    if (h.forSale) return { ok: false, msg: h.name + ' steht am Markt zum Verkauf — erst zurückziehen.' };
    if (state.auction.lots.some((l) => l.consignedByPlayer && l.horse.id === h.id)) return { ok: false, msg: h.name + ' ist in der Auktion.' };
    const m = Economy.orderMatch(order, h, state.week);
    if (!m.ok) return { ok: false, msg: h.name + ' passt nicht: ' + m.reasons.join(', ') };
    state.cash += order.reward;
    state.prestige += order.prestige;
    state.stats.horsesSold += 1;
    state.stats.totalEarnings += order.reward;
    recordSale(h.name, order.reward);
    Economy.applySaleImpact(state, h);
    removeHorse(horseId);
    state.breedingOrders = state.breedingOrders.filter((o) => o.id !== orderId);
    log('🎯 Zuchtauftrag von ' + order.client + ' erfüllt mit ' + h.name + ': +' + Economy.fmtEur(order.reward) + ', +' + order.prestige + ' Prestige.', 'good');
    save(); emit();
    return { ok: true, amount: order.reward };
  }

  // Denselben Wochenplan auf mehrere Pferde übertragen.
  function applyPlanToAll(plan, onlyIds) {
    const clean = (Array.isArray(plan) ? plan : []).slice(0, 6).map((d) => (d && DISC.indexOf(d) !== -1 ? d : null));
    let n = 0;
    state.horses.forEach((h) => {
      if (h.offered) return;
      if (Model.ageYears(h, state.week) < Model.MATURITY_YEARS) return;
      if (onlyIds && onlyIds.indexOf(h.id) === -1) return;
      h.trainingPlan = clean.slice();
      h.trainingFocus = clean.find((d) => d) || null;
      n++;
    });
    save(); emit();
    return { ok: true, count: n };
  }

  // --- Aktionen des Spielers ---------------------------------------------

  function setStudName(name) { state.studName = name || state.studName; save(); emit(); }

  function setFeed(level) { state.feedLevel = clamp(level | 0, 0, Economy.FEED.length - 1); save(); emit(); }
  function setCare(level) { state.careLevel = clamp(level | 0, 0, Economy.CARE.length - 1); save(); emit(); }

  function buyFacility(key) {
    const cur = state.facilities[key] || 0;
    const next = Economy.FACILITIES[key].levels[cur + 1];
    if (!next) return { ok: false, msg: 'Bereits maximal ausgebaut.' };
    if (state.cash < next.cost) return { ok: false, msg: 'Nicht genug Geld (' + Economy.fmtEur(next.cost) + ').' };
    state.cash -= next.cost;
    state.facilities[key] = cur + 1;
    log(Economy.FACILITIES[key].label + ' ausgebaut auf Stufe ' + (cur + 1) + ' (-' + Economy.fmtEur(next.cost) + ').', 'cost');
    save(); emit();
    return { ok: true };
  }

  function buyMarketHorse(index) {
    const offer = state.market[index];
    if (!offer) return { ok: false, msg: 'Angebot nicht mehr verfügbar.' };
    if (stallFree() < 1) return { ok: false, msg: 'Kein freier Stallplatz. Baue Stallplätze aus oder verkaufe ein Pferd.' };
    if (state.cash < offer.price) return { ok: false, msg: 'Nicht genug Geld.' };
    state.cash -= offer.price;
    offer.horse.acquiredWeek = state.week;
    offer.horse.origin = 'Marktkauf';
    state.horses.push(offer.horse);
    state.market.splice(index, 1);
    log('Gekauft: ' + offer.horse.name + ' (' + offer.horse.breed + ') für ' + Economy.fmtEur(offer.price) + '.', 'cost');
    save(); emit();
    return { ok: true };
  }

  function listForSale(horseId, price) {
    const h = getHorse(horseId);
    if (!h) return { ok: false, msg: 'Pferd nicht gefunden.' };
    if (h.offered) return { ok: false, msg: h.name + ' ist in einem Freundes-Verkaufsangebot.' };
    if (h.pregnancy) return { ok: false, msg: 'Trächtige Stute - erst nach der Geburt verkaufen (oder in die Auktion geben).' };
    if (state.saleListings.some((s) => s.horseId === horseId)) return { ok: false, msg: 'Steht bereits zum Verkauf.' };
    state.saleListings.push({ horseId: horseId, price: Math.max(100, Math.round(price)), weeks: 0 });
    h.forSale = { price: Math.round(price) };
    log(h.name + ' zum Verkauf angeboten für ' + Economy.fmtEur(price) + '.', 'info');
    save(); emit();
    return { ok: true };
  }
  function unlist(horseId) {
    state.saleListings = state.saleListings.filter((s) => s.horseId !== horseId);
    const h = getHorse(horseId); if (h) h.forSale = null;
    save(); emit();
  }

  // Wochen-Trainingsplan: bis zu 6 Einheiten (je eine Disziplin) oder Ruhe
  // (null). Wird beim "Woche weiter" der Reihe nach abgearbeitet.
  function setTrainingPlan(horseId, plan) {
    const h = getHorse(horseId);
    if (!h || h.offered) return;
    const clean = (Array.isArray(plan) ? plan : []).slice(0, 6)
      .map((d) => (d && DISC.indexOf(d) !== -1 ? d : null));
    h.trainingPlan = clean;
    h.trainingFocus = clean.find((d) => d) || null;   // Kompatibilität
    save(); emit();
  }
  // Alt-API (einzelner Fokus) -> füllt den ganzen Plan.
  function setTrainingFocus(horseId, disc) {
    setTrainingPlan(horseId, disc ? [disc, disc, disc] : []);
  }

  function euthanizeOrSellQuick(horseId) {
    // "Schnellverkauf" an einen Händler: halber Schätzwert, leicht von der
    // Tagesnachfrage beeinflusst.
    const h = getHorse(horseId);
    if (!h) return { ok: false };
    if (h.offered) return { ok: false, msg: h.name + ' ist in einem Freundes-Verkaufsangebot.' };
    const dm = clamp(Economy.demandMultiplier(state, h), 0.85, 1.12);
    const v = Math.round(valuation(h) * 0.5 * dm);
    Economy.applySaleImpact(state, h);
    removeHorse(horseId);
    addCash(v, 'Schnellverkauf ' + h.name + ' an Händler');
    state.stats.horsesSold++;
    save(); emit();
    return { ok: true, amount: v };
  }

  // --- Freundesliste: Codes mit Spitznamen lokal merken ----------------
  const FRIEND_RE = /^HR-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  function addFriend(code, name) {
    code = (code || '').trim().toUpperCase();
    if (!FRIEND_RE.test(code)) return { ok: false, msg: 'Freundescode-Format: HR-XXXX-XXXX' };
    if (code === state.friendCode) return { ok: false, msg: 'Das ist dein eigener Code.' };
    state.friends = state.friends || [];
    name = String(name || '').trim().slice(0, 24);
    const existing = state.friends.find((f) => f.code === code);
    if (existing) { if (name) existing.name = name; }
    else {
      if (state.friends.length >= 40) return { ok: false, msg: 'Freundesliste ist voll (40).' };
      state.friends.push({ code: code, name: name, addedWeek: state.week });
      log('👥 Freund gespeichert: ' + (name || code) + '.', 'info');
    }
    save(); emit();
    return { ok: true };
  }
  function removeFriend(code) {
    state.friends = (state.friends || []).filter((f) => f.code !== code);
    save(); emit();
    return { ok: true };
  }
  // Merkt einen Code beim ersten echten Tausch automatisch vor (ohne Namen).
  function rememberFriend(code) {
    code = (code || '').trim().toUpperCase();
    if (!FRIEND_RE.test(code) || code === state.friendCode) return;
    state.friends = state.friends || [];
    if (!state.friends.some((f) => f.code === code) && state.friends.length < 40) {
      state.friends.push({ code: code, name: '', addedWeek: state.week });
    }
  }
  function friendLabel(code) {
    if (!code) return '?';
    const f = (state.friends || []).find((x) => x.code === code);
    return (f && f.name) ? f.name + ' (' + code + ')' : code;
  }

  // --- Gemeinsame Saison-Rangliste: eigene Wertung teilen / Freundes-
  //     Wertungen importieren (reine Anzeige).
  function shareRanking() {
    const pts = Math.round(Economy.mySeasonPoints(state));
    return { ok: true, code: Friend.encodeRanking(state.friendCode, state.studName, pts, state.prestige, state.seasonYear || 1, state.week) };
  }
  function importRanking(text) {
    let d;
    try { d = Friend.decode(text); } catch (e) { return { ok: false, msg: e.message }; }
    if (d.type !== 'RK') return { ok: false, msg: 'Das ist kein Ranglisten-Code.' };
    if (d.from === state.friendCode) return { ok: false, msg: 'Das ist deine eigene Rangliste.' };
    state.friendRankings = state.friendRankings || [];
    const prev = state.friendRankings.find((r) => r.code === d.from);
    const entry = { code: d.from, stud: d.stud || d.from, points: d.points, prestige: d.prestige, year: d.year, week: d.week };
    if (prev) {
      if (d.week < prev.week) return { ok: false, msg: 'Du hast von ' + friendLabel(d.from) + ' bereits eine neuere Wertung.' };
      Object.assign(prev, entry);
    } else {
      state.friendRankings.push(entry);
    }
    rememberFriend(d.from);
    log('🏇 Saisonwertung von ' + (d.stud || friendLabel(d.from)) + ' übernommen: ' + d.points + ' Punkte (Jahr ' + d.year + ').', 'info');
    save(); emit();
    return { ok: true, stud: d.stud, points: d.points };
  }

  // --- Freundes-Tausch: Codes weitergeben, kein Server ------------------
  function markRedeemed(hash) {
    state.redeemedCodes = state.redeemedCodes || [];
    state.redeemedCodes.push(hash);
    if (state.redeemedCodes.length > 80) state.redeemedCodes.shift();
  }
  function sellBlockReason(h) {
    if (!h) return 'Pferd nicht gefunden.';
    if (h.offered) return h.name + ' ist bereits in einem Verkaufsangebot.';
    if (h.pregnancy) return 'Trächtige Stute lässt sich nicht anbieten.';
    if (h.forSale) return h.name + ' steht am eigenen Markt zum Verkauf – erst zurückziehen.';
    if (state.auction.lots.some((l) => l.consignedByPlayer && l.horse.id === h.id)) return h.name + ' ist in der Auktion.';
    return null;
  }

  // 1) Verkäufer erstellt ein Angebot. toCode leer -> öffentlich (jeder mit
  //    dem Code kann bieten; nur EIN Kaufgebot wird angenommen). Das Pferd
  //    bleibt im Stall, ist aber bis zum Abschluss gesperrt.
  function createOffer(horseId, price, toCode) {
    const h = getHorse(horseId);
    const block = sellBlockReason(h);
    if (block) return { ok: false, msg: block };
    toCode = (toCode || '').trim() || null;
    if (toCode && !FRIEND_RE.test(toCode.toUpperCase())) {
      // vielleicht ein Spitzname aus der Freundesliste?
      const byName = (state.friends || []).find((f) => f.name && f.name.toLowerCase() === toCode.toLowerCase());
      if (byName) toCode = byName.code;
      else return { ok: false, msg: 'Kein Freundescode/Spitzname erkannt (Format HR-XXXX-XXXX).' };
    }
    toCode = toCode ? toCode.toUpperCase() : null;
    if (toCode && toCode === state.friendCode) return { ok: false, msg: 'Das ist dein eigener Code.' };
    price = Math.max(0, Math.round(price || 0));
    const id = Friend.newOfferId();
    state.pendingOffers = state.pendingOffers || [];
    state.pendingOffers.push({ id: id, horseId: horseId, price: price, to: toCode, week: state.week });
    h.offered = true;
    const code = Friend.encodeOffer(h, price, state.friendCode, toCode, id, state.week);
    log((toCode ? 'Privates' : 'Öffentliches') + ' Verkaufsangebot: ' + h.name + ' für ' + Economy.fmtEur(price) + '. Code weitergeben.', 'info');
    save(); emit();
    return { ok: true, code: code };
  }
  function cancelOffer(offerId) {
    const off = (state.pendingOffers || []).find((o) => o.id === offerId);
    if (!off) return { ok: false };
    const h = getHorse(off.horseId);
    if (h) h.offered = false;
    state.pendingOffers = state.pendingOffers.filter((o) => o.id !== offerId);
    log('Verkaufsangebot zurückgezogen' + (h ? ': ' + h.name : '') + '.', 'info');
    save(); emit();
    return { ok: true };
  }

  // Nur prüfen/lesen, nichts ändern – für die Vorschau vor dem Klick.
  function previewCode(text) {
    let d;
    try { d = Friend.decode(text); } catch (e) { return { ok: false, msg: e.message }; }
    const mine = state.friendCode;
    const already = (state.redeemedCodes || []).indexOf(d.hash) !== -1;

    if (d.type === 'OF') {
      if (d.from === mine) return { ok: false, msg: 'Das ist dein eigenes Angebot.' };
      if (d.to && d.to !== mine) return { ok: false, msg: 'Dieses private Angebot ist an ' + d.to + ' gerichtet, nicht an dich (' + mine + ').' };
      if (already) return { ok: false, msg: 'Für dieses Angebot hast du schon geboten.' };
      return { ok: true, action: 'bid', kind: 'Verkaufsangebot' + (d.public ? ' (öffentlich)' : ' (privat)'),
        from: d.from, price: d.price, horse: d.horse, warn: state.cash < d.price ? 'Achtung: Du hast aktuell weniger als ' + Economy.fmtEur(d.price) + '.' : null };
    }
    if (d.type === 'BD') {
      if (d.seller && d.seller !== mine) return { ok: false, msg: 'Dieses Kaufgebot gehört zu einem Angebot von ' + d.seller + '.' };
      const off = (state.pendingOffers || []).find((o) => o.id === d.id);
      if (!off) return { ok: false, msg: 'Zu diesem Kaufgebot gibt es kein offenes Angebot (schon verkauft oder zurückgezogen).' };
      const h = getHorse(off.horseId);
      return { ok: true, action: 'sell', kind: 'Kaufgebot', from: d.from, price: off.price,
        horse: h ? { name: h.name, breed: h.breed } : null,
        text: (d.from) + ' möchte ' + (h ? h.name : 'dein Pferd') + ' für ' + Economy.fmtEur(off.price) + ' kaufen.' };
    }
    if (d.type === 'DL') {
      if (already) return { ok: false, msg: 'Diese Lieferung hast du bereits übernommen.' };
      return { ok: true, action: 'receive', kind: 'Lieferung', from: d.from, price: d.price, horse: d.horse,
        warn: state.cash < d.price ? 'Nicht genug Geld (' + Economy.fmtEur(d.price) + ').' : (stallFree() < 1 ? 'Kein freier Stallplatz.' : null) };
    }
    if (d.type === 'PY') {
      if (d.to && d.to !== mine) return { ok: false, msg: 'Diese Abrechnung ist an ' + d.to + ' gerichtet.' };
      if (already) {
        const pr = (state.paidReceipts || []).find((x) => x.id === d.id);
        if (pr) return { ok: true, action: 'reissue', kind: 'Decktaxe-Abrechnung (bereits bezahlt)', from: d.from, amount: pr.amount,
          text: 'Diese Abrechnung hast du schon angenommen (' + Economy.fmtEur(pr.amount) + ' von ' + d.from + '). Du kannst nur die Quittung neu erzeugen.' };
        return { ok: false, msg: 'Diese Decktaxe-Abrechnung hast du schon angenommen.' };
      }
      return { ok: true, action: 'payout', kind: 'Decktaxe-Abrechnung', from: d.from, amount: d.amount, count: d.count,
        text: d.from + ' zahlt dir ' + Economy.fmtEur(d.amount) + ' Decktaxe für ' + (d.stud || 'deinen Hengst') + ' (' + d.count + ' Bedeckungen).' };
    }
    if (d.type === 'CF') {
      if (d.confirmKind !== 'payout') return { ok: false, msg: 'Unbekannte Quittung.' };
      const ps = (state.friendStuds || []).find((x) => x.pendingSettle && x.pendingSettle.id === d.id);
      if (!ps) return { ok: false, msg: 'Zu dieser Quittung gibt es keine offene Abrechnung (evtl. schon abgeschlossen).' };
      return { ok: true, action: 'confirm', kind: 'Quittung', from: d.from, amount: d.amount,
        text: d.from + ' bestätigt den Erhalt von ' + Economy.fmtEur(d.amount) + ' Decktaxe für ' + ps.horse.name + '.' };
    }
    if (d.type === 'RK') {
      if (d.from === mine) return { ok: false, msg: 'Das ist deine eigene Rangliste.' };
      return { ok: true, action: 'ranking', kind: 'Saison-Rangliste', from: d.from,
        text: (d.stud || d.from) + ': ' + d.points + ' Saisonpunkte, ' + d.prestige + ' Prestige (Jahr ' + d.year + ', Wo. ' + d.week + ').' };
    }
    // SD Deckhengst
    if (d.from === mine) return { ok: false, msg: 'Das ist dein eigener Deckhengst-Code.' };
    if (already) return { ok: false, msg: 'Diesen Deckhengst hast du schon übernommen.' };
    return { ok: true, action: 'stud', kind: 'Deckhengst-Angebot', from: d.from, fee: d.fee, horse: d.horse };
  }

  // 2) Käufer akzeptiert ein Angebot -> erzeugt ein KAUFGEBOT (noch kein Geld).
  function acceptOffer(text) {
    const p = previewCode(text);
    if (!p.ok || p.action !== 'bid') return { ok: false, msg: p.msg || 'Kein gültiges Angebot.' };
    const d = Friend.decode(text);
    markRedeemed(d.hash);
    state.pendingPurchases = state.pendingPurchases || [];
    state.pendingPurchases.push({ offerId: d.id, seller: d.from, price: d.price, horseName: d.horse.name, week: state.week });
    log('Kaufgebot abgegeben für ' + d.horse.name + ' (' + Economy.fmtEur(d.price) + '). Kaufgebot-Code an ' + d.from + ' schicken.', 'info');
    const code = Friend.encodeBid(d.id, state.friendCode, d.from);
    save(); emit();
    return { ok: true, code: code, horseName: d.horse.name };
  }

  // 3) Verkäufer akzeptiert das ERSTE Kaufgebot -> Pferd raus, Geld rein,
  //    erzeugt eine LIEFERUNG.
  function acceptBid(text) {
    const p = previewCode(text);
    if (!p.ok || p.action !== 'sell') return { ok: false, msg: p.msg || 'Kein gültiges Kaufgebot.' };
    const d = Friend.decode(text);
    const off = state.pendingOffers.find((o) => o.id === d.id);
    if (!off) return { ok: false, msg: 'Angebot nicht mehr offen.' };
    const h = getHorse(off.horseId);
    if (!h) { cancelOffer(off.id); return { ok: false, msg: 'Pferd nicht mehr im Stall.' }; }
    if (d.from && d.from === state.friendCode) return { ok: false, msg: 'Das ist dein eigener Code.' };

    const delivery = Friend.encodeDelivery(h, off.price, off.id, state.friendCode, state.week);
    state.cash += off.price;
    state.stats.horsesSold += 1;
    state.stats.totalEarnings += off.price;
    recordSale(h.name, off.price);
    Economy.applySaleImpact(state, h);
    h.offered = false;
    removeHorse(h.id);
    state.pendingOffers = state.pendingOffers.filter((o) => o.id !== off.id);
    rememberFriend(d.from);
    log('Verkauft an ' + friendLabel(d.from) + ': ' + h.name + ' für ' + Economy.fmtEur(off.price) + '. Lieferungs-Code an den Käufer schicken.', 'good');
    save(); emit();
    return { ok: true, code: delivery, horseName: h.name };
  }

  // 4) Käufer übernimmt die LIEFERUNG -> zahlt, Pferd kommt in den Stall.
  function acceptDelivery(text) {
    const p = previewCode(text);
    if (!p.ok || p.action !== 'receive') return { ok: false, msg: p.msg || 'Keine gültige Lieferung.' };
    if (p.warn) return { ok: false, msg: p.warn };
    const d = Friend.decode(text);
    const h = Model.hydratePackedHorse(d.horse, state.week, 'von ' + d.from);
    state.cash -= d.price;
    state.horses.push(h);
    markRedeemed(d.hash);
    rememberFriend(d.from);
    state.pendingPurchases = (state.pendingPurchases || []).filter((q) => q.offerId !== d.id);
    log('Von ' + friendLabel(d.from) + ' gekauft: ' + h.name + ' für ' + Economy.fmtEur(d.price) + '.', 'cost');
    save(); emit();
    return { ok: true, name: h.name };
  }

  // Deckhengst öffentlich freigeben (mehrfach nutzbar).
  function shareStud(horseId, fee) {
    const h = getHorse(horseId);
    if (!h) return { ok: false, msg: 'Pferd nicht gefunden.' };
    if (h.sex !== 'hengst') return { ok: false, msg: h.name + ' ist kein Hengst.' };
    if (Model.ageYears(h, state.week) < Model.MATURITY_YEARS) return { ok: false, msg: h.name + ' ist zu jung.' };
    fee = Math.max(0, Math.round(fee || 0));
    const code = Friend.encodeStud(h, fee, state.friendCode, state.week);
    log('Deckhengst öffentlich freigegeben: ' + h.name + ' (Deckgeld ' + Economy.fmtEur(fee) + '). Code teilen.', 'info');
    return { ok: true, code: code };
  }
  function acceptStud(text) {
    const p = previewCode(text);
    if (!p.ok || p.action !== 'stud') return { ok: false, msg: p.msg || 'Kein gültiger Deckhengst-Code.' };
    const d = Friend.decode(text);
    const stud = Model.hydratePackedHorse(d.horse, state.week, 'Deckstation (Freund)');
    stud.external = true;
    state.friendStuds.push({ horse: stud, studFee: d.fee, friend: d.from, elite: false });
    markRedeemed(d.hash);
    rememberFriend(d.from);
    log('Deckhengst von ' + friendLabel(d.from) + ' in deiner Deckstation: ' + stud.name + ' (Deckgeld ' + Economy.fmtEur(d.fee) + ').', 'good');
    save(); emit();
    return { ok: true, name: stud.name };
  }

  function removeFriendStud(horseId) {
    state.friendStuds = (state.friendStuds || []).filter((x) => x.horse.id !== horseId);
    save(); emit();
  }
  // Nutzer eines Freundes-Hengstes: offene Decktaxe an den Besitzer abrechnen.
  // Die Summe bleibt als "verschickt, wartet auf Bestätigung" hängen, bis der
  // Besitzer eine Quittung (CF) zurückschickt oder du manuell abschließt.
  function settleFriendStud(studHorseId) {
    const x = (state.friendStuds || []).find((e) => e.horse.id === studHorseId);
    if (!x) return { ok: false, msg: 'Deckhengst nicht gefunden.' };
    if (x.pendingSettle) return { ok: false, msg: 'Für ' + x.horse.name + ' läuft schon eine Abrechnung (verschickt in Wo. ' + x.pendingSettle.sentWeek + ') — erst bestätigen lassen oder als erledigt markieren.' };
    if (!(x.owed > 0)) return { ok: false, msg: 'Nichts abzurechnen.' };
    const id = Friend.newOfferId();
    x.pendingSettle = { id: id, amount: x.owed, count: x.owedCount || 0, sentWeek: state.week };
    x.owed = 0; x.owedCount = 0;
    const code = Friend.encodePayout(x.friend, state.friendCode, x.pendingSettle.amount, x.pendingSettle.count, x.horse.name, id);
    log('Decktaxe-Abrechnung verschickt: ' + Economy.fmtEur(x.pendingSettle.amount) + ' an ' + x.friend + ' für ' + x.horse.name + ' — wartet auf Bestätigung.', 'info');
    save(); emit();
    return { ok: true, code: code };
  }
  // Hengst-Besitzer: Decktaxe-Abrechnung annehmen -> Geld gutschreiben und
  // eine Quittung erzeugen, die zurück an den Zahler geht.
  function acceptPayout(text) {
    const p = previewCode(text);
    if (!p.ok || p.action !== 'payout') return { ok: false, msg: p.msg || 'Keine gültige Abrechnung.' };
    const d = Friend.decode(text);
    state.cash += d.amount;
    state.stats.totalEarnings += d.amount;
    markRedeemed(d.hash);
    state.paidReceipts = state.paidReceipts || [];
    state.paidReceipts.push({ id: d.id, from: d.from, amount: d.amount, week: state.week });
    if (state.paidReceipts.length > 40) state.paidReceipts.shift();
    const confirmCode = Friend.encodeConfirm('payout', d.id, state.friendCode, d.amount);
    rememberFriend(d.from);
    log('Decktaxe erhalten: ' + Economy.fmtEur(d.amount) + ' von ' + friendLabel(d.from) + ' (' + d.count + ' Bedeckungen). Quittung zurückschicken.', 'good');
    save(); emit();
    return { ok: true, amount: d.amount, confirmCode: confirmCode };
  }
  // Besitzer: Quittung zu einer bereits angenommenen Abrechnung neu erzeugen
  // (falls die erste verloren ging). Kein erneutes Geld.
  function reissueReceipt(text) {
    const p = previewCode(text);
    if (!p.ok || p.action !== 'reissue') return { ok: false, msg: p.msg || 'Dazu gibt es keine bezahlte Abrechnung.' };
    const d = Friend.decode(text);
    const pr = (state.paidReceipts || []).find((x) => x.id === d.id);
    return { ok: true, confirmCode: Friend.encodeConfirm('payout', d.id, state.friendCode, pr.amount) };
  }
  // Zahler: Quittung des Besitzers einlösen -> Abrechnung endgültig schließen.
  function confirmPayout(text) {
    const p = previewCode(text);
    if (!p.ok || p.action !== 'confirm') return { ok: false, msg: p.msg || 'Keine gültige Quittung.' };
    const d = Friend.decode(text);
    const x = (state.friendStuds || []).find((e) => e.pendingSettle && e.pendingSettle.id === d.id);
    if (!x) return { ok: false, msg: 'Keine passende offene Abrechnung.' };
    markRedeemed(d.hash);
    log('Decktaxe-Abrechnung bestätigt: ' + x.friend + ' hat ' + Economy.fmtEur(x.pendingSettle.amount) + ' für ' + x.horse.name + ' erhalten.', 'good');
    x.pendingSettle = null;
    save(); emit();
    return { ok: true };
  }

  function removeHorse(id) {
    state.horses = state.horses.filter((h) => h.id !== id);
    state.saleListings = state.saleListings.filter((s) => s.horseId !== id);
    // aus offenen Turnier-Nennungen entfernen (verkauft/abgegeben vor „Woche weiter")
    (state.shows || []).forEach((sh) => {
      if (sh.entered && sh.entered.indexOf(id) !== -1) sh.entered = sh.entered.filter((x) => x !== id);
    });
  }

  // --- Zucht.
  function planBreeding(sireId, damId) {
    const sr = findSire(sireId);
    const dam = getHorse(damId);
    if (!sr || !dam) return { error: 'Bitte Hengst und Stute wählen.' };
    const sire = sr.horse;
    if (dam.sex !== 'stute') return { error: dam.name + ' ist keine Stute.' };
    if (dam.pregnancy) return { error: dam.name + ' ist bereits trächtig.' };
    if (dam.offered) return { error: dam.name + ' ist in einem Verkaufsangebot.' };
    if (sire.offered) return { error: sire.name + ' ist in einem Verkaufsangebot.' };
    const sy = Model.ageYears(sire, state.week), dy = Model.ageYears(dam, state.week);
    if (sy < Model.MATURITY_YEARS) return { error: sire.name + ' ist mit ' + sy.toFixed(1) + ' Jahren zu jung.' };
    if (dy < Model.MATURITY_YEARS) return { error: dam.name + ' ist mit ' + dy.toFixed(1) + ' Jahren zu jung.' };
    if (dy > Model.MAX_BREED_AGE) return { error: dam.name + ' ist zu alt für die Zucht.' };

    // Freundes-Deckhengst: erst offene Decktaxen abrechnen, wenn zu viele.
    let friendEntry = null;
    if (sr.friend) {
      friendEntry = (state.friendStuds || []).find((x) => x.horse.id === sire.id);
      if (friendEntry && (friendEntry.owed || 0) >= (friendEntry.studFee || 1) * 5) {
        return { error: 'Zu viele offene Bedeckungen bei ' + sire.name + ' — schick erst eine Decktaxe-Abrechnung an ' + sr.friend + ' (Tab Gestüt → Freunde).' };
      }
    }

    const coi = Model.inbreedingCoefficient(sire, dam);
    const forecast = Genetics.foalColorForecast(sire.genotype, dam.genotype);
    const statForecast = Model.foalStatForecast(sire, dam);
    const match = Model.matingMatch(sire, dam);
    const fee = sr.fee;
    // Empfängnis-Wahrscheinlichkeit.
    const vet = Economy.facLevel(state, 'vet');
    let chance = 0.72 * vet.fert * Economy.feedDef(state).fertMult * Economy.seasonFertMult(state.week);
    chance *= clamp(1 - (dy - 12) * 0.05, 0.3, 1);        // Stutenalter
    chance *= clamp(dam.health / 90, 0.5, 1.05);
    chance *= clamp(1 - coi * 0.6, 0.4, 1);               // Inzucht senkt Fruchtbarkeit
    chance = clamp(chance, 0.15, 0.95);

    return {
      sire: sire, dam: dam, external: sr.external, coi: coi,
      friend: sr.friend || null, friendEntry: friendEntry,
      forecast: forecast, statForecast: statForecast, match: match,
      fee: fee, conceiveChance: chance,
      season: Economy.season(state.week), seasonFert: Economy.seasonFertMult(state.week),
    };
  }

  function doBreeding(sireId, damId) {
    const plan = planBreeding(sireId, damId);
    if (plan.error) return { ok: false, msg: plan.error };
    if (state.cash < plan.fee) return { ok: false, msg: 'Deckgebühr ' + Economy.fmtEur(plan.fee) + ' nicht bezahlbar.' };
    state.cash -= plan.fee;
    // Bei einem Freundes-Deckhengst wandert die Gebühr in eine offene
    // Abrechnung an den Besitzer (per Code auszahlbar).
    if (plan.friend && plan.friendEntry) {
      plan.friendEntry.owed = (plan.friendEntry.owed || 0) + plan.fee;
      plan.friendEntry.owedCount = (plan.friendEntry.owedCount || 0) + 1;
      log('Decktaxe ' + Economy.fmtEur(plan.fee) + ' für ' + plan.sire.name + ' geht an ' + plan.friend +
        ' (offen: ' + Economy.fmtEur(plan.friendEntry.owed) + ' aus ' + plan.friendEntry.owedCount + ' Bedeckungen).', 'cost');
    }
    log('Deckakt ' + plan.dam.name + ' × ' + plan.sire.name +
      (plan.external ? ' (Deckstation)' : '') +
      ' - Gebühr ' + Economy.fmtEur(plan.fee) + ', COI ' + (plan.coi * 100).toFixed(1) + '%.', 'cost');

    if (Math.random() > plan.conceiveChance) {
      log('Die Bedeckung war nicht erfolgreich - ' + plan.dam.name + ' ist nicht trächtig geworden.', 'warn');
      save(); emit();
      return { ok: true, conceived: false };
    }
    // Steckbrief des Hengstes einfrieren, damit das Fohlen korrekt erbt.
    plan.dam.pregnancy = {
      sireId: plan.sire.id,
      sireName: plan.sire.name,
      external: !!plan.external,
      sireSnapshot: Model.parentSnapshot(plan.sire),
      weeksLeft: Model.GESTATION_WEEKS,
    };
    log(plan.dam.name + ' ist trächtig! Abfohlung in ' + Model.GESTATION_WEEKS + ' Wochen.', 'good');
    save(); emit();
    return { ok: true, conceived: true };
  }

  function nameFoal(foalId, name) {
    const h = getHorse(foalId);
    if (h && name && name.trim()) { h.name = name.trim(); save(); emit(); }
  }

  // --- Auktion.
  function auctionBid(lotIndex, amount) {
    const lot = state.auction.lots[lotIndex];
    if (!lot) return { ok: false, msg: 'Los nicht gefunden.' };
    if (lot.consignedByPlayer) return { ok: false, msg: 'Auf eigene Lose kannst du nicht bieten.' };
    if (amount > state.cash) return { ok: false, msg: 'Dein Gebot übersteigt dein Guthaben.' };
    const res = Economy.placeBid(lot, amount);
    if (res.ok) { save(); emit(); }
    return res;
  }
  function consignToAuction(horseId, reserve) {
    const h = getHorse(horseId);
    if (!h) return { ok: false, msg: 'Pferd nicht gefunden.' };
    if (h.offered) return { ok: false, msg: h.name + ' ist in einem Freundes-Verkaufsangebot.' };
    if (state.auction.lots.some((l) => l.consignedByPlayer && l.horse.id === horseId)) return { ok: false, msg: 'Bereits in der Auktion.' };
    const est = valuation(h);
    state.auction.lots.push({
      horse: h, estimate: est,
      startBid: Math.round(est * 0.4 / 50) * 50,
      currentBid: Math.round(est * 0.4 / 50) * 50,
      leader: null,
      reserve: Math.max(0, Math.round(reserve || est * 0.6)),
      aiMax: Math.round(est * (0.75 + Math.random() * 0.6) / 50) * 50,
      closed: false,
      consignedByPlayer: true,
    });
    log(h.name + ' in die nächste Auktion eingeliefert (Limit ' + Economy.fmtEur(reserve || est * 0.6) + ').', 'info');
    save(); emit();
    return { ok: true };
  }

  // --- Schauen.
  function enterShow(showId, horseId) {
    const show = state.shows.find((s) => s.id === showId);
    const h = getHorse(horseId);
    if (!show || !h) return { ok: false, msg: 'Schau oder Pferd nicht gefunden.' };
    if (show.done) return { ok: false, msg: 'Schau ist vorbei.' };
    if (show.entered.indexOf(horseId) !== -1) return { ok: false, msg: 'Schon genannt.' };
    const reason = Economy.eligibilityReason(h, show, state.week);
    if (reason) return { ok: false, msg: reason };
    if (state.cash < show.entryFee) return { ok: false, msg: 'Nenngeld nicht bezahlbar.' };
    state.cash -= show.entryFee;
    show.entered.push(horseId);
    (state.sponsors || []).forEach((c) => { c.starts = (c.starts || 0) + 1; });
    log('Genannt: ' + h.name + ' für ' + show.name + ' (Nenngeld ' + Economy.fmtEur(show.entryFee) + ').', 'cost');
    save(); emit();
    return { ok: true };
  }
  function withdrawShow(showId, horseId) {
    const show = state.shows.find((s) => s.id === showId);
    if (!show || show.done) return;
    show.entered = show.entered.filter((id) => id !== horseId);
    save(); emit();
  }

  // --- Leistungsprüfung (Stationsprüfung). Kostet Geld + ~6 Wochen +
  //     Energie, liefert einen Leistungsindex (Grundgangarten, Rittigkeit,
  //     Springen, Charakter). Ab Index 80 gilt sie als bestanden -> Voraussetzung
  //     für die Eintragung ins Zuchtbuch I bei der Körung.
  const LP_COST = 4200;
  const LP_WEEKS = 6;
  function startPerformanceTest(horseId) {
    const h = getHorse(horseId);
    if (!h) return { ok: false, msg: 'Pferd nicht gefunden.' };
    if (h.pendingTest) return { ok: false, msg: h.name + ' ist bereits zur Prüfung angemeldet.' };
    if (h.leistungspruefung) return { ok: false, msg: h.name + ' hat die Prüfung schon abgelegt (Index ' + h.leistungspruefung.index + ').' };
    const y = Model.ageYears(h, state.week);
    if (y < Model.MATURITY_YEARS) return { ok: false, msg: h.name + ' ist zu jung (< 3 Jahre).' };
    if (y > 9) return { ok: false, msg: 'Leistungsprüfungen legt man mit 3–9 Jahren ab.' };
    if (h.pregnancy) return { ok: false, msg: 'Trächtige Stuten nicht zur Prüfung.' };
    if (h.offered) return { ok: false, msg: h.name + ' ist in einem Verkaufsangebot.' };
    if (h.energy < 40) return { ok: false, msg: h.name + ' ist zu erschöpft (Energie < 40).' };
    if (state.cash < LP_COST) return { ok: false, msg: 'Prüfungsgebühr ' + Economy.fmtEur(LP_COST) + ' nicht bezahlbar.' };
    state.cash -= LP_COST;
    h.energy = clamp(h.energy - 20, 0, 100);
    h.pendingTest = { weeksLeft: LP_WEEKS, cost: LP_COST };
    log(h.name + ' zur Leistungsprüfung angemeldet (-' + Economy.fmtEur(LP_COST) + ', Ergebnis in ' + LP_WEEKS + ' Wochen).', 'cost');
    save(); emit();
    return { ok: true };
  }
  function finishPerformanceTest(h) {
    const inr = Model.interieurOf(h), ex = Model.exterieurOf(h);
    const g = (v) => clamp(Math.round(v), 10, 155);
    const gaits = g(0.5 * h.conformation + 0.3 * inr['Rittigkeit'] + 0.2 * ex['Bewegung'] + Model.gauss(0, 8));
    const ride = g(0.4 * inr['Rittigkeit'] + 0.3 * inr['Nervenstärke'] + 0.2 * inr['Lernwille'] + 10 + Model.gauss(0, 8));
    const jump = g(0.5 * Math.max(h.potential.Springen, h.potential.Vielseitigkeit) + 0.2 * ex['Hinterhand'] + Model.gauss(0, 10));
    const char = g(0.4 * inr['Leistungsbereitschaft'] + 0.3 * inr['Umgänglichkeit'] + 0.2 * inr['Nervenstärke'] + 12 + Model.gauss(0, 7));
    const index = clamp(Math.round((gaits + ride + jump + char) / 4 * 1.12), 10, 160);
    h.leistungspruefung = { index: index, gaits: gaits, ride: ride, jump: jump, char: char, week: state.week };
    log('Leistungsprüfung ' + h.name + ' abgeschlossen: Index ' + index + ' (' + (index >= 80 ? 'bestanden' : 'nicht bestanden') +
      ') — GGA ' + gaits + ', Rittigkeit ' + ride + ', Springen ' + jump + ', Charakter ' + char + '.', index >= 80 ? 'good' : 'warn');
  }

  // --- Der Wochen-Tick ---------------------------------------------------
  function advanceWeek() {
    const arena = Economy.facLevel(state, 'arena');
    const vet = Economy.facLevel(state, 'vet');
    const mkt = Economy.facLevel(state, 'marketing');
    const feed = Economy.feedDef(state);
    const care = Economy.careDef(state);
    state.week += 1;

    // 0) Angebot & Nachfrage driften lassen (+ evtl. Markttrend).
    const trend = Economy.driftDemand(state);
    if (trend) log('📈 ' + trend, 'info');

    // 0b) Jahreszeitenwechsel.
    const seas = Economy.season(state.week);
    if (seas.idx !== state.lastSeasonIdx) {
      state.lastSeasonIdx = seas.idx;
      const note = seas.idx === 0 ? ' — Decksaison: Empfängnis deutlich wahrscheinlicher.'
        : seas.idx === 3 ? ' — Winter: höhere Futterkosten, weniger Turniere, Empfängnis unwahrscheinlicher.'
        : seas.idx === 1 ? ' — Sommer: Weidegang, mehr Turniere.' : '.';
      log(seas.icon + ' ' + seas.name + ' beginnt' + note, 'info');
    }
    const staffEvent = Economy.staffEventMult(state);

    // 1) Alterung, Energie, Training, Gesundheit.
    const births = [];
    state.horses.forEach((h) => {
      const y = Model.ageYears(h, state.week);
      const grazing = !!h.onPasture && Economy.season(state.week).idx !== 3;   // Winter: keine Weidewirkung
      // Energie (abhängig von Fütterung + Jahreszeit + Weidegang)
      h.energy = clamp(h.energy + feed.energyRegen + Economy.seasonEnergyBonus(state.week) + (grazing ? 3 : 0), 0, 100);
      // Leichte Gesundheits-Regeneration durch gutes Futter / Weidegang
      if ((feed.healthRegen || grazing) && h.health < 100 && h.health > 25) {
        Model.adjustHealth(h, (feed.healthRegen || 0) + (grazing ? 0.4 : 0));
      }
      // Intensive Pflege hebt langsam eine Interieur-Einzelnote; Weidegang
      // (Herdenleben) hebt bevorzugt Nervenstärke/Umgänglichkeit.
      const interieurTick = (care.interieurDrift && Math.random() < care.interieurDrift) || (grazing && Math.random() < 0.06);
      if (interieurTick && h.interieur) {
        const pool = grazing ? ['Nervenstärke', 'Umgänglichkeit'] : Model.INTERIEUR_TRAITS;
        const t = pool[Model.randInt(0, pool.length - 1)];
        h.interieur[t] = clamp(h.interieur[t] + 1, 10, 99);
        h.temperament = clamp(Math.round(Model.INTERIEUR_TRAITS.reduce((s, k) => s + h.interieur[k], 0) / Model.INTERIEUR_TRAITS.length), 10, 99);
      }
      // Kleines Verletzungsrisiko auf der Koppel (Tritt in der Herde).
      if (grazing && Math.random() < 0.015) {
        Model.injureHealth(h, Model.randInt(2, 7), ['Fundament & Sehnen']);
        log('🌾 ' + h.name + ' hat sich auf der Koppel eine leichte Blessur geholt.', 'warn');
      }
      // Wochen-Trainingsplan abarbeiten (bis zu 6 Einheiten). Pferde in
      // einem Verkaufsangebot trainieren nicht.
      const plan = h.offered ? [] : (h.trainingPlan || []).filter((d) => d && DISC.indexOf(d) !== -1);
      const restSlots = 6 - plan.length;
      h.energy = clamp(h.energy + restSlots * 5, 0, 100);           // Ruhetage erholen extra
      if (y >= Model.MATURITY_YEARS && !(h.pregnancy && h.pregnancy.weeksLeft < 8)) {
        let skipped = 0, injured = false;
        plan.forEach((d) => {
          if (injured) return;
          if (h.energy < 25) { skipped++; return; }
          // Übertraining: hartes Training bei niedriger Energie kann eine
          // Sehnen-/Fundament-Verletzung auslösen.
          if (h.energy < 38 && Math.random() < 0.05) {
            Model.injureHealth(h, Model.randInt(5, 12), ['Fundament & Sehnen']);
            h.energy = clamp(h.energy - 8, 0, 100);
            injured = true;
            log('⚠️ ' + h.name + ' hat sich bei erschöpfendem Training eine Sehnenreizung zugezogen — Trainingspause.', 'warn');
            return;
          }
          const gap = h.potential[d] - h.skill[d];
          if (gap > 0.2) {
            const rate = 0.46 * arena.mult * feed.trainMult
              * Economy.staffTrainBonus(state, d) * Economy.seasonTrainMult(state.week)
              * (grazing ? 0.8 : 1)
              * clamp(gap / 40, 0.15, 1)
              * clamp(h.interieur ? (Model.interieurOf(h)['Lernwille'] + Model.interieurOf(h)['Rittigkeit']) / 140 : h.temperament / 70, 0.5, 1.2)
              * Model.ageFactor(y)
              * clamp(h.health / 90, 0.55, 1)
              * clamp(h.energy / 60, 0.4, 1.1);
            h.skill[d] = clamp(h.skill[d] + rate, 0, h.potential[d]);
          }
          h.energy = clamp(h.energy - 12, 0, 100);
        });
        if (skipped > 0 && plan.length) {
          log(h.name + ' war zu erschöpft für ' + skipped + ' Trainingseinheit' + (skipped > 1 ? 'en' : '') + ' - mehr Ruhetage einplanen.', 'warn');
        }
      }
      // Leistungsprüfung / Stationsprüfung läuft ab.
      if (h.pendingTest) {
        h.pendingTest.weeksLeft -= 1;
        if (h.pendingTest.weeksLeft <= 0) { finishPerformanceTest(h); h.pendingTest = null; }
      }
      // Altersbedingter Substanzverlust (durch gute Pflege gebremst)
      if (y > 16) Model.injureHealth(h, Model.gauss(0.4, 0.3) * care.ageHealthMult, ['Fundament & Sehnen', 'Herz-Kreislauf', 'Hufe']);
      if (y > 26 && Math.random() < 0.06) {
        log(h.name + ' ist im Alter von ' + y.toFixed(0) + ' Jahren friedlich eingeschlafen.', 'warn');
        payLifeInsurance(h, 'Alter');
        h._dead = true;
      }
      // Trächtigkeit
      if (h.pregnancy) {
        h.pregnancy.weeksLeft -= 1;
        if (h.pregnancy.weeksLeft <= 0) births.push(h);
      }
    });
    // Tote entfernen
    state.horses.filter((h) => h._dead).forEach((h) => removeHorse(h.id));

    // 2) Geburten.
    births.forEach((dam) => {
      // Bevorzugt der bei der Bedeckung eingefrorene Steckbrief; sonst der
      // Hengst im Stall; sonst (alte Spielstände) ein grober Platzhalter.
      const sire = dam.pregnancy.sireSnapshot
        || getHorse(dam.pregnancy.sireId)
        || {
          id: dam.pregnancy.sireId, name: dam.pregnancy.sireName, sex: 'hengst',
          breed: dam.breed, genotype: dam.genotype, potential: dam.potential, conformation: dam.conformation,
          temperament: dam.temperament, quality: dam.quality, ancestors: {}, skill: {},
        };
      const result = Model.breed(sire, dam, state.week);
      dam.pregnancy = null;
      if (!result.alive) {
        log('Bei ' + dam.name + ' kam ein Fohlen tot zur Welt: ' + result.reason, 'warn');
        return;
      }
      // --- Geburtskomplikationen. Risiko steigt mit Stutenalter, niedriger
      //     Gesundheit und COI; die Tierarzt-Anlage senkt es deutlich.
      const dY = Model.ageYears(dam, state.week);
      let compRisk = 0.04 + Math.max(0, dY - 14) * 0.02 + Math.max(0, (75 - dam.health)) * 0.004 + result.coi * 0.5;
      compRisk *= [1, 0.7, 0.45][state.facilities.vet || 0];
      compRisk *= Economy.staffVetMult(state);
      const cRoll = Math.random();
      if (cRoll < compRisk * 0.28 && dam.health < 40) {
        // sehr selten: die Stute überlebt die Geburt nicht.
        log('💔 ' + dam.name + ' ist bei einer schweren Geburt gestorben. Das Fohlen konnte gerettet werden.', 'warn');
        payLifeInsurance(dam, 'Geburt');
        dam._dead = true;
        removeHorse(dam.id);
      } else if (cRoll < compRisk * 0.5) {
        log('💔 ' + dam.name + ' hat verfohlt (Abort). Kein lebendes Fohlen.', 'warn');
        Model.injureHealth(dam, Model.randInt(3, 9), ['Immunsystem']);
        return;
      } else if (cRoll < compRisk) {
        const bill = Math.round((500 + Model.randInt(0, 1200)) * Economy.staffVetMult(state));
        state.cash -= bill;
        claimVetInsurance(dam, bill);
        Model.injureHealth(dam, Model.randInt(4, 10), ['Herz-Kreislauf']);
        result.foal._complication = Model.randInt(6, 16);
        log('Schwergeburt bei ' + dam.name + ' — Tierarzt -' + Economy.fmtEur(bill) + ', Stute und Fohlen angeschlagen.', 'warn');
      }
      const foal = result.foal;
      Model.adjustHealth(foal, vet.foalHealth + feed.foalHealth - (foal._complication || 0));
      delete foal._complication;
      foal.name = foalName();
      state.stats.foalsBred += 1;
      // Vererber-Rating fortschreiben (nur solange die Eltern im Stall sind).
      const sireHerd = sire && sire.id ? getHorse(sire.id) : null;
      [sireHerd, dam].forEach((p) => { if (p && p.foalsBred != null) { p.foalsBred += 1; p.foalQualSum = (p.foalQualSum || 0) + foal.quality; } });
      if (Game.stallFree() >= 1) {
        state.horses.push(foal);
        log('Geburt: ' + dam.name + ' hat ein ' + (foal.sex === 'hengst' ? 'Hengstfohlen' : 'Stutfohlen') + ' - "' + foal.name + '" (' + Genetics.describe(foal.genotype, 0).display + ', COI ' + (result.coi * 100).toFixed(1) + '%).', 'good');
      } else {
        const v = Math.round(Model.valuation(foal, state.week, Economy.prestigeMult(state)) * 0.7);
        state.cash += v;
        log('Geburt: "' + foal.name + '" - kein Stallplatz frei, Fohlen direkt für ' + Economy.fmtEur(v) + ' verkauft.', 'info');
      }
    });

    // 3) Verkaufslistings abwickeln. Käufer richten sich nach dem, was der
    //    Markt gerade zahlt (Schätzwert × Nachfrage im Segment).
    const stillListed = [];
    state.saleListings.forEach((s) => {
      const h = getHorse(s.horseId);
      if (!h) return;
      s.weeks += 1;
      const ref = marketPrice(h);
      const ratio = s.price / Math.max(1, ref);
      let p = clamp(0.55 / Math.pow(ratio, 2.2), 0.02, 0.9) * mkt.saleSpeed * Economy.staffSalesMult(state);
      p = clamp(p + s.weeks * 0.03, 0, 0.95);
      if (Math.random() < p) {
        const paid = Math.round(s.price * mkt.priceMult * (1 + (Economy.staffSalesMult(state) - 1) * 0.5));
        state.cash += paid;
        state.stats.horsesSold += 1;
        state.stats.totalEarnings += paid;
        recordSale(h.name, paid);
        Economy.applySaleImpact(state, h);
        log('Verkauft: ' + h.name + ' für ' + Economy.fmtEur(paid) + ' (nach ' + s.weeks + ' Wochen).', 'good');
        removeHorse(s.horseId);
      } else {
        stillListed.push(s);
      }
    });
    state.saleListings = stillListed;

    // 4) Schauen abwickeln (alle offenen mit Spielerbeteiligung laufen sofort,
    //    danach neuer Kalender).
    state.shows.forEach((show) => {
      if (show.done) return;
      if (show.entered.length > 0) {
        const r = Economy.runShow(state, show);
        state.cash += r.totalPrize - (r.travelCost || 0);
        state.prestige += r.prestigeGain;
        state.stats.totalEarnings += r.totalPrize;
        const mine = r.results.filter((x) => x.player).sort((a, b) => a.place - b.place);
        const best = mine[0];
        if (best) {
          state.stats.showWins += mine.filter((x) => x.place === 1).length;
          if (r.totalPrize > (state.stats.biggestWin || 0)) state.stats.biggestWin = r.totalPrize;
          log('🏆 ' + show.name + ': bestes eigenes Pferd Platz ' + best.place + '/' + r.results.length +
            ' (' + best.scoreLabel + '). Preisgeld ' + Economy.fmtEur(r.totalPrize) +
            (r.travelCost ? ', Reise -' + Economy.fmtEur(r.travelCost) : '') + ', +' + r.prestigeGain + ' Prestige.', 'good');
          show._playerResults = mine;
          show._allResults = r.results;
          state.showResults = state.showResults || [];
          state.showResults.unshift({ week: state.week, name: show.name, results: r.results.slice(0, 12) });
          if (state.showResults.length > 10) state.showResults.pop();
        }
      }
    });

    // 5) Auktion abschließen, wenn fällig.
    if (state.week >= state.auction.nextWeek) {
      const results = Economy.closeAuction(state, state.auction.lots);
      results.forEach((res) => {
        const h = res.lot.horse;
        if (res.type === 'buy' && res.sold) {
          if (Game.stallFree() >= 1 && state.cash >= res.amount) {
            state.cash -= res.amount;
            h.acquiredWeek = state.week; h.origin = 'Auktion';
            state.horses.push(h);
            log('Auktion: ' + h.name + ' für ' + Economy.fmtEur(res.amount) + ' ersteigert.', 'cost');
          } else {
            log('Auktion: Zuschlag für ' + h.name + ' verfällt (kein Platz oder kein Geld).', 'warn');
          }
        } else if (res.type === 'consign') {
          if (res.sold) {
            state.cash += res.amount;
            state.stats.horsesSold += 1;
            state.stats.totalEarnings += res.amount;
            recordSale(h.name, res.amount);
            Economy.applySaleImpact(state, h);
            removeHorse(h.id);
            log('Auktion: ' + h.name + ' für ' + Economy.fmtEur(res.amount) + ' verkauft.', 'good');
          } else {
            log('Auktion: ' + h.name + ' blieb unter Limit und kommt zurück in den Stall.', 'warn');
          }
        }
      });
      state.auction.lots = Economy.rollAuction(state);
      state.auction.nextWeek = state.week + 4;
    }

    // 6) Markt, Deckstation & Schaukalender periodisch erneuern.
    if (state.week >= state.nextMarketWeek) {
      state.market = Economy.rollMarket(state);
      state.nextMarketWeek = state.week + 2;
    }
    if (state.week >= (state.nextStudWeek || 0)) {
      state.studRoster = Economy.rollStudRoster(state);
      state.nextStudWeek = state.week + 6;
    }
    if (state.week >= (state.nextStaffWeek || 0)) {
      state.staffMarket = Economy.rollStaffMarket(state);
      state.nextStaffWeek = state.week + 8;
    }
    if (state.week >= (state.nextSponsorWeek || 0)) {
      const offers = Economy.rollSponsorOffers(state);
      if (offers.length) {
        state.sponsorOffers = offers;
        log('💼 Neue Sponsoren-Angebote (Tab Gestüt).', 'info');
      }
      state.nextSponsorWeek = state.week + 10;
    }
    // Zuchtaufträge: abgelaufene entfernen, Liste periodisch auffüllen.
    const keptOrders = [];
    (state.breedingOrders || []).forEach((o) => {
      if (state.week >= o.deadlineWeek) {
        state.prestige = Math.max(0, state.prestige - 4);
        log('🎯 Zuchtauftrag von ' + o.client + ' ausgelaufen (nicht erfüllt) — −4 Prestige.', 'warn');
      } else keptOrders.push(o);
    });
    state.breedingOrders = keptOrders;
    if (state.week >= (state.nextOrderWeek || 0)) {
      const before = state.breedingOrders.length;
      state.breedingOrders = Economy.rollBreedingOrders(state, state.breedingOrders);
      state.nextOrderWeek = state.week + 9;
      if (state.breedingOrders.length > before) log('🎯 Neue Zuchtaufträge (Tab Gestüt).', 'info');
    }

    // Sponsoren: Wochenzahlung + Vertragsende.
    const stillActive = [];
    (state.sponsors || []).forEach((c) => {
      state.cash += c.weeklyPay;
      c.weeksLeft -= 1;
      if (c.weeksLeft > 0) { stillActive.push(c); return; }
      if ((c.starts || 0) >= c.reqStarts) {
        state.cash += c.bonus;
        state.prestige += 10;
        log('💼 Sponsorenvertrag ' + c.name + ' erfüllt: Abschlussbonus +' + Economy.fmtEur(c.bonus) + ', +10 Prestige.', 'good');
      } else {
        state.prestige = Math.max(0, state.prestige - 6);
        log('💼 Sponsorenvertrag ' + c.name + ' ausgelaufen — Startauflage (' + c.starts + '/' + c.reqStarts + ') verfehlt, kein Bonus.', 'warn');
      }
    });
    state.sponsors = stillActive;

    // Versicherungsprämien (je versichertem Pferd, wertabhängig).
    const premiums = Economy.insurancePremiums(state);
    if (premiums > 0) {
      state.cash -= premiums;
      log('🛡️ Versicherungsprämien: -' + Economy.fmtEur(premiums) + '.', 'cost');
    }

    // Pensionsstall: Wocheneinnahme je Gastbox (belegt echte Stallplätze).
    if (state.boarding > 0) {
      const bi = state.boarding * Economy.boardIncomePerBox(state);
      state.cash += bi;
      log('🏨 Pensionsstall: +' + Economy.fmtEur(bi) + ' (' + state.boarding + ' Gastbox' + (state.boarding === 1 ? '' : 'en') + ').', 'good');
      if (Math.random() < 0.06) {
        const bill = 200 + Model.randInt(0, 500);
        state.cash -= bill;
        log('🏨 Ein Pensionspferd wurde krank — Tierarzt/Kulanz -' + Economy.fmtEur(bill) + '.', 'cost');
      }
    }

    // Eigene Deckstation: fremde Zuchtstuten buchen angebotene Hengste.
    state.horses.forEach((h) => {
      if (!h.studService || Model.approvalRank(h.zuchtzulassung) < 2) return;
      let lam = Economy.studServiceBookings(state, h);
      let n = 0;
      while (lam > 0) { if (Math.random() < Math.min(lam, 1)) n++; lam -= 1; }
      if (n <= 0) return;
      const net = Math.round(n * h.studService.fee * 0.92);   // 8 % Vermittlung
      state.cash += net;
      state.stats.totalEarnings += net;
      h.studService.bookings = (h.studService.bookings || 0) + n;
      h.studService.income = (h.studService.income || 0) + net;
      h.energy = clamp(h.energy - n * 4, 0, 100);
      state.prestige += n * 0.4;
      log('🐴 Deckstation: ' + h.name + ' hat ' + n + ' fremde Stute' + (n === 1 ? '' : 'n') + ' gedeckt — +' + Economy.fmtEur(net) + '.', 'good');
    });

    // Rivalen-Gestüte entwickeln sich; am Jahresende das Championat.
    Economy.advanceRivals(state);
    if (state.week > 0 && state.week % Model.WEEKS_PER_YEAR === 0) {
      const jcs = Economy.runJungChampionship(state);
      const jWins = Model.DISC.filter((d) => jcs.disciplines[d]);
      if (jWins.length) {
        state.stats.totalEarnings += jcs.playerPrize;
        log('🐴🏆 BUNDESCHAMPIONAT DER JUNGPFERDE ' + jcs.year + ' — ' +
          jWins.map((d) => d + ': ' + jcs.disciplines[d]).join(' · ') +
          '. Preisgeld ' + Economy.fmtEur(jcs.playerPrize) + ', +' + Math.round(jcs.playerPrestige) + ' Prestige.', 'good');
      }
      const cs = Economy.runChampionship(state);
      state.stats.totalEarnings += cs.playerPrize;
      log('🏆 JAHRES-CHAMPIONAT ' + cs.year + ' — Gestüts-Champion: ' + (cs.overall || '—') +
        '. Deine Championats-Preisgelder: ' + Economy.fmtEur(cs.playerPrize) + ', +' + Math.round(cs.playerPrestige) + ' Prestige. Saisonpunkte zurückgesetzt.', 'good');
      Model.DISC.forEach((d) => { if (cs.disciplines[d]) log('   Championat ' + d + ': ' + cs.disciplines[d], 'info'); });
    }
    if (state.shows.every((s) => s.done) || state.week >= state.nextShowWeek) {
      state.shows = Economy.rollShows(state);
      state.nextShowWeek = state.week + 3;
    }

    // 7) Zufallsereignisse (selten).
    maybeRandomEvent();

    // 7b) Routinebehandlungen: Hufschmied + Wurmkur/Impfung.
    if (state.horses.length) {
      if (state.week >= (state.nextFarrierWeek || 0)) {
        const bill = state.horses.length * Economy.FARRIER_COST;
        if (state.cash >= bill) {
          state.cash -= bill;
          log('Hufschmied für alle ' + state.horses.length + ' Pferde: -' + Economy.fmtEur(bill) + '.', 'cost');
        } else {
          state.horses.forEach((h) => Model.injureHealth(h, Model.gauss(2.2, 0.8), ['Hufe']));
          log('⚠️ Hufschmied konnte nicht bezahlt werden — die Hufe leiden.', 'warn');
        }
        state.nextFarrierWeek = state.week + Economy.FARRIER_EVERY;
      }
      if (state.week >= (state.nextVetRoutineWeek || 0)) {
        const bill = Math.round(state.horses.length * Economy.VETROUTINE_COST * Economy.staffVetMult(state));
        if (state.cash >= bill) {
          state.cash -= bill;
          log('Wurmkur & Impfung, ganzer Bestand: -' + Economy.fmtEur(bill) + '.', 'cost');
        } else {
          state.horses.forEach((h) => Model.injureHealth(h, Model.gauss(2.5, 1), ['Immunsystem']));
          log('⚠️ Wurmkur/Impfung ausgelassen — das Immunsystem sinkt.', 'warn');
        }
        state.nextVetRoutineWeek = state.week + Economy.VETROUTINE_EVERY;
      }
    }

    // 8) Unterhalt abziehen (Anlagen + Futter (netto Lager/Weide) + Pflege + Personal).
    const fromStock = Economy.feedFromStock(state);
    const feedCostThisWeek = Economy.weeklyFeedCost(state);
    const upkeep = Economy.weeklyUpkeep(state);
    state.cash -= upkeep;
    if (fromStock > 0) {
      const emptyBefore = (state.feedStock || 0) - fromStock <= 0;
      state.feedStock = Math.max(0, (state.feedStock || 0) - fromStock);
      log('🌾 Futter-Lager: ' + fromStock.toFixed(1) + ' Pferdewochen entnommen — Vorrat noch ' + Math.round(state.feedStock) + '.', 'info');
      if (emptyBefore) log('🌾 Das Futter-Lager ist leer — ab jetzt wieder Wocheneinkauf zum Normalpreis.', 'warn');
    }
    log('Wochenunterhalt: -' + Economy.fmtEur(upkeep) + ' (Futter ' + Economy.fmtEur(feedCostThisWeek) +
      ' + Pflege + Anlagen + Personal).', 'cost');

    // 8b) Kredit-Zinsen.
    if (state.debt > 0) {
      const interest = Math.max(1, Math.round(state.debt * Economy.LOAN_RATE));
      state.debt += interest;
      state.cash -= interest;
      log('Kreditzinsen: -' + Economy.fmtEur(interest) + ' (Restschuld ' + Economy.fmtEur(state.debt) + ').', 'cost');
    }

    // 9) Prestige-Zerfall + Bankrott-Warnung + Verlaufs-Stichprobe.
    state.prestige = Math.max(0, state.prestige - 0.5);
    if (state.cash < 0) {
      log('⚠️ Dein Konto ist im Minus (' + Economy.fmtEur(state.cash) + '). Verkaufe Pferde oder nimm einen Kredit auf.', 'warn');
    }
    const herdVal = state.horses.reduce((s, h) => s + valuation(h), 0);
    state.history = state.history || [];
    state.history.push({ week: state.week, cash: Math.round(state.cash), herd: Math.round(herdVal),
      prestige: Math.round(state.prestige), debt: Math.round(state.debt), horses: state.horses.length });
    if (state.history.length > 260) state.history.shift();

    save();
    emit();
    return { week: state.week };
  }

  function maybeRandomEvent() {
    if (Math.random() > 0.35) return;
    const care = Economy.careDef(state);
    const roll = Math.random();
    const horses = state.horses.filter((h) => !h.pregnancy);
    // Krankheits-/Verletzungsrisiko: durch gute Pflege gesenkt, durch
    // schlechte erhöht (care.eventMult).
    if (roll < 0.3 * care.eventMult * Economy.staffEventMult(state) && state.horses.length) {
      const h = state.horses[Model.randInt(0, state.horses.length - 1)];
      // Weidepferde (frische Luft, Bewegung) stecken kleinere Infekte oft weg.
      if (h.onPasture && Economy.season(state.week).idx !== 3 && Math.random() < 0.4) {
        return;
      }
      const bill = Math.round((300 + Model.randInt(0, 900)) * Economy.staffVetMult(state));
      state.cash -= bill;
      claimVetInsurance(h, bill);
      const ailments = [
        { key: ['Atemwege'], name: 'einen Atemwegsinfekt' },
        { key: ['Immunsystem', 'Herz-Kreislauf'], name: 'eine Kolik' },
        { key: ['Fundament & Sehnen'], name: 'eine Sehnenreizung' },
        { key: ['Hufe'], name: 'ein Hufgeschwür' },
      ][Model.randInt(0, 3)];
      Model.injureHealth(h, Model.randInt(4, 14), ailments.key);
      log('Tierarzt: ' + h.name + ' hatte ' + ailments.name + '. Behandlung -' + Economy.fmtEur(bill) + '.', 'cost');
    } else if (roll < 0.55 && horses.length) {
      const h = horses[Model.randInt(0, horses.length - 1)];
      const offer = Math.round(marketPrice(h) * (1.05 + Math.random() * 0.35));
      state._pendingOffer = { horseId: h.id, price: offer, week: state.week };
      log('💌 Ein Interessent bietet ' + Economy.fmtEur(offer) + ' für ' + h.name + ' (Tab "Stall" -> Angebot annehmen).', 'info');
    } else if (roll < 0.75) {
      const bonus = 500 + Model.randInt(0, 1500);
      state.cash += bonus;
      log('Ein Sponsor unterstützt dein Gestüt mit ' + Economy.fmtEur(bonus) + '.', 'good');
    } else if (horses.length) {
      const h = horses[Model.randInt(0, horses.length - 1)];
      Model.ensureTraits(h);
      const t = Model.INTERIEUR_TRAITS[Model.randInt(0, Model.INTERIEUR_TRAITS.length - 1)];
      h.interieur[t] = clamp(h.interieur[t] + Model.randInt(3, 7), 10, 99);
      h.temperament = clamp(Math.round(Model.INTERIEUR_TRAITS.reduce((s, k) => s + h.interieur[k], 0) / Model.INTERIEUR_TRAITS.length), 10, 99);
      log(h.name + ' hat sich charakterlich gut entwickelt (+' + t + ').', 'good');
    }
  }

  function acceptPendingOffer() {
    const o = state._pendingOffer;
    if (!o) return { ok: false };
    const h = getHorse(o.horseId);
    if (!h) { state._pendingOffer = null; return { ok: false }; }
    state.cash += o.price;
    state.stats.horsesSold += 1;
    state.stats.totalEarnings += o.price;
    recordSale(h.name, o.price);
    Economy.applySaleImpact(state, h);
    removeHorse(o.horseId);
    log('Angebot angenommen: ' + h.name + ' für ' + Economy.fmtEur(o.price) + ' verkauft.', 'good');
    state._pendingOffer = null;
    save(); emit();
    return { ok: true, amount: o.price };
  }
  function declinePendingOffer() { state._pendingOffer = null; save(); emit(); }

  // --- Offene To-dos vor dem Wochenwechsel.
  function weeklyTodos() {
    const t = [];
    const adults = state.horses.filter((h) => Model.ageYears(h, state.week) >= Model.MATURITY_YEARS);

    const noPlan = adults.filter((h) => !(h.trainingPlan || []).some((d) => d));
    if (noPlan.length) t.push({ icon: '🏋️', tab: 'stall', kind: 'info',
      text: noPlan.length + ' Pferd' + (noPlan.length > 1 ? 'e' : '') + ' ohne Trainingsplan (' + noPlan.slice(0, 3).map((h) => h.name).join(', ') + (noPlan.length > 3 ? ' …' : '') + ')' });

    const openMares = state.horses.filter((h) => h.sex === 'stute' && !h.pregnancy &&
      Model.ageYears(h, state.week) >= Model.MATURITY_YEARS && Model.ageYears(h, state.week) <= Model.MAX_BREED_AGE);
    if (openMares.length) t.push({ icon: '🧬', tab: 'zucht', kind: 'info',
      text: openMares.length + ' deckbereite Stute' + (openMares.length > 1 ? 'n sind' : ' ist') + ' nicht tragend' });

    let showsOpen = 0;
    state.shows.forEach((show) => {
      if (show.done || show.entered.length) return;
      if (adults.some((h) => !Economy.eligibilityReason(h, show, state.week))) showsOpen++;
    });
    if (showsOpen) t.push({ icon: '🏆', tab: 'schauen', kind: 'info',
      text: showsOpen + ' Turnier' + (showsOpen > 1 ? 'e' : '') + ', bei dem du starten könntest, ohne Nennung' });

    const outbid = (state.auction.lots || []).filter((l) => !l.consignedByPlayer && l.leader === 'ai').length;
    if (outbid) t.push({ icon: '🔨', tab: 'auktion', kind: 'warn',
      text: 'Bei ' + outbid + ' Auktionslos' + (outbid > 1 ? 'en' : '') + ' wurdest du überboten' });

    if (state._pendingOffer && getHorse(state._pendingOffer.horseId)) {
      t.push({ icon: '💌', tab: 'stall', kind: 'info',
        text: 'Kaufangebot für ' + getHorse(state._pendingOffer.horseId).name + ' (' + Economy.fmtEur(state._pendingOffer.price) + ') offen' });
    }

    const overpriced = state.saleListings.filter((s) => {
      const h = getHorse(s.horseId); return h && s.price > marketPrice(h) * 1.25;
    }).length;
    if (overpriced) t.push({ icon: '🏷️', tab: 'markt', kind: 'info',
      text: overpriced + ' Verkaufsangebot' + (overpriced > 1 ? 'e' : '') + ' deutlich über Marktwert (verkauft sich kaum)' });

    if (state.cash < 3000) t.push({ icon: '⚠️', tab: 'gestüt', kind: 'warn',
      text: 'Kasse niedrig (' + Economy.fmtEur(state.cash) + ') — Wochenunterhalt läuft weiter' });

    const sick = state.horses.filter((h) => h.health < 55).length;
    if (sick) t.push({ icon: '🩺', tab: 'stall', kind: 'warn',
      text: sick + ' Pferd' + (sick > 1 ? 'e' : '') + ' mit angeschlagener Gesundheit (< 55)' });

    if ((state.pendingOffers || []).length) t.push({ icon: '👥', tab: 'gestüt', kind: 'info',
      text: (state.pendingOffers.length) + ' Verkaufsangebot' + (state.pendingOffers.length > 1 ? 'e warten' : ' wartet') + ' auf ein Kaufgebot' });
    if ((state.pendingPurchases || []).length) t.push({ icon: '👥', tab: 'gestüt', kind: 'info',
      text: 'Du wartest auf ' + state.pendingPurchases.length + ' Lieferung' + (state.pendingPurchases.length > 1 ? 'en' : '') + ' von Freunden' });
    const debt = (state.friendStuds || []).reduce((sum, x) => sum + (x.owed || 0), 0);
    if (debt > 0) t.push({ icon: '💶', tab: 'gestüt', kind: 'info',
      text: 'Offene Decktaxe an Freunde: ' + Economy.fmtEur(debt) + ' — Abrechnungs-Code erstellen' });

    const ungekört = state.horses.filter((h) => h.sex === 'hengst' && !h.noPapers && !h.isMix &&
      Model.ageYears(h, state.week) >= Model.MATURITY_YEARS && Model.approvalRank(h.zuchtzulassung) < 2);
    if (ungekört.length) t.push({ icon: '📜', tab: 'stall', kind: 'info',
      text: ungekört.length + ' Hengst' + (ungekört.length > 1 ? 'e' : '') + ' ohne Körung/Zuchtzulassung — Fohlen bekommen sonst keine Papiere' });
    const inTest = state.horses.filter((h) => h.pendingTest);
    inTest.forEach((h) => t.push({ icon: '🎓', tab: 'stall', kind: 'info',
      text: 'Leistungsprüfung ' + h.name + ' — noch ' + h.pendingTest.weeksLeft + ' Wochen' }));
    const champIn = Model.WEEKS_PER_YEAR - (state.week % Model.WEEKS_PER_YEAR);
    if (champIn <= 4 && champIn > 0) {
      const q = Economy.championshipQualified(state);
      const nQual = Object.keys(q).reduce((n, d) => n + (q[d].length ? 1 : 0), 0);
      t.push({ icon: '🏆', tab: 'schauen', kind: 'info',
        text: 'Jahres-Championat in ' + champIn + ' Woche' + (champIn > 1 ? 'n' : '') + ' — in ' + nQual + ' Disziplin(en) qualifiziert' });
      const jq = Economy.jungChampionshipQualified(state);
      const nJ = Object.keys(jq).reduce((n, d) => n + (jq[d].length ? 1 : 0), 0);
      if (nJ) t.push({ icon: '🐴', tab: 'schauen', kind: 'info',
        text: 'Bundeschampionat der Jungpferde in ' + champIn + ' Woche' + (champIn > 1 ? 'n' : '') + ' — in ' + nJ + ' Disziplin(en) qualifiziert' });
    }
    (state.breedingOrders || []).forEach((o) => {
      const left = o.deadlineWeek - state.week;
      const canDo = state.horses.some((h) => !h.offered && !h.pregnancy && Economy.orderMatch(o, h, state.week).ok);
      if (canDo) t.push({ icon: '🎯', tab: 'gestüt', kind: 'info',
        text: 'Zuchtauftrag ' + o.client + ' (' + Economy.fmtEur(o.reward) + ') mit einem Pferd im Bestand erfüllbar' });
      else if (left <= 3) t.push({ icon: '🎯', tab: 'gestüt', kind: 'warn',
        text: 'Zuchtauftrag ' + o.client + ' läuft in ' + left + ' Woche' + (left === 1 ? '' : 'n') + ' aus' });
    });

    const untested = state.horses.filter((h) => h.genoTested === false &&
      Model.ageYears(h, state.week) >= Model.MATURITY_YEARS && !h.offered);
    if (untested.length) t.push({ icon: '🔬', tab: 'stall', kind: 'info',
      text: untested.length + ' erwachsene' + (untested.length > 1 ? ' Pferde' : 's Pferd') + ' ohne Farbtest — verdeckte Farbträger vor der Zuchtplanung prüfen' });

    const bigUninsured = state.horses.filter((h) => !h.insurance && !h.offered &&
      Game.valuation(h) >= 20000 && Model.ageYears(h, state.week) <= 20 && h.health >= 40);
    if (bigUninsured.length) t.push({ icon: '🛡️', tab: 'stall', kind: 'info',
      text: bigUninsured.length + ' wertvolle' + (bigUninsured.length > 1 ? ' Pferde' : 's Pferd') + ' (≥ 20.000 €) ohne Versicherung' });

    if (Economy.siloCapacity(state) > 0 && (state.feedStock || 0) <= 0 && state.horses.length) {
      t.push({ icon: '🌾', tab: 'gestüt', kind: 'info', text: 'Futter-Lager leer — Mengeneinkauf spart ' + Math.round((1 - Economy.FEED_BULK_DISCOUNT) * 100) + ' %' });
    }
    const freePaddocks = Economy.pastureSlots(state) - Economy.pastureUsed(state);
    if (freePaddocks >= 2 && Economy.pastureUsed(state) === 0 && state.horses.length >= 3) {
      t.push({ icon: '🌾', tab: 'stall', kind: 'info', text: freePaddocks + ' freie Koppelplätze — Weidegang senkt Futterkosten und erholt' });
    }

    const freeSlots = Economy.stallCapacity(state) - state.horses.length - (state.boarding || 0);
    if (freeSlots >= 3 && !(state.boarding > 0)) t.push({ icon: '🏨', tab: 'gestüt', kind: 'info',
      text: freeSlots + ' freie Stallplätze — Pensionsstall bringt passives Wocheneinkommen' });

    const unconfirmed = (state.friendStuds || []).filter((x) => x.pendingSettle);
    unconfirmed.forEach((x) => t.push({ icon: '🧾', tab: 'gestüt', kind: (state.week - x.pendingSettle.sentWeek > 8 ? 'warn' : 'info'),
      text: 'Decktaxe-Abrechnung für ' + x.horse.name + ' (' + Economy.fmtEur(x.pendingSettle.amount) + ') an ' + x.friend + ' — noch nicht bestätigt' }));

    return t;
  }

  return {
    get state() { return state; },
    onChange: onChange,
    newGame: newGame,
    save: save, load: load, hasSave: hasSave, wipe: wipe,
    exportSave: exportSave, importSave: importSave,
    getHorse: getHorse,
    stallFree: stallFree,
    valuation: valuation,
    marketPrice: marketPrice,
    weeklyTodos: weeklyTodos,
    setStudName: setStudName,
    setFeed: setFeed,
    setCare: setCare,
    buyFacility: buyFacility,
    buyMarketHorse: buyMarketHorse,
    listForSale: listForSale,
    unlist: unlist,
    setTrainingFocus: setTrainingFocus,
    setTrainingPlan: setTrainingPlan,
    applyPlanToAll: applyPlanToAll,
    takeLoan: takeLoan,
    repayLoan: repayLoan,
    hireStaff: hireStaff,
    fireStaff: fireStaff,
    signSponsor: signSponsor,
    dropSponsor: dropSponsor,
    setStudPrefix: setStudPrefix,
    setPrefixOn: setPrefixOn,
    setBoarding: setBoarding,
    setPasture: setPasture,
    buyFeed: buyFeed,
    offerStudService: offerStudService,
    stopStudService: stopStudService,
    colorTest: colorTest,
    COLORTEST_COST: COLORTEST_COST,
    setInsurance: setInsurance,
    fulfillBreedingOrder: fulfillBreedingOrder,
    addFriend: addFriend,
    removeFriend: removeFriend,
    friendLabel: friendLabel,
    shareRanking: shareRanking,
    importRanking: importRanking,
    createOffer: createOffer,
    cancelOffer: cancelOffer,
    previewCode: previewCode,
    acceptOffer: acceptOffer,
    acceptBid: acceptBid,
    acceptDelivery: acceptDelivery,
    shareStud: shareStud,
    acceptStud: acceptStud,
    settleFriendStud: settleFriendStud,
    acceptPayout: acceptPayout,
    confirmPayout: confirmPayout,
    reissueReceipt: reissueReceipt,
    removeFriendStud: removeFriendStud,
    euthanizeOrSellQuick: euthanizeOrSellQuick,
    planBreeding: planBreeding,
    doBreeding: doBreeding,
    nameFoal: nameFoal,
    auctionBid: auctionBid,
    consignToAuction: consignToAuction,
    enterShow: enterShow,
    withdrawShow: withdrawShow,
    startPerformanceTest: startPerformanceTest,
    advanceWeek: advanceWeek,
    acceptPendingOffer: acceptPendingOffer,
    declinePendingOffer: declinePendingOffer,
    log: log,
  };
})();
