/* 문서 스타일 일괄 적용 — 인스펙터의 "문서" 탭.
   인스펙터의 다른 탭이 선택한 요소에만 인라인 스타일을 넣는 것과 달리,
   여기서는 편집 대상 문서의 <head> 에 <style id="doc-theme"> 하나를 두고 갱신한다.
   extractCleanHTML 은 #editor-styles 와 편집용 마크업만 걷어내므로 이 태그는
   다운로드한 HTML 에 그대로 남는다 — 정적 산출물이 목적이라 이게 맞다. */

const DOC_THEME_ID = 'doc-theme';

const DOC_FONT_PRESETS = {
    pretendard: {
        label: '프리텐다드',
        heading: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
        body: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
        webfont: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css',
    },
    myeongjo: {
        label: '명조 제목 + 고딕 본문',
        heading: "'Nanum Myeongjo', serif",
        body: "'Nanum Gothic', sans-serif",
        webfont: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&family=Nanum+Myeongjo:wght@400;700&display=swap',
    },
    noto: {
        label: 'Noto 조합',
        heading: "'Noto Serif KR', serif",
        body: "'Noto Sans KR', sans-serif",
        webfont: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@400;600&display=swap',
    },
    system: {
        label: '시스템 글꼴',
        heading: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
        body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
        webfont: '',
    },
};

// 제안서용 단색 팔레트 — 강조 / 본문 / 보조 / 테두리 / 옅은 배경
const DOC_PALETTES = {
    'slate-blue': { label: '슬레이트 블루', accent: '#2563eb', text: '#101828', muted: '#475467', border: '#e4e7ec', soft: '#eff4ff' },
    navy: { label: '딥 네이비', accent: '#1e3a8a', text: '#0f172a', muted: '#475569', border: '#e2e8f0', soft: '#eef2ff' },
    forest: { label: '포레스트', accent: '#047857', text: '#0f172a', muted: '#475569', border: '#e3e8e6', soft: '#ecfdf5' },
    burgundy: { label: '버건디', accent: '#9f1239', text: '#1c1917', muted: '#57534e', border: '#e7e5e4', soft: '#fff1f2' },
    graphite: { label: '그래파이트', accent: '#111827', text: '#111827', muted: '#4b5563', border: '#e5e7eb', soft: '#f3f4f6' },
    sand: { label: '웜 샌드', accent: '#b45309', text: '#1c1917', muted: '#57534e', border: '#e7e5e4', soft: '#fffbeb' },
};

Object.assign(HTMLLiveEditor.prototype, {

    bindDocThemePanel() {
        const panel = this.stylePanel;
        if (!panel) return;

        // 이 탭에서 고른 값은 문서 테마 상태로 들고 있다가 한 덩어리로 다시 쓴다
        this.docTheme = { scope: 'all', font: null, palette: null, typo: null, webfont: true };

        panel.querySelectorAll('[data-scope]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.docTheme.scope = btn.dataset.scope;
                panel.querySelectorAll('[data-scope]').forEach(b => b.classList.toggle('active', b === btn));
            });
        });

        panel.querySelectorAll('[data-font-preset]').forEach(btn => {
            btn.addEventListener('click', () => this.applyDocFont(btn.dataset.fontPreset));
        });

        this.renderDocPalettes();

        const webfont = document.getElementById('spDocWebfont');
        if (webfont) {
            webfont.addEventListener('change', () => {
                this.docTheme.webfont = webfont.checked;
                if (this.docTheme.font) this.writeDocTheme('웹폰트 링크 변경');
            });
        }

        const flatten = document.getElementById('spFlattenGradients');
        if (flatten) flatten.addEventListener('click', () => this.flattenGradients());

        const applyTypo = document.getElementById('spApplyTypo');
        if (applyTypo) applyTypo.addEventListener('click', () => this.applyDocTypography());

        const reset = document.getElementById('spResetDocTheme');
        if (reset) reset.addEventListener('click', () => this.resetDocTheme());
    },

    renderDocPalettes() {
        const host = document.getElementById('spDocPalettes');
        if (!host) return;

        host.innerHTML = '';
        Object.entries(DOC_PALETTES).forEach(([key, palette]) => {
            const btn = document.createElement('button');
            btn.className = 'sp-palette';
            btn.dataset.palette = key;
            btn.title = palette.label;

            const swatches = document.createElement('span');
            swatches.className = 'sp-palette-swatches';
            [palette.accent, palette.text, palette.muted, palette.soft].forEach(color => {
                const dot = document.createElement('span');
                dot.style.background = color;
                swatches.appendChild(dot);
            });

            const name = document.createElement('span');
            name.className = 'sp-palette-name';
            name.textContent = palette.label;

            btn.appendChild(swatches);
            btn.appendChild(name);
            btn.addEventListener('click', () => this.applyDocPalette(key));
            host.appendChild(btn);
        });
    },

    // ---------- 적용 ----------

    applyDocFont(presetKey) {
        const preset = DOC_FONT_PRESETS[presetKey];
        if (!preset) return;

        if (this.docTheme.scope === 'selection') {
            // 선택 요소에 인라인으로 넣으면 그 안쪽이 상속받는다
            const targets = this.getBatchTargets();
            if (targets.length === 0) {
                this.showToast('먼저 요소를 선택하거나 적용 범위를 "문서 전체"로 바꾸세요.', 'warning');
                return;
            }
            targets.forEach(el => { el.style.fontFamily = preset.body; });
            this.saveToHistory(`글꼴 적용: ${preset.label} (선택 영역)`);
            this.markDocPresetActive('[data-font-preset]', 'fontPreset', presetKey);
            this.showToast(`선택한 ${targets.length}개 요소와 그 안쪽에 ${preset.label} 을(를) 적용했습니다.`, 'success');
            return;
        }

        this.docTheme.font = presetKey;
        this.writeDocTheme(`글꼴 적용: ${preset.label}`);
        this.markDocPresetActive('[data-font-preset]', 'fontPreset', presetKey);
        this.showToast(`문서 전체에 ${preset.label} 을(를) 적용했습니다.`, 'success');
    },

    applyDocPalette(paletteKey) {
        const palette = DOC_PALETTES[paletteKey];
        if (!palette) return;

        if (this.docTheme.scope === 'selection') {
            const targets = this.getBatchTargets();
            if (targets.length === 0) {
                this.showToast('먼저 요소를 선택하거나 적용 범위를 "문서 전체"로 바꾸세요.', 'warning');
                return;
            }
            targets.forEach(el => { el.style.color = palette.text; });
            this.saveToHistory(`팔레트 적용: ${palette.label} (선택 영역)`);
            this.markDocPresetActive('[data-palette]', 'palette', paletteKey);
            return;
        }

        this.docTheme.palette = paletteKey;
        this.writeDocTheme(`팔레트 적용: ${palette.label}`);
        this.markDocPresetActive('[data-palette]', 'palette', paletteKey);
        this.showToast(`문서 전체에 ${palette.label} 팔레트를 적용했습니다.`, 'success');
    },

    applyDocTypography() {
        const read = (id) => {
            const box = document.getElementById(id);
            return !!(box && box.checked);
        };
        this.docTheme.typo = {
            body: read('spTypoBody'),
            heading: read('spTypoHeading'),
            rhythm: read('spTypoRhythm'),
            measure: read('spTypoMeasure'),
            table: read('spTypoTable'),
        };
        this.writeDocTheme('타이포 정돈');
        this.showToast('제안서 타이포를 적용했습니다.', 'success');
    },

    markDocPresetActive(selector, dataKey, value) {
        if (!this.stylePanel) return;
        this.stylePanel.querySelectorAll(selector).forEach(btn => {
            btn.classList.toggle('active', btn.dataset[dataKey] === value);
        });
    },

    // ---------- 문서에 쓰기 ----------

    // 되돌리기/다시실행으로 문서가 통째로 교체되면 패널이 들고 있던 상태가 문서와 어긋난다.
    // (하이라이트가 남는 것도 문제지만, 그 상태로 다른 값을 건드리면 되돌린 설정이 되살아난다)
    // 그래서 문서에 실제로 남아 있는 doc-theme 을 기준으로 다시 맞춘다.
    syncDocThemeFromDocument() {
        if (!this.docTheme) return;

        const doc = this.getPreviewDoc();
        const node = doc ? this.getDocThemeNode(doc, false) : null;
        const css = node ? node.textContent : '';

        if (!css) {
            this.docTheme.font = null;
            this.docTheme.palette = null;
            this.docTheme.typo = null;
        } else {
            const fontKey = Object.keys(DOC_FONT_PRESETS)
                .find(key => css.includes(DOC_FONT_PRESETS[key].body)) || null;
            const paletteKey = Object.keys(DOC_PALETTES)
                .find(key => css.includes(`--doc-accent: ${DOC_PALETTES[key].accent}`)) || null;
            this.docTheme.font = fontKey;
            this.docTheme.palette = paletteKey;
        }

        this.markDocPresetActive('[data-font-preset]', 'fontPreset', this.docTheme.font);
        this.markDocPresetActive('[data-palette]', 'palette', this.docTheme.palette);
    },

    getDocThemeNode(doc, create = true) {
        let node = doc.getElementById(DOC_THEME_ID);
        if (!node && create) {
            node = doc.createElement('style');
            node.id = DOC_THEME_ID;
            doc.head.appendChild(node);
        }
        return node;
    },

    buildDocThemeCSS() {
        const font = DOC_FONT_PRESETS[this.docTheme.font];
        const palette = DOC_PALETTES[this.docTheme.palette];
        const typo = this.docTheme.typo;
        const parts = [];

        if (font && font.webfont && this.docTheme.webfont) {
            parts.push(`@import url("${font.webfont}");`);
        }

        const vars = [];
        if (palette) {
            vars.push(`  --doc-accent: ${palette.accent};`);
            vars.push(`  --doc-text: ${palette.text};`);
            vars.push(`  --doc-muted: ${palette.muted};`);
            vars.push(`  --doc-border: ${palette.border};`);
            vars.push(`  --doc-soft: ${palette.soft};`);
        }
        if (font) {
            vars.push(`  --doc-font-heading: ${font.heading};`);
            vars.push(`  --doc-font-body: ${font.body};`);
        }
        if (vars.length) parts.push(`:root {\n${vars.join('\n')}\n}`);

        if (font) {
            parts.push('body { font-family: var(--doc-font-body); }');
            parts.push('h1, h2, h3, h4, h5, h6 { font-family: var(--doc-font-heading); }');
        }

        if (palette) {
            parts.push('body { color: var(--doc-text); }');
            parts.push('h1, h2, h3, h4, h5, h6 { color: var(--doc-text); }');
            parts.push('a { color: var(--doc-accent); }');
            parts.push('strong, b { color: var(--doc-text); }');
            parts.push('hr { border: none; border-top: 1px solid var(--doc-border); }');
            parts.push('blockquote { border-left: 3px solid var(--doc-accent); color: var(--doc-muted); padding-left: 14px; margin-left: 0; }');
            parts.push('th { background: var(--doc-soft); color: var(--doc-text); }');
            parts.push('table, th, td { border-color: var(--doc-border); }');
        }

        if (typo) {
            if (typo.body) parts.push('body { font-size: 16px; line-height: 1.7; }');
            if (typo.heading) {
                parts.push('h1 { font-size: 32px; line-height: 1.25; letter-spacing: -0.02em; }');
                parts.push('h2 { font-size: 24px; line-height: 1.3; letter-spacing: -0.015em; }');
                parts.push('h3 { font-size: 19px; line-height: 1.4; }');
            }
            if (typo.rhythm) {
                parts.push('p { margin: 0 0 14px; }');
                parts.push('h1, h2, h3 { margin: 32px 0 12px; }');
                parts.push('ul, ol { margin: 0 0 14px; padding-left: 22px; }');
                parts.push('li { margin-bottom: 6px; }');
            }
            if (typo.measure) {
                parts.push('body > * { max-width: 820px; margin-left: auto; margin-right: auto; }');
            }
            if (typo.table) {
                parts.push('table { border-collapse: collapse; width: 100%; }');
                parts.push('th, td { padding: 10px 12px; border-bottom: 1px solid var(--doc-border, #e4e7ec); text-align: left; }');
                parts.push('th { font-weight: 600; }');
            }
        }

        return parts.join('\n');
    },

    // 문서 테마 변경은 버튼 클릭 단위의 개별 동작이라 디바운스 없이 바로 기록한다
    // (디바운스로 두면 연속 클릭이 한 항목으로 합쳐져 되돌리기가 한 단계를 건너뛴다)
    writeDocTheme(label) {
        const doc = this.getPreviewDoc();
        if (!doc || !doc.head) return;

        const css = this.buildDocThemeCSS();
        if (!css) {
            this.resetDocTheme(label);
            return;
        }

        this.getDocThemeNode(doc).textContent = `\n${css}\n`;
        this.saveToHistory(label || '문서 테마 변경');
    },

    resetDocTheme(label) {
        const doc = this.getPreviewDoc();
        if (!doc) return;

        const node = this.getDocThemeNode(doc, false);
        if (node) node.remove();

        this.docTheme = { scope: this.docTheme ? this.docTheme.scope : 'all', font: null, palette: null, typo: null, webfont: true };
        this.markDocPresetActive('[data-font-preset]', 'fontPreset', null);
        this.markDocPresetActive('[data-palette]', 'palette', null);
        this.saveToHistory(label || '문서 테마 제거');
        if (!label) this.showToast('문서 테마를 제거했습니다.', 'info');
    },

    // 그라데이션 배경을 첫 색상(없으면 팔레트 강조색)의 단색으로 바꾼다
    flattenGradients() {
        const doc = this.getPreviewDoc();
        if (!doc || !doc.body) return;

        const firstColor = (value) => {
            const match = value.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|\b(?:hsl|hsla)\([^)]+\)/);
            return match ? match[0] : null;
        };

        let changed = 0;

        doc.querySelectorAll('[style]').forEach(el => {
            ['background', 'backgroundImage'].forEach(prop => {
                const value = el.style[prop];
                if (!value || !value.includes('gradient')) return;
                const color = firstColor(value) || (DOC_PALETTES[this.docTheme.palette] || {}).accent || '#2563eb';
                el.style[prop] = '';
                el.style.backgroundColor = color;
                changed++;
            });
        });

        doc.querySelectorAll('style').forEach(node => {
            if (node.id === 'editor-styles') return;
            if (!node.textContent.includes('gradient')) return;
            node.textContent = node.textContent.replace(
                /(?:linear|radial|conic|repeating-linear|repeating-radial)-gradient\([^;}]*\)/g,
                (match) => {
                    changed++;
                    return firstColor(match) || (DOC_PALETTES[this.docTheme.palette] || {}).accent || '#2563eb';
                }
            );
        });

        if (changed === 0) {
            this.showToast('문서에서 그라데이션을 찾지 못했습니다.', 'info');
            return;
        }

        this.saveToHistory('그라데이션 평탄화');
        this.showToast(`그라데이션 ${changed}곳을 단색으로 바꿨습니다.`, 'success');
    },
});
