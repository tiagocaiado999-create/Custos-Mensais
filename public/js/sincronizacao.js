// @ts-check
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
          /** @type {any} */ var json = {};
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
  // Pergunta por novidades de minuto a minuto, e só enquanto a pessoa está a usar a app: se ficar 5 minutos
  // sem mexer, pára de perguntar (poupa pedidos ao servidor) e volta a sincronizar logo que mexa outra vez.
  // Alterações pendentes continuam a ser enviadas sempre (isso não depende deste intervalo).
  var PARADO_MS = 5 * 60 * 1000;
  var ultimaAtividade = Date.now();
  function atividade(){
    var parado = Date.now() - ultimaAtividade > PARADO_MS;
    ultimaAtividade = Date.now();
    if(parado && iniciado && !document.hidden) sincronizar();
  }
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(function(ev){
    document.addEventListener(ev, atividade, { passive: true, capture: true });
  });
  setInterval(function(){
    if(!document.hidden && iniciado && Date.now() - ultimaAtividade < PARADO_MS) sincronizar();
  }, 60000);

