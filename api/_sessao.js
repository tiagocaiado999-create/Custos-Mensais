const crypto = require('crypto');

// Palavra-passe única do site. Vive só na variável de ambiente SENHA da Vercel (o repositório é público).
// Sem SENHA definida o site fica aberto como antes, para nunca ficares trancado fora por engano.
// A sessão é um cookie com uma assinatura derivada da SENHA: mudar a SENHA termina todas as sessões.
const NOME = 'cm_sessao';
const DIAS = 30;

function senha() { return process.env.SENHA || ''; }
function ativa() { return !!senha(); }

function hash(txt) { return crypto.createHash('sha256').update(String(txt)).digest(); }
function iguais(a, b) { return crypto.timingSafeEqual(hash(a), hash(b)); }

function token() {
  return crypto.createHmac('sha256', senha()).update('custos-mensais-sessao-v1').digest('hex');
}

function cookieDe(req) {
  const partes = String((req.headers && req.headers.cookie) || '').split(';').map((s) => s.trim());
  const c = partes.find((s) => s.indexOf(NOME + '=') === 0);
  return c ? c.slice(NOME.length + 1) : '';
}

function senhaCorreta(tentativa) { return ativa() && typeof tentativa === 'string' && iguais(tentativa, senha()); }
function temSessao(req) { return !ativa() || iguais(cookieDe(req), token()); }

// Uso nas funções: if (!exigirSessao(req, res)) return;
function exigirSessao(req, res) {
  if (temSessao(req)) return true;
  res.setHeader('Cache-Control', 'no-store');
  res.status(401).json({ erro: 'Sem sessão. Entra com a palavra-passe.', login: true });
  return false;
}

function cookieSessao(valor, maxAge) {
  return NOME + '=' + valor + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;
}
function cookieEntrar() { return cookieSessao(token(), DIAS * 24 * 3600); }
function cookieSair() { return cookieSessao('', 0); }

module.exports = { ativa, senhaCorreta, temSessao, exigirSessao, cookieEntrar, cookieSair };
