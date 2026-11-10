const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { carregar } = require('./_navegador');

// Fila de faturas por enviar (public/js/faturas.js): o que sai da fila e o que fica, conforme a resposta do servidor.
const PEND = 'custos-faturas-pendentes';
function preparar(respostas) {
  const pedidos = [];
  const ctx = carregar(['nucleo.js', 'sincronizacao.js', 'categorias-pesquisa.js', 'faturas.js'], {
    fetch: (url, init) => {
      pedidos.push(JSON.parse(init.body).id);
      const r = respostas.shift();
      if (r === 'rede') return Promise.reject(new Error('sem rede'));
      return Promise.resolve({ ok: r >= 200 && r < 300, status: r });
    }
  });
  const fila = (ids) => { ctx.__f = ids.map((id) => ({ id, meta: { nome: id }, imagem: null })); vm.runInContext('gravarPendentes(__f)', ctx); };
  const naFila = () => JSON.parse(ctx.localStorage.getItem(PEND) || '[]').map((p) => p.id);
  const enviar = () => vm.runInContext('enviarFaturas()', ctx);
  return { pedidos, fila, naFila, enviar, falha: () => vm.runInContext('falhaFaturas', ctx) };
}

test('faturas: guardada no servidor sai da fila', async () => {
  const t = preparar([200, 200]);
  t.fila(['fat-a', 'fat-b']);
  await t.enviar();
  assert.deepEqual(t.naFila(), []);
  assert.deepEqual(t.pedidos, ['fat-a', 'fat-b']);
  assert.equal(t.falha(), false);
});

test('faturas: sem sessão (401) a fatura fica na fila para seguir depois de entrar', async () => {
  const t = preparar([401]);
  t.fila(['fat-a', 'fat-b']);
  await t.enviar();
  assert.deepEqual(t.naFila(), ['fat-a', 'fat-b']);
  assert.deepEqual(t.pedidos, ['fat-a']);   // pára na primeira: não vale a pena insistir sem sessão
  assert.equal(t.falha(), true);
});

test('faturas: demasiados pedidos (429), tempo esgotado (408), erro do servidor (500) e falta de rede mantêm a fila', async () => {
  for (const r of [429, 408, 500, 'rede']) {
    const t = preparar([r]);
    t.fila(['fat-a']);
    await t.enviar();
    assert.deepEqual(t.naFila(), ['fat-a'], 'resposta ' + r);
    assert.equal(t.falha(), true, 'resposta ' + r);
  }
});

test('faturas: recusada de vez (400 ou 413) sai da fila e as seguintes continuam', async () => {
  const t = preparar([400, 413, 200]);
  t.fila(['fat-a', 'fat-b', 'fat-c']);
  await t.enviar();
  assert.deepEqual(t.naFila(), []);
  assert.deepEqual(t.pedidos, ['fat-a', 'fat-b', 'fat-c']);
});

test('faturas: sem espaço no telemóvel a fila fica em memória e assinalada para o aviso; ao esvaziar deixa de estar', () => {
  const ctx = carregar(['nucleo.js', 'sincronizacao.js', 'categorias-pesquisa.js', 'faturas.js'], {
    localStorage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} }
  });
  ctx.__f = [{ id: 'fat-a', meta: { nome: 'a' }, imagem: 'data:image/jpeg;base64,AAAA' }];
  vm.runInContext('gravarPendentes(__f)', ctx);
  assert.equal(vm.runInContext('filaSoEmMemoria', ctx), true);
  assert.equal(vm.runInContext('lerPendentes().length', ctx), 1);   // continua na fila enquanto a app estiver aberta
  vm.runInContext('gravarPendentes([])', ctx);
  assert.equal(vm.runInContext('filaSoEmMemoria', ctx), false);
});

test('faturas: uma fatura posta na fila durante um envio segue logo a seguir', async () => {
  const t = preparar([200, 200]);
  t.fila(['fat-a']);
  const primeiro = t.enviar();
  t.fila(['fat-a', 'fat-b']);   // entra enquanto a primeira ainda está a ser enviada
  t.enviar();                   // o segundo pedido não corre em paralelo: fica marcado para depois
  await primeiro;
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(t.naFila(), []);
  assert.deepEqual(t.pedidos, ['fat-a', 'fat-b']);
});
