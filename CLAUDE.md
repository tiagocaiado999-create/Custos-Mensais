# CLAUDE.md

Orientações para o Claude Code neste repositório.

## Sobre

Custos Mensais: site pessoal (PWA) para o Tiago e a Cláudia registarem gastos, poupança, investimentos e faturas, mais um simulador do carro elétrico. Interface, comentários e nomes em português (PT-PT). Publicado na Vercel (cada push para `main` faz o deploy): https://gastosmensais-delta.vercel.app

Sem framework, sem build, sem TypeScript: HTML + CSS + JavaScript puro em `public/`, e funções serverless em `api/` (Node, `ioredis`). Os dados ficam no Redis, nunca em ficheiros.

## Gerir tokens: lê só o que precisas

Os ficheiros são grandes. Não leias um ficheiro inteiro para mexer numa função: procura com Grep e lê só o trecho (`offset`/`limit`). Para a página principal, abre só o ficheiro `public/js/` da funcionalidade em causa.

## Mapa do projeto

`public/` (tudo o que o browser recebe)
- `index.html`: só a estrutura da página principal (sem CSS nem JS dentro).
- `style.css`: todo o CSS da página principal. Tema claro/escuro por variáveis (`--bg`, `--accent`, `--muted`…).
- `js/*.js`: lógica da página principal, **por ordem de carregamento**:
  1. `nucleo.js`: constantes, categorias, helpers (`euros`, `uid`, `hojeISO`), `normalizar` (migra dados antigos).
  2. `sincronizacao.js`: guardar/carregar com versões e fusão (`sincronizar`, `guardar`, `fundir`), aviso de falha.
  3. `extrato.js`: mês/pessoa, secções do extrato, totais, histórico anual, gráfico de barras.
  4. `investimentos.js`: ativos, preços em tempo real (`/api/preco`), gráfico investido vs. atual.
  5. `categorias-pesquisa.js`: gráfico por categoria e aba Pesquisar.
  6. `exportar.js`: Excel/CSV (carrega `vendor/xlsx` só quando se exporta).
  7. `adicionar.js`: botão `+` (novo gasto), sugestões de nomes.
  8. `qr.js`: leitura do QR das faturas (carrega `vendor/jsQR` só quando preciso).
  9. `listas-mes.js`: poupança e investido do mês.
  10. `faturas.js`: faturas guardadas (garantias), fila de envio pendente.
  11. `painel-mais.js`: painel `+` (poupança, investimento, anexos) e `qaGuardar`.
  12. `resumo.js`: resumo do mês em frases.
  13. `backups.js`: cópias de segurança (restaurar versões).
  14. `main.js`: abas, navegação de mês, `renderTudo`, registo do service worker, arranque.
- `carro.html`: simulador do carro (HTML, CSS e JS na mesma página). **Página escondida**: de propósito não tem ligação a partir da app.
- `gestao.html`: cópia completa, envio por email, estado do armazenamento. Também **escondida** de propósito.
- `sw.js`: service worker (rede primeiro, cache offline). `vendor/`: `jsQR`, `xlsx`.

`api/` (funções serverless): `data.js` (dados principais), `carro.js`, `faturas.js`, `backups.js`, `estado.js`, `preco.js`, `copia-email.js` (cron semanal, `vercel.json`).

## Regras que não podes quebrar

- **Os `js/*.js` são scripts clássicos que partilham o âmbito global** (já não há função à volta de tudo). A ordem das tags `<script>` no `index.html` conta: um ficheiro só pode usar, no arranque, o que vem antes. Para acrescentar um ficheiro: pôr a tag no `index.html`, juntá-lo a `PRE_CACHE` no `sw.js` e subir `VERSAO`.
- **Nunca mudar as chaves de `localStorage`** (`custos-mensais-pessoas-v2`, `custos-mensais-sync-v3`, `custos-mensais-recuperado-v3`, `custos-mensais-ui-cats`, `custos-faturas-pendentes`) nem os nomes dos campos guardados. Mudar quebra os dados já existentes e as alterações por sincronizar.
- **Estrutura dos dados** (`/api/data`): `dados.tiago['AAAA-MM']` e `dados.claudia[...]` = `{ salario, fixo[], opcional[], poupanca[], investido[] }`; `dados.casalOpcional['AAAA-MM']`; `dados.lojas[nif]`; `dados.investimentos[pessoa] = { ativos[], retirados[] }`. Valores monetários em euros (número decimal). Ao acrescentar campos, tratar o caso de dados antigos sem o campo (ver `normalizar`).
- **Não apagar nem sobrescrever dados reais** para testar. Testar com dados simulados.
- Depois de mexer no `sw.js`, os utilizadores só recebem a versão nova ao reabrir a app; subir `VERSAO` ao mudar `PRE_CACHE`.

## Como verificar alterações

Não há testes automáticos nem Node instalado nesta máquina. O que funcionou: servir `public/` num servidor local simples (PowerShell `HttpListener`) com respostas simuladas de `/api/data` e `/api/carro`, abrir no Chrome em modo headless (`--dump-dom`, ou `--screenshot` com `--window-size` alto) e comparar com a versão anterior do git. Confirmar sempre também no site publicado, depois do deploy.

## Ambiente

Windows, PowerShell. Atenção: um deploy pendente na Vercel faz parecer que a alteração "não funcionou" (ver o estado do último commit no GitHub).
