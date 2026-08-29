/* ============================================================================
   Freundschaftscode & Tauschcodes  (kein Login, kein Server, keine
   Datenerhebung – DSGVO-konform; das Spiel macht keine Netzwerkanfragen).

   Codearten
   ---------
   OF  Verkaufs-ANGEBOT   (privat: an einen bestimmten Freundescode gebunden,
                            oder öffentlich). Enthält Pferdedaten + Preis +
                            Angebots-ID. Einmal-Verkauf: nur EIN Kaufgebot
                            wird vom Verkäufer angenommen ("der Schnellste").
   BD  KAUFGEBOT           Antwort des Käufers auf ein Angebot (Angebots-ID +
                            Käufer-Code). Noch kein Geld, noch kein Pferd.
   DL  LIEFERUNG           Antwort des Verkäufers: enthält die Pferdedaten.
                            Erst hier zahlt der Käufer und bekommt das Pferd.
   SD  DECKHENGST          Öffentlich & mehrfach nutzbar: jeder Freund kann
                            den Hengst dauerhaft in seine Deckstation legen.

   Jeder Code ist Text (UTF-8 -> Base64url mit kurzer Prüfsumme) und wird
   vom Spieler selbst weitergegeben – geräteübergreifend.
   Globales `Friend`.
   ========================================================================== */
const Friend = (function () {
  'use strict';

  const CODE_KEY = 'gestuetsspiel_player_code';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O/1/I

  function randChunk(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }
  function playerCode() {
    let c = null;
    try { c = localStorage.getItem(CODE_KEY); } catch (e) {}
    if (!c || !/^HR-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) {
      c = 'HR-' + randChunk(4) + '-' + randChunk(4);
      try { localStorage.setItem(CODE_KEY, c); } catch (e) {}
    }
    return c;
  }
  function newOfferId() { return randChunk(4) + '-' + randChunk(4); }

  // --- Kodierung --------------------------------------------------------
  function enc(obj) {
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function dec(str) {
    return JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))));
  }
  function sig(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36).slice(0, 6);
  }
  function pack(type, payload) {
    const body = enc(payload);
    return 'HRV2.' + type + '.' + sig(body) + '.' + body;
  }

  // Reduziert ein Pferd auf das Nötige.
  function packHorse(h, currentWeek) {
    return {
      name: h.name, sex: h.sex, breed: h.breed, isMix: !!h.isMix,
      ageWeeks: currentWeek - h.bornWeek,
      genotype: h.genotype,
      potential: h.potential, skill: h.skill,
      exterieur: h.exterieur, interieur: h.interieur, gesundheit: h.gesundheit,
      conformation: h.conformation, temperament: h.temperament, health: h.health,
      quality: h.quality, wins: h.wins || 0, earnings: h.earnings || 0,
      genoTested: h.genoTested !== false,
      turnierPunkte: h.turnierPunkte || {},
      sireName: h.sireName || null, damName: h.damName || null,
      ancestors: h.ancestors || {},
    };
  }

  // --- Encoder --------------------------------------------------------
  function encodeOffer(h, price, fromCode, toCode, offerId, week) {
    return pack('OF', {
      v: 2, id: offerId, from: fromCode, to: toCode || null,
      public: !toCode, price: Math.max(0, Math.round(price)),
      horse: packHorse(h, week),
    });
  }
  function encodeBid(offerId, buyerCode, sellerCode) {
    return pack('BD', { v: 2, id: offerId, from: buyerCode, seller: sellerCode });
  }
  function encodeDelivery(h, price, offerId, sellerCode, week) {
    return pack('DL', { v: 2, id: offerId, from: sellerCode, price: Math.max(0, Math.round(price)), horse: packHorse(h, week) });
  }
  function encodeStud(h, fee, fromCode, week) {
    return pack('SD', { v: 2, from: fromCode, fee: Math.max(0, Math.round(fee)), horse: packHorse(h, week) });
  }
  // Decktaxe-Abrechnung: der Nutzer des Freundes-Hengstes zahlt die
  // gesammelten Deckgebühren an den Besitzer aus.
  function encodePayout(ownerCode, payerCode, amount, count, studName, payId) {
    return pack('PY', { v: 2, id: payId, from: payerCode, to: ownerCode, amount: Math.max(0, Math.round(amount)), count: count || 0, stud: studName || '' });
  }
  // Quittung: bestätigt den Erhalt einer Zahlung/Lieferung an den Absender
  // zurück, damit dieser den Vorgang bei sich abschließen kann.
  function encodeConfirm(kind, refId, fromCode, amount) {
    return pack('CF', { v: 2, k: kind, id: refId, from: fromCode, amount: Math.max(0, Math.round(amount || 0)) });
  }

  const TYPE_LABEL = { OF: 'Verkaufsangebot', BD: 'Kaufgebot', DL: 'Lieferung', SD: 'Deckhengst-Angebot', PY: 'Decktaxe-Abrechnung', CF: 'Quittung' };

  // --- Decoder: prüft Form + Prüfsumme, wirft bei Murks ---------------
  function decode(str) {
    const s = (str || '').trim().replace(/\s+/g, '');
    const m = s.match(/^HRV2\.(OF|BD|DL|SD|PY|CF)\.([a-z0-9]{1,8})\.(.+)$/i);
    if (!m) throw new Error('Das ist kein gültiger Tauschcode.');
    const type = m[1].toUpperCase();
    if (sig(m[3]) !== m[2]) throw new Error('Der Code ist unvollständig oder beschädigt.');
    let p;
    try { p = dec(m[3]); } catch (e) { throw new Error('Der Code lässt sich nicht lesen.'); }
    const out = { type: type, typeLabel: TYPE_LABEL[type], hash: sig(m[3]),
      id: p.id || null, from: p.from || '???', to: p.to || null,
      seller: p.seller || null, public: !!p.public, confirmKind: p.k || null,
      price: p.price || 0, fee: p.fee || 0, amount: p.amount || 0, count: p.count || 0,
      stud: p.stud || '', horse: p.horse || null };
    if ((type === 'OF' || type === 'DL' || type === 'SD') && (!out.horse || !out.horse.genotype)) {
      throw new Error('Im Code fehlen Pferdedaten.');
    }
    return out;
  }

  return {
    playerCode: playerCode,
    newOfferId: newOfferId,
    encodeOffer: encodeOffer,
    encodeBid: encodeBid,
    encodeDelivery: encodeDelivery,
    encodeStud: encodeStud,
    encodePayout: encodePayout,
    encodeConfirm: encodeConfirm,
    decode: decode,
  };
})();
