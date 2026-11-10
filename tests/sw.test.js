const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Service worker (public/sw.js): rede primeiro; rede lenta ou em falta usa a cópia guardada.
// O tempo de espera (ESPERA_MS) é encurtado para 20 ms nos testes.
function preparar({ guardado = {}, rede }) {
  const ouvintes = {};
  const cache = Object.assign({}, guardado);
  const ctx = {
    URL, Promise, console,
    setTimeout: (fn) => setTimeout(fn, 20),
    Response: { error: () => 'ERRO-DE-REDE' },
    self: { addEventListener: (nome, fn) => { ouvintes[nome] = fn; }, skipWaiting: () => {}, clients: { claim: () => {} } },
    caches: {
      match: (req) => Promise.resolve(cache[typeof req === 'string' ? req : new URL(req.url).pathname]),
      open: () => Promise.resolve({ put: (req, res) => { cache[new URL(req.url).pathname] = res; return Promise.resolve(); }, add: () => Promise.resolve() }),
      keys: () => Promise.resolve([]), delete: () => Promise.resolve(true)
    },
    fetch: rede
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8'), ctx, { filename: 'sw.js' });
  const pedir = (caminho, extra) => {
    let resposta;
    const req = Object.assign({ url: 'https://exemplo.test' + caminho, method: 'GET', mode: 'no-cors' }, extra || {});
    ouvintes.fetch({ request: req, respondWith: (p) => { resposta = p; }, waitUntil: () => {} });
    return resposta;   // undefined = o service worker não tratou o pedido
  };
  return { pedir, cache };
}
const resposta = (corpo) => ({ ok: true, type: 'basic', corpo, clone() { return this; } });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

test('sw: rede rápida responde da rede e atualiza a cópia guardada', async () => {
  const t = preparar({ guardado: { '/style.css': resposta('antigo') }, rede: () => Promise.resolve(resposta('novo')) });
  assert.equal((await t.pedir('/style.css')).corpo, 'novo');
  await espera(5);
  assert.equal(t.cache['/style.css'].corpo, 'novo');
});

test('sw: rede lenta com cópia guardada responde logo com a cópia e atualiza-a quando a rede chega', async () => {
  const t = preparar({ guardado: { '/style.css': resposta('antigo') }, rede: () => espera(120).then(() => resposta('novo')) });
  assert.equal((await t.pedir('/style.css')).corpo, 'antigo');
  await espera(150);
  assert.equal(t.cache['/style.css'].corpo, 'novo');
});

test('sw: rede lenta sem cópia guardada continua à espera da rede', async () => {
  const t = preparar({ rede: () => espera(80).then(() => resposta('novo')) });
  assert.equal((await t.pedir('/js/novo.js')).corpo, 'novo');
});

test('sw: sem rede usa a cópia; navegação sem cópia cai na página inicial; ficheiro sem cópia falha limpo', async () => {
  const t = preparar({ guardado: { '/': resposta('inicio'), '/style.css': resposta('css') }, rede: () => Promise.reject(new Error('sem rede')) });
  assert.equal((await t.pedir('/style.css')).corpo, 'css');
  assert.equal((await t.pedir('/carro.html?x=1', { mode: 'navigate' })).corpo, 'inicio');
  assert.equal(await t.pedir('/js/falta.js'), 'ERRO-DE-REDE');
});

test('sw: a API e os pedidos que não são GET nunca passam pela cache', () => {
  const t = preparar({ rede: () => Promise.resolve(resposta('x')) });
  assert.equal(t.pedir('/api/data?modo=v2'), undefined);
  assert.equal(t.pedir('/qualquer', { method: 'POST' }), undefined);
});
