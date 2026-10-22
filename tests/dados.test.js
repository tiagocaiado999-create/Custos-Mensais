const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { carregar } = require('./_navegador');

// nucleo.js + sincronizacao.js: as funções partilham o âmbito global, por isso corro expressões no contexto
const ctx = carregar(['nucleo.js', 'sincronizacao.js']);
const correr = (codigo) => vm.runInContext(codigo, ctx);
const fundir = (b, l, r) => { ctx.__a = [b, l, r]; return json(correr('fundir(__a[0], __a[1], __a[2])')); };
const normalizar = (d) => { ctx.__d = d; return json(correr('normalizar(__d)')); };
const json = (x) => JSON.parse(JSON.stringify(x));

test('normalizar: dados vazios ficam com a estrutura completa', () => {
  const d = normalizar(null);
  assert.deepEqual(Object.keys(d).sort(), ['casalOpcional', 'claudia', 'investimentos', 'lojas', 'tiago']);
  assert.deepEqual(d.investimentos.casal, { ativos: [], retirados: [] });
});

test('normalizar: investimentos no formato antigo (lista de ativos) passam para o Tiago', () => {
  const d = normalizar({ investimentos: { ativos: [{ id: 'a1', nome: 'ETF', valor: 100 }], retirados: [] } });
  assert.equal(d.investimentos.tiago.ativos[0].nome, 'ETF');
  assert.deepEqual(d.investimentos.claudia, { ativos: [], retirados: [] });
});

test('normalizar: campos em falta nos itens recebem valores por omissão e nada é perdido', () => {
  const d = normalizar({
    tiago: { '2026-10': { salario: 1500, fixo: [{ id: 'f1', nome: 'Renda', valor: 500 }], opcional: [] } },
    investimentos: { tiago: { ativos: [{ id: 'a1', nome: 'X', valor: 10 }], retirados: [{ id: 'r1', nome: 'Y' }] } }
  });
  const m = d.tiago['2026-10'];
  assert.equal(m.salario, 1500);
  assert.equal(m.fixo[0].categoria, 'outros');
  assert.equal(m.fixo[0].data, '');
  assert.deepEqual(m.poupanca, []);
  assert.deepEqual(m.investido, []);
  assert.equal(d.investimentos.tiago.ativos[0].ticker, '');
  assert.equal(d.investimentos.tiago.retirados[0].dataInvestido, '');
});

test('normalizar: não altera categoria nem data já existentes e é idempotente', () => {
  const original = { tiago: { '2026-10': { salario: 1, fixo: [{ id: 'f', nome: 'a', valor: 1, categoria: 'comida', data: '2026-10-05' }], opcional: [], poupanca: [], investido: [] } } };
  const uma = normalizar(json(original));
  assert.equal(uma.tiago['2026-10'].fixo[0].categoria, 'comida');
  assert.equal(uma.tiago['2026-10'].fixo[0].data, '2026-10-05');
  assert.deepEqual(normalizar(json(uma)), uma);
});

test('fundir: alteração só aqui mantém-se; alteração só no servidor mantém-se', () => {
  const base = { n: 1, t: 'a' };
  assert.deepEqual(fundir(base, { n: 2, t: 'a' }, base), { n: 2, t: 'a' });
  assert.deepEqual(fundir(base, base, { n: 1, t: 'b' }), { n: 1, t: 'b' });
});

test('fundir: alterações em campos diferentes juntam-se', () => {
  const base = { a: 1, b: 1 };
  assert.deepEqual(fundir(base, { a: 2, b: 1 }, { a: 1, b: 3 }), { a: 2, b: 3 });
});

test('fundir: itens novos de cada lado são todos conservados (listas com id)', () => {
  const base = [{ id: 'x', valor: 1 }];
  const aqui = [{ id: 'x', valor: 1 }, { id: 'novoAqui', valor: 5 }];
  const servidor = [{ id: 'x', valor: 1 }, { id: 'novoLa', valor: 7 }];
  const ids = fundir(base, aqui, servidor).map((i) => i.id).sort();
  assert.deepEqual(ids, ['novoAqui', 'novoLa', 'x']);
});

test('fundir: apagado aqui e não editado no servidor fica apagado', () => {
  const base = [{ id: 'x', valor: 1 }, { id: 'y', valor: 2 }];
  const r = fundir(base, [{ id: 'y', valor: 2 }], base);
  assert.deepEqual(r.map((i) => i.id), ['y']);
});

test('fundir: apagado aqui mas editado no servidor não perde a edição', () => {
  const base = [{ id: 'x', valor: 1 }];
  assert.deepEqual(fundir(base, [], [{ id: 'x', valor: 99 }]), [{ id: 'x', valor: 99 }]);
});

test('fundir: o mesmo item editado nos dois lados em campos diferentes junta as duas edições', () => {
  const base = [{ id: 'x', nome: 'a', valor: 1 }];
  const r = fundir(base, [{ id: 'x', nome: 'b', valor: 1 }], [{ id: 'x', nome: 'a', valor: 9 }]);
  assert.deepEqual(r, [{ id: 'x', nome: 'b', valor: 9 }]);
});

test('fundir: não altera as entradas (devolve cópias)', () => {
  const l = { a: [{ id: '1', v: 1 }] }, r = { a: [{ id: '2', v: 2 }] }, b = { a: [] };
  const copiaL = json(l), copiaR = json(r);
  fundir(b, l, r);
  assert.deepEqual(l, copiaL);
  assert.deepEqual(r, copiaR);
});

test('somaLista, esc e chave', () => {
  ctx.__l = [{ valor: 1.5 }, { valor: '2' }, { valor: 'abc' }, {}];
  assert.equal(correr('somaLista(__l)'), 3.5);
  ctx.__s = '<b onclick="x()">&\'';
  assert.equal(correr('esc(__s)'), '&lt;b onclick=&quot;x()&quot;&gt;&amp;&#39;');
  assert.equal(correr('esc(null)'), '');
  assert.equal(correr('chave(2026, 0)'), '2026-01');
});
