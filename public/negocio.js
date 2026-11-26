(function(){
  var $ = function(id){ return document.getElementById(id); };
  var eur = new Intl.NumberFormat('pt-PT', { style:'currency', currency:'EUR' });
  var r2 = function(x){ return Math.round((x || 0) * 100) / 100; };
  var euros = function(n){ return eur.format(r2(n)); };
  var MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  var versao = 0, d = padrao(), guardarTimer = null, aGuardar = false, sujo = false;
  var auto = { compras:[], vendas:[], pcs:[], stock:null };      // vêm do FafeBuilds (só leitura, não ficam guardadas aqui)
  var dadosMain = null;                       // dados principais (só leitura), para o saldo do mês
  var hoje = new Date(), ano = hoje.getFullYear(), mes = hoje.getMonth();

  function padrao(){ return { compras:[], vendas:[], dac7:{} }; }
  function pad(n){ return String(n).padStart(2, '0'); }
  function hojeISO(){ return hoje.getFullYear() + '-' + pad(hoje.getMonth() + 1) + '-' + pad(hoje.getDate()); }
  function chaveMes(){ return ano + '-' + pad(mes + 1); }
  function fmtData(iso){ var p = (iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—'; }
  function doMes(l){ var k = chaveMes(); return l.filter(function(x){ return (x.data || '').slice(0, 7) === k; }); }
  function soma(l, f){ return r2(l.reduce(function(a, x){ return a + (Number(f(x)) || 0); }, 0)); }
  function novoId(){ return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  // Saldo do mês do Tiago, calculado como na página principal: salário − (fixos + opcionais + poupança + investido)
  function saldoBase(){
    var m = dadosMain && dadosMain.tiago && dadosMain.tiago[chaveMes()];
    if(!m) return 0;
    var s = function(l){ return soma(l || [], function(i){ return i.valor; }); };
    return r2((Number(m.salario) || 0) - (s(m.fixo) + s(m.opcional) + s(m.poupanca) + s(m.investido)));
  }

  function linha(x, tipo){
    var el = document.createElement('div'); el.className = 'reg';
    var dd = document.createElement('div'); dd.className = 'd';
    var nome = document.createElement('div'); nome.textContent = x.nome || '(sem nome)';
    var m = document.createElement('div'); m.className = 'm';
    m.textContent = fmtData(x.data) + (tipo === 'pcs' ? ' · vendido por ' + euros(x.valor) + ' · custo ' + euros(x.custo) + (x.extras ? ' (inclui ' + euros(x.extras) + ' de custos adicionais)' : '') : tipo === 'vendas' ? ' · paguei ' + euros(x.custo) + ' · lucro ' + euros(x.valor - (x.custo || 0)) : (x.vendaId || x.vendida ? ' · vendida' : (x.parada ? ' · parada há ' + x.dias + ' dias' : ''))) + (x.auto ? ' · FafeBuilds' : '');
    dd.appendChild(nome); dd.appendChild(m);
    var v = document.createElement('div'); v.className = 'v ' + (tipo === 'compras' ? 'verm' : 'verde');
    v.textContent = tipo === 'pcs' ? (x.valor - (x.custo || 0) < 0 ? '−' : '+') + euros(Math.abs(x.valor - (x.custo || 0))) : (tipo === 'vendas' ? '+' : '−') + euros(x.valor);
    var b = document.createElement('button'); b.type = 'button'; b.className = 'x'; b.textContent = '×'; b.setAttribute('aria-label', 'Apagar');
    b.addEventListener('click', function(){
      if(!confirm('Apagar «' + (x.nome || 'sem nome') + '»?')) return;
      d[tipo] = d[tipo].filter(function(y){ return y.id !== x.id; });
      if(tipo === 'vendas') d.compras.forEach(function(c){ if(c.vendaId === x.id) delete c.vendaId; });   // a peça volta a estar por vender
      alterado();
    });
    el.appendChild(dd); el.appendChild(v);
    if(x.auto) return el;
    if(tipo === 'compras' && !x.vendaId){
      var vb = document.createElement('button'); vb.type = 'button'; vb.className = 'vender'; vb.textContent = 'Vender';
      vb.addEventListener('click', function(){ vender(x); });
      el.appendChild(vb);
    }
    el.appendChild(b);
    return el;
  }
  function lista(id, itens, tipo){
    var box = $(id); box.textContent = '';
    if(!itens.length){ var n = document.createElement('div'); n.className = 'nota'; n.textContent = 'Nada registado neste mês.'; box.appendChild(n); return; }
    itens.slice().sort(function(a, b){ return (b.data || '') < (a.data || '') ? -1 : 1; }).forEach(function(x){ box.appendChild(linha(x, tipo)); });
  }

  // Lucro de cada mês do ano que se está a ver (peças vendidas + PCs) e o acumulado
  function renderAno(){
    var vendas = d.vendas.concat(auto.vendas), pcs = auto.pcs, acum = 0, h = '<tr><th>Mês</th><th>Lucro</th><th>Acumulado</th></tr>';
    for(var m = 0; m < 12; m++){
      var k = ano + '-' + pad(m + 1);
      var noMes = function(x){ return (x.data || '').slice(0, 7) === k; };
      var l = r2(soma(vendas.filter(noMes), function(x){ return x.valor - (x.custo || 0); }) + soma(pcs.filter(noMes), function(x){ return x.valor - (x.custo || 0); }));
      acum = r2(acum + l);
      h += '<tr><td>' + MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1) + '</td><td class="' + (l < 0 ? 'verm' : l > 0 ? 'verde' : '') + '">' + (l ? euros(l) : '—') + '</td><td>' + euros(acum) + '</td></tr>';
    }
    $('anoTitulo').textContent = 'Lucro em ' + ano + ': ' + euros(acum);
    $('tabAno').innerHTML = h;
  }

  function render(){
    $('mesLabel').textContent = MESES[mes].charAt(0).toUpperCase() + MESES[mes].slice(1) + ' ' + ano;
    var compras = doMes(d.compras.concat(auto.compras)), vendas = doMes(d.vendas.concat(auto.vendas));
    var tc = soma(compras, function(x){ return x.valor; }), tv = soma(vendas, function(x){ return x.valor; });
    var pcs = doMes(auto.pcs), lucroPcs = soma(pcs, function(x){ return x.valor - (x.custo || 0); });
    var lucro = r2(soma(vendas, function(x){ return x.valor - (x.custo || 0); }) + lucroPcs);
    var base = saldoBase(), final = r2(base - tc + tv + lucroPcs);
    $('rBase').textContent = euros(base);
    $('rCompras').textContent = euros(tc);
    $('rVendas').textContent = euros(tv);
    $('rPcs').textContent = euros(lucroPcs);
    $('rFinal').textContent = euros(final);
    $('rFinal').className = 'v ' + (final < 0 ? 'verm' : '');
    $('rLucro').textContent = euros(lucro);
    $('rLucro').className = 'v ' + (lucro < 0 ? 'verm' : 'verde');
    lista('listaCompras', compras, 'compras');
    lista('listaVendas', vendas, 'vendas');
    renderAno();
    $('cardPcs').hidden = !auto.pcs.length; lista('listaPcs', pcs, 'pcs');
    var k = auto.stock; $('cardStock').hidden = !k;
    if(k){
      $('sCount').textContent = k.count; $('sCusto').textContent = euros(k.cost); $('sVenda').textContent = euros(k.sell); $('sLucro').textContent = euros(k.sell - k.cost);
      $('sParado').textContent = k.staleCount ? k.staleCount + ' peça(s) parada(s) há muito tempo (' + euros(k.staleCost) + ' empatados).' : 'Nenhuma peça parada há muito tempo.';
    }
  }

  // ---------- guardar / carregar ----------
  function estado(txt, erro){ $('estado').textContent = txt; $('estado').className = 'estado' + (erro ? ' erro' : ''); }
  function alterado(){
    render(); sujo = true; estado('A guardar…');
    clearTimeout(guardarTimer); guardarTimer = setTimeout(guardar, 600);
  }
  function aplicarServidor(dados){
    d = Object.assign(padrao(), dados || {});
    if(!Array.isArray(d.compras)) d.compras = [];
    if(!Array.isArray(d.vendas)) d.vendas = [];
    if(!d.dac7 || typeof d.dac7 !== 'object' || Array.isArray(d.dac7)) d.dac7 = {};   // dados antigos sem a aba DAC7
  }

  // ---------- Limite DAC7 (aba própria; números escritos à mão, por plataforma e por ano civil) ----------
  // d.dac7['AAAA'] = [{ id, nome, vendas, valor, em, registos? }]. A plataforma comunica às Finanças com 30 vendas ou mais de 2000 €.
  // `vendas`/`valor` = a base escrita à mão (o que já tinhas antes de registar vendas); `registos` = [{ id, data, nome, valor }],
  // as vendas registadas uma a uma (plataformas antigas não têm o campo). O que conta para o limite é a base + os registos.
  var DAC7_EUROS = 2000, DAC7_VENDAS = 30, DAC7_PERTO = 0.85, dacAno = hoje.getFullYear();
  function plataformas(){ var l = d.dac7[String(dacAno)]; return Array.isArray(l) ? l : []; }
  function registos(p){ return Array.isArray(p.registos) ? p.registos : []; }
  /** Totais de uma plataforma para o limite: base escrita à mão + vendas registadas. */
  function totais(p){
    var r = registos(p);
    return { vendas: (Number(p.vendas) || 0) + r.length, valor: r2((Number(p.valor) || 0) + soma(r, function(x){ return x.valor; })) };
  }
  function estadoDac7(p){
    var t = totais(p), v = t.valor, n = t.vendas;
    if(v > DAC7_EUROS || n >= DAC7_VENDAS) return 'passou';
    if(v >= DAC7_EUROS * DAC7_PERTO || n >= Math.ceil(DAC7_VENDAS * DAC7_PERTO)) return 'perto';
    return 'ok';
  }
  function textoDac7(p, e){
    var t = totais(p), v = t.valor, n = t.vendas;
    if(e === 'passou') return '⚠ Chegaste ao limite em ' + (p.nome || 'esta plataforma') + ': ' + (n >= DAC7_VENDAS ? n + ' vendas' : euros(v)) + '. A plataforma vai comunicar estas vendas às Finanças.';
    var falta = 'Faltam ' + euros(Math.max(0, DAC7_EUROS - v)) + ' e ' + Math.max(0, DAC7_VENDAS - n) + ' venda(s) para o limite.';
    return e === 'perto' ? '⚠ Perto do limite. ' + falta : falta;
  }
  function pintarPlataforma(box, p){
    var t = totais(p), v = t.valor, n = t.vendas, e = estadoDac7(p);
    var r = registos(p), extra = box.querySelector('.dac-registadas');
    extra.textContent = r.length ? '+ ' + r.length + ' venda(s) registada(s) em baixo: ' + euros(soma(r, function(x){ return x.valor; })) : '';
    var bE = box.querySelector('.bEuros'), bN = box.querySelector('.bVendas');
    bE.style.width = Math.min(100, v / DAC7_EUROS * 100) + '%';
    bN.style.width = Math.min(100, n / DAC7_VENDAS * 100) + '%';
    bE.className = 'bEuros ' + (v > DAC7_EUROS ? 'passou' : v >= DAC7_EUROS * DAC7_PERTO ? 'perto' : '');
    bN.className = 'bVendas ' + (n >= DAC7_VENDAS ? 'passou' : n >= Math.ceil(DAC7_VENDAS * DAC7_PERTO) ? 'perto' : '');
    box.querySelector('.rEuros').textContent = euros(v) + ' de ' + euros(DAC7_EUROS);
    box.querySelector('.rVendas').textContent = n + ' de ' + DAC7_VENDAS;
    bE.parentNode.setAttribute('aria-valuenow', String(r2(v)));
    bN.parentNode.setAttribute('aria-valuenow', String(n));
    var est = box.querySelector('.dac-estado');
    est.className = 'dac-estado ' + (e === 'ok' ? '' : e);
    est.textContent = textoDac7(p, e) + (p.em ? ' (atualizado a ' + fmtData(p.em) + ')' : '');
  }
  function totalDac7(){
    var l = plataformas();
    $('dTotal').textContent = l.length > 1 ? 'Total das plataformas em ' + dacAno + ': ' + euros(soma(l, function(p){ return totais(p).valor; })) + ' em ' + soma(l, function(p){ return totais(p).vendas; }) + ' vendas (o limite conta cada plataforma à parte).' : '';
  }

  // ---------- registar vendas e histórico ----------
  function renderVendaForm(){
    var l = plataformas(), sel = $('dvPlat'), antes = sel.value;
    sel.textContent = '';
    l.forEach(function(p){ var o = document.createElement('option'); o.value = p.id; o.textContent = p.nome; sel.appendChild(o); });
    if(antes && l.some(function(p){ return p.id === antes; })) sel.value = antes;
    var sem = !l.length;
    ['dvPlat', 'dvData', 'dvNome', 'dvValor', 'dvAdd'].forEach(function(id){ $(id).disabled = sem; });
    $('dvAviso').textContent = sem ? 'Adiciona primeiro uma plataforma em cima.' : '';
    // A data fica dentro do ano que estás a ver (o limite é por ano civil).
    $('dvData').min = dacAno + '-01-01'; $('dvData').max = dacAno + '-12-31';
    var v = $('dvData').value;
    if(!v || v.slice(0, 4) !== String(dacAno)) $('dvData').value = dacAno === hoje.getFullYear() ? hojeISO() : dacAno + '-12-31';
  }
  function registarVenda(){
    var p = plataformas().filter(function(x){ return x.id === $('dvPlat').value; })[0];
    var valor = r2(Number(String($('dvValor').value).replace(',', '.')) || 0);
    var data = $('dvData').value;
    if(!p) return;
    if(!(valor > 0)){ $('dvAviso').textContent = 'Escreve o valor que recebeste.'; $('dvValor').focus(); return; }
    if(!data || data.slice(0, 4) !== String(dacAno)){ $('dvAviso').textContent = 'A data tem de ser de ' + dacAno + '.'; $('dvData').focus(); return; }
    p.registos = registos(p).concat([{ id: novoId(), data: data, nome: $('dvNome').value.trim().slice(0, 60), valor: valor }]);
    $('dvNome').value = ''; $('dvValor').value = '';
    $('dvAviso').textContent = 'Registada: ' + euros(valor) + ' em ' + p.nome + '.';
    renderDac7(); alterado();
    $('dvNome').focus();
  }
  function renderHistorico(){
    var l = plataformas(), box = $('dHist'); box.textContent = '';
    var todos = [];
    l.forEach(function(p){ registos(p).forEach(function(x){ todos.push({ x: x, p: p }); }); });
    todos.sort(function(a, b){ return (b.x.data || '') < (a.x.data || '') ? -1 : (b.x.data || '') > (a.x.data || '') ? 1 : 0; });
    if(!todos.length){ var n = document.createElement('div'); n.className = 'nota'; n.textContent = 'Ainda sem vendas registadas em ' + dacAno + '.'; box.appendChild(n); }
    todos.forEach(function(it){
      var el = document.createElement('div'); el.className = 'reg';
      var dd = document.createElement('div'); dd.className = 'd';
      var nome = document.createElement('div'); nome.textContent = it.x.nome || '(sem descrição)';
      var m = document.createElement('div'); m.className = 'm'; m.textContent = fmtData(it.x.data) + ' · ' + it.p.nome;
      dd.appendChild(nome); dd.appendChild(m);
      var v = document.createElement('div'); v.className = 'v verde'; v.textContent = '+' + euros(it.x.valor);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'x'; b.textContent = '×'; b.setAttribute('aria-label', 'Apagar venda');
      b.addEventListener('click', function(){
        if(!confirm('Apagar a venda «' + (it.x.nome || 'sem descrição') + '» (' + euros(it.x.valor) + ') de ' + it.p.nome + '?')) return;
        it.p.registos = registos(it.p).filter(function(y){ return y.id !== it.x.id; });
        renderDac7(); alterado();
      });
      el.appendChild(dd); el.appendChild(v); el.appendChild(b);
      box.appendChild(el);
    });
    // Resumo: o que estava na barra (base) + o que registaste = o que conta para o limite.
    var res = $('dResumo'); res.textContent = '';
    if(!l.length) return;
    var linhaResumo = function(rotulo, valor, vendas, forte){
      var row = document.createElement('div'); row.className = 'dac-resumo-linha' + (forte ? ' forte' : '');
      var a = document.createElement('span'); a.textContent = rotulo;
      var b = document.createElement('span'); b.textContent = euros(valor) + ' · ' + vendas + ' venda(s)';
      row.appendChild(a); row.appendChild(b); res.appendChild(row);
    };
    l.forEach(function(p){
      var r = registos(p), t = totais(p);
      var cab = document.createElement('div'); cab.className = 'dac-resumo-plat'; cab.textContent = p.nome; res.appendChild(cab);
      linhaResumo('Na barra (escrito à mão)', Number(p.valor) || 0, Number(p.vendas) || 0, false);
      linhaResumo('Registadas', soma(r, function(x){ return x.valor; }), r.length, false);
      linhaResumo('Total para o limite', t.valor, t.vendas, true);
    });
  }
  function barra(rotulo, classe, max){
    return '<div class="rot"><span>' + rotulo + '</span><b class="r' + classe.slice(2) + '"></b></div>' +
      '<div class="barra" role="progressbar" aria-label="' + rotulo + '" aria-valuemin="0" aria-valuemax="' + max + '"><i class="' + classe.slice(1) + '"></i></div>';
  }
  function renderDac7(){
    $('dAno').textContent = 'Ano de ' + dacAno;
    var box = $('dacLista'); box.textContent = '';
    var l = plataformas();
    if(!l.length){ var n = document.createElement('div'); n.className = 'nota'; n.textContent = 'Ainda sem plataformas em ' + dacAno + '. Adiciona em baixo a primeira (ex.: Vinted).'; box.appendChild(n); }
    l.forEach(function(p){
      var el = document.createElement('div'); el.className = 'plat';
      el.innerHTML = '<div class="plat-topo"><strong></strong><button type="button" class="x" aria-label="Apagar plataforma">×</button></div>' +
        '<div class="campos"><div><label>Vendas feitas</label><input type="number" class="iVendas" inputmode="numeric" min="0" step="1"></div>' +
        '<div><label>Dinheiro recebido (€)</label><input type="number" class="iValor" inputmode="decimal" min="0" step="0.01"></div></div>' +
        '<div class="nota dac-registadas"></div>' +
        barra('Dinheiro', '.bEuros', DAC7_EUROS) + barra('Vendas', '.bVendas', DAC7_VENDAS) + '<div class="dac-estado" role="status"></div>';
      el.querySelector('strong').textContent = p.nome;
      var iN = el.querySelector('.iVendas'), iV = el.querySelector('.iValor');
      iN.id = 'dVendas-' + p.id; iV.id = 'dValor-' + p.id;
      iN.previousElementSibling.setAttribute('for', iN.id); iV.previousElementSibling.setAttribute('for', iV.id);
      iN.value = p.vendas ? String(p.vendas) : ''; iV.value = p.valor ? String(p.valor) : '';
      var mudou = function(){
        p.vendas = Math.max(0, Math.floor(Number(iN.value) || 0));
        p.valor = Math.max(0, r2(Number(String(iV.value).replace(',', '.')) || 0));
        p.em = hojeISO();
        pintarPlataforma(el, p); totalDac7(); alterado();
      };
      iN.addEventListener('input', mudou); iV.addEventListener('input', mudou);
      el.querySelector('button.x').setAttribute('aria-label', 'Apagar ' + p.nome);
      el.querySelector('button.x').addEventListener('click', function(){
        var nr = registos(p).length;
        if(!confirm('Apagar «' + p.nome + '» de ' + dacAno + '?' + (nr ? ' Apaga também as ' + nr + ' venda(s) registadas desta plataforma.' : ''))) return;
        d.dac7[String(dacAno)] = plataformas().filter(function(y){ return y.id !== p.id; });
        renderDac7(); alterado();
      });
      pintarPlataforma(el, p);
      box.appendChild(el);
    });
    totalDac7();
    renderVendaForm();
    renderHistorico();
  }
  function adicionarPlataforma(){
    var nome = $('dNome').value.trim().slice(0, 40);
    if(!nome){ $('dNome').focus(); return; }
    var l = plataformas();
    var existe = l.filter(function(p){ return String(p.nome).toLowerCase() === nome.toLowerCase(); })[0];
    if(!existe){ l = l.concat([{ id: novoId(), nome: nome, vendas: 0, valor: 0, em: '' }]); d.dac7[String(dacAno)] = l; alterado(); }
    $('dNome').value = '';
    renderDac7();
    var alvo = existe || l[l.length - 1];
    var campo = $('dVendas-' + alvo.id); if(campo) campo.focus();
  }
  function mostrarAba(qual){
    var dac = qual === 'dac7';
    $('abaNegocio').hidden = dac; $('abaDac7').hidden = !dac;
    $('tabNegocio').className = dac ? '' : 'ativo'; $('tabDac7').className = dac ? 'ativo' : '';
    $('tabNegocio').setAttribute('aria-selected', String(!dac)); $('tabDac7').setAttribute('aria-selected', String(dac));
    if(dac) renderDac7();
    try{ history.replaceState(null, '', dac ? '#dac7' : location.pathname + location.search); }catch(e){}
  }
  async function guardar(){
    guardarTimer = null;
    if(aGuardar){ guardarTimer = setTimeout(guardar, 400); return; }
    aGuardar = true; sujo = false;
    try{
      var r = await fetch('/api/negocio', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ versao: versao, dados: d }) });
      var j = {}; try{ j = await r.json(); }catch(e){}
      if(r.ok){ versao = j.versao; estado(sujo ? 'A guardar…' : 'Guardado'); }
      else if(r.status === 409 && j.dados){
        versao = j.versao; aplicarServidor(j.dados); render(); renderDac7();
        estado('Outra pessoa alterou entretanto: mostrei a versão mais recente. Repete a tua alteração, se for preciso.', true);
        sujo = false;
      } else throw new Error(j.erro || ('HTTP ' + r.status));
    }catch(e){ estado('Não foi possível guardar (' + (e.message || e) + '). Tenta de novo.', true); sujo = true; }
    aGuardar = false;
    if(sujo && !guardarTimer) guardarTimer = setTimeout(guardar, 3000);
  }
  async function carregar(){
    try{
      var r = await fetch('/api/negocio', { cache:'no-store' });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      var j = await r.json();
      versao = j.versao || 0;
      aplicarServidor(j.dados);
      estado(j.dados ? 'Guardado' : 'Ainda sem registos');
    }catch(e){ estado('Não foi possível ler os dados (' + (e.message || e) + '). Não alteres nada até voltar a ligação.', true); }
    try{
      var rf = await fetch('/api/negocio-fafe', { cache:'no-store' });
      var jf = await rf.json();
      if(jf.erro) estado(jf.desatualizado ? 'FafeBuilds sem resposta (' + jf.erro + '): mostro os dados de ' + new Date(jf.atualizadoEm).toLocaleString('pt-PT') + '.' : 'Não consegui ler o FafeBuilds (' + jf.erro + '). Só vês os registos feitos aqui.', true);
      auto.compras = (jf.compras || []).map(function(x){ x.auto = true; return x; });
      auto.vendas = (jf.vendas || []).map(function(x){ x.auto = true; return x; });
      auto.pcs = (jf.pcs || []).map(function(x){ x.auto = true; return x; });
      auto.stock = jf.stock || null;
    }catch(e){}
    try{
      var r2d = await fetch('/api/data?modo=v2', { cache:'no-store' });
      if(r2d.ok) dadosMain = (await r2d.json()).dados;
    }catch(e){}
    render(); renderDac7();
  }

  function mudarMes(delta){
    mes += delta;
    if(mes < 0){ mes = 11; ano--; } else if(mes > 11){ mes = 0; ano++; }
    render();
  }
  // Passa uma peça comprada para as vendidas: a compra fica (o dinheiro já saiu) e a venda usa o preço de compra como custo
  function vender(c){
    var txt = prompt('Vendi «' + (c.nome || 'sem nome') + '» por (€):');
    if(txt === null) return;
    var v = parseFloat(String(txt).replace(',', '.'));
    if(!(v >= 0)){ return; }
    var venda = { id: novoId(), nome: c.nome, valor: v, custo: c.valor, data: hojeISO(), compraId: c.id };
    d.vendas.push(venda);
    c.vendaId = venda.id;
    ano = hoje.getFullYear(); mes = hoje.getMonth();
    alterado();
  }
  function adicionar(tipo, nomeId, valorId, dataId, custoId){
    var v = parseFloat($(valorId).value);
    if(!(v > 0)){ $(valorId).focus(); return; }
    var x = { id: novoId(), nome: $(nomeId).value.trim(), valor: v, data: $(dataId).value || hojeISO() };
    if(custoId) x.custo = Math.max(0, parseFloat($(custoId).value) || 0);
    d[tipo].push(x);
    $(nomeId).value = ''; $(valorId).value = ''; if(custoId) $(custoId).value = '';
    // mostra o mês da peça acabada de registar
    var p = x.data.split('-'); ano = parseInt(p[0], 10) || ano; mes = (parseInt(p[1], 10) || mes + 1) - 1;
    alterado();
  }

  $('mesAnt').addEventListener('click', function(){ mudarMes(-1); });
  $('mesSeg').addEventListener('click', function(){ mudarMes(1); });
  $('cData').value = hojeISO(); $('vData').value = hojeISO();
  $('cAdd').addEventListener('click', function(){ adicionar('compras', 'cNome', 'cValor', 'cData'); });
  $('vAdd').addEventListener('click', function(){ adicionar('vendas', 'vNome', 'vValor', 'vData', 'vCusto'); });
  $('tabNegocio').addEventListener('click', function(){ mostrarAba('negocio'); });
  $('tabDac7').addEventListener('click', function(){ mostrarAba('dac7'); });
  $('dAnoAnt').addEventListener('click', function(){ dacAno--; renderDac7(); });
  $('dAnoSeg').addEventListener('click', function(){ dacAno++; renderDac7(); });
  $('dAdd').addEventListener('click', adicionarPlataforma);
  $('dNome').addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); adicionarPlataforma(); } });
  $('dvAdd').addEventListener('click', registarVenda);
  $('dvValor').addEventListener('keydown', function(e){ if(e.key === 'Enter') registarVenda(); });
  if(location.hash === '#dac7') mostrarAba('dac7');
  window.addEventListener('pagehide', function(){
    if(sujo){ try{ fetch('/api/negocio', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ versao: versao, dados: d }), keepalive: true }); }catch(e){} }
  });
  carregar();
})();
