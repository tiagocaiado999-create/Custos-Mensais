import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Redis from 'ioredis';
import { getCliente } from './_redis';
import { exigirSessao } from './_sessao';
import { msg } from './_util';

// Estado do armazenamento (usado pela página de gestão). Só lê; não altera nada.
const CHAVE = 'custos-mensais-dados';
async function somarBytes(redis: Redis, chaves: string[]) {
  let total = 0;
  for (let i = 0; i < chaves.length; i += 50) {
    const lote = await Promise.all(chaves.slice(i, i + 50).map((k: string) => redis.strlen(k).catch(() => 0)));
    total += lote.reduce((a, b) => a + (Number(b) || 0), 0);
  }
  return total;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!exigirSessao(req, res)) return;
  try {
    if (req.method !== 'GET') { res.status(405).json({ erro: 'Método não permitido' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    const redis = getCliente();

    const info: Record<string, string> = {};
    try {
      const txt = await redis.info();
      String(txt).split(/\r?\n/).forEach((l) => {
        const i = l.indexOf(':');
        if (i > 0 && l[0] !== '#') info[l.slice(0, i)] = l.slice(i + 1);
      });
    } catch (e) { /* alguns serviços limitam o INFO */ }
    let chavesTotal: number | null = null;
    try { chavesTotal = await redis.dbsize(); } catch (e) {}

    const nossas = await redis.keys('custos-mensais*');
    const imgs = nossas.filter((k) => k.startsWith('custos-mensais-fatura-img:'));
    const backups = nossas.filter((k) => k.startsWith(CHAVE + '-backup'));
    const [dadosBytes, imagensBytes, backupsBytes, versao, nFaturas, ultimaCopia, ultimoEnvio] = await Promise.all([
      redis.strlen(CHAVE).catch(() => 0),
      somarBytes(redis, imgs),
      somarBytes(redis, backups),
      redis.get('custos-mensais-versao'),
      redis.hlen('custos-mensais-faturas').catch(() => 0),
      redis.get('custos-mensais-ultima-copia').catch(() => null),
      redis.get('custos-mensais-ultimo-envio').catch(() => null)
    ]);
    let envio: unknown = null;
    try { envio = ultimoEnvio ? JSON.parse(ultimoEnvio) : null; } catch (e) {}
    const num = (v: string | undefined) => (v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));

    res.status(200).json({
      redis: {
        versao: info.redis_version || null,
        memoriaUsada: num(info.used_memory),
        memoriaMax: num(info.maxmemory),
        chavesTotal: chavesTotal,
        comandosTotal: num(info.total_commands_processed),
        uptimeSeg: num(info.uptime_in_seconds),
        opsPorSeg: num(info.instantaneous_ops_per_sec)
      },
      app: {
        versaoDados: parseInt(versao || '0', 10) || 0,
        ultimaCopia: ultimaCopia || null,
        ultimoEnvio: envio,
        dadosBytes: Number(dadosBytes) || 0,
        faturas: Number(nFaturas) || 0,
        imagens: imgs.length,
        imagensBytes: imagensBytes,
        backups: backups.length,
        backupsBytes: backupsBytes
      }
    });
  } catch (e) {
    res.status(500).json({ erro: msg(e) });
  }
}
