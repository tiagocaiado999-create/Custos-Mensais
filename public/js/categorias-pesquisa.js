// @ts-check
  // ---------- Gráfico por categoria (com comparação ao mês anterior) ----------
  var catTipo = 'todos';
  /** Elemento da página pelo id. Devolve `any`: cada id tem o seu tipo (input, video…) e o TypeScript não o sabe. @param {string} id @returns {any} */
  function byId(id){ return document.getElementById(id); }
  function itensDoMes(pessoa, ano, mes, tipo){
    var v = vistaMes(pessoa, ano, mes);
    return tipo === 'fixo' ? v.fixo : (tipo === 'opcional' ? v.opcional : v.fixo.concat(v.opcional));
  }
  function totaisPorCategoria(itens){
    var t = {};
    itens.forEach(function(i){ var c = i.categoria || 'outros'; t[c] = (t[c] || 0) + (Number(i.valor) || 0); });
    return t;
  }
  function renderCategorias(){
    var m2 = mesAtual - 1, a2 = anoAtual;
    if(m2 < 0){ m2 = 11; a2--; }
    var atual = totaisPorCategoria(itensDoMes(pessoaAtual, anoAtual, mesAtual, catTipo));
    var ant = totaisPorCategoria(itensDoMes(pessoaAtual, a2, m2, catTipo));
    byId('catTitulo').textContent = 'Por categoria — ' + nomesPessoa[pessoaAtual] + ' — ' + meses[mesAtual] + ' ' + anoAtual;
    var wrap = byId('catGraficoWrap');
    // os orçamentos são limites ao total da categoria (fixos + opcionais): só se mostram na vista "Tudo"
    var orc = catTipo === 'todos' ? orcamentosDe(pessoaAtual) : {};
    var cats = CATEGORIAS.filter(function(c){ return atual[c.id] || ant[c.id] || orc[c.id]; })
      .sort(function(a, b){ return (atual[b.id] || 0) - (atual[a.id] || 0); });
    renderOrcEditor();
    if(cats.length === 0){ wrap.innerHTML = '<div class="vazio">Sem lançamentos neste mês.</div>'; return; }
    var total = 0, max = 0;
    cats.forEach(function(c){ total += atual[c.id] || 0; max = Math.max(max, atual[c.id] || 0, ant[c.id] || 0, orc[c.id] || 0); });
    wrap.innerHTML = '';
    cats.forEach(function(c){
      var v = atual[c.id] || 0, p = ant[c.id] || 0, d = v - p;
      var pct = total > 0 ? Math.round(v / total * 100) : 0;
      var cmp = p === 0 ? 'sem gastos em ' + mesesAbrev[m2].toLowerCase()
        : (Math.abs(d) < 0.005 ? 'igual a ' + mesesAbrev[m2].toLowerCase() : (d > 0 ? '+' : '−') + euros(Math.abs(d)) + ' vs ' + mesesAbrev[m2].toLowerCase());
      var cls = p === 0 || Math.abs(d) < 0.005 ? '' : (d > 0 ? ' sobe' : ' desce');
      var eo = estadoOrcamento(v, orc[c.id]), orcHtml = '';
      if(eo){
        orcHtml = '<div class="cat-orc ' + eo.estado + '">' + (eo.estado === 'acima'
          ? 'Orçamento de ' + euros(eo.limite) + ' ultrapassado em ' + euros(-eo.resto)
          : eo.pct + '% do orçamento de ' + euros(eo.limite) + ' · ' + (eo.estado === 'perto' ? 'só ' : '') + 'sobram ' + euros(eo.resto)) + '</div>';
      }
      var linha = document.createElement('div');
      linha.className = 'cat-linha';
      // só texto fixo do código e números: nada aqui é escrito pelo utilizador
      linha.innerHTML = '<div class="cat-linha-topo"><span class="cat-linha-nome">' + c.nome + '</span><span class="cat-linha-valor">' + euros(v) + ' · ' + pct + '%</span></div>' +
        '<div class="cat-barra' + (eo ? ' ' + eo.estado : '') + '"><i style="width:' + (max ? v / max * 100 : 0) + '%"></i>' + (p ? '<b title="' + mesesAbrev[m2] + '" style="left:' + (p / max * 100) + '%"></b>' : '') +
        (eo ? '<u title="Orçamento" style="left:' + (eo.limite / max * 100) + '%"></u>' : '') + '</div>' +
        '<div class="cat-cmp' + cls + '">' + cmp + '</div>' + orcHtml;
      wrap.appendChild(linha);
    });
    var rodape = document.createElement('div');
    rodape.className = 'cat-legenda';
    rodape.textContent = 'A marca vertical é o valor do mês anterior.' + (Object.keys(orc).length ? ' A marca tracejada é o orçamento.' : '');
    wrap.appendChild(rodape);
  }

  // ---------- Orçamentos por categoria (limite mensal; ver estadoOrcamento em nucleo.js) ----------
  function orcamentosDe(pessoa){
    if(!dados.orcamentos) dados.orcamentos = { tiago:{}, claudia:{}, casal:{} };
    if(!dados.orcamentos[pessoa]) dados.orcamentos[pessoa] = {};
    return dados.orcamentos[pessoa];
  }
  var orcAberto = false;
  function renderOrcEditor(){
    var btn = byId('orcAbrir'), ed = byId('orcEditor');
    if(!btn || !ed) return;
    var orc = orcamentosDe(pessoaAtual), n = Object.keys(orc).length;
    btn.textContent = (orcAberto ? 'Fechar orçamentos' : 'Orçamentos por categoria') + (n && !orcAberto ? ' (' + n + ')' : '');
    btn.setAttribute('aria-expanded', orcAberto ? 'true' : 'false');
    ed.hidden = !orcAberto;
    // enquanto se escreve num limite não se redesenha o editor (perdia-se o cursor); só o gráfico acima é atualizado
    if(!orcAberto || (ed.contains(document.activeElement) && ed.getAttribute('data-p') === pessoaAtual)) return;
    ed.setAttribute('data-p', pessoaAtual);
    ed.innerHTML = '';
    var nota = document.createElement('p');
    nota.className = 'orc-nota';
    nota.textContent = 'Limite por mês para ' + (pessoaAtual === 'casal' ? 'o casal (os dois juntos)' : nomesPessoa[pessoaAtual]) + '. Deixa vazio para não ter limite.';
    ed.appendChild(nota);
    CATEGORIAS.forEach(function(c){
      var linha = document.createElement('label');
      linha.className = 'orc-linha';
      var nome = document.createElement('span');
      nome.className = 'orc-nome';
      nome.innerHTML = iconeCategoria(c.id);   // ícone fixo do código
      nome.appendChild(document.createTextNode(c.nome));
      var campo = document.createElement('span');
      campo.className = 'orc-campo';
      var inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.step = '1'; inp.inputMode = 'decimal'; inp.placeholder = 'sem limite';
      inp.value = orc[c.id] ? String(orc[c.id]) : '';
      var pessoa = pessoaAtual;
      inp.addEventListener('input', function(){
        var v = Math.round(parseFloat(inp.value) * 100) / 100, o = orcamentosDe(pessoa);
        if(v > 0) o[c.id] = v; else delete o[c.id];
        guardar();
        renderCategorias();
        renderResumoFrases();
      });
      campo.appendChild(inp);
      campo.appendChild(document.createTextNode(' €'));
      linha.appendChild(nome); linha.appendChild(campo);
      ed.appendChild(linha);
    });
  }
  if(byId('orcAbrir')) byId('orcAbrir').addEventListener('click', function(){ orcAberto = !orcAberto; renderOrcEditor(); });
  Array.prototype.forEach.call(document.querySelectorAll('#catTipos button'), function(b){
    b.addEventListener('click', function(){
      catTipo = b.getAttribute('data-t');
      Array.prototype.forEach.call(document.querySelectorAll('#catTipos button'), function(x){ x.classList.toggle('ativo', x === b); });
      renderCategorias();
    });
  });

  // ---------- Pesquisar ----------
  function semAcentos(t){ return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function todosLancamentos(pessoa){
    var chaves = {}, out = [];
    ['tiago','claudia','casalOpcional'].forEach(function(p){ Object.keys(dados[p]).forEach(function(k){ chaves[k] = 1; }); });
    Object.keys(chaves).sort().forEach(function(k){
      var ano = parseInt(k.slice(0, 4), 10), mes = parseInt(k.slice(5, 7), 10) - 1;
      var v = vistaMes(pessoa, ano, mes);
      ['fixo','opcional'].forEach(function(tipo){
        v[tipo].forEach(function(i){
          out.push({ ano: ano, mes: mes, tipo: tipo, nome: i.nome || '', valor: Number(i.valor) || 0, categoria: i.categoria || 'outros', data: i.data || '', origem: i.origem || null });
        });
      });
    });
    return out;
  }
  function dataLonga(i){
    if(i.data){ var p = i.data.split('-'); if(p.length === 3) return p[2] + '/' + p[1] + '/' + p[0]; }
    return mesesAbrev[i.mes] + ' ' + i.ano;
  }
  var pesqResultados = [];
  function renderPesquisa(){
    var selCat = byId('pesqCat');
    if(selCat.options.length === 1){
      CATEGORIAS.forEach(function(c){ var o = document.createElement('option'); o.value = c.id; o.textContent = c.nome; selCat.appendChild(o); });
    }
    var texto = semAcentos(byId('pesqTexto').value.trim());
    var cat = selCat.value, per = byId('pesqPeriodo').value;
    // pesquisa avançada: intervalo de datas (inclusivo) e de valores (inclusivo); com datas escolhidas o período acima deixa de contar
    var de = byId('pesqDe').value, ate = byId('pesqAte').value;
    if(de && ate && de > ate){ var tmp = de; de = ate; ate = tmp; }   // datas trocadas: corrige sozinho
    var minTxt = byId('pesqMin').value, maxTxt = byId('pesqMax').value;
    var vMin = minTxt === '' ? null : parseFloat(minTxt), vMax = maxTxt === '' ? null : parseFloat(maxTxt);
    if(vMin !== null && vMax !== null && vMin > vMax){ var t2 = vMin; vMin = vMax; vMax = t2; }
    var lista = todosLancamentos(pessoaAtual).filter(function(i){
      if(de || ate){
        var d = i.data || (i.ano + '-' + String(i.mes + 1).padStart(2, '0') + '-01');   // sem data: conta como dia 1 do mês
        if(de && d < de) return false;
        if(ate && d > ate) return false;
      } else {
        if(per === 'ano' && i.ano !== anoAtual) return false;
        if(per === 'mes' && (i.ano !== anoAtual || i.mes !== mesAtual)) return false;
      }
      if(vMin !== null && !isNaN(vMin) && i.valor < vMin - 0.0001) return false;
      if(vMax !== null && !isNaN(vMax) && i.valor > vMax + 0.0001) return false;
      if(cat !== 'todas' && i.categoria !== cat) return false;
      return !texto || semAcentos(i.nome).indexOf(texto) !== -1;
    });
    lista.sort(function(a, b){
      var da = a.data || (a.ano + '-' + String(a.mes + 1).padStart(2, '0') + '-01'), db = b.data || (b.ano + '-' + String(b.mes + 1).padStart(2, '0') + '-01');
      return da < db ? 1 : (da > db ? -1 : 0);
    });
    pesqResultados = lista;
    var total = lista.reduce(function(s, i){ return s + i.valor; }, 0);
    var mesesDistintos = {};
    lista.forEach(function(i){ mesesDistintos[i.ano + '-' + i.mes] = 1; });
    var nMeses = Object.keys(mesesDistintos).length;
    byId('pesqResumo').textContent = lista.length + (lista.length === 1 ? ' lançamento' : ' lançamentos') + ' · ' + euros(total) +
      (nMeses > 1 ? ' · média ' + euros(total / nMeses) + '/mês' : '');
    var cont = byId('pesqLista');
    cont.innerHTML = '';
    if(lista.length === 0){ cont.innerHTML = '<div class="vazio">Nada encontrado.</div>'; }
    lista.slice(0, 200).forEach(function(i){
      var row = document.createElement('div');
      row.className = 'pesq-linha';
      row.tabIndex = 0;
      var esq = document.createElement('div');
      var nome = document.createElement('div');
      nome.className = 'pesq-nome';
      nome.textContent = i.nome;
      var meta = document.createElement('div');
      meta.className = 'pesq-meta';
      meta.textContent = dataLonga(i) + ' · ' + nomeCategoria(i.categoria) + ' · ' + (i.tipo === 'fixo' ? 'fixo' : 'opcional') + (i.origem ? ' · ' + nomesPessoa[i.origem] : '');
      esq.appendChild(nome); esq.appendChild(meta);
      var val = document.createElement('div');
      val.className = 'pesq-valor';
      val.textContent = euros(i.valor);
      row.appendChild(esq); row.appendChild(val);
      function ir(){ anoAtual = i.ano; mesAtual = i.mes; mostrarTab('extrato'); renderTudo(); window.scrollTo(0, 0); }
      row.addEventListener('click', ir);
      row.addEventListener('keydown', function(e){ if(e.key === 'Enter') ir(); });
      cont.appendChild(row);
    });
    if(lista.length > 200){
      var mais = document.createElement('div');
      mais.className = 'vazio';
      mais.textContent = 'A mostrar os 200 mais recentes. Refina a pesquisa ou exporta para ver todos.';
      cont.appendChild(mais);
    }
  }
  ['pesqTexto','pesqCat','pesqPeriodo','pesqDe','pesqAte','pesqMin','pesqMax'].forEach(function(id){
    byId(id).addEventListener(id === 'pesqTexto' || id === 'pesqMin' || id === 'pesqMax' ? 'input' : 'change', renderPesquisa);
  });
  byId('pesqLimpar').addEventListener('click', function(){
    ['pesqDe','pesqAte','pesqMin','pesqMax'].forEach(function(id){ byId(id).value = ''; });
    renderPesquisa();
  });

