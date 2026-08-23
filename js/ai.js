// AI 스타일 변환 — 프로바이더 설정, 요청/응답 처리, 생성된 스타일 적용

// ============== AI 프로바이더 설정 ==============
// 기본 모델은 AI 모달의 "모델명" 입력으로 프로바이더별 변경 가능 (localStorage: ai_model_<provider>)
const AI_PROVIDERS = {
    gemini: { label: 'Gemini', defaultModel: 'gemini-2.5-flash' },
    claude: { label: 'Claude', defaultModel: 'claude-opus-5' },
    gpt: { label: 'GPT', defaultModel: 'gpt-4o-mini' }
};

Object.assign(HTMLLiveEditor.prototype, {
    bindAIModalEvents() {
        this.aiModelInput = document.getElementById('aiModelInput');

        // 프로바이더 선택
        document.querySelectorAll('input[name="aiModel"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.aiSettings.model = e.target.value;
                this.loadApiKeyForModel(e.target.value);
                this.loadModelNameForProvider(e.target.value);
            });
        });

        // API 키 저장
        this.apiKeyInput.addEventListener('change', (e) => {
            this.saveApiKey(this.aiSettings.model, e.target.value);
        });

        // 모델명 저장 (프로바이더별)
        if (this.aiModelInput) {
            this.aiModelInput.addEventListener('change', (e) => {
                localStorage.setItem(`ai_model_${this.aiSettings.model}`, e.target.value.trim());
            });
        }

        // 연결 테스트
        const testBtn = document.getElementById('aiTestBtn');
        if (testBtn) testBtn.addEventListener('click', () => this.testAIConnection());

        // 빠른 프롬프트
        document.querySelectorAll('.quick-prompt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.aiPrompt.value = btn.dataset.prompt;
            });
        });
    },

    getAIModelName(provider) {
        const custom = (localStorage.getItem(`ai_model_${provider}`) || '').trim();
        return custom || AI_PROVIDERS[provider].defaultModel;
    },

    loadModelNameForProvider(provider) {
        if (!this.aiModelInput) return;
        this.aiModelInput.value = (localStorage.getItem(`ai_model_${provider}`) || '').trim();
        this.aiModelInput.placeholder = AI_PROVIDERS[provider].defaultModel;
        const defaultLabel = document.getElementById('aiModelDefault');
        if (defaultLabel) defaultLabel.textContent = `(기본: ${AI_PROVIDERS[provider].defaultModel})`;
    },

    showAIModal() {
        this.aiModal.style.display = 'flex';
        this.loadApiKeyForModel(this.aiSettings.model);
        this.loadModelNameForProvider(this.aiSettings.model);
    },

    hideAIModal() {
        this.aiModal.style.display = 'none';
    },

    toggleApiKeyVisibility() {
        const input = this.apiKeyInput;
        if (input.type === 'password') {
            input.type = 'text';
            this.toggleApiKey.innerHTML = gsIcon('eye-off', 16);
        } else {
            input.type = 'password';
            this.toggleApiKey.innerHTML = gsIcon('eye', 16);
        }
    },

    saveApiKey(model, key) {
        localStorage.setItem(`ai_api_key_${model}`, key);
        this.aiSettings.apiKey = key;
    },

    loadApiKeyForModel(model) {
        const key = localStorage.getItem(`ai_api_key_${model}`) || '';
        this.apiKeyInput.value = key;
        this.aiSettings.apiKey = key;
    },

    loadSavedApiKeys() {
        this.loadApiKeyForModel(this.aiSettings.model);
    },

    // ---------- 연결 테스트 ----------
    // "키를 넣으면 진짜 되나?"를 사용자가 1초에 확인할 수 있게 한다.
    // 최소 토큰으로 실제 엔드포인트를 때려 인증·모델명·네트워크(CORS 포함)를 한 번에 검증한다.
    async testAIConnection() {
        const provider = this.aiSettings.model;
        const apiKey = this.apiKeyInput.value.trim();
        const statusEl = document.getElementById('aiTestStatus');
        const btn = document.getElementById('aiTestBtn');

        const setStatus = (text, state) => {
            if (!statusEl) return;
            statusEl.textContent = text;
            statusEl.className = 'ai-test-status ' + (state || '');
        };

        if (!apiKey) {
            setStatus('API 키를 먼저 입력하세요.', 'warn');
            return;
        }

        this.saveApiKey(provider, apiKey);

        const modelName = this.getAIModelName(provider);
        if (btn) btn.disabled = true;
        setStatus(`${AI_PROVIDERS[provider].label} · ${modelName} 확인 중…`, '');

        try {
            const status = await this.pingAIProvider(provider, apiKey, modelName);
            if (status.ok) {
                setStatus(`연결 성공 — ${AI_PROVIDERS[provider].label} · ${modelName} 사용 가능합니다.`, 'ok');
            } else {
                setStatus(status.message, 'error');
            }
        } catch (error) {
            // fetch 자체가 던지면 인증이 아니라 네트워크/CORS 문제다 — 구분해서 안내한다
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            setStatus(offline
                ? '네트워크에 연결되어 있지 않습니다.'
                : `요청이 브라우저에서 차단됐습니다 (${error.message}). file:// 로 열었다면 http(s) 주소로 열어 다시 시도해보세요.`, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    // 프로바이더별 최소 요청. 성공/실패와 사람이 읽을 이유를 함께 돌려준다.
    async pingAIProvider(provider, apiKey, modelName) {
        const describe = (res, data) => {
            const detail = (data && (data.error?.message || data.message)) || '';
            if (res.status === 401 || res.status === 403) {
                return { ok: false, message: `API 키가 거부됐습니다 (HTTP ${res.status}). 키를 다시 확인하세요.${detail ? ' — ' + detail : ''}` };
            }
            if (res.status === 404) {
                return { ok: false, message: `모델 "${modelName}" 을 찾을 수 없습니다 (HTTP 404). 모델명을 확인하거나 비워서 기본값을 쓰세요.` };
            }
            if (res.status === 429) {
                return { ok: false, message: '요청 한도(429)에 걸렸습니다. 잠시 뒤 다시 시도하세요.' };
            }
            return { ok: false, message: `오류 HTTP ${res.status}${detail ? ' — ' + detail : ''}` };
        };

        let res;
        if (provider === 'gemini') {
            res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'ping' }] }],
                    generationConfig: { maxOutputTokens: 1 }
                })
            });
        } else if (provider === 'claude') {
            res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({ model: modelName, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
            });
        } else {
            res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({ model: modelName, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
            });
        }

        if (res.ok) return { ok: true };

        let data = null;
        try { data = await res.json(); } catch (e) { /* 본문이 JSON 이 아닐 수 있다 */ }
        return describe(res, data);
    },

    async applyAIStyle() {
        const prompt = this.aiPrompt.value.trim();
        const apiKey = this.apiKeyInput.value.trim();
        const model = this.aiSettings.model;
        const scope = document.querySelector('input[name="aiScope"]:checked').value;

        if (!prompt) {
            this.showToast('스타일 설명을 입력해주세요.', 'warning');
            return;
        }

        if (!apiKey) {
            this.showToast('API 키를 입력해주세요.', 'warning');
            return;
        }

        if (scope === 'selected' && !this.selectedElement) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        // 로딩 상태
        const btnText = this.aiApplyBtn.querySelector('.btn-text');
        const btnLoading = this.aiApplyBtn.querySelector('.btn-loading');
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
        this.aiApplyBtn.disabled = true;

        // 입력 후 blur 없이 바로 적용을 눌러도 키가 저장되도록 여기서 한 번 더 저장한다
        this.saveApiKey(model, apiKey);

        try {
            const iframe = this.previewFrame;
            const doc = iframe.contentDocument || iframe.contentWindow.document;

            const targetHTML = this.getAIContextHTML(scope, doc);

            const cssResponse = await this.callAIAPI(model, apiKey, prompt, targetHTML);

            // 예전에는 여기서 조용히 아무 일도 일어나지 않았다 — 실패를 반드시 말한다
            if (!cssResponse || !cssResponse.styles || cssResponse.styles.length === 0) {
                throw new Error('AI 응답에서 적용할 스타일을 찾지 못했습니다. 요청을 더 구체적으로 적어보세요.');
            }

            const applied = this.applyAIGeneratedStyles(doc, cssResponse, scope);
            if (applied === 0) {
                throw new Error('AI 가 제안한 선택자가 이 문서에 없어 적용된 스타일이 없습니다. 적용 범위를 바꿔보세요.');
            }

            this.saveToHistory('AI 스타일 적용', true);
            this.showToast(`AI 스타일을 ${applied}개 요소에 적용했습니다.`, 'success');
            this.hideAIModal();

        } catch (error) {
            console.error('AI API 오류:', error);
            this.showToast(`오류: ${error.message}`, 'error');
        } finally {
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
            this.aiApplyBtn.disabled = false;
        }
    },

    getAIContextHTML(scope, doc) {
        let root;
        if (scope === 'selected' && this.selectedElement) {
            root = this.selectedElement.cloneNode(true);
        } else {
            root = doc.body.cloneNode(true);
        }

        root.querySelectorAll('.editable-text').forEach(span => {
            span.replaceWith(span.ownerDocument.createTextNode(span.textContent));
        });

        const editorClasses = this.getEditorClasses();
        // querySelectorAll은 루트 자신을 포함하지 않으므로 루트도 함께 정리
        [root, ...root.querySelectorAll('[class]')].forEach(el => {
            if (!el.classList) return;
            el.classList.remove(...editorClasses);
            if (!el.getAttribute('class')) el.removeAttribute('class');
        });

        root.querySelectorAll('script, #editor-styles').forEach(el => el.remove());
        root.querySelectorAll('[data-editor-initialized], [data-original]').forEach(el => {
            el.removeAttribute('data-editor-initialized');
            el.removeAttribute('data-original');
        });

        let html = root.outerHTML;
        const maxLength = 6000;
        if (html.length > maxLength) {
            html = html.slice(0, maxLength) + '\n<!-- ...HTML이 길어 이후 내용은 생략됨... -->';
        }
        return html;
    },

    buildAIPrompt(prompt, html) {
        return `당신은 웹 디자인 전문가입니다. 사용자가 요청하는 스타일로 HTML 요소의 CSS를 생성해주세요.

규칙:
1. 반드시 유효한 CSS만 응답하세요.
2. 각 스타일 규칙은 인라인 스타일 형식으로 작성하세요.
3. 응답은 JSON 형식으로, 각 CSS 선택자와 스타일을 포함하세요.
4. 배경과 색은 단색으로만 지정하세요. gradient(linear-gradient·radial-gradient 등)는 쓰지 마세요.
5. 설명 없이 JSON 만 응답하세요.
6. 예시 형식:
{
    "styles": [
        {"selector": "body", "css": "background-color: #f5f6f8; color: #101828;"},
        {"selector": "h1", "css": "color: #101828; font-size: 2rem; letter-spacing: -0.02em;"},
        {"selector": "button", "css": "background-color: #2563eb; color: #ffffff; border-radius: 6px;"}
    ]
}

현재 HTML:
${html}

사용자 요청: ${prompt}`;
    },

    async callAIAPI(provider, apiKey, prompt, html) {
        const systemPrompt = this.buildAIPrompt(prompt, html);
        const modelName = this.getAIModelName(provider);
        let response;
        let data;

        if (provider === 'gemini') {
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: systemPrompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 4096
                    }
                })
            });

            data = await response.json();
            if (data.error) throw new Error(data.error.message);
            if (!response.ok) throw new Error(`Gemini API 오류 (HTTP ${response.status})`);

            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return this.parseAIResponse(text);

        } else if (provider === 'claude') {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: modelName,
                    // Claude Opus 5 는 thinking 이 기본으로 켜져 있어 max_tokens 를 함께 쓴다.
                    // 4096 이면 생각하다 예산이 끝나 본문(JSON)이 나오기 전에 잘릴 수 있다.
                    max_tokens: 16000,
                    messages: [{ role: 'user', content: systemPrompt }]
                })
            });

            data = await response.json();
            if (data.error) throw new Error(data.error.message);
            if (!response.ok) throw new Error(`Claude API 오류 (HTTP ${response.status})`);
            if (data.stop_reason === 'refusal') throw new Error('Claude가 이 요청을 거절했습니다. 프롬프트를 바꿔 다시 시도해주세요.');
            if (data.stop_reason === 'max_tokens') throw new Error('응답이 길이 제한에 걸려 잘렸습니다. 스타일 설명을 짧게 하거나 적용 범위를 "선택 요소"로 좁혀보세요.');

            const text = (data.content || []).filter(block => block.type === 'text').map(block => block.text).join('') || '';
            return this.parseAIResponse(text);

        } else if (provider === 'gpt') {
            response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { role: 'system', content: '당신은 웹 디자인 전문가입니다.' },
                        { role: 'user', content: systemPrompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 4096
                })
            });

            data = await response.json();
            if (data.error) throw new Error(data.error.message);
            if (!response.ok) throw new Error(`OpenAI API 오류 (HTTP ${response.status})`);

            if (data.choices?.[0]?.finish_reason === 'length') {
                throw new Error('응답이 길이 제한에 걸려 잘렸습니다. 스타일 설명을 짧게 하거나 적용 범위를 "선택 요소"로 좁혀보세요.');
            }

            const text = data.choices?.[0]?.message?.content || '';
            return this.parseAIResponse(text);
        }

        return null;
    },

    parseAIResponse(text) {
        try {
            // JSON 블록 추출
            const jsonMatch = text.match(/\{[\s\S]*"styles"[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            // JSON이 아닌 경우 기본 파싱 시도
            const styles = [];
            const cssBlocks = text.match(/([a-z0-9-]+)\s*\{([^}]+)\}/gi);
            if (cssBlocks) {
                cssBlocks.forEach(block => {
                    const match = block.match(/([a-z0-9-]+)\s*\{([^}]+)\}/i);
                    if (match) {
                        styles.push({
                            selector: match[1].trim(),
                            css: match[2].trim().replace(/\n/g, ' ')
                        });
                    }
                });
            }

            return styles.length > 0 ? { styles } : null;
        } catch (e) {
            console.error('AI 응답 파싱 오류:', e);
            return null;
        }
    },

    // 실제로 스타일이 적용된 요소 수를 돌려준다 (0 이면 호출부가 사용자에게 알린다)
    applyAIGeneratedStyles(doc, response, scope) {
        if (!response || !response.styles) return 0;

        let appliedCount = 0;

        response.styles.forEach(({ selector, css }) => {
            try {
                let elements;

                if (scope === 'selected' && this.selectedElement) {
                    // 선택된 요소 내에서만 찾기
                    if (selector === 'body' || selector === '*') {
                        elements = [this.selectedElement];
                    } else {
                        elements = this.selectedElement.querySelectorAll(selector);
                        if (elements.length === 0 && this.selectedElement.matches(selector)) {
                            elements = [this.selectedElement];
                        }
                    }
                } else {
                    // 전체 문서에서 찾기
                    if (selector === 'body') {
                        elements = [doc.body];
                    } else {
                        elements = doc.querySelectorAll(selector);
                    }
                }

                if (elements && elements.length > 0) {
                    appliedCount += elements.length;
                    elements.forEach(el => {
                        // CSS 문자열을 개별 속성으로 분리하여 적용
                        const properties = css.split(';').filter(p => p.trim());
                        properties.forEach(prop => {
                            const [name, value] = prop.split(':').map(s => s.trim());
                            if (name && value) {
                                // CSS 속성명을 camelCase로 변환
                                const camelName = name.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                                el.style[camelName] = value;
                            }
                        });
                    });
                }
            } catch (e) {
                console.warn(`스타일 적용 실패 (${selector}):`, e);
            }
        });

        return appliedCount;
    }
});
