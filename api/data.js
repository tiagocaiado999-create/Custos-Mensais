const { kv } = require('@vercel/kv');
 
const CHAVE = 'custos-mensais-dados';
 
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const dados = await kv.get(CHAVE);
    res.status(200).json(dados || null);
    return;
  }
 
  if (req.method === 'POST') {
    await kv.set(CHAVE, req.body);
    res.status(200).json({ ok: true });
    return;
  }
 
  res.status(405).json({ erro: 'Método não permitido' });
};
