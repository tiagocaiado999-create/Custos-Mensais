import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCliente } from './_redis';
import { exigirSessao } from './_sessao';
import { lerFafe } from './_fafe';
import { msg } from './_util';

// Peças e PCs do FafeBuilds para a página do negócio. Só leitura: o que se guarda aqui é só uma cópia de 5 minutos.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!exigirSessao(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ erro: 'Método não permitido' }); return; }
  try {
    const f = await lerFafe(getCliente());
    const it = f.dados ? f.dados.items : [];
    res.status(200).json({
      ligado: f.ligado, erro: f.erro, desatualizado: f.desatualizado, atualizadoEm: f.atualizadoEm,
      compras: it.map((i) => ({ id: i.id, nome: i.name, valor: i.cost, data: i.boughtAt || '', vendida: i.sold, previsto: i.sell, parada: i.stale, dias: i.days })),
      vendas: it.filter((i) => i.sold && i.soldPrice !== null)
        .map((i) => ({ id: i.id, nome: i.name, valor: i.soldPrice as number, custo: i.cost, data: i.soldAt || i.boughtAt || '' })),
      pcs: f.dados ? f.dados.pcs.map((p) => ({ id: p.id, nome: p.title, valor: p.price, custo: p.cost, data: p.soldAt })) : [],
      stock: f.dados ? f.dados.stock : null
    });
  } catch (e) {
    res.status(500).json({ erro: msg(e) });
  }
}
