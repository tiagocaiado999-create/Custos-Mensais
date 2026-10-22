// Ajudas para testar as funções de api/: Redis de mentira em memória + pedido/resposta de mentira.
// As funções .ts são compiladas para .teste-build/ por `npm test` (ver package.json).
const path = require('node:path');

const PASTA = path.join(__dirname, '..', '.teste-build');

// Redis em memória com só os comandos que as funções usam
class RedisFalso {
  constructor() { this.m = new Map(); this.h = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async set(k, v, ...opc) {
    if (opc.includes('NX') && this.m.has(k)) return null;
    this.m.set(k, String(v));
    return 'OK';
  }
  async mget(...ks) { return ks.map((k) => (this.m.has(k) ? this.m.get(k) : null)); }
  async del(...ks) { let n = 0; ks.forEach((k) => { if (this.m.delete(k)) n++; }); return n; }
  async exists(k) { return this.m.has(k) ? 1 : 0; }
  async incr(k) { const n = (parseInt(this.m.get(k) || '0', 10) || 0) + 1; this.m.set(k, String(n)); return n; }
  async expire() { return 1; }
  async keys(padrao) {
    const prefixo = padrao.replace(/\*$/, '');
    return [...this.m.keys()].filter((k) => k.startsWith(prefixo));
  }
  async strlen(k) { return this.m.has(k) ? Buffer.byteLength(this.m.get(k)) : 0; }
  async dbsize() { return this.m.size; }
  async info() { return 'redis_version:7.0.0\r\nused_memory:1000'; }
  async hset(k, campo, v) { if (!this.h.has(k)) this.h.set(k, new Map()); this.h.get(k).set(campo, String(v)); return 1; }
  async hdel(k, campo) { return this.h.has(k) && this.h.get(k).delete(campo) ? 1 : 0; }
  async hgetall(k) { return this.h.has(k) ? Object.fromEntries(this.h.get(k)) : {}; }
  async hlen(k) { return this.h.has(k) ? this.h.get(k).size : 0; }
  // os dois scripts Lua das funções, reproduzidos em JS
  async eval(script, _n, k1, k2, ...argv) {
    const v = parseInt(this.m.get(k2) || '0', 10) || 0;
    if (script.includes('v ~= tonumber(ARGV[1])')) {
      if (v !== parseInt(argv[0], 10)) return [0, v];
      this.m.set(k1, argv[1]); this.m.set(k2, String(v + 1));
      return [1, v + 1];
    }
    this.m.set(k1, argv[0]); this.m.set(k2, String(v + 1));
    return v + 1;
  }
}

let redis = new RedisFalso();
// o ioredis das funções passa a ser a classe de mentira (todas partilham a mesma instância)
const caminhoIoredis = require.resolve('ioredis');
require.cache[caminhoIoredis] = {
  id: caminhoIoredis, filename: caminhoIoredis, loaded: true,
  exports: function Redis() { return redis; }
};

// esvazia em vez de criar outro: as funções guardam a primeira instância que receberam
function novoRedis() { redis.m.clear(); redis.h.clear(); return redis; }

function carregarFuncao(nome) {
  return require(path.join(PASTA, nome + '.js')).default;
}

// pedido e resposta de mentira
function pedido(metodo, opc) {
  opc = opc || {};
  return { method: metodo, query: opc.query || {}, body: opc.body, headers: opc.headers || {} };
}
function resposta() {
  const r = { codigo: 200, corpo: undefined, cabecalhos: {} };
  r.setHeader = (k, v) => { r.cabecalhos[k] = v; return r; };
  r.status = (c) => { r.codigo = c; return r; };
  r.json = (b) => { r.corpo = b; return r; };
  r.send = (b) => { r.corpo = b; return r; };
  return r;
}
async function chamar(nome, metodo, opc) {
  const res = resposta();
  await carregarFuncao(nome)(pedido(metodo, opc), res);
  return res;
}
// cookie de sessão válido para a SENHA atual
async function cookieDeSessao() {
  const res = await chamar('login', 'POST', { body: { senha: process.env.SENHA } });
  return String(res.cabecalhos['Set-Cookie']).split(';')[0];
}

module.exports = { novoRedis, chamar, cookieDeSessao, carregarFuncao };
