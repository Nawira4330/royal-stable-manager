/* ============================================================================
   Spielzustand, Persistenz (localStorage) und der Wochen-Tick, der alle
   Systeme fortschreibt. Globales `Game`.
   ========================================================================== */
const Game = (function () {
  'use strict';

  const SAVE_KEY = 'gestuetsspiel_save_v1';
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
      version: 1,
      studName: studName || Names.randStudName(),
      week: 0,
      cash: 60000,
      prestige: 0,
      facilities: { stalls: 0, arena: 0, vet: 0, marketing: 0 },
      horses: [],
      market: [],
      auction: { lots: [], nextWeek: 2 },
      shows: [],
      saleListings: [],   // { horseId, price, weeks }
      eventLog: [],
      nextMarketWeek: 0,
      nextShowWeek: 0,
      stats: { foalsBred: 0, horsesSold: 0, showWins: 0, totalEarnings: 0 },
    };

    // Startbestand: 1 Hengst, 3 Stuten, gemischte Rassen.
    const startBreeds = ['Deutsches Sportpferd', 'Hannoveraner', 'Islaender', 'Araber'];
    state.horses.push(Model.generateHorse({ sex: 'hengst', breed: startBreeds[0], quality: 0.55, ageYears: 6, currentWeek: 0, origin: 'Startbestand' }));
    for (let i = 1; i < 4; i++) {
      state.horses.push(Model.generateHorse({ sex: 'stute', breed: startBreeds[i], quality: 0.45 + Math.random() * 0.2, ageYears: 4 + Math.random() * 5, currentWeek: 0, origin: 'Startbestand' }));
    }

    state.market = Economy.rollMarket(state);
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
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      state = JSON.parse(raw);
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
    if (!parsed || !Array.isArray(parsed.horses)) throw new Error('Ungueltiger Spielstand.');
    state = parsed; save(); emit(); return true;
  }
  function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} state = null; }

  // --- Helfer.
  function getHorse(id) { return state.horses.find((h) => h.id === id) || null; }
  function stallFree() { return Economy.stallCapacity(state) - state.horses.length; }
  function valuation(h) { return Model.valuation(h, state.week, Economy.prestigeMult(state)); }

  function addCash(v, reason) {
    state.cash += v;
    if (reason) log((v >= 0 ? '+' : '') + Economy.fmtEur(v) + ' - ' + reason, v >= 0 ? 'good' : 'cost');
  }

  // --- Aktionen des Spielers ---------------------------------------------

  function setStudName(name) { state.studName = name || state.studName; save(); emit(); }

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
    if (!offer) return { ok: false, msg: 'Angebot nicht mehr verfuegbar.' };
    if (stallFree() < 1) return { ok: false, msg: 'Kein freier Stallplatz. Baue Stallplaetze aus oder verkaufe ein Pferd.' };
    if (state.cash < offer.price) return { ok: false, msg: 'Nicht genug Geld.' };
    state.cash -= offer.price;
    offer.horse.acquiredWeek = state.week;
    offer.horse.origin = 'Marktkauf';
    state.horses.push(offer.horse);
    state.market.splice(index, 1);
    log('Gekauft: ' + offer.horse.name + ' (' + offer.horse.breed + ') fuer ' + Economy.fmtEur(offer.price) + '.', 'cost');
    save(); emit();
    return { ok: true };
  }

  function listForSale(horseId, price) {
    const h = getHorse(horseId);
    if (!h) return { ok: false, msg: 'Pferd nicht gefunden.' };
    if (h.pregnancy) return { ok: false, msg: 'Traechtige Stute - erst nach der Geburt verkaufen (oder in die Auktion geben).' };
    if (state.saleListings.some((s) => s.horseId === horseId)) return { ok: false, msg: 'Steht bereits zum Verkauf.' };
    state.saleListings.push({ horseId: horseId, price: Math.max(100, Math.round(price)), weeks: 0 });
    h.forSale = { price: Math.round(price) };
    log(h.name + ' zum Verkauf angeboten fuer ' + Economy.fmtEur(price) + '.', 'info');
    save(); emit();
    return { ok: true };
  }
  function unlist(horseId) {
    state.saleListings = state.saleListings.filter((s) => s.horseId !== horseId);
    const h = getHorse(horseId); if (h) h.forSale = null;
    save(); emit();
  }

  function setTrainingFocus(horseId, disc) {
    const h = getHorse(horseId);
    if (!h) return;
    h.trainingFocus = (disc && DISC.indexOf(disc) !== -1) ? disc : null;
    save(); emit();
  }

  function euthanizeOrSellQuick(horseId) {
    // "Schnellverkauf" zum halben Schaetzwert an einen Haendler.
    const h = getHorse(horseId);
    if (!h) return { ok: false };
    const v = Math.round(valuation(h) * 0.5);
    removeHorse(horseId);
    addCash(v, 'Schnellverkauf ' + h.name + ' an Haendler');
    state.stats.horsesSold++;
    save(); emit();
    return { ok: true, amount: v };
  }

  function removeHorse(id) {
    state.horses = state.horses.filter((h) => h.id !== id);
    state.saleListings = state.saleListings.filter((s) => s.horseId !== id);
  }

  // --- Zucht.
  function planBreeding(sireId, damId) {
    const sire = getHorse(sireId), dam = getHorse(damId);
    if (!sire || !dam) return { error: 'Bitte Hengst und Stute waehlen.' };
    if (sire.sex !== 'hengst') return { error: sire.name + ' ist kein Hengst.' };
    if (dam.sex !== 'stute') return { error: dam.name + ' ist keine Stute.' };
    if (dam.pregnancy) return { error: dam.name + ' ist bereits traechtig.' };
    const sy = Model.ageYears(sire, state.week), dy = Model.ageYears(dam, state.week);
    if (sy < Model.MATURITY_YEARS) return { error: sire.name + ' ist mit ' + sy.toFixed(1) + ' Jahren zu jung.' };
    if (dy < Model.MATURITY_YEARS) return { error: dam.name + ' ist mit ' + dy.toFixed(1) + ' Jahren zu jung.' };
    if (dy > Model.MAX_BREED_AGE) return { error: dam.name + ' ist zu alt fuer die Zucht.' };

    const coi = Model.inbreedingCoefficient(sire, dam);
    const forecast = Genetics.foalColorForecast(sire.genotype, dam.genotype);
    const fee = 800 + Math.round((Model.valuation(sire, state.week, 1)) * 0.03);
    // Empfaengnis-Wahrscheinlichkeit.
    const vet = Economy.facLevel(state, 'vet');
    let chance = 0.72 * vet.fert;
    chance *= clamp(1 - (dy - 12) * 0.05, 0.3, 1);        // Stutenalter
    chance *= clamp(dam.health / 90, 0.5, 1.05);
    chance *= clamp(1 - coi * 0.6, 0.4, 1);               // Inzucht senkt Fruchtbarkeit
    chance = clamp(chance, 0.15, 0.95);

    return {
      sire: sire, dam: dam, coi: coi, forecast: forecast,
      fee: fee, conceiveChance: chance,
    };
  }

  function doBreeding(sireId, damId) {
    const plan = planBreeding(sireId, damId);
    if (plan.error) return { ok: false, msg: plan.error };
    if (state.cash < plan.fee) return { ok: false, msg: 'Deckgebuehr ' + Economy.fmtEur(plan.fee) + ' nicht bezahlbar.' };
    state.cash -= plan.fee;
    log('Deckakt ' + plan.dam.name + ' x ' + plan.sire.name + ' (Gebuehr ' + Economy.fmtEur(plan.fee) + ', COI ' + (plan.coi * 100).toFixed(1) + '%).', 'cost');

    if (Math.random() > plan.conceiveChance) {
      log('Die Bedeckung war nicht erfolgreich - ' + plan.dam.name + ' ist nicht traechtig geworden.', 'warn');
      save(); emit();
      return { ok: true, conceived: false };
    }
    plan.dam.pregnancy = { sireId: sireId, sireName: plan.sire.name, weeksLeft: Model.GESTATION_WEEKS };
    log(plan.dam.name + ' ist traechtig! Abfohlung in ' + Model.GESTATION_WEEKS + ' Wochen.', 'good');
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
    if (amount > state.cash) return { ok: false, msg: 'Dein Gebot uebersteigt dein Guthaben.' };
    const res = Economy.placeBid(lot, amount);
    if (res.ok) { save(); emit(); }
    return res;
  }
  function consignToAuction(horseId, reserve) {
    const h = getHorse(horseId);
    if (!h) return { ok: false, msg: 'Pferd nicht gefunden.' };
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
    log(h.name + ' in die naechste Auktion eingeliefert (Limit ' + Economy.fmtEur(reserve || est * 0.6) + ').', 'info');
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
    if (Model.ageYears(h, state.week) < Model.MATURITY_YEARS) return { ok: false, msg: h.name + ' ist zu jung (< 3 Jahre).' };
    if (h.pregnancy && show.type === 'sport') return { ok: false, msg: 'Traechtige Stuten starten nicht im Sport.' };
    if (state.cash < show.entryFee) return { ok: false, msg: 'Nenngeld nicht bezahlbar.' };
    state.cash -= show.entryFee;
    show.entered.push(horseId);
    log('Genannt: ' + h.name + ' fuer ' + show.name + ' (Nenngeld ' + Economy.fmtEur(show.entryFee) + ').', 'cost');
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
    state.week += 1;

    // 1) Alterung, Energie, Training, Gesundheit.
    const births = [];
    state.horses.forEach((h) => {
      const y = Model.ageYears(h, state.week);
      // Energie
      h.energy = clamp(h.energy + 16, 0, 100);
      // Training
      if (h.trainingFocus && y >= Model.MATURITY_YEARS && h.energy > 22 && !(h.pregnancy && h.pregnancy.weeksLeft < 8)) {
        const d = h.trainingFocus;
        const gap = h.potential[d] - h.skill[d];
        if (gap > 0.3) {
          const rate = 0.9 * arena.mult
            * clamp(gap / 40, 0.15, 1)
            * clamp(h.temperament / 70, 0.5, 1.15)
            * Model.ageFactor(y)
            * clamp(h.health / 90, 0.6, 1);
          h.skill[d] = clamp(h.skill[d] + rate, 0, h.potential[d]);
          h.energy = clamp(h.energy - 13, 0, 100);
        }
      }
      // Altersbedingter Substanzverlust
      if (y > 16) h.health = clamp(h.health - Model.gauss(0.4, 0.3), 0, 100);
      if (y > 26 && Math.random() < 0.06) {
        log(h.name + ' ist im Alter von ' + y.toFixed(0) + ' Jahren friedlich eingeschlafen.', 'warn');
        h._dead = true;
      }
      // Traechtigkeit
      if (h.pregnancy) {
        h.pregnancy.weeksLeft -= 1;
        if (h.pregnancy.weeksLeft <= 0) births.push(h);
      }
    });
    // Tote entfernen
    state.horses.filter((h) => h._dead).forEach((h) => removeHorse(h.id));

    // 2) Geburten.
    births.forEach((dam) => {
      const sire = getHorse(dam.pregnancy.sireId) || { // Vater evtl. verkauft: Platzhalter aus gespeicherten Daten
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
      foal.health = clamp(foal.health + vet.foalHealth, 0, 100);
      foal.name = Names.randName();
      state.stats.foalsBred += 1;
      if (Game.stallFree() >= 1) {
        state.horses.push(foal);
        log('Geburt: ' + dam.name + ' hat ein ' + (foal.sex === 'hengst' ? 'Hengstfohlen' : 'Stutfohlen') + ' - "' + foal.name + '" (' + Genetics.describe(foal.genotype, 0).display + ', COI ' + (result.coi * 100).toFixed(1) + '%).', 'good');
      } else {
        const v = Math.round(Model.valuation(foal, state.week, Economy.prestigeMult(state)) * 0.7);
        state.cash += v;
        log('Geburt: "' + foal.name + '" - kein Stallplatz frei, Fohlen direkt fuer ' + Economy.fmtEur(v) + ' verkauft.', 'info');
      }
    });

    // 3) Verkaufslistings abwickeln.
    const stillListed = [];
    state.saleListings.forEach((s) => {
      const h = getHorse(s.horseId);
      if (!h) return;
      s.weeks += 1;
      const val = valuation(h);
      const ratio = s.price / Math.max(1, val);
      // Verkaufswahrscheinlichkeit sinkt mit ueberzogenem Preis, steigt mit Zeit/Marketing.
      let p = clamp(0.55 / Math.pow(ratio, 2.2), 0.02, 0.9) * mkt.saleSpeed;
      p = clamp(p + s.weeks * 0.03, 0, 0.95);
      if (Math.random() < p) {
        const paid = Math.round(s.price * mkt.priceMult);
        state.cash += paid;
        state.stats.horsesSold += 1;
        state.stats.totalEarnings += paid;
        log('Verkauft: ' + h.name + ' fuer ' + Economy.fmtEur(paid) + ' (nach ' + s.weeks + ' Wochen).', 'good');
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
        state.cash += r.totalPrize;
        state.prestige += r.prestigeGain;
        state.stats.totalEarnings += r.totalPrize;
        const mine = r.results.filter((x) => x.player).sort((a, b) => a.place - b.place);
        const best = mine[0];
        state.stats.showWins += mine.filter((x) => x.place === 1).length;
        log('🏆 ' + show.name + ': bestes eigenes Pferd Platz ' + best.place + '/' + r.results.length +
          '. Preisgeld ' + Economy.fmtEur(r.totalPrize) + ', +' + r.prestigeGain + ' Prestige.', 'good');
        show._playerResults = mine;
      }
    });

    // 5) Auktion abschliessen, wenn faellig.
    if (state.week >= state.auction.nextWeek) {
      const results = Economy.closeAuction(state, state.auction.lots);
      results.forEach((res) => {
        const h = res.lot.horse;
        if (res.type === 'buy' && res.sold) {
          if (Game.stallFree() >= 1 && state.cash >= res.amount) {
            state.cash -= res.amount;
            h.acquiredWeek = state.week; h.origin = 'Auktion';
            state.horses.push(h);
            log('Auktion: ' + h.name + ' fuer ' + Economy.fmtEur(res.amount) + ' ersteigert.', 'cost');
          } else {
            log('Auktion: Zuschlag fuer ' + h.name + ' verfaellt (kein Platz oder kein Geld).', 'warn');
          }
        } else if (res.type === 'consign') {
          if (res.sold) {
            state.cash += res.amount;
            state.stats.horsesSold += 1;
            state.stats.totalEarnings += res.amount;
            removeHorse(h.id);
            log('Auktion: ' + h.name + ' fuer ' + Economy.fmtEur(res.amount) + ' verkauft.', 'good');
          } else {
            log('Auktion: ' + h.name + ' blieb unter Limit und kommt zurueck in den Stall.', 'warn');
          }
        }
      });
      state.auction.lots = Economy.rollAuction(state);
      state.auction.nextWeek = state.week + 4;
    }

    // 6) Markt & Schaukalender periodisch erneuern.
    if (state.week >= state.nextMarketWeek) {
      state.market = Economy.rollMarket(state);
      state.nextMarketWeek = state.week + 2;
    }
    if (state.shows.every((s) => s.done) || state.week >= state.nextShowWeek) {
      state.shows = Economy.rollShows(state);
      state.nextShowWeek = state.week + 3;
    }

    // 7) Zufallsereignisse (selten).
    maybeRandomEvent();

    // 8) Unterhalt abziehen.
    const upkeep = Economy.weeklyUpkeep(state);
    state.cash -= upkeep;
    log('Wochenunterhalt: -' + Economy.fmtEur(upkeep) + ' (' + state.horses.length + ' Pferde + Anlagen).', 'cost');

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
    const roll = Math.random();
    const horses = state.horses.filter((h) => !h.pregnancy);
    if (roll < 0.3 && state.horses.length) {
      const h = state.horses[Model.randInt(0, state.horses.length - 1)];
      const bill = 300 + Model.randInt(0, 900);
      state.cash -= bill;
      h.health = clamp(h.health - Model.randInt(3, 12), 0, 100);
      log('Tierarzt: ' + h.name + ' hatte eine Kolik. Behandlung -' + Economy.fmtEur(bill) + '.', 'cost');
    } else if (roll < 0.55 && horses.length) {
      const h = horses[Model.randInt(0, horses.length - 1)];
      const offer = Math.round(valuation(h) * (1.1 + Math.random() * 0.4));
      state._pendingOffer = { horseId: h.id, price: offer, week: state.week };
      log('💌 Ein Interessent bietet ' + Economy.fmtEur(offer) + ' fuer ' + h.name + ' (Tab "Stall" -> Angebot annehmen).', 'info');
    } else if (roll < 0.75) {
      const bonus = 500 + Model.randInt(0, 1500);
      state.cash += bonus;
      log('Ein Sponsor unterstuetzt dein Gestuet mit ' + Economy.fmtEur(bonus) + '.', 'good');
    } else if (horses.length) {
      const h = horses[Model.randInt(0, horses.length - 1)];
      h.temperament = clamp(h.temperament + Model.randInt(2, 6), 10, 99);
      log(h.name + ' hat sich charakterlich gut entwickelt (+Temperament).', 'good');
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
    removeHorse(o.horseId);
    log('Angebot angenommen: ' + h.name + ' fuer ' + Economy.fmtEur(o.price) + ' verkauft.', 'good');
    state._pendingOffer = null;
    save(); emit();
    return { ok: true, amount: o.price };
  }
  function declinePendingOffer() { state._pendingOffer = null; save(); emit(); }

  return {
    get state() { return state; },
    onChange: onChange,
    newGame: newGame,
    save: save, load: load, hasSave: hasSave, wipe: wipe,
    exportSave: exportSave, importSave: importSave,
    getHorse: getHorse,
    stallFree: stallFree,
    valuation: valuation,
    setStudName: setStudName,
    buyFacility: buyFacility,
    buyMarketHorse: buyMarketHorse,
    listForSale: listForSale,
    unlist: unlist,
    setTrainingFocus: setTrainingFocus,
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
