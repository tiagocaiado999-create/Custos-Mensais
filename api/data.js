const Redis = require('ioredis');

const CHAVE = 'custos-mensais-dados';
let cliente;

function getCliente() {
  if (!cliente) {
    const url = process.env.CustoMensal_REDIS_URL || process.env.REDIS_URL;
    if (!url) throw new Error('Variável de ligação ao Redis não encontrada');
    cliente = new Redis(url);
  }
  return cliente;
}

module.exports = async function handler(req, res) {
  try {
    const redis = getCliente();

    if (req.method === 'GET') {
      const raw = await redis.get(CHAVE);
      res.status(200).json(raw ? JSON.parse(raw) : null);
      return;
    }

    if (req.method === 'POST') {
      await redis.set(CHAVE, JSON.stringify(req.body));
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
};
