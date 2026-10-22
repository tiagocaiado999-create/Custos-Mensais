// @ts-check
  // ---------- Poupança e investimentos do mês (listas simples) ----------
  var LISTAS_MES = {
    poupanca: { campo:'poupanca', container:'secaoPoupanca', titulo:'Conta poupança', dot:'poup', vazio:'Sem transferências para a poupança este mês.', nota:'Nota (opcional)', notaCasal:'Poupança conjunta (nota)', padrao:'Transferência', acumulado:true },
    investido: { campo:'investido', container:'secaoInvestido', titulo:'Investimentos do mês', dot:'invest', vazio:'Sem investimentos este mês.', nota:'Nota (ex.: ETF Mundo)', notaCasal:'Investimento conjunto (nota)', padrao:'Investimento', acumulado:false }
  };
  function listaAlvo(campo){
    var a = pessoaAtual === 'casal' ? casalOpcionalMes(anoAtual, mesAtual) : mesPessoa(pessoaAtual, anoAtual, mesAtual);
    if(!a[campo]) a[campo] = [];
    return a;
  }
  function poupancaAcumulada(){
    var chaves = {}, total = 0;
    ['tiago','claudia','casalOpcional'].forEach(function(p){ Object.keys(dados[p]).forEach(function(k){ chaves[k] = 1; }); });
    Object.keys(chaves).forEach(function(k){
      total += somaLista(vistaMes(pessoaAtual, parseInt(k.slice(0, 4), 10), parseInt(k.slice(5, 7), 10) - 1).poupanca);
    });
    return total;
  }
  function renderListaMes(cfg){
    var container = byId(cfg.container);
    container.innerHTML = '';
    var lista = vistaMes(pessoaAtual, anoAtual, mesAtual)[cfg.campo];
    var box = document.createElement('div');
    box.className = 'extrato';
    var head = document.createElement('div');
    head.className = 'extrato-head';
    head.innerHTML = '<div class="tipo"><span class="dot ' + cfg.dot + '"></span>' + cfg.titulo + '</div><div class="subtotal">' + euros(somaLista(lista)) + '</div>';
    box.appendChild(head);
    if(cfg.acumulado){
      var acum = document.createElement('div');
      acum.className = 'poup-acum';
      acum.textContent = 'Acumulado até hoje: ' + euros(poupancaAcumulada());
      box.appendChild(acum);
    }
    if(lista.length === 0){
      var vazio = document.createElement('div');
      vazio.className = 'vazio';
      vazio.textContent = cfg.vazio;
      box.appendChild(vazio);
    }
    lista.forEach(function(item){
      var readonly = pessoaAtual === 'casal' && !!item.origem;
      var row = document.createElement('div');
      row.className = 'linha';
      var topo = document.createElement('div');
      topo.className = 'linha-topo';
      if(item.origem){
        var tag = document.createElement('span');
        tag.className = 'tag ' + item.origem;
        tag.textContent = item.origem === 'tiago' ? 'T' : 'C';
        topo.appendChild(tag);
      }
      function original(){ return listaAlvo(cfg.campo)[cfg.campo].filter(function(i){ return i.id === item.id; })[0]; }
      var meta = document.createElement('div');
      meta.className = 'linha-meta';
      if(readonly){
        var nf = document.createElement('div'); nf.className = 'nome-fixo'; nf.textContent = item.nome; topo.appendChild(nf);
        var vf = document.createElement('div'); vf.className = 'valor-fixo'; vf.textContent = euros(item.valor); topo.appendChild(vf);
        if(item.data){ var dt = document.createElement('span'); dt.className = 'data-texto'; dt.textContent = formatarData(item.data); meta.appendChild(dt); }
      } else {
        var nomeInput = document.createElement('input');
        nomeInput.type = 'text'; nomeInput.value = item.nome;
        nomeInput.addEventListener('change', function(){ var o = original(); if(o) o.nome = nomeInput.value; guardar(); });
        var valorWrap = document.createElement('div');
        valorWrap.className = 'valor-wrap';
        var span = document.createElement('span'); span.textContent = '€';
        var valorInput = document.createElement('input');
        valorInput.type = 'number'; valorInput.step = '0.01'; valorInput.value = item.valor;
        valorInput.addEventListener('change', function(){ var o = original(); if(o) o.valor = parseFloat(valorInput.value) || 0; guardar(); renderTudo(); });
        valorWrap.appendChild(span); valorWrap.appendChild(valorInput);
        var del = document.createElement('button');
        del.textContent = '×'; del.title = 'Remover';
        del.addEventListener('click', function(){
          var a = listaAlvo(cfg.campo);
          a[cfg.campo] = a[cfg.campo].filter(function(i){ return i.id !== item.id; });
          guardar(); renderTudo();
        });
        topo.appendChild(nomeInput); topo.appendChild(valorWrap); topo.appendChild(del);
        var dataInput = document.createElement('input');
        dataInput.type = 'date'; dataInput.className = 'data-input'; dataInput.value = item.data || '';
        dataInput.addEventListener('change', function(){ var o = original(); if(o) o.data = dataInput.value; guardar(); });
        meta.appendChild(dataInput);
      }
      row.appendChild(topo);
      row.appendChild(meta);
      box.appendChild(row);
    });
    var addRow = document.createElement('div');
    addRow.className = 'add-row';
    var addNome = document.createElement('input');
    addNome.type = 'text'; addNome.placeholder = pessoaAtual === 'casal' ? cfg.notaCasal : cfg.nota;
    var addValor = document.createElement('input');
    addValor.type = 'number'; addValor.step = '0.01'; addValor.placeholder = '€';
    var addBtn = document.createElement('button');
    addBtn.textContent = 'Adicionar';
    function addItem(){
      var v = parseFloat(addValor.value);
      if(!v) return;
      listaAlvo(cfg.campo)[cfg.campo].push({ id: uid(), nome: addNome.value.trim() || cfg.padrao, valor: v, data: hojeISO() });
      guardar(); renderTudo();
    }
    addBtn.addEventListener('click', addItem);
    addNome.addEventListener('keydown', function(e){ if(e.key === 'Enter') addItem(); });
    addValor.addEventListener('keydown', function(e){ if(e.key === 'Enter') addItem(); });
    addRow.appendChild(addNome); addRow.appendChild(addValor); addRow.appendChild(addBtn);
    box.appendChild(addRow);
    container.appendChild(box);
  }
  function renderPoupanca(){ renderListaMes(LISTAS_MES.poupanca); }
  function renderInvestido(){ renderListaMes(LISTAS_MES.investido); }

