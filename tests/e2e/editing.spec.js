const { test, expect } = require('@playwright/test');
const { openEditor, inlineStyle } = require('./helpers');

test.describe('편집 동작 (선택 · 구조 · 히스토리)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
  });

  test('편집 스팬이 textarea·pre 내용을 훼손하지 않는다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    const wrapping = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      return {
        textareaClean: !doc.querySelector('textarea .editable-text'),
        textareaValue: doc.querySelector('textarea') ? doc.querySelector('textarea').value.trim() : null,
        preClean: !doc.querySelector('pre .editable-text'),
        headingWrapped: !!doc.querySelector('h1 .editable-text'),
      };
    });

    expect(wrapping.preClean).toBe(true);
    expect(wrapping.textareaClean).toBe(true);
    expect(wrapping.headingWrapped).toBe(true);
  });

  test('스냅샷과 다운로드 결과에 DOCTYPE 이 유지된다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    const snapshot = await page.evaluate(() => window.htmlEditor.history[0].html.slice(0, 20));
    expect(snapshot.toLowerCase()).toContain('<!doctype html');

    const clean = await page.evaluate(() => window.htmlEditor.extractCleanHTML());
    expect(clean.toLowerCase().startsWith('<!doctype html')).toBe(true);
    expect(clean).not.toContain('editable-text');
    expect(clean).not.toContain('element-multi-selected');
  });

  test('Alt+클릭으로 같은 태그·클래스를 일괄 선택하고 스타일을 한 번에 적용한다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    const frame = page.frames().find((f) => f !== page.mainFrame());

    await frame.click('p.note', { modifiers: ['Alt'] });
    const selection = await page.evaluate(() => ({
      count: window.htmlEditor.selectedElements.length,
      badge: document.getElementById('selectionCount').textContent,
      highlighted: document.getElementById('previewFrame').contentDocument.querySelectorAll('.element-multi-selected').length,
      styleInjected: document.getElementById('previewFrame').contentDocument
        .getElementById('editor-styles').textContent.includes('element-multi-selected'),
    }));
    expect(selection.count).toBe(3);
    expect(selection.highlighted).toBe(3);
    expect(selection.badge).toBe('3개 선택');
    expect(selection.styleInjected).toBe(true);

    await page.evaluate(() => window.htmlEditor.applyStyle('color', 'rgb(255, 0, 0)'));
    await expect
      .poll(() => page.evaluate(() => [...document.getElementById('previewFrame').contentDocument.querySelectorAll('p.note')]
        .every((p) => p.style.color === 'rgb(255, 0, 0)')))
      .toBe(true);
  });

  test('다중 선택 상태에서 Delete 로 한 번에 지우고 undo 로 되돌린다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await frame.click('p.note', { modifiers: ['Alt'] });

    await page.keyboard.press('Delete');
    await expect
      .poll(() => page.evaluate(() => document.getElementById('previewFrame').contentDocument.querySelectorAll('p.note').length))
      .toBe(0);

    await page.keyboard.press('Control+z');
    await expect
      .poll(() => page.evaluate(() => document.getElementById('previewFrame').contentDocument.querySelectorAll('p.note').length))
      .toBe(3);
    expect(await page.evaluate(() => document.getElementById('previewFrame').contentDocument.compatMode)).toBe('CSS1Compat');
  });

  test('iframe 에 포커스가 있어도 단축키가 동작한다 (Ctrl+D · Ctrl+A)', async ({ page }) => {
    await openEditor(page, 'editing.html');
    const frame = page.frames().find((f) => f !== page.mainFrame());

    await frame.click('h1');
    await frame.press('body', 'Control+d');
    await expect
      .poll(() => page.evaluate(() => document.getElementById('previewFrame').contentDocument.querySelectorAll('h1').length))
      .toBe(2);

    await frame.press('body', 'Escape');
    await frame.press('body', 'Control+a');
    await expect.poll(() => page.evaluate(() => window.htmlEditor.selectedElements.length)).toBe(2);
  });

  test('유사 선택: 형제 일괄 선택과 🧲 드롭다운 개수 표시', async ({ page }) => {
    await openEditor(page, 'editing.html');

    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectSimilar(doc.querySelector('li'), 'siblings');
    });
    expect(await page.evaluate(() => window.htmlEditor.selectedElements.length)).toBe(2);

    const dropdown = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('li'));
      window.htmlEditor.showSimilarDropdown();
      return {
        open: document.getElementById('similarDropdown').classList.contains('open'),
        tagCount: document.getElementById('similarCountTag').textContent,
      };
    });
    expect(dropdown).toEqual({ open: true, tagCount: '2' });
  });

  test('Ctrl+Shift+클릭으로 형제 범위를 선택한다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    const frame = page.frames().find((f) => f !== page.mainFrame());

    await frame.click('ul li:first-child');
    await frame.click('ul li:last-child', { modifiers: ['Control', 'Shift'] });
    await expect.poll(() => page.evaluate(() => window.htmlEditor.selectedElements.length)).toBe(2);
  });

  test('자기 자손 위에는 드롭할 수 없다 (DOM 예외 방지)', async ({ page }) => {
    await openEditor(page, 'editing.html');

    const outcome = await page.evaluate(() => {
      const editor = window.htmlEditor;
      const doc = document.getElementById('previewFrame').contentDocument;
      editor.draggedElement = doc.getElementById('wrap');
      editor.dropTarget = doc.querySelector('ul'); // #wrap 의 자손
      editor.dropPosition = 'before';
      try {
        editor.performDrop();
      } catch (e) {
        return 'threw: ' + e.message;
      }
      const stillNested = doc.getElementById('wrap').contains(doc.querySelector('ul'));
      editor.draggedElement = null;
      editor.dropTarget = null;
      return stillNested ? 'safe' : 'moved';
    });

    expect(outcome).toBe('safe');
  });

  test('새 이미지는 외부 서비스 대신 인라인 SVG 를 사용한다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('button'));
      window.htmlEditor.addElement(doc, 'img');
    });

    const src = await page.evaluate(() => document.getElementById('previewFrame').contentDocument.querySelector('img').src);
    expect(src.startsWith('data:image/svg+xml')).toBe(true);
  });

  test('단일 선택 없이 다중 선택만 있어도 스타일 패널이 열린다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    await page.evaluate(() => {
      const editor = window.htmlEditor;
      const doc = document.getElementById('previewFrame').contentDocument;
      editor.clearSelection();
      doc.querySelectorAll('li').forEach((li) => {
        li.classList.add('element-multi-selected');
        editor.selectedElements.push(li);
      });
      editor.updateSelectionCount();
      editor.showStylePanel();
    });

    expect(await page.evaluate(() => document.getElementById('stylePanel').style.display)).toBe('block');
    expect(await inlineStyle(page, 'li', 'color')).toBe('');
  });
});
