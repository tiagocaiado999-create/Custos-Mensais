(function(){
  var $ = function(id){ return document.getElementById(id); };
  var eur = new Intl.NumberFormat('pt-PT', { style:'currency', currency:'EUR' });
  var r2 = function(x){ return Math.round((x || 0) * 100) / 100; };
  var euros = function(n){ return eur.format(r2(n)); };
  var pct = function(n){ return (Math.round(n * 100) / 100).toLocaleString('pt-PT') + '%'; };
  var CATS = { seguro:'Seguro', manutencao:'Manutenção', energia:'Energia', outros:'Outros' };
  var CUSTOS = [['seguro','Seguro'], ['manutencao','Manutenção'], ['energia','Energia (carregamentos)']];
  var CAMPOS_FIN = ['pedido','seguroVida','isCapital','tan','taeg','prazo','taxaIS','prestacaoBase','totalIndicado'];

  function padrao(){
    return { preco:30000, sinal:1000, sinalPago:true, entrada:10000, entradaData:'2027-02-28', entradaPaga:false,
      pedido:20000, seguroVida:653.25, isCapital:370.01, tan:6, taeg:7, prazo:84, taxaIS:4, prestacaoBase:307.12, totalIndicado:25989.04,
      primeiraPrestacao:'',
      seguro:{ valor:0, periodo:'mensal' }, manutencao:{ valor:0, periodo:'mensal' }, energia:{ valor:0, periodo:'mensal' },
      kmAno:0, registos:[], abatimentos:[] };
  }
  var LOCAIS = { casa:'Casa', publico:'Posto público', trabalho:'Trabalho', outro:'Outro' };
  var versao = 0, d = padrao(), guardarTimer = null, aGuardar = false, sujo = false, editId = null;
  var verApos = null, abValor = 0, abApos = null;   // simulações (não são guardadas)

  function get(o, path){ return path.split('.').reduce(function(a, k){ return a == null ? a : a[k]; }, o); }
  function set(o, path, v){ var p = path.split('.'), k = p.pop(); var t = p.reduce(function(a, x){ if(!a[x]) a[x] = {}; return a[x]; }, o); t[k] = v; }
  function pad(n){ return String(n).padStart(2, '0'); }
  function hojeISO(){ var t = new Date(); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); }
  function fmtData(iso){ var p = (iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—'; }
  function addMeses(iso, k){
    var p = iso.split('-').map(Number), m = p[1] - 1 + k;
    var ny = p[0] + Math.floor(m / 12), nm = ((m % 12) + 12) % 12, ult = new Date(ny, nm + 1, 0).getDate();
    return ny + '-' + pad(nm + 1) + '-' + pad(Math.min(p[2], ult));
  }
  function pmt(P, r, n){ if(!n) return 0; if(!r) return P / n; return P * r / (1 - Math.pow(1 + r, -n)); }
  function mensalDe(c){ return !c ? 0 : (c.periodo === 'anual' ? (Number(c.valor) || 0) / 12 : (Number(c.valor) || 0)); }
  function anualDe(c){ return !c ? 0 : (c.periodo === 'mensal' ? (Number(c.valor) || 0) * 12 : (Number(c.valor) || 0)); }
  function soma(l, f){ return r2(l.reduce(function(a, x){ return a + x[f]; }, 0)); }

  // Plano de amortização como o do banco: juros arredondados ao cêntimo, prestação constante, a última ajusta.
  function plano(cap, tm, n, pg, tis){
    var rows = [], s = r2(cap);
    for(var i = 1; i <= n && s > 0; i++){
      var j = r2(s * tm), am = r2(pg - j), p = pg;
      if(i === n || am >= s){ am = s; p = r2(am + j); }
      s = r2(s - am);
      var is = r2(j * tis);
      rows.push({ i:i, j:j, am:am, s:s, p:p, is:is, pc:r2(p + is) });
    }
    return rows;
  }

  // Plano com os abatimentos já feitos (por ordem): cada um reduz o capital depois da prestação indicada,
  // pagando a comissão do banco, e depois reduz o prazo (mesma prestação) ou a prestação (mesmo prazo).
  function planoAbat(fin, tm, prazo, base, tis, abs){
    var rows = [], saldo = r2(fin), saldoIni = saldo, prest = base, k = 0, abatido = 0, comissoes = 0;
    abs.forEach(function(a){
      if(saldo <= 0) return;
      var ate = Math.min(Math.max(k, Math.round(a.apos) || 0), prazo - 1);
      var seg = plano(saldo, tm, prazo - k, prest, tis), corte = Math.min(ate - k, seg.length);
      seg.slice(0, corte).forEach(function(r){ r.i += k; rows.push(r); });
      if(corte) saldo = seg[corte - 1].s;
      k += corte;
      if(saldo <= 0) return;
      var rest = prazo - k, X = Math.min(Math.max(0, a.valor || 0), saldo);
      var com = r2(X * (rest > 12 ? 0.005 : 0.0025));
      saldo = r2(saldo - X);
      if(k > 0) rows[rows.length - 1].s = saldo; else saldoIni = saldo;
      if(a.modo === 'prestacao' && saldo > 0 && rest > 0) prest = r2(pmt(saldo, tm, rest));
      abatido += X; comissoes += r2(com + r2(com * 0.04));
    });
    plano(saldo, tm, prazo - k, prest, tis).forEach(function(r){ r.i += k; rows.push(r); });
    return { plano: rows, base: prest, kMin: k, saldoIni: saldoIni, abatido: r2(abatido), comissoes: r2(comissoes) };
  }

  function calcular(){
    var c = {};
    c.financiado = r2((d.pedido || 0) + (d.seguroVida || 0) + (d.isCapital || 0));
    c.prazo = Math.max(0, Math.round(d.prazo || 0));
    c.tm = (d.tan || 0) / 1200;
    c.tis = (d.taxaIS || 0) / 100;
    c.baseOrig = d.prestacaoBase > 0 ? d.prestacaoBase : r2(pmt(c.financiado, c.tm, c.prazo));
    var orig = plano(c.financiado, c.tm, c.prazo, c.baseOrig, c.tis);
    c.jurosOrig = soma(orig, 'j'); c.isOrig = soma(orig, 'is'); c.totalBancoOrig = soma(orig, 'pc');
    var abs = (d.abatimentos || []).slice().sort(function(a, b){ return (a.apos - b.apos) || ((a.data || '') < (b.data || '') ? -1 : 1); });
    var pa = planoAbat(c.financiado, c.tm, c.prazo, c.baseOrig, c.tis, abs);
    c.plano = pa.plano; c.base = pa.base; c.kMin = pa.kMin; c.saldoIni = pa.saldoIni; c.abatido = pa.abatido; c.comissoes = pa.comissoes;
    c.n = c.plano.length;
    c.juros = soma(c.plano, 'j'); c.isJuros = soma(c.plano, 'is'); c.totalBanco = soma(c.plano, 'pc');
    var custoSem = r2(c.jurosOrig + c.isOrig);
    c.poupanca = r2(custoSem - (c.juros + c.isJuros) - c.comissoes);
    // poupança de cada abatimento: diferença de custo (juros + imposto + comissões) entre aplicar só os anteriores e aplicá-lo também
    c.poupAb = {};
    var antes = custoSem;
    abs.forEach(function(a, j){
      var p = planoAbat(c.financiado, c.tm, c.prazo, c.baseOrig, c.tis, abs.slice(0, j + 1));
      var custo = r2(soma(p.plano, 'j') + soma(p.plano, 'is') + p.comissoes);
      c.poupAb[a.id] = r2(antes - custo); antes = custo;
    });
    c.custoCredito = r2(c.totalBanco + c.abatido + c.comissoes - (d.pedido || 0));
    c.custoTotal = r2((d.preco || 0) + c.custoCredito);
    var hoje = hojeISO();
    c.pagas = 0;
    if(d.primeiraPrestacao){ for(var k = 0; k < c.n; k++){ if(addMeses(d.primeiraPrestacao, k) <= hoje) c.pagas++; } }
    c.pagoPrest = soma(c.plano.slice(0, c.pagas), 'pc');
    c.pago = r2((d.sinalPago ? (d.sinal || 0) : 0) + (d.entradaPaga ? (d.entrada || 0) : 0) + c.pagoPrest + c.abatido + c.comissoes);
    c.falta = r2((d.sinalPago ? 0 : (d.sinal || 0)) + (d.entradaPaga ? 0 : (d.entrada || 0)) + c.totalBanco - c.pagoPrest);
    c.prestAtual = c.n ? c.plano[Math.min(c.pagas, c.n - 1)].pc : 0;
    c.uso = {}; c.usoMes = 0; c.usoAno = 0;
    CUSTOS.forEach(function(x){ var o = d[x[0]]; c.uso[x[0]] = { mes: mensalDe(o), ano: anualDe(o) }; c.usoMes += mensalDe(o); c.usoAno += anualDe(o); });
    c.mensal = c.prestAtual + c.usoMes;
    c.anual = c.prestAtual * 12 + c.usoAno;
    return c;
  }
  function saldoApos(c, k){ return k <= 0 ? c.saldoIni : (c.plano[Math.min(k, c.n) - 1] || { s:0 }).s; }

  // Abater parte do capital depois da prestação k
  function abater(c, k, X){
    var saldo = saldoApos(c, k), rest = c.n - k;
    X = Math.min(Math.max(0, X), saldo);
    var taxa = rest > 12 ? 0.005 : 0.0025, com = r2(X * taxa), isCom = r2(com * 0.04), novo = r2(saldo - X);
    var resto = c.plano.slice(k);
    var sem = { juros: soma(resto, 'j'), is: soma(resto, 'is'), pag: soma(resto, 'pc') };
    function res(pl){ return { juros: soma(pl, 'j'), is: soma(pl, 'is'), pag: soma(pl, 'pc'), meses: pl.length, ultima: pl.length ? pl[pl.length - 1].p : 0, pl: pl }; }
    var A = res(plano(novo, c.tm, rest, c.base, c.tis));
    var pB = rest > 0 && novo > 0 ? r2(pmt(novo, c.tm, rest)) : 0;
    var B = res(plano(novo, c.tm, rest, pB, c.tis)); B.prest = pB;
    var custoCom = r2(com + isCom);
    return { saldo:saldo, X:X, rest:rest, taxa:taxa, com:com, isCom:isCom, custoCom:custoCom, novo:novo, sem:sem, A:A, B:B,
      liqA: r2(sem.juros + sem.is - A.juros - A.is - custoCom), liqB: r2(sem.juros + sem.is - B.juros - B.is - custoCom) };
  }

  function linhaTab(a, b, extra){ return '<tr><td>' + a + '</td><td' + (extra ? ' class="' + extra + '"' : '') + '>' + b + '</td></tr>'; }
  function linha3(a, b, c3){ return '<tr><td>' + a + '</td><td class="c">' + b + '</td><td class="c">' + c3 + '</td></tr>'; }

  function renderCarro(c){
    var hoje = hojeISO();
    $('rTotal').textContent = euros(c.custoTotal);
    $('rPago').textContent = euros(c.pago);
    $('rFalta').textContent = euros(c.falta);
    $('rMensal').textContent = euros(c.mensal);
    $('rAnual').textContent = euros(c.anual);
    $('rAbatBox').hidden = $('rPoupBox').hidden = !(c.abatido > 0);
    $('rAbat').textContent = euros(c.abatido); $('rPoup').textContent = euros(c.poupanca);
    var prox = '';
    if(!d.entradaPaga && d.entradaData){
      var dias = Math.round((new Date(d.entradaData + 'T00:00:00') - new Date(hoje + 'T00:00:00')) / 86400000);
      prox = 'Próximo pagamento: entrada de ' + euros(d.entrada) + ' em ' + fmtData(d.entradaData) + (dias >= 0 ? ' (faltam ' + dias + ' dias)' : ' (já passou a data: marca como paga quando pagares)') + '.';
    } else if(d.primeiraPrestacao && c.pagas < c.n){
      prox = 'Próxima prestação: ' + euros(c.prestAtual) + ' em ' + fmtData(addMeses(d.primeiraPrestacao, c.pagas)) + '.';
    }
    $('rProx').textContent = prox;

    var f = '';
    f += linhaTab('Montante pedido ao banco', euros(d.pedido));
    f += linhaTab('+ Seguro de vida (prémio único, financiado)', euros(d.seguroVida));
    f += linhaTab('+ Imposto do selo sobre o crédito (financiado)', euros(d.isCapital));
    f += linhaTab('<b>Montante financiado</b>', '<b>' + euros(c.financiado) + '</b>');
    f += linhaTab('Prestação (sem imposto do selo)', euros(c.baseOrig) + (c.base !== c.baseOrig ? ' · agora: ' + euros(c.base) : ''));
    if(c.abatido > 0){
      f += linhaTab('Abatimentos já feitos (capital)', euros(c.abatido));
      f += linhaTab('Comissões dos abatimentos (com imposto do selo)', euros(c.comissoes));
      f += linhaTab('<b>Juros e imposto poupados com os abatimentos</b> (já descontadas as comissões)', '<b class="' + (c.poupanca > 0 ? 'verde' : 'verm') + '">' + euros(c.poupanca) + '</b>');
    }
    if(c.n){
      f += linhaTab('Prestação com imposto do selo', 'a 1.ª: ' + euros(c.plano[0].pc) + ' · a última: ' + euros(c.plano[c.n - 1].pc));
      f += linhaTab('Total a pagar ao banco (' + c.n + ' prestações)', euros(c.totalBanco));
      f += linhaTab('&nbsp;&nbsp;dos quais juros', euros(c.juros));
      f += linhaTab('&nbsp;&nbsp;dos quais imposto do selo sobre os juros', euros(c.isJuros));
    }
    f += linhaTab('Custo do crédito (o que pagas além dos ' + euros(d.pedido) + ')', euros(c.custoCredito) + (d.pedido ? ' · ' + pct(c.custoCredito / d.pedido * 100) : ''));
    f += linhaTab('Sobrecusto face ao preço do carro', d.preco ? pct(c.custoCredito / d.preco * 100) : '—');
    $('tabFin').innerHTML = f;

    var av = [];
    if(d.totalIndicado > 0){
      var dif = r2(c.totalBancoOrig - d.totalIndicado);
      av.push(Math.abs(dif) < 0.05 ? '✓ O total calculado (sem abatimentos) confere com o da ficha do banco (' + euros(d.totalIndicado) + ').' : '⚠ O total calculado (' + euros(c.totalBancoOrig) + ') difere ' + euros(Math.abs(dif)) + ' do indicado pelo banco: confirma os valores.');
    }
    var falta = r2((d.preco || 0) - (d.sinal || 0) - (d.entrada || 0) - (d.pedido || 0));
    if(Math.abs(falta) >= 0.01) av.push('⚠ Preço − sinal − entrada − montante pedido = ' + euros(falta) + '. Confirma se a entrada ou o montante pedido estão certos.');
    $('avisoFin').textContent = av.join(' ');
    $('avisoFin').hidden = av.length === 0;

    CUSTOS.forEach(function(x){ var u = c.uso[x[0]]; $('eq-' + x[0]).textContent = '= ' + euros(u.mes) + ' por mês · ' + euros(u.ano) + ' por ano'; });
    var u = '';
    u += linhaTab('Prestação do crédito' + (d.primeiraPrestacao ? ' (a próxima)' : ' (a 1.ª)'), euros(c.prestAtual) + '/mês · ' + euros(c.prestAtual * 12) + '/ano');
    u += linhaTab('Seguro + manutenção + energia', euros(c.usoMes) + '/mês · ' + euros(c.usoAno) + '/ano');
    u += '<tr><td><b>Total</b></td><td><b>' + euros(c.mensal) + '/mês · ' + euros(c.anual) + '/ano</b></td></tr>';
    if(d.kmAno > 0) u += linhaTab('Custo por km (utilização, sem prestação)', euros(c.usoAno / d.kmAno)) + linhaTab('Custo por km (com prestação)', euros(c.anual / d.kmAno));
    $('tabUso').innerHTML = u;

    var mesAtual = hoje.slice(0, 7), anoAtual = hoje.slice(0, 4), real = {};
    Object.keys(CATS).forEach(function(k){ real[k] = { mes: 0, ano: 0 }; });
    (d.registos || []).forEach(function(r){
      var cat = real[r.cat] ? r.cat : 'outros';
      if((r.data || '').slice(0, 7) === mesAtual) real[cat].mes += r.valor;
      if((r.data || '').slice(0, 4) === anoAtual) real[cat].ano += r.valor;
    });
    var t = '<tr><th>Categoria</th><th>Este mês · este ano (previsto mês)</th></tr>';
    Object.keys(CATS).forEach(function(k){
      var prev = c.uso[k] ? ' (prev. ' + euros(c.uso[k].mes) + ')' : '';
      t += linhaTab(CATS[k], euros(real[k].mes) + ' · ' + euros(real[k].ano) + prev);
    });
    $('tabReal').innerHTML = t;
    var cont = $('listaReg'); cont.innerHTML = '';
    (d.registos || []).slice().sort(function(a, b){ return (b.data || '') < (a.data || '') ? -1 : 1; }).forEach(function(r){
      var linha = document.createElement('div'); linha.className = 'reg';
      var dd = document.createElement('div'); dd.className = 'd';
      var n = document.createElement('div'); n.textContent = r.desc || CATS[r.cat] || 'Gasto';
      var extra = '';
      if(r.kwh > 0) extra += ' · ' + r.kwh.toLocaleString('pt-PT') + ' kWh' + (r.valor > 0 ? ' (' + euros(r.valor / r.kwh) + '/kWh)' : '') + (r.local ? ' · ' + (LOCAIS[r.local] || r.local) : '');
      if(r.odo > 0) extra += ' · ' + r.odo.toLocaleString('pt-PT') + ' km';
      var m = document.createElement('div'); m.className = 'm'; m.textContent = fmtData(r.data) + ' · ' + (CATS[r.cat] || 'Outros') + extra;
      dd.appendChild(n); dd.appendChild(m);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = euros(r.valor);
      var ed = document.createElement('button'); ed.type = 'button'; ed.className = 'x'; ed.textContent = '✎'; ed.title = 'Editar';
      ed.addEventListener('click', function(){ iniciarEdicao(r); });
      var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.title = 'Remover';
      x.addEventListener('click', function(){
        if(!confirm('Remover este gasto?')) return;
        if(editId === r.id) limparForm();
        d.registos = d.registos.filter(function(y){ return y.id !== r.id; }); alterado();
      });
      if(editId === r.id) linha.style.background = 'var(--bg)';
      linha.appendChild(dd); linha.appendChild(v); linha.appendChild(ed); linha.appendChild(x); cont.appendChild(linha);
    });
    renderConsumo();

    var cal = '';
    cal += linhaTab('Sinal de ' + euros(d.sinal), d.sinalPago ? 'pago' : 'por pagar', d.sinalPago ? 'pago' : '');
    cal += linhaTab('Entrada de ' + euros(d.entrada) + ' · ' + fmtData(d.entradaData), d.entradaPaga ? 'paga' : 'por pagar', d.entradaPaga ? 'pago' : '');
    cal += linhaTab('Prestações (' + c.n + ' × cerca de ' + euros(c.totalBanco / (c.n || 1)) + ')', d.primeiraPrestacao ? (c.pagas + ' pagas · ' + (c.n - c.pagas) + ' por pagar') : 'indica a data da 1.ª prestação');
    if(d.primeiraPrestacao && c.n) cal += linhaTab('Última prestação', fmtData(addMeses(d.primeiraPrestacao, c.n - 1)));
    $('calendario').innerHTML = '<table>' + cal + '</table>';
    var p = '<tr><th>Nº · data</th><th>Prestação · em dívida</th></tr>';
    c.plano.forEach(function(r, i){
      p += '<tr><td>' + r.i + ' · ' + (d.primeiraPrestacao ? fmtData(addMeses(d.primeiraPrestacao, i)) : '—') + '</td><td>' + euros(r.pc) + ' · ' + euros(r.s) + '</td></tr>';
    });
    $('tabPrest').innerHTML = p;
  }

  function renderJuros(c){
    var n = c.n, X = verApos === null ? c.pagas : Math.min(verApos, n);
    $('verApos').max = n; $('verApos').value = X;
    $('verLabel').textContent = 'Ver depois de ' + X + ' de ' + n + ' prestações' + (d.primeiraPrestacao && X > 0 ? ' (' + fmtData(addMeses(d.primeiraPrestacao, X - 1)) + ')' : '') + (verApos === null && d.primeiraPrestacao ? ' · hoje' : '');
    var pagos = soma(c.plano.slice(0, X), 'j'), faltam = r2(c.juros - pagos);
    $('jPagos').textContent = euros(pagos); $('jFaltam').textContent = euros(faltam);
    $('jTotal').textContent = euros(c.juros); $('jDivida').textContent = euros(saldoApos(c, X));
    var p = c.juros ? pagos / c.juros * 100 : 0;
    $('jBarra').style.width = p + '%';
    $('jPct').textContent = pct(p) + ' dos juros já pagos' + (d.primeiraPrestacao ? '' : ' · indica a data da 1.ª prestação na outra aba para ver os que já pagaste, ou mexe no seletor para simular');
    // gráfico de barras: juros de cada prestação
    var W = 340, H = 150, pl = 4, pb = 18, pt = 8, bw = (W - 2 * pl) / (n || 1), max = Math.max.apply(null, c.plano.map(function(r){ return r.j; }).concat([1]));
    var svg = '<svg class="graf" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Juros de cada prestação">';
    c.plano.forEach(function(r, i){
      var h = (H - pb - pt) * r.j / max, x = pl + i * bw;
      svg += '<rect x="' + x.toFixed(2) + '" y="' + (H - pb - h).toFixed(2) + '" width="' + Math.max(1, bw - 0.8).toFixed(2) + '" height="' + h.toFixed(2) + '" style="fill:' + (i < X ? 'var(--accent)' : 'var(--muted)') + ';opacity:' + (i < X ? 1 : .5) + '"/>';
    });
    if(X > 0 && X < n) svg += '<line x1="' + (pl + X * bw).toFixed(2) + '" x2="' + (pl + X * bw).toFixed(2) + '" y1="' + pt + '" y2="' + (H - pb) + '" style="stroke:var(--fg);stroke-width:1;stroke-dasharray:3 2"/>';
    for(var a = 0; a <= Math.floor(n / 12); a++){
      var xx = pl + a * 12 * bw, fim = xx > W - 40;
      svg += '<text x="' + (fim ? W - pl : xx + 2).toFixed(1) + '" y="' + (H - 4) + '" style="fill:var(--muted);font-size:9px;text-anchor:' + (fim ? 'end' : 'start') + '">' + (a ? 'ano ' + a : '1') + '</text>';
    }
    svg += '<text x="' + pl + '" y="' + (pt + 6) + '" style="fill:var(--muted);font-size:9px">' + euros(max) + '/mês</text></svg>';
    $('grafico').innerHTML = svg;
    var t = '<tr><th>Ano</th><th class="c">Juros</th><th class="c">Capital</th><th class="c">Estado</th></tr>';
    for(var y = 1; y <= Math.ceil(n / 12); y++){
      var fatia = c.plano.slice((y - 1) * 12, y * 12);
      var est = X >= y * 12 || X >= n ? '<span class="verde">pago</span>' : (X <= (y - 1) * 12 ? 'por pagar' : 'em curso');
      t += '<tr><td>' + y + '.º</td><td class="c">' + euros(soma(fatia, 'j')) + '</td><td class="c">' + euros(soma(fatia, 'am')) + '</td><td class="c">' + est + '</td></tr>';
    }
    $('tabAnos').innerHTML = t;
  }

  // Dica (texto à parte): quando é melhor abater
  function renderDica(c){
    var box = $('abDica');
    box.innerHTML = '';
    if(!c.n){ box.hidden = true; return; }
    box.hidden = false;
    var quota = function(i){ var r = c.plano[Math.min(i, c.n) - 1]; return r ? Math.round(r.j / r.p * 100) : 0; };
    var kb = Math.max(c.kMin, Math.min(c.kMin + 36, c.n - 1)), a0 = abater(c, c.kMin, 1000), a1 = abater(c, kb, 1000);
    var p1 = document.createElement('p');
    var b = document.createElement('b'); b.textContent = '💡 Dica: ';
    p1.appendChild(b);
    p1.appendChild(document.createTextNode('a melhor altura para abater é o mais cedo possível. No início, uma parte grande da prestação é juros (' + quota(1) + '% na 1.ª, ' + quota(12) + '% na 12.ª, ' + quota(36) + '% na 36.ª e só ' + quota(60) + '% na 60.ª), por isso cada euro abatido cedo evita mais juros do que se esperares. Por exemplo, 1000 € abatidos já poupam cerca de ' + euros(a0.liqA) + ' (já descontada a comissão), e os mesmos 1000 € depois da prestação ' + kb + ' poupam ' + euros(a1.liqA) + '. A comissão (0,5% do valor abatido, mais imposto do selo) é pequena comparada com os juros evitados e desce para 0,25% no último ano, mas nessa altura já quase não há juros a poupar.'));
    var p2 = document.createElement('p');
    p2.textContent = 'Antes de abater, confirma que ficas com uma reserva para imprevistos e que esse dinheiro não rende mais do que o empréstimo custa (cerca de ' + pct(d.tan || 0) + ' ao ano, mais imposto do selo). É informação para ajudar a decidir, não aconselhamento financeiro.';
    box.appendChild(p1); box.appendChild(p2);
  }

  function renderAbater(c){
    renderDica(c);
    renderAbLista(c);
    var k = abApos === null ? Math.min(Math.max(c.pagas, c.kMin), Math.max(c.kMin, c.n - 1)) : Math.min(Math.max(c.kMin, Math.round(abApos) || 0), Math.max(c.kMin, c.n - 1));
    $('abApos').min = c.kMin;
    if(document.activeElement !== $('abApos')) $('abApos').value = k;
    if(document.activeElement !== $('abValor')) $('abValor').value = abValor > 0 ? abValor : '';
    var cont = $('abChips');
    if(!cont.childNodes.length){
      [500, 1000, 2000, 5000].forEach(function(v){
        var b = document.createElement('button'); b.type = 'button'; b.textContent = '+ ' + v + ' €';
        b.addEventListener('click', function(){ abValor = v; render(); });
        cont.appendChild(b);
      });
    }
    if(!(abValor > 0) || !c.n){ $('tabAbater').innerHTML = '<tr><td>Escreve o valor que queres abater (ou toca num dos valores acima).</td></tr>'; $('abVeredito').hidden = true; $('abTempoBloco').hidden = true; $('abRegBloco').hidden = true; return; }
    var a = abater(c, k, abValor);
    $('abRegBloco').hidden = !(a.X > 0);
    if(document.activeElement !== $('abData') && !$('abData').value) $('abData').value = hojeISO();
    var h = '<tr><th></th><th class="c">Reduzir o prazo</th><th class="c">Reduzir a prestação</th></tr>';
    h += '<tr><td>Capital em dívida (depois da prestação ' + k + ')</td><td class="c" colspan="2">' + euros(a.saldo) + '</td></tr>';
    h += '<tr><td>Valor abatido</td><td class="c" colspan="2">' + euros(a.X) + (a.X < abValor ? ' (máximo possível)' : '') + '</td></tr>';
    h += '<tr><td>Comissão (' + pct(a.taxa * 100) + ') + imposto do selo</td><td class="c" colspan="2">' + euros(a.custoCom) + '</td></tr>';
    h += '<tr><td>Fica em dívida</td><td class="c" colspan="2">' + euros(a.novo) + '</td></tr>';
    var mesesA = a.rest - a.A.meses;
    h += linha3('Prazo restante', a.A.meses + ' meses (menos ' + mesesA + ')', a.rest + ' meses (igual)');
    h += linha3('Prestação (sem imposto do selo)', euros(c.base) + ' (igual)', a.B.prest ? euros(a.B.prest) + ' (menos ' + euros(c.base - a.B.prest) + ')' : '—');
    if(d.primeiraPrestacao) h += linha3('Última prestação em', a.A.meses ? fmtData(addMeses(d.primeiraPrestacao, k + a.A.meses - 1)) : '—', a.B.meses ? fmtData(addMeses(d.primeiraPrestacao, k + a.B.meses - 1)) : '—');
    h += linha3('Juros que ainda pagarias: ' + euros(a.sem.juros) + ' → ficam em', euros(a.A.juros), euros(a.B.juros));
    h += linha3('Total que ainda pagas ao banco (com comissão)', euros(a.A.pag + a.custoCom), euros(a.B.pag + a.custoCom));
    h += '<tr><td><b>Poupança líquida</b> (juros e imposto poupados − comissão)</td><td class="c"><b class="' + (a.liqA > 0 ? 'verde' : 'verm') + '">' + euros(a.liqA) + '</b></td><td class="c"><b class="' + (a.liqB > 0 ? 'verde' : 'verm') + '">' + euros(a.liqB) + '</b></td></tr>';
    $('tabAbater').innerHTML = h;
    var melhor = a.liqA >= a.liqB ? 'reduzir o prazo' : 'reduzir a prestação', liq = Math.max(a.liqA, a.liqB);
    $('abVeredito').textContent = liq > 0
      ? 'Abatendo ' + euros(a.X) + ' poupas cerca de ' + euros(liq) + ' em juros (já descontada a comissão), mais com «' + melhor + '». Reduzir a prestação alivia o mês a mês; reduzir o prazo poupa mais juros.'
      : 'Neste caso a comissão é maior do que os juros poupados, por isso não compensa financeiramente.';
    $('abVeredito').hidden = false;

    // o mesmo valor abatido em momentos diferentes: no início as prestações são sobretudo juros, por isso poupa-se mais
    var ks = [0, 6, 12, 24, 36, 48, 60, 72, 80].filter(function(x){ return x >= c.kMin && x < c.n; });
    if(ks.indexOf(k) === -1){ ks.push(k); ks.sort(function(p, q){ return p - q; }); }
    var res = ks.map(function(x){ return { k:x, a:abater(c, x, abValor) }; });
    var maxA = Math.max.apply(null, res.map(function(r){ return r.a.liqA; }).concat([1]));
    var j1 = c.plano[0], t = '<tr><th>Abatias…</th><th class="c">Reduzir o prazo</th><th class="c">Reduzir a prestação</th></tr>';
    res.forEach(function(r){
      var q = r.k === 0 ? 'logo (antes da 1.ª prestação)' : 'depois da prestação ' + r.k + (d.primeiraPrestacao ? ' (' + fmtData(addMeses(d.primeiraPrestacao, r.k - 1)) + ')' : '');
      var larg = Math.max(0, r.a.liqA / maxA * 100), sel = r.k === k;
      t += '<tr' + (sel ? ' style="font-weight:600"' : '') + '><td>' + q + (sel ? ' ← a tua simulação' : '') + '</td><td class="c">' + euros(r.a.liqA) + '<div class="barra"><i style="width:' + larg.toFixed(0) + '%"></i></div></td><td class="c">' + euros(r.a.liqB) + '</td></tr>';
    });
    $('abTempo').innerHTML = t;
    $('abTempoTxt').textContent = 'Na 1.ª prestação, ' + euros(j1.j) + ' dos ' + euros(j1.p) + ' (' + pct(j1.j / j1.p * 100) + ') são juros; no fim quase não há juros. Por isso o mesmo abatimento poupa muito mais se for feito cedo. Poupança líquida = juros e imposto do selo evitados, menos a comissão.';
    $('abTempoBloco').hidden = false;
  }

  // Abatimentos já registados, com a poupança de cada um
  function renderAbLista(c){
    var abs = (d.abatimentos || []).slice().sort(function(a, b){ return (a.apos - b.apos) || ((a.data || '') < (b.data || '') ? -1 : 1); });
    $('abListaBloco').hidden = abs.length === 0;
    var cont = $('abLista'); cont.innerHTML = '';
    abs.forEach(function(a){
      var linha = document.createElement('div'); linha.className = 'reg';
      var dd = document.createElement('div'); dd.className = 'd';
      var n = document.createElement('div'); n.textContent = euros(a.valor) + ' · ' + (a.modo === 'prestacao' ? 'reduzir a prestação' : 'reduzir o prazo');
      var m = document.createElement('div'); m.className = 'm';
      m.textContent = 'Depois da prestação ' + a.apos + (a.data ? ' · ' + fmtData(a.data) : '') + ' · poupança líquida ' + euros(c.poupAb[a.id]);
      dd.appendChild(n); dd.appendChild(m);
      var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.title = 'Anular este abatimento';
      x.addEventListener('click', function(){
        if(!confirm('Anular este abatimento? O capital em dívida e os juros voltam a contar sem ele.')) return;
        d.abatimentos = d.abatimentos.filter(function(y){ return y.id !== a.id; }); alterado();
      });
      linha.appendChild(dd); linha.appendChild(x); cont.appendChild(linha);
    });
    if(abs.length){
      var t = document.createElement('div'); t.className = 'aviso';
      t.textContent = 'No total já abataste ' + euros(c.abatido) + ' ao capital e poupas cerca de ' + euros(c.poupanca) + ' em juros e imposto do selo (já descontadas as comissões de ' + euros(c.comissoes) + '). Capital em dívida agora: ' + euros(saldoApos(c, c.kMin)) + '.';
      cont.appendChild(t);
    }
  }

  // Gráfico de linha simples: pontos = [{ y, forma:'c'|'q', cor, dica }], ordem do tempo da esquerda para a direita
  function graficoLinha(pontos, unidade, aria, esc){
    var W = 340, H = esc ? 200 : 150, pl = 34, pr = 8, pt = 14, pb = 18;
    var ys = pontos.map(function(p){ return p.y; });
    var min = Math.min.apply(null, ys), max = Math.max.apply(null, ys);
    if(esc){ min = esc.min; max = Math.max(esc.max, Math.ceil(max / esc.passo) * esc.passo); }
    else if(max === min){ max += 1; min = Math.max(0, min - 1); }
    if(!esc){ var folga = (max - min) * 0.1; max += folga; min = Math.max(0, min - folga); }
    var marcas = [];
    if(esc){ for(var v = min + esc.passo; v <= max + 1e-9; v += esc.passo) marcas.push(Math.round(v * 1000) / 1000); marcas.unshift(min); }
    else marcas = [min, (min + max) / 2, max];
    function X(i){ return pontos.length === 1 ? (pl + W - pr) / 2 : pl + i * (W - pl - pr) / (pontos.length - 1); }
    function Y(v){ return pt + (H - pt - pb) * (1 - (v - min) / (max - min)); }
    var s = '<svg class="graf" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + aria + '">';
    marcas.forEach(function(v){
      s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" style="stroke:var(--border);stroke-width:1"/>' +
        '<text x="' + (pl - 4) + '" y="' + (Y(v) + 3).toFixed(1) + '" style="fill:var(--muted);font-size:9px;text-anchor:end">' + v.toLocaleString('pt-PT', { minimumFractionDigits: esc ? 2 : 0, maximumFractionDigits:2 }) + '</text>';
    });
    if(pontos.length > 1) s += '<polyline fill="none" style="stroke:var(--muted);stroke-width:1.2;opacity:.6" points="' + pontos.map(function(p, i){ return X(i).toFixed(1) + ',' + Y(p.y).toFixed(1); }).join(' ') + '"/>';
    pontos.forEach(function(p, i){
      var x = X(i), y = Y(p.y), t = '<title>' + p.dica + '</title>';
      s += p.forma === 'q'
        ? '<rect x="' + (x - 4).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" width="8" height="8" style="fill:' + p.cor + '">' + t + '</rect>'
        : '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5" style="fill:' + p.cor + '">' + t + '</circle>';
    });
    s += '<text x="' + pl + '" y="' + (H - 4) + '" style="fill:var(--muted);font-size:9px">' + pontos[0].rot + '</text>';
    s += '<text x="' + (W - pr) + '" y="' + (H - 4) + '" style="fill:var(--muted);font-size:9px;text-anchor:end">' + pontos[pontos.length - 1].rot + '</text>';
    s += '<text x="' + pl + '" y="9" style="fill:var(--muted);font-size:9px">' + unidade + '</text></svg>';
    return s;
  }
  function renderGraficosConsumo(en){
    var porData = en.slice().sort(function(a, b){ return (a.data || '') < (b.data || '') ? -1 : (a.data || '') > (b.data || '') ? 1 : 0; });
    var cores = { casa:'var(--ok)', publico:'var(--accent)', trabalho:'var(--fg)', outro:'var(--muted)' };
    var formas = { casa:'c', publico:'q', trabalho:'c', outro:'q' };
    // consumo aos 100 km: cada carregamento repõe a energia gasta desde o anterior com quilómetros
    var oc = porData.filter(function(r){ return r.odo > 0; }).sort(function(a, b){ return a.odo - b.odo; }), seg = [];
    for(var i = 1; i < oc.length; i++){
      var km = oc[i].odo - oc[i - 1].odo;
      if(km > 0) seg.push({ y: oc[i].kwh / km * 100, forma:'c', cor:'var(--accent)', rot: fmtData(oc[i].data).slice(0, 5), dica: fmtData(oc[i].data) + ': ' + (oc[i].kwh / km * 100).toLocaleString('pt-PT', { maximumFractionDigits:1 }) + ' kWh/100 km (' + km.toLocaleString('pt-PT') + ' km)' });
    }
    $('grafConsumo').innerHTML = seg.length
      ? '<h2 style="font-size:.98rem;margin:18px 0 0">Consumo ao longo do tempo</h2>' + graficoLinha(seg, 'kWh/100 km', 'Consumo em kWh aos 100 km por carregamento')
      : '';
    var preco = porData.filter(function(r){ return r.valor > 0; }).map(function(r){
      var l = r.local || 'outro';
      return { y: r.valor / r.kwh, forma: formas[l] || 'q', cor: cores[l] || 'var(--muted)', rot: fmtData(r.data).slice(0, 5), dica: fmtData(r.data) + ' · ' + (LOCAIS[l] || l) + ': ' + euros(r.valor / r.kwh) + '/kWh' };
    });
    $('grafPreco').innerHTML = preco.length
      ? '<h2 style="font-size:.98rem;margin:18px 0 0">Preço por kWh (casa vs. posto público)</h2>' + graficoLinha(preco, '€/kWh', 'Preço por kWh de cada carregamento', { min:0, max:0.5, passo:0.05 }) +
        '<div class="legenda"><span><b style="background:var(--ok);border-radius:50%"></b>Casa</span><span><b style="background:var(--accent)"></b>Posto público</span><span><b style="background:var(--fg);border-radius:50%"></b>Trabalho</span><span><b style="background:var(--muted)"></b>Outro</span></div>'
      : '';
  }

  // Consumo real a partir dos carregamentos (kWh, local, quilómetros)
  function renderConsumo(){
    var en = (d.registos || []).filter(function(r){ return r.cat === 'energia' && r.kwh > 0; });
    $('grafConsumo').innerHTML = ''; $('grafPreco').innerHTML = '';
    if(!en.length){ $('tabConsumo').innerHTML = '<tr><td>Ainda não registaste carregamentos com kWh.</td></tr>'; return; }
    renderGraficosConsumo(en);
    var kwh = 0, eur = 0, loc = {};
    en.forEach(function(r){
      kwh += r.kwh; eur += r.valor;
      var l = loc[r.local || 'outro'] = loc[r.local || 'outro'] || { kwh:0, eur:0 };
      l.kwh += r.kwh; l.eur += r.valor;
    });
    var t = linhaTab('Carregamentos registados', String(en.length));
    t += linhaTab('Total carregado', kwh.toLocaleString('pt-PT', { maximumFractionDigits:1 }) + ' kWh · ' + euros(eur));
    t += linhaTab('Preço médio', euros(eur / kwh) + '/kWh');
    Object.keys(loc).forEach(function(k){
      t += linhaTab('&nbsp;&nbsp;' + (LOCAIS[k] || k), loc[k].kwh.toLocaleString('pt-PT', { maximumFractionDigits:1 }) + ' kWh · ' + euros(loc[k].eur) + ' · ' + euros(loc[k].eur / loc[k].kwh) + '/kWh');
    });
    // o 1.º carregamento com quilómetros só marca o ponto de partida; os seguintes repõem a energia gasta desde o anterior
    var oc = en.filter(function(r){ return r.odo > 0; }).sort(function(a, b){ return a.odo - b.odo; });
    if(oc.length >= 2 && oc[oc.length - 1].odo > oc[0].odo){
      var km = oc[oc.length - 1].odo - oc[0].odo, k2 = 0, e2 = 0;
      oc.slice(1).forEach(function(r){ k2 += r.kwh; e2 += r.valor; });
      t += linhaTab('Quilómetros entre o 1.º e o último registo', km.toLocaleString('pt-PT') + ' km');
      t += linhaTab('<b>Consumo real</b>', '<b>' + (k2 / km * 100).toLocaleString('pt-PT', { maximumFractionDigits:1 }) + ' kWh/100 km</b>');
      t += linhaTab('<b>Custo de energia</b>', '<b>' + euros(e2 / km * 100) + '/100 km · ' + euros(e2 / km) + '/km</b>');
    } else {
      t += '<tr><td colspan="2" class="nota">Regista os quilómetros do carro em pelo menos dois carregamentos para ver o consumo aos 100 km.</td></tr>';
    }
    $('tabConsumo').innerHTML = t;
  }

  // Formulário de gastos: adicionar ou editar
  function limparForm(){
    editId = null;
    $('rValor').value = ''; $('rDesc').value = ''; $('rKwh').value = ''; $('rOdo').value = ''; $('rData').value = hojeISO();
    $('rAdd').textContent = 'Adicionar gasto'; $('rCancel').hidden = true;
    mostrarEnergia();
  }
  function mostrarEnergia(){ $('rEnergia').hidden = $('rCat').value !== 'energia'; }
  function iniciarEdicao(r){
    editId = r.id;
    $('rCat').value = CATS[r.cat] ? r.cat : 'outros'; $('rData').value = r.data || hojeISO(); $('rDesc').value = r.desc || '';
    $('rValor').value = r.valor; $('rKwh').value = r.kwh > 0 ? r.kwh : ''; $('rLocal').value = r.local || 'casa'; $('rOdo').value = r.odo > 0 ? r.odo : '';
    $('rAdd').textContent = 'Guardar alterações'; $('rCancel').hidden = false;
    mostrarEnergia(); render();
    $('rCat').scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function render(){
    var c = calcular();
    renderCarro(c); renderJuros(c); renderAbater(c);
  }
  function preencher(){
    document.querySelectorAll('[data-k]').forEach(function(el){
      var k = el.getAttribute('data-k'), v = get(d, k);
      var vazioSeZero = /^(seguro|manutencao|energia)\.valor$|^kmAno$/.test(k);
      if(el.type === 'checkbox') el.checked = !!v;
      else el.value = (v === undefined || v === null || (vazioSeZero && v === 0)) ? '' : v;
    });
  }
  function montarCustos(){
    var cont = $('custos');
    CUSTOS.forEach(function(x){
      var b = document.createElement('div'); b.className = 'custo-bloco';
      b.innerHTML = '<div class="custo"><div class="campo"><label for="v-' + x[0] + '">' + x[1] + ' (€)</label><input type="number" id="v-' + x[0] + '" data-k="' + x[0] + '.valor" inputmode="decimal" step="0.01"></div>' +
        '<div class="campo"><label for="p-' + x[0] + '">Por</label><select id="p-' + x[0] + '" data-k="' + x[0] + '.periodo"><option value="mensal">mês</option><option value="anual">ano</option></select></div></div>' +
        '<div class="eq" id="eq-' + x[0] + '"></div>';
      cont.appendChild(b);
    });
  }
  function mostrarAba(a){
    $('viewCarro').hidden = a !== 'carro'; $('viewJuros').hidden = a !== 'juros';
    $('tabCarro').classList.toggle('ativo', a === 'carro'); $('tabJuros').classList.toggle('ativo', a === 'juros');
  }

  // ---------- guardar / carregar ----------
  function estado(txt, erro){ $('estado').textContent = txt; $('estado').className = 'estado' + (erro ? ' erro' : ''); }
  function alterado(){
    render(); sujo = true; estado('A guardar…');
    clearTimeout(guardarTimer); guardarTimer = setTimeout(guardar, 600);
  }
  function aplicarServidor(dados){
    var ini = padrao();
    d = Object.assign(padrao(), dados || {});
    if(dados && !('pedido' in dados)){        // dados da versão antiga: atualiza o financiamento com os valores da ficha do banco
      CAMPOS_FIN.forEach(function(k){ d[k] = ini[k]; });
      delete d.totalBanco;
    }
  }
  async function guardar(){
    if(aGuardar){ guardarTimer = setTimeout(guardar, 400); return; }
    aGuardar = true; sujo = false;
    try{
      var r = await fetch('/api/carro', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ versao: versao, dados: d }) });
      var j = {}; try{ j = await r.json(); }catch(e){}
      if(r.ok){ versao = j.versao; estado(sujo ? 'A guardar…' : 'Guardado'); }
      else if(r.status === 409 && j.dados){
        versao = j.versao; aplicarServidor(j.dados); preencher(); render();
        estado('Outra pessoa alterou entretanto: mostrei a versão mais recente. Repete a tua alteração, se for preciso.', true);
        sujo = false;
      } else throw new Error(j.erro || ('HTTP ' + r.status));
    }catch(e){ estado('Não foi possível guardar (' + (e.message || e) + '). Tenta de novo.', true); sujo = true; }
    aGuardar = false;
    if(sujo && !guardarTimer) guardarTimer = setTimeout(guardar, 3000);
  }
  async function carregar(){
    try{
      var r = await fetch('/api/carro', { cache:'no-store' });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      var j = await r.json();
      versao = j.versao || 0;
      var antigo = j.dados && !('pedido' in j.dados);
      aplicarServidor(j.dados);
      estado(j.dados ? (antigo ? 'A atualizar o financiamento para os valores da ficha do banco…' : 'Guardado') : 'Valores iniciais (ainda não guardados)');
      if(antigo) alterado();
    }catch(e){ estado('Não foi possível ler os dados (' + (e.message || e) + '). Não alteres nada até voltar a ligação.', true); }
    preencher(); render();
  }

  montarCustos();
  document.addEventListener('input', function(e){
    var el = e.target;
    if(el.id === 'verApos'){ verApos = parseInt(el.value, 10) || 0; render(); return; }
    if(el.id === 'abValor'){ abValor = parseFloat(el.value) || 0; render(); return; }
    if(el.id === 'abApos'){ abApos = el.value === '' ? null : parseInt(el.value, 10); render(); return; }
    var k = el.getAttribute && el.getAttribute('data-k');
    if(!k) return;
    var v = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? (el.value === '' ? 0 : parseFloat(el.value)) : el.value);
    if(el.type === 'number' && isNaN(v)) v = 0;
    set(d, k, v); alterado();
  });
  document.addEventListener('change', function(e){
    var el = e.target, k = el.getAttribute && el.getAttribute('data-k');
    if(!k || el.type === 'number') return;
    set(d, k, el.type === 'checkbox' ? el.checked : el.value); alterado();
  });
  $('tabCarro').addEventListener('click', function(){ mostrarAba('carro'); });
  $('tabJuros').addEventListener('click', function(){ mostrarAba('juros'); });
  $('rData').value = hojeISO();
  $('rAdd').addEventListener('click', function(){
    var v = parseFloat($('rValor').value);
    if(!(v > 0)){ $('rValor').focus(); return; }
    d.registos = d.registos || [];
    var reg = { id: editId || 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), cat: $('rCat').value, desc: $('rDesc').value.trim(), valor: v, data: $('rData').value || hojeISO() };
    var kwh = parseFloat($('rKwh').value), odo = parseFloat($('rOdo').value);
    if(reg.cat === 'energia'){
      if(kwh > 0){ reg.kwh = kwh; reg.local = $('rLocal').value; }
      if(odo > 0) reg.odo = Math.round(odo);
    }
    var i = editId ? d.registos.findIndex(function(y){ return y.id === editId; }) : -1;
    if(i >= 0) d.registos[i] = reg; else d.registos.push(reg);
    limparForm();
    alterado();
  });
  $('rCancel').addEventListener('click', function(){ limparForm(); render(); });
  $('rCat').addEventListener('change', mostrarEnergia);
  $('abRegistar').addEventListener('click', function(){
    var c = calcular(), k = abApos === null ? Math.min(Math.max(c.pagas, c.kMin), Math.max(c.kMin, c.n - 1)) : Math.min(Math.max(c.kMin, Math.round(abApos) || 0), Math.max(c.kMin, c.n - 1));
    var a = abater(c, k, abValor);
    if(!(a.X > 0)) return;
    if(!confirm('Registar o abatimento de ' + euros(a.X) + ' depois da prestação ' + k + '? A comissão estimada é ' + euros(a.custoCom) + '.')) return;
    d.abatimentos = d.abatimentos || [];
    d.abatimentos.push({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), apos: k, valor: a.X, modo: $('abModo').value, data: $('abData').value || hojeISO() });
    abValor = 0; abApos = null; $('abData').value = '';
    alterado();
  });
  window.addEventListener('pagehide', function(){
    if(sujo){ try{ fetch('/api/carro', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ versao: versao, dados: d }), keepalive: true }); }catch(e){} }
  });
  carregar();
})();
