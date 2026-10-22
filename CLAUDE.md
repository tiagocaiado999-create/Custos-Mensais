# CLAUDE.md

Orientações para o Claude Code neste repositório.

## Sobre

Custos Mensais: site pessoal (PWA) para o Tiago e a Cláudia registarem gastos, poupança, investimentos e faturas, mais um simulador do carro elétrico. Interface, comentários e nomes em português (PT-PT). Publicado na Vercel (cada push para `main` faz o deploy): https://gastosmensais-delta.vercel.app

Sem framework e sem build no site: HTML + CSS + JavaScript puro em `public/`. As funções serverless em `api/` são **TypeScript** (`.ts`, Node, `ioredis`), compiladas pela própria Vercel. Os dados ficam no Redis, nunca em ficheiros.

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
- `carro.html` + `carro.css` + `carro.js`: simulador do carro. Chega-se lá por Gestão → "Carro elétrico →"; o "← Voltar à app" leva ao início.
- `gestao.html`: cópia completa, envio por email, estado do armazenamento. Ligação "Gestão" no topo da página principal, ao lado do botão de tema.
- `tema.js` + `tema.css`: modo escuro/claro e estilos do topo, em todas as páginas (ver "Tema escuro" abaixo).
- `login.html` + `auth.js`: página de entrada e o aviso que leva para ela quando a API responde 401 (carregado por todas as páginas).
- `jsconfig.json` + JSDoc em `js/nucleo.js`: tipos só como documentação no editor (sem build). Texto escrito pelo utilizador que vá para `innerHTML` passa sempre por `esc()` (`nucleo.js`).
- `sw.js`: service worker (rede primeiro, cache offline). `vendor/`: `jsQR`, `xlsx`.

`api/` (funções serverless, TypeScript): `data.ts` (dados principais), `carro.ts`, `faturas.ts`, `backups.ts`, `estado.ts`, `preco.ts`, `copia-email.ts` (cron semanal, `vercel.json` aponta para este ficheiro), `login.ts` (entrar/sair). Partilhados (o `_` impede que sejam rotas): `_sessao.ts` (palavra-passe), `_redis.ts` (ligação ao Redis), `_util.ts` (`msg`, `um`). **Antes de publicar corre `npm run typecheck` (tem de dar 0 erros)**: a Vercel falha o build se houver erros de tipos.

## Regras que não podes quebrar

- **Os `js/*.js` são scripts clássicos que partilham o âmbito global** (já não há função à volta de tudo). A ordem das tags `<script>` no `index.html` conta: um ficheiro só pode usar, no arranque, o que vem antes. Para acrescentar um ficheiro: pôr a tag no `index.html`, juntá-lo a `PRE_CACHE` no `sw.js` e subir `VERSAO`.
- **Nunca mudar as chaves de `localStorage`** (`custos-mensais-pessoas-v2`, `custos-mensais-sync-v3`, `custos-mensais-recuperado-v3`, `custos-mensais-ui-cats`, `custos-faturas-pendentes`) nem os nomes dos campos guardados. Mudar quebra os dados já existentes e as alterações por sincronizar.
- **Estrutura dos dados** (`/api/data`): `dados.tiago['AAAA-MM']` e `dados.claudia[...]` = `{ salario, fixo[], opcional[], poupanca[], investido[] }`; `dados.casalOpcional['AAAA-MM']`; `dados.lojas[nif]`; `dados.investimentos[pessoa] = { ativos[], retirados[] }`. Valores monetários em euros (número decimal). Ao acrescentar campos, tratar o caso de dados antigos sem o campo (ver `normalizar`).
- **Não apagar nem sobrescrever dados reais** para testar. Testar com dados simulados.
- Depois de mexer no `sw.js`, os utilizadores só recebem a versão nova ao reabrir a app; subir `VERSAO` ao mudar `PRE_CACHE`.

## Como verificar alterações

Node está instalado (`npm install` cria `node_modules`, ignorado pelo git). **Antes de publicar corre `npm test`**: faz o typecheck das `api/` e de todos os `public/js/*.js` (cada um começa com `// @ts-check`; `jsconfig.json` junta-os como um só âmbito global e `tipos/globais.d.ts` declara `jsQR`, `XLSX` e `BarcodeDetector`; `byId` devolve `any`, por isso os campos de formulário não dão ruído. Um ficheiro novo em `js/` deve começar com `// @ts-check`), compila as `api/` para `.teste-build/` (ignorado) e corre os 35 testes de `tests/` com `node --test`: `dados.test.js` (`normalizar`, `fundir`, `esc`; carrega `public/js/*.js` num contexto isolado via `_navegador.js`), `qr.test.js` (`lerQrAT`) e `api.test.js` (sessão, limite de tentativas, versões/conflitos, cópias, faturas; usa um Redis em memória em `_api.js`). Uma função ou regra nova de dados deve ganhar o seu teste. `npm run typecheck` só verifica tipos. O GitHub corre `npm test` em cada push (`.github/workflows/testes.yml`): cruz vermelha no commit = não publicar sem corrigir. Para ver o aspeto: servir `public/` num servidor local simples (PowerShell `HttpListener`) com respostas simuladas de `/api/data` e `/api/carro`, abrir no Chrome em modo headless (`--dump-dom`, ou `--screenshot` com `--window-size` alto) e comparar com a versão anterior do git. Confirmar sempre também no site publicado, depois do deploy.

## Ambiente

Windows, PowerShell. Atenção: um deploy pendente na Vercel faz parecer que a alteração "não funcionou" (ver o estado do último commit no GitHub).

## Palavra-passe do site

- Uma única palavra-passe, na variável de ambiente **`SENHA`** da Vercel. **Nunca no código nem no repositório** (o repositório é público). Mudar a `SENHA` termina todas as sessões.
- Sem `SENHA` definida o site fica aberto (de propósito, para nunca ficar trancado fora por engano).
- Toda a função em `api/` começa com `exigirSessao(req, res)` (de `_sessao.js`). Uma função nova **tem de ter esta linha**. Exceção: o `GET` de `copia-email.js` (cron) usa `CRON_SECRET`.
- Sessão = cookie `cm_sessao` (30 dias, HttpOnly). Máximo de 5 tentativas falhadas por IP em 15 minutos (`login.js`, guardado no Redis).
- A palavra-passe `TC2026` é curta **por decisão do Tiago** (só ele e a Cláudia a sabem): não voltar a sugerir trocá-la.
- `vercel.json` define os cabeçalhos de segurança (CSP, `X-Frame-Options`, etc.). Um recurso externo novo (script, fonte, imagem) tem de ser acrescentado à CSP, senão o navegador bloqueia-o. O service worker faz `fetch` dos recursos externos, por isso o `connect-src` também os tem de listar (sem isso as fontes do Google deixam de carregar quando o service worker está ativo).
- As páginas HTML e os `js/` são públicos (não têm dados); o que está protegido são os dados, via API.
- Testar a lógica da API: ver "Como verificar alterações".

## Variáveis de ambiente e segredos

- Vivem **só na Vercel** (Settings → Environment Variables, Production): `CustoMensal_REDIS_URL`, `SENHA`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_COPIA`. Não há `.env.local`: o projeto não tem servidor local, testa-se como descrito acima.
- O `.gitignore` bloqueia `.env*`, `.vercel/` e as cópias de dados descarregadas. Se algum dia fizeres `vercel env pull`, o `.env.local` aponta para o Redis **real**: nunca o uses para testes que escrevam dados.
- Variáveis secretas da Vercel não se leem de volta; para mudar uma, edita-se o valor e faz-se novo deploy.

## Tema escuro/claro

- O botão (`.btn-tema`) está no topo de todas as páginas. A escolha fica em `localStorage` (`custos-tema` = `dark` ou `light`), por dispositivo; sem escolha, segue o tema do sistema. Nunca mudar esta chave.
- `tema.js` é carregado no **`<head>`** (antes do CSS e de a página aparecer, para não piscar) e põe `data-theme` no `<html>`. Todas as páginas têm de ter `:root:not([data-theme="light"])` dentro do `@media (prefers-color-scheme: dark)` **e** `:root[data-theme="dark"]` com as mesmas variáveis.
- Cores novas: usar sempre as variáveis (`var(--bg)`, `var(--fg)`…). Gráficos desenhados em JS leem as cores no momento de desenhar, por isso a página principal volta a desenhar tudo quando recebe o evento `tema-mudou` (`js/main.js`).
- Testar: Chrome headless com o protocolo de depuração (CDP) e o Node do VS Code, guardando `custos-tema` e recarregando.
