const { test, expect } = require('@playwright/test');
const { APP_URL, fixture, openEditor, collectErrors } = require('./helpers');

test.describe('에디터 셸 (시작 화면 · 패널 · 단축키)', () => {
  test('콘솔 에러 없이 로드되고 빈 페이지로 시작할 수 있다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(APP_URL);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);

    await page.click('#startBlankBtn');
    await page.waitForFunction(() => !!window.htmlEditor
      && document.getElementById('previewFrame').contentDocument.querySelector('h1'));

    const state = await page.evaluate(() => ({
      uploadHidden: document.getElementById('uploadScreen').style.display === 'none',
      frameShown: document.getElementById('previewFrame').style.display === 'block',
      viewportShown: document.getElementById('viewportSwitcher').style.display === 'flex',
      fileName: document.getElementById('fileName').textContent,
    }));

    expect(state.uploadHidden).toBe(true);
    expect(state.frameShown).toBe(true);
    expect(state.viewportShown).toBe(true);
    expect(state.fileName).toBe('untitled.html');
    expect(errors).toEqual([]);
  });

  test('테마 토글이 동작하고 템플릿 기능은 완전히 제거되어 있다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    await page.click('#themeToggleBtn');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
    await page.click('#themeToggleBtn');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBeNull();

    const templates = await page.evaluate(() => ({
      button: !!document.getElementById('templatesBtn'),
      panel: !!document.getElementById('templatePanel'),
      sampleStart: !!document.getElementById('startSampleBtn'),
      insertMethod: typeof window.htmlEditor.insertTemplate,
      commands: window.htmlEditor.getCommands().filter((c) => c.title.includes('템플릿')).length,
    }));
    expect(templates).toEqual({
      button: false, panel: false, sampleStart: false,
      insertMethod: 'undefined', commands: 0,
    });
  });

  test('스타일 인스펙터가 열리고 선택 요소에 값을 적용한다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    const inspector = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('h1'));
      window.htmlEditor.showStylePanel();
      return {
        open: document.getElementById('stylePanel').style.display !== 'none',
        tabs: document.querySelectorAll('.sp-tab').length,
        controls: document.querySelectorAll('#stylePanel [data-css]').length,
      };
    });
    expect(inspector.open).toBe(true);
    expect(inspector.tabs).toBe(6);
    expect(inspector.controls).toBeGreaterThanOrEqual(50);

    await page.evaluate(() => {
      const el = document.getElementById('spFontSize');
      el.value = '33';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect
      .poll(() => page.evaluate(() => document.getElementById('previewFrame').contentDocument.querySelector('h1').style.fontSize))
      .toBe('33px');
  });

  test('히스토리 패널이 기록을 보여주고 해당 시점으로 되돌린다', async ({ page }) => {
    await openEditor(page, 'demo.html');
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('h1'));
      window.htmlEditor.applyStyle('fontSize', '33px');
    });
    await page.waitForTimeout(400);

    await page.click('#historyBtn');
    const history = await page.evaluate(() => ({
      open: document.getElementById('historyPanel').classList.contains('open'),
      entries: document.querySelectorAll('#historyList .history-entry').length,
      current: document.querySelectorAll('#historyList .history-entry.current').length,
    }));
    expect(history.open).toBe(true);
    expect(history.entries).toBeGreaterThanOrEqual(2);
    expect(history.current).toBe(1);

    await page.evaluate(() => window.htmlEditor.jumpToHistory(0));
    await expect
      .poll(() => page.evaluate(() => document.getElementById('previewFrame').contentDocument.querySelector('h1').style.fontSize))
      .not.toBe('33px');
  });

  test('명령 팔레트가 열리고 검색·실행되며 Escape 로 닫힌다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    await page.keyboard.press('Control+k');
    expect(await page.evaluate(() => document.getElementById('commandPaletteOverlay').style.display)).toBe('flex');

    await page.keyboard.type('다크');
    expect(await page.evaluate(() => document.querySelectorAll('#commandPaletteList .command-item').length)).toBeGreaterThanOrEqual(1);

    await page.keyboard.press('Enter');
    const afterRun = await page.evaluate(() => ({
      closed: document.getElementById('commandPaletteOverlay').style.display === 'none',
      dark: document.documentElement.getAttribute('data-theme') === 'dark',
    }));
    expect(afterRun).toEqual({ closed: true, dark: true });

    await page.evaluate(() => window.htmlEditor.applyTheme('light'));
    await page.keyboard.press('Control+k');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.getElementById('commandPaletteOverlay').style.display)).toBe('none');
  });

  test('요소가 선택된 상태에서도 입력창에는 글자가 그대로 입력된다', async ({ page }) => {
    await openEditor(page, 'demo.html');
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('h1'));
    });

    await page.keyboard.press('Control+k');
    await page.keyboard.type('copy paste');
    expect(await page.evaluate(() => document.getElementById('commandPaletteInput').value)).toBe('copy paste');
    await page.keyboard.press('Escape');
  });

  test('뷰포트 스위처가 미리보기 너비를 바꾼다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    await page.click('.viewport-btn[data-viewport="mobile"]');
    const mobile = await page.evaluate(() => ({
      attr: document.body.dataset.viewport,
      active: document.querySelector('.viewport-btn[data-viewport="mobile"]').classList.contains('active'),
      width: Math.round(document.getElementById('previewFrame').getBoundingClientRect().width),
    }));
    expect(mobile).toEqual({ attr: 'mobile', active: true, width: 375 });

    await page.click('.viewport-btn[data-viewport="full"]');
    const full = await page.evaluate(() => ({
      attr: document.body.dataset.viewport,
      width: document.getElementById('previewFrame').getBoundingClientRect().width,
    }));
    expect(full.attr).toBeUndefined();
    expect(full.width).toBeGreaterThan(1000);
  });

  test('뷰포트 막대는 아래 iframe 콘텐츠의 클릭을 가로채지 않는다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    // 막대의 실제 좌표를 재서, 버튼이 아닌 막대 여백 위에 편집 대상이 오도록 맞춘다
    const point = await page.evaluate(() => {
      const bar = document.getElementById('viewportSwitcher').getBoundingClientRect();
      const doc = document.getElementById('previewFrame').contentDocument;
      const target = doc.querySelector('.hero h1');
      target.style.position = 'fixed';
      target.style.margin = '0';
      target.style.left = Math.round(bar.left) + 'px';
      target.style.top = Math.round(bar.top) + 'px';
      target.style.width = Math.round(bar.width) + 'px';
      target.style.height = Math.round(bar.height) + 'px';
      // 막대 안쪽이지만 버튼이 시작되기 전인 왼쪽 패딩 지점
      return { x: Math.round(bar.left) + 2, y: Math.round(bar.top) + 2, bottom: Math.round(bar.bottom) };
    });

    // 클릭 지점이 막대의 경계 안(기하학적으로)인지 확인한다.
    // hit-test 로 확인하면 안 되는데, 수정 자체가 막대를 hit-test 에서 투명하게 만들기 때문이다.
    const inside = await page.evaluate(({ x, y }) => {
      const bar = document.getElementById('viewportSwitcher').getBoundingClientRect();
      return x >= bar.left && x <= bar.right && y >= bar.top && y <= bar.bottom;
    }, point);
    expect(inside).toBe(true);

    await page.mouse.click(point.x, point.y);
    await expect
      .poll(() => page.evaluate(() => (window.htmlEditor.selectedElement || {}).tagName))
      .toBe('H1');
  });

  test('단축키 가이드와 외부 에디터 경로 설정이 동작한다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    await page.keyboard.press('Shift+Slash');
    expect(await page.evaluate(() => document.getElementById('shortcutsModal').style.display)).toBe('flex');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.getElementById('shortcutsModal').style.display)).toBe('none');

    await page.click('#openInEditorBtn');
    expect(await page.evaluate(() => document.getElementById('openInEditorDropdown').classList.contains('open'))).toBe(true);

    await page.click('.gs-dropdown-item[data-editor="set-path"]');
    expect(await page.evaluate(() => document.getElementById('pathModal').style.display)).toBe('flex');

    await page.fill('#pathInput', '/home/user/test.html');
    await page.click('#pathSaveBtn');
    expect(await page.evaluate(() => localStorage.getItem('localFilePath'))).toBe('/home/user/test.html');
  });

  test('Ctrl+D 로 복제하고 ArrowUp 으로 순서를 옮긴다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('h1'));
    });

    await page.keyboard.press('Control+d');
    await expect
      .poll(() => page.evaluate(() => document.getElementById('previewFrame').contentDocument.querySelectorAll('h1').length))
      .toBe(2);

    await page.evaluate(() => { window.htmlEditor.selectedElement.textContent = 'CLONE_MARK'; });
    await page.keyboard.press('ArrowUp');
    await expect
      .poll(() => page.evaluate(() => document.getElementById('previewFrame').contentDocument.querySelector('#wrap').children[0].textContent))
      .toBe('CLONE_MARK');
  });

  test('업로드한 문서가 standards mode 로 렌더링된다', async ({ page }) => {
    await page.goto(APP_URL);
    await page.setInputFiles('#fileInput', fixture('demo.html'));
    await page.waitForFunction(() => !!window.htmlEditor
      && document.getElementById('previewFrame').contentDocument.querySelector('.hero'));

    expect(await page.evaluate(() => document.getElementById('previewFrame').contentDocument.compatMode)).toBe('CSS1Compat');
  });

  test('File System Access 미지원 브라우저에서는 로컬 열기 버튼이 숨겨진다', async ({ page }) => {
    await page.goto(APP_URL);
    const consistent = await page.evaluate(() => {
      const supported = !!window.showOpenFilePicker;
      const visible = document.getElementById('startPickBtn').style.display !== 'none';
      return supported ? visible : !visible;
    });
    expect(consistent).toBe(true);
  });
});
