const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { carregar } = require('./_navegador');

const ctx = carregar(['nucleo.js', 'qr.js']);
const ler = (t) => { ctx.__t = t; const r = vm.runInContext('lerQrAT(__t)', ctx); return r && JSON.parse(JSON.stringify(r)); };

test('lerQrAT: QR de fatura portuguesa válido', () => {
  const r = ler('A:509999999*B:999999990*C:PT*D:FT*E:N*F:20261021*G:FT 2026/123*H:ABCD1234-123*I1:PT*N:1.50*O:12,34*Q:AbCd*R:1234');
  assert.deepEqual(r, { nif: '509999999', total: 12.34, data: '2026-10-21', doc: 'FT 2026/123', atcud: 'ABCD1234-123' });
});

test('lerQrAT: total com ponto decimal', () => {
  assert.equal(ler('A:123456789*F:20260101*O:5.5').total, 5.5);
});

test('lerQrAT: sem NIF, sem total, total zero ou data inválida devolve null', () => {
  assert.equal(ler('F:20261021*O:10'), null);
  assert.equal(ler('A:123456789*F:20261021'), null);
  assert.equal(ler('A:123456789*F:20261021*O:0'), null);
  assert.equal(ler('A:123456789*F:2026*O:10'), null);
});

test('lerQrAT: texto que não é de fatura não rebenta', () => {
  assert.equal(ler('https://exemplo.pt/qualquer-coisa'), null);
  assert.equal(ler(''), null);
  assert.equal(ler(null), null);
  assert.equal(ler(undefined), null);
});
