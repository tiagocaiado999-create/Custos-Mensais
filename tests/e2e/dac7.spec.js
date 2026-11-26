// Testes de browser da aba «Limite DAC7» da página Negócio (números escritos à mão, por plataforma e por ano).
// Correr: npx playwright test   (usa tests/e2e/servidor.js, sem dados reais)
const { test, expect } = require('@playwright/test');

const ANO = String(new Date().getFullYear());
async function negocio(request) { return (await (await request.get('/__estado')).json()).negocio; }
function semErros(page) { const erros = []; page.on('pageerror', (e) => erros.push(e.message)); return erros; }
const guardado = (page) => expect(page.locator('#estado')).toHaveText('Guardado');

test.describe('Limite DAC7', () => {
  test.beforeEach(async ({ request }) => {
    await request.get('/__reset?logado=1');
    // dados antigos do negócio, ainda sem o campo dac7: têm de continuar intactos
    await request.post('/api/negocio', { data: { versao: 0, dados: { compras: [{ id: 'c1', nome: 'RTX 3060', valor: 150, data: ANO + '-01-10' }], vendas: [] } } });
  });

  test('não aparece na página principal nem na aba Negócio', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('DAC7')).toHaveCount(0);
    await page.goto('/negocio.html');
    await expect(page.locator('#abaNegocio')).toBeVisible();
    await expect(page.locator('#abaDac7')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Limite DAC7' })).toBeHidden();
  });

  test('a barra enche até aos 2000 € e avisa perto e no limite; fica guardado por ano', async ({ page, request }) => {
    const erros = semErros(page);
    await page.goto('/negocio.html');
    await guardadoOuVazio(page);
    await page.getByRole('tab', { name: 'Limite DAC7' }).click();
    await expect(page.locator('#abaNegocio')).toBeHidden();
    await expect(page.locator('#dAno')).toHaveText('Ano de ' + ANO);

    await page.getByLabel('Plataforma').fill('Vinted');
    await page.getByRole('button', { name: 'Adicionar plataforma' }).click();
    const vinted = page.locator('.plat', { hasText: 'Vinted' });
    await expect(page.getByLabel('Vendas feitas')).toBeFocused();

    await vinted.getByLabel('Vendas feitas').fill('13');
    await vinted.getByLabel('Dinheiro recebido (€)').fill('1494');
    await expect(vinted.locator('.rEuros')).toHaveText(/1494,00\s€ de 2000,00\s€/);
    await expect(vinted.locator('.rVendas')).toHaveText('13 de 30');
    expect(await vinted.locator('i.bEuros').evaluate((e) => e.style.width)).toBe('74.7%');
    await expect(vinted.locator('.dac-estado')).toHaveText(/^Faltam 506,00\s€ e 17 venda\(s\) para o limite\./);
    await expect(vinted.locator('.dac-estado')).not.toHaveClass(/perto|passou/);

    await vinted.getByLabel('Dinheiro recebido (€)').fill('1750');
    await expect(vinted.locator('.dac-estado')).toHaveClass(/perto/);
    await expect(vinted.locator('.dac-estado')).toHaveText(/Perto do limite\. Faltam 250,00\s€/);
    await expect(vinted.locator('i.bEuros')).toHaveClass(/perto/);

    await vinted.getByLabel('Dinheiro recebido (€)').fill('2000');
    await expect(vinted.locator('.dac-estado')).toHaveClass(/perto/);   // 2000 € ainda não passa o limite

    await vinted.getByLabel('Dinheiro recebido (€)').fill('2150');
    await expect(vinted.locator('.dac-estado')).toHaveClass(/passou/);
    await expect(vinted.locator('.dac-estado')).toHaveText(/Chegaste ao limite em Vinted: 2150,00\s€/);
    expect(await vinted.locator('i.bEuros').evaluate((e) => e.style.width)).toBe('100%');

    await vinted.getByLabel('Dinheiro recebido (€)').fill('900');
    await vinted.getByLabel('Vendas feitas').fill('30');
    await expect(vinted.locator('.dac-estado')).toHaveText(/Chegaste ao limite em Vinted: 30 vendas/);
    await vinted.getByLabel('Vendas feitas').fill('26');
    await expect(vinted.locator('.dac-estado')).toHaveClass(/perto/);

    // segunda plataforma conta à parte; nome repetido não duplica
    await page.getByLabel('Plataforma').fill('OLX');
    await page.keyboard.press('Enter');
    await page.locator('.plat', { hasText: 'OLX' }).getByLabel('Dinheiro recebido (€)').fill('300');
    await page.getByLabel('Plataforma').fill('vinted');
    await page.getByRole('button', { name: 'Adicionar plataforma' }).click();
    await expect(page.locator('.plat')).toHaveCount(2);
    await expect(page.locator('#dTotal')).toHaveText(/1200,00\s€ em 26 vendas/);
    await guardado(page);

    const n = await negocio(request);
    expect(n.dados.compras).toEqual([{ id: 'c1', nome: 'RTX 3060', valor: 150, data: ANO + '-01-10' }]);
    expect(n.dados.dac7[ANO].map((p) => [p.nome, p.vendas, p.valor])).toEqual([['Vinted', 26, 900], ['OLX', 0, 300]]);

    // recarregar mantém tudo; o link #dac7 abre direto na aba
    await page.reload();
    await expect(page.locator('#abaDac7')).toBeVisible();
    await expect(page.locator('.plat', { hasText: 'Vinted' }).getByLabel('Vendas feitas')).toHaveValue('26');

    // outro ano começa vazio
    await page.getByRole('button', { name: 'Ano seguinte' }).click();
    await expect(page.locator('.plat')).toHaveCount(0);
    await expect(page.locator('#dacLista')).toContainText('Ainda sem plataformas em ' + (Number(ANO) + 1));
    await page.getByRole('button', { name: 'Ano anterior' }).click();
    await expect(page.locator('.plat')).toHaveCount(2);

    // apagar pede confirmação
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Apagar OLX' }).click();
    await expect(page.locator('.plat')).toHaveCount(2);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Apagar OLX' }).click();
    await expect(page.locator('.plat')).toHaveCount(1);
    await guardado(page);
    expect((await negocio(request)).dados.dac7[ANO].map((p) => p.nome)).toEqual(['Vinted']);

    // a aba Negócio continua a funcionar
    await page.getByRole('tab', { name: 'Negócio' }).click();
    await expect(page.locator('#abaNegocio')).toBeVisible();
    await expect(page).not.toHaveURL(/#dac7/);
    expect(erros).toEqual([]);
  });

  test('registar vendas soma-se à barra; histórico com resumo; apagar tira da barra', async ({ page, request }) => {
    const erros = semErros(page);
    await page.goto('/negocio.html#dac7');
    await guardadoOuVazio(page);
    await expect(page.locator('#dvAviso')).toHaveText('Adiciona primeiro uma plataforma em cima.');
    await expect(page.getByRole('button', { name: 'Registar venda' })).toBeDisabled();

    await page.getByLabel('Plataforma').fill('Vinted');
    await page.getByRole('button', { name: 'Adicionar plataforma' }).click();
    const vinted = page.locator('.plat', { hasText: 'Vinted' });
    await vinted.getByLabel('Vendas feitas').fill('10');
    await vinted.getByLabel('Dinheiro recebido (€)').fill('1494');
    await page.getByLabel('Plataforma').fill('Wallapop');
    await page.getByRole('button', { name: 'Adicionar plataforma' }).click();

    // venda na Vinted: a barra passa a base + registada
    await page.getByLabel('Onde vendeste').selectOption({ label: 'Vinted' });
    await page.locator('#dvData').fill(ANO + '-11-20');
    await page.getByLabel('O que vendeste').fill('RTX 3070');
    await page.getByLabel('Valor recebido (€)').fill('200');
    await page.getByRole('button', { name: 'Registar venda' }).click();
    await expect(vinted.locator('.rEuros')).toHaveText(/1694,00\s€ de 2000,00\s€/);
    await expect(vinted.locator('.rVendas')).toHaveText('11 de 30');
    await expect(vinted.locator('.dac-registadas')).toHaveText(/1 venda\(s\) registada\(s\) em baixo: 200,00\s€/);
    await expect(vinted.locator('.dac-estado')).toHaveText(/^Faltam 306,00\s€ e 19 venda\(s\)/);

    // sem valor não regista
    await page.getByLabel('Onde vendeste').selectOption({ label: 'Wallapop' });
    await page.getByRole('button', { name: 'Registar venda' }).click();
    await expect(page.locator('#dvAviso')).toHaveText('Escreve o valor que recebeste.');
    await page.locator('#dvData').fill(ANO + '-11-25');
    await page.getByLabel('Valor recebido (€)').fill('45.5');
    await page.getByLabel('Valor recebido (€)').press('Enter');

    // histórico: mais recente primeiro; resumo por plataforma
    await expect(page.locator('#dHist .reg')).toHaveCount(2);
    await expect(page.locator('#dHist .reg').first()).toContainText('Wallapop');
    await expect(page.locator('#dHist .reg').nth(1)).toContainText('RTX 3070');
    await expect(page.locator('#dResumo')).toContainText(/Total para o limite\s*1694,00\s€ · 11 venda\(s\)/);
    await expect(page.locator('#dTotal')).toHaveText(/1739,50\s€ em 12 vendas/);
    await guardado(page);
    const n = await negocio(request);
    const v = n.dados.dac7[ANO].find((p) => p.nome === 'Vinted');
    expect([v.vendas, v.valor]).toEqual([10, 1494]);   // a base escrita à mão não muda
    expect(v.registos.map((r) => [r.data, r.nome, r.valor])).toEqual([[ANO + '-11-20', 'RTX 3070', 200]]);

    // apagar a venda tira-a da barra
    page.once('dialog', (d) => d.accept());
    await page.locator('#dHist .reg', { hasText: 'RTX 3070' }).getByRole('button', { name: 'Apagar venda' }).click();
    await expect(vinted.locator('.rVendas')).toHaveText('10 de 30');
    await expect(page.locator('#dHist .reg')).toHaveCount(1);

    // recarregar mantém o histórico
    await guardado(page);
    await page.reload();
    await expect(page.locator('#dHist .reg')).toHaveCount(1);
    expect(erros).toEqual([]);
  });
});

async function guardadoOuVazio(page) { await expect(page.locator('#estado')).toHaveText(/Guardado|Ainda sem registos/); }
