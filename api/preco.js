module.exports = async function handler(req, res) {
  try {
    var symbol = (req.query.symbol || '').toUpperCase().trim();
    if (!symbol) {
      res.status(400).json({ erro: 'Falta o parâmetro symbol' });
      return;
    }

    var chave = (process.env.FINNHUB_API_KEY || '').trim();
    if (!chave) {
      res.status(500).json({ erro: 'FINNHUB_API_KEY não está configurada nas variáveis de ambiente' });
      return;
    }

    var url = 'https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(symbol) + '&token=' + chave;
    var resposta = await fetch(url);

    if (!resposta.ok) {
      var corpoErro = await resposta.text();
      res.status(resposta.status).json({ erro: 'Finnhub respondeu com erro ' + resposta.status, detalhe: corpoErro, tamanhoChave: chave.length });
      return;
    }

    var dados = await resposta.json();
    if (dados.c === undefined || dados.c === 0) {
      res.status(404).json({ erro: 'Símbolo não encontrado: ' + symbol });
      return;
    }

    res.status(200).json({
      symbol: symbol,
      preco: dados.c,
      variacao: dados.d,
      variacaoPct: dados.dp,
      abertura: dados.o,
      maximo: dados.h,
      minimo: dados.l
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
};
