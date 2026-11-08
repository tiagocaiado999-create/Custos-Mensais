// Testes de browser dos formulários: login (entrar) e painel "+" (adicionar gasto).
// Correr: npx playwright test   (Chromium, Firefox e WebKit; usa tests/e2e/servidor.js, sem dados reais)
const { test, expect } = require('@playwright/test');

const SENHA = 'palavrapasse1';

async function reiniciar(request, logado) { await request.get('/__reset?logado=' + (logado ? '1' : '0')); }
async function servidor(request) { return (await request.get('/__estado')).json(); }
async function abrirApp(page) { await page.goto('/'); await expect(page.locator('#app')).toBeVisible(); }
// número de lançamentos do mês mostrado (variáveis globais da app)
async function lancamentos(page) {
  return page.evaluate(() => { const m = dados.tiago[chave(anoAtual, mesAtual)]; return { fixo: m.fixo.length, opcional: m.opcional.length, total: m.fixo.length + m.opcional.length }; });
}
async function focoEm(page) { return page.evaluate(() => { const e = document.activeElement; return { id: e && e.id || '', dentro: !!(e && e.closest && e.closest('#qaOverlay')), tag: e ? e.tagName : '' }; }); }
// cola um texto grande no campo, como faria um utilizador (o fill() ignora o maxlength)
async function colar(page, seletor, texto) { await page.focus(seletor); await page.keyboard.press('Control+A'); await page.keyboard.insertText(texto); }
function semErros(page) { const erros = []; page.on('pageerror', (e) => erros.push(e.message)); return erros; }

// =====================================================================================
test.describe('Login (entrar)', () => {
  test.beforeEach(async ({ page, request }) => { await reiniciar(request, false); await page.goto('/login.html'); });

  test('envio vazio: não envia nada e mantém o foco na palavra-passe', async ({ page, request }) => {
    await page.click('#entrar');
    await expect(page).toHaveURL(/login.html/);
    expect((await servidor(request)).logins).toHaveLength(0);
    expect(await page.$eval('#senha', (e) => e.validity.valueMissing)).toBe(true);
    await expect(page.locator('#senha')).toBeFocused();
  });

  test('palavra-passe errada: mostra o erro, volta a ativar o botão e envia uma só vez', async ({ page, request }) => {
    await page.fill('#senha', 'errada-errada');
    await page.click('#entrar');
    await expect(page.locator('#erro')).toHaveText('Palavra-passe errada');
    await expect(page.locator('#entrar')).toBeEnabled();
    expect((await servidor(request)).logins).toHaveLength(1);
  });

  test('envio válido: entra e vai para a app', async ({ page, request }) => {
    await page.fill('#senha', SENHA);
    await page.click('#entrar');
    await page.waitForURL((u) => u.pathname === '/');
    await expect(page.locator('#app')).toBeVisible();
    expect((await servidor(request)).logins).toHaveLength(1);
  });

  test('duplo envio com resposta lenta: só um pedido (botão e Enter bloqueados)', async ({ page, request }) => {
    await page.fill('#senha', 'lenta-errada');
    await page.click('#entrar');
    await expect(page.locator('#entrar')).toBeDisabled();
    await page.focus('#senha');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.locator('#erro')).toHaveText('Palavra-passe errada');
    expect((await servidor(request)).logins).toHaveLength(1);
  });

  test('duplo envio válido: só um pedido e uma só entrada', async ({ page, request }) => {
    await page.fill('#senha', SENHA);
    await page.dblclick('#entrar');
    await page.waitForURL((u) => u.pathname === '/');
    expect((await servidor(request)).logins).toHaveLength(1);
  });

  test('texto muito longo: o campo respeita o limite e a página não bloqueia', async ({ page, request }) => {
    const erros = semErros(page);
    await colar(page, '#senha', 'x'.repeat(100000));
    expect(await page.$eval('#senha', (e) => e.value.length)).toBeLessThanOrEqual(200);
    await page.click('#entrar');
    await expect(page.locator('#erro')).not.toHaveText('');
    await expect(page.locator('#entrar')).toBeEnabled();
    expect((await servidor(request)).logins.every((l) => l.tamanho < 2000)).toBe(true);
    expect(erros).toEqual([]);
  });

  test('só teclado: a palavra-passe tem o foco, Tab vai ao botão e Enter entra', async ({ page, request }) => {
    await expect(page.locator('#senha')).toBeFocused();
    await page.keyboard.type(SENHA);
    await page.keyboard.press('Tab');
    await expect(page.locator('#entrar')).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => u.pathname === '/');
    expect((await servidor(request)).logins).toHaveLength(1);
  });
});

// =====================================================================================
test.describe('Painel + (adicionar gasto)', () => {
  test.beforeEach(async ({ page, request }) => {
    await reiniciar(request, true);
    await abrirApp(page);
    await page.click('#fabAdd');
    await expect(page.locator('#qaOverlay')).toBeVisible();
  });

  test('envio vazio: não grava, o painel fica aberto e o foco vai para o valor', async ({ page, request }) => {
    const antes = await lancamentos(page);
    await page.click('#qaGuardar');
    await expect(page.locator('#qaOverlay')).toBeVisible();
    expect((await focoEm(page)).id).toBe('qaValor');
    expect(await lancamentos(page)).toEqual(antes);
    await page.waitForTimeout(300);
    expect((await servidor(request)).gravacoes).toBe(0);
  });

  for (const mau of ['-5', '0', '0.001', '1e999', '9'.repeat(30)]) {
    test('valor inválido "' + (mau.length > 12 ? mau.slice(0, 6) + '…(' + mau.length + ' dígitos)' : mau) + '": não grava', async ({ page }) => {
      const antes = await lancamentos(page);
      await page.fill('#qaValor', mau);
      await page.click('#qaGuardar');
      await expect(page.locator('#qaOverlay')).toBeVisible();
      expect(await lancamentos(page)).toEqual(antes);
    });
  }

  test('envio válido: grava, fecha o painel, mostra o aviso e envia ao servidor', async ({ page, request }) => {
    const antes = await lancamentos(page);
    await page.fill('#qaValor', '12.5');
    await page.fill('#qaNome', 'Café');
    await page.click('#qaGuardar');
    await expect(page.locator('#qaOverlay')).toBeHidden();
    await expect(page.locator('#qaToast')).toContainText('Adicionado');
    expect((await lancamentos(page)).opcional).toBe(antes.opcional + 1);
    await expect.poll(async () => (await servidor(request)).gravacoes, { timeout: 8000 }).toBeGreaterThan(0);
    const estado = await servidor(request);
    const meses = Object.values(estado.dados.tiago);
    const gravado = meses.flatMap((m) => m.opcional).find((i) => i.nome === 'Café');
    expect(gravado && gravado.valor).toBe(12.5);
  });

  test('duplo envio (dois cliques seguidos): só um lançamento', async ({ page, request }) => {
    const antes = await lancamentos(page);
    await page.fill('#qaValor', '10');
    await page.evaluate(() => { const b = document.getElementById('qaGuardar'); b.click(); b.click(); });
    await expect(page.locator('#qaOverlay')).toBeHidden();
    expect((await lancamentos(page)).total).toBe(antes.total + 1);
    const dezEuros = async () => Object.values((await servidor(request)).dados.tiago).flatMap((m) => m.opcional).filter((i) => i.valor === 10).length;
    await expect.poll(dezEuros, { timeout: 8000 }).toBe(1);   // chega ao servidor, e uma só vez
  });

  test('duplo envio (Enter duas vezes no valor): só um lançamento', async ({ page }) => {
    const antes = await lancamentos(page);
    await page.fill('#qaValor', '11');
    await page.evaluate(() => { const v = document.getElementById('qaValor'); for (let i = 0; i < 2; i++) v.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await expect(page.locator('#qaOverlay')).toBeHidden();
    expect((await lancamentos(page)).total).toBe(antes.total + 1);
  });

  test('texto muito longo em todos os campos: fica dentro de limites razoáveis e continua a sincronizar', async ({ page, request }) => {
    const erros = semErros(page);
    const longo = 'L'.repeat(200000);
    await page.fill('#qaValor', '12');
    await colar(page, '#qaNome', longo);
    await colar(page, '#qaNota', longo);
    const tam = await page.evaluate(() => ({ nome: qaNome.value.length, nota: qaNota.value.length }));
    expect(tam.nome).toBeLessThanOrEqual(200);
    expect(tam.nota).toBeLessThanOrEqual(500);
    await page.click('#qaGuardar');
    await expect(page.locator('#qaOverlay')).toBeHidden();
    await expect.poll(async () => (await servidor(request)).gravacoes, { timeout: 8000 }).toBeGreaterThan(0);
    const estado = await servidor(request);
    expect(estado.recusadas).toBe(0);
    await expect(page.locator('#avisoSync')).toBeHidden();
    const maior = Math.max(...Object.values(estado.dados.tiago).flatMap((m) => m.opcional).map((i) => String(i.nome).length));
    expect(maior).toBeLessThanOrEqual(200);
    const pendentes = await page.evaluate(() => localStorage.getItem('custos-faturas-pendentes') || '');
    expect(pendentes.length).toBeLessThan(5000);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(erros).toEqual([]);
  });

  test('só teclado: o foco fica preso no painel, todos os controlos são alcançáveis e grava com Enter', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.locator('#qaOverlay')).toBeHidden();
    expect((await focoEm(page)).id).toBe('fabAdd'); // Escape devolve o foco ao botão "+"
    await page.keyboard.press('Enter');
    await expect(page.locator('#qaOverlay')).toBeVisible();
    expect((await focoEm(page)).id).toBe('qaValor');

    const antes = await lancamentos(page);
    await page.keyboard.type('8.5');
    // percorrer o painel com Tab: o foco nunca pode sair dele
    const vistos = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => { const e = document.activeElement; return { id: e.id || '', cls: e.className && String(e.className) || '', dentro: !!e.closest('#qaOverlay'), txt: (e.textContent || '').trim().slice(0, 20) }; });
      expect(f.dentro, 'o foco saiu do painel em ' + JSON.stringify(f)).toBe(true);
      vistos.push(f);
    }
    const ids = vistos.map((f) => f.id);
    for (const id of ['qaFechar', 'qaModoManual', 'qaModoQr', 'qaNatGasto', 'qaNatPoup', 'qaNatInvest', 'qaValor', 'qaNome', 'qaNota', 'qaTipo', 'qaData', 'qaGuardar']) {
      expect(ids, 'não se chega a #' + id + ' com Tab').toContain(id);
    }
    expect(vistos.some((f) => f.txt.includes('Comida')), 'as categorias não se alcançam com Tab').toBe(true);
    expect(vistos.some((f) => f.txt.includes('Foto da fatura') || f.id === 'qaAnexo'), 'a foto da fatura não se alcança com Tab').toBe(true);

    // chegar a Adicionar e confirmar com Enter
    await page.focus('#qaGuardar');
    await page.keyboard.press('Enter');
    await expect(page.locator('#qaOverlay')).toBeHidden();
    expect((await lancamentos(page)).opcional).toBe(antes.opcional + 1);
    expect((await focoEm(page)).id).toBe('fabAdd');
  });
});

// =====================================================================================
test.describe('Mosaico do início', () => {
  // cenários: o da captura do telemóvel (poupança e investido a 0 €, sobra negativa), tudo a zero, e valores muito diferentes
  const cenarios = {
    'valores da captura (2 cartões a 0 €, sobra negativa)': { sal: 855, fixo: 154.75, opc: 732.35, poup: 0, inv: 0 },
    'tudo a 0 €': { sal: 0, fixo: 0, opc: 0, poup: 0, inv: 0 },
    'valores muito diferentes': { sal: 1800, fixo: 5, opc: 3000, poup: 0.5, inv: 12345.67 }
  };
  for (const [nome, c] of Object.entries(cenarios)) {
    test('mostra sempre os 5 cartões, com o valor inteiro visível: ' + nome, async ({ page, request }) => {
      await reiniciar(request, true);
      await abrirApp(page);
      const cartoes = await page.evaluate((c) => {
        const it = (v) => (v > 0 ? [{ id: 'x' + v, nome: 'x', valor: v, categoria: 'outros', data: hojeISO() }] : []);
        dados.tiago[chave(anoAtual, mesAtual)] = { salario: c.sal, extras: [], fixo: it(c.fixo), opcional: it(c.opc), poupanca: it(c.poup), investido: it(c.inv) };
        renderTudo();
        return [...document.querySelectorAll('.mo')].map((a) => {
          const t = a.getBoundingClientRect(), b = a.querySelector('b'), r = b.getBoundingClientRect();
          return { nome: a.querySelector('span').textContent, valor: b.textContent, larg: Math.round(t.width), alt: Math.round(t.height), cortado: r.left < t.left - 0.5 || r.right > t.right + 0.5 || b.scrollWidth > b.clientWidth + 1 };
        });
      }, c);
      expect(cartoes.map((x) => x.nome).sort()).toEqual(['Fixos', 'Investido', 'Opcionais', 'Poupança', 'Sobra']);
      for (const x of cartoes) {
        expect(x.cortado, 'valor cortado em ' + x.nome + ' (' + x.valor + ')').toBe(false);
        expect(x.larg, 'cartão ' + x.nome + ' demasiado estreito').toBeGreaterThanOrEqual(85);
        expect(x.alt, 'cartão ' + x.nome + ' demasiado baixo').toBeGreaterThanOrEqual(90);
      }
      if (c.poup === 0) expect(cartoes.find((x) => x.nome === 'Poupança').valor).toMatch(/^0,00/);
    });
  }
});
