/* Service Worker registrieren (Installierbarkeit + Offline-Betrieb) und die
   Ablage des Spielstands gegen Verdraengung schuetzen.
   Muss eine eigene Datei sein: die CSP erlaubt kein Inline-Script.
   Ohne Service-Worker-Unterstuetzung (z. B. im Electron-Fenster) passiert
   nichts weiter - das Spiel laeuft normal. */
(function () {
  'use strict';

  // Dauerhaften Speicher anfragen, damit der Browser localStorage nicht bei
  // Speicherdruck (oder "App schliessen") loescht. Best effort.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(function (already) {
      if (!already) navigator.storage.persist();
    }).catch(function () {});
  }

  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('Service-Worker-Registrierung fehlgeschlagen:', err);
    });
  });
})();
