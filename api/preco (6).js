module.exports = async function handler(req, res) {
  try {
    var symbol = (req.query.symbol || '').toUpperCase().trim();
    if (!symbol) {
      res.status(400).json({ erro: 'Falta o parâmetro symbol' });
      return;
    }

    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=1d';
    var resposta = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!resposta.ok) {
      res.status(resposta.status).json({ erro: 'Yahoo Finance respondeu com erro ' + resposta.status });
      return;
    }

    var dados = await resposta.json();
    var resultado = dados && dados.chart && dados.chart.result && dados.chart.result[0];
    if (!resultado || !resultado.meta || resultado.meta.regularMarketPrice === undefined) {
      res.status(404).json({ erro: 'Símbolo não encontrado: ' + symbol });
      return;
    }

    var meta = resultado.meta;
    var preco = meta.regularMarketPrice;
    var anterior = meta.previousClose || meta.chartPreviousClose || preco;

    res.status(200).json({
      symbol: meta.symbol || symbol,
      preco: preco,
      variacao: preco - anterior,
      variacaoPct: anterior ? ((preco - anterior) / anterior) * 100 : 0,
      abertura: meta.regularMarketOpen || anterior,
      maximo: meta.regularMarketDayHigh || preco,
      minimo: meta.regularMarketDayLow || preco
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
};
