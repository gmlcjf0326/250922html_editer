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

    expect(await page.evaluate(() => document.getElementById('stylePanel').style.display)).not.toBe('none');
    expect(await inlineStyle(page, 'li', 'color')).toBe('');
  });

  // ---------- 드래그 앤 드롭 가이드 (3구역 · 라벨 · 취소 · 자동 스크롤) ----------
  //
  // 주의: 실제 마우스(page.mouse)로는 검증할 수 없다. 버튼을 누른 채의 이동을
  // CDP 가 sandbox iframe(allow-scripts 없음)으로 보내면 응답이 돌아오지 않아
  // mouse.move 가 영원히 멈춘다 — 드래그 로직을 전부 꺼도 재현되는 브라우저 계층
  // 문제다. 그래서 앱이 실제로 듣는 doc.body 리스너에 합성 이벤트를 보낸다.

  /** iframe 문서 좌표 기준으로 합성 마우스 이벤트를 보낸다 */
  function fireMouse(page, type, x, y) {
    return page.evaluate(([type, x, y]) => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const target = doc.elementFromPoint(x, y) || doc.body;
      target.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
      }));
    }, [type, x, y]);
  }

  /** 요소 중심의 iframe 문서 좌표 */
  function centerOf(page, selector) {
    return page.evaluate((sel) => {
      const r = document.getElementById('previewFrame').contentDocument
        .querySelector(sel).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, selector);
  }

  async function startSyntheticDrag(page, fromSel) {
    const from = await centerOf(page, fromSel);
    await fireMouse(page, 'mousedown', from.x, from.y);
    await fireMouse(page, 'mousemove', from.x + 12, from.y); // 5px 임계값 통과
    return from;
  }

  test('빈 컨테이너 안으로 드롭할 수 있고 가이드가 "안에 넣기"를 알려준다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    await startSyntheticDrag(page, 'p.note');
    const to = await centerOf(page, '#empty-box');
    await fireMouse(page, 'mousemove', to.x, to.y);

    // 드롭 전 상태: inside 하이라이트 + 대상 이름이 든 라벨
    const midDrag = await page.evaluate(() => ({
      insideClass: document.getElementById('previewFrame').contentDocument
        .getElementById('empty-box').classList.contains('drop-target-inside'),
      guide: document.getElementById('dragGuide').textContent,
    }));
    expect(midDrag.insideClass).toBe(true);
    expect(midDrag.guide).toContain('div 안에 넣기');

    await fireMouse(page, 'mouseup', to.x, to.y);
    const landed = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      return {
        inBox: !!doc.querySelector('#empty-box p.note'),
        leftover: doc.getElementById('empty-box').className,
      };
    });
    expect(landed.inBox).toBe(true);
    expect(landed.leftover).not.toContain('drop-target');
  });

  test('자식이 있는 컨테이너도 가운데 존의 빈 영역에서는 안으로 넣는다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    await startSyntheticDrag(page, 'button');
    // tall-box(120px)의 위쪽 60% 지점 — 자식 p 아래의 빈 영역이자 가운데 40% 존
    const to = await page.evaluate(() => {
      const r = document.getElementById('previewFrame').contentDocument
        .getElementById('tall-box').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 };
    });
    await fireMouse(page, 'mousemove', to.x, to.y);
    await fireMouse(page, 'mouseup', to.x, to.y);

    expect(await page.evaluate(() => !!document.getElementById('previewFrame')
      .contentDocument.querySelector('#tall-box > button'))).toBe(true);
  });

  test('드롭 가이드 라벨이 대상 이름을 포함한다 (p.note 앞에 삽입)', async ({ page }) => {
    await openEditor(page, 'editing.html');

    await startSyntheticDrag(page, 'button');
    const target = await page.evaluate(() => {
      const r = document.getElementById('previewFrame').contentDocument
        .querySelectorAll('p.note')[1].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + 2 }; // 위 30% 존 → before
    });
    await fireMouse(page, 'mousemove', target.x, target.y);

    expect(await page.evaluate(() => document.getElementById('dragGuide').textContent))
      .toContain('p.note 앞에 삽입');
    await fireMouse(page, 'mouseup', target.x, target.y);
  });

  test('Escape 로 드래그를 취소하면 DOM 이 변하지 않는다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    const before = await page.evaluate(() =>
      document.getElementById('previewFrame').contentDocument.getElementById('wrap').innerHTML);

    await startSyntheticDrag(page, 'p.note');
    const to = await centerOf(page, '#empty-box');
    await fireMouse(page, 'mousemove', to.x, to.y);
    await page.keyboard.press('Escape');
    await fireMouse(page, 'mouseup', to.x, to.y);

    const after = await page.evaluate(() => ({
      wrap: document.getElementById('previewFrame').contentDocument.getElementById('wrap').innerHTML,
      dragging: window.htmlEditor.isDragging,
      inBox: !!document.getElementById('previewFrame').contentDocument.querySelector('#empty-box p'),
    }));
    expect(after.dragging).toBe(false);
    expect(after.inBox).toBe(false);
    expect(after.wrap).toBe(before);
  });

  test('드래그 중 하단 가장자리에서 문서가 자동 스크롤된다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      doc.body.style.height = '3000px'; // 스크롤이 생기도록 늘린다
    });

    const from = await startSyntheticDrag(page, 'p.note');
    const viewH = await page.evaluate(() => document.getElementById('previewFrame')
      .contentDocument.defaultView.innerHeight);
    await fireMouse(page, 'mousemove', from.x, viewH - 10); // 하단 가장자리

    await expect
      .poll(() => page.evaluate(() => {
        const doc = document.getElementById('previewFrame').contentDocument;
        return (doc.scrollingElement || doc.documentElement).scrollTop;
      }))
      .toBeGreaterThan(0);
    await fireMouse(page, 'mouseup', from.x, viewH - 10);
  });

});
