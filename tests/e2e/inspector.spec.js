const { test, expect } = require('@playwright/test');
const { openEditor, inlineStyle, selectAndOpenInspector } = require('./helpers');

/** 인스펙터 컨트롤에 값을 넣고 change 이벤트를 발생시킨다 (선언적 바인딩 경로 검증). */
function setControl(page, selector, value, eventName = 'change') {
  return page.evaluate(([sel, val, evt]) => {
    const el = document.querySelector(sel);
    el.value = val;
    el.dispatchEvent(new Event(evt, { bubbles: true }));
  }, [selector, value, eventName]);
}

test.describe('스타일 인스펙터', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
  });

  test('선택 요소 정보와 6개 탭이 표시된다', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'h1.title');

    const info = await page.evaluate(() => ({
      open: document.getElementById('stylePanel').style.display !== 'none',
      tag: document.getElementById('spTargetTag').textContent,
      path: document.getElementById('spTargetPath').textContent,
      tabs: document.querySelectorAll('.sp-tab').length,
      panes: document.querySelectorAll('.sp-pane').length,
      controls: document.querySelectorAll('#stylePanel [data-css]').length,
    }));

    expect(info.open).toBe(true);
    expect(info.tag).toBe('h1');
    expect(info.path).toContain('.title');
    expect(info.path).toContain('div');
    expect(info.tabs).toBe(6);
    expect(info.panes).toBe(6);
    expect(info.controls).toBeGreaterThanOrEqual(50);
  });

  test('색상 컨트롤이 계산된 색을 hex 로 보여주고 계산값 힌트를 정수로 다듬는다', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'h1.title');

    const state = await page.evaluate(() => ({
      picker: document.getElementById('spTextColor').value,
      text: document.getElementById('spTextColorText').value,
      backgroundText: document.getElementById('bgColorText').value,
      widthHint: document.getElementById('spWidth').placeholder,
    }));

    expect(state.picker).toBe('#000000');
    expect(state.text).toBe('#000000');
    expect(state.backgroundText).toBe(''); // 투명 배경은 빈 값
    expect(state.widthHint).toMatch(/^\d+px$/);
  });

  test('탭 전환이 해당 패널만 보여준다', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'h1.title');

    await page.click('.sp-tab[data-pane="text"]');
    const tabs = await page.evaluate(() => ({
      active: document.querySelector('.sp-tab.active').dataset.pane,
      textPane: getComputedStyle(document.querySelector('.sp-pane[data-pane="text"]')).display,
      structurePane: getComputedStyle(document.querySelector('.sp-pane[data-pane="structure"]')).display,
    }));

    expect(tabs).toEqual({ active: 'text', textPane: 'block', structurePane: 'none' });
  });

  test('텍스트 탭: 글꼴·크기·굵기·줄간격·자간·색상', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'h1.title');
    await page.click('.sp-tab[data-pane="text"]');

    // 상속된 글꼴(Georgia)이 select 에 반영되어야 한다
    expect((await page.inputValue('#spFontFamily')).toLowerCase()).toContain('georgia');

    await page.selectOption('#spFontFamily', "'Noto Sans KR', sans-serif");
    expect(await inlineStyle(page, 'h1.title', 'fontFamily')).toContain('Noto Sans KR');

    await page.fill('#spFontCustom', "'Pretendard', system-ui");
    await page.click('#spFontCustomApply');
    expect(await inlineStyle(page, 'h1.title', 'fontFamily')).toContain('Pretendard');

    // 숫자 입력 ↔ 슬라이더 동기화
    await setControl(page, '#spFontSize', '42');
    expect(await inlineStyle(page, 'h1.title', 'fontSize')).toBe('42px');
    expect(await page.inputValue('#spFontSizeRange')).toBe('42');

    await page.selectOption('#spFontWeight', '600');
    await setControl(page, '#spLineHeight', '1.8');
    await setControl(page, '#spLetterSpacing', '-0.5');
    expect(await inlineStyle(page, 'h1.title', 'fontWeight')).toBe('600');
    expect(await inlineStyle(page, 'h1.title', 'lineHeight')).toBe('1.8');
    expect(await inlineStyle(page, 'h1.title', 'letterSpacing')).toBe('-0.5px');

    await setControl(page, '#spTextColorText', '#ff0000');
    expect(await inlineStyle(page, 'h1.title', 'color')).toBe('rgb(255, 0, 0)');
    expect(await page.inputValue('#spTextColor')).toBe('#ff0000');
  });

  test('텍스트 탭: 정렬·서식 토글은 다시 누르면 해제된다', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'h1.title');
    await page.click('.sp-tab[data-pane="text"]');

    await page.click('.sp-toggle[data-css="textAlign"][data-value="center"]');
    expect(await inlineStyle(page, 'h1.title', 'textAlign')).toBe('center');
    expect(await page.evaluate(() => document.querySelector('.sp-toggle[data-css="textAlign"][data-value="center"]').classList.contains('active'))).toBe(true);

    await page.click('.sp-toggle[data-css="textAlign"][data-value="center"]');
    expect(await inlineStyle(page, 'h1.title', 'textAlign')).toBe('');

    await page.click('.sp-toggle[data-css="fontStyle"]');
    await page.click('.sp-toggle[data-css="textDecoration"][data-value="underline"]');
    expect(await inlineStyle(page, 'h1.title', 'fontStyle')).toBe('italic');
    expect(await inlineStyle(page, 'h1.title', 'textDecoration')).toContain('underline');
  });

  test('박스 탭: 크기·여백 링크·테두리·둥글기', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'h1.title');
    await page.click('.sp-tab[data-pane="box"]');

    await setControl(page, '#spWidth', '320px');
    await setControl(page, '#spMaxWidth', '80%');
    expect(await inlineStyle(page, 'h1.title', 'width')).toBe('320px');
    expect(await inlineStyle(page, 'h1.title', 'maxWidth')).toBe('80%');

    // 4방향 동일 링크
    await page.check('#spPaddingLink');
    await setControl(page, '#paddingTop', '12');
    const padding = await page.evaluate(() => {
      const s = document.getElementById('previewFrame').contentDocument.querySelector('h1.title').style;
      return [s.paddingTop, s.paddingBottom, s.paddingLeft, s.paddingRight].join(',');
    });
    expect(padding).toBe('12px,12px,12px,12px');

    await page.fill('#borderWidth', '3');
    await page.selectOption('#borderStyle', 'dashed');
    await page.click('#applyBorder');
    expect(await inlineStyle(page, 'h1.title', 'border')).toContain('dashed');

    // 한쪽 면만 적용하면 그 면에만 테두리가 남는다.
    // 인라인 축약(style.borderTop)의 직렬화는 크로뮴 버전에 따라 달라지므로
    // (신버전은 border-width/style/color 삼각형으로 다시 직렬화해 축약이 빈 문자열이 된다)
    // 실제로 그려지는 값(computed)으로 확인한다.
    await page.click('[data-border-side="borderBottom"]');
    const sides = await page.evaluate(() => {
      const el = document.getElementById('previewFrame').contentDocument.querySelector('h1.title');
      const cs = el.ownerDocument.defaultView.getComputedStyle(el);
      return {
        bottomStyle: cs.borderBottomStyle,
        bottomWidth: cs.borderBottomWidth,
        topStyle: cs.borderTopStyle,
        topWidth: cs.borderTopWidth,
      };
    });
    expect(sides).toEqual({
      bottomStyle: 'dashed', bottomWidth: '3px', topStyle: 'none', topWidth: '0px',
    });

    await setControl(page, '#spRadiusNum', '16');
    expect(await inlineStyle(page, 'h1.title', 'borderRadius')).toBe('16px');
    expect(await page.inputValue('#borderRadius')).toBe('16');

    await setControl(page, '[data-css="borderTopLeftRadius"]', '40');
    expect(await inlineStyle(page, 'h1.title', 'borderTopLeftRadius')).toBe('40px');
  });

  test('배경 탭: 배경색·이미지·그림자·투명도·팔레트 대상 전환', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'h1.title');
    await page.click('.sp-tab[data-pane="fill"]');

    await setControl(page, '#bgColorText', '#00ff00');
    expect(await inlineStyle(page, 'h1.title', 'backgroundColor')).toBe('rgb(0, 255, 0)');

    // 그라데이션 생성 UI 는 제거됐다 (문서 탭의 "그라데이션 평탄화"만 남긴다)
    const gradientUI = await page.evaluate(() => ({
      apply: !!document.getElementById('applyGradient'),
      start: !!document.getElementById('gradientStart'),
    }));
    expect(gradientUI).toEqual({ apply: false, start: false });

    await page.fill('#spBgImage', 'https://example.com/a.png');
    await page.click('#spBgImageApply');
    expect(await inlineStyle(page, 'h1.title', 'backgroundImage')).toContain('example.com/a.png');

    await page.fill('#shadowX', '2');
    await page.fill('#shadowY', '6');
    await page.fill('#shadowBlur', '18');
    await page.fill('#spShadowSpread', '1');
    await page.check('#spShadowInset');
    await page.click('#applyShadow');
    const shadow = await inlineStyle(page, 'h1.title', 'boxShadow');
    expect(shadow).toContain('inset');
    expect(shadow).toContain('18px');
    expect(shadow).toContain('rgba');

    await setControl(page, '#spOpacity', '40', 'input');
    expect(await inlineStyle(page, 'h1.title', 'opacity')).toBe('0.4');
    expect(await page.textContent('#spOpacityValue')).toBe('40%');

    // 팔레트 적용 대상을 글자색으로 바꾼다
    await page.click('[data-palette-target="color"]');
    await page.click('.palette-color[data-color="#3b82f6"]');
    expect(await inlineStyle(page, 'h1.title', 'color')).toBe('rgb(59, 130, 246)');
  });

  test('배치 탭: flex 프리셋·gap·position·가운데 정렬', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, '#wrap');
    await page.click('.sp-tab[data-pane="layout"]');

    await page.click('#spFlexRowCenter');
    const flex = await page.evaluate(() => {
      const s = document.getElementById('previewFrame').contentDocument.querySelector('#wrap').style;
      return [s.display, s.flexDirection, s.justifyContent, s.alignItems].join(',');
    });
    expect(flex).toBe('flex,row,center,center');

    await setControl(page, '[data-css="gap"]', '24');
    await page.selectOption('#spPosition', 'relative');
    await setControl(page, '[data-css="top"]', '10px');
    const layout = await page.evaluate(() => {
      const s = document.getElementById('previewFrame').contentDocument.querySelector('#wrap').style;
      return [s.gap, s.position, s.top].join(',');
    });
    expect(layout).toBe('24px,relative,10px');

    await page.click('#spCenterBlock');
    expect(await inlineStyle(page, '#wrap', 'marginLeft')).toBe('auto');
    expect(await inlineStyle(page, '#wrap', 'marginRight')).toBe('auto');
  });

  test('구조 탭: 부모 밖으로 빼기와 앞 요소 안으로 넣기', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'p.note');
    await page.click('.sp-tab[data-pane="structure"]');

    await page.click('#spMoveOut');
    const movedOut = await page.evaluate(() => {
      const el = window.htmlEditor.selectedElement;
      return { parent: el.parentElement.tagName, tag: el.tagName, text: el.textContent.trim() };
    });
    expect(movedOut).toEqual({ parent: 'BODY', tag: 'P', text: 'P1' });

    await page.click('#spNestPrev');
    expect(await page.evaluate(() => window.htmlEditor.selectedElement.parentElement.id)).toBe('wrap');
  });

  test('구조 탭: 태그 변경이 내용·속성·선택을 유지한다', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'h1.title');
    await page.click('.sp-tab[data-pane="text"]');
    await setControl(page, '#spFontSize', '42');

    await page.click('.sp-tab[data-pane="structure"]');
    await page.selectOption('#spTagSelect', 'h2');
    await page.click('#spTagApply');

    const changed = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const h2 = doc.querySelector('h2.title');
      return {
        exists: !!h2,
        text: h2 ? h2.textContent.trim() : '',
        noHeading1: !doc.querySelector('h1'),
        keptStyle: h2 ? h2.style.fontSize : '',
        selected: window.htmlEditor.selectedElement.tagName,
      };
    });

    expect(changed).toEqual({
      exists: true, text: 'Hello', noHeading1: true, keptStyle: '42px', selected: 'H2',
    });
  });

  test('구조 탭: 클래스/ID 편집이 에디터 내부 클래스를 지우지 않는다', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'h1.title');
    await page.click('.sp-tab[data-pane="structure"]');

    await page.fill('#spClassInput', 'headline big');
    await page.fill('#spIdInput', 'mainTitle');
    await page.click('#spIdentityApply');

    const identity = await page.evaluate(() => {
      const el = document.getElementById('previewFrame').contentDocument.querySelector('#mainTitle');
      return { id: el.id, classes: [...el.classList].join(' ') };
    });

    expect(identity.id).toBe('mainTitle');
    expect(identity.classes).toContain('headline');
    expect(identity.classes).toContain('big');
    expect(identity.classes).toContain('element-selected');
  });

  test('구조 탭: 스타일 복사·붙여넣기 · CSS 직접 적용 · 초기화', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'h1.title');
    await page.click('.sp-tab[data-pane="text"]');
    await setControl(page, '#spFontSize', '42');

    await page.click('.sp-tab[data-pane="structure"]');
    await page.click('#spCopyStyle');

    await selectAndOpenInspector(page, '#cta');
    await page.click('.sp-tab[data-pane="structure"]');
    await page.click('#spPasteStyle');
    expect(await inlineStyle(page, '#cta', 'fontSize')).toBe('42px');

    await page.fill('#spStyleText', 'color: rgb(1, 2, 3); padding-left: 33px');
    await page.click('#spStyleTextApply');
    expect(await inlineStyle(page, '#cta', 'color')).toBe('rgb(1, 2, 3)');
    expect(await inlineStyle(page, '#cta', 'paddingLeft')).toBe('33px');

    await page.click('#spResetStyle');
    expect(await page.evaluate(() => document.getElementById('previewFrame').contentDocument.querySelector('#cta').getAttribute('style'))).toBeFalsy();
  });

  test('다중 선택을 하나의 div 로 묶고, 해제하면 내용이 그대로 남는다', async ({ page }) => {
    await openEditor(page, 'inspector.html');

    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const editor = window.htmlEditor;
      editor.clearSelection();
      doc.querySelectorAll('#wrap p.note').forEach((p) => {
        p.classList.add('element-multi-selected');
        editor.selectedElements.push(p);
      });
      editor.updateSelectionCount();
      editor.wrapWithDiv();
    });

    const wrapped = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      return {
        inner: doc.querySelectorAll('#wrap > div > p.note').length,
        total: doc.querySelectorAll('p.note').length,
      };
    });
    expect(wrapped).toEqual({ inner: 2, total: 2 });

    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('#wrap > div'));
      window.htmlEditor.unwrapElement();
    });

    const unwrapped = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      return {
        direct: doc.querySelectorAll('#wrap > p.note').length,
        wrappers: doc.querySelectorAll('#wrap > div').length,
        texts: [...doc.querySelectorAll('#wrap p.note')].map((p) => p.textContent.trim()).sort().join(','),
      };
    });
    expect(unwrapped).toEqual({ direct: 2, wrappers: 0, texts: 'P1,P2' });
  });

  test('다중 선택 상태에서 패널로 값을 바꾸면 전체에 적용되고 배지가 뜬다', async ({ page }) => {
    await openEditor(page, 'inspector.html');

    const badge = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const editor = window.htmlEditor;
      editor.clearSelection();
      doc.querySelectorAll('p.note').forEach((p) => {
        p.classList.add('element-multi-selected');
        editor.selectedElements.push(p);
      });
      editor.updateSelectionCount();
      editor.showStylePanel();
      return document.getElementById('spTargetCount').textContent;
    });
    expect(badge).toContain('2개');

    await page.click('.sp-tab[data-pane="text"]');
    await setControl(page, '#spFontSize', '27');
    await expect
      .poll(() => page.evaluate(() => [...document.getElementById('previewFrame').contentDocument.querySelectorAll('p.note')]
        .every((p) => p.style.fontSize === '27px')))
      .toBe(true);
  });

  test('구조 편집 후에도 undo 와 다운로드 정리가 정상 동작한다', async ({ page }) => {
    await openEditor(page, 'inspector.html');
    await selectAndOpenInspector(page, 'h1.title');
    await page.click('.sp-tab[data-pane="text"]');
    await setControl(page, '#spFontSize', '27');
    await expect.poll(() => inlineStyle(page, 'h1.title', 'fontSize')).toBe('27px');
    // 스타일 변경은 200ms 디바운스 후 히스토리에 쌓이므로, 기록된 뒤에 되돌린다
    await expect.poll(() => page.evaluate(() => window.htmlEditor.history.length)).toBeGreaterThan(1);

    await page.evaluate(() => window.htmlEditor.undo());
    await expect.poll(() => inlineStyle(page, 'h1.title', 'fontSize')).not.toBe('27px');
    expect(await page.evaluate(() => document.getElementById('previewFrame').contentDocument.compatMode)).toBe('CSS1Compat');

    const clean = await page.evaluate(() => window.htmlEditor.extractCleanHTML());
    expect(clean.toLowerCase().startsWith('<!doctype html')).toBe(true);
    expect(clean).not.toContain('editable-text');
    expect(clean).not.toContain('element-selected');
  });
});
