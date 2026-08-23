// 캔버스 직접 조작 — 선택 요소의 리사이즈 핸들과 "+ 삽입" 버튼.
// 오버레이는 편집 대상 문서 안에 absolute 로 살고 data-editor-ui 로 표시된다:
// 선택·드래그·텍스트 래핑·히스토리 스냅숏·다운로드 어디에도 새어 나가면 안 된다.

const GS_QUICK_INSERTS = [
    { tag: 'p', label: '문단', text: '새 문단' },
    { tag: 'h2', label: '제목', text: '새 제목' },
    { tag: 'button', label: '버튼', text: '버튼' },
    { tag: 'img', label: '이미지', text: '' },
    { tag: 'hr', label: '구분선', text: '' },
    { tag: 'div', label: 'div 상자', text: '' },
];

Object.assign(HTMLLiveEditor.prototype, {

    // ---------- 오버레이 생성 · 배치 ----------

    getCanvasOverlay(doc) {
        let overlay = doc.getElementById('gs-canvas-overlay');
        if (overlay) return overlay;

        overlay = doc.createElement('div');
        overlay.id = 'gs-canvas-overlay';
        overlay.setAttribute('data-editor-ui', '1');
        overlay.innerHTML = `
            <div class="gs-rh" data-dir="e" title="너비 조절"></div>
            <div class="gs-rh" data-dir="s" title="높이 조절"></div>
            <div class="gs-rh" data-dir="se" title="크기 조절 (Shift: 비율 유지)"></div>
            <div class="gs-size-badge" data-editor-ui="1"></div>
            <button type="button" class="gs-add-btn" data-editor-ui="1" title="바로 아래에 요소 추가">+</button>
            <div class="gs-add-menu" data-editor-ui="1"></div>
        `;

        const menu = overlay.querySelector('.gs-add-menu');
        GS_QUICK_INSERTS.forEach(item => {
            const btn = doc.createElement('button');
            btn.type = 'button';
            btn.textContent = item.label;
            btn.setAttribute('data-editor-ui', '1');
            btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.quickInsertAfterSelection(item);
            });
            menu.appendChild(btn);
        });

        overlay.querySelectorAll('.gs-rh').forEach(handle => {
            handle.addEventListener('mousedown', (e) => this.startCanvasResize(e, handle.dataset.dir));
        });

        const addBtn = overlay.querySelector('.gs-add-btn');
        addBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('open');
        });

        doc.body.appendChild(overlay);
        return overlay;
    },

    updateCanvasOverlay() {
        const doc = this.getPreviewDoc();
        if (!doc || !doc.body) return;

        // 단일 선택일 때만 의미가 있다 (다중 선택의 리사이즈는 모호)
        const el = this.selectedElement;
        if (!el || this.selectedElements.length > 0 || !el.isConnected) {
            this.hideCanvasOverlay();
            return;
        }

        const overlay = this.getCanvasOverlay(doc);
        const rect = el.getBoundingClientRect();
        const view = doc.defaultView;
        const left = rect.left + view.scrollX;
        const top = rect.top + view.scrollY;

        overlay.style.display = 'block';
        overlay.style.left = left + 'px';
        overlay.style.top = top + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';

        const badge = overlay.querySelector('.gs-size-badge');
        badge.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

        // 낮은 요소(li 한 줄 등)에서는 + 버튼이 내용을 다 덮어 버린다 — 숨긴다
        const addBtn = overlay.querySelector('.gs-add-btn');
        addBtn.style.display = rect.height >= 32 ? 'block' : 'none';
        if (rect.height < 32) overlay.querySelector('.gs-add-menu').classList.remove('open');
    },

    hideCanvasOverlay() {
        const doc = this.getPreviewDoc();
        const overlay = doc && doc.getElementById('gs-canvas-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.querySelector('.gs-add-menu').classList.remove('open');
        }
    },

    // ---------- 리사이즈 ----------

    startCanvasResize(e, dir) {
        e.preventDefault();
        e.stopPropagation();

        const el = this.selectedElement;
        if (!el) return;

        const doc = el.ownerDocument;
        const startRect = el.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const ratio = startRect.height > 0 ? startRect.width / startRect.height : 1;

        const onMove = (ev) => {
            let w = startRect.width + (dir.includes('e') ? ev.clientX - startX : 0);
            let h = startRect.height + (dir.includes('s') ? ev.clientY - startY : 0);

            if (ev.shiftKey && dir === 'se') h = w / ratio; // 비율 유지

            if (dir.includes('e')) el.style.width = Math.max(16, Math.round(w)) + 'px';
            if (dir.includes('s')) el.style.height = Math.max(16, Math.round(h)) + 'px';

            this.updateCanvasOverlay();
        };

        const onUp = () => {
            doc.removeEventListener('mousemove', onMove, true);
            doc.removeEventListener('mouseup', onUp, true);
            // 버튼 클릭 단위 동작이므로 디바운스 없이 1회 즉시 기록
            this.saveToHistory('크기 조절', true);
            if (this.stylePanelOpen) this.loadCurrentStyles();
        };

        doc.addEventListener('mousemove', onMove, true);
        doc.addEventListener('mouseup', onUp, true);
    },

    // ---------- "+ 삽입" ----------

    quickInsertAfterSelection(item) {
        const doc = this.getPreviewDoc();
        if (!doc || !this.selectedElement) return;

        this.hideCanvasOverlay();
        // addElement 가 선택 요소 뒤에 넣고, 새 요소를 선택하고, 히스토리를 기록한다
        this.addElement(doc, item.tag, item.text);
    },
});
