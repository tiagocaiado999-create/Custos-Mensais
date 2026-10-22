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
    var cats = CATEGORIAS.filter(function(c){ return atual[c.id] || ant[c.id]; })
      .sort(function(a, b){ return (atual[b.id] || 0) - (atual[a.id] || 0); });
    if(cats.length === 0){ wrap.innerHTML = '<div class="vazio">Sem lançamentos neste mês.</div>'; return; }
    var total = 0, max = 0;
    cats.forEach(function(c){ total += atual[c.id] || 0; max = Math.max(max, atual[c.id] || 0, ant[c.id] || 0); });
    wrap.innerHTML = '';
    cats.forEach(function(c){
      var v = atual[c.id] || 0, p = ant[c.id] || 0, d = v - p;
      var pct = total > 0 ? Math.round(v / total * 100) : 0;
      var cmp = p === 0 ? 'sem gastos em ' + mesesAbrev[m2].toLowerCase()
        : (Math.abs(d) < 0.005 ? 'igual a ' + mesesAbrev[m2].toLowerCase() : (d > 0 ? '+' : '−') + euros(Math.abs(d)) + ' vs ' + mesesAbrev[m2].toLowerCase());
      var cls = p === 0 || Math.abs(d) < 0.005 ? '' : (d > 0 ? ' sobe' : ' desce');
      var linha = document.createElement('div');
      linha.className = 'cat-linha';
      linha.innerHTML = '<div class="cat-linha-topo"><span class="cat-linha-nome">' + c.nome + '</span><span class="cat-linha-valor">' + euros(v) + ' · ' + pct + '%</span></div>' +
        '<div class="cat-barra"><i style="width:' + (max ? v / max * 100 : 0) + '%"></i>' + (p ? '<b title="' + mesesAbrev[m2] + '" style="left:' + (p / max * 100) + '%"></b>' : '') + '</div>' +
        '<div class="cat-cmp' + cls + '">' + cmp + '</div>';
      wrap.appendChild(linha);
    });
    var rodape = document.createElement('div');
    rodape.className = 'cat-legenda';
    rodape.textContent = 'A marca vertical é o valor do mês anterior.';
    wrap.appendChild(rodape);
  }
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
    var lista = todosLancamentos(pessoaAtual).filter(function(i){
      if(per === 'ano' && i.ano !== anoAtual) return false;
      if(per === 'mes' && (i.ano !== anoAtual || i.mes !== mesAtual)) return false;
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
  ['pesqTexto','pesqCat','pesqPeriodo'].forEach(function(id){
    byId(id).addEventListener(id === 'pesqTexto' ? 'input' : 'change', renderPesquisa);
  });

