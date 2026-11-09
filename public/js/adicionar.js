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
  function qaFechar(){ qrParar(); byId('qaOverlay').hidden = true; var bf = document.getElementById('btnNovaDespesa'); if(bf) bf.focus(); }
  byId('qaFechar').addEventListener('click', qaFechar);
  // qaGuardar só existe em painel-mais.js (carregado depois): passar a função diretamente ligava o próprio botão (id com o mesmo nome) e o clique não fazia nada
  byId('qaGuardar').addEventListener('click', function(){ qaGuardar(); });
  byId('qaPessoa').addEventListener('change', qaAjustarTipo);
  byId('qaOverlay').addEventListener('click', function(e){ if(e.target === byId('qaOverlay')) qaFechar(); });
  ['qaValor','qaNome'].forEach(function(id){ byId(id).addEventListener('keydown', function(e){ if(e.key === 'Enter') qaGuardar(); }); });
  // Escape fecha; Tab fica preso dentro do painel (sem isto o foco ia para a página por trás)
  document.addEventListener('keydown', function(e){
    if(byId('qaOverlay').hidden) return;
    if(e.key === 'Escape'){ qaFechar(); return; }
    if(e.key !== 'Tab') return;
    /** @type {any[]} */
    var itens = Array.prototype.filter.call(byId('qaOverlay').querySelectorAll('button, input, select, a[href], [tabindex="0"]'), function(/** @type {any} */ el){
      return !el.disabled && el.type !== 'hidden' && el.tabIndex >= 0 && el.getClientRects().length > 0;
    });
    if(!itens.length) return;
    var primeiro = itens[0], ultimo = itens[itens.length - 1], ativo = document.activeElement;
    if(!byId('qaOverlay').contains(ativo)){ e.preventDefault(); primeiro.focus(); }
    else if(e.shiftKey && ativo === primeiro){ e.preventDefault(); ultimo.focus(); }
    else if(!e.shiftKey && ativo === ultimo){ e.preventDefault(); primeiro.focus(); }
  });
  // os botões "Foto…" são <label> de um campo escondido: tornar alcançáveis e ativáveis com o teclado
  Array.prototype.forEach.call(byId('qaOverlay').querySelectorAll('label.qa-foto'), function(/** @type {any} */ lab){
    var campo = lab.querySelector('input[type=file]');
    if(!campo) return;
    lab.tabIndex = 0;
    lab.setAttribute('role', 'button');
    lab.addEventListener('keydown', function(/** @type {KeyboardEvent} */ e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); campo.click(); } });
  });

