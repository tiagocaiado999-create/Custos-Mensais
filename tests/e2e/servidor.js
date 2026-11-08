// Servidor local só para os testes do browser (Playwright): serve public/ e simula a API em memória (login só com palavra-passe).
// Não toca em Redis nem em dados reais. Porta 5066 (ou PORTA_E2E).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(process.env.RAIZ_E2E || path.join(__dirname, '..', '..', 'public'));
const PORTA = Number(process.env.PORTA_E2E) || 5066;
const LIMITE_DADOS = 1024 * 1024; // igual ao servidor verdadeiro: dados de uma conta <= 1 MB
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/json', '.json': 'application/json' };

function dadosIniciais() {
  const d = new Date();
  const mes = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const dia = mes + '-05';
  const it = (n, v, c) => ({ id: 'i' + n, nome: n, valor: v, categoria: c, data: dia });
  const vazio = () => ({ ativos: [], retirados: [] });
  return {
    tiago: { [mes]: { salario: 1800, extras: [], fixo: [it('Renda', 600, 'outros')], opcional: [it('Supermercado', 210, 'comida')], poupanca: [], investido: [] } },
    claudia: { [mes]: { salario: 1500, extras: [], fixo: [it('Telemovel', 25, 'outros')], opcional: [it('Roupa', 90, 'compras')], poupanca: [], investido: [] } }, casalOpcional: {}, lojas: {}, investimentos: { tiago: vazio(), claudia: vazio(), casal: vazio() }
  };
}

let estado;
function reiniciar(logado) {
  estado = { logado: logado, versao: 1, dados: dadosIniciais(), logins: [], gravacoes: 0, recusadas: 0 };
}
reiniciar(true);

function json(res, codigo, corpo) {
  res.statusCode = codigo;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(corpo));
}
function lerCorpo(req) {
  return new Promise((resolve) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => resolve(Buffer.concat(partes)));
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const caminho = url.pathname;

  if (caminho === '/__reset') { reiniciar(url.searchParams.get('logado') !== '0'); return json(res, 200, { ok: true }); }
  if (caminho === '/__estado') return json(res, 200, estado);

  if (caminho === '/api/login') {
    if (req.method === 'POST') {
      const bruto = await lerCorpo(req);
      let corpo = {};
      try { corpo = JSON.parse(bruto.toString('utf8')); } catch (e) { return json(res, 400, { erro: 'Pedido inválido.' }); }
      estado.logins.push({ tamanho: bruto.length });
      if (String(corpo.senha).startsWith('lenta')) await new Promise((r) => setTimeout(r, 400)); // resposta demorada: dá tempo a um segundo envio
      if (corpo.senha === 'palavrapasse1') { estado.logado = true; return json(res, 200, { ok: true }); }
      return json(res, 401, { erro: 'Palavra-passe errada' });
    }
    if (req.method === 'DELETE') { estado.logado = false; return json(res, 200, { ok: true }); }
    return json(res, 200, estado.logado ? { ativa: true, autenticado: true } : { ativa: true, autenticado: false });
  }

  if (caminho === '/api/data') {
    if (!estado.logado) return json(res, 401, { erro: 'Sem sessão.' });
    if (req.method === 'POST') {
      const bruto = await lerCorpo(req);
      if (bruto.length > LIMITE_DADOS) { estado.recusadas++; return json(res, 413, { erro: 'Dados demasiado grandes.' }); }
      try {
        const corpo = JSON.parse(bruto.toString('utf8'));
        estado.dados = corpo.dados;
        estado.versao++;
        estado.gravacoes++;
        return json(res, 200, { versao: estado.versao });
      } catch (e) { return json(res, 400, { erro: 'Pedido inválido.' }); }
    }
    if (url.searchParams.get('desde') === String(estado.versao)) return json(res, 200, { semAlteracoes: true, versao: estado.versao });
    return json(res, 200, { dados: estado.dados, versao: estado.versao });
  }
  if (caminho.startsWith('/api/')) return json(res, 200, {});

  let rel = caminho === '/' ? '/index.html' : caminho;
  const ficheiro = path.normalize(path.join(RAIZ, rel));
  if (!ficheiro.startsWith(RAIZ)) { res.statusCode = 403; return res.end(); }
  fs.readFile(ficheiro, (e, b) => {
    if (e) { res.statusCode = 404; return res.end('não encontrado'); }
    res.setHeader('content-type', TIPOS[path.extname(ficheiro)] || 'application/octet-stream');
    res.end(b);
  });
}).listen(PORTA, () => console.log('servidor de testes em http://localhost:' + PORTA));
