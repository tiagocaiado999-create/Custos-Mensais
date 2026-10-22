// @ts-check
  var STORAGE_KEY = 'custos-mensais-pessoas-v2';
  /**
   * Tipos dos dados (só documentação: o VS Code mostra-os ao passar o rato; não há build).
   * @typedef {{ id: string, nome: string, valor: number, categoria?: string, data?: string, fatura?: string }} Item
   * @typedef {{ salario: number, fixo: Item[], opcional: Item[], poupanca: Item[], investido: Item[] }} Mes
   * @typedef {{ id: string, nome: string, valor: number, data?: string, ticker?: string }} Ativo
   * @typedef {{ ativos: Ativo[], retirados: object[] }} Investimentos
   * @typedef {{ tiago: Object<string, Mes>, claudia: Object<string, Mes>, casalOpcional: Object<string, Mes>,
   *   lojas: Object<string, { nome: string, categoria?: string }>,
   *   investimentos: { tiago: Investimentos, claudia: Investimentos, casal: Investimentos } }} Dados
   */
  var meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  var mesesAbrev = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var nomesPessoa = { tiago:'Tiago', claudia:'Cláudia', casal:'Casal' };
  var CATEGORIAS = [
    { id:'comida', nome:'Comida' },
    { id:'restaurante', nome:'Restaurante' },
    { id:'lazer', nome:'Lazer' },
    { id:'transporte', nome:'Transporte' },
    { id:'saude', nome:'Saúde' },
    { id:'compras', nome:'Compras' },
    { id:'outros', nome:'Outros' }
  ];
  function nomeCategoria(id){
    var c = CATEGORIAS.filter(function(c){ return c.id === id; })[0];
    return c ? c.nome : 'Outros';
  }
  function hojeISO(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function formatarData(iso){
    if(!iso) return '';
    var p = iso.split('-');
    if(p.length !== 3) return '';
    return p[2] + '/' + p[1];
  }

  var agora = new Date();
  var anoAtual = agora.getFullYear();
  var mesAtual = agora.getMonth();
  var pessoaAtual = 'tiago';

  /** @param {number} ano @param {number} mes mês de 0 a 11 @returns {string} 'AAAA-MM' */
  function chave(ano, mes){ return ano + '-' + String(mes+1).padStart(2,'0'); }
  function mesVazio(){ return { salario: 0, fixo: [], opcional: [], poupanca: [], investido: [] }; }
  function uid(){ return 'x' + Math.random().toString(36).slice(2,9); }
  // escapa texto escrito pelo utilizador antes de o pôr em innerHTML
  /** @param {*} s @returns {string} */
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  /** @param {number} n @returns {string} */
  function euros(n){ return new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n||0); }
  /** @param {Item[]} lista @returns {number} */
  function somaLista(lista){ return lista.reduce(function(s,i){ return s + (Number(i.valor)||0); }, 0); }

  function investVazio(){ return { ativos: [], retirados: [] }; }
  var dadosDefault = { tiago:{}, claudia:{}, casalOpcional:{}, lojas:{}, investimentos:{ tiago: investVazio(), claudia: investVazio(), casal: investVazio() } };

  // Armazenamento partilhado (api/data.js + Redis) com versões: cada gravação junta as alterações em vez de substituir tudo.
  var guardarTimer = null;
  var statusEl = null;

  function migrarItens(lista){
    (lista || []).forEach(function(item){
      if(!item.categoria) item.categoria = 'outros';
      if(item.data === undefined) item.data = '';
    });
  }
  /** Migra dados antigos para a estrutura atual. @param {*} d @returns {Dados} */
  function normalizar(d){
    if(!d) d = {};
    if(!d.tiago) d.tiago = {};
    if(!d.claudia) d.claudia = {};
    if(!d.casalOpcional) d.casalOpcional = {};
    if(!d.lojas) d.lojas = {};
    if(!d.investimentos || Array.isArray(d.investimentos.ativos)){
      var antigo = d.investimentos;
      d.investimentos = { tiago: antigo || investVazio(), claudia: investVazio(), casal: investVazio() };
    }
    if(!d.investimentos.tiago) d.investimentos.tiago = investVazio();
    if(!d.investimentos.claudia) d.investimentos.claudia = investVazio();
    if(!d.investimentos.casal) d.investimentos.casal = investVazio();
    ['tiago','claudia'].forEach(function(p){
      Object.keys(d[p]).forEach(function(k){
        migrarItens(d[p][k].fixo);
        migrarItens(d[p][k].opcional);
        if(!d[p][k].poupanca) d[p][k].poupanca = [];
        if(!d[p][k].investido) d[p][k].investido = [];
      });
    });
    Object.keys(d.casalOpcional).forEach(function(k){
      migrarItens(d.casalOpcional[k].opcional);
      if(!d.casalOpcional[k].poupanca) d.casalOpcional[k].poupanca = [];
      if(!d.casalOpcional[k].investido) d.casalOpcional[k].investido = [];
    });
    ['tiago','claudia','casal'].forEach(function(p){
      (d.investimentos[p].ativos || []).forEach(function(i){
        if(i.data === undefined) i.data = '';
        if(i.valorAtual === undefined) i.valorAtual = '';
        if(i.ticker === undefined) i.ticker = '';
        if(i.precoCompra === undefined) i.precoCompra = '';
      });
      (d.investimentos[p].retirados || []).forEach(function(i){
        if(i.dataInvestido === undefined) i.dataInvestido = '';
        if(i.data === undefined) i.data = '';
      });
    });
    return d;
  }

  // ---------- Estado visual das categorias (só neste dispositivo) ----------
  var UI_KEY = 'custos-mensais-ui-cats';
  var catAbertas = {};
  try{ catAbertas = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; }catch(e){ catAbertas = {}; }
  function catAberta(tipo, id){ return !!catAbertas[tipo + ':' + id]; }
  function setCatAberta(tipo, id, aberta){
    catAbertas[tipo + ':' + id] = !!aberta;
    try{ localStorage.setItem(UI_KEY, JSON.stringify(catAbertas)); }catch(e){}
  }

  // Procuram sempre nos dados atuais (os dados podem ser substituídos por uma sincronização)
  function investAtual(){ return dados.investimentos[pessoaAtual]; }
  function acharAtivo(id){ return investAtual().ativos.filter(function(i){ return i.id === id; })[0]; }

