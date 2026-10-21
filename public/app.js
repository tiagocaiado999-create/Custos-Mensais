(function(){
  var STORAGE_KEY = 'custos-mensais-pessoas-v2';
  var meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  var mesesAbrev = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var nomesPessoa = { tiago:'Tiago', claudia:'Cláudia', casal:'Casal' };
  var CATEGORIAS = [
    { id:'comida', nome:'Comida' },
    { id:'restaurante', nome:'Restaurante' },
    { id:'lazer', nome:'Lazer' },
    { id:'transporte', nome:'Transporte' },
    { id:'saude', nome:'Saúde' },
    { id:'compras', nome:'Compras' },
    { id:'outros', nome:'Outros' }
  ];
  function nomeCategoria(id){
    var c = CATEGORIAS.filter(function(c){ return c.id === id; })[0];
    return c ? c.nome : 'Outros';
  }
  function hojeISO(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function formatarData(iso){
    if(!iso) return '';
    var p = iso.split('-');
    if(p.length !== 3) return '';
    return p[2] + '/' + p[1];
  }

  var agora = new Date();
  var anoAtual = agora.getFullYear();
  var mesAtual = agora.getMonth();
  var pessoaAtual = 'tiago';

  function chave(ano, mes){ return ano + '-' + String(mes+1).padStart(2,'0'); }
  function mesVazio(){ return { salario: 0, fixo: [], opcional: [], poupanca: [], investido: [] }; }
  function uid(){ return 'x' + Math.random().toString(36).slice(2,9); }
  function euros(n){ return new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n||0); }
  function somaLista(lista){ return lista.reduce(function(s,i){ return s + (Number(i.valor)||0); }, 0); }

  function investVazio(){ return { ativos: [], retirados: [] }; }
  var dadosDefault = { tiago:{}, claudia:{}, casalOpcional:{}, lojas:{}, investimentos:{ tiago: investVazio(), claudia: investVazio(), casal: investVazio() } };

  // Armazenamento partilhado (api/data.js + Redis) com versões: cada gravação junta as alterações em vez de substituir tudo.
  var guardarTimer = null;
  var statusEl = null;

  function migrarItens(lista){
    (lista || []).forEach(function(item){
      if(!item.categoria) item.categoria = 'outros';
      if(item.data === undefined) item.data = '';
    });
  }
  function normalizar(d){
    if(!d) d = {};
    if(!d.tiago) d.tiago = {};
    if(!d.claudia) d.claudia = {};
    if(!d.casalOpcional) d.casalOpcional = {};
    if(!d.lojas) d.lojas = {};
    if(!d.investimentos || Array.isArray(d.investimentos.ativos)){
      var antigo = d.investimentos;
      d.investimentos = { tiago: antigo || investVazio(), claudia: investVazio(), casal: investVazio() };
    }
    if(!d.investimentos.tiago) d.investimentos.tiago = investVazio();
    if(!d.investimentos.claudia) d.investimentos.claudia = investVazio();
    if(!d.investimentos.casal) d.investimentos.casal = investVazio();
    ['tiago','claudia'].forEach(function(p){
      Object.keys(d[p]).forEach(function(k){
        migrarItens(d[p][k].fixo);
        migrarItens(d[p][k].opcional);
        if(!d[p][k].poupanca) d[p][k].poupanca = [];
        if(!d[p][k].investido) d[p][k].investido = [];
      });
    });
    Object.keys(d.casalOpcional).forEach(function(k){
      migrarItens(d.casalOpcional[k].opcional);
      if(!d.casalOpcional[k].poupanca) d.casalOpcional[k].poupanca = [];
      if(!d.casalOpcional[k].investido) d.casalOpcional[k].investido = [];
    });
    ['tiago','claudia','casal'].forEach(function(p){
      (d.investimentos[p].ativos || []).forEach(function(i){
        if(i.data === undefined) i.data = '';
        if(i.valorAtual === undefined) i.valorAtual = '';
        if(i.ticker === undefined) i.ticker = '';
        if(i.precoCompra === undefined) i.precoCompra = '';
      });
      (d.investimentos[p].retirados || []).forEach(function(i){
        if(i.dataInvestido === undefined) i.dataInvestido = '';
        if(i.data === undefined) i.data = '';
      });
    });
    return d;
  }

  // ---------- Estado visual das categorias (só neste dispositivo) ----------
  var UI_KEY = 'custos-mensais-ui-cats';
  var catAbertas = {};
  try{ catAbertas = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; }catch(e){ catAbertas = {}; }
  function catAberta(tipo, id){ return !!catAbertas[tipo + ':' + id]; }
  function setCatAberta(tipo, id, aberta){
    catAbertas[tipo + ':' + id] = !!aberta;
    try{ localStorage.setItem(UI_KEY, JSON.stringify(catAbertas)); }catch(e){}
  }

  // Procuram sempre nos dados atuais (os dados podem ser substituídos por uma sincronização)
  function investAtual(){ return dados.investimentos[pessoaAtual]; }
  function acharAtivo(id){ return investAtual().ativos.filter(function(i){ return i.id === id; })[0]; }

  // ---------- Sincronização ----------
  var SYNC_KEY = 'custos-mensais-sync-v3';
  var RECUPERADO_KEY = 'custos-mensais-recuperado-v3';
  var versao = 0;        // versão do servidor a que 'base' corresponde
  var base = null;       // último estado conhecido do servidor
  var sujo = false;      // há alterações aqui que o servidor ainda não confirmou
  var edicao = 0;        // contador de alterações locais
  var aSincronizar = false, precisaNova = false, iniciado = false, renderPendente = false;
  var falhaSync = false, demoraSync = false, falhaFaturas = false, avisoTimer = null;

  function mostrarEstado(texto){
    if(!statusEl) statusEl = document.getElementById('estadoGuardar');
    if(statusEl) statusEl.textContent = texto;
  }

  function clonar(x){ return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function canon(x){
    if(Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    if(x && typeof x === 'object'){
      return '{' + Object.keys(x).sort().filter(function(k){ return x[k] !== undefined; })
        .map(function(k){ return JSON.stringify(k) + ':' + canon(x[k]); }).join(',') + '}';
    }
    var j = JSON.stringify(x);
    return j === undefined ? 'undefined' : j;
  }
  function igual(a, b){ return canon(a) === canon(b); }
  function ehObj(x){ return !!x && typeof x === 'object' && !Array.isArray(x); }

  // cópia normalizada, sem meses vazios (os meses vazios são criados só por navegar)
  function limpar(d){
    var c = normalizar(clonar(d));
    ['tiago','claudia'].forEach(function(p){
      Object.keys(c[p]).forEach(function(k){
        var m = c[p][k];
        if(!m || (!m.salario && !(m.fixo || []).length && !(m.opcional || []).length && !(m.poupanca || []).length && !(m.investido || []).length)) delete c[p][k];
      });
    });
    Object.keys(c.casalOpcional).forEach(function(k){
      var m = c.casalOpcional[k];
      if(!m || (!(m.opcional || []).length && !(m.poupanca || []).length && !(m.investido || []).length)) delete c.casalOpcional[k];
    });
    return c;
  }

  // Junção a 3 vias: b = último estado do servidor que conhecemos, l = o que está aqui, r = o que está agora no servidor.
  // Quem alterou algo mantém a sua alteração; o que só existe de um lado é conservado; apagados são respeitados.
  function fundir(b, l, r){
    if(igual(l, b)) return clonar(r);
    if(igual(r, b)) return clonar(l);
    if(Array.isArray(l) && Array.isArray(r)) return fundirLista(Array.isArray(b) ? b : [], l, r);
    if(ehObj(l) && ehObj(r)){
      var bb = ehObj(b) ? b : {};
      var chaves = {}, out = {};
      Object.keys(l).concat(Object.keys(r)).forEach(function(k){ chaves[k] = 1; });
      Object.keys(chaves).forEach(function(k){
        var v = fundir(bb[k], l[k], r[k]);
        if(v !== undefined) out[k] = v;
      });
      return out;
    }
    if(b === undefined && (l === 0 || l === '' || l === null)) return clonar(r);
    return clonar(l);
  }
  function fundirLista(b, l, r){
    var todos = b.concat(l, r);
    var comId = todos.every(function(i){ return ehObj(i) && i.id; });
    if(!comId) return clonar(l);
    function mapa(a){ var m = {}; a.forEach(function(i){ m[i.id] = i; }); return m; }
    var bm = mapa(b), lm = mapa(l), rm = mapa(r), out = [], vistos = {};
    function juntar(i){
      var id = i.id;
      if(vistos[id]) return;
      vistos[id] = 1;
      var noL = lm[id] !== undefined, noR = rm[id] !== undefined, noB = bm[id] !== undefined;
      if(noL && noR) out.push(fundir(bm[id], lm[id], rm[id]));
      else if(noL){ if(!noB || !igual(lm[id], bm[id])) out.push(clonar(lm[id])); }   // apagado no servidor: só fica se foi editado aqui
      else if(noR){ if(!noB || !igual(rm[id], bm[id])) out.push(clonar(rm[id])); }   // apagado aqui: só fica se foi editado no servidor
    }
    r.forEach(juntar);
    l.forEach(juntar);
    return out;
  }

  function persistirLocal(){
    try{ localStorage.setItem(SYNC_KEY, JSON.stringify({ versao: versao, base: base, dados: dados, sujo: sujo })); }catch(e){}
  }

  function camposAtivos(){
    var a = document.activeElement;
    return !!(a && a.closest && a.closest('#app') && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName));
  }
  function tentarRender(){
    if(!renderPendente || !iniciado || camposAtivos()) return;
    renderPendente = false;
    renderTudo();
    if(!document.getElementById('viewInvestimentos').hidden) renderInvestimentos();
  }
  document.addEventListener('focusout', function(){ setTimeout(tentarRender, 150); });

  // Junta o estado do servidor (remoto) com o que está aqui e atualiza a base.
  function integrar(remoto, versaoRemota){
    var r = limpar(remoto);
    var l = limpar(dados);
    var m = normalizar(fundir(base || {}, l, r));
    var mudou = !igual(m, l);
    base = r;
    versao = versaoRemota;
    sujo = !igual(m, r);
    if(mudou){ dados = m; renderPendente = true; tentarRender(); }
    persistirLocal();
  }

  async function sincronizar(){
    if(aSincronizar){ precisaNova = true; return; }
    aSincronizar = true;
    var concluido = false;
    try{
      for(var tentativa = 0; tentativa < 8; tentativa++){
        if(sujo){
          clearTimeout(guardarTimer);
          var edicaoAntes = edicao;
          var local = limpar(dados);
          var resp = await fetch('/api/data', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ versao: versao, dados: local }) });
          var json = {};
          try{ json = await resp.json(); }catch(e){}
          if(resp.ok){
            versao = json.versao; base = local;
            sujo = (edicao !== edicaoAntes);
            persistirLocal();
          } else if(resp.status === 409 && json.versao !== undefined && 'dados' in json){
            integrar(json.dados, json.versao);
          } else {
            throw new Error(json.erro || ('HTTP ' + resp.status));
          }
        } else {
          var r = await fetch('/api/data?modo=v2&desde=' + versao, { cache:'no-store' });
          if(!r.ok) throw new Error('HTTP ' + r.status);
          var j = await r.json();
          if(!j.semAlteracoes) integrar(j.dados, j.versao);
        }
        if(!sujo){ concluido = true; break; }
      }
      mostrarEstado(concluido ? 'Guardado' : 'A guardar…');
      if(concluido){ falhaSync = false; demoraSync = false; }
      renderAviso();
      if(!concluido) setTimeout(sincronizar, 3000);
    }catch(e){
      mostrarEstado(sujo ? 'Sem ligação — guardado neste dispositivo, envia quando houver rede' : 'Sem ligação');
      falhaSync = true;
      renderAviso();
      if(sujo) setTimeout(sincronizar, 10000);
    }finally{
      aSincronizar = false;
      enviarFaturas();
      if(precisaNova){ precisaNova = false; setTimeout(sincronizar, 0); }
    }
  }

  async function carregar(){
    var salvo = null;
    try{ salvo = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); }catch(e){}
    var remoto = null, versaoRemota = 0, ligou = false;
    try{
      var resp = await fetch('/api/data?modo=v2', { cache:'no-store' });
      if(resp.ok){ var j = await resp.json(); remoto = j.dados; versaoRemota = j.versao; ligou = true; }
    }catch(e){}

    if(!ligou){
      // sem ligação: só se houver cópia desta aplicação (com versão) é que se deixa trabalhar
      if(salvo && salvo.dados){
        versao = salvo.versao || 0; base = salvo.base || null; sujo = !!salvo.sujo;
        dados = normalizar(salvo.dados);
        mostrarEstado('Sem ligação — a usar a cópia deste dispositivo');
        return true;
      }
      return false;
    }

    var rem = limpar(remoto);
    if(salvo && salvo.base && salvo.dados){
      // continua o que ficou por enviar da sessão anterior (nada se perde)
      dados = normalizar(clonar(salvo.dados)); base = salvo.base; versao = salvo.versao || 0;
      integrar(rem, versaoRemota);
    } else {
      dados = normalizar(clonar(rem)); base = clonar(rem); versao = versaoRemota; sujo = false;
    }

    // Recuperação única: junta o que ficou na cópia antiga deste dispositivo e não está no servidor
    var jaRecuperou = null;
    try{ jaRecuperou = localStorage.getItem(RECUPERADO_KEY); }catch(e){}
    if(!jaRecuperou){
      try{ localStorage.setItem(RECUPERADO_KEY, '1'); }catch(e){}
      var legado = null;
      try{ legado = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }catch(e){}
      if(legado){
        var atual = limpar(dados);
        var uniao = normalizar(fundir({}, atual, limpar(legado)));  // o servidor ganha conflitos
        if(!igual(uniao, atual)){ dados = uniao; sujo = true; mostrarEstado('Recuperados dados antigos deste dispositivo'); }
      }
    }
    persistirLocal();
    return true;
  }

  // Aviso bem visível quando há coisas que ainda não chegaram ao servidor
  function renderAviso(){
    var msgs = [], pend = lerPendentes().length;
    if(sujo && falhaSync) msgs.push('Alterações por enviar: sem ligação ao servidor. Ficam guardadas neste telemóvel e seguem quando houver rede.');
    else if(sujo && demoraSync) msgs.push('A guardar está a demorar: as alterações ainda não chegaram ao servidor.');
    if(pend && falhaFaturas) msgs.push(pend + (pend === 1 ? ' fatura por enviar' : ' faturas por enviar') + ' para o servidor.');
    byId('avisoTexto').textContent = msgs.join(' ');
    byId('avisoSync').hidden = msgs.length === 0;
  }
  function guardar(){
    edicao++;
    sujo = true;
    persistirLocal();
    mostrarEstado('A guardar…');
    clearTimeout(guardarTimer);
    guardarTimer = setTimeout(sincronizar, 600);
    demoraSync = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function(){ if(sujo){ demoraSync = true; renderAviso(); } }, 8000);
    renderAviso();
  }

  // ao sair/esconder a página, envia já o que estiver pendente
  function enviarAoSair(){
    if(!sujo || !iniciado) return;
    try{
      var corpo = JSON.stringify({ versao: versao, dados: limpar(dados) });
      fetch('/api/data', { method:'POST', headers:{'Content-Type':'application/json'}, body: corpo, keepalive: corpo.length < 60000 });
    }catch(e){}
  }
  document.addEventListener('visibilitychange', function(){ if(document.hidden) enviarAoSair(); else sincronizar(); });
  window.addEventListener('pagehide', enviarAoSair);
  window.addEventListener('online', function(){ sincronizar(); });
  window.addEventListener('focus', function(){ sincronizar(); });
  setInterval(function(){ if(!document.hidden && iniciado) sincronizar(); }, 15000);

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

  // Preços em tempo real (via proxy /api/preco). precosCache guarda o último preço obtido por ticker.
  var precosCache = {};
  var precosPendentes = {};
  async function buscarPrecoTicker(ticker){
    try{
      var resp = await fetch('/api/preco?symbol=' + encodeURIComponent(ticker));
      var d = await resp.json();
      if(!resp.ok || d.erro || typeof d.preco !== 'number') return null;
      return d.preco;
    }catch(e){ return null; }
  }
  function garantirPrecoTicker(ticker){
    if(!ticker || precosCache[ticker] !== undefined || precosPendentes[ticker]) return;
    precosPendentes[ticker] = true;
    buscarPrecoTicker(ticker).then(function(preco){
      delete precosPendentes[ticker];
      if(preco !== null){
        precosCache[ticker] = preco;
        renderInvestimentos();
      }
    });
  }
  function valorAtualDe(inv){
    if(inv.ticker && precosCache[inv.ticker] !== undefined && inv.precoCompra){
      return (Number(inv.valor)||0) * (precosCache[inv.ticker] / inv.precoCompra);
    }
    if(inv.valorAtual !== undefined && inv.valorAtual !== null && inv.valorAtual !== ''){
      return Number(inv.valorAtual);
    }
    return Number(inv.valor) || 0;
  }
  function temValorAtualDe(inv){
    if(inv.ticker) return precosCache[inv.ticker] !== undefined;
    return inv.valorAtual !== undefined && inv.valorAtual !== null && inv.valorAtual !== '';
  }

  function renderGraficoInvestimentos(invest){
    var box = document.getElementById('investGraficoBox');
    var comPreco = invest.ativos.filter(function(i){ return temValorAtualDe(i); });
    if(comPreco.length === 0){ box.hidden = true; return; }
    box.hidden = false;

    var w = 600, h = 220;
    var padLeft = 10, padBottom = 34, padTop = 16, padRight = 10;
    var areaW = w - padLeft - padRight, areaH = h - padTop - padBottom;
    var n = comPreco.length;
    var grupoW = areaW / n;
    var barW = Math.min(34, grupoW * 0.32);

    var maxVal = 0;
    comPreco.forEach(function(i){ maxVal = Math.max(maxVal, Number(i.valor)||0, valorAtualDe(i)); });
    var escala = maxVal > 0 ? maxVal : 1;

    var corFixo = corVar('--fixo'), corOpcional = corVar('--opcional'), corMuted = corVar('--muted'), corFg = corVar('--fg'), corLine = corVar('--line');

    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="display:block;font-family:Inter,sans-serif">';
    var yBase = padTop + areaH;
    svg += '<line x1="' + padLeft + '" y1="' + yBase + '" x2="' + (w-padRight) + '" y2="' + yBase + '" stroke="' + corLine + '" stroke-width="1"/>';

    comPreco.forEach(function(inv, idx){
      var cx = padLeft + grupoW * idx + grupoW/2;
      var vi = Number(inv.valor) || 0, va = valorAtualDe(inv);
      var hi = (vi/escala) * areaH, ha = (va/escala) * areaH;
      var xi = cx - barW - 3, xa = cx + 3;
      svg += '<rect x="' + xi + '" y="' + (yBase-hi) + '" width="' + barW + '" height="' + hi + '" fill="' + corMuted + '" rx="2"/>';
      svg += '<rect x="' + xa + '" y="' + (yBase-ha) + '" width="' + barW + '" height="' + ha + '" fill="' + (va >= vi ? corFixo : corOpcional) + '" rx="2"/>';
      svg += '<text x="' + cx + '" y="' + (h - padBottom + 16) + '" text-anchor="middle" font-size="10" fill="' + corMuted + '">' + (inv.nome.length > 10 ? inv.nome.slice(0,9)+'…' : inv.nome) + '</text>';
      svg += '<text x="' + cx + '" y="' + (yBase - Math.max(hi,ha) - 6) + '" text-anchor="middle" font-size="9" fill="' + corFg + '" font-variant-numeric="tabular-nums">' + Math.round(va) + '€</text>';
    });
    svg += '</svg>';
    svg += '<div class="legenda" style="margin-top:8px"><span><i style="background:' + corMuted + '"></i>Investido</span><span><i style="background:' + corFixo + '"></i>Valor atual (a ganhar)</span></div>';
    document.getElementById('investGraficoSvgWrap').innerHTML = svg;
  }

  function renderInvestimentos(){
    var invest = dados.investimentos[pessoaAtual];
    document.getElementById('investTitulo').textContent = 'Investimentos — ' + nomesPessoa[pessoaAtual];
    var ativosLista = document.getElementById('investAtivosLista');
    var retiradosLista = document.getElementById('investRetiradosLista');
    ativosLista.innerHTML = ''; retiradosLista.innerHTML = '';

    var totalAtivo = invest.ativos.reduce(function(s,i){ return s + (Number(i.valor)||0); }, 0);
    var totalAtual = invest.ativos.reduce(function(s,i){ return s + valorAtualDe(i); }, 0);
    var totalPotencial = totalAtual - totalAtivo;
    document.getElementById('investTotalAtivo').textContent = euros(totalAtivo);
    document.getElementById('investTotalAtual').textContent = euros(totalAtual);
    var potEl = document.getElementById('investTotalPotencial');
    potEl.textContent = (totalPotencial >= 0 ? '+' : '') + euros(totalPotencial);
    potEl.className = 'val ' + (totalPotencial < 0 ? 'lucro-neg' : 'lucro-pos');

    if(invest.ativos.length === 0){
      var vazio1 = document.createElement('div');
      vazio1.className = 'vazio';
      vazio1.textContent = 'Sem investimentos ativos.';
      ativosLista.appendChild(vazio1);
    }

    invest.ativos.forEach(function(inv){
      var row = document.createElement('div');
      row.className = 'invest-linha';

      var nomeEl = document.createElement('div');
      nomeEl.className = 'nome';
      var temTicker = !!inv.ticker;
      var temAtual = temValorAtualDe(inv);
      var valorAtualEfetivo = valorAtualDe(inv);
      var metaTxt = 'investido ' + euros(inv.valor) + (inv.data ? ' · ' + formatarData(inv.data) : '') + (temTicker ? ' · ' + inv.ticker : '');
      if(temAtual){
        var lucroPot = valorAtualEfetivo - Number(inv.valor);
        var pctPot = inv.valor > 0 ? (lucroPot / inv.valor * 100) : 0;
        metaTxt += ' · ' + (lucroPot >= 0 ? '+' : '') + euros(lucroPot) + ' (' + (pctPot >= 0 ? '+' : '') + pctPot.toFixed(1) + '%)';
      } else if(temTicker){
        metaTxt += ' · a obter preço…';
      }
      nomeEl.innerHTML = inv.nome + '<br><span class="meta' + (temAtual ? (valorAtualEfetivo >= Number(inv.valor) ? ' lucro-pos' : ' lucro-neg') : '') + '">' + metaTxt + '</span>';

      var dataInput = document.createElement('input');
      dataInput.type = 'date';
      dataInput.className = 'data-input';
      dataInput.title = 'Data do investimento';
      dataInput.value = inv.data || '';
      dataInput.addEventListener('change', function(){
        var o = acharAtivo(inv.id); if(o) o.data = dataInput.value;
        guardar();
        renderInvestimentos();
      });

      var precoAtualInput = null;
      if(!temTicker){
        precoAtualInput = document.createElement('input');
        precoAtualInput.type = 'number';
        precoAtualInput.step = '0.01';
        precoAtualInput.placeholder = 'valor atual';
        precoAtualInput.style.width = '92px';
        precoAtualInput.style.textAlign = 'right';
        precoAtualInput.style.border = '1px solid var(--border)';
        precoAtualInput.style.borderRadius = '7px';
        precoAtualInput.style.background = 'var(--bg)';
        precoAtualInput.style.color = 'var(--fg)';
        precoAtualInput.style.fontSize = '.82rem';
        precoAtualInput.style.padding = '6px 8px';
        precoAtualInput.value = temAtual ? inv.valorAtual : '';
        precoAtualInput.addEventListener('change', function(){
          var o = acharAtivo(inv.id);
          if(o) o.valorAtual = precoAtualInput.value === '' ? '' : parseFloat(precoAtualInput.value) || 0;
          guardar();
          renderInvestimentos();
        });
      } else {
        garantirPrecoTicker(inv.ticker);
      }

      var retirarBtn = document.createElement('button');
      retirarBtn.textContent = 'Retirar';
      var removerBtn = document.createElement('button');
      removerBtn.className = 'remover';
      removerBtn.textContent = '×';
      removerBtn.title = 'Remover';
      removerBtn.addEventListener('click', function(){
        var iv = investAtual();
        iv.ativos = iv.ativos.filter(function(i){ return i.id !== inv.id; });
        guardar();
        renderInvestimentos();
      });
      row.appendChild(nomeEl); row.appendChild(dataInput);
      if(precoAtualInput) row.appendChild(precoAtualInput);
      row.appendChild(retirarBtn); row.appendChild(removerBtn);

      var formWrap = document.createElement('div');
      formWrap.style.width = '100%';
      retirarBtn.addEventListener('click', function(){
        if(formWrap.childElementCount > 0){ formWrap.innerHTML = ''; return; }
        var form = document.createElement('div');
        form.className = 'retirar-form';
        var input = document.createElement('input');
        input.type = 'number'; input.step = '0.01'; input.placeholder = '€ retirado';
        var confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Confirmar';
        form.appendChild(input); form.appendChild(confirmBtn);
        formWrap.appendChild(form);

        if(temTicker){
          input.disabled = true;
          input.placeholder = 'a obter preço…';
          buscarPrecoTicker(inv.ticker).then(function(precoAgora){
            input.disabled = false;
            input.placeholder = '€ retirado';
            if(precoAgora !== null && inv.precoCompra){
              precosCache[inv.ticker] = precoAgora;
              var sugerido = (Number(inv.valor)||0) * (precoAgora / inv.precoCompra);
              input.value = sugerido.toFixed(2);
            }
          });
        }

        confirmBtn.addEventListener('click', function(){
          var valorRetirado = parseFloat(input.value);
          if(isNaN(valorRetirado)) return;
          var iv = investAtual();
          var o = acharAtivo(inv.id) || inv;
          iv.ativos = iv.ativos.filter(function(i){ return i.id !== inv.id; });
          iv.retirados.push({ id: uid(), nome: o.nome, valorInvestido: o.valor, valorRetirado: valorRetirado, dataInvestido: o.data || '', data: hojeISO() });
          guardar();
          renderInvestimentos();
        });
      });

      ativosLista.appendChild(row);
      ativosLista.appendChild(formWrap);
    });

    var totalLucro = 0;
    if(invest.retirados.length === 0){
      var vazio2 = document.createElement('div');
      vazio2.className = 'vazio';
      vazio2.textContent = 'Ainda sem retiradas.';
      retiradosLista.appendChild(vazio2);
    }
    invest.retirados.slice().reverse().forEach(function(inv){
      var lucro = inv.valorRetirado - inv.valorInvestido;
      var pct = inv.valorInvestido > 0 ? (lucro / inv.valorInvestido * 100) : 0;
      totalLucro += lucro;
      var row = document.createElement('div');
      row.className = 'invest-linha';
      var nomeEl = document.createElement('div');
      nomeEl.className = 'nome';
      var metaTxt = 'investido ' + euros(inv.valorInvestido) + (inv.dataInvestido ? ' (' + formatarData(inv.dataInvestido) + ')' : '') + ' · retirado ' + euros(inv.valorRetirado) + (inv.data ? ' (' + formatarData(inv.data) + ')' : '');
      nomeEl.innerHTML = inv.nome + '<br><span class="meta">' + metaTxt + '</span>';
      var lucroEl = document.createElement('div');
      lucroEl.className = 'valor ' + (lucro >= 0 ? 'lucro-pos' : 'lucro-neg');
      lucroEl.textContent = (lucro >= 0 ? '+' : '') + euros(lucro) + ' (' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%)';
      var removerRetiradoBtn = document.createElement('button');
      removerRetiradoBtn.className = 'remover';
      removerRetiradoBtn.textContent = '×';
      removerRetiradoBtn.title = 'Remover';
      removerRetiradoBtn.addEventListener('click', function(){
        var iv = investAtual();
        iv.retirados = iv.retirados.filter(function(i){ return i.id !== inv.id; });
        guardar();
        renderInvestimentos();
      });
      row.appendChild(nomeEl); row.appendChild(lucroEl); row.appendChild(removerRetiradoBtn);
      retiradosLista.appendChild(row);
    });

    var lucroTotalEl = document.getElementById('investTotalLucro');
    lucroTotalEl.textContent = euros(totalLucro);
    lucroTotalEl.className = 'val ' + (totalLucro < 0 ? 'lucro-neg' : 'lucro-pos');

    renderGraficoInvestimentos(invest);
  }

  document.getElementById('investAddBtn').addEventListener('click', async function(){
    var nomeEl = document.getElementById('investNovoNome');
    var tickerEl = document.getElementById('investNovoTicker');
    var valorEl = document.getElementById('investNovoValor');
    var dataEl = document.getElementById('investNovaData');
    var ticker = tickerEl.value.trim().toUpperCase();
    var nome = nomeEl.value.trim() || ticker;
    if(!nome) return;

    var precoCompra = '';
    var btn = document.getElementById('investAddBtn');
    if(ticker){
      btn.disabled = true; btn.textContent = 'A obter preço…';
      var preco = await buscarPrecoTicker(ticker);
      btn.disabled = false; btn.textContent = 'Adicionar';
      if(preco === null){
        alert('Não foi possível obter o preço de "' + ticker + '". O investimento vai ser adicionado sem acompanhamento automático (podes atualizar o valor manualmente).');
        ticker = '';
      } else {
        precoCompra = preco;
        precosCache[ticker] = preco;
      }
    }

    dados.investimentos[pessoaAtual].ativos.push({ id: uid(), nome: nome, valor: parseFloat(valorEl.value) || 0, data: dataEl.value || hojeISO(), valorAtual: '', ticker: ticker, precoCompra: precoCompra });
    nomeEl.value = ''; tickerEl.value = ''; valorEl.value = ''; dataEl.value = '';
    guardar();
    renderInvestimentos();
  });

  // ---------- Gráfico por categoria (com comparação ao mês anterior) ----------
  var catTipo = 'todos';
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

  // ---------- Exportar (Excel .xlsx; CSV como alternativa) ----------
  var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  function carregarXLSX(){
    if(window.XLSX) return Promise.resolve(window.XLSX);
    return carregarScript('/vendor/xlsx.full.min.js').catch(function(){ return carregarScript(XLSX_URL); })
      .then(function(){ if(!window.XLSX) throw new Error('xlsx'); return window.XLSX; });
  }
  function dataISO(t){ return /^\d{4}-\d{2}-\d{2}$/.test(t || '') ? new Date(t + 'T00:00:00Z') : ''; }
  function linhasExport(){
    var lanc = [], resumo = [], inv = [];
    var nomes = { tiago:'Tiago', claudia:'Cláudia', casal:'Casal' };
    var chaves = {};
    ['tiago','claudia','casalOpcional'].forEach(function(p){ Object.keys(dados[p]).forEach(function(k){ chaves[k] = 1; }); });
    Object.keys(chaves).sort().forEach(function(k){
      var ano = parseInt(k.slice(0, 4), 10), mes = parseInt(k.slice(5, 7), 10) - 1;
      [['tiago', dados.tiago[k]], ['claudia', dados.claudia[k]], ['casal', dados.casalOpcional[k] && { opcional: dados.casalOpcional[k].opcional, fixo: [], poupanca: dados.casalOpcional[k].poupanca, investido: dados.casalOpcional[k].investido }]].forEach(function(par){
        var m = par[1];
        if(!m) return;
        ['fixo','opcional','poupanca','investido'].forEach(function(tipo){
          (m[tipo] || []).forEach(function(i){
            lanc.push([dataISO(i.data), k, nomes[par[0]], tipo === 'fixo' ? 'Fixo' : (tipo === 'opcional' ? 'Opcional' : (tipo === 'poupanca' ? 'Poupança' : 'Investimento')), (tipo === 'poupanca' || tipo === 'investido') ? '—' : nomeCategoria(i.categoria), i.nome, Number(i.valor) || 0]);
          });
        });
      });
      ['tiago','claudia','casal'].forEach(function(p){
        var v = vistaMes(p, ano, mes), f = somaLista(v.fixo), o = somaLista(v.opcional), pp = somaLista(v.poupanca), ii = somaLista(v.investido);
        if(!v.salario && !f && !o && !pp && !ii) return;
        resumo.push([k, nomes[p], v.salario || 0, f, o, pp, ii, (v.salario || 0) - f - o - pp - ii]);
      });
    });
    ['tiago','claudia','casal'].forEach(function(p){
      var iv = dados.investimentos[p];
      iv.ativos.forEach(function(a){
        inv.push([nomes[p], 'Ativo', a.nome, a.ticker || '', Number(a.valor) || 0, dataISO(a.data), temValorAtualDe(a) ? valorAtualDe(a) : '', '', '']);
      });
      iv.retirados.forEach(function(r){
        inv.push([nomes[p], 'Retirado', r.nome, '', Number(r.valorInvestido) || 0, dataISO(r.dataInvestido), '', Number(r.valorRetirado) || 0, dataISO(r.data)]);
      });
    });
    return [
      { nome:'Lançamentos', cab:['Data','Mês','Pessoa','Tipo','Categoria','Nome','Valor (€)'], linhas:lanc, datas:[0], moeda:[6], larg:[12,9,9,10,13,28,11] },
      { nome:'Resumo mensal', cab:['Mês','Pessoa','Salário (€)','Fixos (€)','Opcionais (€)','Poupança (€)','Investido (€)','Sobrou (€)'], linhas:resumo, datas:[], moeda:[2,3,4,5,6,7], larg:[9,9,12,11,13,13,13,11] },
      { nome:'Investimentos', cab:['Pessoa','Estado','Nome','Código','Investido (€)','Data','Valor atual (€)','Retirado (€)','Data retirada'], linhas:inv, datas:[5,8], moeda:[4,6,7], larg:[9,10,24,12,13,12,15,13,13] }
    ];
  }
  function guardarFicheiro(blob, nome){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function csvDe(folha){
    function cel(v, ehData){
      if(v instanceof Date) return v.toISOString().slice(8, 10) + '/' + v.toISOString().slice(5, 7) + '/' + v.toISOString().slice(0, 4);
      if(typeof v === 'number') return String(v).replace('.', ',');
      return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
    }
    return '\ufeff' + [folha.cab.map(function(c){ return '"' + c + '"'; }).join(';')]
      .concat(folha.linhas.map(function(l){ return l.map(cel).join(';'); })).join('\r\n');
  }
  function nomeFicheiro(base){ return base + '-' + new Date().toISOString().slice(0, 10); }
  function exportarCSV(folha, base){
    guardarFicheiro(new Blob([csvDe(folha)], { type:'text/csv;charset=utf-8' }), nomeFicheiro(base) + '.csv');
  }
  function exportarExcel(folhas, base){
    mostrarEstado('A preparar o ficheiro…');
    carregarXLSX().then(function(X){
      var wb = X.utils.book_new();
      folhas.forEach(function(f){
        var ws = X.utils.aoa_to_sheet([f.cab].concat(f.linhas), { cellDates:true });
        ws['!cols'] = (f.larg || []).map(function(w){ return { wch:w }; });
        f.linhas.forEach(function(l, r){
          f.datas.forEach(function(c){ var cell = ws[X.utils.encode_cell({ r:r + 1, c:c })]; if(cell && cell.t === 'd') cell.z = 'dd/mm/yyyy'; });
          f.moeda.forEach(function(c){ var cell = ws[X.utils.encode_cell({ r:r + 1, c:c })]; if(cell && cell.t === 'n') cell.z = '#,##0.00'; });
        });
        X.utils.book_append_sheet(wb, ws, f.nome);
      });
      X.writeFile(wb, nomeFicheiro(base) + '.xlsx');
      mostrarEstado('Ficheiro exportado');
    }).catch(function(){
      mostrarEstado('Não foi possível criar o Excel (sem acesso à biblioteca). A descarregar CSV.');
      exportarCSV(folhas[0], base);
    });
  }
  byId('btnExcel').addEventListener('click', function(){ exportarExcel(linhasExport(), 'custos-mensais'); });
  byId('btnCsv').addEventListener('click', function(){ exportarCSV(linhasExport()[0], 'custos-mensais-lancamentos'); });
  byId('pesqExportar').addEventListener('click', function(){
    var linhas = pesqResultados.map(function(i){
      return [dataISO(i.data), mesesAbrev[i.mes] + ' ' + i.ano, i.origem ? nomesPessoa[i.origem] : nomesPessoa[pessoaAtual], i.tipo === 'fixo' ? 'Fixo' : 'Opcional', nomeCategoria(i.categoria), i.nome, i.valor];
    });
    exportarExcel([{ nome:'Pesquisa', cab:['Data','Mês','Pessoa','Tipo','Categoria','Nome','Valor (€)'], linhas:linhas, datas:[0], moeda:[6], larg:[12,9,9,10,13,28,11] }], 'custos-mensais-pesquisa');
  });

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

  // ---------- Ler QR de fatura (AT) ----------
  var qaStream = null, qaScan = false, qaDetector = null, qaAvisoTimer = null;
  var JSQR_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
  function carregarScript(src){
    return new Promise(function(resolve, reject){
      var el = document.createElement('script');
      el.src = src;
      el.onload = function(){ resolve(); };
      el.onerror = function(){ el.remove(); reject(new Error(src)); };
      document.head.appendChild(el);
    });
  }
  function carregarJsQR(){
    if(window.jsQR) return Promise.resolve(window.jsQR);
    return carregarScript('/vendor/jsQR.js').catch(function(){ return carregarScript(JSQR_URL); })
      .then(function(){ if(!window.jsQR) throw new Error('jsQR'); return window.jsQR; });
  }
  // QR da fatura portuguesa: campos "A:NIF*F:AAAAMMDD*G:documento*O:total*..."
  function lerQrAT(texto){
    var c = {};
    String(texto || '').split('*').forEach(function(p){ var i = p.indexOf(':'); if(i > 0) c[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
    var total = parseFloat(String(c.O || '').replace(',', '.'));
    var f = c.F || '';
    var data = /^\d{8}$/.test(f) ? f.slice(0, 4) + '-' + f.slice(4, 6) + '-' + f.slice(6, 8) : (/^\d{4}-\d{2}-\d{2}$/.test(f) ? f : '');
    if(!c.A || !(total > 0) || !data) return null;
    return { nif: c.A, total: total, data: data, doc: c.G || '', atcud: c.H || '' };
  }
  function procurarFatura(id){
    var achado = null;
    function ver(m){ ['fixo','opcional'].forEach(function(t){ (m[t] || []).forEach(function(i){ if(!achado && i.fatura === id) achado = i; }); }); }
    ['tiago','claudia'].forEach(function(p){ Object.keys(dados[p]).forEach(function(k){ ver(dados[p][k]); }); });
    Object.keys(dados.casalOpcional).forEach(function(k){ ver(dados.casalOpcional[k]); });
    return achado;
  }
  function qrAviso(msg){
    var el = byId('qaQrMsg');
    el.textContent = msg;
    clearTimeout(qaAvisoTimer);
    qaAvisoTimer = setTimeout(function(){ if(qaScan) el.textContent = 'Aponta ao QR da fatura.'; }, 3000);
  }
  function qrParar(){
    qaScan = false;
    if(qaStream){ qaStream.getTracks().forEach(function(t){ t.stop(); }); qaStream = null; }
    var v = byId('qaVideo');
    if(v) v.srcObject = null;
  }
  function qrTratar(texto, imagem){
    var f = lerQrAT(texto);
    if(!f){ qrAviso('Este QR não parece ser de uma fatura portuguesa. Tenta outro.'); return false; }
    qrParar();
    qaModo('manual');
    qaNatureza('gasto');
    qaQrTexto = texto;
    if(imagem){ qaImagem = imagem; qaAtualizarAnexo(); }
    qaNif = f.nif;
    qaFatura = f.nif + '|' + (f.doc || f.atcud || (f.data + f.total));
    byId('qaValor').value = f.total.toFixed(2);
    byId('qaData').value = f.data;
    var loja = (dados.lojas || {})[f.nif];
    byId('qaNome').value = loja && loja.nome ? loja.nome : '';
    if(loja && loja.categoria){ qaCat = loja.categoria; qaRenderCats(); }
    var p = f.data.split('-');
    var txt = 'Fatura lida: ' + euros(f.total) + ' · ' + p[2] + '/' + p[1] + '/' + p[0] + ' · NIF ' + f.nif +
      (loja ? '' : '. Loja nova: escolhe a categoria e um nome, da próxima vez fica automático.');
    var existente = procurarFatura(qaFatura);
    if(existente) txt += ' ⚠ Esta fatura já foi adicionada' + (existente.data ? ' (' + formatarData(existente.data) + ')' : '') + '.';
    var info = byId('qaInfo');
    info.textContent = txt;
    info.className = 'qa-info' + (existente ? ' aviso' : '');
    info.hidden = false;
    return true;
  }
  function descodificarCanvas(fonte, w, h, max, tentarInvertido){
    var esc = Math.min(1, max / Math.max(w, h));
    var cw = Math.round(w * esc), ch = Math.round(h * esc);
    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    var cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(fonte, 0, 0, cw, ch);
    var im = cx.getImageData(0, 0, cw, ch);
    var r = window.jsQR(im.data, cw, ch, { inversionAttempts: tentarInvertido ? 'attemptBoth' : 'dontInvert' });
    return r ? r.data : null;
  }
  function lerFrame(){
    var v = byId('qaVideo');
    if(!v.videoWidth) return Promise.resolve(null);
    if(qaDetector) return qaDetector.detect(v).then(function(r){ return r.length ? r[0].rawValue : null; });
    return Promise.resolve(descodificarCanvas(v, v.videoWidth, v.videoHeight, 960));
  }
  function qrLoop(){
    if(!qaScan) return;
    lerFrame().then(function(t){
      if(!qaScan) return;
      if(t){
        var img = null;
        try{ var vv = byId('qaVideo'); img = comprimirImagem(vv, vv.videoWidth, vv.videoHeight, 1280); }catch(e){}
        if(!qrTratar(t, img)) setTimeout(qrLoop, 1200);
      }
      else setTimeout(qrLoop, 150);
    }).catch(function(){ setTimeout(qrLoop, 300); });
  }
  async function qrIniciar(){
    var msg = byId('qaQrMsg');
    msg.textContent = 'A abrir a câmara…';
    try{
      if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('sem câmara');
      qaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      var v = byId('qaVideo');
      v.srcObject = qaStream;
      await v.play();
      try{
        var faixa = qaStream.getVideoTracks()[0], caps = faixa.getCapabilities ? faixa.getCapabilities() : null;
        if(caps && caps.focusMode && caps.focusMode.indexOf('continuous') !== -1) await faixa.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }catch(e){}
    }catch(e){
      msg.textContent = 'Não foi possível usar a câmara (permissão negada?). Podes tirar uma foto ao QR aqui em baixo ou usar o modo Manual.';
      return;
    }
    if(byId('qaVistaQr').hidden){ qrParar(); return; }
    msg.textContent = 'Aponta ao QR da fatura.';
    qaScan = true;
    qaDetector = null;
    try{ if('BarcodeDetector' in window) qaDetector = new BarcodeDetector({ formats: ['qr_code'] }); }catch(e){ qaDetector = null; }
    if(!qaDetector){
      try{ await carregarJsQR(); }
      catch(e){ msg.textContent = 'Não foi possível carregar o leitor de QR (falta o ficheiro vendor/jsQR.js ou a internet). Usa o modo Manual.'; qrParar(); return; }
    }
    qrLoop();
  }
  function qaModo(m){
    var qr = m === 'qr';
    byId('qaVistaQr').hidden = !qr;
    byId('qaVistaManual').hidden = qr;
    byId('qaModoManual').classList.toggle('ativo', !qr);
    byId('qaModoQr').classList.toggle('ativo', qr);
    if(qr) qrIniciar(); else qrParar();
  }
  byId('qaModoManual').addEventListener('click', function(){ qaModo('manual'); });
  byId('qaModoQr').addEventListener('click', function(){ qaModo('qr'); });
  byId('qaFoto').addEventListener('change', async function(){
    var ficheiro = this.files && this.files[0];
    this.value = '';
    if(!ficheiro) return;
    qrAviso('A ler a foto…');
    try{
      var bmp = await createImageBitmap(ficheiro);
      var texto = null;
      if('BarcodeDetector' in window){
        try{ var r = await new BarcodeDetector({ formats: ['qr_code'] }).detect(bmp); if(r.length) texto = r[0].rawValue; }catch(e){}
      }
      if(!texto){
        try{ await carregarJsQR(); }catch(e){ qrAviso('Não foi possível carregar o leitor de QR (falta o ficheiro vendor/jsQR.js ou a internet).'); return; }
        [1600, 1000, 2400].some(function(max){ texto = descodificarCanvas(bmp, bmp.width, bmp.height, max, true); return !!texto; });
      }
      if(texto){ var imgF = null; try{ imgF = comprimirImagem(bmp, bmp.width, bmp.height, 1280); }catch(e){} qrTratar(texto, imgF); } else qrAviso('Não encontrei um QR na foto. Tenta aproximar mais.');
    }catch(e){ qrAviso('Não consegui ler a foto.'); }
  });
  // permite testar/injetar o texto de um QR sem câmara
  document.addEventListener('qa-qr-texto', function(e){ qrTratar(e.detail); });

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

  // ---------- Faturas guardadas (garantias) ----------
  var qaImagem = null, qaQrTexto = null, qaNat = 'gasto';
  var faturasCache = null, fatAtual = null, fatUrl = null;
  var PEND_KEY = 'custos-faturas-pendentes', pendMem = null, aEnviarFaturas = false;

  function comprimirImagem(fonte, w, h, max, qualidade){
    var esc = Math.min(1, max / Math.max(w, h));
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * esc)); cv.height = Math.max(1, Math.round(h * esc));
    cv.getContext('2d').drawImage(fonte, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', qualidade || 0.72);
  }
  function gerarMini(dataUrl){
    return new Promise(function(resolve, reject){
      var img = new Image();
      img.onload = function(){ try{ resolve(comprimirImagem(img, img.naturalWidth, img.naturalHeight, 140, 0.6)); }catch(e){ reject(e); } };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
  function lerPendentes(){
    if(pendMem) return pendMem;
    try{ pendMem = JSON.parse(localStorage.getItem(PEND_KEY) || '[]') || []; }catch(e){ pendMem = []; }
    return pendMem;
  }
  function gravarPendentes(l){
    pendMem = l;
    try{ localStorage.setItem(PEND_KEY, JSON.stringify(l)); }catch(e){}
  }
  async function enviarFaturas(){
    if(aEnviarFaturas) return;
    aEnviarFaturas = true;
    falhaFaturas = false;
    try{
      var lista = lerPendentes().slice();
      for(var i = 0; i < lista.length; i++){
        var p = lista[i];
        var r = await fetch('/api/faturas', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: p.id, meta: p.meta, imagem: p.imagem }) });
        if(r.ok || (r.status >= 400 && r.status < 500)){
          gravarPendentes(lerPendentes().filter(function(x){ return x.id !== p.id; }));
          faturasCache = null;
        } else { falhaFaturas = true; break; }
      }
    }catch(e){ falhaFaturas = true; }
    aEnviarFaturas = false;
    renderAviso();
    if(!byId('viewFaturas').hidden) renderFaturas();
  }
  async function enfileirarFatura(id, meta, imagem){
    if(imagem){ try{ meta.mini = await gerarMini(imagem); }catch(e){} }
    var l = lerPendentes().slice();
    l.push({ id: id, meta: meta, imagem: imagem || null });
    gravarPendentes(l);
    enviarFaturas();
  }
  async function carregarFaturas(){
    var r = await fetch('/api/faturas', { cache:'no-store' });
    if(!r.ok) throw new Error('HTTP ' + r.status);
    faturasCache = (await r.json()).faturas || [];
    return faturasCache;
  }
  function renderFaturas(){
    if(!faturasCache) byId('fatResumo').textContent = 'A carregar…';
    (faturasCache ? Promise.resolve(faturasCache) : carregarFaturas()).then(desenharFaturas)
      .catch(function(){ byId('fatResumo').textContent = 'Não foi possível carregar as faturas (sem ligação?).'; });
  }
  function desenharFaturas(lista){
    var texto = semAcentos(byId('fatTexto').value.trim());
    var todas = lerPendentes().map(function(p){ var m = Object.assign({}, p.meta); m.id = p.id; m.pendente = true; m.temImagem = !!p.imagem; return m; }).concat(lista);
    var vis = todas.filter(function(f){
      return !texto || semAcentos([f.nome, f.loja, f.nota, f.nif, f.pessoa, f.categoria ? nomeCategoria(f.categoria) : ''].join(' ')).indexOf(texto) !== -1;
    });
    byId('fatResumo').textContent = vis.length + (vis.length === 1 ? ' fatura' : ' faturas') + (vis.length !== todas.length ? ' (de ' + todas.length + ')' : '');
    var cont = byId('fatLista');
    cont.innerHTML = '';
    if(vis.length === 0){
      var v = document.createElement('div'); v.className = 'vazio';
      v.textContent = todas.length ? 'Nada encontrado.' : 'Ainda não há faturas guardadas. Lê um QR ou anexa uma foto ao adicionar um gasto.';
      cont.appendChild(v);
    }
    vis.forEach(function(f){
      var row = document.createElement('div');
      row.className = 'pesq-linha fat-linha';
      row.tabIndex = 0;
      var mini = document.createElement('div');
      mini.className = 'fat-mini';
      if(f.mini){ var im = document.createElement('img'); im.src = f.mini; im.alt = ''; mini.appendChild(im); } else mini.textContent = '🧾';
      var info = document.createElement('div');
      info.className = 'fat-info';
      var nome = document.createElement('div'); nome.className = 'pesq-nome'; nome.textContent = f.nome || 'Fatura';
      var meta = document.createElement('div'); meta.className = 'pesq-meta';
      var p = (f.data || '').split('-');
      meta.textContent = (p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '') + (f.pessoa ? ' · ' + f.pessoa : '') + (f.nif ? ' · NIF ' + f.nif : '') + (f.pendente ? ' · a enviar…' : (f.temImagem ? '' : ' · sem foto'));
      info.appendChild(nome); info.appendChild(meta);
      if(f.nota){ var n = document.createElement('div'); n.className = 'pesq-meta fat-nota'; n.textContent = f.nota; info.appendChild(n); }
      var val = document.createElement('div'); val.className = 'pesq-valor'; val.textContent = euros(f.total);
      row.appendChild(mini); row.appendChild(info); row.appendChild(val);
      function abrir(){ abrirFatura(f.id); }
      row.addEventListener('click', abrir);
      row.addEventListener('keydown', function(e){ if(e.key === 'Enter') abrir(); });
      cont.appendChild(row);
    });
  }
  byId('fatTexto').addEventListener('input', function(){ if(faturasCache) desenharFaturas(faturasCache); });

  function fecharFatura(){
    byId('fatOverlay').hidden = true;
    if(fatUrl){ try{ URL.revokeObjectURL(fatUrl); }catch(e){} fatUrl = null; }
    fatAtual = null;
  }
  async function abrirFatura(id){
    var f = null, imagemLocal = null;
    var p = lerPendentes().filter(function(x){ return x.id === id; })[0];
    if(p){ f = Object.assign({}, p.meta); f.id = id; f.pendente = true; imagemLocal = p.imagem; }
    else{
      try{ f = (faturasCache || await carregarFaturas()).filter(function(x){ return x.id === id; })[0]; }catch(e){}
    }
    if(!f){ qaMostrarToast('Fatura não encontrada (ou sem ligação).'); return; }
    fatAtual = f;
    byId('fatTitulo').textContent = f.nome || 'Fatura';
    var d = (f.data || '').split('-');
    byId('fatDetalhe').textContent = euros(f.total) + (d.length === 3 ? ' · ' + d[2] + '/' + d[1] + '/' + d[0] : '') + (f.pessoa ? ' · ' + f.pessoa : '') +
      (f.nif ? ' · NIF ' + f.nif : '') + (f.doc ? ' · ' + f.doc : '') + (f.categoria ? ' · ' + nomeCategoria(f.categoria) : '') + (f.pendente ? ' · a enviar…' : '');
    byId('fatNota').value = f.nota || '';
    var wrap = byId('fatImgWrap'), dl = byId('fatDescarregar');
    wrap.innerHTML = '';
    dl.hidden = true;
    byId('fatOverlay').hidden = false;
    function mostrarImg(src){
      var im = document.createElement('img'); im.src = src; im.alt = 'Fatura'; wrap.appendChild(im);
      dl.href = src; dl.download = 'fatura-' + (f.data || '') + '-' + (f.nome || 'fatura').replace(/[^A-Za-z0-9]+/g, '_') + '.jpg'; dl.hidden = false;
    }
    if(imagemLocal) mostrarImg(imagemLocal);
    else if(f.temImagem){
      wrap.textContent = 'A carregar a imagem…';
      try{
        var r = await fetch('/api/faturas?id=' + encodeURIComponent(id));
        if(!r.ok) throw new Error('HTTP ' + r.status);
        var blob = await r.blob();
        if(!fatAtual || fatAtual.id !== id) return;
        fatUrl = URL.createObjectURL(blob);
        wrap.innerHTML = '';
        mostrarImg(fatUrl);
      }catch(e){ wrap.textContent = 'Não foi possível carregar a imagem.'; }
    } else wrap.textContent = 'Esta fatura foi guardada só com os dados do QR (sem foto).';
  }
  byId('fatFechar').addEventListener('click', fecharFatura);
  byId('fatOverlay').addEventListener('click', function(e){ if(e.target === byId('fatOverlay')) fecharFatura(); });
  byId('fatGuardarNota').addEventListener('click', async function(){
    if(!fatAtual || fatAtual.pendente) { qaMostrarToast('Aguarda o envio da fatura para editar a nota.'); return; }
    var meta = Object.assign({}, fatAtual, { nota: byId('fatNota').value.trim() });
    delete meta.temImagem;
    try{
      var r = await fetch('/api/faturas', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: fatAtual.id, meta: meta }) });
      if(!r.ok) throw new Error();
      faturasCache = null;
      qaMostrarToast('Nota guardada.');
      fecharFatura();
      if(!byId('viewFaturas').hidden) renderFaturas();
    }catch(e){ qaMostrarToast('Não foi possível guardar a nota.'); }
  });
  byId('fatApagar').addEventListener('click', async function(){
    if(!fatAtual || !confirm('Apagar esta fatura guardada? Esta ação não se pode desfazer.')) return;
    var id = fatAtual.id;
    try{
      if(fatAtual.pendente) gravarPendentes(lerPendentes().filter(function(x){ return x.id !== id; }));
      else{
        var r = await fetch('/api/faturas?id=' + encodeURIComponent(id), { method:'DELETE' });
        if(!r.ok) throw new Error();
      }
      faturasCache = null;
      fecharFatura();
      if(!byId('viewFaturas').hidden) renderFaturas();
    }catch(e){ qaMostrarToast('Não foi possível apagar.'); }
  });

  // ---------- Painel +: poupança e anexos ----------
  function qaNatureza(nat){
    qaNat = nat;
    var simples = nat !== 'gasto';
    byId('qaNatGasto').classList.toggle('ativo', nat === 'gasto');
    byId('qaNatPoup').classList.toggle('ativo', nat === 'poupanca');
    byId('qaNatInvest').classList.toggle('ativo', nat === 'investido');
    byId('qaCats').hidden = simples;
    byId('qaAnexoBox').hidden = simples;
    byId('qaTipo').hidden = simples;
    byId('qaNome').placeholder = simples ? 'Nota (opcional)' : 'Nome (opcional)';
  }
  function qaAtualizarAnexo(){
    var th = byId('qaThumb');
    if(qaImagem){ th.src = qaImagem; th.hidden = false; } else { th.removeAttribute('src'); th.hidden = true; }
    byId('qaAnexoRem').hidden = !qaImagem;
  }
  byId('qaNatGasto').addEventListener('click', function(){ qaNatureza('gasto'); });
  byId('qaNatPoup').addEventListener('click', function(){ qaNatureza('poupanca'); });
  byId('qaNatInvest').addEventListener('click', function(){ qaNatureza('investido'); });
  byId('qaAnexo').addEventListener('change', async function(){
    var fi = this.files && this.files[0];
    this.value = '';
    if(!fi) return;
    try{
      var bmp = await createImageBitmap(fi);
      qaImagem = comprimirImagem(bmp, bmp.width, bmp.height, 1280);
      qaAtualizarAnexo();
    }catch(e){ qaMostrarToast('Não consegui ler a foto.'); }
  });
  byId('qaAnexoRem').addEventListener('click', function(){ qaImagem = null; qaAtualizarAnexo(); });

  function qaMostrarToast(txt){
    var t = byId('qaToast');
    t.textContent = txt;
    t.hidden = false;
    clearTimeout(qaToastTimer);
    qaToastTimer = setTimeout(function(){ t.hidden = true; }, 3000);
  }
  function qaGuardar(){
    var valor = parseFloat(byId('qaValor').value);
    if(!(valor > 0)){ byId('qaValor').focus(); return; }
    var data = byId('qaData').value || hojeISO();
    var ano = parseInt(data.slice(0, 4), 10), mes = parseInt(data.slice(5, 7), 10) - 1;
    if(isNaN(ano) || isNaN(mes)){ data = hojeISO(); ano = parseInt(data.slice(0, 4), 10); mes = parseInt(data.slice(5, 7), 10) - 1; }
    var pessoa = byId('qaPessoa').value;
    var nomeTxt = byId('qaNome').value.trim();

    if(qaNat !== 'gasto'){
      var cfg = LISTAS_MES[qaNat];
      var alvo = pessoa === 'casal' ? casalOpcionalMes(ano, mes) : mesPessoa(pessoa, ano, mes);
      if(!alvo[cfg.campo]) alvo[cfg.campo] = [];
      alvo[cfg.campo].push({ id: uid(), nome: nomeTxt || cfg.padrao, valor: valor, data: data });
      guardar();
      byId('qaOverlay').hidden = true;
      renderTudo();
      qaMostrarToast((qaNat === 'investido' ? 'Investimento: ' : 'Poupança: ') + euros(valor) + ' (' + nomesPessoa[pessoa] + ', ' + mesesAbrev[mes] + ')');
      return;
    }

    var tipo = pessoa === 'casal' ? 'opcional' : byId('qaTipo').value;
    var novo = { id: uid(), nome: nomeTxt || nomeCategoria(qaCat), valor: valor, categoria: qaCat, data: data };
    if(qaFatura) novo.fatura = qaFatura;
    var nota = byId('qaNota').value.trim();
    if(qaImagem || qaQrTexto || nota){
      var fid = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      novo.anexo = fid;
      var loja = qaNif && dados.lojas[qaNif] ? dados.lojas[qaNif].nome : '';
      enfileirarFatura(fid, {
        nome: nomeTxt || loja || nomeCategoria(qaCat), loja: loja || '', total: valor, data: data, nif: qaNif || '',
        doc: qaFatura ? qaFatura.split('|').slice(1).join('|') : '', categoria: qaCat, pessoa: nomesPessoa[pessoa],
        nota: nota, qr: qaQrTexto || '', criado: Date.now()
      }, qaImagem);
    }
    if(qaNif){
      var antigo = dados.lojas[qaNif] || {};
      dados.lojas[qaNif] = { nome: nomeTxt || antigo.nome || '', categoria: qaCat };
    }
    if(pessoa === 'casal') casalOpcionalMes(ano, mes).opcional.push(novo);
    else mesPessoa(pessoa, ano, mes)[tipo].push(novo);
    setCatAberta(tipo, qaCat, true);
    guardar();
    byId('qaOverlay').hidden = true;
    renderTudo();
    qaMostrarToast('Adicionado: ' + nomeCategoria(qaCat) + ' · ' + euros(valor) + ' (' + nomesPessoa[pessoa] + ', ' + mesesAbrev[mes] + ')');
  }

  // ---------- Resumo do mês em frases ----------
  function renderResumoFrases(){
    var cont = byId('resumoFrases');
    cont.innerHTML = '';
    var pl = pessoaAtual === 'casal';
    function v(s, p){ return pl ? p : s; }
    var vista = vistaMes(pessoaAtual, anoAtual, mesAtual);
    var itens = vista.fixo.concat(vista.opcional);
    var total = somaLista(itens), to = somaLista(vista.opcional), tp = somaLista(vista.poupanca), ti = somaLista(vista.investido);
    var linhas = [];
    function add(txt, cls){ linhas.push({ txt: txt, cls: cls || '' }); }
    if(!itens.length && !tp && !ti && !vista.salario){
      add('Ainda sem lançamentos neste mês.');
    } else {
      var ma = mesAtual - 1, aa = anoAtual;
      if(ma < 0){ ma = 11; aa--; }
      var ant = itensDoMes(pessoaAtual, aa, ma, 'todos'), totalAnt = somaLista(ant);
      var nomeMes = meses[mesAtual], nomeAnt = meses[ma];
      if(total > 0){
        var t = v('Gastaste ', 'Gastaram ') + euros(total) + ' em ' + nomeMes;
        if(totalAnt > 0){
          var dif = total - totalAnt, pct = Math.round(Math.abs(dif) / totalAnt * 100);
          if(pct === 0) add(t + ', o mesmo que em ' + nomeAnt + '.');
          else add(t + ': ' + pct + '% ' + (dif > 0 ? 'mais' : 'menos') + ' do que em ' + nomeAnt + ' (' + (dif > 0 ? '+' : '−') + euros(Math.abs(dif)) + ').', dif > 0 ? 'sobe' : 'desce');
        } else add(t + '.');
        var maior = itens.reduce(function(m, i){ return (Number(i.valor) || 0) > (m ? Number(m.valor) || 0 : 0) ? i : m; }, null);
        if(maior) add('A maior despesa foi «' + maior.nome + '» (' + euros(maior.valor) + ').');
        var tc = totaisPorCategoria(itens);
        var ids = Object.keys(tc).sort(function(a, b){ return tc[b] - tc[a]; });
        if(ids.length) add(nomeCategoria(ids[0]) + ' foi onde mais ' + v('gastaste', 'gastaram') + ': ' + euros(tc[ids[0]]) + ' (' + Math.round(tc[ids[0]] / total * 100) + '% do total).');
        if(totalAnt > 0){
          var ta = totaisPorCategoria(ant), melhor = null, melhorD = 0;
          ids.forEach(function(id){ var d = (tc[id] || 0) - (ta[id] || 0); if(d > melhorD){ melhorD = d; melhor = id; } });
          if(melhor && melhorD >= 10) add('O que mais subiu face a ' + nomeAnt + ': ' + nomeCategoria(melhor) + ' (+' + euros(melhorD) + ').', 'sobe');
        }
      }
      if(vista.salario > 0){
        var saldo = vista.salario - total - tp - ti;
        add(saldo >= 0 ? 'Do salário ainda sobram ' + euros(saldo) + '.' : v('Estás ', 'Estão ') + euros(-saldo) + ' acima do salário.', saldo >= 0 ? 'desce' : 'sobe');
      }
      if(tp > 0) add(v('Poupaste ', 'Pouparam ') + euros(tp) + (vista.salario > 0 ? ' (' + Math.round(tp / vista.salario * 100) + '% do salário).' : '.'));
      if(ti > 0) add(v('Investiste ', 'Investiram ') + euros(ti) + (vista.salario > 0 ? ' (' + Math.round(ti / vista.salario * 100) + '% do salário).' : '.'));
      var hoje = new Date();
      if(anoAtual === hoje.getFullYear() && mesAtual === hoje.getMonth() && hoje.getDate() >= 3 && to > 0){
        var dias = new Date(anoAtual, mesAtual + 1, 0).getDate(), media = to / hoje.getDate();
        add('Nos opcionais ' + v('gastas', 'gastam') + ' em média ' + euros(media) + ' por dia; a este ritmo acabam o mês perto de ' + euros(media * dias) + '.');
      }
    }
    var tit = document.createElement('div');
    tit.className = 'rf-titulo';
    tit.textContent = 'Resumo de ' + meses[mesAtual] + ' · ' + nomesPessoa[pessoaAtual];
    var ul = document.createElement('ul');
    linhas.forEach(function(l){ var li = document.createElement('li'); li.className = l.cls; li.textContent = l.txt; ul.appendChild(li); });
    cont.appendChild(tit);
    cont.appendChild(ul);
  }

  // ---------- Cópias de segurança (restaurar versões antigas) ----------
  function bkQuando(b){
    if(b.tipo === 'original') return 'Original (antes das atualizações)';
    var dt = new Date(b.quando);
    var dia = dt.toLocaleDateString('pt-PT');
    var hora = b.tipo === 'hora' ? String(dt.getHours()).padStart(2, '0') + ':00' : dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    return (b.tipo === 'antes' ? 'Antes de um restauro · ' : '') + dia + ' ' + hora;
  }
  function bkResumoTxt(r){
    return r.meses + ' meses · ' + r.lancamentos + ' lançamentos · gastos ' + euros(r.gastos) + ' · poupança ' + euros(r.poupado) + ' · ' + r.investimentos + ' investimentos';
  }
  function bkFechar(){ byId('bkOverlay').hidden = true; }
  async function bkAbrir(){
    var cont = byId('bkConteudo');
    byId('bkOverlay').hidden = false;
    cont.textContent = 'A carregar…';
    try{
      var r = await fetch('/api/backups', { cache:'no-store' });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      var lista = (await r.json()).backups || [];
      cont.innerHTML = '';
      if(lista.length === 0){ cont.textContent = 'Ainda não há cópias de segurança.'; return; }
      lista.slice(0, 80).forEach(function(b){
        var row = document.createElement('div');
        row.className = 'pesq-linha';
        row.tabIndex = 0;
        var t = document.createElement('div'); t.className = 'pesq-nome'; t.textContent = bkQuando(b);
        var seta = document.createElement('div'); seta.className = 'pesq-meta'; seta.textContent = 'ver ›';
        row.appendChild(t); row.appendChild(seta);
        function ver(){ bkVer(b); }
        row.addEventListener('click', ver);
        row.addEventListener('keydown', function(e){ if(e.key === 'Enter') ver(); });
        cont.appendChild(row);
      });
    }catch(e){ cont.textContent = 'Não foi possível carregar as cópias (sem ligação?).'; }
  }
  async function bkVer(b){
    var cont = byId('bkConteudo');
    cont.textContent = 'A carregar…';
    try{
      var r = await fetch('/api/backups?id=' + encodeURIComponent(b.id), { cache:'no-store' });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      var j = await r.json();
      cont.innerHTML = '';
      var tit = document.createElement('div'); tit.className = 'qa-topo'; tit.textContent = bkQuando(b);
      var c1 = document.createElement('div'); c1.className = 'qa-info'; c1.textContent = 'Esta cópia: ' + bkResumoTxt(j.copia);
      var c2 = document.createElement('div'); c2.className = 'qa-info'; c2.textContent = 'Agora: ' + bkResumoTxt(j.atual);
      var linha = document.createElement('div'); linha.className = 'qa-linha';
      var voltar = document.createElement('button'); voltar.type = 'button'; voltar.className = 'qa-foto'; voltar.textContent = 'Voltar';
      voltar.addEventListener('click', bkAbrir);
      var rest = document.createElement('button'); rest.type = 'button'; rest.className = 'qa-guardar'; rest.textContent = 'Restaurar esta versão';
      rest.addEventListener('click', function(){ bkRestaurar(b); });
      linha.appendChild(voltar); linha.appendChild(rest);
      [tit, c1, c2, linha].forEach(function(x){ cont.appendChild(x); });
    }catch(e){ cont.textContent = 'Não foi possível abrir esta cópia.'; }
  }
  async function bkRestaurar(b){
    if(sujo || aSincronizar){ qaMostrarToast('Há alterações a ser guardadas. Tenta de novo daqui a uns segundos.'); return; }
    if(!confirm('Restaurar esta versão? Os dados atuais serão substituídos (é guardada antes uma cópia do estado de agora, por isso podes voltar atrás).')) return;
    try{
      var r = await fetch('/api/backups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: b.id, confirmar: true }) });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      try{ localStorage.removeItem(SYNC_KEY); }catch(e){}
      clearTimeout(guardarTimer);
      qaMostrarToast('Versão restaurada. A recarregar…');
      setTimeout(function(){ location.reload(); }, 600);
    }catch(e){ qaMostrarToast('Não foi possível restaurar.'); }
  }
  byId('btnBackups').addEventListener('click', bkAbrir);
  byId('avisoTentar').addEventListener('click', function(){ sincronizar(); enviarFaturas(); });
  window.addEventListener('offline', function(){ falhaSync = true; renderAviso(); });
  byId('bkFechar').addEventListener('click', bkFechar);
  byId('bkOverlay').addEventListener('click', function(e){ if(e.target === byId('bkOverlay')) bkFechar(); });

  function mostrarTab(tab){
    document.getElementById('viewExtrato').hidden = tab !== 'extrato';
    document.getElementById('viewGrafico').hidden = tab !== 'grafico';
    document.getElementById('viewInvestimentos').hidden = tab !== 'investimentos';
    document.getElementById('viewPesquisar').hidden = tab !== 'pesquisar';
    document.getElementById('viewFaturas').hidden = tab !== 'faturas';
    document.getElementById('tabFaturas').classList.toggle('ativo', tab === 'faturas');
    document.getElementById('tabPesquisar').classList.toggle('ativo', tab === 'pesquisar');
    document.getElementById('tabExtrato').classList.toggle('ativo', tab === 'extrato');
    document.getElementById('tabGrafico').classList.toggle('ativo', tab === 'grafico');
    document.getElementById('tabInvestimentos').classList.toggle('ativo', tab === 'investimentos');
    if(tab === 'grafico'){ renderGrafico(); renderCategorias(); renderResumoFrases(); }
    if(tab === 'investimentos') renderInvestimentos();
    if(tab === 'pesquisar') renderPesquisa();
    if(tab === 'faturas') renderFaturas();
  }
  document.getElementById('tabExtrato').addEventListener('click', function(){ mostrarTab('extrato'); });
  document.getElementById('tabGrafico').addEventListener('click', function(){ mostrarTab('grafico'); });
  document.getElementById('tabInvestimentos').addEventListener('click', function(){ mostrarTab('investimentos'); });
  document.getElementById('tabPesquisar').addEventListener('click', function(){ mostrarTab('pesquisar'); });
  document.getElementById('tabFaturas').addEventListener('click', function(){ mostrarTab('faturas'); });

  Array.prototype.forEach.call(document.querySelectorAll('.pessoa-tabs button'), function(btn){
    btn.addEventListener('click', function(){
      pessoaAtual = btn.getAttribute('data-p');
      Array.prototype.forEach.call(document.querySelectorAll('.pessoa-tabs button'), function(b){ b.classList.toggle('ativo', b === btn); });
      renderTudo();
      if(!document.getElementById('viewInvestimentos').hidden) renderInvestimentos();
    });
  });

  function renderTudo(){
    renderNav();
    renderSalarioBox();
    renderSecao('secaoFixo', 'fixo', 'Custos Fixos', 'fixo');
    renderSecao('secaoOpcional', 'opcional', 'Custos Opcionais', 'opcional');
    renderPoupanca();
    renderInvestido();
    atualizarTotaisMes();
    renderHistorico();
    if(!document.getElementById('viewGrafico').hidden){ renderGrafico(); renderCategorias(); renderResumoFrases(); }
    if(!document.getElementById('viewPesquisar').hidden) renderPesquisa();
  }

  document.getElementById('btnPrev').addEventListener('click', function(){
    mesAtual--; if(mesAtual < 0){ mesAtual = 11; anoAtual--; }
    renderTudo();
  });
  document.getElementById('btnNext').addEventListener('click', function(){
    mesAtual++; if(mesAtual > 11){ mesAtual = 0; anoAtual++; }
    renderTudo();
  });

  if('serviceWorker' in navigator && location.protocol === 'https:'){
    window.addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); });
  }

  (async function iniciar(){
    mostrarEstado('A carregar…');
    var ok = await carregar();
    if(!ok){
      var ac = document.getElementById('aCarregar');
      ac.className = 'erro-ligacao';
      ac.innerHTML = 'Não foi possível ligar ao servidor, por isso os dados não foram carregados (para não correr o risco de os apagar).<br><button type="button" onclick="location.reload()">Tentar de novo</button>';
      return;
    }
    iniciado = true;
    document.getElementById('app').hidden = false;
    document.getElementById('aCarregar').hidden = true;
    renderTudo();
    if(sujo){ mostrarEstado('A guardar…'); sincronizar(); } else { mostrarEstado('Guardado'); }
  })();
})();
