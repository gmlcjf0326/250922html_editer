const { test, expect } = require('@playwright/test');
const { APP_URL, fixture, openEditor, collectErrors } = require('./helpers');

test.describe('보안 (업로드 문서 스크립트 격리)', () => {
  test('동의하지 않으면 문서 스크립트가 실행되지 않고 편집 기능은 그대로 동작한다', async ({ page }) => {
    const errors = collectErrors(page);
    let dialogMessage = null;
    page.on('dialog', (d) => { dialogMessage = d.message(); d.dismiss(); });

    await page.goto(APP_URL);
    await page.setInputFiles('#fileInput', fixture('scripted.html'));
    await page.waitForFunction(() => !!window.htmlEditor
      && document.getElementById('previewFrame').contentDocument.querySelector('h1 .editable-text'));

    expect(dialogMessage).toContain('스크립트');

    const state = await page.evaluate(() => {
      const frame = document.getElementById('previewFrame');
      const doc = frame.contentDocument;
      return {
        sandbox: frame.getAttribute('sandbox'),
        pwned: doc.defaultView.__PWNED === true,
        title: doc.title,
      };
    });
    expect(state.sandbox).toBe('allow-same-origin');
    expect(state.pwned).toBe(false);
    expect(state.title).not.toBe('pwned');

    // 스크립트를 막아도 선택·텍스트 편집·히스토리가 정상 동작해야 한다
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await frame.click('h1');
    expect(await page.evaluate(() => window.htmlEditor.selectedElement.tagName)).toBe('H1');

    const historyBefore = await page.evaluate(() => window.htmlEditor.history.length);
    await frame.click('h1 .editable-text');
    await page.keyboard.type('XYZ');
    await expect
      .poll(() => page.evaluate(() => document.getElementById('previewFrame').contentDocument.querySelector('h1').textContent))
      .toContain('XYZ');
    // 텍스트 입력은 200ms 디바운스 후 히스토리에 쌓인다
    await expect
      .poll(() => page.evaluate(() => window.htmlEditor.history.length))
      .toBeGreaterThan(historyBefore);

    // 되돌리기 후에도 sandbox 와 standards mode 가 유지된다
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('p.note'));
      window.htmlEditor.applyStyle('color', 'rgb(255, 0, 0)');
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.htmlEditor.undo());
    await expect
      .poll(() => page.evaluate(() => document.getElementById('previewFrame').contentDocument.querySelector('p.note').style.color))
      .toBe('');

    const after = await page.evaluate(() => ({
      compat: document.getElementById('previewFrame').contentDocument.compatMode,
      sandbox: document.getElementById('previewFrame').getAttribute('sandbox'),
    }));
    expect(after).toEqual({ compat: 'CSS1Compat', sandbox: 'allow-same-origin' });

    // 실행은 막되 원본 스크립트는 다운로드 결과에 남아 있어야 한다
    const clean = await page.evaluate(() => window.htmlEditor.extractCleanHTML());
    expect(clean).toContain('__PWNED');

    // 브라우저가 남기는 "Blocked script execution ..." 은 차단이 동작했다는 증거이므로 정상.
    // 그 외의 콘솔 에러는 없어야 한다.
    const unexpected = errors.filter((e) => !e.includes('Blocked script execution'));
    expect(unexpected).toEqual([]);
    expect(errors.some((e) => e.includes('Blocked script execution'))).toBe(true);
  });

  test('사용자가 동의하면 해당 문서에 한해 스크립트가 실행된다', async ({ page }) => {
    page.on('dialog', (d) => d.accept());

    await page.goto(APP_URL);
    await page.setInputFiles('#fileInput', fixture('scripted.html'));
    await page.waitForFunction(() => !!window.htmlEditor
      && document.getElementById('previewFrame').getAttribute('sandbox').includes('allow-scripts'));

    const state = await page.evaluate(() => ({
      sandbox: document.getElementById('previewFrame').getAttribute('sandbox'),
      pwned: document.getElementById('previewFrame').contentDocument.defaultView.__PWNED === true,
    }));
    expect(state).toEqual({ sandbox: 'allow-same-origin allow-scripts', pwned: true });
  });
});

test.describe('AI 스타일 변환', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
  });

  test('API 키 안내 문구가 실제 동작을 정확히 설명한다', async ({ page }) => {
    await openEditor(page, 'demo.html');
    const hint = await page.textContent('.api-key-hint');
    expect(hint).toContain('localStorage');
    expect(hint).toContain('전송');
  });

  test('프로바이더별 기본 모델과 사용자 지정 모델이 적용된다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    const models = await page.evaluate(() => {
      const editor = window.htmlEditor;
      localStorage.removeItem('ai_model_claude');
      const byDefault = editor.getAIModelName('claude');
      localStorage.setItem('ai_model_claude', 'claude-custom-test');
      const custom = editor.getAIModelName('claude');
      localStorage.removeItem('ai_model_claude');
      return { byDefault, custom, gemini: editor.getAIModelName('gemini'), gpt: editor.getAIModelName('gpt') };
    });

    expect(models).toEqual({
      byDefault: 'claude-opus-5',
      custom: 'claude-custom-test',
      gemini: 'gemini-2.5-flash',
      gpt: 'gpt-4o-mini',
    });
  });

  test('AI 에 보내는 HTML 은 편집용 마크업이 제거된 상태다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    const context = await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('.hero'));
      return window.htmlEditor.getAIContextHTML('selected', doc);
    });

    expect(context).not.toContain('editable-text');
    expect(context).not.toContain('element-selected');
    expect(context).toContain('<h1>');
  });

  test('요청 형태가 올바르고 응답 스타일이 페이지에 반영된다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    const run = await page.evaluate(async () => {
      const captured = {};
      window.fetch = async (url, options) => {
        captured.url = url;
        captured.body = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: '{"styles":[{"selector":"h1","css":"color: rgb(1, 2, 3);"}]}' }],
          }),
        };
      };

      const editor = window.htmlEditor;
      const doc = document.getElementById('previewFrame').contentDocument;
      editor.selectElement(doc.querySelector('.hero'));
      document.querySelector('input[name="aiModel"][value="claude"]').checked = true;
      editor.aiSettings.model = 'claude';
      editor.apiKeyInput.value = 'test-key';
      editor.aiPrompt.value = '테스트 스타일';
      document.querySelector('input[name="aiScope"][value="selected"]').checked = true;

      await editor.applyAIStyle();

      return {
        url: captured.url,
        model: captured.body.model,
        maxTokens: captured.body.max_tokens,
        promptCleaned: captured.body.messages[0].content.includes('<h1>')
          && !captured.body.messages[0].content.includes('editable-text'),
        applied: doc.querySelector('.hero h1').style.color,
      };
    });

    expect(run.url).toContain('api.anthropic.com/v1/messages');
    expect(run.model).toBe('claude-opus-5');
    expect(run.maxTokens).toBe(16000); // Opus 5 는 thinking 이 기본 on 이라 여유가 필요하다
    expect(run.promptCleaned).toBe(true);
    expect(run.applied).toBe('rgb(1, 2, 3)');
  });

  test('Claude 가 요청을 거절하면(refusal) 오류로 처리한다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    const message = await page.evaluate(async () => {
      window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'refusal', content: [] }) });
      try {
        await window.htmlEditor.callAIAPI('claude', 'key', 'prompt', '<div></div>');
        return 'no-error';
      } catch (e) {
        return e.message;
      }
    });

    expect(message).toContain('거절');
  });

  // ---------- 연결 테스트 · 실패 알림 · 그라데이션 배제 ----------

  test('연결 테스트가 성공을 알린다', async ({ page }) => {
    await openEditor(page, 'demo.html');
    await page.route('https://generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"candidates":[]}' }));

    await page.click('#aiStyleBtn');
    await page.fill('#apiKeyInput', 'test-key');
    await page.click('#aiTestBtn');

    await expect.poll(() => page.textContent('#aiTestStatus')).toContain('연결 성공');
    expect(await page.getAttribute('#aiTestStatus', 'class')).toContain('ok');
    // 테스트를 누르면 키도 저장된다
    expect(await page.evaluate(() => localStorage.getItem('ai_api_key_gemini'))).toBe('test-key');
  });

  test('연결 테스트가 인증 실패와 모델 오류를 구분해 알려준다', async ({ page }) => {
    await openEditor(page, 'demo.html');

    await page.route('https://generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"API key not valid"}}' }));
    await page.click('#aiStyleBtn');
    await page.fill('#apiKeyInput', 'bad-key');
    await page.click('#aiTestBtn');
    await expect.poll(() => page.textContent('#aiTestStatus')).toContain('API 키가 거부');

    await page.unroute('https://generativelanguage.googleapis.com/**');
    await page.route('https://generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"message":"model not found"}}' }));
    await page.fill('#aiModelInput', 'no-such-model');
    await page.click('#aiTestBtn');
    await expect.poll(() => page.textContent('#aiTestStatus')).toContain('no-such-model');
    await expect.poll(() => page.textContent('#aiTestStatus')).toContain('찾을 수 없습니다');
  });

  test('네트워크가 막히면 file:// 안내를 포함한 이유를 보여준다', async ({ page }) => {
    await openEditor(page, 'demo.html');
    await page.route('https://generativelanguage.googleapis.com/**', (route) => route.abort('failed'));

    await page.click('#aiStyleBtn');
    await page.fill('#apiKeyInput', 'test-key');
    await page.click('#aiTestBtn');

    await expect.poll(() => page.textContent('#aiTestStatus')).toContain('차단');
    expect(await page.textContent('#aiTestStatus')).toContain('file://');
  });

  test('적용할 스타일을 찾지 못하면 조용히 끝내지 않고 알린다', async ({ page }) => {
    await openEditor(page, 'demo.html');
    // 스타일이 없는 응답
    await page.route('https://generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '죄송하지만 도와드릴 수 없습니다.' }] } }] }),
      }));

    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('h1')); // 기본 적용 범위가 "선택 요소"다
    });
    await page.click('#aiStyleBtn');
    await page.fill('#apiKeyInput', 'test-key');
    await page.fill('#aiPrompt', '모던하게');
    await page.click('#aiApplyBtn');

    await expect.poll(() => page.textContent('#toastContainer')).toContain('적용할 스타일을 찾지 못했습니다');
    // 모달은 열린 채로 남아 사용자가 다시 시도할 수 있어야 한다
    expect(await page.evaluate(() => document.getElementById('aiModal').style.display)).toBe('flex');
  });

  test('AI 프롬프트가 그라데이션을 쓰지 말라고 지시한다', async ({ page }) => {
    await openEditor(page, 'demo.html');
    const prompt = await page.evaluate(() => window.htmlEditor.buildAIPrompt('테스트', '<p>x</p>'));
    expect(prompt).toContain('gradient');
    expect(prompt).toContain('쓰지 마세요');
    expect(prompt).not.toContain('linear-gradient(135deg');

    // 빠른 프롬프트에도 그라데이션 요구가 남아 있지 않아야 한다
    const quick = await page.evaluate(() => Array.from(document.querySelectorAll('.quick-prompt-btn'))
      .map((b) => b.dataset.prompt).join(' '));
    expect(quick).not.toContain('그라데이션을 사용');
  });

});
