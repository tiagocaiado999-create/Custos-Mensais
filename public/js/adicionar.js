// @ts-check
  // ---------- Adicionar rápido (botão +) ----------
  var qaCat = 'comida', qaToastTimer = null, qaNif = null, qaFatura = null;
  function qaRenderCats(){
    var w = byId('qaCats');
    w.innerHTML = '';
    CATEGORIAS.forEach(function(c){
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = c.nome; b.className = c.id === qaCat ? 'ativo' : '';
      b.addEventListener('click', function(){ qaCat = c.id; qaRenderCats(); });
      w.appendChild(b);
    });
  }
  // Sugestões de nome: os nomes já usados (mais frequentes primeiro), com a categoria que costumam ter
  var qaCatDoNome = {};
  function qaSugestoes(){
    var cont = {}, padrao = {};
    CATEGORIAS.forEach(function(c){ padrao[c.nome.toLowerCase()] = true; });
    function ver(lista){
      (lista || []).forEach(function(i){
        var n = (i.nome || '').trim();
        if(!n || padrao[n.toLowerCase()]) return;
        var k = n.toLowerCase();
        if(!cont[k]) cont[k] = { nome: n, n: 0, cat: {} };
        cont[k].n++;
        if(i.categoria) cont[k].cat[i.categoria] = (cont[k].cat[i.categoria] || 0) + 1;
      });
    }
    ['tiago','claudia'].forEach(function(p){
      Object.keys(dados[p]).forEach(function(m){ ver(dados[p][m].fixo); ver(dados[p][m].opcional); });
    });
    Object.keys(dados.casalOpcional).forEach(function(m){ ver(dados.casalOpcional[m].opcional); });
    var lista = Object.keys(cont).map(function(k){ return cont[k]; }).sort(function(a, b){ return b.n - a.n; }).slice(0, 80);
    var dl = byId('qaNomes');
    dl.innerHTML = '';
    qaCatDoNome = {};
    lista.forEach(function(s){
      var o = document.createElement('option');
      o.value = s.nome;
      dl.appendChild(o);
      var melhor = Object.keys(s.cat).sort(function(a, b){ return s.cat[b] - s.cat[a]; })[0];
      if(melhor) qaCatDoNome[s.nome.toLowerCase()] = melhor;
    });
  }
  byId('qaNome').addEventListener('input', function(){
    var c = qaCatDoNome[this.value.trim().toLowerCase()];
    if(c && c !== qaCat && !byId('qaCats').hidden){ qaCat = c; qaRenderCats(); }
  });
  function qaAjustarTipo(){
    var casal = byId('qaPessoa').value === 'casal';
    if(casal) byId('qaTipo').value = 'opcional';
    byId('qaTipo').disabled = casal;
  }
  function qaAbrir(){
    byId('qaPessoa').value = pessoaAtual;
    byId('qaTipo').value = 'opcional';
    byId('qaData').value = hojeISO();
    byId('qaValor').value = ''; byId('qaNome').value = '';
    qaNif = null; qaFatura = null; byId('qaInfo').hidden = true;
    qaAjustarTipo(); qaRenderCats(); qaSugestoes(); qaModo('manual');
    qaImagem = null; qaQrTexto = null; byId('qaNota').value = ''; qaAtualizarAnexo(); qaNatureza('gasto');
    byId('qaOverlay').hidden = false;
    byId('qaValor').focus();
  }
  function qaFechar(){ qrParar(); byId('qaOverlay').hidden = true; byId('fabAdd').focus(); }
  byId('fabAdd').addEventListener('click', qaAbrir);
  byId('qaFechar').addEventListener('click', qaFechar);
  byId('qaGuardar').addEventListener('click', qaGuardar);
  byId('qaPessoa').addEventListener('change', qaAjustarTipo);
  byId('qaOverlay').addEventListener('click', function(e){ if(e.target === byId('qaOverlay')) qaFechar(); });
  ['qaValor','qaNome'].forEach(function(id){ byId(id).addEventListener('keydown', function(e){ if(e.key === 'Enter') qaGuardar(); }); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !byId('qaOverlay').hidden) qaFechar(); });

