import type Redis from 'ioredis';
import { msg } from './_util';

// Ligação ao FafeBuilds (só leitura), partilhada pela página do negócio e pela cópia semanal.
// Variáveis na Vercel: FAFEBUILDS_KEY (a mesma PRECOS_API_KEY do FafeBuilds) e, opcional, FAFEBUILDS_URL.
const CHAVE_CACHE = 'custos-mensais-negocio-fafe-cache';
const CHAVE_AVISO = 'custos-mensais-negocio-fafe-aviso';
const VALIDADE_MS = 5 * 60 * 1000;

export interface RespostaFafe {
  items: { id: string; name: string; cost: number; boughtAt: string | null; sell: number | null; stale: boolean; days: number | null; sold: boolean; soldPrice: number | null; soldAt: string | null }[];
  pcs: { id: string; title: string; price: number; cost: number; soldAt: string }[];
  stock: { count: number; cost: number; sell: number; staleCount: number; staleCost: number };
}
export interface ResultadoFafe { ligado: boolean; dados: RespostaFafe | null; atualizadoEm?: string; desatualizado?: boolean; erro?: string }

// Aviso por email (no máximo um por dia) quando a ligação falha: assim uma chave trocada só num dos sites não passa despercebida.
async function avisar(redis: Redis, erro: string) {
  const chave = process.env.RESEND_API_KEY, para = process.env.EMAIL_COPIA;
  if (!chave || !para) return;
  if ((await redis.set(CHAVE_AVISO, '1', 'EX', 60 * 60 * 24, 'NX')) !== 'OK') return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Custos Mensais <onboarding@resend.dev>', to: [para],
      subject: 'Custos Mensais: falhou a ligação ao FafeBuilds',
      text: 'A página Negócio não consegue ler o FafeBuilds.\n\nMotivo: ' + erro + '\n\nSe for 401, a FAFEBUILDS_KEY do Custos Mensais é diferente da PRECOS_API_KEY do FafeBuilds. Se for 503, falta a PRECOS_API_KEY no FafeBuilds.'
    })
  }).catch(() => {});
}

export async function lerFafe(redis: Redis, forcar = false): Promise<ResultadoFafe> {
  const chave = process.env.FAFEBUILDS_KEY;
  if (!chave) return { ligado: false, dados: null };
  let cache: { em: string; dados: RespostaFafe } | null = null;
  try { const raw = await redis.get(CHAVE_CACHE); cache = raw ? JSON.parse(raw) : null; } catch (e) {}
  if (cache && !forcar && Date.now() - new Date(cache.em).getTime() < VALIDADE_MS) return { ligado: true, dados: cache.dados, atualizadoEm: cache.em };
  try {
    const base = (process.env.FAFEBUILDS_URL || 'https://fafebuilds.vercel.app').replace(/\/$/, '');
    const r = await fetch(base + '/api/stock-export', { headers: { Authorization: 'Bearer ' + chave }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('FafeBuilds respondeu ' + r.status);
    const dados = (await r.json()) as RespostaFafe;
    const em = new Date().toISOString();
    await redis.set(CHAVE_CACHE, JSON.stringify({ em, dados })).catch(() => {});
    return { ligado: true, dados, atualizadoEm: em };
  } catch (e) {
    const erro = msg(e);
    await avisar(redis, erro).catch(() => {});
    // se houver uma cópia antiga, usa-a (marcada como desatualizada) em vez de deixar a página vazia
    return cache ? { ligado: true, dados: cache.dados, atualizadoEm: cache.em, desatualizado: true, erro } : { ligado: true, dados: null, erro };
  }
}
