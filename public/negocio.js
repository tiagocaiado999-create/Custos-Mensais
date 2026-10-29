(function(){
  var $ = function(id){ return document.getElementById(id); };
  var eur = new Intl.NumberFormat('pt-PT', { style:'currency', currency:'EUR' });
  var r2 = function(x){ return Math.round((x || 0) * 100) / 100; };
  var euros = function(n){ return eur.format(r2(n)); };
  var MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  var versao = 0, d = padrao(), guardarTimer = null, aGuardar = false, sujo = false;
  var dadosMain = null;                       // dados principais (só leitura), para o saldo do mês
  var hoje = new Date(), ano = hoje.getFullYear(), mes = hoje.getMonth();

  function padrao(){ return { compras:[], vendas:[] }; }
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
    m.textContent = fmtData(x.data) + (tipo === 'vendas' ? ' · paguei ' + euros(x.custo) + ' · lucro ' + euros(x.valor - (x.custo || 0)) : '');
    dd.appendChild(nome); dd.appendChild(m);
    var v = document.createElement('div'); v.className = 'v ' + (tipo === 'vendas' ? 'verde' : 'verm');
    v.textContent = (tipo === 'vendas' ? '+' : '−') + euros(x.valor);
    var b = document.createElement('button'); b.type = 'button'; b.className = 'x'; b.textContent = '×'; b.setAttribute('aria-label', 'Apagar');
    b.addEventListener('click', function(){
      if(!confirm('Apagar «' + (x.nome || 'sem nome') + '»?')) return;
      d[tipo] = d[tipo].filter(function(y){ return y.id !== x.id; });
      alterado();
    });
    el.appendChild(dd); el.appendChild(v); el.appendChild(b);
    return el;
  }
  function lista(id, itens, tipo){
    var box = $(id); box.textContent = '';
    if(!itens.length){ var n = document.createElement('div'); n.className = 'nota'; n.textContent = 'Nada registado neste mês.'; box.appendChild(n); return; }
    itens.slice().sort(function(a, b){ return (b.data || '') < (a.data || '') ? -1 : 1; }).forEach(function(x){ box.appendChild(linha(x, tipo)); });
  }

  function render(){
    $('mesLabel').textContent = MESES[mes].charAt(0).toUpperCase() + MESES[mes].slice(1) + ' ' + ano;
    var compras = doMes(d.compras), vendas = doMes(d.vendas);
    var tc = soma(compras, function(x){ return x.valor; }), tv = soma(vendas, function(x){ return x.valor; });
    var lucro = soma(vendas, function(x){ return x.valor - (x.custo || 0); });
    var base = saldoBase(), final = r2(base - tc + tv);
    $('rBase').textContent = euros(base);
    $('rCompras').textContent = euros(tc);
    $('rVendas').textContent = euros(tv);
    $('rFinal').textContent = euros(final);
    $('rFinal').className = 'v ' + (final < 0 ? 'verm' : '');
    $('rLucro').textContent = euros(lucro);
    $('rLucro').className = 'v ' + (lucro < 0 ? 'verm' : 'verde');
    lista('listaCompras', compras, 'compras');
    lista('listaVendas', vendas, 'vendas');
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
        versao = j.versao; aplicarServidor(j.dados); render();
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
      var r2d = await fetch('/api/data?modo=v2', { cache:'no-store' });
      if(r2d.ok) dadosMain = (await r2d.json()).dados;
    }catch(e){}
    render();
  }

  function mudarMes(delta){
    mes += delta;
    if(mes < 0){ mes = 11; ano--; } else if(mes > 11){ mes = 0; ano++; }
    render();
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
  window.addEventListener('pagehide', function(){
    if(sujo){ try{ fetch('/api/negocio', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ versao: versao, dados: d }), keepalive: true }); }catch(e){} }
  });
  carregar();
})();
