/* ============================================================================
   Freundschaftscodes & Tauschcodes.

   Kein Login, kein Server, keine Datenabfrage: Jede Installation bekommt
   einmalig einen zufälligen Freundschaftscode (im localStorage, überlebt
   „Neues Spiel" und „Spielstand löschen"). Pferde-Verkäufe und Deckhengst-
   Angebote werden als kopierbarer Text-Code exportiert, den man per
   Messenger/Mail an Freunde schickt; die Gegenseite löst ihn ein.
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

  // Liefert den (bei Bedarf neu erzeugten) Freundschaftscode dieser Installation.
  function playerCode() {
    let c = null;
    try { c = localStorage.getItem(CODE_KEY); } catch (e) {}
    if (!c || !/^HR-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) {
      c = 'HR-' + randChunk(4) + '-' + randChunk(4);
      try { localStorage.setItem(CODE_KEY, c); } catch (e) {}
    }
    return c;
  }

  // --- kompakte, kopierbare Kodierung (UTF-8 -> Base64url) ---------------
  function enc(obj) {
    const json = JSON.stringify(obj);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function dec(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  }
  // sehr einfache Prüfsumme, damit „Code kaputt" erkennbar ist
  function sig(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36).slice(0, 6);
  }

  // Reduziert ein Pferd auf das, was die Gegenseite braucht.
  function packHorse(h, currentWeek) {
    return {
      name: h.name, sex: h.sex, breed: h.breed, isMix: !!h.isMix,
      ageWeeks: currentWeek - h.bornWeek,
      genotype: h.genotype,
      potential: h.potential, skill: h.skill,
      exterieur: h.exterieur, interieur: h.interieur, gesundheit: h.gesundheit,
      conformation: h.conformation, temperament: h.temperament, health: h.health,
      quality: h.quality, wins: h.wins || 0, earnings: h.earnings || 0,
      turnierPunkte: h.turnierPunkte || {},
      sireName: h.sireName || null, damName: h.damName || null,
      ancestors: h.ancestors || {},
    };
  }

  function encodeHorseOffer(h, price, fromCode, currentWeek) {
    const payload = { v: 1, k: 'H', from: fromCode, price: Math.max(0, Math.round(price)), horse: packHorse(h, currentWeek) };
    const body = enc(payload);
    return 'HRV1.H.' + sig(body) + '.' + body;
  }
  function encodeStudOffer(h, fee, fromCode, currentWeek) {
    const payload = { v: 1, k: 'S', from: fromCode, fee: Math.max(0, Math.round(fee)), horse: packHorse(h, currentWeek) };
    const body = enc(payload);
    return 'HRV1.S.' + sig(body) + '.' + body;
  }

  // Gibt { kind:'horse'|'stud', from, price|fee, horse } zurück oder wirft.
  function decode(str) {
    const s = (str || '').trim().replace(/\s+/g, '');
    const m = s.match(/^HRV1\.([HS])\.([a-z0-9]{1,8})\.(.+)$/i);
    if (!m) throw new Error('Das ist kein gültiger Tauschcode.');
    const body = m[3];
    if (sig(body) !== m[2]) throw new Error('Der Code ist unvollständig oder beschädigt.');
    let p;
    try { p = dec(body); } catch (e) { throw new Error('Der Code lässt sich nicht lesen.'); }
    if (!p || !p.horse || !p.horse.genotype) throw new Error('Im Code fehlen Pferdedaten.');
    return {
      kind: m[1].toUpperCase() === 'H' ? 'horse' : 'stud',
      from: p.from || '???',
      price: p.price || 0,
      fee: p.fee || 0,
      horse: p.horse,
      hash: sig(body),
    };
  }

  return {
    playerCode: playerCode,
    encodeHorseOffer: encodeHorseOffer,
    encodeStudOffer: encodeStudOffer,
    decode: decode,
  };
})();
