/* Service worker CCG Flow — rend l'application installable (PWA) et offre un repli hors-ligne.
   Stratégie « network-first » : en ligne on sert toujours la version fraîche (aucun risque de
   servir un ancien déploiement), et on ne bascule sur le cache qu'en cas d'échec réseau.
   On ne met en cache que les ressources statiques same-origin (jamais /api : données authentifiées
   et volatiles). */
const CACHE = 'ccg-flow-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge des anciens caches versionnés.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // pas de cross-origin
  if (url.pathname.startsWith('/api')) return;          // jamais les appels API

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Ne cache que les réponses complètes et valides.
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Pour une navigation hors-ligne, retombe sur la page d'accueil (SPA).
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
