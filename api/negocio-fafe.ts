import type { VercelRequest, VercelResponse } from '@vercel/node';
import { exigirSessao } from './_sessao';
import { msg } from './_util';

// Peças do FafeBuilds (stock e vendidas à parte) para a página do negócio. Só leitura: nada é guardado aqui.
// Variáveis na Vercel: FAFEBUILDS_KEY (a mesma PRECOS_API_KEY do FafeBuilds) e, opcional, FAFEBUILDS_URL.
interface Item { id: string; name: string; cost: number; boughtAt: string | null; sold: boolean; soldPrice: number | null; soldAt: string | null }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!exigirSessao(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ erro: 'Método não permitido' }); return; }
  const chave = process.env.FAFEBUILDS_KEY;
  if (!chave) { res.status(200).json({ ligado: false, compras: [], vendas: [] }); return; }
  try {
    const base = (process.env.FAFEBUILDS_URL || 'https://fafebuilds.vercel.app').replace(/\/$/, '');
    const r = await fetch(base + '/api/stock-export', { headers: { Authorization: 'Bearer ' + chave }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('FafeBuilds respondeu ' + r.status);
    const itens = ((await r.json()) as { items?: Item[] }).items || [];
    const compras = itens.map((i) => ({ id: i.id, nome: i.name, valor: i.cost, data: i.boughtAt || '', vendida: i.sold }));
    const vendas = itens.filter((i) => i.sold && i.soldPrice !== null)
      .map((i) => ({ id: i.id, nome: i.name, valor: i.soldPrice as number, custo: i.cost, data: i.soldAt || i.boughtAt || '' }));
    res.status(200).json({ ligado: true, compras, vendas });
  } catch (e) {
    res.status(200).json({ ligado: true, erro: msg(e), compras: [], vendas: [] });
  }
}
