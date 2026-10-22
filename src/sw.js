/* GPlanSiS|Sheets: service worker (gerado por src/build.py a partir de src/sw.js; não edite public/sw.js)
   - nunca intercepta /api/* nem requisições que não sejam GET (sessão, salvamento com versão, webhooks)
   - HTML: rede primeiro, com a última cópia como reserva offline
   - demais arquivos do próprio site (vendor, ícones, manifesto): cache primeiro, cache com versão */
const VERSION = '__VERSION__';
const CACHE = 'sheets-' + VERSION;
const SHELL = '/';
const PRECACHE = [SHELL, '/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png',
  '/apple-touch-icon.png', '/vendor/echarts-5.5.1.min.js', '/vendor/xlsx-0.18.5.full.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('sheets-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;               // fontes do Google etc.: direto pelo navegador
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') return;
  if (url.pathname === '/sw.js' || url.pathname === '/GPlanSiS-Sheets-offline.html') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      if (res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').includes('text/html')) {
        const cp = res.clone(); caches.open(CACHE).then(c => c.put(SHELL, cp));
      }
      return res;
    }).catch(() => caches.match(SHELL).then(r => r || new Response(
      '<!doctype html><meta charset="utf-8"><title>GPlanSiS|Sheets</title><p style="font:16px system-ui;padding:24px">Sem conexão. Abra o GPlanSiS|Sheets de novo quando a internet voltar.</p>',
      {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8'}}))));
    return;
  }
  e.respondWith(caches.match(req, {ignoreSearch: false}).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  })));
});
