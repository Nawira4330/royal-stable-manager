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

  // --- Neues Spiel.
  function newGame(studName) {
    state = {
      version: 4,
      studName: studName || Names.randStudName(),
      week: 0,
      cash: 60000,
      prestige: 0,
      facilities: { stalls: 0, arena: 0, vet: 0, marketing: 0 },
      feedLevel: 1,       // Fütterung: 0 Spar / 1 Standard / 2 Premium
      careLevel: 1,       // Pflege:    0 Minimal / 1 Solide / 2 Intensiv
      demand: Economy.initDemand(),   // Angebot & Nachfrage je Rasse/Disziplin
      friendCode: Friend.playerCode(),
      friendStuds: [],    // von Freunden übernommene Deckhengste
      pendingOffers: [],  // eigene offene Verkaufsangebote { id, horseId, price, to }
      pendingPurchases: [], // abgegebene Kaufgebote, auf Lieferung wartend
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
      stats: { foalsBred: 0, horsesSold: 0, showWins: 0, totalEarnings: 0 },
    };

    // Startbestand: 1 Hengst, 3 Stuten, gemischte Rassen.
    const startBreeds = ['Deutsches Sportpferd', 'Hannoveraner', 'Isländer', 'Araber'];
    state.horses.push(Model.generateHorse({ sex: 'hengst', breed: startBreeds[0], quality: 0.55, ageYears: 6, currentWeek: 0, origin: 'Startbestand' }));
    for (let i = 1; i < 4; i++) {
      state.horses.push(Model.generateHorse({ sex: 'stute', breed: startBreeds[i], quality: 0.45 + Math.random() * 0.2, ageYears: 4 + Math.random() * 5, currentWeek: 0, origin: 'Startbestand' }));
    }

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
    if (!state.friendCode) state.friendCode = Friend.playerCode();
    if (!Array.isArray(state.friendStuds)) state.friendStuds = [];
    if (!Array.isArray(state.pendingOffers)) state.pendingOffers = [];
    if (!Array.isArray(state.pendingPurchases)) state.pendingPurchases = [];
    if (!Array.isArray(state.redeemedCodes)) state.redeemedCodes = [];
    if (state.feedLevel == null) state.feedLevel = 1;
    if (state.careLevel == null) state.careLevel = 1;
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
  function stallFree() { return Economy.stallCapacity(state) - state.horses.length; }
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
    toCode = (toCode || '').trim().toUpperCase() || null;
    if (toCode && !/^HR-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(toCode)) return { ok: false, msg: 'Freundescode-Format: HR-XXXX-XXXX' };
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
      if (already) return { ok: false, msg: 'Diese Decktaxe-Abrechnung hast du schon angenommen.' };
      return { ok: true, action: 'payout', kind: 'Decktaxe-Abrechnung', from: d.from, amount: d.amount, count: d.count,
        text: d.from + ' zahlt dir ' + Economy.fmtEur(d.amount) + ' Decktaxe für ' + (d.stud || 'deinen Hengst') + ' (' + d.count + ' Bedeckungen).' };
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
    Economy.applySaleImpact(state, h);
    h.offered = false;
    removeHorse(h.id);
    state.pendingOffers = state.pendingOffers.filter((o) => o.id !== off.id);
    log('Verkauft an ' + d.from + ': ' + h.name + ' für ' + Economy.fmtEur(off.price) + '. Lieferungs-Code an den Käufer schicken.', 'good');
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
    state.pendingPurchases = (state.pendingPurchases || []).filter((q) => q.offerId !== d.id);
    log('Von ' + d.from + ' gekauft: ' + h.name + ' für ' + Economy.fmtEur(d.price) + '.', 'cost');
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
    log('Deckhengst von ' + d.from + ' in deiner Deckstation: ' + stud.name + ' (Deckgeld ' + Economy.fmtEur(d.fee) + ').', 'good');
    save(); emit();
    return { ok: true, name: stud.name };
  }

  function removeFriendStud(horseId) {
    state.friendStuds = (state.friendStuds || []).filter((x) => x.horse.id !== horseId);
    save(); emit();
  }
  // Nutzer eines Freundes-Hengstes: offene Decktaxe an den Besitzer auszahlen.
  function settleFriendStud(studHorseId) {
    const x = (state.friendStuds || []).find((e) => e.horse.id === studHorseId);
    if (!x || !(x.owed > 0)) return { ok: false, msg: 'Nichts abzurechnen.' };
    const code = Friend.encodePayout(x.friend, state.friendCode, x.owed, x.owedCount || 0, x.horse.name, Friend.newOfferId());
    log('Decktaxe-Abrechnung erstellt: ' + Economy.fmtEur(x.owed) + ' an ' + x.friend + ' für ' + x.horse.name + '. Code schicken.', 'info');
    x.owed = 0; x.owedCount = 0;
    save(); emit();
    return { ok: true, code: code };
  }
  // Hengst-Besitzer: Decktaxe-Abrechnung annehmen -> Geld gutschreiben.
  function acceptPayout(text) {
    const p = previewCode(text);
    if (!p.ok || p.action !== 'payout') return { ok: false, msg: p.msg || 'Keine gültige Abrechnung.' };
    const d = Friend.decode(text);
    state.cash += d.amount;
    state.stats.totalEarnings += d.amount;
    markRedeemed(d.hash);
    log('Decktaxe erhalten: ' + Economy.fmtEur(d.amount) + ' von ' + d.from + ' (' + d.count + ' Bedeckungen).', 'good');
    save(); emit();
    return { ok: true, amount: d.amount };
  }

  function removeHorse(id) {
    state.horses = state.horses.filter((h) => h.id !== id);
    state.saleListings = state.saleListings.filter((s) => s.horseId !== id);
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
    let chance = 0.72 * vet.fert * Economy.feedDef(state).fertMult;
    chance *= clamp(1 - (dy - 12) * 0.05, 0.3, 1);        // Stutenalter
    chance *= clamp(dam.health / 90, 0.5, 1.05);
    chance *= clamp(1 - coi * 0.6, 0.4, 1);               // Inzucht senkt Fruchtbarkeit
    chance = clamp(chance, 0.15, 0.95);

    return {
      sire: sire, dam: dam, external: sr.external, coi: coi,
      friend: sr.friend || null, friendEntry: friendEntry,
      forecast: forecast, statForecast: statForecast, match: match,
      fee: fee, conceiveChance: chance,
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

    // 1) Alterung, Energie, Training, Gesundheit.
    const births = [];
    state.horses.forEach((h) => {
      const y = Model.ageYears(h, state.week);
      // Energie (abhängig von der Fütterung)
      h.energy = clamp(h.energy + feed.energyRegen, 0, 100);
      // Leichte Gesundheits-Regeneration durch gutes Futter
      if (feed.healthRegen && h.health < 100 && h.health > 25) {
        Model.adjustHealth(h, feed.healthRegen);
      }
      // Intensive Pflege hebt langsam eine Interieur-Einzelnote
      if (care.interieurDrift && Math.random() < care.interieurDrift && h.interieur) {
        const t = Model.INTERIEUR_TRAITS[Model.randInt(0, Model.INTERIEUR_TRAITS.length - 1)];
        h.interieur[t] = clamp(h.interieur[t] + 1, 10, 99);
        h.temperament = clamp(Math.round(Model.INTERIEUR_TRAITS.reduce((s, k) => s + h.interieur[k], 0) / Model.INTERIEUR_TRAITS.length), 10, 99);
      }
      // Wochen-Trainingsplan abarbeiten (bis zu 6 Einheiten). Pferde in
      // einem Verkaufsangebot trainieren nicht.
      const plan = h.offered ? [] : (h.trainingPlan || []).filter((d) => d && DISC.indexOf(d) !== -1);
      const restSlots = 6 - plan.length;
      h.energy = clamp(h.energy + restSlots * 5, 0, 100);           // Ruhetage erholen extra
      if (y >= Model.MATURITY_YEARS && !(h.pregnancy && h.pregnancy.weeksLeft < 8)) {
        let skipped = 0;
        plan.forEach((d) => {
          if (h.energy < 25) { skipped++; return; }
          const gap = h.potential[d] - h.skill[d];
          if (gap > 0.2) {
            const rate = 0.46 * arena.mult * feed.trainMult
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
      // Altersbedingter Substanzverlust (durch gute Pflege gebremst)
      if (y > 16) Model.injureHealth(h, Model.gauss(0.4, 0.3) * care.ageHealthMult, ['Fundament & Sehnen', 'Herz-Kreislauf', 'Hufe']);
      if (y > 26 && Math.random() < 0.06) {
        log(h.name + ' ist im Alter von ' + y.toFixed(0) + ' Jahren friedlich eingeschlafen.', 'warn');
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
      const foal = result.foal;
      Model.adjustHealth(foal, vet.foalHealth + feed.foalHealth);
      foal.name = Names.randName();
      state.stats.foalsBred += 1;
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
      let p = clamp(0.55 / Math.pow(ratio, 2.2), 0.02, 0.9) * mkt.saleSpeed;
      p = clamp(p + s.weeks * 0.03, 0, 0.95);
      if (Math.random() < p) {
        const paid = Math.round(s.price * mkt.priceMult);
        state.cash += paid;
        state.stats.horsesSold += 1;
        state.stats.totalEarnings += paid;
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
        state.stats.showWins += mine.filter((x) => x.place === 1).length;
        log('🏆 ' + show.name + ': bestes eigenes Pferd Platz ' + best.place + '/' + r.results.length +
          ' (' + best.scoreLabel + '). Preisgeld ' + Economy.fmtEur(r.totalPrize) +
          (r.travelCost ? ', Reise -' + Economy.fmtEur(r.travelCost) : '') + ', +' + r.prestigeGain + ' Prestige.', 'good');
        show._playerResults = mine;
        show._allResults = r.results;
        state.showResults = state.showResults || [];
        state.showResults.unshift({ week: state.week, name: show.name, results: r.results.slice(0, 12) });
        if (state.showResults.length > 10) state.showResults.pop();
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
    if (state.shows.every((s) => s.done) || state.week >= state.nextShowWeek) {
      state.shows = Economy.rollShows(state);
      state.nextShowWeek = state.week + 3;
    }

    // 7) Zufallsereignisse (selten).
    maybeRandomEvent();

    // 8) Unterhalt abziehen (Anlagen + Futter + Pflege je Pferd).
    const upkeep = Economy.weeklyUpkeep(state);
    state.cash -= upkeep;
    const perHorse = feed.cost + care.cost;
    log('Wochenunterhalt: -' + Economy.fmtEur(upkeep) + ' (' + state.horses.length + ' Pferde × ' +
      Economy.fmtEur(perHorse) + ' Futter/Pflege + Anlagen).', 'cost');

    // 9) Prestige-Zerfall + Bankrott-Warnung.
    state.prestige = Math.max(0, state.prestige - 0.5);
    if (state.cash < 0) {
      log('⚠️ Dein Konto ist im Minus (' + Economy.fmtEur(state.cash) + '). Verkaufe Pferde, sonst droht das Aus.', 'warn');
    }

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
    if (roll < 0.3 * care.eventMult && state.horses.length) {
      const h = state.horses[Model.randInt(0, state.horses.length - 1)];
      const bill = 300 + Model.randInt(0, 900);
      state.cash -= bill;
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
    removeFriendStud: removeFriendStud,
    euthanizeOrSellQuick: euthanizeOrSellQuick,
    planBreeding: planBreeding,
    doBreeding: doBreeding,
    nameFoal: nameFoal,
    auctionBid: auctionBid,
    consignToAuction: consignToAuction,
    enterShow: enterShow,
    withdrawShow: withdrawShow,
    advanceWeek: advanceWeek,
    acceptPendingOffer: acceptPendingOffer,
    declinePendingOffer: declinePendingOffer,
    log: log,
  };
})();
