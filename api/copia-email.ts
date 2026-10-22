import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Redis from 'ioredis';
import { getCliente } from './_redis';
import { exigirSessao } from './_sessao';
import { msg } from './_util';

// Envia por email uma cópia completa (mesmo formato da cópia descarregada na página de gestão).
//   GET  -> chamado pelo agendamento da Vercel (exige CRON_SECRET)
//   POST -> botão "Enviar agora" da página de gestão (no máximo uma vez de 10 em 10 minutos)
// Variáveis de ambiente: RESEND_API_KEY, EMAIL_COPIA, CRON_SECRET
const CHAVE = 'custos-mensais-dados';
const CHAVE_VERSAO = 'custos-mensais-versao';
const CHAVE_CARRO = 'custos-mensais-carro';
const INDICE = 'custos-mensais-faturas';
const IMG = 'custos-mensais-fatura-img:';
const CHAVE_ULTIMO_ENVIO = 'custos-mensais-ultimo-envio';
const CHAVE_ULTIMA_COPIA = 'custos-mensais-ultima-copia';
const MAX_ANEXO = 28 * 1024 * 1024; // o limite do email é ~40 MB depois de o anexo ser codificado em base64
async function montarCopia(redis: Redis, comFotos: boolean) {
  const [rawDados, versao, rawCarro, todas] = await Promise.all([
    redis.get(CHAVE), redis.get(CHAVE_VERSAO), redis.get(CHAVE_CARRO), redis.hgetall(INDICE)
  ]);
  const metas = Object.values((todas || {}) as Record<string, string>).map((v) => { try { return JSON.parse(v); } catch (e) { return null; } }).filter(Boolean);
  const faturas: { id: string; meta: { id: string; temImagem?: boolean }; imagem: string | null }[] = [];
  for (const meta of metas) {
    let imagem = null;
    if (comFotos && meta.temImagem) {
      const b64 = await redis.get(IMG + meta.id);
      if (b64) imagem = 'data:image/jpeg;base64,' + b64;
    }
    faturas.push({ id: meta.id, meta, imagem });
  }
  return {
    formato: 'custos-mensais-backup', versaoFormato: 1, exportadoEm: new Date().toISOString(),
    versaoDados: parseInt(versao || '0', 10) || 0,
    dados: rawDados ? JSON.parse(rawDados) : null,
    faturas,
    carro: rawCarro ? JSON.parse(rawCarro) : null
  };
}

async function enviar(redis: Redis) {
  const chave = process.env.RESEND_API_KEY, para = process.env.EMAIL_COPIA;
  if (!chave || !para) throw new Error('Faltam as variáveis RESEND_API_KEY ou EMAIL_COPIA');

  let copia = await montarCopia(redis, true), texto = JSON.stringify(copia), semFotos = false;
  if (Buffer.byteLength(texto) > MAX_ANEXO) {
    copia = await montarCopia(redis, false); texto = JSON.stringify(copia); semFotos = true;
    if (Buffer.byteLength(texto) > MAX_ANEXO) throw new Error('A cópia é demasiado grande para seguir por email');
  }
  const dia = new Date().toISOString().slice(0, 10);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Custos Mensais <onboarding@resend.dev>',
      to: [para],
      subject: 'Cópia de segurança Custos Mensais ' + dia,
      text: 'Segue em anexo a cópia completa do site (dados, faturas e carro).' +
        (semFotos ? '\n\nATENÇÃO: as fotos das faturas não couberam no email e ficaram de fora. Descarrega uma cópia completa na página de gestão.' : '') +
        '\n\nPara repor: página de gestão > Importar uma cópia.',
      attachments: [{ filename: 'custos-mensais-copia-' + dia + '.json', content: Buffer.from(texto).toString('base64') }]
    })
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { const j = (await r.json()) as { message?: string; name?: string }; msg += ' ' + (j.message || j.name || ''); } catch (e) {}
    throw new Error('O serviço de email recusou o envio (' + msg.trim() + ')');
  }
  return { bytes: Buffer.byteLength(texto), semFotos, faturas: copia.faturas.length };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST' && !exigirSessao(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  let redis;
  try {
    redis = getCliente();
    if (req.method === 'GET') {
      const segredo = process.env.CRON_SECRET;
      if (!segredo || (req.headers.authorization || '') !== 'Bearer ' + segredo) { res.status(401).json({ erro: 'Não autorizado' }); return; }
    } else if (req.method === 'POST') {
      const ult = await redis.get(CHAVE_ULTIMO_ENVIO);
      let o = null; try { o = ult ? JSON.parse(ult) : null; } catch (e) {}
      if (o && o.quando && Date.now() - new Date(o.quando).getTime() < 10 * 60 * 1000) {
        res.status(429).json({ erro: 'Já foi enviada uma cópia há menos de 10 minutos' });
        return;
      }
    } else {
      res.status(405).json({ erro: 'Método não permitido' });
      return;
    }
    const quando = new Date().toISOString();
    try {
      const r = await enviar(redis);
      await redis.set(CHAVE_ULTIMO_ENVIO, JSON.stringify(Object.assign({ quando, ok: true }, r)));
      await redis.set(CHAVE_ULTIMA_COPIA, quando);
      res.status(200).json(Object.assign({ ok: true, quando }, r));
    } catch (e) {
      await redis.set(CHAVE_ULTIMO_ENVIO, JSON.stringify({ quando, ok: false, erro: msg(e) })).catch(() => {});
      res.status(500).json({ erro: msg(e) });
    }
  } catch (e) {
    res.status(500).json({ erro: msg(e) });
  }
}
