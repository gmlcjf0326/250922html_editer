const { test, expect } = require('@playwright/test');
const { openEditor } = require('./helpers');

// 이모지 범위 — 에디터 크롬에는 하나도 남지 않아야 한다
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

test.describe('에디터 크롬 (아이콘 · 강조색)', () => {
  test('주요 크롬의 아이콘이 SVG 로 주입되고 이모지가 남아 있지 않다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    const state = await page.evaluate(() => {
      const slots = Array.from(document.querySelectorAll('[data-icon]'));
      return {
        slots: slots.length,
        filled: slots.filter((el) => el.querySelector('svg')).length,
        unknown: slots.filter((el) => !el.querySelector('svg')).map((el) => el.dataset.icon),
      };
    });
    expect(state.slots).toBeGreaterThan(50);
    expect(state.unknown).toEqual([]);
    expect(state.filled).toBe(state.slots);

    // 화면에 늘 보이는 크롬의 텍스트에 이모지가 없어야 한다
    const texts = await page.evaluate(() => [
      '#topButtons', '#viewportSwitcher', '#floatingToolbar', '#stylePanel', '#contextMenu',
    ].map((sel) => (document.querySelector(sel) || {}).textContent || ''));
    for (const text of texts) expect(text).not.toMatch(EMOJI);
  });

  test('동적으로 만드는 UI 도 SVG 아이콘을 쓴다 (명령 팔레트 · 테마 토글 · 토스트)', async ({ page }) => {
    await openEditor(page, 'demo.html');

    await page.keyboard.press('Control+k');
    const palette = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#commandPaletteList .command-item'));
      return {
        count: items.length,
        withSvg: items.filter((el) => el.querySelector('.command-item-icon svg')).length,
        text: items.map((el) => el.textContent).join(''),
      };
    });
    expect(palette.count).toBeGreaterThan(5);
    expect(palette.withSvg).toBe(palette.count);
    expect(palette.text).not.toMatch(EMOJI);
    await page.keyboard.press('Escape');

    await page.click('#themeToggleBtn');
    expect(await page.evaluate(() => !!document.querySelector('#themeToggleBtn svg'))).toBe(true);
    await page.click('#themeToggleBtn');

    await page.evaluate(() => window.htmlEditor.showToast('테스트', 'success'));
    const toast = await page.evaluate(() => {
      const el = document.querySelector('#toastContainer .toast');
      return { svg: !!el.querySelector('svg'), text: el.textContent };
    });
    expect(toast.svg).toBe(true);
    expect(toast.text).not.toMatch(EMOJI);
  });

  test('편집 대상 문서의 선택 하이라이트가 강조색 하나로 통일돼 있다', async ({ page }) => {
    await openEditor(page, 'demo.html');
    const outlines = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const view = doc.defaultView;
      const h1 = doc.querySelector('h1');
      const p = doc.querySelector('p');
      window.htmlEditor.selectElement(h1);
      window.htmlEditor.selectedElements = [h1, p];
      p.classList.add('element-multi-selected');
      return {
        single: view.getComputedStyle(h1).outlineColor,
        multi: view.getComputedStyle(p).outlineColor,
      };
    });
    expect(outlines.single).toBe('rgb(37, 99, 235)');
    expect(outlines.multi).toBe('rgb(37, 99, 235)');
  });
});
