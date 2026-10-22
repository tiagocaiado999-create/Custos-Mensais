// @ts-check
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

