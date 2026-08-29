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
  // Vom Spieler gesetzte Suchkriterien für die Deckstation.
  let studFilter = { breed: '', exMin: '', disc: '', begMin: '', inMin: '', heMin: '', feeMax: '', sort: 'fee', dir: 1 };

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

  // Zucht-/Prämierungs-Badges.
  function zuchtBadges(h) {
    const b = [];
    if (h.noPapers || Model.isMixBreed(h.breed)) b.push('<span class="tag warn">ohne Zuchtbucheintrag</span>');
    else if (h.zuchtzulassung) b.push('<span class="tag good">' + esc(h.zuchtzulassung) + '</span>');
    if (h.titel) b.push('<span class="tag rare">' + esc(h.titel) + '</span>');
    if (h.praemie) b.push('<span class="tag rare">' + esc(h.praemie) + '</span>');
    if (h.leistungspruefung) {
      const idx = h.leistungspruefung.index;
      b.push('<span class="tag ' + (idx >= 80 ? 'good' : 'warn') + '">LP-Index ' + idx + '</span>');
    }
    const br = Model.breederRating(h);
    if (br) b.push('<span class="tag rare" title="Ø Fohlenqualität ' + br.avg.toFixed(2) + ' aus ' + br.count + ' Fohlen">Vererber ' + '★'.repeat(br.stars) + '</span>');
    return b.join(' ');
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
    const sea = Economy.season(s.week);
    $('#tb-year').textContent = sea.icon + ' ' + sea.name + ' · Saison ' + (s.seasonYear || 1);
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
    const todos = Game.weeklyTodos();
    const todoHtml = todos.length
      ? todos.map((it) => '<div class="todo-item ' + esc(it.kind) + '" data-action="goto-tab" data-tab="' + esc(it.tab) + '">' +
          it.icon + ' ' + esc(it.text) + ' <span class="muted small">→ ' + esc(it.tab) + '</span></div>').join('')
      : '<p class="muted small">Alles erledigt — nichts hält dich vom Wochenwechsel ab.</p>';

    return `
      <div class="card" style="margin-bottom:1rem;border-color:${todos.some((t) => t.kind === 'warn') ? 'var(--warn)' : 'var(--border)'}">
        <h3>📋 To-dos vor „Woche weiter"</h3>
        ${todoHtml}
      </div>
      <div class="grid cols-2">
        <div class="card stack">
          <h3>${esc(s.studName)} <button class="small secondary" data-action="rename-stud">umbenennen</button></h3>
          <div class="row between"><span>Rang</span><b>${esc(tier.name)} <span class="stars">${'★'.repeat(tier.stars)}</span></b></div>
          <div class="row between"><span>Kasse</span><b class="${s.cash < 0 ? 'tag warn' : ''}">${fmt(s.cash)}</b></div>
          <div class="row between"><span>Pferde</span><b>${s.horses.length} / ${Economy.stallCapacity(s)} Plätze</b></div>
          <div class="row between"><span>Wochenunterhalt</span><b>${fmt(upkeep)}</b></div>
          <div class="row between small"><span class="muted">Hufschmied Wo. ${s.nextFarrierWeek || 0} · Wurmkur/Impfung Wo. ${s.nextVetRoutineWeek || 0}</span></div>
          ${s.debt > 0 ? `<div class="row between"><span>Kredit-Restschuld</span><b class="tag warn">${fmt(s.debt)}</b></div>` : ''}
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
        ${bankCard(s)}
        ${statsCard(s)}
      </div>
      <div class="grid cols-2" style="margin-top:1rem">
        ${staffCard(s)}
        ${sponsorCard(s)}
      </div>
      <div class="grid cols-3" style="margin-top:1rem">
        ${breedingOrderCard(s)}
        ${zuchtbuchCard(s)}
        ${boardingCard(s)}
      </div>

      <div class="card" style="margin-top:1rem">
        <h3>🥕 Futter &amp; Pflege</h3>
        <p class="small muted">Gilt für den ganzen Bestand. Umstellen ist sofort und kostenlos — es ändert nur die laufenden Kosten je Pferd/Woche.</p>
        <div class="grid cols-2">
          ${feedCareBlock('feed', 'Fütterung', Economy.FEED, s.feedLevel != null ? s.feedLevel : 1)}
          ${feedCareBlock('care', 'Pflege / Stallmanagement', Economy.CARE, s.careLevel != null ? s.careLevel : 1)}
        </div>
        <div class="row between small" style="margin-top:.6rem">
          <span>Kosten je Pferd/Woche${Economy.season(s.week).idx === 3 ? ' <span class="tag warn">Winter +25 % Futter</span>' : ''}${(s.staff || []).some((x) => x.role === 'stallmeister') ? ' <span class="tag good">Stallmeister −20 % Pflege</span>' : ''}</span>
          <b>${fmt(Math.round(Economy.feedDef(s).cost * (Economy.season(s.week).idx === 3 ? 1.25 : 1) + Economy.careDef(s).cost * ((s.staff || []).some((x) => x.role === 'stallmeister') ? 0.8 : 1)))} × ${s.horses.length} Pferde</b>
        </div>
      </div>

      <div class="card" style="margin-top:1rem">
        <h3>👥 Freunde (Pferde tauschen &amp; Deckhengste teilen)</h3>
        <p class="small muted">Keine Anmeldung, kein Server, keine Datenerhebung (DSGVO). Dein Freundschaftscode ist eine
        zufällige Kennung nur in diesem Browser. Alle Tauschcodes sind reiner Text, den du selbst weitergibst — geräteübergreifend.</p>
        <div class="row">
          <span>Dein Freundschaftscode:</span>
          <b class="geno-tokens" style="padding:.2rem .5rem">${esc(s.friendCode || '—')}</b>
          <button class="small secondary" data-action="copy-friendcode">kopieren</button>
        </div>
        <div class="row" style="margin-top:.5rem;align-items:flex-start">
          <textarea id="redeem-input" rows="2" style="flex:1;min-width:220px;font-family:ui-monospace,Consolas,monospace;font-size:.78rem" placeholder="Code eines Freundes einfügen (Angebot, Kaufgebot, Lieferung oder Deckhengst)…"></textarea>
          <button class="small" data-action="open-code">Öffnen</button>
        </div>
        <p class="small muted">Beim Öffnen siehst du zuerst das Pferd und seine Werte — kaufen bzw. übernehmen musst du dann selbst bestätigen.
        Im Tab „Stall" bietest du eigene Pferde an (privat = nur ein bestimmter Freundescode, öffentlich = wer zuerst bietet) oder gibst einen Deckhengst frei.</p>
        ${friendPending(s)}
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

  // Ein Auswahl-Block für Fütterung bzw. Pflege.
  function feedCareBlock(kind, title, list, level) {
    const cur = list[level];
    const opts = list.map((l, i) =>
      '<option value="' + i + '"' + (i === level ? ' selected' : '') + '>' + esc(l.label) + ' — ' + fmt(l.cost) + '/Pferd</option>'
    ).join('');
    let fx;
    if (kind === 'feed') {
      fx = 'Energie/Wo. +' + cur.energyRegen + ' · Training ×' + cur.trainMult.toFixed(2) +
        ' · Fruchtbarkeit ×' + cur.fertMult.toFixed(2) + ' · Fohlengesundheit ' + (cur.foalHealth >= 0 ? '+' : '') + cur.foalHealth +
        (cur.healthRegen ? ' · Gesundheit +' + cur.healthRegen + '/Wo.' : '');
    } else {
      fx = 'Krankheitsrisiko ×' + cur.eventMult.toFixed(2) + ' · Turnier ' + (cur.showBonus >= 0 ? '+' : '') + cur.showBonus +
        ' · Altersverschleiß ×' + cur.ageHealthMult.toFixed(2) +
        (cur.interieurDrift ? ' · Interieur wächst langsam' : '');
    }
    return `<div class="card" style="background:var(--surface-2)">
      <div class="row between"><b>${esc(title)}</b><span class="tag">${fmt(cur.cost)}/Pferd/Wo.</span></div>
      <div class="small muted">${esc(cur.desc)}</div>
      <label class="small" style="margin-top:.4rem;display:block">Stufe wählen
        <select data-action="set-${kind}">${opts}</select>
      </label>
      <div class="small" style="margin-top:.35rem">${esc(fx)}</div>
    </div>`;
  }

  function bankCard(s) {
    const max = Economy.maxLoan(s);
    const room = max - (s.debt || 0);
    return `<div class="card stack">
      <h3>🏦 Bank</h3>
      <div class="row between"><span>Restschuld</span><b class="${s.debt > 0 ? 'tag warn' : ''}">${fmt(s.debt || 0)}</b></div>
      <div class="row between"><span>Kreditrahmen frei</span><b>${fmt(Math.max(0, room))}</b> <span class="muted small">von ${fmt(max)}</span></div>
      <div class="small muted">Zins ${(Economy.LOAN_RATE * 100).toFixed(1)} % pro Woche auf die Restschuld.</div>
      <div class="row">
        <input type="number" id="loan-amount" class="bid-input" placeholder="Betrag €" step="1000">
        <button class="small" data-action="take-loan" ${room <= 0 ? 'disabled' : ''}>Kredit aufnehmen</button>
        <button class="small secondary" data-action="repay-loan" ${!(s.debt > 0) ? 'disabled' : ''}>tilgen</button>
      </div>
    </div>`;
  }

  function statsCard(s) {
    const h = s.history || [];
    let spark = '';
    if (h.length >= 2) {
      const vals = h.slice(-60).map((x) => x.cash);
      const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
      const span = (mx - mn) || 1;
      const pts = vals.map((v, i) => (i / (vals.length - 1) * 100).toFixed(1) + ',' + (30 - (v - mn) / span * 28).toFixed(1)).join(' ');
      spark = '<svg viewBox="0 0 100 30" preserveAspectRatio="none" style="width:100%;height:56px;background:var(--surface-2);border-radius:var(--radius)">' +
        '<polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="1"/></svg>' +
        '<div class="row between small muted"><span>' + fmt(mn) + '</span><span>Kassenverlauf (bis 60 Wo.)</span><span>' + fmt(mx) + '</span></div>';
    }
    const bs = s.stats.bestSale;
    return `<div class="card stack">
      <h3>📈 Statistik</h3>
      ${spark || '<p class="small muted">Verlauf erscheint nach ein paar Wochen.</p>'}
      <div class="row between"><span>Gesamteinnahmen</span><b>${fmt(s.stats.totalEarnings || 0)}</b></div>
      <div class="row between"><span>Bester Einzelverkauf</span><b>${bs ? esc(bs.name) + ' — ' + fmt(bs.amount) : '—'}</b></div>
      <div class="row between"><span>Größter Turniertag</span><b>${fmt(s.stats.biggestWin || 0)}</b></div>
      <div class="row between"><span>Bestandswert</span><b>${fmt(s.horses.reduce((a, x) => a + Game.valuation(x), 0))}</b></div>
    </div>`;
  }

  const STAFF_ICON = { bereiter: '🏇', stallmeister: '🧹', tierarzt: '🩺', vermarkter: '📣' };
  function staffRoleName(x) {
    return x.role === 'bereiter' ? 'Bereiter/in — ' + esc(x.disciplines.join(', '))
      : x.role === 'stallmeister' ? 'Stallmeister/in'
      : x.role === 'tierarzt' ? 'Tierarzt/in'
      : 'Vermarkter/in';
  }
  function staffRoleEffect(x) {
    if (x.role === 'bereiter') return 'mehr Trainingszuwachs in diesen Disziplinen';
    if (x.role === 'stallmeister') return '−20 % Pflege, seltener Zwischenfälle';
    if (x.role === 'tierarzt') return 'weniger Tierarztkosten, Geburts- & Krankheitsrisiko';
    return 'besserer Verkaufserlös/-tempo, Deckstation & Pensionsstall';
  }
  function staffCard(s) {
    const mine = (s.staff || []).map((x) =>
      '<div class="row between"><span>' + (STAFF_ICON[x.role] || '🧑') + ' ' + staffRoleName(x) + ' <span class="muted small">' + esc(x.name) +
      ' · Können ' + x.skill + ' · ' + fmt(x.salary) + '/Wo. · ' + staffRoleEffect(x) + '</span></span>' +
      '<button class="small danger" data-action="fire-staff" data-id="' + x.id + '">entlassen</button></div>').join('') || '<p class="small muted">Noch kein Personal.</p>';
    const cands = (s.staffMarket || []).map((x, i) =>
      '<div class="row between"><span>' + (STAFF_ICON[x.role] || '🧑') + ' ' + staffRoleName(x) +
      ' · Können ' + x.skill + ' · ' + fmt(x.salary) + '/Wo. <span class="muted small">' + esc(x.name) + ' — ' + staffRoleEffect(x) + '</span></span>' +
      '<button class="small" data-action="hire-staff" data-idx="' + i + '">einstellen (' + fmt(x.salary * 2) + ')</button></div>').join('');
    return `<div class="card stack">
      <h3>🧑‍🌾 Personal <span class="muted small">(${(s.staff || []).length}/${Economy.maxStaff(s)})</span></h3>
      ${mine}
      <div class="small muted" style="margin-top:.3rem">Verfügbar (wechselt alle 8 Wochen):</div>
      ${cands}
    </div>`;
  }

  function sponsorCard(s) {
    const active = (s.sponsors || []).map((c) =>
      '<div class="row between"><span>💼 ' + esc(c.name) + ' · +' + fmt(c.weeklyPay) + '/Wo. · noch ' + c.weeksLeft + ' Wo. · Starts ' +
      (c.starts || 0) + '/' + c.reqStarts + ' <span class="muted small">Bonus bei Erfüllung ' + fmt(c.bonus) + '</span></span>' +
      '<button class="small secondary" data-action="drop-sponsor" data-id="' + c.id + '">beenden</button></div>').join('') || '<p class="small muted">Kein aktiver Vertrag.</p>';
    const offers = (s.sponsorOffers || []).map((o, i) =>
      '<div class="row between"><span>💼 ' + esc(o.name) + ' · +' + fmt(o.weeklyPay) + '/Wo. · ' + o.weeks + ' Wo. · Auflage ' + o.reqStarts +
      ' Turnierstarts · Bonus ' + fmt(o.bonus) + '</span>' +
      '<button class="small" data-action="sign-sponsor" data-idx="' + i + '">unterschreiben</button></div>').join('');
    return `<div class="card stack">
      <h3>💼 Sponsoren <span class="muted small">(${(s.sponsors || []).length}/2)</span></h3>
      ${active}
      ${offers ? '<div class="small muted" style="margin-top:.3rem">Angebote:</div>' + offers : (s.prestige < 60 ? '<p class="small muted">Sponsoren melden sich ab etwas Prestige.</p>' : '')}
    </div>`;
  }

  function breedingOrderCard(s) {
    const orders = (s.breedingOrders || []).map((o) => {
      const matches = (s.horses || []).filter((h) => !h.offered && !h.pregnancy && Economy.orderMatch(o, h, s.week).ok);
      const left = o.deadlineWeek - s.week;
      const pick = matches.length
        ? '<select data-role="order-horse">' +
            matches.map((h) => '<option value="' + h.id + '">' + esc(h.name) + ' (' + esc(h.breed) + ', ' + ageYears(h).toFixed(0) + ' J.)</option>').join('') +
          '</select> <button class="small" data-action="fulfill-order" data-id="' + o.id + '">abgeben</button>'
        : '<span class="muted small">kein passendes Pferd im Bestand</span>';
      return '<div class="card" style="background:var(--surface-2)">' +
        '<div class="row between"><b>' + esc(o.client) + '</b><span class="tag ' + (left <= 3 ? 'warn' : '') + '">noch ' + left + ' Wo.</span></div>' +
        '<div class="small muted">' + esc(Economy.orderSummary(o)) + '</div>' +
        '<div class="small" style="margin-top:.3rem">Prämie <b>' + fmt(o.reward) + '</b> · +' + o.prestige + ' Prestige</div>' +
        '<div style="margin-top:.4rem">' + pick + '</div></div>';
    }).join('') || '<p class="small muted">Zur Zeit keine offenen Aufträge.</p>';
    return `<div class="card stack">
      <h3>🎯 Zuchtaufträge <span class="muted small">(${(s.breedingOrders || []).length})</span></h3>
      <p class="small muted">Verbände &amp; Kunden suchen Pferde nach Vorgabe. Passendes Pferd abgeben → Prämie + Prestige.
      Läuft ein Auftrag aus, kostet das −4 Prestige.</p>
      ${orders}
    </div>`;
  }

  function zuchtbuchCard(s) {
    const homebred = (s.horses || []).filter((h) => h.origin === 'eigene Zucht');
    const best = homebred.slice().sort((a, b) => Game.valuation(b) - Game.valuation(a))[0];
    const avgQ = homebred.length ? Math.round(homebred.reduce((a, h) => a + (h.quality || 0), 0) / homebred.length * 100) : 0;
    return `<div class="card stack">
      <h3>📖 Mein Zuchtbuch</h3>
      <label class="small" style="display:block">Zuchtstempel / Präfix <span class="muted">(wird eigenen Nachzuchten vorangestellt)</span>
        <div class="row" style="margin-top:.2rem">
          <input type="text" id="prefix-input" value="${esc(s.studPrefix || '')}" maxlength="16" placeholder="z.B. Eichenhof" style="flex:1;min-width:120px">
          <button class="small" data-action="save-prefix">speichern</button>
        </div>
      </label>
      <label class="small row" style="gap:.4rem;cursor:pointer"><input type="checkbox" data-action="toggle-prefix" ${s.prefixOn ? 'checked' : ''}> Präfix bei der Geburt automatisch vergeben</label>
      <div class="row between"><span>Eigene Nachzuchten im Bestand</span><b>${homebred.length}</b></div>
      <div class="row between"><span>Ø Qualität der Nachzuchten</span><b>${avgQ ? avgQ + ' %' : '—'}</b></div>
      <div class="row between"><span>Bestes eigenes Pferd</span><b>${best ? esc(best.name) + ' — ' + fmt(Game.valuation(best)) : '—'}</b></div>
      <div class="row between"><span>Gezüchtete Fohlen gesamt</span><b>${s.stats.foalsBred || 0}</b></div>
    </div>`;
  }

  function boardingCard(s) {
    const perBox = Economy.boardIncomePerBox(s);
    const room = Economy.stallCapacity(s) - s.horses.length;
    const cur = s.boarding || 0;
    return `<div class="card stack">
      <h3>🏨 Pensionsstall</h3>
      <p class="small muted">Freie Boxen an Gastpferde vermieten — passives Einkommen je Box/Woche.
      Gastboxen belegen echte Stallplätze; für eigene Zukäufe erst wieder reduzieren.</p>
      <div class="row between"><span>Einnahme je Box/Woche</span><b>${fmt(perBox)}</b></div>
      <div class="row between"><span>Aktuell vermietet</span><b>${cur}</b></div>
      <div class="row between"><span>Belegbare Boxen</span><b>${Math.max(0, room)}</b></div>
      <div class="row" style="margin-top:.3rem">
        <input type="number" id="boarding-input" class="bid-input" value="${cur}" min="0" max="${Math.max(0, room)}" step="1">
        <button class="small" data-action="set-boarding">übernehmen</button>
      </div>
      ${cur > 0 ? `<div class="small">Erwartete Wocheneinnahme: <b>${fmt(cur * perBox)}</b></div>` : ''}
    </div>`;
  }

  // Block in der Pferde-Detailansicht: eigenen Hengst fremden Zuchtstuten anbieten.
  function studServiceBlock(h) {
    const s = Game.state;
    if (h.studService) {
      const exp = Economy.studServiceBookings(s, h);
      return '<div class="card" style="background:var(--surface-2)">' +
        '<div class="row between"><b class="small">🐴 Eigene Deckstation aktiv</b>' +
        '<button class="small danger" data-action="stop-stud-service" data-id="' + h.id + '">beenden</button></div>' +
        '<div class="small muted">Deckgeld ' + fmt(h.studService.fee) + ' · ~' + exp.toFixed(1) + ' Buchungen/Wo. · bisher ' +
        (h.studService.bookings || 0) + ' Bedeckungen, ' + fmt(h.studService.income || 0) + ' eingenommen</div>' +
        '<div class="row" style="margin-top:.35rem"><input type="number" class="bid-input" id="stud-fee-' + h.id + '" value="' + h.studService.fee + '" step="100">' +
        '<button class="small secondary" data-action="set-stud-fee" data-id="' + h.id + '">Deckgeld ändern</button></div></div>';
    }
    const suggested = Math.max(400, Math.round(Game.valuation(h) * 0.05 / 50) * 50);
    return '<div class="row"><input type="number" class="bid-input" id="stud-fee-' + h.id + '" placeholder="Deckgeld €" value="' + suggested + '" step="100">' +
      '<button class="small secondary" data-action="offer-stud-service" data-id="' + h.id + '">🐴 Für fremde Zuchtstuten anbieten (Deckgeld)</button></div>';
  }

  function friendPending(s) {
    const offers = (s.pendingOffers || []).map((o) => {
      const h = Game.getHorse(o.horseId);
      return '<div class="row between"><span>🏷️ ' + esc(h ? h.name : '?') + ' — ' + fmt(o.price) +
        (o.to ? ' · privat an ' + esc(o.to) : ' · öffentlich') + '</span><span>' +
        '<button class="small secondary" data-action="show-offer-code" data-id="' + o.id + '">Code</button> ' +
        '<button class="small secondary" data-action="cancel-offer" data-id="' + o.id + '">zurückziehen</button></span></div>';
    }).join('');
    const purch = (s.pendingPurchases || []).map((q) =>
      '<div>⏳ Kaufgebot für „' + esc(q.horseName) + '" (' + fmt(q.price) + ') an ' + esc(q.seller) + ' — wartet auf Lieferung</div>'
    ).join('');
    const debts = (s.friendStuds || []).filter((x) => x.owed > 0).map((x) =>
      '<div class="row between"><span>💶 Decktaxe für ' + esc(x.horse.name) + ' (Besitzer ' + esc(x.friend) + '): <b>' +
      fmt(x.owed) + '</b> aus ' + (x.owedCount || 0) + ' Bedeckungen</span>' +
      '<button class="small" data-action="settle-stud" data-id="' + x.horse.id + '">Abrechnungs-Code erstellen</button></div>'
    ).join('');
    const pending = (s.friendStuds || []).filter((x) => x.pendingSettle).map((x) =>
      '<div class="row between"><span>🧾 Abrechnung ' + fmt(x.pendingSettle.amount) + ' für ' + esc(x.horse.name) +
      ' an ' + esc(x.friend) + ' — <b>wartet auf Quittung</b> (Wo. ' + x.pendingSettle.sentWeek + ')</span><span>' +
      '<button class="small secondary" data-action="resend-settle" data-id="' + x.horse.id + '">Code nochmal</button></span></div>'
    ).join('');
    if (!offers && !purch && !debts && !pending) return '';
    return '<div class="trade-list" style="margin-top:.6rem">' +
      (offers ? '<div class="small muted">Deine offenen Verkaufsangebote:</div>' + offers : '') +
      (purch ? '<div class="small muted" style="margin-top:.3rem">Offene Kaufgebote:</div>' + purch : '') +
      (debts ? '<div class="small muted" style="margin-top:.3rem">Offene Decktaxen an Freunde:</div>' + debts : '') +
      (pending ? '<div class="small muted" style="margin-top:.3rem">Decktaxe-Abrechnungen ohne Quittung des Besitzers:</div>' + pending +
        '<div class="small muted">Geht die Quittung verloren, kann der Besitzer sie über denselben Abrechnungscode neu erzeugen. Notfalls „Hengst entfernen".</div>' : '') + '</div>';
  }

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
  let stallFilter = { sex: '', breed: '', disc: '', text: '', flag: '', sort: 'age', dir: 1 };
  let compareIds = [];

  function stallFilterBar(s) {
    const breeds = Array.from(new Set(s.horses.map((h) => h.breed))).sort();
    const f = stallFilter;
    const o = (v, cur, lbl) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + lbl + '</option>';
    return `<div class="stud-filter">
      <label class="small">Suche<input type="text" data-action="stall-filter" data-field="text" value="${esc(f.text)}" placeholder="Name…" style="width:8rem"></label>
      <label class="small">Geschlecht<select data-action="stall-filter" data-field="sex">${o('', f.sex, 'alle')}${o('hengst', f.sex, '♂ Hengst')}${o('stute', f.sex, '♀ Stute')}${o('wallach', f.sex, '⚬ Wallach')}</select></label>
      <label class="small">Rasse<select data-action="stall-filter" data-field="breed">${o('', f.breed, 'alle')}${breeds.map((b) => o(b, f.breed, esc(b))).join('')}</select></label>
      <label class="small">stark in<select data-action="stall-filter" data-field="disc">${o('', f.disc, '—')}${DISC.map((d) => o(d, f.disc, d)).join('')}</select></label>
      <label class="small">Status<select data-action="stall-filter" data-field="flag">${o('', f.flag, 'alle')}${o('adult', f.flag, 'ab 3 J.')}${o('young', f.flag, 'Jungpferde')}${o('pregnant', f.flag, 'tragend')}${o('sale', f.flag, 'im Verkauf')}${o('sick', f.flag, 'Gesundheit < 60')}${o('noplan', f.flag, 'ohne Trainingsplan')}${o('ungekört', f.flag, 'Hengst ohne Körung')}</select></label>
      <label class="small">Sortieren<select data-action="stall-filter" data-field="sort">${o('age', f.sort, 'Alter')}${o('name', f.sort, 'Name')}${o('value', f.sort, 'Wert')}${o('ex', f.sort, 'Exterieur')}${o('in', f.sort, 'Interieur')}${o('he', f.sort, 'Gesundheit')}${DISC.map((d) => o(d, f.sort, d)).join('')}</select></label>
      <button class="small secondary" data-action="stall-filter" data-field="dir" data-toggle="1">${f.dir === 1 ? '↑' : '↓'}</button>
      <button class="small secondary" data-action="stall-filter-reset">zurücksetzen</button>
    </div>`;
  }

  function stallFilteredSorted(s) {
    const f = stallFilter;
    let list = s.horses.slice();
    if (f.text) list = list.filter((h) => h.name.toLowerCase().indexOf(f.text.toLowerCase()) !== -1);
    if (f.sex) list = list.filter((h) => h.sex === f.sex);
    if (f.breed) list = list.filter((h) => h.breed === f.breed);
    if (f.flag === 'adult') list = list.filter((h) => ageYears(h) >= Model.MATURITY_YEARS);
    else if (f.flag === 'young') list = list.filter((h) => ageYears(h) < Model.MATURITY_YEARS);
    else if (f.flag === 'pregnant') list = list.filter((h) => h.pregnancy);
    else if (f.flag === 'sale') list = list.filter((h) => h.forSale || h.offered);
    else if (f.flag === 'sick') list = list.filter((h) => h.health < 60);
    else if (f.flag === 'noplan') list = list.filter((h) => ageYears(h) >= Model.MATURITY_YEARS && !(h.trainingPlan || []).some((d) => d));
    else if (f.flag === 'ungekört') list = list.filter((h) => h.sex === 'hengst' && !h.noPapers && !h.isMix && ageYears(h) >= Model.MATURITY_YEARS && Model.approvalRank(h.zuchtzulassung) < 2);
    const val = (h) => {
      switch (f.sort) {
        case 'name': return h.name.toLowerCase();
        case 'value': return Game.valuation(h);
        case 'ex': return h.conformation;
        case 'in': return h.temperament;
        case 'he': return h.health;
        case 'age': return ageYears(h);
        default: return DISC.indexOf(f.sort) !== -1 ? (h.skill[f.sort] + h.potential[f.sort] * 0.3) : ageYears(h);
      }
    };
    list.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * f.dir; });
    return list;
  }

  views.stall = function () {
    const s = Game.state;
    if (!s.horses.length) return '<div class="card"><p class="muted">Dein Stall ist leer. Kaufe Pferde im Tab „Markt".</p></div>';
    if (selectedId && !Game.getHorse(selectedId)) selectedId = null;
    compareIds = compareIds.filter((id) => Game.getHorse(id));

    const list = stallFilteredSorted(s);
    const rows = list.map((h) => {
      const best = Model.bestDiscipline(h);
      const preg = h.pregnancy ? ' 🤰' + h.pregnancy.weeksLeft + 'W' : '';
      const sale = h.forSale ? ' 🏷️' : (h.offered ? ' 🔒' : '');
      const cmp = compareIds.indexOf(h.id) !== -1;
      return '<tr class="clickable ' + (h.id === selectedId ? 'selected' : '') + '" data-action="select-horse" data-id="' + h.id + '">' +
        '<td><button class="small secondary" data-action="cmp-toggle" data-id="' + h.id + '" title="vergleichen"' + (cmp ? ' style="background:var(--accent);color:#fff"' : '') + '>⚖</button></td>' +
        '<td><b>' + esc(h.name) + '</b>' + preg + sale + '<br><span class="muted small">' + esc(h.breed) + '</span></td>' +
        '<td class="small">' + sexIcon(h) + '<br>' + ageStr(h) + '</td>' +
        '<td class="small">' + esc(phenoOf(h).display) + ' ' + rarityTag(h) + '</td>' +
        '<td class="small">' + esc(best) + '<br>' + bar(h.skill[best], h.potential[best]) + '</td>' +
        '<td class="small">' + Math.round(h.conformation) + '</td>' +
        '<td class="right small">' + fmt(Game.valuation(h)) + '<br><span class="muted">' + h.wins + ' Siege</span></td>' +
        '</tr>';
    }).join('');

    const right = compareIds.length === 2
      ? compareCard(Game.getHorse(compareIds[0]), Game.getHorse(compareIds[1]))
      : (selectedId ? horseDetail(Game.getHorse(selectedId)) : '<div class="card"><p class="muted">Pferd anklicken für Details. ⚖ an zwei Pferden = Vergleich.</p></div>');

    return `
      <div class="card" style="margin-bottom:1rem">${stallFilterBar(s)}</div>
      <div class="grid" style="grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); gap:1rem">
        <div class="card">
          <h3>Stall · ${list.length}${list.length !== s.horses.length ? ' / ' + s.horses.length : ''} Pferde</h3>
          <div class="table-wrap"><table><thead><tr><th></th><th>Name</th><th>Typ/Alter</th><th>Farbe</th><th>beste Disziplin</th><th>Ext.</th><th class="right">Wert</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        </div>
        <div>${right}</div>
      </div>`;
  };

  // --- Zwei Pferde nebeneinander vergleichen.
  function compareCard(a, b) {
    if (!a || !b) return '';
    const rowN = (label, va, vb, digits) => {
      const na = typeof va === 'number' ? va : parseFloat(va);
      const nb = typeof vb === 'number' ? vb : parseFloat(vb);
      const ca = !isNaN(na) && !isNaN(nb) ? (na > nb ? 'cmp-good' : na < nb ? 'cmp-bad' : '') : '';
      const cb = !isNaN(na) && !isNaN(nb) ? (nb > na ? 'cmp-good' : nb < na ? 'cmp-bad' : '') : '';
      const fmtv = (v) => (typeof v === 'number' ? (digits ? v.toFixed(digits) : Math.round(v)) : v);
      return '<tr><td>' + esc(label) + '</td><td class="right ' + ca + '">' + fmtv(va) + '</td><td class="right ' + cb + '">' + fmtv(vb) + '</td></tr>';
    };
    let rows = '<tr><td></td><td class="right"><b>' + esc(a.name) + '</b></td><td class="right"><b>' + esc(b.name) + '</b></td></tr>';
    rows += rowN('Alter', ageYears(a), ageYears(b), 1);
    rows += rowN('Wert', Game.valuation(a), Game.valuation(b));
    rows += rowN('Marktwert', Game.marketPrice(a), Game.marketPrice(b));
    rows += rowN('Exterieur', a.conformation, b.conformation);
    rows += rowN('Interieur', a.temperament, b.temperament);
    rows += rowN('Gesundheit', a.health, b.health);
    DISC.forEach((d) => { rows += rowN(d + ' (Pot.)', a.potential[d], b.potential[d]); });
    return `<div class="card stack">
      <div class="row between"><h3 style="margin:0">Vergleich</h3><button class="small secondary" data-action="cmp-clear">×</button></div>
      <table class="small">${rows}</table>
    </div>`;
  }

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

    const plan = h.trainingPlan || [];
    const planCount = {};
    plan.forEach((d) => { if (d) planCount[d] = (planCount[d] || 0) + 1; });
    const statLines = DISC.map((d) =>
      '<div class="statline"><span>' + d + (planCount[d] ? ' <span class="tag">' + planCount[d] + '×</span>' : '') + '</span>' +
      bar(h.skill[d], h.potential[d]) + '<span class="right">' + Math.round(h.potential[d]) + '</span></div>'
    ).join('');

    const slotOpts = (sel) => ['<option value="">— Ruhe —</option>']
      .concat(DISC.map((d) => '<option value="' + d + '"' + (sel === d ? ' selected' : '') + '>' + d + '</option>')).join('');
    const planEditor = '<div class="plan-grid">' +
      [0, 1, 2, 3, 4, 5].map((i) =>
        '<select class="plan-slot" data-action="set-plan" data-id="' + h.id + '" data-slot="' + i + '"' + (adult ? '' : ' disabled') + '>' +
        slotOpts(plan[i] || '') + '</select>').join('') + '</div>';
    const restSlots = 6 - plan.filter((d) => d).length;
    const planHint = plan.some((d) => d)
      ? '<div class="small muted">' + plan.filter((d) => d).length + ' Einheiten, ' + restSlots + ' Ruhetage. Jede Einheit kostet ~12 Energie, Ruhetage geben +5 zurück. Zu wenig Energie → Einheiten fallen aus.</div>'
      : '<div class="small muted">Kein Training geplant — das Pferd erholt sich nur.</div>';

    const pts = h.turnierPunkte && Object.keys(h.turnierPunkte).length
      ? '<div class="small">Saisonpunkte: ' + Object.keys(h.turnierPunkte).map((k) => esc(k) + ' ' + h.turnierPunkte[k]).join(' · ') + '</div>'
      : '';

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
          <h3 style="margin:0">${esc(h.name)} <button class="small secondary" data-action="rename-horse" data-id="${h.id}">✎</button>
            <button class="small secondary" data-action="pedigree" data-id="${h.id}">🌳 Stammbaum</button></h3>
          <span class="muted small">${sexIcon(h)} · ${ageStr(h)}</span>
        </div>
        <div class="small muted">${esc(h.breed)}${(h.isMix || Model.isMixBreed(h.breed)) ? ' <span class="tag warn">Mix</span>' : ''}</div>
        ${zuchtBadges(h) ? '<div class="badge-row">' + zuchtBadges(h) + '</div>' : ''}
        ${parents}
        <div><b>${esc(pheno.display)}</b> ${rarityTag(h)} ${pheno.blueEyes ? '<span class="tag">blaue Augen</span>' : ''}</div>
        <div class="geno-tokens">${esc(pheno.tokens)}</div>

        <div>
          <div class="row between"><b>Ausbildung / Potenzial</b><span class="muted small">Balken hell = genet. Potenzial</span></div>
          ${statLines}
        </div>
        ${subTraitDetails('Exterieur', Model.EXTERIEUR_TRAITS, Model.exterieurOf(h), h.conformation)}
        ${subTraitDetails('Interieur', Model.INTERIEUR_TRAITS, Model.interieurOf(h), h.temperament)}
        ${subTraitDetails('Gesundheit', Model.GESUNDHEIT_TRAITS, Model.gesundheitOf(h), h.health)}
        <div class="statline"><span>Energie</span>${plainBar(h.energy, 'warn')}<span></span></div>

        <div>
          <b class="small">Wochen-Trainingsplan</b> <span class="muted small">(6 Einheiten, wird bei „Woche weiter" abgearbeitet)</span>
          ${planEditor}
          ${planHint}
          ${plan.some((d) => d) ? '<button class="small secondary" data-action="plan-to-all" data-id="' + h.id + '">Diesen Plan auf alle erwachsenen Pferde</button>' : ''}
        </div>
        ${adult ? '' : '<p class="small muted">Training, Zucht und Turniere erst ab 3 Jahren.</p>'}
        ${pts}
        ${lpBlock(h)}
        ${showRec}
        ${orderMatchBlock(h)}

        <hr style="border:none;border-top:1px solid var(--border)">
        ${h.offered ? `
          <p class="tag warn">🔒 In einem Freundes-Verkaufsangebot — gesperrt für Training, Zucht, Turniere und anderen Verkauf.</p>
          ${offerCancelBtn(h)}
        ` : `
        <div class="row">
          ${h.forSale
            ? '<button class="small secondary" data-action="unlist" data-id="' + h.id + '">Verkauf zurückziehen (' + fmt(h.forSale.price) + ')</button>'
            : '<button class="small" data-action="list-sale" data-id="' + h.id + '">Zum Verkauf anbieten</button>'}
          ${inAuction ? '<span class="tag">in Auktion</span>'
            : '<button class="small secondary" data-action="consign" data-id="' + h.id + '">In Auktion einliefern</button>'}
          <button class="small danger" data-action="quick-sell" data-id="${h.id}">Schnellverkauf (½ Wert)</button>
        </div>
        <div class="row">
          <button class="small secondary" data-action="offer-horse" data-id="${h.id}">👥 An Freund verkaufen (Code)</button>
          ${h.sex === 'hengst' && adult ? '<button class="small secondary" data-action="share-stud" data-id="' + h.id + '">👥 Deckhengst freigeben (Code)</button>' : ''}
        </div>
        ${h.sex === 'hengst' && adult && (Model.approvalRank(h.zuchtzulassung) >= 2 || h.studService) ? studServiceBlock(h)
          : (h.sex === 'hengst' && adult ? '<div class="small muted">🐴 Eigene Deckstation für fremde Zuchtstuten: erst nach Körung/Eintragung möglich.</div>' : '')}
        `}
        <div class="small muted">Schätzwert <b>${fmt(Game.valuation(h))}</b> · Marktlage ${demandTag(h)} → aktuell <b>${fmt(Game.marketPrice(h))}</b></div>
      </div>`;
  }

  function orderMatchBlock(h) {
    if (h.offered || h.pregnancy) return '';
    const ms = (Game.state.breedingOrders || []).filter((o) => Economy.orderMatch(o, h, Game.state.week).ok);
    if (!ms.length) return '';
    return '<div class="card" style="background:var(--surface-2)">' +
      '<b class="small">🎯 Passt auf ' + ms.length + ' Zuchtauftrag' + (ms.length > 1 ? '/-aufträge' : '') + '</b>' +
      ms.map((o) => '<div class="row between small" style="margin-top:.2rem"><span>' + esc(o.client) + ' — <b>' + fmt(o.reward) + '</b>, +' + o.prestige + ' Prestige</span>' +
        '<button class="small" data-action="fulfill-order-direct" data-order="' + o.id + '" data-id="' + h.id + '">' + esc(h.name) + ' abgeben</button></div>').join('') +
      '</div>';
  }

  function lpBlock(h) {
    const y = ageYears(h);
    if (h.leistungspruefung) {
      const lp = h.leistungspruefung;
      return '<div class="small">🎓 Leistungsprüfung: <b>Index ' + lp.index + '</b> (' + (lp.index >= 80 ? 'bestanden' : 'nicht bestanden') + ')' +
        (lp.gaits ? ' — GGA ' + lp.gaits + ', Rittigkeit ' + lp.ride + ', Springen ' + lp.jump + ', Charakter ' + lp.char : '') + '</div>';
    }
    if (h.pendingTest) return '<div class="small">🎓 Leistungsprüfung läuft — noch ' + h.pendingTest.weeksLeft + ' Wochen.</div>';
    if (y >= Model.MATURITY_YEARS && y <= 9 && !h.offered && !h.pregnancy) {
      return '<div class="row"><button class="small secondary" data-action="start-lp" data-id="' + h.id +
        '">🎓 Zur Leistungsprüfung (4.200 €, 6 Wochen)</button></div>' +
        '<div class="small muted">Bestandene Prüfung (Index ≥ 80) ist Voraussetzung fürs Zuchtbuch I bei der Körung.</div>';
    }
    return '';
  }

  function offerCancelBtn(h) {
    const o = (Game.state.pendingOffers || []).find((x) => x.horseId === h.id);
    if (!o) return '';
    return '<div class="row"><button class="small secondary" data-action="show-offer-code" data-id="' + o.id + '">Angebots-Code anzeigen</button>' +
      '<button class="small danger" data-action="cancel-offer" data-id="' + o.id + '">Angebot zurückziehen</button></div>';
  }

  // Kompakte Nachfrage-Anzeige für ein Pferd, z.B. "Hannoveraner +18 %, Springen +6 %".
  function demandTag(h) {
    const rows = Economy.demandBreakdown(Game.state, h).filter((r) => Math.abs(r.pct) >= 3);
    if (!rows.length) return '<span class="muted">neutral</span>';
    return rows.map((r) => {
      const cls = r.pct >= 8 ? 'good' : r.pct <= -8 ? 'warn' : '';
      return '<span class="tag ' + cls + '">' + esc(r.label) + ' ' + (r.pct >= 0 ? '+' : '') + r.pct + ' %</span>';
    }).join(' ');
  }

  // --- 🧬 Zucht --------------------------------------------------------
  function sireExists(id) {
    if (Game.getHorse(id)) return true;
    return (Game.state.studRoster || []).some((x) => x.horse.id === id) ||
      (Game.state.friendStuds || []).some((x) => x.horse.id === id);
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
    const map = {
      Exterieur: { keys: Model.EXTERIEUR_TRAITS, traits: fc.exterieurTraits, damObj: Model.exterieurOf(dam), summary: fc.exterieur, damAgg: dam.conformation },
      Interieur: { keys: Model.INTERIEUR_TRAITS, traits: fc.interieurTraits, damObj: Model.interieurOf(dam), summary: fc.interieur, damAgg: dam.temperament },
      Gesundheit: { keys: Model.GESUNDHEIT_TRAITS, traits: fc.gesundheitTraits, damObj: Model.gesundheitOf(dam), summary: fc.gesundheit, damAgg: dam.health },
    }[group];
    let rows = map.keys.map((t) => fcRow(t, map.traits[t], map.damObj[t])).join('');
    rows += fcRow('Ø ' + group, Object.assign({ sire: null, dam: null }, map.summary), map.damAgg);
    return fcTable(rows);
  }

  views.zucht = function () {
    const s = Game.state;
    const stallions = s.horses.filter((h) => h.sex === 'hengst' && !h.offered && ageYears(h) >= Model.MATURITY_YEARS);
    const mares = s.horses.filter((h) => h.sex === 'stute' && !h.offered && ageYears(h) >= Model.MATURITY_YEARS && !h.pregnancy);
    const roster = s.studRoster || [];

    if (breedSire && !sireExists(breedSire)) breedSire = null;
    if (breedDam && !Game.getHorse(breedDam)) breedDam = null;

    const mareOpt = ['<option value="">— Stute wählen —</option>'].concat(
      mares.map((h) => '<option value="' + h.id + '"' + (breedDam === h.id ? ' selected' : '') + '>' +
        esc(h.name) + ' (' + esc(h.breed) + ', ' + phenoOf(h).base + ', ' + ageYears(h).toFixed(0) + 'J.)</option>')
    ).join('');

    const selMare = breedDam ? Game.getHorse(breedDam) : null;
    const sireOwn = stallions.map((h) => '<option value="' + h.id + '"' + (breedSire === h.id ? ' selected' : '') + '>' +
      esc(h.name) + ' — ' + esc(h.breed) + ', Ext.' + Math.round(h.conformation) + ', ' + Model.bestDiscipline(h) + ' ' + Math.round(h.potential[Model.bestDiscipline(h)]) + '</option>').join('');
    const studOpt = (x, friend) => {
      const h = x.horse;
      return '<option value="' + h.id + '"' + (breedSire === h.id ? ' selected' : '') + '>' +
        esc(h.name) + ' — ' + esc(h.breed) + ', Ext.' + Math.round(h.conformation) + ', ' + Model.bestDiscipline(h) + ' ' +
        Math.round(h.potential[Model.bestDiscipline(h)]) + '  (Deckgeld ' + fmt(x.studFee) + (friend ? ', Freund ' + friend : '') + ')</option>';
    };
    const sireStud = (s.studRoster || []).map((x) => studOpt(x, null)).join('');
    const sireFriend = (s.friendStuds || []).map((x) => studOpt(x, x.friend)).join('');
    const sireSelect = '<select data-action="pick-sire"><option value="">— Hengst wählen —</option>' +
      (sireOwn ? '<optgroup label="Eigene Hengste">' + sireOwn + '</optgroup>' : '') +
      (sireStud ? '<optgroup label="Deckstation">' + sireStud + '</optgroup>' : '') +
      (sireFriend ? '<optgroup label="Von Freunden">' + sireFriend + '</optgroup>' : '') +
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
        const traitList = (arr) => arr.map((x) => x.group[0] + ': ' + x.trait + ' ' + x.from + '→' + x.to).join(' · ');

        planHtml = `
          <div class="small muted">Fohlenwerte im Vergleich zur Stute (du entscheidest, ob der Hengst passt):</div>
          ${m.improves.length ? '<div class="small"><span class="tag good">Fohlen-Ø höher bei</span> ' + esc(traitList(m.improves)) + '</div>' : ''}
          ${m.worsens.length ? '<div class="small"><span class="tag warn">niedriger bei</span> ' + esc(traitList(m.worsens)) + '</div>' : ''}
          <div class="row between"><span>Fohlenrasse</span><b>${esc(fc.foalBreed)}</b></div>
          ${fc.mix ? '<p class="small tag warn">„Mix" hat kein Zuchtbuch — Marktwert rund −50 %, Zuchtschau-Malus, Begabungen/Exterieur im Schnitt −5.</p>' : ''}
          ${(!fc.mix && Model.approvalRank(plan.sire.zuchtzulassung) < 2) ? '<p class="small tag warn">' + esc(plan.sire.name) + ' ist nicht gekört → das Fohlen bekommt <b>keinen Zuchtbucheintrag</b> (−38 % Wert, kein Start bei Zuchtschau/Körung). Erst zur Körung schicken.</p>' : ''}
          <div class="row between"><span>Inzuchtkoeffizient (COI)</span><b class="tag ${coiCls}">${coiPct}%</b></div>
          ${plan.coi >= 0.125 ? '<p class="small tag warn">Hohe Inzucht — spürbare Abzüge bei Gesundheit, Begabungen und Fruchtbarkeit.</p>' : ''}
          <div class="row between"><span>Empfängnis-Chance</span><b>${Math.round(plan.conceiveChance * 100)}%</b> <span class="muted small">${plan.season.icon} ${plan.season.name}${plan.seasonFert >= 1.2 ? ' (Decksaison +)' : plan.seasonFert <= 0.8 ? ' (außerhalb der Saison −)' : ''}</span></div>
          <div class="row between"><span>Deckgebühr${plan.external ? ' (Deckstation)' : ''}</span><b>${fmt(plan.fee)}</b></div>

          <p style="margin:.6rem 0 .2rem"><b>Begabungen</b> <span class="muted small">(grün = hebt die Stute, rot = senkt sie)</span></p>
          ${begabungTable(fc, dam)}
          <details style="margin-top:.4rem"><summary class="small"><b>Exterieur im Detail</b> (6 Einzelnoten)</summary>${subTable(fc, 'Exterieur', dam)}</details>
          <details style="margin-top:.3rem"><summary class="small"><b>Interieur im Detail</b> (5 Einzelnoten)</summary>${subTable(fc, 'Interieur', dam)}</details>
          <details style="margin-top:.3rem"><summary class="small"><b>Gesundheit im Detail</b> (5 Einzelnoten) — Ø Erwartung ${fc.gesundheit.expect}</summary>${subTable(fc, 'Gesundheit', dam)}</details>

          <p style="margin:.6rem 0 .2rem"><b>Mögliche Fohlenfarben</b> <span class="muted small">(Mendel)</span> — letale Fohlen ${plan.forecast.lethalPct} %</p>
          <ul class="foal-forecast small">
            ${plan.forecast.outcomes.map((o) => '<li>' + o.pct + ' %&nbsp; ' + esc(o.label) + '</li>').join('')}
          </ul>
          <button data-action="breed-confirm">Decken lassen (${fmt(plan.fee)})</button>`;
      }
    }

    // --- Deckstation: SUCHWERKZEUG. Der Spieler setzt die Kriterien, das
    //     Spiel filtert/sortiert nur nach diesen Vorgaben - es empfiehlt
    //     keinen Hengst.
    const f = studFilter;
    const num = (v) => (v === '' || v == null ? null : parseFloat(v));
    const friendStuds = s.friendStuds || [];
    const allStuds = roster.map((x) => ({ e: x, friend: null })).concat(friendStuds.map((x) => ({ e: x, friend: x.friend })));
    let list = allStuds.map(({ e, friend }) => ({ x: e, h: e.horse, friend: friend, best: Model.bestDiscipline(e.horse) }));
    list = list.filter(({ h, x }) => {
      if (f.breed && h.breed !== f.breed) return false;
      if (num(f.exMin) != null && h.conformation < num(f.exMin)) return false;
      if (num(f.inMin) != null && h.temperament < num(f.inMin)) return false;
      if (num(f.heMin) != null && h.health < num(f.heMin)) return false;
      if (num(f.feeMax) != null && x.studFee > num(f.feeMax)) return false;
      if (f.disc && num(f.begMin) != null && h.potential[f.disc] < num(f.begMin)) return false;
      return true;
    });
    const sortVal = (o) => {
      switch (f.sort) {
        case 'fee': return o.x.studFee;
        case 'ex': return o.h.conformation;
        case 'in': return o.h.temperament;
        case 'he': return o.h.health;
        case 'age': return ageYears(o.h);
        case 'name': return o.h.name.toLowerCase();
        default: return DISC.indexOf(f.sort) !== -1 ? o.h.potential[f.sort] : o.x.studFee;
      }
    };
    list.sort((a, b) => {
      const va = sortVal(a), vb = sortVal(b);
      if (va < vb) return -1 * f.dir;
      if (va > vb) return 1 * f.dir;
      return 0;
    });

    const opt = (val, cur, label) => '<option value="' + val + '"' + (String(cur) === String(val) ? ' selected' : '') + '>' + label + '</option>';
    const filterBar = `
      <div class="stud-filter">
        <label class="small">Rasse<select data-action="stud-filter" data-field="breed">
          ${opt('', f.breed, 'alle')}${Names.BREED_KEYS.map((b) => opt(b, f.breed, esc(b))).join('')}
        </select></label>
        <label class="small">Exterieur ≥<input type="number" data-action="stud-filter" data-field="exMin" value="${esc(f.exMin)}" min="0" max="100"></label>
        <label class="small">Interieur ≥<input type="number" data-action="stud-filter" data-field="inMin" value="${esc(f.inMin)}" min="0" max="100"></label>
        <label class="small">Gesundheit ≥<input type="number" data-action="stud-filter" data-field="heMin" value="${esc(f.heMin)}" min="0" max="100"></label>
        <label class="small">Begabung<select data-action="stud-filter" data-field="disc">
          ${opt('', f.disc, '—')}${DISC.map((d) => opt(d, f.disc, d)).join('')}
        </select> ≥<input type="number" data-action="stud-filter" data-field="begMin" value="${esc(f.begMin)}" min="0" max="100" style="width:4rem"></label>
        <label class="small">Deckgeld ≤<input type="number" data-action="stud-filter" data-field="feeMax" value="${esc(f.feeMax)}" min="0" step="500"></label>
        <label class="small">Sortieren<select data-action="stud-filter" data-field="sort">
          ${opt('fee', f.sort, 'Deckgeld')}${opt('ex', f.sort, 'Exterieur')}${opt('in', f.sort, 'Interieur')}${opt('he', f.sort, 'Gesundheit')}${opt('age', f.sort, 'Alter')}${opt('name', f.sort, 'Name')}${DISC.map((d) => opt(d, f.sort, 'Begabung ' + d)).join('')}
        </select></label>
        <button class="small secondary" data-action="stud-filter" data-field="dir" data-toggle="1">${f.dir === 1 ? '↑ aufsteigend' : '↓ absteigend'}</button>
        <button class="small secondary" data-action="stud-filter-reset">zurücksetzen</button>
      </div>`;

    const begCell = (h) => DISC.map((d) => '<span class="' + (f.sort === d ? 'tag' : 'muted') + '">' + d.slice(0, 2) + ' ' + Math.round(h.potential[d]) + '</span>').join(' ');
    const studRows = list.map(({ x, h, friend }) => `
      <tr class="clickable ${breedSire === h.id ? 'selected' : ''}" data-action="pick-stud" data-id="${h.id}">
        <td><b>${esc(h.name)}</b>${x.elite ? ' <span class="tag rare">Elite</span>' : ''}${friend ? ' <span class="tag good">Freund ' + esc(friend) + '</span>' : ''}<br><span class="muted small">${esc(h.breed)} · ${esc(phenoOf(h).base)} · ${ageYears(h).toFixed(0)} J.</span></td>
        <td class="right">${Math.round(h.conformation)}</td>
        <td class="right">${Math.round(h.temperament)}</td>
        <td class="right">${Math.round(h.health)}</td>
        <td class="small">${begCell(h)}</td>
        <td class="right"><b>${fmt(x.studFee)}</b>${friend ? '<br><button class="small secondary" data-action="remove-friend-stud" data-id="' + h.id + '">entfernen</button>' : ''}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted small">Kein Hengst passt zu deinen Kriterien.</td></tr>';

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
        <h3>🏇 Deckstation — Hengstsuche</h3>
        <p class="small muted">Setz deine Kriterien; die Liste filtert und sortiert <b>nur danach</b>. Beurteile selbst, welcher Hengst zu deiner Stute passt.
        Zeile anklicken übernimmt ihn in den Zuchtplaner. ${list.length}/${allStuds.length} Hengsten entsprechen den Kriterien${friendStuds.length ? ' (inkl. ' + friendStuds.length + ' von Freunden)' : ''}. Deckstation wechselt Woche ${s.nextStudWeek || 0}.</p>
        ${filterBar}
        <div class="table-wrap" style="margin-top:.5rem">
          <table>
            <thead><tr><th>Hengst</th><th class="right">Ext.</th><th class="right">Int.</th><th class="right">Ges.</th><th>Begabungen</th><th class="right">Deckgeld</th></tr></thead>
            <tbody>${studRows}</tbody>
          </table>
        </div>
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
    const adults = s.horses.filter((h) => !h.offered && ageYears(h) >= Model.MATURITY_YEARS);

    const cards = s.shows.map((show) => {
      const entered = show.entered.map((id) => Game.getHorse(id)).filter(Boolean);
      // Nur startberechtigte Pferde in der Auswahl; nicht startberechtigte
      // mit Grund als deaktivierte Option.
      const opts = ['<option value="">Pferd wählen…</option>'];
      adults.forEach((h) => {
        if (show.entered.indexOf(h.id) !== -1) return;
        const reason = Economy.eligibilityReason(h, show, s.week);
        const val = show.type === 'sport' ? show.discipline + ' ' + Math.round(h.skill[show.discipline]) : 'Ext. ' + Math.round(h.conformation);
        opts.push(reason
          ? '<option value="" disabled>' + esc(h.name) + ' — ' + esc(reason) + '</option>'
          : '<option value="' + h.id + '">' + esc(h.name) + ' — ' + val + '</option>');
      });
      const sel = '<select data-show="' + show.id + '" class="enter-sel">' + opts.join('') + '</select>';

      const reqTxt = [
        show.type === 'sport' ? 'Mindest-' + show.discipline + ' ' + show.minSkill
          : (show.type === 'koerung' ? 'Mindest-Exterieur ' + show.minConf + ', mit Zuchtbucheintrag' : 'Mindest-Exterieur ' + show.minConf),
        show.youngster ? 'nur 3–7 J.' : null,
        'Energie ≥ ' + show.minEnergy + ', Gesundheit ≥ ' + show.minHealth,
      ].filter(Boolean).join(' · ');
      const typeLabel = show.type === 'sport' ? show.discipline : (show.type === 'koerung' ? 'Körung / Prämierung' : 'Zuchtschau');

      let resultTbl = '';
      if (show.done && show._allResults) {
        const rows = show._allResults.slice(0, 10).map((r) =>
          '<tr class="' + (r.player ? 'selected' : '') + '"><td>' + r.place + '.</td><td>' + esc(r.name) +
          (r.player ? ' <b>(du)</b>' : '') + '</td><td class="small">' + esc(r.scoreLabel || '') + '</td>' +
          '<td class="right small">' + (r.prize ? fmt(r.prize) : '') + '</td></tr>').join('');
        resultTbl = '<details><summary class="small">Ergebnisliste (' + show._allResults.length + ' Starter)</summary>' +
          '<table class="small"><thead><tr><th>Pl.</th><th>Pferd</th><th>Wertung</th><th class="right">Preisgeld</th></tr></thead><tbody>' + rows + '</tbody></table></details>';
      }

      return `<div class="card stack">
        <div class="row between"><b>${esc(show.name)}</b><span class="tag">Klasse ${show.level}</span></div>
        <div class="small muted">${esc(typeLabel)} ·
          Nenngeld ${fmt(show.entryFee)} · Reise ${fmt(show.travelCost)} · Kraft −${show.energyCost} Energie · Preisgeld ${fmt(show.prizePool)}</div>
        <div class="small">Zulassung: ${esc(reqTxt)}</div>
        ${entered.length ? '<div class="small">Genannt: ' + entered.map((h) =>
          esc(h.name) + ' <button class="small secondary" data-action="withdraw" data-show="' + show.id + '" data-id="' + h.id + '">×</button>').join(' ') + '</div>' : ''}
        ${show.done ? '<span class="tag good">gelaufen</span>' + resultTbl : sel +
          ' <button class="small" data-action="enter-show" data-show="' + show.id + '">Nennen</button>'}
      </div>`;
    }).join('');

    // Letzte Ergebnislisten (bleiben sichtbar, auch wenn der Kalender wechselt).
    const recent = (s.showResults || []).map((rr) => {
      const rows = rr.results.map((r) =>
        '<tr class="' + (r.player ? 'selected' : '') + '"><td>' + r.place + '.</td><td>' + esc(r.name) +
        (r.player ? ' <b>(du)</b>' : '') + '</td><td class="small">' + esc(r.scoreLabel || '') + '</td>' +
        '<td class="right small">' + (r.prize ? fmt(r.prize) : '') + '</td></tr>').join('');
      return '<details><summary class="small"><b>Wo. ' + rr.week + ' — ' + esc(rr.name) + '</b></summary>' +
        '<table class="small"><thead><tr><th>Pl.</th><th>Pferd</th><th>Wertung</th><th class="right">Preisgeld</th></tr></thead><tbody>' +
        rows + '</tbody></table></details>';
    }).join('');

    // Saisonwertung: eigene Pferde je Disziplin, mit Championat-Qualifikation.
    const qual = Economy.championshipQualified(s);
    const standings = DISC.map((disc) => {
      const ranked = s.horses
        .filter((h) => h.turnierPunkte && h.turnierPunkte[disc])
        .sort((a, b) => b.turnierPunkte[disc] - a.turnierPunkte[disc])
        .slice(0, 3);
      if (!ranked.length) return '';
      return '<div class="small"><b>' + esc(disc) + ':</b> ' +
        ranked.map((h, i) => (i + 1) + '. ' + esc(h.name) + ' (' + h.turnierPunkte[disc] +
          ((h.turnierPunkte[disc] >= Economy.CHAMP_QUAL) ? ' <span class="tag good">✓ Championat</span>' : '') + ')').join(' · ') + '</div>';
    }).filter(Boolean).join('');

    // Gestüts-Rangliste (laufende Saison): du + Rivalen.
    const champIn = Model.WEEKS_PER_YEAR - (s.week % Model.WEEKS_PER_YEAR);
    const rankRows = Economy.seasonStandings(s).map((r, i) =>
      '<tr class="' + (r.isPlayer ? 'selected' : '') + '"><td>' + (i + 1) + '.</td><td>' + esc(r.name) +
      (r.isPlayer ? ' <b>(du)</b>' : '') + '</td><td class="right">' + r.points + '</td><td class="right muted small">' + r.prestige + '</td></tr>').join('');
    const rankCard = `<div class="card" style="margin-top:1rem">
      <h3>🏇 Gestüts-Rangliste — Saison ${s.seasonYear || 1}</h3>
      <p class="small muted">Jahres-Championat in <b>${champIn}</b> Woche${champIn === 1 ? '' : 'n'}: je Disziplin ein Finale für alle Pferde ab
      ${Economy.CHAMP_QUAL} Saisonpunkten, dazu der Gesamt-Titel fürs punktbeste Gestüt. Danach werden die Saisonpunkte genullt.</p>
      <table class="small"><thead><tr><th>#</th><th>Gestüt</th><th class="right">Saisonpunkte</th><th class="right">Prestige</th></tr></thead><tbody>${rankRows}</tbody></table>
    </div>`;

    const hist = (s.championHistory || []).map((c) =>
      '<details><summary class="small"><b>Jahr ' + c.year + ' — Gesamt-Champion: ' + esc(c.overall || '—') + '</b></summary>' +
      '<div class="small">' + DISC.map((d) => d + ': ' + esc(c.disciplines[d] || '—')).join(' · ') + '</div></details>').join('');

    return `
      <div class="card">
        <h3>Schaukalender</h3>
        <p class="small muted">Je Disziplin eigene Prüfungsklassen mit Mindestanforderung. Dazu <b>Zuchtschauen</b> und
        <b>Körungen/Prämierungen</b> (Zuchtzulassung + Ia/Ib/Staatsprämie + Siegertitel). Genannte Pferde starten beim „Woche weiter";
        Kosten: Nenngeld, Reise, Energie. Platzierungen bringen Preisgeld, Prestige und Saisonpunkte.</p>
      </div>
      <div class="grid cols-2" style="margin-top:1rem">${cards}</div>
      ${recent ? '<div class="card" style="margin-top:1rem"><h3>📋 Letzte Ergebnisse</h3>' + recent + '</div>' : ''}
      ${rankCard}
      ${standings ? '<div class="card" style="margin-top:1rem"><h3>🏅 Deine Pferde je Disziplin</h3>' + standings + '</div>' : ''}
      ${hist ? '<div class="card" style="margin-top:1rem"><h3>🏆 Championat-Historie</h3>' + hist + '</div>' : ''}`;
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

    const consignable = s.horses.filter((h) => !h.pregnancy && !h.offered && !s.auction.lots.some((l) => l.consignedByPlayer && l.horse.id === h.id));
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
        <div class="small">Marktlage: ${demandTag(h)}</div>
        <div class="row between"><span>Preis</span><b>${fmt(o.price)}</b> <span class="muted small">(Schätzwert ${fmt(Game.valuation(h))})</span></div>
        <button class="small" data-action="buy-market" data-idx="${i}" ${s.cash < o.price || Game.stallFree() < 1 ? 'disabled' : ''}>Kaufen</button>
      </div>`;
    }).join('');

    const dov = Economy.demandOverview(s);
    const dline = (arr) => arr.map((r) => '<span class="tag ' + (r.pct >= 8 ? 'good' : r.pct <= -8 ? 'warn' : '') + '">' + esc(r.label) + ' ' + (r.pct >= 0 ? '+' : '') + r.pct + ' %</span>').join(' ');
    const marktlage = `
      <div class="card">
        <h3>📊 Marktlage (Angebot &amp; Nachfrage)</h3>
        <p class="small muted">Preise und Verkaufstempo folgen der Nachfrage im jeweiligen Segment (Rasse + beste Disziplin, dazu Sonderfarben).
        Verkaufst du viel aus einem Segment, drückst du dort selbst die Preise.</p>
        <div class="row between"><span class="small">gefragt</span><span>${dline(dov.hot)}</span></div>
        <div class="row between"><span class="small">flau</span><span>${dline(dov.cold)}</span></div>
        <div class="row between"><span class="small">Sonderfarben</span><span>${dline([{ label: 'Schecken/Verdünnungen', pct: dov.rareColor }])}</span></div>
      </div>`;

    const listings = s.saleListings.map((l) => {
      const h = Game.getHorse(l.horseId);
      if (!h) return '';
      const mp = Game.marketPrice(h);
      const over = l.price > mp * 1.15;
      return '<tr><td>' + esc(h.name) + '</td><td class="' + (over ? 'cmp-bad' : '') + '">' + fmt(l.price) + '</td>' +
        '<td class="muted small">' + fmt(mp) + '</td><td>' + l.weeks + ' Wo.</td>' +
        '<td class="right"><button class="small secondary" data-action="unlist" data-id="' + h.id + '">zurückziehen</button></td></tr>';
    }).join('');

    return `
      ${marktlage}
      <div class="card" style="margin-top:1rem">
        <h3>Markt — Angebot erneuert sich alle 2 Wochen (nächste: Woche ${s.nextMarketWeek})</h3>
        <p class="small muted">Freie Stallplätze: <b>${Game.stallFree()}</b>. Bessere Pferde erscheinen mit steigendem Gestüts-Rang.</p>
      </div>
      <div class="grid cols-3" style="margin-top:1rem">${offers}</div>
      <div class="card" style="margin-top:1rem">
        <h3>Deine Verkaufsangebote</h3>
        ${listings ? '<table><thead><tr><th>Pferd</th><th>dein Preis</th><th>Marktwert</th><th>gelistet</th><th></th></tr></thead><tbody>' + listings + '</tbody></table>'
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
    $('#btn-howto').addEventListener('click', () => { $('#howto-overlay').hidden = false; });
    $('#btn-howto-close').addEventListener('click', () => { $('#howto-overlay').hidden = true; });
    $('#howto-overlay').addEventListener('click', (e) => { if (e.target.id === 'howto-overlay') $('#howto-overlay').hidden = true; });
    $('#btn-code-close').addEventListener('click', () => { $('#code-overlay').hidden = true; });
    $('#code-overlay').addEventListener('click', (e) => { if (e.target.id === 'code-overlay') $('#code-overlay').hidden = true; });
    $('#btn-trade-close').addEventListener('click', () => { $('#trade-overlay').hidden = true; });
    $('#trade-overlay').addEventListener('click', (e) => { if (e.target.id === 'trade-overlay') $('#trade-overlay').hidden = true; });
    $('#btn-pedigree-close').addEventListener('click', () => { $('#pedigree-overlay').hidden = true; });
    $('#pedigree-overlay').addEventListener('click', (e) => { if (e.target.id === 'pedigree-overlay') $('#pedigree-overlay').hidden = true; });
    $('#trade-actions').addEventListener('click', onTradeAction);
    $('#btn-code-copy').addEventListener('click', () => {
      const t = $('#code-text'); t.select();
      try { navigator.clipboard.writeText(t.value); toast('Kopiert.'); }
      catch (e) { try { document.execCommand('copy'); toast('Kopiert.'); } catch (e2) { toast('Bitte manuell markieren und kopieren.', true); } }
    });
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
    if (t.dataset.action === 'set-plan') {
      const slots = document.querySelectorAll('.plan-slot[data-id="' + t.dataset.id + '"]');
      const arr = Array.from(slots).map((s) => s.value || null);
      Game.setTrainingPlan(t.dataset.id, arr);
      // gezielt nur den Detailbereich neu zeichnen wäre feiner; render() reicht.
      render();
    } else if (t.dataset.action === 'set-focus') {
      Game.setTrainingFocus(t.dataset.id, t.value);
    } else if (t.dataset.action === 'set-feed') { Game.setFeed(parseInt(t.value, 10)); toast('Fütterung: ' + Economy.FEED[Game.state.feedLevel].label); }
    else if (t.dataset.action === 'set-care') { Game.setCare(parseInt(t.value, 10)); toast('Pflege: ' + Economy.CARE[Game.state.careLevel].label); }
    else if (t.dataset.action === 'stud-filter' && !t.dataset.toggle) { studFilter[t.dataset.field] = t.value; render(); }
    else if (t.dataset.action === 'stall-filter' && !t.dataset.toggle) { stallFilter[t.dataset.field] = t.value; render(); }
    else if (t.dataset.action === 'pick-sire') { breedSire = t.value || null; render(); }
    else if (t.dataset.action === 'pick-dam') { breedDam = t.value || null; render(); }
  }

  function onViewClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const s = Game.state;

    if (a === 'select-horse') { selectedId = el.dataset.id; render(); return; }

    if (a === 'pick-stud') { breedSire = el.dataset.id; render(); toast('Hengst in den Zuchtplaner übernommen.'); return; }

    if (a === 'stud-filter' && el.dataset.toggle) { studFilter.dir *= -1; render(); return; }
    if (a === 'stall-filter' && el.dataset.toggle) { stallFilter.dir *= -1; render(); return; }
    if (a === 'stall-filter-reset') { stallFilter = { sex: '', breed: '', disc: '', text: '', flag: '', sort: 'age', dir: 1 }; render(); return; }
    if (a === 'cmp-toggle') {
      const id = el.dataset.id;
      const i = compareIds.indexOf(id);
      if (i !== -1) compareIds.splice(i, 1);
      else { compareIds.push(id); if (compareIds.length > 2) compareIds.shift(); }
      render();
      return;
    }
    if (a === 'cmp-clear') { compareIds = []; render(); return; }
    if (a === 'hire-staff') { const r = Game.hireStaff(parseInt(el.dataset.idx, 10)); toast(r.ok ? 'Eingestellt.' : r.msg, !r.ok); return; }
    if (a === 'fire-staff') { Game.fireStaff(el.dataset.id); return; }
    if (a === 'sign-sponsor') { const r = Game.signSponsor(parseInt(el.dataset.idx, 10)); toast(r.ok ? 'Vertrag unterschrieben.' : r.msg, !r.ok); return; }
    if (a === 'fulfill-order') {
      const box = el.closest('div');
      const sel = box ? box.querySelector('[data-role="order-horse"]') : null;
      if (!sel || !sel.value) { toast('Kein passendes Pferd.', true); return; }
      const r = Game.fulfillBreedingOrder(el.dataset.id, sel.value);
      toast(r.ok ? 'Auftrag erfüllt: +' + fmt(r.amount) : r.msg, !r.ok);
      return;
    }
    if (a === 'fulfill-order-direct') {
      const r = Game.fulfillBreedingOrder(el.dataset.order, el.dataset.id);
      toast(r.ok ? 'Auftrag erfüllt: +' + fmt(r.amount) : r.msg, !r.ok);
      return;
    }
    if (a === 'save-prefix') {
      const inp = document.getElementById('prefix-input');
      Game.setStudPrefix(inp ? inp.value : '');
      toast('Zuchtstempel gespeichert.');
      return;
    }
    if (a === 'toggle-prefix') { Game.setPrefixOn(el.checked); return; }
    if (a === 'set-boarding') {
      const inp = document.getElementById('boarding-input');
      const r = Game.setBoarding(inp ? parseInt(inp.value, 10) : 0);
      if (r.ok) toast('Pensionsstall aktualisiert.');
      return;
    }
    if (a === 'offer-stud-service' || a === 'set-stud-fee') {
      const inp = document.getElementById('stud-fee-' + el.dataset.id);
      const r = Game.offerStudService(el.dataset.id, inp ? parseInt(inp.value, 10) : 0);
      toast(r.ok ? 'Deckhengst angeboten.' : r.msg, !r.ok);
      return;
    }
    if (a === 'stop-stud-service') { Game.stopStudService(el.dataset.id); return; }
    if (a === 'drop-sponsor') {
      if (confirm('Sponsorenvertrag vorzeitig beenden? (kein Bonus, kleiner Prestige-Verlust)')) Game.dropSponsor(el.dataset.id);
      return;
    }
    if (a === 'take-loan') {
      const v = parseInt(($('#loan-amount') || {}).value, 10);
      const r = Game.takeLoan(v || 0);
      toast(r.ok ? 'Kredit +' + fmt(r.amount) + '.' : r.msg, !r.ok);
      return;
    }
    if (a === 'repay-loan') {
      const v = parseInt(($('#loan-amount') || {}).value, 10) || Game.state.debt;
      const r = Game.repayLoan(v);
      toast(r.ok ? 'Getilgt: ' + fmt(r.amount) + '.' : r.msg, !r.ok);
      return;
    }
    if (a === 'stud-filter-reset') {
      studFilter = { breed: '', exMin: '', disc: '', begMin: '', inMin: '', heMin: '', feeMax: '', sort: 'fee', dir: 1 };
      render(); return;
    }

    if (a === 'goto-tab') { showTab(el.dataset.tab); return; }

    if (a === 'copy-friendcode') {
      try { navigator.clipboard.writeText(Game.state.friendCode); toast('Freundschaftscode kopiert.'); }
      catch (e) { toast(Game.state.friendCode, false); }
      return;
    }
    if (a === 'open-code') {
      const inp = $('#redeem-input');
      const raw = inp ? inp.value.trim() : '';
      if (!raw) { toast('Erst einen Code einfügen.', true); return; }
      UI.showTradePreview(raw);
      return;
    }
    if (a === 'offer-horse') {
      const h = Game.getHorse(el.dataset.id);
      const to = prompt('An wen? Freundescode für einen PRIVATEN Verkauf (Format HR-XXXX-XXXX).\nLeer lassen = ÖFFENTLICH (jeder mit dem Code kann bieten, wer zuerst bietet, bekommt es).', '');
      if (to == null) return;
      const price = prompt('Verkaufspreis für „' + h.name + '" (Marktwert ' + fmt(Game.marketPrice(h)) + '):', Game.marketPrice(h));
      if (price == null) return;
      const r = Game.createOffer(h.id, parseInt(price, 10), to);
      if (!r.ok) { toast(r.msg, true); render(); return; }
      UI.showCode('Verkaufs-Angebotscode: ' + h.name,
        'Schick diesen Code an deinen Freund. Er öffnet ihn, sieht das Pferd, gibt ein Kaufgebot ab und schickt dir dessen Code zurück.', r.code);
      render();
      return;
    }
    if (a === 'share-stud') {
      const h = Game.getHorse(el.dataset.id);
      const def = 800 + Math.round(Game.valuation(h) * 0.03);
      const fee = prompt('Deckhengst „' + h.name + '" öffentlich freigeben.\nDeckgeld je Bedeckung, das Freunde zahlen (dein Hengst bleibt bei dir, Code ist mehrfach nutzbar):', def);
      if (fee == null) return;
      const r = Game.shareStud(h.id, parseInt(fee, 10));
      if (!r.ok) { toast(r.msg, true); return; }
      UI.showCode('Deckhengst-Code: ' + h.name,
        'Diesen Code kannst du an beliebig viele Freunde geben. Jeder öffnet ihn und übernimmt den Hengst dauerhaft in seine Deckstation.', r.code);
      return;
    }
    if (a === 'cancel-offer') { const r = Game.cancelOffer(el.dataset.id); if (r.ok) toast('Angebot zurückgezogen.'); render(); return; }
    if (a === 'show-offer-code') {
      const o = (Game.state.pendingOffers || []).find((x) => x.id === el.dataset.id);
      if (!o) return;
      const h = Game.getHorse(o.horseId);
      if (h) UI.showCode('Verkaufs-Angebotscode: ' + h.name,
        'An den Freund schicken. Kaufgebot-Code kommt zurück.',
        Friend.encodeOffer(h, o.price, Game.state.friendCode, o.to, o.id, Game.state.week));
      return;
    }
    if (a === 'settle-stud') {
      const r = Game.settleFriendStud(el.dataset.id);
      if (!r.ok) { toast(r.msg, true); return; }
      UI.showCode('Decktaxe-Abrechnung',
        'Schick diesen Code an den Hengst-Besitzer. Er nimmt ihn an und schickt dir eine Quittung zurück, die du hier einlöst.', r.code);
      render();
      return;
    }
    if (a === 'resend-settle') {
      const x = (Game.state.friendStuds || []).find((e) => e.horse.id === el.dataset.id);
      if (x && x.pendingSettle) {
        UI.showCode('Decktaxe-Abrechnung (erneut)', 'Nochmal an den Hengst-Besitzer schicken.',
          Friend.encodePayout(x.friend, Game.state.friendCode, x.pendingSettle.amount, x.pendingSettle.count, x.horse.name, x.pendingSettle.id));
      }
      return;
    }
    if (a === 'remove-friend-stud') { Game.removeFriendStud(el.dataset.id); toast('Freundes-Deckhengst entfernt.'); return; }

    if (a === 'start-lp') {
      const r = Game.startPerformanceTest(el.dataset.id);
      if (!r.ok) toast(r.msg, true); else toast('Zur Leistungsprüfung angemeldet.');
      render();
      return;
    }
    if (a === 'pedigree') { UI.showPedigree(el.dataset.id); return; }
    if (a === 'plan-to-all') {
      const h = Game.getHorse(el.dataset.id);
      if (h && confirm('Den Trainingsplan von „' + h.name + '" auf ALLE erwachsenen Pferde übertragen (überschreibt deren Pläne)?')) {
        const r = Game.applyPlanToAll(h.trainingPlan || []);
        toast('Plan auf ' + r.count + ' Pferde übertragen.');
        render();
      }
      return;
    }

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
      const mp = Game.marketPrice(h);
      const p = prompt('Verkaufspreis für ' + h.name + ' — Schätzwert ' + fmt(Game.valuation(h)) +
        ', Marktwert aktuell ' + fmt(mp) + ' (nahe Marktwert verkauft sich am schnellsten):', mp);
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
    $('#btn-howto-start').addEventListener('click', () => { $('#howto-overlay').hidden = false; });
  }

  function init() {
    bindGlobal();
    bindStart();
    Game.onChange(() => render());
  }

  // --- Stammbaum-Grafik (rekursives Fächer-Layout).
  function pedNodeHtml(n, gen) {
    if (!n) return '<div class="ped-node empty">—</div>';
    if (n.empty) return '<div class="ped-node empty">—</div>';
    if (n.unknown) return '<div class="ped-node unknown">' + esc(n.name) + '</div>';
    const tags = [];
    if (n.zuchtzulassung && /Zuchtbuch I\b/.test(n.zuchtzulassung)) tags.push('ZB I');
    else if (n.zuchtzulassung) tags.push('ZB II');
    if (n.titel) tags.push(n.titel[0] === 'S' ? 'Sieger' : n.titel);
    if (n.praemie) tags.push(n.praemie.replace('-Prämie', ''));
    return '<div class="ped-node"><b>' + esc(n.name) + '</b>' +
      '<div class="muted small">' + esc(n.breed || '') + (gen <= 1 ? ' · Ext.' + n.conf : '') + '</div>' +
      (tags.length ? '<div class="small">' + tags.map(esc).join(' · ') + '</div>' : '') + '</div>';
  }
  function pedColumnHtml(node, gen, maxGen) {
    if (gen > maxGen) return '';
    return '<div class="ped-col">' +
      '<div class="ped-cell">' + pedNodeHtml(node, gen) + '</div>' +
      (gen < maxGen && node && !node.unknown && !node.empty
        ? '<div class="ped-children">' + pedColumnHtml(node.sire, gen + 1, maxGen) + pedColumnHtml(node.dam, gen + 1, maxGen) + '</div>'
        : '') + '</div>';
  }
  function showPedigree(id) {
    const h = Game.getHorse(id);
    if (!h) return;
    const ped = Model.pedigree(h, Game.getHorse, 4);
    const sp = Game.getHorse(h.sireId), dp = Game.getHorse(h.damId);
    const coiTxt = (sp && dp) ? (Model.inbreedingCoefficient(sp, dp) * 100).toFixed(1) + ' %' : 'nicht berechenbar (Eltern nicht im Stall)';
    $('#pedigree-title').textContent = 'Stammbaum — ' + h.name;
    $('#pedigree-body').innerHTML =
      '<p class="small muted">Inzuchtkoeffizient (COI) dieses Pferdes: ' + coiTxt + '. ' +
      'Bekannt sind nur Vorfahren aus deinem Stall oder gespeicherte Elternnamen.</p>' +
      '<div class="ped-tree"><div class="ped-cell"><div class="ped-node"><b>' + esc(h.name) + '</b><div class="muted small">' + esc(h.breed) + '</div></div></div>' +
      '<div class="ped-children">' + pedColumnHtml(ped.sire, 1, 4) + pedColumnHtml(ped.dam, 1, 4) + '</div></div>';
    $('#pedigree-overlay').hidden = false;
  }

  function showCode(title, hint, code) {
    $('#code-title').textContent = title;
    $('#code-hint').textContent = hint || '';
    $('#code-text').value = code;
    $('#code-overlay').hidden = false;
    setTimeout(() => { $('#code-text').focus(); $('#code-text').select(); }, 30);
  }

  // Rendert einen Steckbrief aus einem "packHorse"-Objekt (Friend-Codes).
  function packedHorseCard(hp) {
    if (!hp || !hp.genotype) return '';
    const y = (hp.ageWeeks || 156) / Model.WEEKS_PER_YEAR;
    const ph = Genetics.describe(hp.genotype, y);
    const begs = Model.DISC.map((d) => d.slice(0, 2) + ' ' + Math.round((hp.potential && hp.potential[d]) || 0)).join(' · ');
    return `<div class="card" style="background:var(--surface-2)">
      <div class="row between"><b>${esc(hp.name || '?')}</b><span class="tag${hp.isMix ? ' warn' : ''}">${esc(hp.breed || '')}</span></div>
      <div class="small muted">${hp.sex === 'hengst' ? '♂ Hengst' : hp.sex === 'stute' ? '♀ Stute' : '⚬ Wallach'} · ${y.toFixed(1)} J. · ${esc(ph.display)}</div>
      <div class="geno-tokens">${esc(ph.tokens)}</div>
      <div class="small">Exterieur ${Math.round(hp.conformation || 0)} · Interieur ${Math.round(hp.temperament || 0)} · Gesundheit ${Math.round(hp.health || 0)}</div>
      <div class="small muted">Begabungen (Potenzial): ${begs}</div>
      ${hp.wins ? '<div class="small">' + hp.wins + ' Turniersiege</div>' : ''}
    </div>`;
  }

  // Code-Vorschau: erst zeigen, was drinsteckt, dann Aktionsknopf.
  function showTradePreview(raw) {
    const p = Game.previewCode(raw);
    if (!p.ok) { toast(p.msg, true); return; }
    tradeRaw = raw;
    $('#trade-title').textContent = p.kind + ' von ' + p.from;
    let body = '';
    if (p.horse && p.horse.genotype) body += packedHorseCard(p.horse);
    if (p.text) body += '<p>' + esc(p.text) + '</p>';
    if (p.action === 'bid') body += '<div class="row between"><span>Preis</span><b>' + fmt(p.price) + '</b></div>';
    if (p.action === 'stud') body += '<div class="row between"><span>Deckgeld je Bedeckung</span><b>' + fmt(p.fee) + '</b></div>';
    if (p.warn) body += '<p class="tag warn small">' + esc(p.warn) + '</p>';
    $('#trade-body').innerHTML = body;

    const btn = {
      bid: 'Kaufgebot abgeben (' + fmt(p.price) + ')',
      sell: 'An ' + p.from + ' verkaufen (' + fmt(p.price) + ')',
      receive: 'Übernehmen & ' + fmt(p.price) + ' zahlen',
      stud: 'Deckhengst übernehmen',
      payout: 'Decktaxe annehmen (' + fmt(p.amount) + ')',
      confirm: 'Abrechnung abschließen',
      reissue: 'Quittung erneut erzeugen',
    }[p.action];
    $('#trade-actions').innerHTML =
      '<button data-trade="' + p.action + '"' + (p.warn && (p.action === 'receive') ? ' disabled' : '') + '>' + btn + '</button>' +
      '<button class="secondary" data-trade="cancel">Abbrechen</button>';
    $('#trade-overlay').hidden = false;
  }
  let tradeRaw = null;
  function onTradeAction(e) {
    const b = e.target.closest('[data-trade]');
    if (!b) return;
    const act = b.dataset.trade;
    if (act === 'cancel') { $('#trade-overlay').hidden = true; return; }
    $('#trade-overlay').hidden = true;
    let r;
    if (act === 'bid') r = Game.acceptOffer(tradeRaw);
    else if (act === 'sell') r = Game.acceptBid(tradeRaw);
    else if (act === 'receive') r = Game.acceptDelivery(tradeRaw);
    else if (act === 'stud') r = Game.acceptStud(tradeRaw);
    else if (act === 'payout') r = Game.acceptPayout(tradeRaw);
    else if (act === 'confirm') r = Game.confirmPayout(tradeRaw);
    else if (act === 'reissue') r = Game.reissueReceipt(tradeRaw);
    if (!r || !r.ok) { toast((r && r.msg) || 'Fehlgeschlagen.', true); render(); return; }
    if (act === 'payout' || act === 'reissue') {
      showCode('Quittung: Decktaxe erhalten',
        'Schick diese Quittung an den Zahler zurück, damit er die Abrechnung bei sich abschließen kann.', r.confirmCode);
      if (act === 'payout') toast('Decktaxe ' + fmt(r.amount) + ' erhalten.');
      render();
      return;
    }
    if (act === 'confirm') { toast('Abrechnung abgeschlossen.'); render(); return; }
    if (r.code) {
      const hints = {
        bid: 'Schick dieses Kaufgebot zurück an den Verkäufer. Bei Zuschlag bekommst du eine Lieferung.',
        sell: 'Schick diese Lieferung an den Käufer – er übernimmt damit das Pferd und zahlt.',
      };
      showCode(act === 'bid' ? 'Kaufgebot-Code' : 'Lieferungs-Code', hints[act], r.code);
    } else {
      toast(r.name ? '„' + r.name + '" übernommen.' : 'Erledigt.');
    }
    render();
  }

  return { init: init, showTab: showTab, toast: toast, showCode: showCode, showTradePreview: showTradePreview, showPedigree: showPedigree };
})();
