import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCliente } from './_redis';
import * as sessao from './_sessao';

// Entrar / sair / ver se há sessão.
//   GET    -> { ativa, autenticado }
//   POST   -> { senha }  entra (cookie de 30 dias)
//   DELETE -> sai
// Máximo de 5 tentativas falhadas por IP em 15 minutos.
const PREFIXO = 'custos-mensais-login-falhas:';
const MAX_FALHAS = 5;
const JANELA = 15 * 60;
function ipDe(req: VercelRequest) {
  const h = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  return h || 'desconhecido';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') { res.status(200).json({ ativa: sessao.ativa(), autenticado: sessao.temSessao(req) }); return; }
  if (req.method === 'DELETE') { res.setHeader('Set-Cookie', sessao.cookieSair()); res.status(200).json({ ok: true }); return; }
  if (req.method !== 'POST') { res.status(405).json({ erro: 'Método não permitido' }); return; }
  if (!sessao.ativa()) { res.status(200).json({ ok: true, ativa: false }); return; }

  // se o Redis falhar, deixa tentar na mesma (nunca ficar trancado fora por causa do limite)
  const chave = PREFIXO + ipDe(req);
  let redis = null;
  try {
    redis = getCliente();
    const falhas = parseInt((await redis.get(chave)) || '0', 10) || 0;
    if (falhas >= MAX_FALHAS) { res.status(429).json({ erro: 'Demasiadas tentativas. Tenta daqui a 15 minutos.' }); return; }
  } catch (e) { redis = null; }

  let corpo = req.body;
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; } }

  if (sessao.senhaCorreta(corpo && corpo.senha)) {
    try { if (redis) await redis.del(chave); } catch (e) {}
    res.setHeader('Set-Cookie', sessao.cookieEntrar());
    res.status(200).json({ ok: true });
    return;
  }
  try {
    if (redis) {
      const n = await redis.incr(chave);
      if (n === 1) await redis.expire(chave, JANELA);
    }
  } catch (e) {}
  res.status(401).json({ erro: 'Palavra-passe errada' });
}
