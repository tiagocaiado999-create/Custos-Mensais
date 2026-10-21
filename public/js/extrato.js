  var dados = dadosDefault;

  function mesPessoa(pessoa, ano, mes){
    var k = chave(ano, mes);
    if(!dados[pessoa][k]) dados[pessoa][k] = mesVazio();
    return dados[pessoa][k];
  }
  function casalOpcionalMes(ano, mes){
    var k = chave(ano, mes);
    if(!dados.casalOpcional[k]) dados.casalOpcional[k] = { opcional: [], poupanca: [], investido: [] };
    return dados.casalOpcional[k];
  }

  // Devolve uma vista combinada { salario, fixo:[{nome,valor,origem}], opcional:[...] } para qualquer pessoa,
  // incluindo 'casal' (soma de tiago+cláudia + opcionais próprios do casal).
  function vistaMes(pessoa, ano, mes){
    function mapa(lista, origem){
      return (lista || []).map(function(i){ return { id:i.id, nome:i.nome, valor:i.valor, categoria:i.categoria, data:i.data, anexo:i.anexo, origem:origem }; });
    }
    if(pessoa === 'casal'){
      var t = mesPessoa('tiago', ano, mes), c = mesPessoa('claudia', ano, mes), extra = casalOpcionalMes(ano, mes);
      return {
        salario: (t.salario||0) + (c.salario||0),
        fixo: mapa(t.fixo, 'tiago').concat(mapa(c.fixo, 'claudia')),
        opcional: mapa(t.opcional, 'tiago').concat(mapa(c.opcional, 'claudia')).concat(mapa(extra.opcional, null)),
        poupanca: mapa(t.poupanca, 'tiago').concat(mapa(c.poupanca, 'claudia')).concat(mapa(extra.poupanca, null)),
        investido: mapa(t.investido, 'tiago').concat(mapa(c.investido, 'claudia')).concat(mapa(extra.investido, null))
      };
    }
    var m = mesPessoa(pessoa, ano, mes);
    return { salario: m.salario, fixo: mapa(m.fixo, undefined), opcional: mapa(m.opcional, undefined), poupanca: mapa(m.poupanca, undefined), investido: mapa(m.investido, undefined) };
  }

  function renderNav(){
    document.getElementById('mesAtualLabel').textContent =
      meses[mesAtual].charAt(0).toUpperCase() + meses[mesAtual].slice(1) + ' ' + anoAtual;
  }

  function renderSalarioBox(){
    var box = document.getElementById('salarioBox');
    box.innerHTML = '';
    if(pessoaAtual === 'casal'){
      var v = vistaMes('casal', anoAtual, mesAtual);
      box.innerHTML = '<label>Salário combinado</label><div class="val-combinado">' + euros(v.salario) + '</div>';
      return;
    }
    var label = document.createElement('label');
    label.textContent = 'Salário recebido';
    var wrap = document.createElement('div');
    wrap.className = 'valor-wrap';
    var span = document.createElement('span');
    span.textContent = '€';
    var input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.placeholder = '0,00';
    var pSal = pessoaAtual, aSal = anoAtual, mSal = mesAtual;
    input.value = mesPessoa(pSal, aSal, mSal).salario || '';
    input.oninput = function(){
      mesPessoa(pSal, aSal, mSal).salario = parseFloat(input.value) || 0;
      guardar();
      atualizarTotaisMes();
    };
    wrap.appendChild(span);
    wrap.appendChild(input);
    box.appendChild(label);
    box.appendChild(wrap);
  }

  function copiarFixosDoMesAnterior(){
    var m = mesAtual - 1, a = anoAtual;
    if(m < 0){ m = 11; a = anoAtual - 1; }
    var anterior = dados[pessoaAtual][chave(a, m)];
    if(!anterior || anterior.fixo.length === 0) return;
    var atual = mesPessoa(pessoaAtual, anoAtual, mesAtual);
    atual.fixo = anterior.fixo.map(function(item){ return { id: uid(), nome: item.nome, valor: item.valor, categoria: item.categoria || 'outros', data: hojeISO() }; });
    guardar();
    renderTudo();
  }

  function renderSecao(containerId, chaveTipo, titulo, tipoClasse){
    var container = document.getElementById(containerId);
    container.innerHTML = '';
    var vista = vistaMes(pessoaAtual, anoAtual, mesAtual);
    var lista = vista[chaveTipo];
    var subtotal = somaLista(lista);
    var casalFixoReadonly = (pessoaAtual === 'casal' && chaveTipo === 'fixo');

    var box = document.createElement('div');
    box.className = 'extrato';

    var head = document.createElement('div');
    head.className = 'extrato-head';
    head.innerHTML = '<div class="tipo"><span class="dot ' + tipoClasse + '"></span>' + titulo + '</div><div class="subtotal">' + euros(subtotal) + '</div>';
    box.appendChild(head);

    if(lista.length === 0){
      var vazio = document.createElement('div');
      vazio.className = 'vazio';
      var texto = document.createElement('span');
      texto.textContent = 'Sem lançamentos ainda.';
      vazio.appendChild(texto);
      if(chaveTipo === 'fixo' && pessoaAtual !== 'casal'){
        var m0 = mesAtual - 1, a0 = anoAtual;
        if(m0 < 0){ m0 = 11; a0 = anoAtual - 1; }
        var anterior = dados[pessoaAtual][chave(a0, m0)];
        if(anterior && anterior.fixo.length > 0){
          var copiarBtn = document.createElement('button');
          copiarBtn.textContent = 'Copiar fixos do mês anterior';
          copiarBtn.addEventListener('click', copiarFixosDoMesAnterior);
          vazio.appendChild(copiarBtn);
        }
      }
      box.appendChild(vazio);
    }

    function criarLinha(item){
      var row = document.createElement('div');
      row.className = 'linha';
      var readonly = casalFixoReadonly || (pessoaAtual === 'casal' && item.origem);

      var topo = document.createElement('div');
      topo.className = 'linha-topo';

      if(item.origem){
        var tag = document.createElement('span');
        tag.className = 'tag ' + item.origem;
        tag.textContent = item.origem === 'tiago' ? 'T' : 'C';
        topo.appendChild(tag);
      }

      function encontrarOriginal(){
        var alvo = chaveTipo === 'opcional' && pessoaAtual === 'casal' ? casalOpcionalMes(anoAtual, mesAtual).opcional : mesPessoa(pessoaAtual, anoAtual, mesAtual)[chaveTipo];
        return alvo.filter(function(i){ return i.id === item.id; })[0];
      }

      if(readonly){
        var nomeFixo = document.createElement('div');
        nomeFixo.className = 'nome-fixo';
        nomeFixo.textContent = item.nome;
        topo.appendChild(nomeFixo);
        var valorFixo = document.createElement('div');
        valorFixo.className = 'valor-fixo';
        valorFixo.textContent = euros(item.valor);
        topo.appendChild(valorFixo);
      } else {
        var nomeInput = document.createElement('input');
        nomeInput.type = 'text';
        nomeInput.value = item.nome;
        nomeInput.addEventListener('change', function(){
          var original = encontrarOriginal();
          if(original) original.nome = nomeInput.value;
          guardar();
        });

        var valorWrap = document.createElement('div');
        valorWrap.className = 'valor-wrap';
        var valorInput = document.createElement('input');
        valorInput.type = 'number';
        valorInput.step = '0.01';
        valorInput.value = item.valor;
        valorInput.addEventListener('change', function(){
          var novo = parseFloat(valorInput.value) || 0;
          var original = encontrarOriginal();
          if(original) original.valor = novo;
          guardar();
          renderTudo();
        });
        var span = document.createElement('span');
        span.textContent = '€';
        valorWrap.appendChild(span);
        valorWrap.appendChild(valorInput);

        var delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.title = 'Remover';
        delBtn.addEventListener('click', function(){
          if(chaveTipo === 'opcional' && pessoaAtual === 'casal'){
            var extra = casalOpcionalMes(anoAtual, mesAtual);
            extra.opcional = extra.opcional.filter(function(i){ return i.id !== item.id; });
          } else {
            var m = mesPessoa(pessoaAtual, anoAtual, mesAtual);
            m[chaveTipo] = m[chaveTipo].filter(function(i){ return i.id !== item.id; });
          }
          guardar();
          renderTudo();
        });

        topo.appendChild(nomeInput);
        topo.appendChild(valorWrap);
        topo.appendChild(delBtn);
      }
      row.appendChild(topo);

      var meta = document.createElement('div');
      meta.className = 'linha-meta';

      if(readonly){
        var catBadge = document.createElement('span');
        catBadge.className = 'cat-badge';
        catBadge.textContent = nomeCategoria(item.categoria);
        meta.appendChild(catBadge);
        if(item.data){
          var dataTxt = document.createElement('span');
          dataTxt.className = 'data-texto';
          dataTxt.textContent = formatarData(item.data);
          meta.appendChild(dataTxt);
        }
      } else {
        var catSelect = document.createElement('select');
        catSelect.className = 'cat-select';
        CATEGORIAS.forEach(function(c){
          var opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.nome;
          if(item.categoria === c.id) opt.selected = true;
          catSelect.appendChild(opt);
        });
        catSelect.addEventListener('change', function(){
          var original = encontrarOriginal();
          if(original) original.categoria = catSelect.value;
          setCatAberta(chaveTipo, catSelect.value, true);
          guardar();
          renderTudo();
        });
        meta.appendChild(catSelect);

        var dataInput = document.createElement('input');
        dataInput.type = 'date';
        dataInput.className = 'data-input';
        dataInput.value = item.data || '';
        dataInput.addEventListener('change', function(){
          var original = encontrarOriginal();
          if(original) original.data = dataInput.value;
          guardar();
        });
        meta.appendChild(dataInput);
      }
      if(item.anexo){
        var fb = document.createElement('button');
        fb.type = 'button'; fb.title = 'Ver fatura guardada'; fb.textContent = '🧾';
        fb.addEventListener('click', function(){ abrirFatura(item.anexo); });
        meta.appendChild(fb);
      }
      row.appendChild(meta);

      return row;
    }

    // agrupa por categoria; cada grupo abre/fecha com a seta
    CATEGORIAS.forEach(function(cat){
      var itensCat = lista.filter(function(i){ return (i.categoria || 'outros') === cat.id; });
      if(itensCat.length === 0) return;
      var aberta = catAberta(chaveTipo, cat.id);

      var grupo = document.createElement('div');
      grupo.className = 'cat-grupo';

      var cabeca = document.createElement('button');
      cabeca.type = 'button';
      cabeca.className = 'cat-head';
      cabeca.setAttribute('aria-expanded', aberta ? 'true' : 'false');
      cabeca.innerHTML = '<span class="seta" aria-hidden="true">▸</span>' +
        '<span class="cat-nome">' + cat.nome + '</span>' +
        '<span class="cat-qtd">' + itensCat.length + (itensCat.length === 1 ? ' lançamento' : ' lançamentos') + '</span>' +
        '<span class="cat-total">' + euros(somaLista(itensCat)) + '</span>';

      var corpo = document.createElement('div');
      corpo.className = 'cat-corpo';
      corpo.hidden = !aberta;
      itensCat.forEach(function(item){ corpo.appendChild(criarLinha(item)); });

      cabeca.addEventListener('click', function(){
        var abrir = corpo.hidden;
        corpo.hidden = !abrir;
        cabeca.setAttribute('aria-expanded', abrir ? 'true' : 'false');
        setCatAberta(chaveTipo, cat.id, abrir);
      });

      grupo.appendChild(cabeca);
      grupo.appendChild(corpo);
      box.appendChild(grupo);
    });

    if(!casalFixoReadonly){
      var addRow = document.createElement('div');
      addRow.className = 'add-row';
      var addNome = document.createElement('input');
      addNome.type = 'text';
      addNome.placeholder = pessoaAtual === 'casal' && chaveTipo === 'opcional' ? 'Novo custo conjunto' : 'Novo lançamento';
      var addCategoria = document.createElement('select');
      CATEGORIAS.forEach(function(c){
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nome;
        addCategoria.appendChild(opt);
      });
      var addValor = document.createElement('input');
      addValor.type = 'number';
      addValor.step = '0.01';
      addValor.placeholder = '€';
      var addBtn = document.createElement('button');
      addBtn.textContent = 'Adicionar';

      function addItem(){
        var nome = addNome.value.trim();
        if(!nome) return;
        var novo = { id: uid(), nome: nome, valor: parseFloat(addValor.value) || 0, categoria: addCategoria.value, data: hojeISO() };
        setCatAberta(chaveTipo, novo.categoria, true);
        if(chaveTipo === 'opcional' && pessoaAtual === 'casal'){
          casalOpcionalMes(anoAtual, mesAtual).opcional.push(novo);
        } else {
          mesPessoa(pessoaAtual, anoAtual, mesAtual)[chaveTipo].push(novo);
        }
        guardar();
        renderTudo();
      }
      addBtn.addEventListener('click', addItem);
      addNome.addEventListener('keydown', function(e){ if(e.key === 'Enter') addItem(); });
      addValor.addEventListener('keydown', function(e){ if(e.key === 'Enter') addItem(); });

      addRow.appendChild(addNome);
      addRow.appendChild(addCategoria);
      addRow.appendChild(addValor);
      addRow.appendChild(addBtn);
      box.appendChild(addRow);
    }

    container.appendChild(box);
  }

  function atualizarTotaisMes(){
    var vista = vistaMes(pessoaAtual, anoAtual, mesAtual);
    var totalFixo = somaLista(vista.fixo);
    var totalOpcional = somaLista(vista.opcional);
    var totalPoup = somaLista(vista.poupanca), totalInv = somaLista(vista.investido);
    var saldo = vista.salario - (totalFixo + totalOpcional + totalPoup + totalInv);
    document.getElementById('totalPoupanca').textContent = euros(totalPoup);
    document.getElementById('totalInvestido').textContent = euros(totalInv);
    document.getElementById('totalSalario').textContent = euros(vista.salario);
    document.getElementById('totalFixo').textContent = euros(totalFixo);
    document.getElementById('totalOpcional').textContent = euros(totalOpcional);
    var saldoEl = document.getElementById('totalSaldo');
    saldoEl.textContent = euros(saldo);
    saldoEl.className = 'val ' + (saldo < 0 ? 'negativo' : 'positivo');
    if(!document.getElementById('viewGrafico').hidden) renderResumoFrases();
  }

  function renderHistorico(){
    document.getElementById('histTitulo').textContent = 'Histórico — ' + nomesPessoa[pessoaAtual] + ' — ' + anoAtual;
    var body = document.getElementById('histBody');
    body.innerHTML = '';
    var anoTotalFixo = 0, anoTotalOpcional = 0, anoTotalSaldo = 0, anoTotalPoup = 0, anoTotalInv = 0;

    for(var m = 0; m < 12; m++){
      var vista = vistaMes(pessoaAtual, anoAtual, m);
      var tr = document.createElement('tr');
      if(m === mesAtual) tr.className = 'ativo';
      var tf = somaLista(vista.fixo), to = somaLista(vista.opcional), tp = somaLista(vista.poupanca), ti = somaLista(vista.investido);
      var salarioMes = vista.salario || 0;

      if(tf === 0 && to === 0 && tp === 0 && ti === 0 && salarioMes === 0){
        tr.classList.add('sem-dados');
        tr.innerHTML = '<td>' + meses[m] + '</td><td>—</td><td>—</td><td>—</td><td>—</td>';
      } else {
        var saldoMes = salarioMes - (tf + to + tp + ti);
        anoTotalPoup += tp; anoTotalInv += ti;
        anoTotalFixo += tf; anoTotalOpcional += to; anoTotalSaldo += saldoMes;
        var corSaldo = saldoMes < 0 ? 'lucro-neg' : 'lucro-pos';
        tr.innerHTML = '<td>' + meses[m] + '</td><td>' + euros(tf) + '</td><td>' + euros(to) + '</td><td class="total-col">' + euros(tf+to) + '</td><td class="' + corSaldo + '">' + euros(saldoMes) + '</td>';
      }
      (function(mesClicado){ tr.addEventListener('click', function(){ mesAtual = mesClicado; renderTudo(); }); })(m);
      body.appendChild(tr);
    }

    document.getElementById('histTotalFixo').textContent = euros(anoTotalFixo);
    document.getElementById('histTotalOpcional').textContent = euros(anoTotalOpcional);
    document.getElementById('histTotalGeral').textContent = euros(anoTotalFixo + anoTotalOpcional);
    var totalSaldoEl = document.getElementById('histTotalSaldo');
    totalSaldoEl.textContent = euros(anoTotalSaldo);
    totalSaldoEl.className = anoTotalSaldo < 0 ? 'lucro-neg' : 'lucro-pos';
    document.getElementById('histPoupanca').textContent = 'Poupado em ' + anoAtual + ': ' + euros(anoTotalPoup) + ' · Investido: ' + euros(anoTotalInv);
  }

  function corVar(nome){ return getComputedStyle(document.documentElement).getPropertyValue(nome).trim(); }

  function renderGrafico(){
    document.getElementById('graficoAno').textContent = 'Gastos — ' + nomesPessoa[pessoaAtual] + ' — ' + anoAtual;

    var valores = [], maxTotal = 0, mesMax = -1;
    for(var m = 0; m < 12; m++){
      var vista = vistaMes(pessoaAtual, anoAtual, m);
      var tf = somaLista(vista.fixo), to = somaLista(vista.opcional), total = tf + to;
      valores.push({ fixo: tf, opcional: to, total: total });
      if(total > maxTotal){ maxTotal = total; mesMax = m; }
    }

    var destaqueEl = document.getElementById('graficoDestaque');
    destaqueEl.innerHTML = (mesMax >= 0 && maxTotal > 0)
      ? 'Maior gasto: <b>' + meses[mesMax] + '</b> (' + euros(maxTotal) + ')'
      : 'Ainda sem dados este ano.';

    var escala = maxTotal > 0 ? maxTotal : 1;
    var w = 600, h = 260;
    var padLeft = 46, padBottom = 28, padTop = 10, padRight = 10;
    var areaW = w - padLeft - padRight, areaH = h - padTop - padBottom;
    var colW = areaW / 12, barW = colW * 0.52;

    var corFixo = corVar('--fixo'), corOpcional = corVar('--opcional'), corMuted = corVar('--muted'), corLine = corVar('--line'), corFg = corVar('--fg'), corAccent = corVar('--accent');

    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="display:block;font-family:Inter,sans-serif">';
    [0, 0.5, 1].forEach(function(frac){
      var y = padTop + areaH * (1 - frac);
      svg += '<line x1="' + padLeft + '" y1="' + y + '" x2="' + (w - padRight) + '" y2="' + y + '" stroke="' + corLine + '" stroke-width="1"/>';
      svg += '<text x="' + (padLeft - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="' + corMuted + '">' + euros(escala * frac).replace(/\s/g,'') + '</text>';
    });

    for(var m2 = 0; m2 < 12; m2++){
      var v = valores[m2];
      var x = padLeft + colW * m2 + (colW - barW) / 2;
      var hFixo = escala > 0 ? (v.fixo / escala) * areaH : 0;
      var hOpcional = escala > 0 ? (v.opcional / escala) * areaH : 0;
      var yFixoTop = padTop + areaH - hFixo;
      var yOpcionalTop = yFixoTop - hOpcional;

      if(v.fixo > 0) svg += '<rect x="' + x + '" y="' + yFixoTop + '" width="' + barW + '" height="' + hFixo + '" fill="' + corFixo + '" rx="2"/>';
      if(v.opcional > 0) svg += '<rect x="' + x + '" y="' + yOpcionalTop + '" width="' + barW + '" height="' + hOpcional + '" fill="' + corOpcional + '" rx="2"/>';

      var corLabel = (m2 === mesMax && v.total > 0) ? corAccent : corMuted;
      var pesoLabel = (m2 === mesMax && v.total > 0) ? '600' : '400';
      svg += '<text x="' + (x + barW/2) + '" y="' + (h - padBottom + 15) + '" text-anchor="middle" font-size="10" font-weight="' + pesoLabel + '" fill="' + corLabel + '">' + mesesAbrev[m2] + '</text>';
      if(v.total > 0) svg += '<text x="' + (x + barW/2) + '" y="' + (yOpcionalTop - 5) + '" text-anchor="middle" font-size="9" fill="' + corFg + '" font-variant-numeric="tabular-nums">' + Math.round(v.total) + '€</text>';
    }
    svg += '</svg>';
    document.getElementById('graficoSvgWrap').innerHTML = svg;
  }

