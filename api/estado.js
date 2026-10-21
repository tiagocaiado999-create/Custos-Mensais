const Redis = require('ioredis');

// Estado do armazenamento (usado pela página de gestão). Só lê; não altera nada.
const CHAVE = 'custos-mensais-dados';
let cliente;

function getCliente() {
  if (!cliente) {
    const url = process.env.CustoMensal_REDIS_URL || process.env.REDIS_URL;
    if (!url) throw new Error('Variável de ligação ao Redis não encontrada');
    cliente = new Redis(url);
  }
  return cliente;
}

async function somarBytes(redis, chaves) {
  let total = 0;
  for (let i = 0; i < chaves.length; i += 50) {
    const lote = await Promise.all(chaves.slice(i, i + 50).map((k) => redis.strlen(k).catch(() => 0)));
    total += lote.reduce((a, b) => a + (Number(b) || 0), 0);
  }
  return total;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') { res.status(405).json({ erro: 'Método não permitido' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    const redis = getCliente();

    const info = {};
    try {
      const txt = await redis.info();
      String(txt).split(/\r?\n/).forEach((l) => {
        const i = l.indexOf(':');
        if (i > 0 && l[0] !== '#') info[l.slice(0, i)] = l.slice(i + 1);
      });
    } catch (e) { /* alguns serviços limitam o INFO */ }
    let chavesTotal = null;
    try { chavesTotal = await redis.dbsize(); } catch (e) {}

    const nossas = await redis.keys('custos-mensais*');
    const imgs = nossas.filter((k) => k.startsWith('custos-mensais-fatura-img:'));
    const backups = nossas.filter((k) => k.startsWith(CHAVE + '-backup'));
    const [dadosBytes, imagensBytes, backupsBytes, versao, nFaturas, ultimaCopia] = await Promise.all([
      redis.strlen(CHAVE).catch(() => 0),
      somarBytes(redis, imgs),
      somarBytes(redis, backups),
      redis.get('custos-mensais-versao'),
      redis.hlen('custos-mensais-faturas').catch(() => 0),
      redis.get('custos-mensais-ultima-copia').catch(() => null)
    ]);
    const num = (v) => (v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));

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
        dadosBytes: Number(dadosBytes) || 0,
        faturas: Number(nFaturas) || 0,
        imagens: imgs.length,
        imagensBytes: imagensBytes,
        backups: backups.length,
        backupsBytes: backupsBytes
      }
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
};
