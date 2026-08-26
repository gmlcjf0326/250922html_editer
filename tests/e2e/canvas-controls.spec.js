const { test, expect } = require('@playwright/test');
const { openEditor } = require('./helpers');

/** iframe 문서의 요소에 합성 마우스 이벤트를 직접 보낸다 (드래그 테스트와 같은 이유로 page.mouse 불가) */
function fireOn(page, selector, type, x, y) {
  return page.evaluate(([sel, type, x, y]) => {
    const doc = document.getElementById('previewFrame').contentDocument;
    const target = sel ? doc.querySelector(sel) : doc;
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
    }));
  }, [selector, type, x, y]);
}

test.describe('캔버스 직접 조작 (리사이즈 핸들 · + 삽입)', () => {
  test('선택하면 핸들과 실측 배지가 나타나고, 다중 선택이면 숨는다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    const shown = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const el = doc.getElementById('empty-box');
      window.htmlEditor.selectElement(el);
      const overlay = doc.getElementById('gs-canvas-overlay');
      const rect = el.getBoundingClientRect();
      return {
        visible: overlay.style.display === 'block',
        handles: overlay.querySelectorAll('.gs-rh').length,
        badge: overlay.querySelector('.gs-size-badge').textContent,
        expected: `${Math.round(rect.width)} × ${Math.round(rect.height)}`,
      };
    });
    expect(shown.visible).toBe(true);
    expect(shown.handles).toBe(3);
    expect(shown.badge).toBe(shown.expected);

    const hidden = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const editor = window.htmlEditor;
      editor.selectedElements = [doc.querySelector('h1'), doc.querySelector('p.note')];
      editor.updateCanvasOverlay();
      return doc.getElementById('gs-canvas-overlay').style.display;
    });
    expect(hidden).toBe('none');
  });

  test('핸들 드래그로 너비가 바뀌고 히스토리는 정확히 1건 늘어난다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.getElementById('empty-box'));
    });

    const start = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const handle = doc.querySelector('#gs-canvas-overlay .gs-rh[data-dir="e"]');
      const r = handle.getBoundingClientRect();
      return {
        x: r.left + 5, y: r.top + 5,
        width: doc.getElementById('empty-box').getBoundingClientRect().width,
        history: window.htmlEditor.history.length,
      };
    });

    await fireOn(page, '#gs-canvas-overlay .gs-rh[data-dir="e"]', 'mousedown', start.x, start.y);
    await fireOn(page, null, 'mousemove', start.x - 120, start.y);
    await fireOn(page, null, 'mousemove', start.x - 100, start.y);
    await fireOn(page, null, 'mouseup', start.x - 100, start.y);

    const after = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const rect = doc.getElementById('empty-box').getBoundingClientRect();
      return {
        style: doc.getElementById('empty-box').style.width,
        badge: doc.querySelector('#gs-canvas-overlay .gs-size-badge').textContent,
        rectSize: `${Math.round(rect.width)} × ${Math.round(rect.height)}`,
        history: window.htmlEditor.history.length,
      };
    });
    expect(after.style).toBe(Math.round(start.width - 100) + 'px');
    expect(after.badge).toBe(after.rectSize); // 배지는 실측(테두리 포함) 기준
    expect(after.history).toBe(start.history + 1);
  });

  test('+ 버튼 메뉴로 문단을 삽입하면 바로 뒤에 생기고 선택된다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.getElementById('empty-box'));
      doc.querySelector('#gs-canvas-overlay .gs-add-btn').click();
    });
    expect(await page.evaluate(() => document.getElementById('previewFrame')
      .contentDocument.querySelector('#gs-canvas-overlay .gs-add-menu').classList.contains('open'))).toBe(true);

    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const items = doc.querySelectorAll('#gs-canvas-overlay .gs-add-menu button');
      items[0].click(); // 문단
    });

    const result = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const next = doc.getElementById('empty-box').nextElementSibling;
      return {
        tag: next && next.tagName,
        selected: window.htmlEditor.selectedElement === next,
        editable: !!next.querySelector('.editable-text'),
      };
    });
    expect(result.tag).toBe('P');
    expect(result.selected).toBe(true);
    expect(result.editable).toBe(true);
  });

  test('오버레이는 다운로드 결과와 히스토리 스냅숏 어디에도 새지 않는다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.getElementById('empty-box'));
      window.htmlEditor.applyStyle('color', 'rgb(1, 2, 3)'); // 히스토리 한 건 기록
    });
    await expect.poll(() => page.evaluate(() => window.htmlEditor.history.length)).toBeGreaterThanOrEqual(2);

    const leaks = await page.evaluate(() => ({
      download: window.htmlEditor.extractCleanHTML().includes('data-editor-ui'),
      snapshots: window.htmlEditor.history.some((s) => s.html.includes('data-editor-ui')),
    }));
    expect(leaks).toEqual({ download: false, snapshots: false });

    // undo 로 문서가 통째로 교체된 뒤에도 오버레이가 다시 동작해야 한다
    await page.evaluate(() => window.htmlEditor.undo());
    const revived = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('h1'));
      const overlay = doc.getElementById('gs-canvas-overlay');
      return overlay && overlay.style.display === 'block';
    });
    expect(revived).toBe(true);
  });
});
