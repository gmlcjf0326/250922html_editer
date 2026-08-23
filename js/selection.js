// 선택 — 이벤트 위임, 단일·다중·유사 선택, DOM 네비게이터, 컨텍스트 메뉴, 플로팅 툴바

Object.assign(HTMLLiveEditor.prototype, {
    setupElementSelection(doc) {
        if (!this.isElementMode || !doc || !doc.body) return;

        try {
            this.cleanupExistingEventListeners(doc);
            this.setupEventDelegation(doc);
        } catch (error) {
            console.error('이벤트 리스너 설정 중 오류:', error);
        }
    },

    cleanupExistingEventListeners(doc) {
        try {
            if (doc.body && this.currentEventListeners) {
                this.currentEventListeners.forEach(({ event, handler }) => {
                    doc.body.removeEventListener(event, handler, true);
                });
            }

            doc.querySelectorAll('.element-hover, .element-selected').forEach(element => {
                element.classList.remove('element-hover', 'element-selected');
            });

            this.currentEventListeners = [];
        } catch (error) {
            console.error('이벤트 리스너 정리 중 오류:', error);
        }
    },

    setupEventDelegation(doc) {
        this.currentEventListeners = [];

        const mouseenterHandler = (e) => {
            if (!this.isElementMode || this.isDragging) return;

            const target = this.findEditableTarget(e.target);
            if (target && !this.selectedElement) {
                target.classList.add('element-hover');
            }
        };

        const mouseleaveHandler = (e) => {
            if (!this.isElementMode) return;

            const target = this.findEditableTarget(e.target);
            if (target) {
                target.classList.remove('element-hover');
            }
        };

        const clickHandler = (e) => {
            if (!this.isElementMode || this.isDragging) return;

            const target = this.findEditableTarget(e.target);
            if (target) {
                e.preventDefault();
                e.stopPropagation();

                if (e.altKey) {
                    // Alt+클릭: 같은 태그+클래스 요소 일괄 선택
                    this.selectSimilar(target, 'tag-class');
                } else if (e.ctrlKey && e.shiftKey) {
                    // Ctrl+Shift+클릭: 기존 선택과 같은 부모 안에서 범위 선택
                    this.selectSiblingRange(target);
                } else {
                    // Shift+클릭: 다중 선택
                    this.selectElement(target, e.shiftKey);
                }
            }
        };

        const contextmenuHandler = (e) => {
            if (!this.isElementMode) return;

            const target = this.findEditableTarget(e.target);
            if (target) {
                e.preventDefault();
                e.stopPropagation();

                if (this.isTableElement(target)) {
                    this.showTableContextMenu(e, target);
                } else {
                    this.showContextMenu(e, target);
                }
            }
        };

        try {
            doc.body.addEventListener('mouseenter', mouseenterHandler, true);
            doc.body.addEventListener('mouseleave', mouseleaveHandler, true);
            doc.body.addEventListener('click', clickHandler, true);
            doc.body.addEventListener('contextmenu', contextmenuHandler, true);

            // iframe에 포커스가 있어도 단축키가 동작하도록 iframe 문서에도 바인딩
            // (편집 중 대부분의 시간 동안 포커스는 iframe 안에 있음)
            doc.addEventListener('keydown', (e) => this.handleKeydown(e));
            // 뷰포트 전환·창 크기 변경으로 레이아웃이 바뀌면 리사이즈 핸들을 따라 붙인다
            doc.defaultView.addEventListener('resize', () => this.updateCanvasOverlay());

            this.currentEventListeners = [
                { event: 'mouseenter', handler: mouseenterHandler },
                { event: 'mouseleave', handler: mouseleaveHandler },
                { event: 'click', handler: clickHandler },
                { event: 'contextmenu', handler: contextmenuHandler }
            ];
        } catch (error) {
            console.error('이벤트 위임 등록 실패:', error);
        }
    },

    findEditableTarget(element) {
        if (!element || !element.tagName) return null;

        const excludedTags = ['html', 'head', 'body', 'script', 'style', 'meta', 'link'];
        const excludedClasses = ['editable-text'];

        let current = element;
        let attempts = 0;
        const maxAttempts = 10;

        while (current && current.tagName && attempts < maxAttempts) {
            // 편집용 오버레이(리사이즈 핸들 등)는 선택·드래그 대상이 아니다
            if (current.hasAttribute && current.hasAttribute('data-editor-ui')) return null;

            const tagName = current.tagName.toLowerCase();

            if (excludedTags.includes(tagName)) {
                return null;
            }

            let hasExcludedClass = false;
            for (const className of excludedClasses) {
                if (current.classList && current.classList.contains(className)) {
                    hasExcludedClass = true;
                    break;
                }
            }

            if (!hasExcludedClass) {
                if (this.isValidEditTarget(current)) {
                    return current;
                }
            }

            current = current.parentElement;
            attempts++;
        }

        return null;
    },

    isValidEditTarget(element) {
        if (!element || !element.tagName) return false;

        try {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                return false;
            }

            const editableTags = [
                'div', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'button', 'a', 'li', 'ul', 'ol', 'table', 'tr', 'td', 'th',
                'img', 'section', 'article', 'header', 'footer', 'nav', 'form',
                'input', 'textarea', 'select', 'label'
            ];

            const tagName = element.tagName.toLowerCase();
            return editableTags.includes(tagName);
        } catch (error) {
            return false;
        }
    },

    isTableElement(element) {
        const tagName = element.tagName.toLowerCase();
        return ['table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot'].includes(tagName) ||
               element.closest('table') !== null;
    },

    selectElement(element, addToSelection = false) {
        if (addToSelection) {
            // 첫 Shift+클릭이면 기존 단일 선택 요소도 다중 선택에 포함
            if (this.selectedElements.length === 0 && this.selectedElement && this.selectedElement !== element) {
                this.selectedElement.classList.add('element-multi-selected');
                this.selectedElements.push(this.selectedElement);
            }

            // Shift+클릭: 다중 선택
            if (this.selectedElements.includes(element)) {
                // 이미 선택된 요소면 제거
                element.classList.remove('element-multi-selected');
                this.selectedElements = this.selectedElements.filter(e => e !== element);
            } else {
                // 새로 추가
                element.classList.add('element-multi-selected');
                this.selectedElements.push(element);
            }
            this.updateSelectionCount();
            this.blurIframeText();
            this.hideCanvasOverlay();
            return;
        }

        // 기존 다중 선택 초기화
        this.clearMultiSelection();

        if (this.selectedElement && this.selectedElement !== element) {
            this.selectedElement.classList.remove('element-selected');
        }

        this.selectedElement = element;
        element.classList.add('element-selected');
        element.classList.remove('element-hover');

        this.showFloatingToolbar(element);
        this.showDOMNavigator(element);
        this.updateCanvasOverlay();
        this.scheduleTreeRefresh();

        // 스타일 패널이 열려있으면 업데이트
        if (this.stylePanelOpen) {
            this.loadCurrentStyles();
        }
    },

    clearSelection() {
        if (this.selectedElement) {
            this.selectedElement.classList.remove('element-selected');
            this.selectedElement = null;
        }
        this.hideFloatingToolbar();
        this.hideDOMNavigator();
        this.hideCanvasOverlay();
        this.clearMultiSelection();
    },

    clearMultiSelection() {
        this.selectedElements.forEach(el => {
            el.classList.remove('element-multi-selected');
        });
        this.selectedElements = [];
        this.updateSelectionCount();
    },

    updateSelectionCount() {
        const count = this.selectedElements.length;
        if (count > 0) {
            this.selectionCount.textContent = `${count}개 선택`;
            this.selectionCount.style.display = 'inline-block';
        } else {
            this.selectionCount.style.display = 'none';
        }
    },

    blurIframeText() {
        const doc = this.getPreviewDoc();
        if (doc && doc.activeElement && doc.activeElement.classList &&
            doc.activeElement.classList.contains('editable-text')) {
            doc.activeElement.blur();
        }
    },

    getSimilarElements(element, scope) {
        const doc = element.ownerDocument;
        const tag = element.tagName.toLowerCase();
        let candidates = [];

        switch (scope) {
            case 'tag':
                candidates = Array.from(doc.body.querySelectorAll(tag));
                break;
            case 'tag-class': {
                const classes = this.getContentClasses(element).sort().join(' ');
                candidates = Array.from(doc.body.querySelectorAll(tag))
                    .filter(el => this.getContentClasses(el).sort().join(' ') === classes);
                break;
            }
            case 'class': {
                const classes = this.getContentClasses(element);
                if (classes.length === 0) return [element];
                candidates = Array.from(doc.body.querySelectorAll('*'))
                    .filter(el => classes.some(cls => el.classList.contains(cls)));
                break;
            }
            case 'siblings':
                candidates = element.parentElement ? Array.from(element.parentElement.children) : [element];
                break;
            case 'descendants-same-tag':
                candidates = [element, ...element.querySelectorAll(tag)];
                break;
            default:
                return [element];
        }

        return candidates.filter(el => this.isValidEditTarget(el) && !el.classList.contains('editable-text'));
    },

    selectSimilar(element, scope) {
        const matches = this.getSimilarElements(element, scope);
        if (matches.length === 0) return;

        // 기준 요소를 단일 선택으로 잡은 뒤 전체를 다중 선택에 추가
        this.selectElement(element);
        this.clearMultiSelection();

        matches.forEach(el => {
            el.classList.add('element-multi-selected');
            this.selectedElements.push(el);
        });
        this.updateSelectionCount();
        this.blurIframeText();
        this.showToast(`${matches.length}개 요소가 선택되었습니다.`, 'info');
    },

    selectSiblingRange(target) {
        const anchor = this.selectedElement;
        if (!anchor || anchor === target || anchor.parentElement !== target.parentElement) {
            this.selectElement(target);
            return;
        }

        const siblings = Array.from(target.parentElement.children);
        const start = siblings.indexOf(anchor);
        const end = siblings.indexOf(target);
        if (start === -1 || end === -1) {
            this.selectElement(target);
            return;
        }

        const [from, to] = start < end ? [start, end] : [end, start];
        this.clearMultiSelection();

        for (let i = from; i <= to; i++) {
            const el = siblings[i];
            if (!this.isValidEditTarget(el)) continue;
            el.classList.add('element-multi-selected');
            this.selectedElements.push(el);
        }
        this.updateSelectionCount();
        this.blurIframeText();
        this.showToast(`${this.selectedElements.length}개 요소가 범위 선택되었습니다.`, 'info');
    },

    showSimilarDropdown() {
        if (!this.selectedElement) return;

        const dropdown = document.getElementById('similarDropdown');
        if (!dropdown) return;

        // 각 범위별 대상 개수 미리 표시
        const counts = {
            tag: this.getSimilarElements(this.selectedElement, 'tag').length,
            'tag-class': this.getSimilarElements(this.selectedElement, 'tag-class').length,
            class: this.getSimilarElements(this.selectedElement, 'class').length,
            siblings: this.getSimilarElements(this.selectedElement, 'siblings').length,
            'descendants-same-tag': this.getSimilarElements(this.selectedElement, 'descendants-same-tag').length
        };
        const countIds = {
            tag: 'similarCountTag',
            'tag-class': 'similarCountTagClass',
            class: 'similarCountClass',
            siblings: 'similarCountSiblings',
            'descendants-same-tag': 'similarCountDesc'
        };
        Object.entries(countIds).forEach(([scope, id]) => {
            const span = document.getElementById(id);
            if (span) span.textContent = counts[scope];
        });

        // 플로팅 툴바 아래에 표시 (뷰포트 좌표 기준이므로 fixed 사용)
        const toolbarRect = this.floatingToolbar.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.left = toolbarRect.left + 'px';
        dropdown.style.top = (toolbarRect.bottom + 6) + 'px';
        dropdown.classList.add('open');
    },

    hideSimilarDropdown() {
        const dropdown = document.getElementById('similarDropdown');
        if (dropdown) dropdown.classList.remove('open');
    },

    bindSimilarDropdown() {
        const dropdown = document.getElementById('similarDropdown');
        if (!dropdown) return;

        dropdown.querySelectorAll('.similar-option').forEach(option => {
            option.addEventListener('click', () => {
                this.hideSimilarDropdown();
                if (this.selectedElement) {
                    this.selectSimilar(this.selectedElement, option.dataset.scope);
                }
            });
        });
    },

    showDOMNavigator(element) {
        if (!element) {
            this.domNavigator.style.display = 'none';
            return;
        }

        this.domNavigator.style.display = 'flex';
        this.updateBreadcrumb(element);
        this.updateNavigationButtons(element);
    },

    hideDOMNavigator() {
        this.domNavigator.style.display = 'none';
    },

    updateBreadcrumb(element) {
        const path = [];
        let current = element;
        const doc = element.ownerDocument;

        while (current && current !== doc.body && current.tagName) {
            path.unshift(current);
            current = current.parentElement;
        }

        // body 추가
        if (doc.body) {
            path.unshift(doc.body);
        }

        this.domBreadcrumb.innerHTML = '';
        path.forEach((el, index) => {
            if (index > 0) {
                const separator = document.createElement('span');
                separator.className = 'breadcrumb-separator';
                separator.textContent = '›';
                this.domBreadcrumb.appendChild(separator);
            }

            const item = document.createElement('span');
            item.className = 'breadcrumb-item' + (el === element ? ' current' : '');

            let label = el.tagName.toLowerCase();
            if (el.id) {
                label += `#${el.id}`;
            } else if (el.className && typeof el.className === 'string') {
                const classes = el.className.split(' ')
                    .filter(c => c && !c.startsWith('element-') && !c.startsWith('editable-'))
                    .slice(0, 2);
                if (classes.length > 0) {
                    label += `.${classes.join('.')}`;
                }
            }

            item.textContent = label;
            item.addEventListener('click', () => {
                if (el !== element) {
                    this.selectElement(el);
                }
            });
            this.domBreadcrumb.appendChild(item);
        });

        // 스크롤을 오른쪽 끝으로
        this.domBreadcrumb.scrollLeft = this.domBreadcrumb.scrollWidth;
    },

    updateNavigationButtons(element) {
        const parent = element.parentElement;
        const doc = element.ownerDocument;

        // 부모 버튼
        this.navParent.disabled = !parent || parent === doc.body || parent.tagName === 'BODY';

        // 이전/다음 형제 버튼
        const prevSibling = this.findValidSibling(element, 'previous');
        const nextSibling = this.findValidSibling(element, 'next');
        this.navPrevSibling.disabled = !prevSibling;
        this.navNextSibling.disabled = !nextSibling;

        // 자식 버튼
        const firstChild = this.findValidChild(element);
        this.navFirstChild.disabled = !firstChild;
    },

    findValidSibling(element, direction) {
        let sibling = direction === 'previous' ? element.previousElementSibling : element.nextElementSibling;
        while (sibling) {
            if (this.isValidEditTarget(sibling)) {
                return sibling;
            }
            sibling = direction === 'previous' ? sibling.previousElementSibling : sibling.nextElementSibling;
        }
        return null;
    },

    findValidChild(element) {
        for (const child of element.children) {
            if (this.isValidEditTarget(child)) {
                return child;
            }
        }
        return null;
    },

    navigateToParent() {
        if (!this.selectedElement) return;
        const parent = this.selectedElement.parentElement;
        const doc = this.selectedElement.ownerDocument;
        if (parent && parent !== doc.body && parent.tagName !== 'BODY') {
            this.selectElement(parent);
        }
    },

    navigateToPrevSibling() {
        if (!this.selectedElement) return;
        const sibling = this.findValidSibling(this.selectedElement, 'previous');
        if (sibling) {
            this.selectElement(sibling);
        }
    },

    navigateToNextSibling() {
        if (!this.selectedElement) return;
        const sibling = this.findValidSibling(this.selectedElement, 'next');
        if (sibling) {
            this.selectElement(sibling);
        }
    },

    navigateToFirstChild() {
        if (!this.selectedElement) return;
        const child = this.findValidChild(this.selectedElement);
        if (child) {
            this.selectElement(child);
        }
    },

    showContextMenu(event, element) {
        this.contextMenuTarget = element;

        const iframe = this.previewFrame;
        const iframeRect = iframe.getBoundingClientRect();

        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = (iframeRect.left + event.clientX) + 'px';
        this.contextMenu.style.top = (iframeRect.top + event.clientY) + 'px';
        this.tableContextMenu.style.display = 'none';
    },

    showTableContextMenu(event, element) {
        this.contextMenuTarget = element;

        const iframe = this.previewFrame;
        const iframeRect = iframe.getBoundingClientRect();

        this.tableContextMenu.style.display = 'block';
        this.tableContextMenu.style.left = (iframeRect.left + event.clientX) + 'px';
        this.tableContextMenu.style.top = (iframeRect.top + event.clientY) + 'px';
        this.contextMenu.style.display = 'none';
    },

    hideContextualMenus(event) {
        if (!event) {
            this.contextMenu.style.display = 'none';
            this.tableContextMenu.style.display = 'none';
            return;
        }

        if (!this.contextMenu.contains(event.target)) {
            this.contextMenu.style.display = 'none';
        }
        if (!this.tableContextMenu.contains(event.target)) {
            this.tableContextMenu.style.display = 'none';
        }

        // 원본 편집 드롭다운: 바깥 클릭 시 닫기
        const dropdown = document.getElementById('openInEditorDropdown');
        if (dropdown && !dropdown.contains(event.target)) {
            dropdown.classList.remove('open');
        }

        // 유사 선택 드롭다운: 바깥 클릭 시 닫기 (유사 선택 버튼 클릭은 토글 로직이 처리)
        const similarDropdown = document.getElementById('similarDropdown');
        if (similarDropdown && !similarDropdown.contains(event.target) && !this.floatingToolbar.contains(event.target)) {
            similarDropdown.classList.remove('open');
        }
    },

    handleContextMenuClick(event) {
        const action = event.target.getAttribute('data-action');
        const element = this.contextMenuTarget;

        if (!action || !element) return;

        const iframe = this.previewFrame;
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        this.hideContextualMenus();
        // 다중 선택된 요소 위에서의 액션은 다중 선택을 유지한 채 실행
        if (!this.selectedElements.includes(element)) {
            this.selectElement(element);
        }

        switch (action) {
            case 'style':
                this.showStylePanel();
                break;
            case 'select-same-tag':
                this.selectSimilar(element, 'tag');
                break;
            case 'select-tag-class':
                this.selectSimilar(element, 'tag-class');
                break;
            case 'select-siblings':
                this.selectSimilar(element, 'siblings');
                break;
            case 'select-descendants':
                this.selectSimilar(element, 'descendants-same-tag');
                break;
            case 'add-button':
                this.addElement(doc, 'button', '새 버튼');
                break;
            case 'add-list-item':
                this.addElement(doc, 'li', '새 리스트 아이템');
                break;
            case 'add-image':
                this.addElement(doc, 'img');
                break;
            case 'add-link':
                this.addElement(doc, 'a', '새 링크');
                break;
            case 'wrap-div':
                this.wrapWithDiv();
                break;
            case 'unwrap':
                this.unwrapElement();
                break;
            case 'move-out':
                this.moveOutOfParent();
                break;
            case 'nest-prev':
                this.nestIntoPreviousSibling();
                break;
            case 'duplicate':
                this.duplicateElement();
                break;
            case 'delete':
                this.deleteElement();
                break;
        }
    },

    handleTableContextMenuClick(event) {
        const action = event.target.getAttribute('data-action');
        const element = this.contextMenuTarget;

        if (!action || !element) return;

        this.hideContextualMenus();
        this.selectElement(element);

        switch (action) {
            case 'style':
                this.showStylePanel();
                break;
            case 'add-row-above':
                this.addTableRow(element, 'above');
                break;
            case 'add-row-below':
                this.addTableRow(element, 'below');
                break;
            case 'add-col-left':
                this.addTableColumn(element, 'left');
                break;
            case 'add-col-right':
                this.addTableColumn(element, 'right');
                break;
            case 'delete-row':
                this.deleteTableRow(element);
                break;
            case 'delete-col':
                this.deleteTableColumn(element);
                break;
            case 'duplicate':
                this.duplicateElement(element);
                break;
            case 'delete':
                this.deleteElement(element);
                break;
        }
    },

    handleToolbarClick(event) {
        const action = event.target.getAttribute('data-action');
        if (!action || !this.selectedElement) return;

        switch (action) {
            case 'move-up':
                this.moveElement(this.selectedElement, 'up');
                break;
            case 'move-down':
                this.moveElement(this.selectedElement, 'down');
                break;
            case 'style':
                this.showStylePanel();
                break;
            case 'similar': {
                const dropdown = document.getElementById('similarDropdown');
                if (dropdown && dropdown.classList.contains('open')) {
                    this.hideSimilarDropdown();
                } else {
                    this.showSimilarDropdown();
                }
                break;
            }
            case 'duplicate':
                this.duplicateElement();
                break;
            case 'delete':
                this.deleteElement();
                break;
        }
    },

    showFloatingToolbar(element) {
        if (!element || !element.isConnected) return;

        const iframe = this.previewFrame;
        if (!iframe) return;

        try {
            const iframeRect = iframe.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();

            if (elementRect.width === 0 || elementRect.height === 0) return;

            const toolbarWidth = 200;
            const toolbarHeight = 45;
            const margin = 10;

            let toolbarLeft = iframeRect.left + elementRect.left;
            let toolbarTop = iframeRect.top + elementRect.top - toolbarHeight - margin;

            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            if (toolbarLeft < margin) {
                toolbarLeft = margin;
            } else if (toolbarLeft + toolbarWidth > screenWidth - margin) {
                toolbarLeft = screenWidth - toolbarWidth - margin;
            }

            // 스타일 패널이 열려 있으면 그 위를 덮지 않도록 왼쪽으로 밀어냄
            if (this.stylePanelOpen && this.stylePanel) {
                const panelRect = this.stylePanel.getBoundingClientRect();
                const overlapsPanel = toolbarLeft + toolbarWidth > panelRect.left - margin
                    && toolbarTop < panelRect.bottom
                    && toolbarTop + toolbarHeight > panelRect.top;
                if (overlapsPanel) {
                    toolbarLeft = Math.max(margin, panelRect.left - toolbarWidth - margin);
                }
            }

            if (toolbarTop < margin) {
                toolbarTop = iframeRect.top + elementRect.top + elementRect.height + margin;

                if (toolbarTop + toolbarHeight > screenHeight - margin) {
                    toolbarTop = Math.max(margin, screenHeight - toolbarHeight - margin);
                }
            }

            this.floatingToolbar.style.display = 'flex';
            this.floatingToolbar.style.position = 'fixed';
            this.floatingToolbar.style.left = Math.round(toolbarLeft) + 'px';
            this.floatingToolbar.style.top = Math.round(toolbarTop) + 'px';
            this.floatingToolbar.style.zIndex = '10000';

        } catch (error) {
            console.error('툴바 표시 오류:', error);
        }
    },

    hideFloatingToolbar() {
        this.floatingToolbar.style.display = 'none';
    }
});
