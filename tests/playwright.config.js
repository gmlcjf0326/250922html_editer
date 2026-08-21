const { defineConfig, devices } = require('@playwright/test');

// 로컬에 이미 받아둔 Chromium 을 쓰려면: CHROMIUM_PATH=/path/to/chrome npx playwright test
// CI 에서는 `npx playwright install chromium` 이 받아둔 브라우저를 그대로 사용한다.
const executablePath = process.env.CHROMIUM_PATH || undefined;

/**
 * 에디터는 실제로 index.html 을 브라우저에서 직접 여는 방식(file://)으로 쓰이므로
 * 테스트도 같은 조건으로 돌린다. iframe 문서에 접근하려면 파일 출처 간 접근 허용이 필요하다.
 */
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath,
      args: ['--no-sandbox', '--allow-file-access-from-files'],
    },
  },
  projects: [{ name: 'chromium' }],
});
