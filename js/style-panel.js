// 스타일 인스펙터 — data-css 선언적 바인딩, 계산값 역채움, 일괄 적용

Object.assign(HTMLLiveEditor.prototype, {
    bindStylePanelEvents() {
        const panel = this.stylePanel;
        if (!panel) return;

        this.copiedStyle = '';

        // 탭 전환
        panel.querySelectorAll('.sp-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchStyleTab(tab.dataset.pane));
        });

        // data-css 를 가진 모든 입력을 일괄 바인딩 (선언적 처리)
        panel.querySelectorAll('input[data-css], select[data-css], textarea[data-css]').forEach(control => {
            const liveEvent = (control.type === 'range' || control.type === 'color') ? 'input' : 'change';
            control.addEventListener(liveEvent, () => this.applyControlValue(control));
            if (control.type === 'range') {
                control.addEventListener('change', () => this.applyControlValue(control));
            }
        });

        // 토글 버튼 (정렬, B/I/U/S 등)
        panel.querySelectorAll('button[data-css][data-value]').forEach(btn => {
            btn.addEventListener('click', () => this.toggleStyleValue(btn));
        });

        // 개별 속성 제거 버튼
        panel.querySelectorAll('[data-clear]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyStyle(btn.dataset.clear, '');
                this.loadCurrentStyles();
            });
        });

        // ---------- 구조 탭 ----------
        const wire = (id, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', handler);
        };

        wire('spSelParent', () => this.navigateToParent());
        wire('spSelChild', () => this.navigateToFirstChild());
        wire('spSelPrev', () => this.navigateToPrevSibling());
        wire('spSelNext', () => this.navigateToNextSibling());

        wire('spMoveOut', () => this.moveOutOfParent());
        wire('spNestPrev', () => this.nestIntoPreviousSibling());
        wire('spWrapDiv', () => this.wrapWithDiv());
        wire('spUnwrap', () => this.unwrapElement());

        wire('spMoveUp', () => this.selectedElement && this.moveElement(this.selectedElement, 'up'));
        wire('spMoveDown', () => this.selectedElement && this.moveElement(this.selectedElement, 'down'));
        wire('spDuplicate', () => this.duplicateElement());
        wire('spDelete', () => this.deleteElement());

        wire('spTagApply', () => {
            const select = document.getElementById('spTagSelect');
            if (select && select.value) this.changeElementTag(select.value);
        });
        wire('spIdentityApply', () => this.applyElementIdentity());
        document.getElementById('spIdInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.applyElementIdentity();
        });
        document.getElementById('spClassInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.applyElementIdentity();
        });

        wire('spCopyStyle', () => this.copyElementStyle());
        wire('spPasteStyle', () => this.pasteElementStyle());
        wire('spResetStyle', () => this.clearInlineStyles());
        wire('spStyleTextApply', () => {
            const box = document.getElementById('spStyleText');
            if (box) this.applyCssText(box.value);
        });

        // ---------- 텍스트 탭 ----------
        wire('spFontCustomApply', () => {
            const input = document.getElementById('spFontCustom');
            if (input && input.value.trim()) {
                this.applyStyle('fontFamily', input.value.trim());
                this.loadCurrentStyles();
            }
        });

        // ---------- 박스 탭 ----------
        const applyBorder = () => {
            const width = document.getElementById('borderWidth').value || 0;
            const style = document.getElementById('borderStyle').value;
            const color = document.getElementById('borderColor').value;
            this.applyStyle('border', style === 'none' ? 'none' : `${width}px ${style} ${color}`);
        };
        wire('applyBorder', applyBorder);
        wire('clearBorder', () => {
            this.applyStyle('border', '');
            this.applyStyle('borderWidth', '');
            this.applyStyle('borderStyle', '');
        });

        panel.querySelectorAll('[data-border-side]').forEach(btn => {
            btn.addEventListener('click', () => {
                const width = document.getElementById('borderWidth').value || 0;
                const style = document.getElementById('borderStyle').value;
                const color = document.getElementById('borderColor').value;
                this.applyStyle('border', 'none');
                this.applyStyle(btn.dataset.borderSide, style === 'none' ? 'none' : `${width}px ${style} ${color}`);
            });
        });

        // ---------- 배경 탭 ----------
        wire('bgColorClear', () => {
            this.applyStyle('backgroundColor', '');
            this.applyStyle('background', '');
        });

        wire('applyGradient', () => {
            const start = document.getElementById('gradientStart').value;
            const end = document.getElementById('gradientEnd').value;
            const direction = document.getElementById('gradientDirection').value;
            this.applyStyle('background', `linear-gradient(${direction}, ${start}, ${end})`);
        });
        wire('clearGradient', () => this.applyStyle('background', ''));

        wire('spBgImageApply', () => {
            const url = document.getElementById('spBgImage').value.trim();
            this.applyStyle('backgroundImage', url ? `url("${url}")` : '');
        });

        const shadowAlpha = document.getElementById('spShadowAlpha');
        if (shadowAlpha) {
            shadowAlpha.addEventListener('input', () => {
                document.getElementById('spShadowAlphaValue').textContent = `${shadowAlpha.value}%`;
            });
        }
        wire('applyShadow', () => {
            const x = document.getElementById('shadowX').value || 0;
            const y = document.getElementById('shadowY').value || 0;
            const blur = document.getElementById('shadowBlur').value || 0;
            const spread = document.getElementById('spShadowSpread').value || 0;
            const color = document.getElementById('shadowColor').value;
            const alpha = (parseInt(document.getElementById('spShadowAlpha').value, 10) || 0) / 100;
            const inset = document.getElementById('spShadowInset').checked ? 'inset ' : '';
            this.applyStyle('boxShadow', `${inset}${x}px ${y}px ${blur}px ${spread}px ${this.hexToRgba(color, alpha)}`);
        });
        wire('clearShadow', () => this.applyStyle('boxShadow', 'none'));

        // 빠른 색상 팔레트 (적용 대상 전환 가능)
        this.paletteTarget = 'backgroundColor';
        panel.querySelectorAll('[data-palette-target]').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('[data-palette-target]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.paletteTarget = btn.dataset.paletteTarget;
            });
        });

        const palette = document.getElementById('colorPalette');
        if (palette) {
            palette.addEventListener('click', (e) => {
                if (!e.target.classList.contains('palette-color')) return;
                const color = e.target.dataset.color;
                if (this.paletteTarget === 'borderColor') {
                    this.applyStyle('borderColor', color);
                    this.applyStyle('borderStyle', 'solid');
                    const targets = this.getBatchTargets();
                    targets.forEach(el => {
                        if (!parseFloat(el.style.borderWidth)) el.style.borderWidth = '1px';
                    });
                } else {
                    this.applyStyle(this.paletteTarget, color);
                }
                this.loadCurrentStyles();
            });
        }

        // ---------- 배치 탭 ----------
        wire('spFlexRowCenter', () => {
            this.applyStyle('display', 'flex');
            this.applyStyle('flexDirection', 'row');
            this.applyStyle('justifyContent', 'center');
            this.applyStyle('alignItems', 'center');
            this.loadCurrentStyles();
        });
        wire('spCenterBlock', () => {
            this.applyStyle('marginLeft', 'auto');
            this.applyStyle('marginRight', 'auto');
            this.loadCurrentStyles();
        });
    },

    switchStyleTab(name) {
        if (!this.stylePanel || !name) return;
        this.stylePanel.querySelectorAll('.sp-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.pane === name);
        });
        this.stylePanel.querySelectorAll('.sp-pane').forEach(pane => {
            pane.classList.toggle('active', pane.dataset.pane === name);
        });
    },

    applyControlValue(control) {
        const prop = control.dataset.css;
        const raw = typeof control.value === 'string' ? control.value.trim() : control.value;
        let value = raw;

        if (raw === '') {
            value = '';
        } else if (control.dataset.percent) {
            value = String((parseFloat(raw) || 0) / 100);
        } else if (control.dataset.unit && /^-?\d*\.?\d+$/.test(raw)) {
            value = raw + control.dataset.unit;
        }

        this.applyStyle(prop, value);
        this.syncPairedControl(control, raw);

        // 여백/패딩 4방향 동일 옵션
        if (control.dataset.group && this.isSpacingLinked(control.dataset.group)) {
            ['Top', 'Bottom', 'Left', 'Right'].forEach(dir => {
                const sideProp = control.dataset.group + dir;
                if (sideProp === prop) return;
                this.applyStyle(sideProp, value);
                const sibling = this.stylePanel.querySelector(`[data-css="${sideProp}"]`);
                if (sibling) sibling.value = raw;
            });
        }
    },

    isSpacingLinked(group) {
        const box = document.getElementById(group === 'margin' ? 'spMarginLink' : 'spPaddingLink');
        return !!(box && box.checked);
    },

    syncPairedControl(control, raw) {
        const partnerId = control.dataset.sync;
        if (!partnerId) return;
        const partner = document.getElementById(partnerId);
        if (!partner) return;

        if (partner.tagName === 'SPAN') {
            partner.textContent = control.dataset.percent ? `${raw}%` : `${raw}${control.dataset.unit || ''}`;
        } else if (partner.type === 'color') {
            // 빈 문자열/rgb() 를 넣으면 브라우저가 검정으로 되돌리므로 유효한 hex 일 때만 반영
            if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) partner.value = raw;
        } else {
            partner.value = raw;
        }
    },

    toggleStyleValue(btn) {
        const prop = btn.dataset.css;
        const isActive = btn.classList.contains('active');
        this.applyStyle(prop, isActive ? '' : btn.dataset.value);
        this.loadCurrentStyles();
    },

    showStylePanel() {
        if (!this.selectedElement && this.selectedElements.length === 0) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        this.stylePanel.style.display = 'flex';
        this.stylePanelOpen = true;
        this.loadCurrentStyles();

        if (this.selectedElements.length > 1) {
            this.showToast(`${this.selectedElements.length}개 요소에 스타일이 일괄 적용됩니다.`, 'info');
        }
    },

    hideStylePanel() {
        this.stylePanel.style.display = 'none';
        this.stylePanelOpen = false;
    },

    updateStyleTargetInfo(reference) {
        const tagEl = document.getElementById('spTargetTag');
        const pathEl = document.getElementById('spTargetPath');
        const countEl = document.getElementById('spTargetCount');
        if (!tagEl || !pathEl || !countEl) return;

        tagEl.textContent = reference.tagName.toLowerCase();

        const parts = [];
        if (reference.id) parts.push(`#${reference.id}`);
        const classes = this.getContentClasses(reference);
        if (classes.length > 0) parts.push('.' + classes.slice(0, 3).join('.'));
        const parent = reference.parentElement;
        if (parent && parent.tagName !== 'BODY') {
            parts.push(`↳ ${parent.tagName.toLowerCase()} 안`);
        }
        pathEl.textContent = parts.join(' ');

        if (this.selectedElements.length > 1) {
            countEl.textContent = `${this.selectedElements.length}개 일괄 편집`;
            countEl.style.display = 'inline-block';
        } else {
            countEl.style.display = 'none';
        }
    },

    loadCurrentStyles() {
        // 다중 선택만 있는 경우 첫 요소를 기준으로 현재 값을 표시
        const reference = this.selectedElement || this.selectedElements[0];
        if (!reference || !this.stylePanel) return;

        this.updateStyleTargetInfo(reference);

        const view = reference.ownerDocument.defaultView || window;
        const computed = view.getComputedStyle(reference);
        const inline = reference.style;

        this.stylePanel.querySelectorAll('input[data-css], select[data-css], textarea[data-css]').forEach(control => {
            const prop = control.dataset.css;
            const inlineValue = inline[prop] || '';
            const computedValue = computed[prop] || '';
            const effective = inlineValue || computedValue;

            if (control.type === 'color') {
                control.value = this.rgbToHex(effective || '#000000');
            } else if (control.classList.contains('color-text')) {
                // 색상 입력칸은 계산된 색을 hex 로 보여준다 (빈 값이면 투명)
                control.value = this.isTransparentColor(effective) ? '' : this.rgbToHex(effective);
            } else if (control.dataset.percent) {
                const ratio = parseFloat(effective);
                control.value = Math.round((isNaN(ratio) ? 1 : ratio) * 100);
            } else if (control.dataset.ratio) {
                control.value = this.readLineHeight(inlineValue, computedValue, computed);
            } else if (control.dataset.unit) {
                const num = parseFloat(effective);
                // px 는 소수점이 의미 없고 좁은 입력칸에서 잘려 보이므로 정수로 맞춘다
                const rounded = control.dataset.unit === 'px' ? Math.round(num) : Math.round(num * 100) / 100;
                control.value = isNaN(num) ? '' : rounded;
            } else if (control.tagName === 'SELECT') {
                control.value = this.matchSelectValue(control, prop, inlineValue, computedValue);
            } else {
                // 자유 입력(width, top 등): 인라인 값만 채우고 계산값은 placeholder 로 힌트
                control.value = inlineValue;
                if (computedValue && computedValue.length < 24) {
                    control.placeholder = this.formatComputedHint(computedValue);
                }
            }

            this.syncPairedControl(control, control.value);
        });

        // 토글 버튼 상태
        this.stylePanel.querySelectorAll('button[data-css][data-value]').forEach(btn => {
            const prop = btn.dataset.css;
            const current = (inline[prop] || computed[prop] || '').toString();
            btn.classList.toggle('active', this.styleValueMatches(current, btn.dataset.value, prop));
        });

        // 구조 탭 입력값
        const classInput = document.getElementById('spClassInput');
        const idInput = document.getElementById('spIdInput');
        const styleText = document.getElementById('spStyleText');
        const tagSelect = document.getElementById('spTagSelect');
        if (classInput) classInput.value = this.getContentClasses(reference).join(' ');
        if (idInput) idInput.value = reference.id || '';
        if (styleText) styleText.value = reference.getAttribute('style') || '';
        if (tagSelect) tagSelect.value = '';
    },

    readLineHeight(inlineValue, computedValue, computed) {
        if (inlineValue && !inlineValue.endsWith('px')) return parseFloat(inlineValue) || '';
        const lh = parseFloat(inlineValue || computedValue);
        const fs = parseFloat(computed.fontSize);
        if (!lh || !fs) return '';
        return Math.round((lh / fs) * 100) / 100;
    },

    matchSelectValue(control, prop, inlineValue, computedValue) {
        const options = Array.from(control.options).map(o => o.value);
        const candidates = [inlineValue, computedValue];

        for (const raw of candidates) {
            if (!raw) continue;
            if (options.includes(raw)) return raw;

            if (prop === 'fontFamily') {
                const first = this.normalizeFontName(raw);
                const hit = options.find(o => o && this.normalizeFontName(o) === first);
                if (hit) return hit;
            }
            if (prop === 'fontWeight') {
                const normalized = this.normalizeFontWeight(raw);
                if (options.includes(normalized)) return normalized;
            }
        }
        return '';
    },

    styleValueMatches(current, target, prop) {
        let cur = (current || '').toLowerCase();
        const want = (target || '').toLowerCase();
        if (!cur) return false;

        if (prop === 'textDecoration' || prop === 'textDecorationLine') {
            return cur.includes(want);
        }
        if (prop === 'textAlign') {
            if (cur === 'start') cur = 'left';
            if (cur === 'end') cur = 'right';
        }
        if (prop === 'fontWeight') {
            return this.normalizeFontWeight(cur) === this.normalizeFontWeight(want);
        }
        return cur === want;
    },

    getBatchTargets() {
        if (this.selectedElements.length > 0) return [...this.selectedElements];
        return this.selectedElement ? [this.selectedElement] : [];
    },

    applyStyle(property, value) {
        const targets = this.getBatchTargets();
        if (targets.length === 0) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        targets.forEach(el => {
            el.style[property] = value;
        });
        this.saveToHistory(`스타일 변경: ${property}`, false);
    }
});
