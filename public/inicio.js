// @ts-check
// Início e navegação (index.html): ecrã inicial com mosaico (tamanho = valor) e um botão por secção.
// Usa a lógica que já existe (mostrarTab, vistaMes, renderTudo).
(function(){
  var TITULOS = { extrato: 'Extrato', grafico: 'Gráfico', investimentos: 'Investimentos', pesquisar: 'Pesquisar', faturas: 'Faturas' };

  // ---------- Mosaico: cada cartão ocupa uma área proporcional ao valor ----------
  // divide a lista em dois grupos de soma parecida, alternando o corte vertical/horizontal
  function dispor(itens, x, y, w, h, saida){
    if(itens.length === 1){ saida.push({ it: itens[0], x: x, y: y, w: w, h: h }); return; }
    var total = itens.reduce(function(s, i){ return s + i.v; }, 0), acum = 0, corte = 1;
    for(var k = 0; k < itens.length - 1; k++){
      acum += itens[k].v; corte = k + 1;
      if(acum >= total / 2) break;
    }
    var a = itens.slice(0, corte), b = itens.slice(corte);
    var fa = a.reduce(function(s, i){ return s + i.v; }, 0) / total;
    if(w >= h){ dispor(a, x, y, w * fa, h, saida); dispor(b, x + w * fa, y, w * (1 - fa), h, saida); }
    else { dispor(a, x, y, w, h * fa, saida); dispor(b, x, y + h * fa, w, h * (1 - fa), saida); }
  }

  function desenharMosaico(){
    var cont = document.getElementById('mosaico');
    if(!cont || typeof vistaMes !== 'function') return;
    var v = vistaMes(pessoaAtual, anoAtual, mesAtual);
    var fixo = somaLista(v.fixo), opc = somaLista(v.opcional), poup = somaLista(v.poupanca), inv = somaLista(v.investido);
    var sobra = (v.salario || 0) - fixo - opc - poup - inv;
    var itens = [
      { nome: 'Fixos', val: fixo, cls: 'm1', ic: 'M3 11l9-8 9 8M5 10v10h14V10' },
      { nome: 'Opcionais', val: opc, cls: 'm2', ic: 'M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0' },
      { nome: 'Poupança', val: poup, cls: 'm3', ic: 'M12 3v18M16 7h-5a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6H7' },
      { nome: 'Investido', val: inv, cls: 'm4', ic: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
      { nome: 'Sobra', val: sobra, cls: 'm5', ic: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 14h2' }
    ].filter(function(i){ return i.val > 0; });
    cont.textContent = '';
    if(!itens.length){
      var vazio = document.createElement('div');
      vazio.className = 'mosaico-vazio';
      vazio.textContent = 'Ainda sem lançamentos neste mês.';
      cont.appendChild(vazio);
      return;
    }
    var soma = itens.reduce(function(s, i){ return s + i.val; }, 0);
    itens.forEach(function(i){ i.v = Math.max(i.val, soma * 0.08); });   // os valores pequenos continuam a ter um cartão tocável
    itens.sort(function(a, b){ return b.v - a.v; });
    var caixas = [];
    dispor(itens, 0, 0, 100, 100, caixas);
    caixas.forEach(function(c){
      var a = document.createElement('a');
      a.href = '#extrato';
      a.className = 'mo ' + c.it.cls;
      a.style.left = 'calc(' + c.x + '% + 3px)'; a.style.top = 'calc(' + c.y + '% + 3px)';
      a.style.width = 'calc(' + c.w + '% - 6px)'; a.style.height = 'calc(' + c.h + '% - 6px)';
      if(c.w * c.h < 1100) a.className += ' peq';   // cartões pequenos: sem ícone
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + c.it.ic + '"/></svg>';   // ícone fixo do código, sem texto do utilizador
      var n = document.createElement('span'); n.textContent = c.it.nome;
      var val = document.createElement('b'); val.textContent = euros(c.it.val);
      a.appendChild(n); a.appendChild(val);
      cont.appendChild(a);
    });
  }

  var renderOriginal = renderTudo;
  renderTudo = function(){ renderOriginal(); desenharMosaico(); };

  // ---------- Início / secções ----------
  function aplicar(){
    var sec = location.hash.replace('#', '');
    var tit = document.getElementById('detalheTitulo');
    if(TITULOS[sec]){
      document.body.classList.remove('home');
      document.body.classList.add('detalhe');
      if(tit) tit.textContent = TITULOS[sec];
      mostrarTab(sec);
    } else {
      document.body.classList.remove('detalhe');
      document.body.classList.add('home');
      desenharMosaico();
    }
    Array.prototype.forEach.call(document.querySelectorAll('.barra a'), function(l){ l.classList.toggle('ativo', l.getAttribute('data-s') === (TITULOS[sec] ? sec : '')); });
    window.scrollTo(0, 0);
  }

  // esconder valores
  var olho = document.getElementById('btnOlho');
  if(olho){
    try{ if(localStorage.getItem('custos-oculto') === '1'){ document.body.classList.add('oculto'); olho.setAttribute('aria-pressed', 'true'); } }catch(e){}
    olho.addEventListener('click', function(){
      var oculto = document.body.classList.toggle('oculto');
      olho.setAttribute('aria-pressed', oculto ? 'true' : 'false');
      try{ localStorage.setItem('custos-oculto', oculto ? '1' : '0'); }catch(e){}
    });
  }

  window.addEventListener('hashchange', aplicar);

  // as secções precisam dos dados carregados: esperar que a app apareça
  var app = document.getElementById('app');
  if(app && app.hidden){
    var obs = new MutationObserver(function(){
      if(!app.hidden){ obs.disconnect(); aplicar(); }
    });
    obs.observe(app, { attributes: true, attributeFilter: ['hidden'] });
  } else {
    aplicar();
  }
})();
