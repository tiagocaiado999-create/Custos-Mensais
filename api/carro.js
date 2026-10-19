const Redis = require('ioredis');

// Dados da página do carro (um único documento), com versão para evitar que duas pessoas se sobreponham.
const CHAVE = 'custos-mensais-carro';
const CHAVE_VERSAO = 'custos-mensais-carro-versao';
let cliente;

function getCliente() {
  if (!cliente) {
    const url = process.env.CustoMensal_REDIS_URL || process.env.REDIS_URL;
    if (!url) throw new Error('Variável de ligação ao Redis não encontrada');
    cliente = new Redis(url);
  }
  return cliente;
}

const SCRIPT_GRAVAR = `
local v = tonumber(redis.call('GET', KEYS[2]) or '0')
if v ~= tonumber(ARGV[1]) then return {0, v} end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(v + 1))
return {1, v + 1}
`;

async function lerAtual(redis) {
  const [raw, v] = await redis.mget(CHAVE, CHAVE_VERSAO);
  return { dados: raw ? JSON.parse(raw) : null, versao: parseInt(v || '0', 10) || 0 };
}

module.exports = async function handler(req, res) {
  try {
    const redis = getCliente();
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      res.status(200).json(await lerAtual(redis));
      return;
    }

    if (req.method === 'POST') {
      const corpo = req.body || {};
      if (typeof corpo.versao !== 'number' || !corpo.dados || typeof corpo.dados !== 'object') {
        res.status(400).json({ erro: 'Pedido inválido' });
        return;
      }
      const texto = JSON.stringify(corpo.dados);
      if (texto.length > 500000) { res.status(413).json({ erro: 'Dados demasiado grandes' }); return; }
      // cópia por hora (sem mexer nas cópias dos dados principais), guardada 60 dias
      const atual = await redis.get(CHAVE);
      if (atual) await redis.set(CHAVE + '-backup:' + new Date().toISOString().slice(0, 13), atual, 'EX', 60 * 60 * 24 * 60, 'NX');
      const [ok, nova] = await redis.eval(SCRIPT_GRAVAR, 2, CHAVE, CHAVE_VERSAO, String(corpo.versao), texto);
      if (Number(ok) === 1) { res.status(200).json({ ok: true, versao: Number(nova) }); return; }
      const outro = await lerAtual(redis);
      res.status(409).json({ erro: 'Conflito de versão', versao: outro.versao, dados: outro.dados });
      return;
    }

    res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
};
