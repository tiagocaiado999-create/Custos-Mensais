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
