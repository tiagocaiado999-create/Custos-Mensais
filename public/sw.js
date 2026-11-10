// Service worker: a app abre mesmo sem rede (usa a última versão guardada).
// Os dados (/api/) nunca são guardados aqui: vêm sempre do servidor.
// Mudar VERSAO sempre que a lista PRE_CACHE mudar, para limpar a cache antiga.
const VERSAO = 'custos-v28';
const ESPERA_MS = 4000;   // tempo máximo à espera da rede quando já há uma cópia guardada
const PRE_CACHE = [
  '/', '/style.css', '/inicio.css', '/inicio.js', '/tema.css', '/tema.js', '/auth.js', '/gestao.html', '/login.html', '/carro.html', '/carro.css', '/carro.js', '/negocio.html', '/negocio.css', '/negocio.js', '/manifest.webmanifest',
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
  const daRede = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') {
      const copia = res.clone();
      caches.open(VERSAO).then((c) => c.put(req, copia)).catch(() => {});   // cache cheia ou indisponível: a resposta segue na mesma
    }
    return res;
  });
  // a página inicial serve de reserva só para navegação; um estilo/script em falta deve falhar limpo (não vir HTML)
  const reserva = () => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('/') : Response.error()));
  // Rede muito lenta: ao fim de ESPERA_MS, se houver cópia guardada deste pedido, usa-a (a app abre logo).
  // O pedido à rede continua e atualiza a cópia para a próxima vez. Sem cópia guardada, continua à espera da rede.
  const lenta = new Promise((resolve) => setTimeout(resolve, ESPERA_MS)).then(() => caches.match(req)).then((r) => r || daRede);
  e.respondWith(Promise.race([daRede, lenta]).catch(reserva));
  e.waitUntil(daRede.catch(() => {}));   // mantém o service worker vivo até a cópia ficar atualizada
});
