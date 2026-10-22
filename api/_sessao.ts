import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Palavra-passe única do site. Vive só na variável de ambiente SENHA da Vercel (o repositório é público).
// Sem SENHA definida o site fica aberto como antes, para nunca ficares trancado fora por engano.
// A sessão é um cookie com uma assinatura derivada da SENHA: mudar a SENHA termina todas as sessões.
const NOME = 'cm_sessao';
const DIAS = 30;

function senha() { return process.env.SENHA || ''; }
export function ativa() { return !!senha(); }

function hash(txt: unknown) { return crypto.createHash('sha256').update(String(txt)).digest(); }
function iguais(a: unknown, b: unknown) { return crypto.timingSafeEqual(hash(a), hash(b)); }

function token() {
  return crypto.createHmac('sha256', senha()).update('custos-mensais-sessao-v1').digest('hex');
}

function cookieDe(req: VercelRequest) {
  const partes = String((req.headers && req.headers.cookie) || '').split(';').map((s) => s.trim());
  const c = partes.find((s) => s.indexOf(NOME + '=') === 0);
  return c ? c.slice(NOME.length + 1) : '';
}

export function senhaCorreta(tentativa: unknown) { return ativa() && typeof tentativa === 'string' && iguais(tentativa, senha()); }
export function temSessao(req: VercelRequest) { return !ativa() || iguais(cookieDe(req), token()); }

// Uso nas funções: if (!exigirSessao(req, res)) return;
export function exigirSessao(req: VercelRequest, res: VercelResponse) {
  if (temSessao(req)) return true;
  res.setHeader('Cache-Control', 'no-store');
  res.status(401).json({ erro: 'Sem sessão. Entra com a palavra-passe.', login: true });
  return false;
}

function cookieSessao(valor: string, maxAge: number) {
  return NOME + '=' + valor + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;
}
export function cookieEntrar() { return cookieSessao(token(), DIAS * 24 * 3600); }
export function cookieSair() { return cookieSessao('', 0); }

