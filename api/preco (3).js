module.exports = async function handler(req, res) {
  try {
    var entrada = (req.query.symbol || '').toUpperCase().trim();
    if (!entrada) {
      res.status(400).json({ erro: 'Falta o parâmetro symbol' });
      return;
    }

    var partes = entrada.split(':');
    var symbol = partes[0];
    var exchange = partes[1] || '';

    var chave = (process.env.TWELVEDATA_API_KEY || '').trim();
    if (!chave) {
      res.status(500).json({ erro: 'TWELVEDATA_API_KEY não está configurada nas variáveis de ambiente' });
      return;
    }

    var url = 'https://api.twelvedata.com/quote?symbol=' + encodeURIComponent(symbol) + '&apikey=' + chave;
    if (exchange) {
      url += '&exchange=' + encodeURIComponent(exchange);
    }
    var resposta = await fetch(url);
    var dados = await resposta.json();

    if (dados.status === 'error' || dados.code) {
      res.status(dados.code && dados.code !== 200 ? dados.code : 404).json({ erro: dados.message || 'Símbolo não encontrado: ' + symbol });
      return;
    }

    if (dados.close === undefined) {
      res.status(404).json({ erro: 'Símbolo não encontrado: ' + symbol });
      return;
    }

    res.status(200).json({
      symbol: dados.symbol || symbol,
      preco: parseFloat(dados.close),
      variacao: parseFloat(dados.change),
      variacaoPct: parseFloat(dados.percent_change),
      abertura: parseFloat(dados.open),
      maximo: parseFloat(dados.high),
      minimo: parseFloat(dados.low)
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
};
