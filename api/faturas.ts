import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Redis from 'ioredis';
import { getCliente } from './_redis';
import { exigirSessao } from './_sessao';
import { msg, um } from './_util';

// Faturas guardadas (para garantias): metadados num hash + imagem (JPEG em base64) numa chave por fatura.
const INDICE = 'custos-mensais-faturas';
const IMG = 'custos-mensais-fatura-img:';
const MAX_IMAGEM = 1500000; // ~1,5 MB de base64 (as fotos são reduzidas no telemóvel)
const idValido = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{4,48}$/.test(id);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!exigirSessao(req, res)) return;
  try {
    const redis = getCliente();
    const q = req.query || {};
    const idq = um(q.id);

    if (req.method === 'GET') {
      if (idq) {
        if (!idValido(idq)) { res.status(400).json({ erro: 'Id inválido' }); return; }
        const b64 = await redis.get(IMG + idq);
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
      if (!idValido(idq)) { res.status(400).json({ erro: 'Id inválido' }); return; }
      await redis.hdel(INDICE, idq);
      await redis.del(IMG + idq);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    res.status(500).json({ erro: msg(e) });
  }
}
