const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { carregar } = require('./_navegador');

// Orçamentos por categoria (nucleo.js) e a proteção contra um servidor reposto (integrar, em sincronizacao.js).
const ctx = carregar(['nucleo.js', 'sincronizacao.js']);
const correr = (codigo) => vm.runInContext(codigo, ctx);
const json = (x) => JSON.parse(JSON.stringify(x));
const fundir = (b, l, r) => { ctx.__a = [b, l, r]; return json(correr('fundir(__a[0], __a[1], __a[2])')); };
const normalizar = (d) => { ctx.__d = d; return json(correr('normalizar(__d)')); };

// ---------- Orçamentos por categoria ----------
test('normalizar: dados antigos sem orçamentos ganham o campo vazio; limites inválidos são retirados', () => {
  assert.deepEqual(normalizar({ tiago: {} }).orcamentos, { tiago: {}, claudia: {}, casal: {} });
  const d = normalizar({ orcamentos: { tiago: { comida: '250', lazer: 0, saude: -5, compras: 'abc', prendas: 40.5 }, claudia: null, casal: [] } });
  assert.deepEqual(d.orcamentos, { tiago: { comida: 250, prendas: 40.5 }, claudia: {}, casal: {} });
  assert.deepEqual(normalizar(json(d)).orcamentos, d.orcamentos);   // idempotente
});

test('estadoOrcamento: sem limite, dentro, perto (80%) e ultrapassado', () => {
  const eo = (g, l) => { ctx.__a = [g, l]; return json(correr('estadoOrcamento(__a[0], __a[1])')); };
  assert.equal(eo(50, undefined), null);
  assert.equal(eo(50, 0), null);
  assert.deepEqual(eo(50, 200), { limite: 200, pct: 25, resto: 150, estado: 'ok' });
  assert.equal(eo(160, 200).estado, 'perto');
  assert.deepEqual(eo(200, 200), { limite: 200, pct: 100, resto: 0, estado: 'perto' });
  assert.deepEqual(eo(212.3, 200), { limite: 200, pct: 106, resto: -12.3, estado: 'acima' });
  assert.deepEqual(eo(0, 100), { limite: 100, pct: 0, resto: 100, estado: 'ok' });
});

test('fundir: orçamentos definidos em dois aparelhos juntam-se; limite retirado aqui fica retirado', () => {
  const b = { orcamentos: { tiago: { comida: 200, lazer: 50 }, claudia: {}, casal: {} } };
  const l = { orcamentos: { tiago: { comida: 250 }, claudia: {}, casal: {} } };                       // aqui: sobe a comida, tira o lazer
  const r = { orcamentos: { tiago: { comida: 200, lazer: 50 }, claudia: { compras: 80 }, casal: {} } }; // no outro aparelho: limite da Cláudia
  assert.deepEqual(fundir(b, l, r).orcamentos, { tiago: { comida: 250 }, claudia: { compras: 80 }, casal: {} });
});

// ---------- Servidor reposto (versão mais baixa do que a conhecida) ----------
function prepararIntegrar(dados, base, versao) {
  ctx.__s = json({ dados, base, versao });
  correr('dados = normalizar(__s.dados); base = limpar(__s.base); versao = __s.versao; sujo = false; iniciado = false;');
}
const mesCom = (...itens) => ({ tiago: { '2026-10': { salario: 0, fixo: [], opcional: itens, poupanca: [], investido: [] } } });
const cafe = { id: 'x1', nome: 'Café', valor: 2, categoria: 'restaurante', data: '2026-10-03' };
const pao = { id: 'x2', nome: 'Pão', valor: 1, categoria: 'comida', data: '2026-10-04' };
const idsLocais = () => json(correr('dados.tiago["2026-10"].opcional')).map((i) => i.id).sort();

test('integrar: o servidor apagou um item (versão a subir) e aqui não foi editado: fica apagado', () => {
  prepararIntegrar(mesCom(cafe, pao), mesCom(cafe, pao), 5);
  ctx.__r = mesCom(cafe);
  correr('integrar(__r, 6)');
  assert.deepEqual(idsLocais(), ['x1']);
  assert.equal(correr('sujo'), false);
  assert.equal(correr('versao'), 6);
});

test('integrar: servidor reposto ou vazio (versão mais baixa) não apaga o que está neste aparelho e marca para reenviar', () => {
  prepararIntegrar(mesCom(cafe, pao), mesCom(cafe, pao), 5);
  ctx.__r = null;
  correr('integrar(__r, 0)');
  assert.deepEqual(idsLocais(), ['x1', 'x2']);
  assert.equal(correr('sujo'), true);
  assert.equal(correr('versao'), 0);
});

test('integrar: servidor reposto com dados diferentes junta os dois lados sem perder nenhum', () => {
  const sumo = { id: 'x3', nome: 'Sumo', valor: 3, categoria: 'comida', data: '2026-10-05' };
  prepararIntegrar(mesCom(cafe, pao), mesCom(cafe, pao), 9);
  ctx.__r = mesCom(cafe, sumo);
  correr('integrar(__r, 2)');
  assert.deepEqual(idsLocais(), ['x1', 'x2', 'x3']);
  assert.equal(correr('sujo'), true);
});
