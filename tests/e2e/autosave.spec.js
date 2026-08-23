const { test, expect } = require('@playwright/test');
const { APP_URL, openEditor } = require('./helpers');

test.describe('작업 자동 보존 (localStorage 백업)', () => {
  test('편집 후 새로고침하면 복구 카드가 뜨고, 이어서 편집으로 복원된다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const h1 = doc.querySelector('h1');
      window.htmlEditor.selectElement(h1);
      window.htmlEditor.applyStyle('color', 'rgb(9, 8, 7)');
    });
    // 디바운스된 기록 + 백업이 끝나기를 기다린다
    await expect.poll(() => page.evaluate(() => {
      const raw = localStorage.getItem('gs_backup');
      return raw ? raw.includes('rgb(9, 8, 7)') : false;
    })).toBe(true);

    await page.goto(APP_URL);
    const card = await page.evaluate(() => ({
      visible: document.getElementById('restoreCard').style.display !== 'none',
      name: document.getElementById('restoreName').textContent,
      time: document.getElementById('restoreTime').textContent,
    }));
    expect(card.visible).toBe(true);
    expect(card.name).toBe('editing.html');
    expect(card.time).toContain('전');

    await page.click('#restoreOpenBtn');
    await page.waitForFunction(() => {
      const frame = document.getElementById('previewFrame');
      return frame.style.display === 'block' && !!frame.contentDocument.querySelector('h1');
    });
    const restored = await page.evaluate(() => ({
      color: document.getElementById('previewFrame').contentDocument.querySelector('h1').style.color,
      fileName: document.getElementById('fileName').textContent,
    }));
    expect(restored.color).toBe('rgb(9, 8, 7)');
    expect(restored.fileName).toBe('editing.html');
  });

  test('백업에는 편집용 마크업이 섞이지 않는다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('h1')); // 선택 → 오버레이 생성
      window.htmlEditor.saveToHistory('테스트', true);
    });
    const backup = await page.evaluate(() => localStorage.getItem('gs_backup'));
    expect(backup).toContain('<h1>');
    expect(backup).not.toContain('editable-text');
    expect(backup).not.toContain('data-editor-ui');
    expect(backup).not.toContain('editor-styles');
  });

  test('삭제 버튼이 백업을 지우고 카드를 닫는다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem('gs_backup'))).toBe(true);

    await page.goto(APP_URL);
    await page.click('#restoreDismissBtn');
    const state = await page.evaluate(() => ({
      backup: localStorage.getItem('gs_backup'),
      visible: document.getElementById('restoreCard').style.display !== 'none',
    }));
    expect(state).toEqual({ backup: null, visible: false });
  });
});
