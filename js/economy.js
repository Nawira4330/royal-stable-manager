/* ============================================================================
   Wirtschaft & Wettbewerb: Markt, Auktionen, Schauen, Anlagen.
   Reine Logikfunktionen auf dem Spielzustand -> globales `Economy`.
   ========================================================================== */
const Economy = (function () {
  'use strict';

  const clamp = Model.clamp;
  const DISC = Model.DISC;

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
  };

  function facLevel(state, key) {
    return FACILITIES[key].levels[state.facilities[key] || 0];
  }
  function stallCapacity(state) { return facLevel(state, 'stalls').cap; }
  function weeklyUpkeep(state) {
    let u = 0;
    Object.keys(FACILITIES).forEach((k) => { u += facLevel(state, k).upkeep; });
    u += state.horses.length * 95; // Futter/Pflege je Pferd
    return u;
  }

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

  // --- Marktangebot erzeugen (Kaufpferde).
  function rollMarket(state) {
    const tier = prestigeTier(state).stars;
    const n = 4 + Model.randInt(0, 2);
    const list = [];
    for (let i = 0; i < n; i++) {
      const q = clamp(Model.gauss(0.4 + tier * 0.05, 0.16), 0.05, 0.98);
      const h = Model.generateHorse({ quality: q, currentWeek: state.week, origin: 'Markt' });
      const val = Model.valuation(h, state.week, prestigeMult(state));
      const ask = Math.round(val * (0.9 + Math.random() * 0.5) / 50) * 50;
      list.push({ horse: h, price: ask });
    }
    return list;
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
        sex: 'hengst', breed: breed, quality: q,
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
      const h = Model.generateHorse({ quality: q, currentWeek: state.week, origin: 'Auktion' });
      const val = Model.valuation(h, state.week, prestigeMult(state));
      lots.push({
        horse: h,
        estimate: val,
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
        // Spielerpferd: KI kauft es zum aktuellen Gebot, sofern >= Reserve.
        const sold = lot.currentBid >= (lot.reserve || 0);
        results.push({ lot: lot, type: 'consign', sold: sold, amount: sold ? lot.currentBid : 0 });
      } else if (lot.leader === 'player') {
        results.push({ lot: lot, type: 'buy', sold: true, amount: lot.currentBid });
      } else {
        results.push({ lot: lot, type: 'buy', sold: false, amount: 0 });
      }
    });
    return results;
  }

  // --- Schauen / Turniere.
  //     Zwei Arten: 'sport' (je Disziplin, bewertet Ausbildung) und
  //     'zucht' (Exterieur/Typ/Abstammung).
  function rollShows(state) {
    const tier = prestigeTier(state).stars;
    const shows = [];
    // 2-4 Sportturniere
    const nSport = 2 + Model.randInt(0, 2);
    for (let i = 0; i < nSport; i++) {
      const disc = DISC[Model.randInt(0, DISC.length - 1)];
      const level = clamp(Model.randInt(1, tier + 1), 1, 5);
      shows.push(makeShow('sport', disc, level));
    }
    // 1-2 Zuchtschauen
    const nZ = 1 + Model.randInt(0, 1);
    for (let i = 0; i < nZ; i++) {
      const level = clamp(Model.randInt(1, tier + 1), 1, 5);
      shows.push(makeShow('zucht', null, level));
    }
    return shows;
  }

  function makeShow(type, disc, level) {
    const pool = [1500, 4000, 9000, 20000, 45000][level - 1];
    return {
      id: 'show_' + Math.random().toString(36).slice(2, 8),
      type: type,
      discipline: disc,
      level: level,
      name: (type === 'zucht' ? 'Zuchtschau' : disc + '-Turnier') + ' - ' +
        ['Ortsklasse', 'Regional', 'National', 'CSI***', 'Championat'][level - 1],
      entryFee: Math.round(pool * 0.03),
      prizePool: pool,
      fieldStrength: 30 + level * 12, // mittlere KI-Punktzahl
      entered: [],   // horse ids
      done: false,
    };
  }

  // Wettkampf-Punktzahl eines Pferdes für eine Schau (0..~120).
  function scoreHorse(horse, show, currentWeek) {
    const y = Model.ageYears(horse, currentWeek);
    const af = Model.ageFactor(y);
    const form = 60 + Model.gauss(0, 22);         // Tagesform
    const tempBonus = (horse.temperament - 50) * 0.25;
    const healthBonus = (horse.health - 80) * 0.3;
    if (show.type === 'sport') {
      const d = show.discipline;
      return horse.skill[d] * 0.72 * af
        + horse.conformation * 0.12
        + tempBonus + healthBonus
        + form * 0.16;
    }
    // Zuchtschau: Exterieur + Typ (Rassewert) + Abstammung (Elternnamen bekannt?)
    const bdef = Model.breedDef(horse.breed);
    const typeBonus = (horse.conformation - bdef.conf) * 0.2;
    const pedigreeBonus = (horse.sireName ? 4 : 0) + (horse.damName ? 4 : 0) + horse.wins * 1.5;
    const rarity = Genetics.describe(horse.genotype, y).rarity * 10;
    // Mixe haben keinen Rassetyp und kein Zuchtbuch -> deutlicher Malus.
    const mixMalus = (horse.isMix || Model.isMixBreed(horse.breed)) ? 20 : 0;
    return horse.conformation * 0.66
      + typeBonus + pedigreeBonus + rarity - mixMalus
      + tempBonus + healthBonus * 0.5
      + form * 0.14;
  }

  // Führt eine Schau aus: Spielerpferde + KI-Feld, Platzierung, Preisgeld.
  function runShow(state, show) {
    const field = [];
    show.entered.forEach((id) => {
      const h = state.horses.find((x) => x.id === id);
      if (h) field.push({ id: id, name: h.name, player: true, score: scoreHorse(h, show, state.week) });
    });
    const aiCount = 7 + show.level;
    for (let i = 0; i < aiCount; i++) {
      field.push({
        id: 'ai' + i, name: Names.randName(), player: false,
        score: show.fieldStrength + Model.gauss(0, 16),
      });
    }
    field.sort((a, b) => b.score - a.score);

    // Preisgeld: 40/25/15/12/8 % auf die ersten fünf.
    const split = [0.4, 0.25, 0.15, 0.12, 0.08];
    const results = field.map((f, idx) => {
      const place = idx + 1;
      const prize = place <= 5 ? Math.round(show.prizePool * split[place - 1]) : 0;
      return { name: f.name, player: f.player, id: f.id, place: place, score: Math.round(f.score), prize: prize };
    });

    // Effekte auf Spielerpferde anwenden.
    let totalPrize = 0, prestigeGain = 0;
    results.forEach((r) => {
      if (!r.player) return;
      const h = state.horses.find((x) => x.id === r.id);
      if (!h) return;
      totalPrize += r.prize;
      h.earnings += r.prize;
      h.shows += 1;
      if (r.place === 1) { h.wins += 1; prestigeGain += 6 + show.level * 4; }
      else if (r.place <= 3) prestigeGain += 3 + show.level * 2;
      else if (r.place <= 5) prestigeGain += 1 + show.level;
      h.showLog.unshift({ week: state.week, show: show.name, place: r.place, field: results.length, prize: r.prize });
      if (h.showLog.length > 12) h.showLog.pop();
      // Kleiner Erfahrungszuwachs durch Turniererfahrung.
      if (show.type === 'sport') {
        h.skill[show.discipline] = clamp(h.skill[show.discipline] + (r.place <= 3 ? 1.2 : 0.5), 0, h.potential[show.discipline]);
      }
    });

    show.done = true;
    return { results: results, totalPrize: totalPrize, prestigeGain: prestigeGain };
  }

  function fmtEur(v) {
    return (Math.round(v)).toLocaleString('de-DE') + ' €';
  }

  return {
    FACILITIES: FACILITIES,
    facLevel: facLevel,
    stallCapacity: stallCapacity,
    weeklyUpkeep: weeklyUpkeep,
    prestigeMult: prestigeMult,
    prestigeTier: prestigeTier,
    rollMarket: rollMarket,
    rollStudRoster: rollStudRoster,
    rollAuction: rollAuction,
    placeBid: placeBid,
    bidIncrement: bidIncrement,
    closeAuction: closeAuction,
    rollShows: rollShows,
    scoreHorse: scoreHorse,
    runShow: runShow,
    fmtEur: fmtEur,
  };
})();
