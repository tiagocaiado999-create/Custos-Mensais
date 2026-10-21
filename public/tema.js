// Tema claro/escuro. A escolha fica guardada neste dispositivo (computador ou telemóvel, também na app instalada)
// e só muda quando carregares outra vez no botão. Sem escolha, segue o tema do sistema.
// Carregado no <head> de todas as páginas, para o tema ser aplicado antes de a página aparecer (sem piscar).
(function(){
  var CHAVE = 'custos-tema';
  var raiz = document.documentElement;
  function ler(){ try{ var v = localStorage.getItem(CHAVE); return (v === 'dark' || v === 'light') ? v : null; }catch(e){ return null; } }
  function escuro(){
    var t = ler();
    if(t) return t === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function aplicar(){
    var t = ler();
    if(t) raiz.setAttribute('data-theme', t); else raiz.removeAttribute('data-theme');
    var m = document.querySelector('meta[name="theme-color"]');
    if(m) m.setAttribute('content', escuro() ? '#1c1a17' : '#b5572e');
  }
  var LUA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var SOL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  function botoes(){
    var e = escuro();
    Array.prototype.forEach.call(document.querySelectorAll('.btn-tema'), function(b){
      b.innerHTML = e ? SOL : LUA;
      b.setAttribute('aria-label', e ? 'Mudar para o modo claro' : 'Mudar para o modo escuro');
      b.title = e ? 'Modo claro' : 'Modo escuro';
    });
  }
  function alternar(){
    try{ localStorage.setItem(CHAVE, escuro() ? 'light' : 'dark'); }catch(e){}
    aplicar(); botoes();
    document.dispatchEvent(new CustomEvent('tema-mudou'));
  }

  aplicar();
  document.addEventListener('DOMContentLoaded', function(){
    botoes();
    Array.prototype.forEach.call(document.querySelectorAll('.btn-tema'), function(b){ b.addEventListener('click', alternar); });
  });
  // outra janela ou separador mudou o tema
  window.addEventListener('storage', function(e){ if(e.key === CHAVE){ aplicar(); botoes(); document.dispatchEvent(new CustomEvent('tema-mudou')); } });
})();
