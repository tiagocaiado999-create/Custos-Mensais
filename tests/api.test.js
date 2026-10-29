const test = require('node:test');
const assert = require('node:assert/strict');

// variáveis só para os testes: nada disto é real
process.env.CustoMensal_REDIS_URL = 'redis://falso';
process.env.SENHA = 'senha-de-teste';
process.env.CRON_SECRET = 'segredo-de-teste';

const { novoRedis, chamar, cookieDeSessao } = require('./_api');

const dadosExemplo = () => ({ tiago: { '2026-10': { salario: 1000, fixo: [], opcional: [], poupanca: [], investido: [] } }, claudia: {} });

test.beforeEach(() => { novoRedis(); });

// ---------- palavra-passe ----------

test('sem sessão, todas as funções de dados respondem 401 e não tocam nos dados', async () => {
  for (const nome of ['data', 'carro', 'negocio', 'faturas', 'estado', 'backups', 'preco']) {
    const r = await chamar(nome, 'GET');
    assert.equal(r.codigo, 401, nome);
  }
  const post = await chamar('data', 'POST', { body: { versao: 0, dados: dadosExemplo() } });
  assert.equal(post.codigo, 401);
});

test('login: palavra-passe errada 401, certa 200 com cookie HttpOnly', async () => {
  assert.equal((await chamar('login', 'POST', { body: { senha: 'errada' } })).codigo, 401);
  const ok = await chamar('login', 'POST', { body: { senha: 'senha-de-teste' } });
  assert.equal(ok.codigo, 200);
  const cookie = ok.cabecalhos['Set-Cookie'];
  assert.match(cookie, /^cm_sessao=[0-9a-f]{64}; /);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
});

test('login: à 6.ª tentativa falhada do mesmo IP responde 429, mesmo com a palavra-passe certa', async () => {
  const ip = { 'x-forwarded-for': '1.2.3.4' };
  for (let i = 0; i < 5; i++) assert.equal((await chamar('login', 'POST', { body: { senha: 'x' }, headers: ip })).codigo, 401);
  assert.equal((await chamar('login', 'POST', { body: { senha: 'senha-de-teste' }, headers: ip })).codigo, 429);
  // outro IP não é afetado
  assert.equal((await chamar('login', 'POST', { body: { senha: 'senha-de-teste' }, headers: { 'x-forwarded-for': '9.9.9.9' } })).codigo, 200);
});

test('login: GET diz se há sessão; DELETE limpa o cookie', async () => {
  const sem = await chamar('login', 'GET');
  assert.deepEqual(sem.corpo, { ativa: true, autenticado: false });
  const cookie = await cookieDeSessao();
  const com = await chamar('login', 'GET', { headers: { cookie } });
  assert.equal(com.corpo.autenticado, true);
  const sair = await chamar('login', 'DELETE');
  assert.match(sair.cabecalhos['Set-Cookie'], /Max-Age=0/);
});

test('cookie falso ou de outra palavra-passe é recusado', async () => {
  const r = await chamar('data', 'GET', { headers: { cookie: 'cm_sessao=' + 'a'.repeat(64) } });
  assert.equal(r.codigo, 401);
});

// ---------- dados principais ----------

test('data: gravar com a versão certa sobe a versão e guarda cópia de segurança', async () => {
  const cookie = await cookieDeSessao();
  const r0 = await chamar('data', 'GET', { query: { modo: 'v2' }, headers: { cookie } });
  assert.deepEqual(r0.corpo, { versao: 0, dados: null });

  const dados = dadosExemplo();
  const p1 = await chamar('data', 'POST', { body: { versao: 0, dados }, headers: { cookie } });
  assert.deepEqual(p1.corpo, { ok: true, versao: 1 });

  const dados2 = dadosExemplo(); dados2.tiago['2026-10'].salario = 2000;
  const p2 = await chamar('data', 'POST', { body: { versao: 1, dados: dados2 }, headers: { cookie } });
  assert.equal(p2.corpo.versao, 2);

  const lido = await chamar('data', 'GET', { query: { modo: 'v2' }, headers: { cookie } });
  assert.equal(lido.corpo.dados.tiago['2026-10'].salario, 2000);
  // a cópia "original" guarda o estado antes da segunda gravação e nunca é substituída
  const bk = await chamar('backups', 'GET', { headers: { cookie } });
  assert.ok(bk.corpo.backups.some((b) => b.tipo === 'original'));
});

test('data: gravar com versão antiga dá 409 e devolve o estado atual (sem sobrescrever)', async () => {
  const cookie = await cookieDeSessao();
  await chamar('data', 'POST', { body: { versao: 0, dados: dadosExemplo() }, headers: { cookie } });
  const intruso = dadosExemplo(); intruso.tiago['2026-10'].salario = 1;
  const r = await chamar('data', 'POST', { body: { versao: 0, dados: intruso }, headers: { cookie } });
  assert.equal(r.codigo, 409);
  assert.equal(r.corpo.versao, 1);
  assert.equal(r.corpo.dados.tiago['2026-10'].salario, 1000);
});

test('data: corpo no formato antigo (sem versão) é recusado para não apagar dados', async () => {
  const cookie = await cookieDeSessao();
  await chamar('data', 'POST', { body: { versao: 0, dados: dadosExemplo() }, headers: { cookie } });
  const r = await chamar('data', 'POST', { body: dadosExemplo(), headers: { cookie } });
  assert.equal(r.codigo, 409);
  const lido = await chamar('data', 'GET', { query: { modo: 'v2' }, headers: { cookie } });
  assert.equal(lido.corpo.versao, 1);
});

test('data: GET com a versão que já tenho responde semAlteracoes', async () => {
  const cookie = await cookieDeSessao();
  await chamar('data', 'POST', { body: { versao: 0, dados: dadosExemplo() }, headers: { cookie } });
  const r = await chamar('data', 'GET', { query: { modo: 'v2', desde: '1' }, headers: { cookie } });
  assert.deepEqual(r.corpo, { versao: 1, semAlteracoes: true });
});

test('data: método não permitido dá 405', async () => {
  const cookie = await cookieDeSessao();
  assert.equal((await chamar('data', 'DELETE', { headers: { cookie } })).codigo, 405);
});

// ---------- carro ----------

test('carro: gravar, conflito de versão e limite de tamanho', async () => {
  const cookie = await cookieDeSessao();
  const ok = await chamar('carro', 'POST', { body: { versao: 0, dados: { preco: 30000 } }, headers: { cookie } });
  assert.equal(ok.corpo.versao, 1);
  const conflito = await chamar('carro', 'POST', { body: { versao: 0, dados: { preco: 1 } }, headers: { cookie } });
  assert.equal(conflito.codigo, 409);
  assert.equal(conflito.corpo.dados.preco, 30000);
  const grande = await chamar('carro', 'POST', { body: { versao: 1, dados: { x: 'a'.repeat(500001) } }, headers: { cookie } });
  assert.equal(grande.codigo, 413);
  assert.equal((await chamar('carro', 'POST', { body: { dados: {} }, headers: { cookie } })).codigo, 400);
});

// ---------- negócio ----------

test('negocio: gravar, ler e conflito de versão', async () => {
  const cookie = await cookieDeSessao();
  const ok = await chamar('negocio', 'POST', { body: { versao: 0, dados: { compras: [{ id: 'a', valor: 50 }], vendas: [] } }, headers: { cookie } });
  assert.equal(ok.corpo.versao, 1);
  const lido = await chamar('negocio', 'GET', { headers: { cookie } });
  assert.equal(lido.corpo.dados.compras[0].valor, 50);
  assert.equal((await chamar('negocio', 'POST', { body: { versao: 0, dados: {} }, headers: { cookie } })).codigo, 409);
});

// ---------- faturas ----------

test('faturas: guardar com imagem, listar, ler a imagem e apagar', async () => {
  const cookie = await cookieDeSessao();
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from('foto').toString('base64');
  const g = await chamar('faturas', 'POST', { body: { id: 'f-1234', meta: { nome: 'Loja', total: 10, data: '2026-10-01' }, imagem: jpeg }, headers: { cookie } });
  assert.equal(g.codigo, 200);
  const lista = await chamar('faturas', 'GET', { headers: { cookie } });
  assert.equal(lista.corpo.faturas.length, 1);
  assert.equal(lista.corpo.faturas[0].temImagem, true);
  const img = await chamar('faturas', 'GET', { query: { id: 'f-1234' }, headers: { cookie } });
  assert.equal(Buffer.from(img.corpo).toString(), 'foto');
  await chamar('faturas', 'DELETE', { query: { id: 'f-1234' }, headers: { cookie } });
  assert.equal((await chamar('faturas', 'GET', { headers: { cookie } })).corpo.faturas.length, 0);
});

test('faturas: atualizar só os dados mantém a imagem', async () => {
  const cookie = await cookieDeSessao();
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from('foto').toString('base64');
  await chamar('faturas', 'POST', { body: { id: 'f-1234', meta: { nome: 'A' }, imagem: jpeg }, headers: { cookie } });
  await chamar('faturas', 'POST', { body: { id: 'f-1234', meta: { nome: 'B' } }, headers: { cookie } });
  const lista = await chamar('faturas', 'GET', { headers: { cookie } });
  assert.equal(lista.corpo.faturas[0].nome, 'B');
  assert.equal(lista.corpo.faturas[0].temImagem, true);
});

test('faturas: ids inválidos, imagem que não é JPEG e parâmetro repetido são recusados', async () => {
  const cookie = await cookieDeSessao();
  assert.equal((await chamar('faturas', 'POST', { body: { id: 'x', meta: {} }, headers: { cookie } })).codigo, 400);
  assert.equal((await chamar('faturas', 'POST', { body: { id: 'f-1234', meta: {}, imagem: 'data:image/png;base64,AAAA' }, headers: { cookie } })).codigo, 400);
  assert.equal((await chamar('faturas', 'GET', { query: { id: '../../etc' }, headers: { cookie } })).codigo, 400);
  assert.equal((await chamar('faturas', 'GET', { query: { id: ['f-1234', 'f-5678'] }, headers: { cookie } })).codigo, 404);
});

// ---------- cópias de segurança ----------

test('backups: restaurar guarda primeiro o estado atual ("antes") e repõe a cópia', async () => {
  const cookie = await cookieDeSessao();
  await chamar('data', 'POST', { body: { versao: 0, dados: dadosExemplo() }, headers: { cookie } });
  const mudado = dadosExemplo(); mudado.tiago['2026-10'].salario = 5;
  await chamar('data', 'POST', { body: { versao: 1, dados: mudado }, headers: { cookie } });

  const antes = await chamar('backups', 'GET', { headers: { cookie } });
  const original = antes.corpo.backups.find((b) => b.tipo === 'original');
  const comp = await chamar('backups', 'GET', { query: { id: original.id }, headers: { cookie } });
  assert.equal(comp.corpo.copia.gastos, 0);

  const semConfirmar = await chamar('backups', 'POST', { body: { id: original.id }, headers: { cookie } });
  assert.equal(semConfirmar.codigo, 400);

  const rest = await chamar('backups', 'POST', { body: { id: original.id, confirmar: true }, headers: { cookie } });
  assert.equal(rest.codigo, 200);
  assert.equal(rest.corpo.versao, 3);
  const lido = await chamar('data', 'GET', { query: { modo: 'v2' }, headers: { cookie } });
  assert.equal(lido.corpo.dados.tiago['2026-10'].salario, 1000);
  const depois = await chamar('backups', 'GET', { headers: { cookie } });
  assert.ok(depois.corpo.backups.some((b) => b.tipo === 'antes'));
});

test('backups: ids inválidos e importação sem confirmação são recusados', async () => {
  const cookie = await cookieDeSessao();
  assert.equal((await chamar('backups', 'GET', { query: { id: 'qualquer' }, headers: { cookie } })).codigo, 400);
  assert.equal((await chamar('backups', 'POST', { body: { importar: true, dados: dadosExemplo() }, headers: { cookie } })).codigo, 400);
  const mau = await chamar('backups', 'POST', { body: { importar: true, confirmar: true, dados: { x: 1 } }, headers: { cookie } });
  assert.equal(mau.codigo, 400);
});

// ---------- cópia por email ----------

test('copia-email: o GET do agendamento exige o CRON_SECRET; o POST exige sessão', async () => {
  assert.equal((await chamar('copia-email', 'GET')).codigo, 401);
  assert.equal((await chamar('copia-email', 'GET', { headers: { authorization: 'Bearer errado' } })).codigo, 401);
  assert.equal((await chamar('copia-email', 'POST')).codigo, 401);
});

// ---------- estado ----------

test('estado: só aceita GET e devolve contagens', async () => {
  const cookie = await cookieDeSessao();
  await chamar('data', 'POST', { body: { versao: 0, dados: dadosExemplo() }, headers: { cookie } });
  const r = await chamar('estado', 'GET', { headers: { cookie } });
  assert.equal(r.codigo, 200);
  assert.equal(r.corpo.app.versaoDados, 1);
  assert.equal((await chamar('estado', 'POST', { headers: { cookie } })).codigo, 405);
});

// ---------- sem SENHA o site fica aberto de propósito ----------

test('sem SENHA definida as funções ficam abertas (para nunca ficar trancado fora)', async () => {
  const guardada = process.env.SENHA;
  delete process.env.SENHA;
  try {
    assert.equal((await chamar('data', 'GET')).codigo, 200);
  } finally { process.env.SENHA = guardada; }
});
