const Redis = require('ioredis');

// Faturas guardadas (para garantias): metadados num hash + imagem (JPEG em base64) numa chave por fatura.
const INDICE = 'custos-mensais-faturas';
const IMG = 'custos-mensais-fatura-img:';
const MAX_IMAGEM = 1500000; // ~1,5 MB de base64 (as fotos são reduzidas no telemóvel)
let cliente;

function getCliente() {
  if (!cliente) {
    const url = process.env.CustoMensal_REDIS_URL || process.env.REDIS_URL;
    if (!url) throw new Error('Variável de ligação ao Redis não encontrada');
    cliente = new Redis(url);
  }
  return cliente;
}

const idValido = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{4,48}$/.test(id);

module.exports = async function handler(req, res) {
  try {
    const redis = getCliente();
    const q = req.query || {};

    if (req.method === 'GET') {
      if (q.id) {
        if (!idValido(q.id)) { res.status(400).json({ erro: 'Id inválido' }); return; }
        const b64 = await redis.get(IMG + q.id);
        if (!b64) { res.status(404).json({ erro: 'Sem imagem' }); return; }
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.status(200).send(Buffer.from(b64, 'base64'));
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      const todas = await redis.hgetall(INDICE);
      const lista = Object.values(todas || {}).map((v) => { try { return JSON.parse(v); } catch (e) { return null; } })
        .filter(Boolean)
        .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || (b.criado || 0) - (a.criado || 0));
      res.status(200).json({ faturas: lista });
      return;
    }

    if (req.method === 'POST') {
      const corpo = req.body || {};
      if (!idValido(corpo.id) || !corpo.meta || typeof corpo.meta !== 'object') {
        res.status(400).json({ erro: 'Dados da fatura inválidos' });
        return;
      }
      let temImagem = false;
      if (corpo.imagem) {
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(corpo.imagem);
        if (!m) { res.status(400).json({ erro: 'A imagem tem de ser JPEG' }); return; }
        if (m[1].length > MAX_IMAGEM) { res.status(413).json({ erro: 'Imagem demasiado grande' }); return; }
        await redis.set(IMG + corpo.id, m[1]);
        temImagem = true;
      } else {
        temImagem = (await redis.exists(IMG + corpo.id)) === 1; // atualização só dos dados: mantém a imagem
      }
      const meta = Object.assign({}, corpo.meta, { id: corpo.id, temImagem, criado: corpo.meta.criado || Date.now() });
      await redis.hset(INDICE, corpo.id, JSON.stringify(meta));
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      if (!idValido(q.id)) { res.status(400).json({ erro: 'Id inválido' }); return; }
      await redis.hdel(INDICE, q.id);
      await redis.del(IMG + q.id);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
};
