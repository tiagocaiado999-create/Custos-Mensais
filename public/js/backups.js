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

