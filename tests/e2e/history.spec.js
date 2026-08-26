const { test, expect } = require('@playwright/test');
const { openEditor } = require('./helpers');

/** 편집 → 디바운스된 히스토리 기록까지 기다린다. */
async function editAndRecord(page, apply, arg) {
  const before = await page.evaluate(() => window.htmlEditor.history.length);
  await page.evaluate(apply, arg);
  await expect.poll(() => page.evaluate(() => window.htmlEditor.history.length)).toBeGreaterThan(before);
}

test.describe('되돌리기 (제자리 복원)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
  });

  test('되돌리기를 반복해도 편집용 스팬이 중첩되지 않는다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    const initialSpans = await page.evaluate(() =>
      document.getElementById('previewFrame').contentDocument.querySelectorAll('.editable-text').length);
    expect(initialSpans).toBeGreaterThan(0);

    for (const size of ['20px', '30px', '40px']) {
      await editAndRecord(page, (value) => {
        const doc = document.getElementById('previewFrame').contentDocument;
        window.htmlEditor.selectElement(doc.querySelector('h1'));
        window.htmlEditor.applyStyle('fontSize', value);
      }, size);
    }

    await page.evaluate(() => { window.htmlEditor.undo(); });
    await page.evaluate(() => { window.htmlEditor.undo(); });
    await page.evaluate(() => { window.htmlEditor.redo(); });

    const spans = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      return {
        total: doc.querySelectorAll('.editable-text').length,
        nested: doc.querySelectorAll('.editable-text .editable-text').length,
        text: doc.querySelector('h1').textContent.trim(),
      };
    });

    expect(spans.nested).toBe(0);
    expect(spans.total).toBe(initialSpans);
    expect(spans.text).toBe('Hello');
  });

  test('되돌린 뒤에도 스크롤 위치가 유지된다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    // 스크롤이 생기도록 문서를 길게 만든 뒤 기록
    await editAndRecord(page, () => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const filler = doc.createElement('div');
      filler.id = 'filler';
      filler.style.height = '3000px';
      doc.body.appendChild(filler);
      window.htmlEditor.saveToHistory('여백 추가', true);
    });
    await editAndRecord(page, () => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('h1'));
      window.htmlEditor.applyStyle('color', 'rgb(9, 9, 9)');
    });

    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      (doc.scrollingElement || doc.documentElement).scrollTop = 800;
    });

    await page.evaluate(() => window.htmlEditor.undo());
    await expect
      .poll(() => page.evaluate(() => {
        const doc = document.getElementById('previewFrame').contentDocument;
        return (doc.scrollingElement || doc.documentElement).scrollTop;
      }))
      .toBe(800);
  });

  test('되돌리기가 에디터 스타일을 중복 주입하지 않는다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    await editAndRecord(page, () => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('h1'));
      window.htmlEditor.applyStyle('fontSize', '31px');
    });

    await page.evaluate(() => window.htmlEditor.undo());
    await page.evaluate(() => window.htmlEditor.redo());

    const styleNodes = await page.evaluate(() =>
      document.getElementById('previewFrame').contentDocument.querySelectorAll('style#editor-styles').length);
    expect(styleNodes).toBe(1);
  });

  test('복원에 실패해도 엉뚱한 요소를 자동 선택하지 않는다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    await editAndRecord(page, () => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('button'));
      window.htmlEditor.deleteElement();
    });

    await page.evaluate(() => {
      // 저장된 셀렉터를 일부러 못 찾게 만든다
      window.htmlEditor.history[window.htmlEditor.historyIndex].selectedElementSelector = '#존재하지-않는-요소';
      window.htmlEditor.undo();
    });

    // 복원이 끝나고 충분히 지난 뒤에도 선택이 비어 있어야 한다
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.htmlEditor.selectedElement)).toBeNull();
    expect(await page.evaluate(() => document.getElementById('floatingToolbar').style.display)).toBe('none');
  });

  // 요소별 리스너는 body 캡처 위임이 stopPropagation 으로 눌러 실제로는 실행되지 않던 죽은 코드였다.
  // 리스너를 제거한 뒤에도 단일 디스패치가 유지되는지 지키는 가드.
  test('요소를 추가한 뒤 클릭하면 선택 핸들러가 한 번만 실행된다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('h1'));
      window.htmlEditor.addElement(doc, 'button', '새 버튼');

      // selectElement 호출 횟수를 센다
      window.__selectCalls = 0;
      const original = window.htmlEditor.selectElement.bind(window.htmlEditor);
      window.htmlEditor.selectElement = (...args) => { window.__selectCalls += 1; return original(...args); };
    });

    const frame = page.frames().find((f) => f !== page.mainFrame());
    await frame.click('button:last-of-type');

    expect(await page.evaluate(() => window.__selectCalls)).toBe(1);
  });
});
