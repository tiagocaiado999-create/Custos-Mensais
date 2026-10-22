// @ts-check
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
      var metaTxt = 'investido ' + euros(inv.valor) + (inv.data ? ' · ' + formatarData(inv.data) : '') + (temTicker ? ' · ' + esc(inv.ticker) : '');
      if(temAtual){
        var lucroPot = valorAtualEfetivo - Number(inv.valor);
        var pctPot = inv.valor > 0 ? (lucroPot / inv.valor * 100) : 0;
        metaTxt += ' · ' + (lucroPot >= 0 ? '+' : '') + euros(lucroPot) + ' (' + (pctPot >= 0 ? '+' : '') + pctPot.toFixed(1) + '%)';
      } else if(temTicker){
        metaTxt += ' · a obter preço…';
      }
      nomeEl.innerHTML = esc(inv.nome) + '<br><span class="meta' + (temAtual ? (valorAtualEfetivo >= Number(inv.valor) ? ' lucro-pos' : ' lucro-neg') : '') + '">' + metaTxt + '</span>';

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
      nomeEl.innerHTML = esc(inv.nome) + '<br><span class="meta">' + metaTxt + '</span>';
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
    var nomeEl = /** @type {HTMLInputElement} */ (document.getElementById('investNovoNome'));
    var tickerEl = /** @type {HTMLInputElement} */ (document.getElementById('investNovoTicker'));
    var valorEl = /** @type {HTMLInputElement} */ (document.getElementById('investNovoValor'));
    var dataEl = /** @type {HTMLInputElement} */ (document.getElementById('investNovaData'));
    var ticker = tickerEl.value.trim().toUpperCase();
    var nome = nomeEl.value.trim() || ticker;
    if(!nome) return;

    var precoCompra = '';
    var btn = /** @type {HTMLButtonElement} */ (document.getElementById('investAddBtn'));
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

