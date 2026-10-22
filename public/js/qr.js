// @ts-check
  // ---------- Ler QR de fatura (AT) ----------
  var qaStream = null, qaScan = false, qaDetector = null, qaAvisoTimer = null, qaFrames = 0;
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
    qaFrames++;
    // o leitor nativo do telemóvel falha em silêncio com algumas câmaras: se não ler, o jsQR tenta em frames alternados
    var viaJs = function(){ return window.jsQR ? descodificarCanvas(v, v.videoWidth, v.videoHeight, 960, qaFrames % 4 === 0) : null; };
    if(qaDetector){
      return qaDetector.detect(v).then(function(r){ return r.length ? r[0].rawValue : (qaFrames % 2 ? null : viaJs()); })
        .catch(function(){ return viaJs(); });
    }
    return Promise.resolve(viaJs());
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
    qaFrames = 0;
    try{ await carregarJsQR(); }
    catch(e){
      if(!qaDetector){ msg.textContent = 'Não foi possível carregar o leitor de QR (falta o ficheiro vendor/jsQR.js ou a internet). Usa o modo Manual.'; qrParar(); return; }
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
  byId('qaFoto').addEventListener('change', /** @this {HTMLInputElement} */ async function(){
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
  document.addEventListener('qa-qr-texto', function(/** @type {CustomEvent} */ e){ qrTratar(e.detail); });

