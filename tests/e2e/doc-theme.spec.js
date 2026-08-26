const { test, expect } = require('@playwright/test');
const { openEditor } = require('./helpers');

/** 문서 탭을 연다 (선택 없이도 열려야 한다). */
async function openDocTab(page) {
  await page.evaluate(() => {
    window.htmlEditor.showStylePanel();
    window.htmlEditor.switchStyleTab('doc');
  });
}

/** 편집 대상 문서에서 값을 읽는다. */
function inDoc(page, fn) {
  return page.evaluate(fn);
}

test.describe('문서 스타일 일괄 적용', () => {
  test('선택이 없어도 패널이 문서 탭으로 열린다', async ({ page }) => {
    await openEditor(page, 'doc.html');
    await page.evaluate(() => window.htmlEditor.showStylePanel());

    const state = await page.evaluate(() => ({
      open: document.getElementById('stylePanel').style.display !== 'none',
      activePane: document.querySelector('.sp-pane.active').dataset.pane,
      noSelection: document.getElementById('stylePanel').classList.contains('no-selection'),
    }));
    expect(state).toEqual({ open: true, activePane: 'doc', noSelection: true });
  });

  test('글꼴 프리셋이 문서 전체에 적용되고 웹폰트 링크를 끌 수 있다', async ({ page }) => {
    await openEditor(page, 'doc.html');
    await openDocTab(page);

    await page.click('[data-font-preset="noto"]');
    const applied = await inDoc(page, () => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const view = doc.defaultView;
      return {
        css: doc.getElementById('doc-theme').textContent,
        body: view.getComputedStyle(doc.body).fontFamily,
        heading: view.getComputedStyle(doc.querySelector('h2')).fontFamily,
      };
    });
    expect(applied.css).toContain('@import');
    expect(applied.body).toContain('Noto Sans KR');
    expect(applied.heading).toContain('Noto Serif KR');

    await page.uncheck('#spDocWebfont');
    const withoutWebfont = await inDoc(page, () =>
      document.getElementById('previewFrame').contentDocument.getElementById('doc-theme').textContent);
    expect(withoutWebfont).not.toContain('@import');
    expect(withoutWebfont).toContain('Noto Sans KR');

    // 시스템 프리셋은 애초에 웹폰트를 쓰지 않는다
    await page.check('#spDocWebfont');
    await page.click('[data-font-preset="system"]');
    const system = await inDoc(page, () =>
      document.getElementById('previewFrame').contentDocument.getElementById('doc-theme').textContent);
    expect(system).not.toContain('@import');
  });

  test('적용 범위를 "선택 요소 안"으로 두면 그 안쪽만 바뀐다', async ({ page }) => {
    await openEditor(page, 'doc.html');
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('#detail'));
      window.htmlEditor.showStylePanel();
      window.htmlEditor.switchStyleTab('doc');
    });

    await page.click('#spDocScopeSel');
    await page.click('[data-font-preset="myeongjo"]');

    const fonts = await inDoc(page, () => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const view = doc.defaultView;
      return {
        inside: view.getComputedStyle(doc.querySelector('#detail h2')).fontFamily,
        outside: view.getComputedStyle(doc.querySelector('#intro h2')).fontFamily,
        docTheme: !!doc.getElementById('doc-theme'),
      };
    });
    expect(fonts.inside).toContain('Nanum Gothic');
    expect(fonts.outside).not.toContain('Nanum Gothic');
    expect(fonts.docTheme).toBe(false);
  });

  test('팔레트가 링크·제목·표 머리글에 한 번에 적용된다', async ({ page }) => {
    await openEditor(page, 'doc.html');
    await openDocTab(page);

    await page.click('[data-palette="forest"]');
    const colors = await inDoc(page, () => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const view = doc.defaultView;
      return {
        link: view.getComputedStyle(doc.querySelector('a')).color,
        heading: view.getComputedStyle(doc.querySelector('h2')).color,
        th: view.getComputedStyle(doc.querySelector('th')).backgroundColor,
        active: document.querySelector('[data-palette="forest"]').classList.contains('active'),
      };
    });
    expect(colors.link).toBe('rgb(4, 120, 87)');
    expect(colors.heading).toBe('rgb(15, 23, 42)');
    expect(colors.th).toBe('rgb(236, 253, 245)');
    expect(colors.active).toBe(true);
  });

  test('타이포 정돈이 체크한 항목만 적용한다', async ({ page }) => {
    await openEditor(page, 'doc.html');
    await openDocTab(page);

    await page.uncheck('#spTypoHeading');
    await page.check('#spTypoMeasure');
    await page.click('#spApplyTypo');

    const typo = await inDoc(page, () => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const view = doc.defaultView;
      return {
        bodySize: view.getComputedStyle(doc.body).fontSize,
        lineHeight: view.getComputedStyle(doc.body).lineHeight,
        h1Spacing: view.getComputedStyle(doc.querySelector('h1')).letterSpacing,
        mainWidth: view.getComputedStyle(doc.querySelector('main')).maxWidth,
      };
    });
    expect(typo.bodySize).toBe('16px');
    expect(typo.lineHeight).toBe('27.2px');
    // 제목 항목은 껐으므로 h1 자간이 손대지지 않은 상태여야 한다
    // (h1 크기는 기본값이 body 의 2em = 32px 라, 적용 여부를 크기로는 구분할 수 없다)
    expect(typo.h1Spacing).toBe('normal');
    expect(typo.mainWidth).toBe('820px');
  });

  test('그라데이션 평탄화가 인라인과 <style> 규칙을 모두 단색으로 바꾼다', async ({ page }) => {
    await openEditor(page, 'doc.html');
    await openDocTab(page);

    const before = await inDoc(page, () => {
      const doc = document.getElementById('previewFrame').contentDocument;
      return doc.documentElement.outerHTML.match(/gradient/g).length;
    });
    expect(before).toBeGreaterThanOrEqual(2);

    await page.click('#spFlattenGradients');
    const after = await inDoc(page, () => {
      const doc = document.getElementById('previewFrame').contentDocument;
      const view = doc.defaultView;
      return {
        gradients: (doc.documentElement.outerHTML.match(/gradient/g) || []).length,
        hero: view.getComputedStyle(doc.querySelector('.hero')).backgroundColor,
        detail: doc.querySelector('#detail').style.backgroundColor,
      };
    });
    expect(after.gradients).toBe(0);
    expect(after.hero).toBe('rgb(102, 126, 234)');
    expect(after.detail).toBe('rgb(16, 185, 129)');
  });

  test('다운로드 결과에 문서 테마가 남고 편집용 마크업은 빠진다', async ({ page }) => {
    await openEditor(page, 'doc.html');
    await openDocTab(page);
    await page.click('[data-palette="navy"]');
    await page.click('#spApplyTypo');

    const html = await page.evaluate(() => window.htmlEditor.extractCleanHTML());
    expect(html).toContain('id="doc-theme"');
    expect(html).toContain('--doc-accent: #1e3a8a');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('editable-text');
    expect(html).not.toContain('id="editor-styles"');
  });

  test('문서 테마 제거와 되돌리기가 모두 동작한다', async ({ page }) => {
    await openEditor(page, 'doc.html');
    await openDocTab(page);
    await page.click('[data-font-preset="pretendard"]');

    await expect
      .poll(() => page.evaluate(() => window.htmlEditor.history.length))
      .toBeGreaterThanOrEqual(2);

    await page.click('#spResetDocTheme');
    expect(await inDoc(page, () =>
      !!document.getElementById('previewFrame').contentDocument.getElementById('doc-theme'))).toBe(false);

    await page.evaluate(() => window.htmlEditor.undo());
    await expect
      .poll(() => page.evaluate(() =>
        !!document.getElementById('previewFrame').contentDocument.getElementById('doc-theme')))
      .toBe(true);
  });
  test('되돌리기 후 패널 상태가 실제 문서를 따라간다', async ({ page }) => {
    await openEditor(page, 'doc.html');
    await openDocTab(page);
    await page.click('[data-font-preset="noto"]');
    await page.click('[data-palette="forest"]');

    await page.evaluate(() => window.htmlEditor.undo());   // 팔레트 취소
    await expect
      .poll(() => page.evaluate(() => ({
        palette: document.querySelector('[data-palette="forest"]').classList.contains('active'),
        font: document.querySelector('[data-font-preset="noto"]').classList.contains('active'),
        state: window.htmlEditor.docTheme.palette,
      })))
      .toEqual({ palette: false, font: true, state: null });

    await page.evaluate(() => window.htmlEditor.undo());   // 글꼴까지 취소
    await expect
      .poll(() => page.evaluate(() => ({
        font: document.querySelector('[data-font-preset="noto"]').classList.contains('active'),
        state: window.htmlEditor.docTheme.font,
        inDoc: !!document.getElementById('previewFrame').contentDocument.getElementById('doc-theme'),
      })))
      .toEqual({ font: false, state: null, inDoc: false });
  });

  test('자체 배경이 없는 문서도 다크 테마에서 종이 바탕 위에 놓인다', async ({ page }) => {
    await openEditor(page, 'doc.html');
    await page.evaluate(() => window.htmlEditor.applyTheme('dark'));

    const frameBg = await page.evaluate(() =>
      getComputedStyle(document.getElementById('previewFrame')).backgroundColor);
    expect(frameBg).toBe('rgb(255, 255, 255)');
  });
});
