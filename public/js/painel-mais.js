// @ts-check
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
  byId('qaAnexo').addEventListener('change', /** @this {HTMLInputElement} */ async function(){
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

