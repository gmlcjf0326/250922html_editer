// 히스토리 — 스냅샷 저장, 셀렉터 생성, 되돌리기/다시실행(제자리 복원), 타임라인 패널

Object.assign(HTMLLiveEditor.prototype, {
    saveToHistory(actionName, immediate = true) {
        if (!immediate) {
            clearTimeout(this.historyTimeout);
            this.historyTimeout = setTimeout(() => {
                this.doSaveToHistory(actionName);
            }, 200);
        } else {
            this.doSaveToHistory(actionName);
        }
    },

    doSaveToHistory(actionName) {
        const iframe = this.previewFrame;
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        let selectedElementSelector = null;
        if (this.selectedElement) {
            selectedElementSelector = this.getElementSelector(this.selectedElement);
        }

        const snapshot = {
            html: this.serializeDocumentForSnapshot(doc),
            action: actionName,
            timestamp: Date.now(),
            selectedElementSelector: selectedElementSelector
        };

        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(snapshot);
        this.historyIndex = this.history.length - 1;

        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.historyIndex--;
        }

        this.updateHistoryButtons();
        // 편집 직후 레이아웃이 바뀌었을 수 있으니 리사이즈 핸들 위치를 맞춘다
        this.updateCanvasOverlay();
        // 마지막 편집 상태를 안전망으로 남긴다 (실패해도 편집엔 영향 없음)
        this.saveBackup();
    },

    getElementSelector(element) {
        if (!element || !element.parentNode) return null;

        const doc = element.ownerDocument;

        if (element.id) {
            return `#${element.id}`;
        }

        const selectors = [];

        if (element.className) {
            const classSelector = this.generateClassBasedSelector(element);
            if (classSelector) selectors.push(classSelector);
        }

        const attrSelector = this.generateAttributeBasedSelector(element);
        if (attrSelector) selectors.push(attrSelector);

        const pathSelector = this.generatePathBasedSelector(element);
        if (pathSelector) selectors.push(pathSelector);

        for (const selector of selectors) {
            try {
                const found = doc.querySelector(selector);
                if (found === element) {
                    return selector;
                }
            } catch (e) {
                continue;
            }
        }

        return pathSelector;
    },

    generateClassBasedSelector(element) {
        if (!element.className) return null;

        const classes = Array.from(element.classList)
            .filter(cls => !cls.startsWith('element-') && !cls.startsWith('editable-') && !cls.startsWith('drop-'));

        if (classes.length === 0) return null;

        return element.tagName.toLowerCase() + '.' + classes.join('.');
    },

    generateAttributeBasedSelector(element) {
        const attributes = ['data-id', 'name', 'title', 'alt', 'href', 'src'];

        for (const attr of attributes) {
            const value = element.getAttribute(attr);
            if (value) {
                const selector = `${element.tagName.toLowerCase()}[${attr}="${value}"]`;
                try {
                    const doc = element.ownerDocument;
                    const found = doc.querySelector(selector);
                    if (found === element) {
                        return selector;
                    }
                } catch (e) {
                    continue;
                }
            }
        }

        return null;
    },

    generatePathBasedSelector(element) {
        const doc = element.ownerDocument;
        const path = [];
        let current = element;

        while (current && current !== doc.body && current.parentNode) {
            let selector = current.tagName.toLowerCase();

            const siblings = Array.from(current.parentNode.children);
            const sameTagSiblings = siblings.filter(sibling => sibling.tagName === current.tagName);

            if (sameTagSiblings.length > 1) {
                const index = sameTagSiblings.indexOf(current) + 1;
                selector += `:nth-of-type(${index})`;
            }

            path.unshift(selector);
            current = current.parentNode;
        }

        return path.length > 0 ? path.join(' > ') : null;
    },

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreFromHistory();
        }
    },

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreFromHistory();
        }
    },

    async restoreFromHistory() {
        if (this.historyIndex < 0 || this.historyIndex >= this.history.length) return;

        const snapshot = this.history[this.historyIndex];
        const doc = this.getPreviewDoc();
        if (!doc || !doc.documentElement) return;

        try {
            // 스크롤 위치는 교체 전에 저장해 두었다가 복원한다
            const scroller = doc.scrollingElement || doc.documentElement;
            const scrollTop = scroller.scrollTop;
            const scrollLeft = scroller.scrollLeft;

            this.clearAllDOMReferences();

            // iframe 을 다시 로드하지 않고 <html> 만 교체한다.
            // 문서의 doctype 이 그대로 유지되므로 standards mode 도 보존된다.
            const parsed = new DOMParser().parseFromString(snapshot.html, 'text/html');
            doc.replaceChild(doc.importNode(parsed.documentElement, true), doc.documentElement);

            // 스냅샷에는 이미 편집용 스팬과 에디터 스타일이 들어 있으므로
            // 다시 감싸지 않고(중첩 방지) 리스너만 새로 연결한다.
            this.injectEditorStyles(doc);
            this.setupEditableListeners(doc);
            this.setupElementSelection(doc);
            this.setupDragAndDrop(doc);

            scroller.scrollTop = scrollTop;
            scroller.scrollLeft = scrollLeft;

            const restored = this.findElementBySelector(doc, snapshot.selectedElementSelector);
            if (restored) {
                this.selectElement(restored);
            }

            // 문서가 통째로 교체됐으므로 문서 탭이 들고 있던 상태를 실제 문서 기준으로 다시 맞춘다
            this.syncDocThemeFromDocument();

            this.hideContextualMenus();
        } catch (error) {
            console.error('히스토리 복원 실패:', error);
        }

        this.updateHistoryButtons();
    },

    clearAllDOMReferences() {
        if (this.selectedElement) {
            try {
                this.selectedElement.classList.remove('element-selected');
            } catch (e) {}
            this.selectedElement = null;
        }

        this.clearMultiSelection();
        this.contextMenuTarget = null;
        this.hideFloatingToolbar();
        this.hideContextualMenus();
        this.hideStylePanel();
    },

    findElementBySelector(doc, selector) {
        if (!selector) return null;

        try {
            const element = doc.querySelector(selector);
            if (element && this.isElementVisible(element)) {
                return element;
            }
        } catch (e) {}
        return null;
    },

    updateHistoryButtons() {
        this.undoBtn.disabled = this.historyIndex <= 0;
        this.redoBtn.disabled = this.historyIndex >= this.history.length - 1;

        if (this.historyIndex > 0) {
            this.undoBtn.title = `되돌리기: ${this.history[this.historyIndex - 1].action} (Ctrl+Z)`;
        } else {
            this.undoBtn.title = '되돌리기 (Ctrl+Z)';
        }

        if (this.historyIndex < this.history.length - 1) {
            this.redoBtn.title = `다시실행: ${this.history[this.historyIndex + 1].action} (Ctrl+Y)`;
        } else {
            this.redoBtn.title = '다시실행 (Ctrl+Y)';
        }

        this.renderHistoryPanel();
    },

    renderHistoryPanel() {
        const list = document.getElementById('historyList');
        if (!list || !this.historyPanel || !this.historyPanel.classList.contains('open')) return;

        list.innerHTML = '';

        if (this.history.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'command-palette-empty';
            empty.textContent = '아직 편집 기록이 없습니다.';
            list.appendChild(empty);
            return;
        }

        // 최신 항목이 위로 오도록 역순 렌더링
        for (let i = this.history.length - 1; i >= 0; i--) {
            const snapshot = this.history[i];
            const entry = document.createElement('div');
            entry.className = 'history-entry' + (i === this.historyIndex ? ' current' : '');

            const time = document.createElement('span');
            time.className = 'time';
            time.textContent = new Date(snapshot.timestamp).toLocaleTimeString('ko-KR', { hour12: false });

            const label = document.createElement('span');
            label.textContent = snapshot.action;

            entry.appendChild(time);
            entry.appendChild(label);
            entry.addEventListener('click', () => this.jumpToHistory(i));
            list.appendChild(entry);
        }
    },

    jumpToHistory(index) {
        if (index === this.historyIndex || index < 0 || index >= this.history.length) return;
        this.historyIndex = index;
        this.restoreFromHistory();
    }
});
