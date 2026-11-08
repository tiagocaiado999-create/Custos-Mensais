// Testes de browser (Playwright): `npx playwright test`. Não fazem parte do `npm test`.
const { defineConfig, devices } = require('@playwright/test');

const PORTA = 5066;
const ecra = { viewport: { width: 390, height: 844 } };

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '*.spec.js',
  timeout: 30000,
  fullyParallel: false,
  workers: 1, // o servidor simulado guarda o estado em memória: um teste de cada vez
  reporter: [['list']],
  use: { baseURL: 'http://localhost:' + PORTA, ...ecra, trace: 'off' },
  webServer: { command: 'node tests/e2e/servidor.js', url: 'http://localhost:' + PORTA + '/login.html', reuseExistingServer: true, timeout: 15000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...ecra } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], ...ecra } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], ...ecra } }
  ]
});
