import Redis from 'ioredis';

// Ligação ao Redis, partilhada por todas as funções da pasta api/ (o `_` impede que seja uma rota).
let cliente: Redis | undefined;

export function getCliente(): Redis {
  if (!cliente) {
    const url = process.env.CustoMensal_REDIS_URL || process.env.REDIS_URL;
    if (!url) throw new Error('Variável de ligação ao Redis não encontrada');
    cliente = new Redis(url);
  }
  return cliente;
}
