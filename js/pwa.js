/* Registriert den Service Worker (Installierbarkeit + Offline-Betrieb).
   Muss eine eigene Datei sein: die CSP erlaubt kein Inline-Script.
   Ohne Service-Worker-Unterstuetzung (z. B. im Electron-Fenster) passiert
   nichts weiter - das Spiel laeuft normal. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('Service-Worker-Registrierung fehlgeschlagen:', err);
    });
  });
})();
