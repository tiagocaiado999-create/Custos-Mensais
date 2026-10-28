import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCliente } from './_redis';
import { exigirSessao } from './_sessao';
import { msg, um } from './_util';

// Cópias de segurança criadas pelo data.js:
//   custos-mensais-dados-backup-original   (estado antes das atualizações, nunca expira)
//   custos-mensais-dados-backup:AAAA-MM-DDTHH   (uma por hora com gravações, 60 dias)
// Ao restaurar, é criada primeiro uma cópia do estado atual: custos-mensais-dados-backup-antes:<data>
const CHAVE = 'custos-mensais-dados';
const CHAVE_VERSAO = 'custos-mensais-versao';
const PREFIXO = CHAVE + '-backup';
const CHAVE_ULTIMA_COPIA = 'custos-mensais-ultima-copia';
const ID_OK = /^(-original|:\d{4}-\d{2}-\d{2}T\d{2}|-antes:\d{4}-\d{2}-\d{2}T[0-9:.]+Z)$/;
// Substitui os dados e sobe a versão (os outros aparelhos recebem a versão restaurada)
const SCRIPT_RESTAURAR = `
local v = tonumber(redis.call('GET', KEYS[2]) or '0') + 1
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], tostring(v))
return v
`;

type Lista = { valor?: number }[] | undefined;
type Doc = Record<string, any> | null | undefined;

function resumir(d: Doc) {
  d = d || {};
  const r = { meses: 0, lancamentos: 0, gastos: 0, poupancas: 0, poupado: 0, investimentos: 0 };
  const meses = new Set<string>();
  const somar = (lista: Lista, chave?: string) => (lista || []).forEach((i) => {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!exigirSessao(req, res)) return;
  try {
    const redis = getCliente();
    res.setHeader('Cache-Control', 'no-store');
    const q = req.query || {};
    const id = um(q.id);

    if (req.method === 'GET' && !id) {
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
      if (!ID_OK.test(id)) { res.status(400).json({ erro: 'Id inválido' }); return; }
      const raw = await redis.get(PREFIXO + id);
      if (!raw) { res.status(404).json({ erro: 'Cópia não encontrada' }); return; }
      const atual = await redis.get(CHAVE);
      res.status(200).json({ id, copia: resumir(JSON.parse(raw)), atual: resumir(atual ? JSON.parse(atual) : {}) });
      return;
    }

    if (req.method === 'POST') {
      const corpo = req.body || {};
      if (corpo.copiaDescarregada === true) {
        // regista que foi descarregada uma cópia completa (a página de gestão mostra a data e avisa quando passa muito tempo)
        const quando = new Date().toISOString();
        await redis.set(CHAVE_ULTIMA_COPIA, quando);
        res.status(200).json({ ok: true, quando });
        return;
      }
      if (corpo.importar === true && corpo.confirmar === true) {
        // importar uma cópia completa (feita na página de gestão): substitui os dados, guardando antes o estado atual
        const d = corpo.dados;
        if (!d || typeof d !== 'object' || typeof d.tiago !== 'object' || typeof d.claudia !== 'object') {
          res.status(400).json({ erro: 'Ficheiro de cópia inválido' });
          return;
        }
        const atualImp = await redis.get(CHAVE);
        if (atualImp) await redis.set(PREFIXO + '-antes:' + new Date().toISOString(), atualImp, 'EX', 60 * 60 * 24 * 60);
        const versaoImp = (await redis.eval(SCRIPT_RESTAURAR, 2, CHAVE, CHAVE_VERSAO, JSON.stringify(d))) as number;
        res.status(200).json({ ok: true, versao: Number(versaoImp) });
        return;
      }
      if (!ID_OK.test(corpo.id || '') || corpo.confirmar !== true) { res.status(400).json({ erro: 'Pedido inválido' }); return; }
      const raw = await redis.get(PREFIXO + corpo.id);
      if (!raw) { res.status(404).json({ erro: 'Cópia não encontrada' }); return; }
      const atual = await redis.get(CHAVE);
      if (atual) await redis.set(PREFIXO + '-antes:' + new Date().toISOString(), atual, 'EX', 60 * 60 * 24 * 60);
      const versao = (await redis.eval(SCRIPT_RESTAURAR, 2, CHAVE, CHAVE_VERSAO, raw)) as number;
      res.status(200).json({ ok: true, versao: Number(versao) });
      return;
    }

    res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    res.status(500).json({ erro: msg(e) });
  }
}
