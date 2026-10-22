// @ts-check
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

