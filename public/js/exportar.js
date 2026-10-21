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

