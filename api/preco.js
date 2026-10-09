module.exports = async function handler(req, res) {
  try {
    var symbol = (req.query.symbol || '').toLowerCase().trim();
    if (!symbol) {
      res.status(400).json({ erro: 'Falta o parâmetro symbol' });
      return;
    }

    var url = 'https://stooq.com/q/l/?s=' + encodeURIComponent(symbol) + '&f=sd2t2ohlcv&h&e=csv';
    var resposta = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!resposta.ok) {
      res.status(resposta.status).json({ erro: 'Stooq respondeu com erro ' + resposta.status });
      return;
    }

    var texto = await resposta.text();
    var linhas = texto.trim().split('\n');
    if (linhas.length < 2) {
      res.status(404).json({ erro: 'Resposta vazia ou inesperada' });
      return;
    }

    var cabecalho = linhas[0].split(',');
    var valores = linhas[1].split(',');
    var dados = {};
    cabecalho.forEach(function (c, i) { dados[c.trim()] = valores[i]; });

    if (dados.Symbol === 'N/D' || dados.Close === 'N/D' || !dados.Close) {
      res.status(404).json({ erro: 'Símbolo não encontrado: ' + symbol });
      return;
    }

    var preco = parseFloat(dados.Close);
    var abertura = parseFloat(dados.Open);

    res.status(200).json({
      symbol: dados.Symbol,
      preco: preco,
      variacao: preco - abertura,
      variacaoPct: abertura ? ((preco - abertura) / abertura) * 100 : 0,
      abertura: abertura,
      maximo: parseFloat(dados.High),
      minimo: parseFloat(dados.Low)
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
};
