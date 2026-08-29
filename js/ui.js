/* ============================================================================
   Oberfläche: Tab-Router, Rendering pro Ansicht, Event-Delegation.
   Globales `UI`. Hängt an `Game`, `Model`, `Economy`, `Genetics`, `Names`.
   ========================================================================== */
const UI = (function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const fmt = Economy.fmtEur;
  const DISC = Model.DISC;

  let currentTab = 'gestüt';
  let selectedId = null;      // Stall-Detailansicht
  let breedSire = null, breedDam = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // --- kleine Bausteine -------------------------------------------------
  function ageYears(h) { return Model.ageYears(h, Game.state.week); }
  function ageStr(h) {
    const y = ageYears(h);
    let label = y < 1 ? 'Fohlen' : y < 3 ? 'Jungpferd' : y >= 18 ? 'Senior' : 'erwachsen';
    return y.toFixed(1) + ' J. · ' + label;
  }
  function sexIcon(h) { return h.sex === 'hengst' ? '♂ Hengst' : h.sex === 'stute' ? '♀ Stute' : '⚬ Wallach'; }

  function bar(cur, pot) {
    const c = Math.round(cur), p = Math.round(pot);
    return '<div class="bar pot"><span style="width:' + p + '%"></span>' +
      '<span style="width:' + c + '%;background:var(--accent)"></span>' +
      '<em>' + c + ' / ' + p + '</em></div>';
  }
  function plainBar(v, cls) {
    v = Math.round(v);
    return '<div class="bar"><span style="width:' + Math.max(0, Math.min(100, v)) + '%' +
      (cls ? ';background:var(--' + cls + ')' : '') + '"></span><em>' + v + '</em></div>';
  }

  function phenoOf(h) { return Genetics.describe(h.genotype, ageYears(h)); }

  function rarityTag(h) {
    const r = phenoOf(h).rarity;
    if (r >= 0.35) return '<span class="tag rare">seltene Farbe</span>';
    if (r >= 0.15) return '<span class="tag">besondere Farbe</span>';
    return '';
  }

  // Aufklappbare Einzelnoten (Exterieur / Interieur) in der Stall-Detailansicht.
  function subTraitDetails(label, keys, obj, summary) {
    const lines = keys.map((t) =>
      '<div class="statline"><span class="small">' + esc(t) + '</span>' + plainBar(obj[t]) + '<span></span></div>'
    ).join('');
    return '<details class="subtraits"><summary><span>' + label + '</span> ' + plainBar(Math.round(summary)) +
      '</summary>' + lines + '</details>';
  }

  // --- Topbar --------------------------------------------------------------
  function renderTopbar() {
    const s = Game.state;
    if (!s) return;
    $('#topbar').hidden = false;
    $('#tabs').hidden = false;
    $('#tb-stud').textContent = s.studName;
    $('#tb-week').textContent = s.week;
    $('#tb-year').textContent = '(' + (s.week / Model.WEEKS_PER_YEAR).toFixed(1) + ' Spieljahre)';
    $('#tb-cash').textContent = fmt(s.cash);
    $('#tb-cash-wrap').classList.toggle('cash-neg', s.cash < 0);
    $('#tb-prestige').textContent = Math.round(s.prestige);
    const tier = Economy.prestigeTier(s);
    $('#tb-stars').textContent = '★'.repeat(tier.stars) + '☆'.repeat(5 - tier.stars);
    $('#tb-stars').title = tier.name;
    $('#tb-stall').textContent = s.horses.length + '/' + Economy.stallCapacity(s);
  }

  // --- Router ------------------------------------------------------------
  function showTab(name) {
    currentTab = name;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    render();
  }

  function render() {
    renderTopbar();
    if (!Game.state) return;
    const el = $('#view');
    const fn = views[currentTab] || views.gestüt;
    el.innerHTML = fn();
  }

  // ======================================================================
  //  ANSICHTEN
  // ======================================================================
  const views = {};

  // --- 🏡 Gestüt --------------------------------------------------------
  views.gestüt = function () {
    const s = Game.state;
    const tier = Economy.prestigeTier(s);
    const upkeep = Economy.weeklyUpkeep(s);

    let facHtml = '';
    Object.keys(Economy.FACILITIES).forEach((key) => {
      const def = Economy.FACILITIES[key];
      const lvl = s.facilities[key] || 0;
      const cur = def.levels[lvl];
      const next = def.levels[lvl + 1];
      facHtml += '<tr><td><b>' + esc(def.label) + '</b><br><span class="muted small">' + esc(def.describe(cur)) +
        '</span></td><td>Stufe ' + lvl + '<br><span class="muted small">Unterhalt ' + fmt(cur.upkeep) + '/Wo.</span></td><td class="right">' +
        (next
          ? '<button class="small" data-action="buy-fac" data-key="' + key + '">Ausbauen · ' + fmt(next.cost) + '</button>'
          : '<span class="muted small">max.</span>') +
        '</td></tr>';
    });

    const offer = s._pendingOffer ? Game.getHorse(s._pendingOffer.horseId) : null;

    return `
      <div class="grid cols-2">
        <div class="card stack">
          <h3>${esc(s.studName)} <button class="small secondary" data-action="rename-stud">umbenennen</button></h3>
          <div class="row between"><span>Rang</span><b>${esc(tier.name)} <span class="stars">${'★'.repeat(tier.stars)}</span></b></div>
          <div class="row between"><span>Kasse</span><b class="${s.cash < 0 ? 'tag warn' : ''}">${fmt(s.cash)}</b></div>
          <div class="row between"><span>Pferde</span><b>${s.horses.length} / ${Economy.stallCapacity(s)} Plätze</b></div>
          <div class="row between"><span>Wochenunterhalt</span><b>${fmt(upkeep)}</b></div>
          <div class="row between"><span>Gezüchtete Fohlen</span><b>${s.stats.foalsBred}</b></div>
          <div class="row between"><span>Verkaufte Pferde</span><b>${s.stats.horsesSold}</b></div>
          <div class="row between"><span>Turniersiege</span><b>${s.stats.showWins}</b></div>
          ${offer ? `<div class="card" style="border-color:var(--warn)">
            <b>💌 Kaufangebot</b><br>${esc(offer.name)} — ${fmt(s._pendingOffer.price)}
            <div class="row" style="margin-top:.4rem">
              <button class="small" data-action="accept-offer">Annehmen</button>
              <button class="small secondary" data-action="decline-offer">Ablehnen</button>
            </div></div>` : ''}
        </div>

        <div class="card">
          <h3>Anlagen</h3>
          <table><tbody>${facHtml}</tbody></table>
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:1rem">
        <div class="card">
          <h3>Bestand (Kurzübersicht)</h3>
          ${herdMiniTable()}
        </div>
        <div class="card">
          <h3>Ereignis-Chronik</h3>
          <div class="log">${logHtml()}</div>
        </div>
      </div>`;
  };

  function herdMiniTable() {
    const s = Game.state;
    if (!s.horses.length) return '<p class="muted">Keine Pferde.</p>';
    const rows = s.horses.slice().sort((a, b) => ageYears(a) - ageYears(b)).map((h) => {
      const best = Model.bestDiscipline(h);
      return '<tr><td>' + esc(h.name) + '</td><td class="small">' + esc(h.breed) + '</td><td class="small">' +
        sexIcon(h).split(' ')[0] + ' ' + ageStr(h).split(' · ')[0] + '</td><td class="small">' + esc(phenoOf(h).base) + '</td>' +
        '<td class="small">' + esc(best) + ' ' + Math.round(h.skill[best]) + '</td>' +
        '<td class="right small">' + fmt(Game.valuation(h)) + '</td></tr>';
    }).join('');
    return '<table><thead><tr><th>Name</th><th>Rasse</th><th>Typ/Alter</th><th>Farbe</th><th>Stärke</th><th class="right">Wert</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function logHtml() {
    return Game.state.eventLog.slice(0, 60).map((e) =>
      '<div class="entry ' + esc(e.kind) + '"><span class="wk">Wo.' + e.week + '</span>' + esc(e.msg) + '</div>'
    ).join('') || '<p class="muted">Noch nichts passiert.</p>';
  }

  // --- 🐴 Stall --------------------------------------------------------
  views.stall = function () {
    const s = Game.state;
    if (!s.horses.length) return '<div class="card"><p class="muted">Dein Stall ist leer. Kaufe Pferde im Tab „Markt".</p></div>';
    if (selectedId && !Game.getHorse(selectedId)) selectedId = null;

    const rows = s.horses.slice().sort(sortHorses).map((h) => {
      const best = Model.bestDiscipline(h);
      const preg = h.pregnancy ? ' 🤰' + h.pregnancy.weeksLeft + 'W' : '';
      const sale = h.forSale ? ' 🏷️' : '';
      return '<tr class="clickable ' + (h.id === selectedId ? 'selected' : '') + '" data-action="select-horse" data-id="' + h.id + '">' +
        '<td><b>' + esc(h.name) + '</b>' + preg + sale + '<br><span class="muted small">' + esc(h.breed) + '</span></td>' +
        '<td class="small">' + sexIcon(h) + '<br>' + ageStr(h) + '</td>' +
        '<td class="small">' + esc(phenoOf(h).display) + ' ' + rarityTag(h) + '</td>' +
        '<td class="small">' + esc(best) + '<br>' + bar(h.skill[best], h.potential[best]) + '</td>' +
        '<td class="small">' + Math.round(h.conformation) + '</td>' +
        '<td class="right small">' + fmt(Game.valuation(h)) + '<br><span class="muted">' + h.wins + ' Siege</span></td>' +
        '</tr>';
    }).join('');

    return `
      <div class="grid" style="grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); gap:1rem">
        <div class="card">
          <h3>Stall · ${s.horses.length} Pferde</h3>
          <table><thead><tr><th>Name</th><th>Typ/Alter</th><th>Farbe</th><th>beste Disziplin</th><th>Ext.</th><th class="right">Wert</th></tr></thead>
          <tbody>${rows}</tbody></table>
        </div>
        <div>${selectedId ? horseDetail(Game.getHorse(selectedId)) : '<div class="card"><p class="muted">Pferd anklicken für Details, Training, Verkauf und Auktion.</p></div>'}</div>
      </div>`;
  };

  function sortHorses(a, b) {
    if (a.sex !== b.sex) return a.sex === 'hengst' ? -1 : 1;
    return ageYears(a) - ageYears(b);
  }

  function horseDetail(h) {
    if (!h) return '';
    const s = Game.state;
    const y = ageYears(h);
    const pheno = phenoOf(h);
    const adult = y >= Model.MATURITY_YEARS;

    const statLines = DISC.map((d) =>
      '<div class="statline"><span>' + d + (h.trainingFocus === d ? ' 🎯' : '') + '</span>' +
      bar(h.skill[d], h.potential[d]) + '<span class="right">' + Math.round(h.potential[d]) + '</span></div>'
    ).join('');

    const focusOpts = ['<option value="">— kein Fokus —</option>']
      .concat(DISC.map((d) => '<option value="' + d + '"' + (h.trainingFocus === d ? ' selected' : '') + '>' + d + '</option>'))
      .join('');

    const parents = (h.sireName || h.damName)
      ? '<div class="small muted">Abstammung: ' + esc(h.sireName || '?') + ' × ' + esc(h.damName || '?') + '</div>'
      : '<div class="small muted">Abstammung: unbekannt (' + esc(h.origin) + ')</div>';

    const showRec = h.showLog.length
      ? '<details><summary class="small muted">Turnierbilanz (' + h.shows + ' Starts, ' + h.wins + ' Siege)</summary>' +
        h.showLog.map((r) => '<div class="small">Wo.' + r.week + ': ' + esc(r.show) + ' — Platz ' + r.place + '/' + r.field +
          (r.prize ? ', ' + fmt(r.prize) : '') + '</div>').join('') + '</details>'
      : '';

    const inAuction = s.auction.lots.some((l) => l.consignedByPlayer && l.horse.id === h.id);

    return `
      <div class="card stack">
        <div class="row between">
          <h3 style="margin:0">${esc(h.name)} <button class="small secondary" data-action="rename-horse" data-id="${h.id}">✎</button></h3>
          <span class="muted small">${sexIcon(h)} · ${ageStr(h)}</span>
        </div>
        <div class="small muted">${esc(h.breed)}${(h.isMix || Model.isMixBreed(h.breed)) ? ' <span class="tag warn">Mix – kein Zuchtbuch</span>' : ''}</div>
        ${parents}
        <div><b>${esc(pheno.display)}</b> ${rarityTag(h)} ${pheno.blueEyes ? '<span class="tag">blaue Augen</span>' : ''}</div>
        <div class="geno-tokens">${esc(pheno.tokens)}</div>

        <div>
          <div class="row between"><b>Ausbildung / Potenzial</b><span class="muted small">Balken hell = genet. Potenzial</span></div>
          ${statLines}
        </div>
        ${subTraitDetails('Exterieur', Model.EXTERIEUR_TRAITS, Model.exterieurOf(h), h.conformation)}
        ${subTraitDetails('Interieur', Model.INTERIEUR_TRAITS, Model.interieurOf(h), h.temperament)}
        <div class="statline"><span>Gesundheit</span>${plainBar(h.health, h.health < 60 ? 'danger' : '')}<span></span></div>
        <div class="statline"><span>Energie</span>${plainBar(h.energy, 'warn')}<span></span></div>

        <div class="row">
          <label class="small" style="flex:1">Trainings-Fokus
            <select data-action="set-focus" data-id="${h.id}" ${adult ? '' : 'disabled'}>${focusOpts}</select>
          </label>
        </div>
        ${adult ? '' : '<p class="small muted">Training, Zucht und Turniere erst ab 3 Jahren.</p>'}
        ${showRec}

        <hr style="border:none;border-top:1px solid var(--border)">
        <div class="row">
          ${h.forSale
            ? '<button class="small secondary" data-action="unlist" data-id="' + h.id + '">Verkauf zurückziehen (' + fmt(h.forSale.price) + ')</button>'
            : '<button class="small" data-action="list-sale" data-id="' + h.id + '">Zum Verkauf anbieten</button>'}
          ${inAuction ? '<span class="tag">in Auktion</span>'
            : '<button class="small secondary" data-action="consign" data-id="' + h.id + '">In Auktion einliefern</button>'}
          <button class="small danger" data-action="quick-sell" data-id="${h.id}">Schnellverkauf (½ Wert)</button>
        </div>
        <div class="small muted">Schätzwert aktuell: <b>${fmt(Game.valuation(h))}</b></div>
      </div>`;
  }

  // --- 🧬 Zucht --------------------------------------------------------
  function sireExists(id) {
    if (Game.getHorse(id)) return true;
    return (Game.state.studRoster || []).some((x) => x.horse.id === id);
  }
  function resolveSireHorse(id) {
    const own = Game.getHorse(id);
    if (own) return own;
    const e = (Game.state.studRoster || []).find((x) => x.horse.id === id);
    return e ? e.horse : null;
  }

  // Erwartungswert-Tabelle: je Wert Hengst | Stute | Ø | Erwartung | Streubereich.
  // Die Erwartungs-Zelle wird gegen den Stutenwert eingefärbt (hebt/senkt).
  function fcRow(label, o, damVal) {
    const s = o.sire == null ? '–' : o.sire;
    const d = o.dam == null ? '–' : o.dam;
    const pm = o.parentMean == null ? '–' : o.parentMean;
    let cls = '';
    if (damVal != null) cls = o.expect >= damVal + 2 ? 'cmp-good' : (o.expect <= damVal - 3 ? 'cmp-bad' : '');
    return `<tr><td>${esc(label)}</td><td class="right">${s}</td><td class="right">${d}</td>` +
      `<td class="right muted small">${pm}</td><td class="right ${cls}"><b>${o.expect}</b></td>` +
      `<td class="right muted small">${Math.round(o.min)}–${Math.round(o.max)}</td></tr>`;
  }
  function fcTable(rowsHtml) {
    return `<table class="small"><thead><tr><th>Wert</th><th class="right">Hengst</th><th class="right">Stute</th>` +
      `<th class="right">Ø</th><th class="right">Erwartung</th><th class="right">Streubereich</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
  }
  function begabungTable(fc, dam) {
    return fcTable(DISC.map((d) => fcRow(d, fc.begabungen[d], dam.potential[d])).join(''));
  }
  function subTable(fc, group, dam) {
    const keys = group === 'Exterieur' ? Model.EXTERIEUR_TRAITS : Model.INTERIEUR_TRAITS;
    const traits = group === 'Exterieur' ? fc.exterieurTraits : fc.interieurTraits;
    const damObj = group === 'Exterieur' ? Model.exterieurOf(dam) : Model.interieurOf(dam);
    const summary = group === 'Exterieur' ? fc.exterieur : fc.interieur;
    let rows = keys.map((t) => fcRow(t, traits[t], damObj[t])).join('');
    rows += fcRow('Ø ' + group, Object.assign({ sire: null, dam: null }, summary),
      group === 'Exterieur' ? dam.conformation : dam.temperament);
    return fcTable(rows);
  }

  views.zucht = function () {
    const s = Game.state;
    const stallions = s.horses.filter((h) => h.sex === 'hengst' && ageYears(h) >= Model.MATURITY_YEARS);
    const mares = s.horses.filter((h) => h.sex === 'stute' && ageYears(h) >= Model.MATURITY_YEARS && !h.pregnancy);
    const roster = s.studRoster || [];

    if (breedSire && !sireExists(breedSire)) breedSire = null;
    if (breedDam && !Game.getHorse(breedDam)) breedDam = null;

    const mareOpt = ['<option value="">— Stute wählen —</option>'].concat(
      mares.map((h) => '<option value="' + h.id + '"' + (breedDam === h.id ? ' selected' : '') + '>' +
        esc(h.name) + ' (' + esc(h.breed) + ', ' + phenoOf(h).base + ', ' + ageYears(h).toFixed(0) + 'J.)</option>')
    ).join('');

    const selMare = breedDam ? Game.getHorse(breedDam) : null;
    const passung = (h) => selMare ? ' · Passung ' + Model.matingMatch(h, selMare).score : '';
    const sireOwn = stallions.map((h) => '<option value="' + h.id + '"' + (breedSire === h.id ? ' selected' : '') + '>' +
      esc(h.name) + ' — ' + esc(h.breed) + ', Ext.' + Math.round(h.conformation) + ', ' + Model.bestDiscipline(h) + ' ' + Math.round(h.potential[Model.bestDiscipline(h)]) + passung(h) + '</option>').join('');
    const sireStud = roster.map((x) => {
      const h = x.horse;
      return '<option value="' + h.id + '"' + (breedSire === h.id ? ' selected' : '') + '>' +
        esc(h.name) + ' — ' + esc(h.breed) + ', Ext.' + Math.round(h.conformation) + ', ' + Model.bestDiscipline(h) + ' ' +
        Math.round(h.potential[Model.bestDiscipline(h)]) + '  (Deckgeld ' + fmt(x.studFee) + ')' + passung(h) + '</option>';
    }).join('');
    const sireSelect = '<select data-action="pick-sire"><option value="">— Hengst wählen —</option>' +
      (sireOwn ? '<optgroup label="Eigene Hengste">' + sireOwn + '</optgroup>' : '') +
      (sireStud ? '<optgroup label="Deckstation (fremde Hengste)">' + sireStud + '</optgroup>' : '') +
      '</select>';

    const pregnant = s.horses.filter((h) => h.pregnancy);
    const pregHtml = pregnant.length
      ? '<div class="card"><h3>Tragende Stuten</h3>' + pregnant.map((h) =>
        '<div class="row between"><span>' + esc(h.name) + ' × ' + esc(h.pregnancy.sireName) +
        (h.pregnancy.external ? ' <span class="tag">Deckstation</span>' : '') + '</span><b>noch ' +
        h.pregnancy.weeksLeft + ' Wochen</b></div>').join('') + '</div>'
      : '';

    let planHtml = '<p class="muted">Hengst und Stute wählen — die Vorschau rechnet sofort.</p>';
    if (breedSire && breedDam) {
      const plan = Game.planBreeding(breedSire, breedDam);
      if (plan.error) planHtml = '<p class="tag warn">' + esc(plan.error) + '</p>';
      else {
        const fc = plan.statForecast;
        const dam = plan.dam;
        const m = plan.match;
        const coiPct = (plan.coi * 100).toFixed(1);
        const coiCls = plan.coi >= 0.125 ? 'warn' : plan.coi >= 0.0625 ? '' : 'good';
        const scoreCls = m.score >= 66 ? 'good' : m.score >= 45 ? '' : 'warn';
        const traitList = (arr) => arr.map((x) => x.group[0] + ': ' + x.trait + ' ' + x.from + '→' + x.to).join(' · ');

        planHtml = `
          <div class="row between"><span>Passung Hengst ↔ Stute</span><b class="tag ${scoreCls}" style="font-size:1rem">${m.score} / 100</b></div>
          ${m.improves.length ? '<div class="small"><span class="tag good">gleicht aus</span> ' + esc(traitList(m.improves)) + '</div>' : ''}
          ${m.worsens.length ? '<div class="small"><span class="tag warn">verschlechtert</span> ' + esc(traitList(m.worsens)) + '</div>' : ''}
          <div class="row between"><span>Fohlenrasse</span><b>${esc(fc.foalBreed)}</b></div>
          ${fc.mix ? '<p class="small tag warn">„Mix" hat kein Zuchtbuch — Marktwert rund −50 %, Zuchtschau-Malus, Begabungen/Exterieur im Schnitt −5.</p>' : ''}
          <div class="row between"><span>Inzuchtkoeffizient (COI)</span><b class="tag ${coiCls}">${coiPct}%</b></div>
          ${plan.coi >= 0.125 ? '<p class="small tag warn">Hohe Inzucht — spürbare Abzüge bei Gesundheit, Begabungen und Fruchtbarkeit.</p>' : ''}
          <div class="row between"><span>Empfängnis-Chance</span><b>${Math.round(plan.conceiveChance * 100)}%</b></div>
          <div class="row between"><span>Deckgebühr${plan.external ? ' (Deckstation)' : ''}</span><b>${fmt(plan.fee)}</b></div>

          <p style="margin:.6rem 0 .2rem"><b>Begabungen</b> <span class="muted small">(grün = hebt die Stute, rot = senkt sie)</span></p>
          ${begabungTable(fc, dam)}
          <details style="margin-top:.4rem"><summary class="small"><b>Exterieur im Detail</b> (6 Einzelnoten)</summary>${subTable(fc, 'Exterieur', dam)}</details>
          <details style="margin-top:.3rem"><summary class="small"><b>Interieur im Detail</b> (5 Einzelnoten)</summary>${subTable(fc, 'Interieur', dam)}</details>
          <div class="row between small" style="margin-top:.3rem"><span>Gesundheit (Erwartung)</span><b>${fc.gesundheit.expect} <span class="muted">(${Math.round(fc.gesundheit.min)}–100)</span></b></div>

          <p style="margin:.6rem 0 .2rem"><b>Mögliche Fohlenfarben</b> <span class="muted small">(Mendel)</span> — letale Fohlen ${plan.forecast.lethalPct} %</p>
          <ul class="foal-forecast small">
            ${plan.forecast.outcomes.map((o) => '<li>' + o.pct + ' %&nbsp; ' + esc(o.label) + '</li>').join('')}
          </ul>
          <button data-action="breed-confirm">Decken lassen (${fmt(plan.fee)})</button>`;
      }
    }

    // Deckstation-Übersicht. Ist eine Stute gewählt, wird nach Passung sortiert.
    const rosterRanked = roster.map((x) => ({
      x: x, m: selMare ? Model.matingMatch(x.horse, selMare) : null,
    }));
    if (selMare) rosterRanked.sort((a, b) => b.m.score - a.m.score);
    const studCards = rosterRanked.map(({ x, m }) => {
      const h = x.horse;
      const best = Model.bestDiscipline(h);
      const passCell = m
        ? '<td class="small"><b class="tag ' + (m.score >= 66 ? 'good' : m.score >= 45 ? '' : 'warn') + '">' + m.score + '</b>' +
          (m.improves.length ? '<br><span class="muted">+ ' + esc(m.improves.slice(0, 2).map((i) => i.trait).join(', ')) + '</span>' : '') + '</td>'
        : '';
      return `<tr class="clickable" data-action="pick-stud" data-id="${h.id}">
        <td><b>${esc(h.name)}</b><br><span class="muted small">${esc(h.breed)}${x.elite ? ' · <span class="tag rare">Spitzenvererber</span>' : ''}</span></td>
        <td class="small">${esc(phenoOf(h).base)}<br>${ageYears(h).toFixed(0)} J.</td>
        <td class="small">Ext. ${Math.round(h.conformation)}<br>Int. ${Math.round(h.temperament)}</td>
        <td class="small">${best} ${Math.round(h.potential[best])}</td>
        ${passCell}
        <td class="right"><b>${fmt(x.studFee)}</b></td>
      </tr>`;
    }).join('');
    const studHead = selMare
      ? `<tr><th>Hengst</th><th>Farbe/Alter</th><th>Ext./Int.</th><th>beste Beg.</th><th>Passung zu ${esc(selMare.name)}</th><th class="right">Deckgeld</th></tr>`
      : '<tr><th>Hengst</th><th>Farbe/Alter</th><th>Ext./Int.</th><th>beste Begabung</th><th class="right">Deckgeld</th></tr>';

    return `
      <div class="grid cols-2">
        <div class="card stack">
          <h3>Zuchtplaner</h3>
          ${mares.length ? '' : '<p class="tag warn">Keine deckbereite Stute (≥ 3 Jahre, nicht tragend) im Stall.</p>'}
          <label class="small">Hengst (eigener oder Deckstation)
            ${sireSelect}
          </label>
          <label class="small">Stute
            <select data-action="pick-dam">${mareOpt}</select>
          </label>
          <div class="small muted">Tragezeit ${Model.GESTATION_WEEKS} Wochen. Farbe: je Genort 1 Allel von Vater + Mutter (Mendel).
          Werte: Erwartung = Ø Eltern, leicht Richtung 50 gezogen, minus COI- und Mix-Abzug; dann Zufallsstreuung.</div>
        </div>
        <div class="card stack">
          <h3>Vorschau</h3>
          ${planHtml}
        </div>
      </div>

      ${pregHtml ? '<div style="margin-top:1rem">' + pregHtml + '</div>' : ''}

      <div class="card" style="margin-top:1rem">
        <h3>🏇 Deckstation</h3>
        <p class="small muted">Fremde Hengste gegen Deckgeld — auch ohne eigenen Spitzenhengst. Zeile anklicken = als Hengst übernehmen.
        ${selMare ? 'Sortiert nach <b>Passung zu ' + esc(selMare.name) + '</b> (0–100): wie gut der Hengst ihre schwachen Einzelnoten ausgleicht, ohne ihre Stärken zu verlieren.' : 'Wähle oben eine Stute, dann wird nach Passung sortiert.'}
        Roster wechselt alle 6 Wochen (nächster: Woche ${s.nextStudWeek || 0}).</p>
        <table><thead>${studHead}</thead><tbody>${studCards}</tbody></table>
      </div>

      <div class="card" style="margin-top:1rem">
        <h3>Wie die Werte vererbt werden</h3>
        <p class="small muted">
          <b>Begabungen</b> (6 Disziplinen), <b>Exterieur</b> (6 Einzelnoten: Kopf &amp; Hals, Schulter, Rücken,
          Hinterhand, Fundament, Bewegung) und <b>Interieur</b> (5 Einzelnoten: Nervenstärke,
          Leistungsbereitschaft, Rittigkeit, Lernwille, Umgänglichkeit) erben <em>jede für sich</em> nach:
          <em>Erwartung = Ø(Hengst, Stute) − COI-Abzug − Mix-Abzug</em>, plus ein kleiner Zug Richtung Mitte,
          dann Zufallsstreuung. Genau deshalb kannst du eine im Rücken schwache Stute an einem im Rücken
          starken Hengst „reparieren". <b>Gesundheit</b> startet bei ~96, fast nur Inzucht drückt sie (COI × 72).
          <b>Farbe</b> ist reine Mendel-Vererbung je Genort; homozygotes Frame Overo / Roan ist letal.
        </p>
      </div>`;
  };

  // --- 🏆 Schauen -----------------------------------------------------
  views.schauen = function () {
    const s = Game.state;
    const eligible = s.horses.filter((h) => ageYears(h) >= Model.MATURITY_YEARS);

    const cards = s.shows.map((show) => {
      const entered = show.entered.map((id) => Game.getHorse(id)).filter(Boolean);
      const canEnter = eligible.filter((h) => show.entered.indexOf(h.id) === -1 && !(h.pregnancy && show.type === 'sport'));
      const sel = '<select data-show="' + show.id + '" class="enter-sel">' +
        ['<option value="">Pferd wählen…</option>'].concat(canEnter.map((h) =>
          '<option value="' + h.id + '">' + esc(h.name) +
          (show.type === 'sport' ? ' — ' + show.discipline + ' ' + Math.round(h.skill[show.discipline]) : ' — Ext. ' + Math.round(h.conformation)) +
          '</option>')).join('') + '</select>';

      const res = show._playerResults && show._playerResults.length
        ? '<div class="small">Ergebnis: ' + show._playerResults.map((r) => esc(r.name) + ' Platz ' + r.place).join(', ') + '</div>'
        : '';

      return `<div class="card stack">
        <div class="row between"><b>${esc(show.name)}</b><span class="tag">Level ${show.level}</span></div>
        <div class="small muted">${show.type === 'sport' ? 'Disziplin: ' + show.discipline : 'Zuchtschau (Exterieur, Typ, Abstammung)'} ·
          Nenngeld ${fmt(show.entryFee)} · Preisgeld gesamt ${fmt(show.prizePool)}</div>
        ${entered.length ? '<div class="small">Genannt: ' + entered.map((h) =>
          esc(h.name) + ' <button class="small secondary" data-action="withdraw" data-show="' + show.id + '" data-id="' + h.id + '">×</button>').join(' ') + '</div>' : ''}
        ${show.done ? '<span class="tag good">gelaufen</span>' + res : sel +
          ' <button class="small" data-action="enter-show" data-show="' + show.id + '">Nennen</button>'}
      </div>`;
    }).join('');

    return `
      <div class="card">
        <h3>Schaukalender</h3>
        <p class="small muted">Genannte Pferde starten automatisch beim nächsten „Woche weiter". Danach kommt ein neuer Kalender.
        Siege bringen Preisgeld und Prestige und steigern den Pferdewert.</p>
      </div>
      <div class="grid cols-2" style="margin-top:1rem">${cards}</div>`;
  };

  // --- 🔨 Auktion ----------------------------------------------------
  views.auktion = function () {
    const s = Game.state;
    const lots = s.auction.lots.map((lot, i) => {
      const h = lot.horse;
      const minNext = lot.currentBid + Economy.bidIncrement(lot.currentBid);
      const leadTxt = lot.leader === 'player' ? '<span class="tag good">du führst</span>'
        : lot.leader === 'ai' ? '<span class="tag warn">Konkurrenz führt</span>' : '';
      return `<div class="card stack">
        <div class="row between"><b>${esc(h.name)}</b>${lot.consignedByPlayer ? '<span class="tag">dein Los</span>' : ''}</div>
        <div class="small muted">${esc(h.breed)} · ${sexIcon(h)} · ${ageYears(h).toFixed(0)} J. · ${esc(phenoOf(h).display)}</div>
        <div class="small">Exterieur ${Math.round(h.conformation)} · beste Disziplin ${Model.bestDiscipline(h)} ${Math.round(h.skill[Model.bestDiscipline(h)])} · ${h.wins} Siege</div>
        <div class="row between"><span>Schätzwert</span><b>${fmt(lot.estimate)}</b></div>
        <div class="row between"><span>Aktuelles Gebot</span><b>${fmt(lot.currentBid)}</b> ${leadTxt}</div>
        ${lot.consignedByPlayer
          ? '<div class="small muted">Limit (Reserve): ' + fmt(lot.reserve || 0) + '. Zuschlag beim nächsten Wochenwechsel.</div>'
          : '<div class="row"><input type="number" class="bid-input" id="bid-' + i + '" value="' + minNext + '" step="' + Economy.bidIncrement(lot.currentBid) + '">' +
            '<button class="small" data-action="bid" data-idx="' + i + '">Bieten</button></div>'}
      </div>`;
    }).join('');

    const consignable = s.horses.filter((h) => !h.pregnancy && !s.auction.lots.some((l) => l.consignedByPlayer && l.horse.id === h.id));
    const consignSel = '<select id="consign-sel">' + ['<option value="">Pferd wählen…</option>']
      .concat(consignable.map((h) => '<option value="' + h.id + '">' + esc(h.name) + ' (Schätzwert ' + fmt(Game.valuation(h)) + ')</option>')).join('') + '</select>';

    return `
      <div class="card">
        <h3>Auktion — Zuschlag in Woche ${s.auction.nextWeek} (in ${Math.max(0, s.auction.nextWeek - s.week)} Wochen)</h3>
        <p class="small muted">Beim Bieten kontert die Konkurrenz sofort bis zu ihrem (verdeckten) Maximum.
        Führst du beim Zuschlag, geht das Pferd in deinen Stall (wenn Platz &amp; Geld reichen).</p>
        <div class="row" style="margin-top:.5rem">
          ${consignSel}
          <input type="number" id="consign-reserve" class="bid-input" placeholder="Limit €">
          <button class="small secondary" data-action="consign-auction">Eigenes Pferd einliefern</button>
        </div>
      </div>
      <div class="grid cols-2" style="margin-top:1rem">${lots}</div>`;
  };

  // --- 🛒 Markt -----------------------------------------------------
  views.markt = function () {
    const s = Game.state;
    const offers = s.market.map((o, i) => {
      const h = o.horse;
      const best = Model.bestDiscipline(h);
      return `<div class="card stack">
        <div class="row between"><b>${esc(h.name)}</b><span class="tag${(h.isMix || Model.isMixBreed(h.breed)) ? ' warn' : ''}">${esc(h.breed)}</span></div>
        <div class="small muted">${sexIcon(h)} · ${ageYears(h).toFixed(1)} J. · ${esc(phenoOf(h).display)} ${rarityTag(h)}</div>
        <div class="geno-tokens">${esc(phenoOf(h).tokens)}</div>
        <div class="small">Exterieur ${Math.round(h.conformation)} · Interieur ${Math.round(h.temperament)} · Gesundheit ${Math.round(h.health)}</div>
        <div class="statline"><span>${best}</span>${bar(h.skill[best], h.potential[best])}<span class="right">${Math.round(h.potential[best])}</span></div>
        <div class="row between"><span>Preis</span><b>${fmt(o.price)}</b> <span class="muted small">(Schätzwert ${fmt(Game.valuation(h))})</span></div>
        <button class="small" data-action="buy-market" data-idx="${i}" ${s.cash < o.price || Game.stallFree() < 1 ? 'disabled' : ''}>Kaufen</button>
      </div>`;
    }).join('');

    const listings = s.saleListings.map((l) => {
      const h = Game.getHorse(l.horseId);
      if (!h) return '';
      return '<tr><td>' + esc(h.name) + '</td><td>' + fmt(l.price) + '</td><td>' + l.weeks + ' Wo.</td>' +
        '<td class="right"><button class="small secondary" data-action="unlist" data-id="' + h.id + '">zurückziehen</button></td></tr>';
    }).join('');

    return `
      <div class="card">
        <h3>Markt — Angebot erneuert sich alle 2 Wochen (nächste: Woche ${s.nextMarketWeek})</h3>
        <p class="small muted">Freie Stallplätze: <b>${Game.stallFree()}</b>. Bessere Pferde erscheinen mit steigendem Gestüts-Rang.</p>
      </div>
      <div class="grid cols-3" style="margin-top:1rem">${offers}</div>
      <div class="card" style="margin-top:1rem">
        <h3>Deine Verkaufsangebote</h3>
        ${listings ? '<table><thead><tr><th>Pferd</th><th>Preis</th><th>gelistet</th><th></th></tr></thead><tbody>' + listings + '</tbody></table>'
          : '<p class="muted small">Keine aktiven Verkaufsangebote. Im Tab „Stall" ein Pferd anbieten.</p>'}
      </div>`;
  };

  // ======================================================================
  //  EVENTS
  // ======================================================================
  function bindGlobal() {
    $('#btn-week').addEventListener('click', () => {
      $('#btn-week').disabled = true;
      Game.advanceWeek();
      setTimeout(() => { $('#btn-week').disabled = false; }, 120);
      if (currentTab === 'schauen' || currentTab === 'auktion') showTab(currentTab);
    });
    $('#btn-save').addEventListener('click', () => { Game.save(); toast('Gespeichert.'); });
    $('#btn-menu').addEventListener('click', () => { $('#menu-overlay').hidden = false; });
    $('#btn-menu-close').addEventListener('click', () => { $('#menu-overlay').hidden = true; });
    $('#btn-export').addEventListener('click', () => {
      const t = $('#export-text'); t.hidden = false; t.value = Game.exportSave(); t.select();
    });
    $('#btn-wipe').addEventListener('click', () => {
      if (confirm('Spielstand wirklich unwiderruflich löschen?')) { Game.wipe(); location.reload(); }
    });
    document.querySelectorAll('.tab-btn').forEach((b) =>
      b.addEventListener('click', () => showTab(b.dataset.tab)));

    // Delegierte Klicks in der Ansicht.
    $('#view').addEventListener('click', onViewClick);
    $('#view').addEventListener('change', onViewChange);
  }

  function onViewChange(e) {
    const t = e.target;
    if (t.dataset.action === 'set-focus') {
      Game.setTrainingFocus(t.dataset.id, t.value);
      toast(t.value ? 'Trainings-Fokus: ' + t.value : 'Fokus entfernt.');
    } else if (t.dataset.action === 'pick-sire') { breedSire = t.value || null; render(); }
    else if (t.dataset.action === 'pick-dam') { breedDam = t.value || null; render(); }
  }

  function onViewClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const s = Game.state;

    if (a === 'select-horse') { selectedId = el.dataset.id; render(); return; }

    if (a === 'pick-stud') { breedSire = el.dataset.id; showTab('zucht'); toast('Hengst aus Deckstation gewählt.'); return; }

    if (a === 'rename-horse') {
      const h = Game.getHorse(el.dataset.id);
      const n = prompt('Neuer Name für ' + h.name + ':', h.name);
      if (n && n.trim()) { Game.nameFoal(h.id, n.trim()); }
      return;
    }

    if (a === 'buy-fac') { const r = Game.buyFacility(el.dataset.key); if (!r.ok) toast(r.msg, true); return; }

    if (a === 'rename-stud') {
      const n = prompt('Neuer Gestütsname:', s.studName);
      if (n) Game.setStudName(n);
      return;
    }

    if (a === 'accept-offer') { const r = Game.acceptPendingOffer(); if (r.ok) toast('Verkauft für ' + fmt(r.amount) + '.'); return; }
    if (a === 'decline-offer') { Game.declinePendingOffer(); return; }

    if (a === 'list-sale') {
      const h = Game.getHorse(el.dataset.id);
      const def = Game.valuation(h);
      const p = prompt('Verkaufspreis für ' + h.name + ' (Schätzwert ' + fmt(def) + '):', def);
      if (p) { const r = Game.listForSale(h.id, parseInt(p, 10)); if (!r.ok) toast(r.msg, true); }
      return;
    }
    if (a === 'unlist') { Game.unlist(el.dataset.id); return; }
    if (a === 'quick-sell') {
      const h = Game.getHorse(el.dataset.id);
      if (confirm('„' + h.name + '" sofort für ' + fmt(Math.round(Game.valuation(h) * 0.5)) + ' an einen Händler verkaufen?')) {
        const r = Game.euthanizeOrSellQuick(h.id);
        if (r.ok) { toast('Verkauft für ' + fmt(r.amount) + '.'); selectedId = null; render(); }
      }
      return;
    }
    if (a === 'consign') {
      const h = Game.getHorse(el.dataset.id);
      const est = Game.valuation(h);
      const res = prompt('Mindestpreis (Reserve) für ' + h.name + ' in der Auktion (Schätzwert ' + fmt(est) + '):', Math.round(est * 0.6));
      if (res != null) { const r = Game.consignToAuction(h.id, parseInt(res, 10)); if (!r.ok) toast(r.msg, true); else toast('In die Auktion eingeliefert.'); }
      return;
    }

    if (a === 'breed-confirm') {
      const r = Game.doBreeding(breedSire, breedDam);
      if (!r.ok) toast(r.msg, true);
      else toast(r.conceived ? 'Stute ist tragend!' : 'Leider nicht erfolgreich.');
      render();
      return;
    }

    if (a === 'enter-show') {
      const sel = $('.enter-sel[data-show="' + el.dataset.show + '"]');
      if (!sel || !sel.value) { toast('Erst ein Pferd wählen.', true); return; }
      const r = Game.enterShow(el.dataset.show, sel.value);
      if (!r.ok) toast(r.msg, true); else toast('Genannt.');
      return;
    }
    if (a === 'withdraw') { Game.withdrawShow(el.dataset.show, el.dataset.id); return; }

    if (a === 'bid') {
      const idx = parseInt(el.dataset.idx, 10);
      const inp = $('#bid-' + idx);
      const r = Game.auctionBid(idx, parseInt(inp.value, 10));
      toast(r.msg, !r.ok);
      return;
    }
    if (a === 'consign-auction') {
      const sel = $('#consign-sel'), rv = $('#consign-reserve');
      if (!sel.value) { toast('Erst ein Pferd wählen.', true); return; }
      const r = Game.consignToAuction(sel.value, rv.value ? parseInt(rv.value, 10) : null);
      if (!r.ok) toast(r.msg, true); else toast('Eingeliefert.');
      return;
    }

    if (a === 'buy-market') {
      const r = Game.buyMarketHorse(parseInt(el.dataset.idx, 10));
      if (!r.ok) toast(r.msg, true); else toast('Gekauft!');
      return;
    }
  }

  // --- Startbildschirm --------------------------------------------------
  function bindStart() {
    if (Game.hasSave()) $('#btn-continue').hidden = false;
    $('#btn-new').addEventListener('click', () => {
      Game.newGame($('#new-stud-name').value.trim());
      $('#start-overlay').hidden = true;
      showTab('gestüt');
    });
    $('#btn-continue').addEventListener('click', () => {
      if (Game.load()) { $('#start-overlay').hidden = true; showTab('gestüt'); }
      else toast('Kein Spielstand gefunden.', true);
    });
    $('#btn-import').addEventListener('click', () => {
      try {
        Game.importSave($('#import-text').value);
        $('#start-overlay').hidden = true; showTab('gestüt');
      } catch (err) { toast('Import fehlgeschlagen: ' + err.message, true); }
    });
  }

  function init() {
    bindGlobal();
    bindStart();
    Game.onChange(() => render());
  }

  return { init: init, showTab: showTab, toast: toast };
})();
