// @ts-check
// Início e navegação (index.html): ecrã inicial com mosaico (tamanho = valor) e um botão por secção.
// Usa a lógica que já existe (mostrarTab, vistaMes, renderTudo).
(function(){
  var TITULOS = { poupanca: 'Poupança', extrato: 'Extrato', grafico: 'Gráfico', investimentos: 'Investimentos', pesquisar: 'Pesquisar', faturas: 'Faturas' };

  // ---------- Mosaico: sempre os 5 cartões (mesmo a 0 €); a área segue o valor, com um mínimo para o texto caber ----------
  // Duas filas: os 2 maiores em cima e os outros 3 em baixo. Cada cartão tem uma largura mínima; o resto reparte-se pelo valor.
  function larguras(itens, minimo){
    var soma = itens.reduce(function(s, i){ return s + i.v; }, 0);
    var resto = 1 - itens.length * minimo;
    return itens.map(function(i){ return minimo + resto * (soma > 0 ? i.v / soma : 1 / itens.length); });
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
      { nome: 'Poupança', val: poup, cls: 'm3', href: '#poupanca', ic: 'M12 3v18M16 7h-5a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6H7' },
      { nome: 'Investido', val: inv, cls: 'm4', ic: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
      { nome: 'Sobra', val: sobra, cls: 'm5', ic: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 14h2' }
    ];
    itens.forEach(function(i, k){ i.ordem = k; i.v = Math.max(i.val, 0); });   // a Sobra negativa tem o tamanho mínimo, mas mostra o valor
    var porValor = itens.slice().sort(function(a, b){ return b.v - a.v || a.ordem - b.ordem; });
    var cima = porValor.slice(0, 2), baixo = porValor.slice(2);
    var somaCima = cima.reduce(function(s, i){ return s + i.v; }, 0), total = itens.reduce(function(s, i){ return s + i.v; }, 0);
    var hCima = total > 0 ? Math.min(0.62, Math.max(0.38, somaCima / total)) : 0.5;
    var caixas = [];
    [[cima, 0, hCima, 0.3], [baixo, hCima, 1 - hCima, 0.26]].forEach(function(fila){
      var x = 0;
      larguras(fila[0], fila[3]).forEach(function(w, k){
        caixas.push({ it: fila[0][k], x: x * 100, y: fila[1] * 100, w: w * 100, h: fila[2] * 100 });
        x += w;
      });
    });
    cont.textContent = '';
    caixas.forEach(function(c){
      var a = document.createElement('a');
      a.href = c.it.href || '#extrato';   // Poupança abre a secção própria (acumulado e gráfico)
      a.className = 'mo ' + c.it.cls;
      a.style.left = 'calc(' + c.x + '% + 3px)'; a.style.top = 'calc(' + c.y + '% + 3px)';
      a.style.width = 'calc(' + c.w + '% - 6px)'; a.style.height = 'calc(' + c.h + '% - 6px)';
      if(c.w * c.h < 800) a.className += ' peq';   // cartões pequenos: sem ícone
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + c.it.ic + '"/></svg>';   // ícone fixo do código, sem texto do utilizador
      var n = document.createElement('span'); n.textContent = c.it.nome;
      var val = document.createElement('b'); val.textContent = euros(c.it.val);
      a.appendChild(n); a.appendChild(val);
      cont.appendChild(a);
    });
  }

  // ---------- Recentes: os 10 últimos gastos do mês (por data) ----------
  function desenharRecentes(){
    var cont = document.getElementById('recentesLista');
    if(!cont || typeof vistaMes !== 'function') return;
    var v = vistaMes(pessoaAtual, anoAtual, mesAtual);
    var lista = v.fixo.concat(v.opcional).map(function(i, k){ i.ordem = k; return i; })
      .sort(function(a, b){ return (b.data || '').localeCompare(a.data || '') || b.ordem - a.ordem; }).slice(0, 10);
    cont.textContent = '';
    if(!lista.length){ var vazio = document.createElement('div'); vazio.className = 'rec-vazio'; vazio.textContent = 'Ainda sem gastos neste mês.'; cont.appendChild(vazio); return; }
    var hoje = hojeISO();
    var ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    var ontemISO = ontem.getFullYear() + '-' + String(ontem.getMonth() + 1).padStart(2, '0') + '-' + String(ontem.getDate()).padStart(2, '0');
    lista.forEach(function(i){
      var linha = document.createElement('a');
      linha.href = '#extrato'; linha.className = 'rec';
      var quando = i.data === hoje ? 'Hoje' : i.data === ontemISO ? 'Ontem' : formatarData(i.data);
      var ic = document.createElement('div'); ic.className = 'rec-ic'; ic.innerHTML = iconeCategoria(i.categoria || 'outros');   // SVG fixo do código
      var txt = document.createElement('div'); txt.className = 'rec-txt';
      var n = document.createElement('b'); n.textContent = i.nome || nomeCategoria(i.categoria);
      var s = document.createElement('span'); s.textContent = (quando ? quando + ' · ' : '') + nomeCategoria(i.categoria);
      txt.appendChild(n); txt.appendChild(s);
      var val = document.createElement('div'); val.className = 'rec-val'; val.textContent = '−' + euros(i.valor);
      linha.appendChild(ic); linha.appendChild(txt); linha.appendChild(val);
      cont.appendChild(linha);
    });
  }

  // ---------- Secção Poupança (#poupanca): acumulado até ao mês escolhido, gráfico de 12 meses e lista por mês ----------
  // Lê os dados diretamente (sem mesPessoa/vistaMes) para não criar meses vazios só por olhar.
  // Casal = Tiago + Cláudia + conjunto, como em vistaMes.
  function somaCampoMes(campo, k){
    var fontes = pessoaAtual === 'casal' ? [dados.tiago[k], dados.claudia[k], dados.casalOpcional[k]] : [dados[pessoaAtual] && dados[pessoaAtual][k]];
    return fontes.reduce(function(s, m){ return s + (m && m[campo] ? somaLista(m[campo]) : 0); }, 0);
  }
  function acumuladoAteMes(campo, ano, mes){
    var limite = chave(ano, mes), chaves = {}, total = 0;
    ['tiago','claudia','casalOpcional'].forEach(function(p){ Object.keys(dados[p] || {}).forEach(function(k){ chaves[k] = 1; }); });
    Object.keys(chaves).forEach(function(k){ if(k <= limite) total += somaCampoMes(campo, k); });
    return total;
  }
  var irParaPoupanca = false;
  function desenharPoupanca(){
    var cont = document.getElementById('peMeia');
    if(!cont) return;
    var total = acumuladoAteMes('poupanca', anoAtual, mesAtual);
    var esteMes = somaCampoMes('poupanca', chave(anoAtual, mesAtual));
    var investido = acumuladoAteMes('investido', anoAtual, mesAtual);
    var ini = anoAtual * 12 + mesAtual - 12;   // mês antes do primeiro ponto: dá o que entrou no primeiro mês
    var anterior = acumuladoAteMes('poupanca', Math.floor(ini / 12), ini % 12);
    var pontos = [], soma = anterior;
    for(var k = 11; k >= 0; k--){
      var idx = anoAtual * 12 + mesAtual - k, a = Math.floor(idx / 12), m = idx % 12;
      var entrou = somaCampoMes('poupanca', chave(a, m));
      soma += entrou;
      pontos.push({ a: a, m: m, v: soma, entrou: entrou });
    }
    var maximo = pontos.reduce(function(s, p){ return Math.max(s, p.v); }, 0);
    var nomeMes = function(p){ return meses[p.m].charAt(0).toUpperCase() + meses[p.m].slice(1) + ' ' + p.a; };
    var sinal = function(v){ return (v > 0 ? '+' : '') + euros(v); };
    cont.textContent = '';
    var topo = document.createElement('div'); topo.className = 'pm-topo';
    topo.textContent = 'Acumulado até ' + meses[mesAtual] + ' ' + anoAtual;
    var val = document.createElement('b'); val.className = 'pm-total'; val.textContent = euros(total);
    var sub = document.createElement('div'); sub.className = 'pm-sub';
    if(total <= 0 && esteMes <= 0){
      sub.textContent = 'Ainda sem poupança. Usa "+ Pôr na poupança" para registar a primeira transferência.';
    } else {
      var mais = document.createElement('span'); mais.className = 'pm-mes' + (esteMes > 0 ? ' sobe' : '');
      mais.textContent = sinal(esteMes) + ' em ' + meses[mesAtual];
      sub.appendChild(mais);
      if(investido > 0){ var inv = document.createElement('span'); inv.textContent = 'Investido: ' + euros(investido); sub.appendChild(inv); }
    }
    cont.appendChild(topo); cont.appendChild(val); cont.appendChild(sub);
    if(maximo > 0){
      var graf = document.createElement('div'); graf.className = 'pm-graf';
      // passar o rato (ou tocar) numa barra: fica a azul forte e mostra o que foi poupado nesse mês
      pontos.forEach(function(p, i){
        var col = document.createElement('div');
        col.className = 'pm-col' + (i === pontos.length - 1 ? ' atual' : '') + (i < 2 ? ' esq' : i > pontos.length - 3 ? ' dir' : '');
        col.tabIndex = 0;
        col.setAttribute('aria-label', nomeMes(p) + ': ' + sinal(p.entrou) + ', total ' + euros(p.v));
        var barra = document.createElement('i'); barra.style.height = Math.max(p.v > 0 ? 4 : 0, Math.round(p.v / maximo * 100)) + '%';
        var dica = document.createElement('span'); dica.className = 'pm-dica'; dica.setAttribute('aria-hidden', 'true');
        var dMes = document.createElement('small'); dMes.textContent = nomeMes(p);
        var dVal = document.createElement('b'); dVal.textContent = sinal(p.entrou);
        var dTot = document.createElement('small'); dTot.textContent = 'total ' + euros(p.v);
        dica.appendChild(dMes); dica.appendChild(dVal); dica.appendChild(dTot);
        barra.appendChild(dica);
        var letra = document.createElement('small'); letra.textContent = mesesAbrev[p.m].charAt(0);
        col.appendChild(barra); col.appendChild(letra);
        graf.appendChild(col);
      });
      cont.appendChild(graf);
    }
    // lista por mês (mais recente primeiro): quanto entrou e o acumulado nesse mês
    var lista = document.getElementById('pmMeses');
    if(!lista) return;
    lista.textContent = '';
    var linhas = pontos.filter(function(p){ return p.entrou !== 0; }).reverse();
    if(!linhas.length){ var vazio = document.createElement('div'); vazio.className = 'rec-vazio'; vazio.textContent = 'Sem transferências nos últimos 12 meses.'; lista.appendChild(vazio); return; }
    linhas.forEach(function(p){
      var linha = document.createElement('div'); linha.className = 'pm-linha';
      var n = document.createElement('b'); n.textContent = nomeMes(p);
      var acum = document.createElement('span'); acum.textContent = 'total ' + euros(p.v);
      var v = document.createElement('em'); v.textContent = sinal(p.entrou);
      linha.appendChild(n); linha.appendChild(acum); linha.appendChild(v);
      lista.appendChild(linha);
    });
  }
  var pmVer = document.getElementById('pmVerExtrato');
  if(pmVer) pmVer.addEventListener('click', function(){ irParaPoupanca = true; });
  var bPoup = document.getElementById('btnNovaPoupanca');
  if(bPoup) bPoup.addEventListener('click', function(){ qaAbrir(); qaNatureza('poupanca'); });

  var bDesp = document.getElementById('btnNovaDespesa'), bRec = document.getElementById('btnNovaReceita');
  if(bDesp) bDesp.addEventListener('click', function(){ qaAbrir(); });
  if(bRec) bRec.addEventListener('click', function(){ qaAbrir(); qaNatureza('receita'); });

  var renderOriginal = renderTudo;
  renderTudo = function(){ renderOriginal(); desenharMosaico(); desenharRecentes(); if(location.hash === '#poupanca') desenharPoupanca(); };

  // ---------- Início / secções ----------
  function aplicar(){
    var sec = location.hash.replace('#', '');
    var tit = document.getElementById('detalheTitulo');
    if(TITULOS[sec]){
      document.body.classList.remove('home');
      document.body.classList.add('detalhe');
      if(tit) tit.textContent = TITULOS[sec];
      mostrarTab(sec);
      if(sec === 'poupanca') desenharPoupanca();
    } else {
      document.body.classList.remove('detalhe');
      document.body.classList.add('home');
      desenharMosaico(); desenharRecentes();
    }
    Array.prototype.forEach.call(document.querySelectorAll('.barra a'), function(l){ l.classList.toggle('ativo', l.getAttribute('data-s') === (TITULOS[sec] ? sec : '')); });
    window.scrollTo(0, 0);
    if(irParaPoupanca && sec === 'extrato'){   // veio de "Ver no extrato": ir direto à lista da poupança
      var alvo = document.getElementById('secaoPoupanca');
      if(alvo) alvo.scrollIntoView({ block: 'start' });
    }
    irParaPoupanca = false;
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
