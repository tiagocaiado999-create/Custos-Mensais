const Redis = require('ioredis');

// Cópias de segurança criadas pelo data.js:
//   custos-mensais-dados-backup-original   (estado antes das atualizações, nunca expira)
//   custos-mensais-dados-backup:AAAA-MM-DDTHH   (uma por hora com gravações, 60 dias)
// Ao restaurar, é criada primeiro uma cópia do estado atual: custos-mensais-dados-backup-antes:<data>
const CHAVE = 'custos-mensais-dados';
const CHAVE_VERSAO = 'custos-mensais-versao';
const PREFIXO = CHAVE + '-backup';
const ID_OK = /^(-original|:\d{4}-\d{2}-\d{2}T\d{2}|-antes:\d{4}-\d{2}-\d{2}T[0-9:.]+Z)$/;
let cliente;

function getCliente() {
  if (!cliente) {
    const url = process.env.CustoMensal_REDIS_URL || process.env.REDIS_URL;
    if (!url) throw new Error('Variável de ligação ao Redis não encontrada');
    cliente = new Redis(url);
  }
  return cliente;
}

// Substitui os dados e sobe a versão (os outros aparelhos recebem a versão restaurada)
const SCRIPT_RESTAURAR = `
local v = tonumber(redis.call('GET', KEYS[2]) or '0') + 1
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], tostring(v))
return v
`;

function resumir(d) {
  d = d || {};
  const r = { meses: 0, lancamentos: 0, gastos: 0, poupancas: 0, poupado: 0, investimentos: 0 };
  const meses = new Set();
  const somar = (lista, chave) => (lista || []).forEach((i) => {
    if (chave === 'poup') { r.poupancas++; r.poupado += Number(i.valor) || 0; }
    else { r.lancamentos++; r.gastos += Number(i.valor) || 0; }
  });
  ['tiago', 'claudia'].forEach((p) => Object.keys(d[p] || {}).forEach((k) => {
    meses.add(k);
    const m = d[p][k] || {};
    somar(m.fixo); somar(m.opcional); somar(m.poupanca, 'poup');
  }));
  Object.keys(d.casalOpcional || {}).forEach((k) => {
    meses.add(k);
    const m = d.casalOpcional[k] || {};
    somar(m.opcional); somar(m.poupanca, 'poup');
  });
  r.meses = meses.size;
  const inv = d.investimentos || {};
  ['tiago', 'claudia', 'casal'].forEach((p) => {
    const x = inv[p] || {};
    r.investimentos += (x.ativos || []).length + (x.retirados || []).length;
  });
  r.gastos = Math.round(r.gastos * 100) / 100;
  r.poupado = Math.round(r.poupado * 100) / 100;
  return r;
}

module.exports = async function handler(req, res) {
  try {
    const redis = getCliente();
    res.setHeader('Cache-Control', 'no-store');
    const q = req.query || {};

    if (req.method === 'GET' && !q.id) {
      const chaves = await redis.keys(PREFIXO + '*');
      const lista = chaves.map((k) => k.slice(PREFIXO.length)).filter((id) => ID_OK.test(id)).map((id) => {
        if (id === '-original') return { id, tipo: 'original', quando: null };
        if (id.startsWith(':')) return { id, tipo: 'hora', quando: id.slice(1) + ':00:00Z' };
        return { id, tipo: 'antes', quando: id.slice('-antes:'.length) };
      }).sort((a, b) => String(b.quando || '').localeCompare(String(a.quando || '')));
      res.status(200).json({ backups: lista });
      return;
    }

    if (req.method === 'GET') {
      if (!ID_OK.test(q.id)) { res.status(400).json({ erro: 'Id inválido' }); return; }
      const raw = await redis.get(PREFIXO + q.id);
      if (!raw) { res.status(404).json({ erro: 'Cópia não encontrada' }); return; }
      const atual = await redis.get(CHAVE);
      res.status(200).json({ id: q.id, copia: resumir(JSON.parse(raw)), atual: resumir(atual ? JSON.parse(atual) : {}) });
      return;
    }

    if (req.method === 'POST') {
      const corpo = req.body || {};
      if (!ID_OK.test(corpo.id || '') || corpo.confirmar !== true) { res.status(400).json({ erro: 'Pedido inválido' }); return; }
      const raw = await redis.get(PREFIXO + corpo.id);
      if (!raw) { res.status(404).json({ erro: 'Cópia não encontrada' }); return; }
      const atual = await redis.get(CHAVE);
      if (atual) await redis.set(PREFIXO + '-antes:' + new Date().toISOString(), atual, 'EX', 60 * 60 * 24 * 60);
      const versao = await redis.eval(SCRIPT_RESTAURAR, 2, CHAVE, CHAVE_VERSAO, raw);
      res.status(200).json({ ok: true, versao: Number(versao) });
      return;
    }

    res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
};
