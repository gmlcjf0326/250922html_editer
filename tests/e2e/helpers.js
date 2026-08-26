const path = require('path');

const APP_URL = 'file://' + path.resolve(__dirname, '../../index.html');

function fixture(name) {
  return path.resolve(__dirname, '../fixtures', name);
}

/** 에디터를 열고 픽스처 문서를 업로드한 뒤, 편집 준비가 끝날 때까지 기다린다. */
async function openEditor(page, fixtureName) {
  await page.goto(APP_URL);
  if (!fixtureName) return;

  await page.setInputFiles('#fileInput', fixture(fixtureName));
  await page.waitForFunction(() => {
    const frame = document.getElementById('previewFrame');
    return !!window.htmlEditor && frame.style.display === 'block'
        && !!frame.contentDocument && !!frame.contentDocument.body.firstElementChild;
  });
}

/** 미리보기 iframe 안에서 선택자에 해당하는 요소의 인라인 스타일 값을 읽는다. */
function inlineStyle(page, selector, property) {
  return page.evaluate(([sel, prop]) => {
    const el = document.getElementById('previewFrame').contentDocument.querySelector(sel);
    return el ? el.style[prop] : null;
  }, [selector, property]);
}

/** 요소를 선택하고 스타일 인스펙터를 연다. */
function selectAndOpenInspector(page, selector) {
  return page.evaluate((sel) => {
    const doc = document.getElementById('previewFrame').contentDocument;
    window.htmlEditor.selectElement(doc.querySelector(sel));
    window.htmlEditor.showStylePanel();
  }, selector);
}

/** 콘솔 에러와 페이지 예외를 모아 주는 수집기. */
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  return errors;
}

module.exports = { APP_URL, fixture, openEditor, inlineStyle, selectAndOpenInspector, collectErrors };
