const Redis = require('ioredis');

// A chave dos dados é a mesma de sempre: os dados existentes ficam exatamente onde estavam.
const CHAVE = 'custos-mensais-dados';
const CHAVE_VERSAO = 'custos-mensais-versao';
let cliente;

function getCliente() {
  if (!cliente) {
    const url = process.env.CustoMensal_REDIS_URL || process.env.REDIS_URL;
    if (!url) throw new Error('Variável de ligação ao Redis não encontrada');
    cliente = new Redis(url);
  }
  return cliente;
}

// Grava só se a versão enviada for a versão atual (operação atómica no Redis).
const SCRIPT_GRAVAR = `
local v = tonumber(redis.call('GET', KEYS[2]) or '0')
if v ~= tonumber(ARGV[1]) then return {0, v} end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(v + 1))
return {1, v + 1}
`;

// Cópias de segurança: uma "original" (nunca expira) e uma por hora (guardadas 60 dias),
// sempre com o estado ANTES da primeira gravação dessa hora.
async function fazerBackup(redis) {
  const atual = await redis.get(CHAVE);
  if (!atual) return;
  await redis.set(CHAVE + '-backup-original', atual, 'NX');
  const hora = new Date().toISOString().slice(0, 13);
  await redis.set(CHAVE + '-backup:' + hora, atual, 'EX', 60 * 60 * 24 * 60, 'NX');
}

async function lerAtual(redis) {
  const [raw, v] = await redis.mget(CHAVE, CHAVE_VERSAO);
  return { dados: raw ? JSON.parse(raw) : null, versao: parseInt(v || '0', 10) || 0 };
}

const { exigirSessao } = require('./_sessao');

module.exports = async function handler(req, res) {
  if (!exigirSessao(req, res)) return;
  try {
    const redis = getCliente();
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const { dados, versao } = await lerAtual(redis);
      const q = req.query || {};
      if (q.modo === 'v2') {
        if (q.desde !== undefined && String(q.desde) === String(versao)) {
          res.status(200).json({ versao, semAlteracoes: true });
          return;
        }
        res.status(200).json({ versao, dados });
        return;
      }
      res.status(200).json(dados); // formato antigo (só leitura)
      return;
    }

    if (req.method === 'POST') {
      const corpo = req.body;
      if (!corpo || typeof corpo.versao !== 'number' || !corpo.dados || typeof corpo.dados !== 'object') {
        // versão antiga do site (guardava tudo por cima): recusa para não apagar dados
        res.status(409).json({ erro: 'Versão antiga do site. Recarregue a página para continuar a guardar.' });
        return;
      }
      await fazerBackup(redis);
      const [ok, nova] = await redis.eval(
        SCRIPT_GRAVAR, 2, CHAVE, CHAVE_VERSAO, String(corpo.versao), JSON.stringify(corpo.dados)
      );
      if (Number(ok) === 1) {
        res.status(200).json({ ok: true, versao: Number(nova) });
        return;
      }
      const atual = await lerAtual(redis);
      res.status(409).json({ erro: 'Conflito de versão', versao: atual.versao, dados: atual.dados });
      return;
    }

    res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
};
