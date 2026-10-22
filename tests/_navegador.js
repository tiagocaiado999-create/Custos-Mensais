// Carrega os scripts de public/js/ (scripts clássicos, âmbito global) num contexto isolado, sem navegador.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// elemento de mentira: aceita qualquer propriedade e qualquer chamada
function falso() {
  const f = function () { return falso(); };
  return new Proxy(f, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : falso()),
    set: () => true,
    apply: () => falso()
  });
}

function carregar(ficheiros, extra) {
  const memoria = {};
  const ctx = {
    console, Date, Math, JSON, Intl, Promise, Object, Array, String, Number, parseFloat, parseInt, isNaN,
    document: falso(), window: falso(), navigator: {}, byId: () => falso(), fetch: () => Promise.reject(new Error('sem rede nos testes')),
    localStorage: {
      getItem: (k) => (k in memoria ? memoria[k] : null),
      setItem: (k, v) => { memoria[k] = String(v); },
      removeItem: (k) => { delete memoria[k]; }
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}
  };
  Object.assign(ctx, extra || {});
  vm.createContext(ctx);
  ficheiros.forEach((f) => {
    const codigo = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
    vm.runInContext(codigo, ctx, { filename: f });
  });
  return ctx;
}

module.exports = { carregar };
