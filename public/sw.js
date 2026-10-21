// Service worker: a app abre mesmo sem rede (usa a última versão guardada).
// Os dados (/api/) nunca são guardados aqui: vêm sempre do servidor.
// Mudar VERSAO sempre que a lista PRE_CACHE mudar, para limpar a cache antiga.
const VERSAO = 'custos-v3';
const PRE_CACHE = [
  '/', '/style.css', '/manifest.webmanifest',
  '/js/nucleo.js', '/js/sincronizacao.js', '/js/extrato.js', '/js/investimentos.js', '/js/categorias-pesquisa.js', '/js/exportar.js', '/js/adicionar.js', '/js/qr.js', '/js/listas-mes.js', '/js/faturas.js', '/js/painel-mais.js', '/js/resumo.js', '/js/backups.js', '/js/main.js', 
  '/vendor/jsQR.js', '/vendor/xlsx.full.min.js',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  // cada ficheiro é guardado à parte: se um falhar, os outros ficam na mesma
  e.waitUntil(
    caches.open(VERSAO)
      .then((c) => Promise.all(PRE_CACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  // rede primeiro (para receber sempre as atualizações); sem rede usa a cópia guardada
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copia = res.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/')))
  );
});
