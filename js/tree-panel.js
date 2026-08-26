// 요소 트리 사이드바 — 문서 구조를 한눈에 보고, 깊이 숨은 요소도 클릭 한 번에 잡는다.

Object.assign(HTMLLiveEditor.prototype, {

    bindTreePanel() {
        this.treePanel = document.getElementById('treePanel');
        this.treeCollapsed = new WeakSet(); // 접힌 노드 (요소가 사라지면 함께 잊힌다)

        const treeBtn = document.getElementById('treeBtn');
        if (treeBtn) {
            treeBtn.addEventListener('click', () => {
                this.toggleSidePanel(this.treePanel);
                this.renderTreePanel();
            });
        }

        const closeBtn = document.getElementById('treePanelClose');
        if (closeBtn) closeBtn.addEventListener('click', () => this.treePanel.classList.remove('open'));
    },

    // 트리에 보여줄 콘텐츠 요소인가 (편집용 스팬·오버레이는 문서 구조가 아니다)
    isTreeContent(element) {
        if (!element || element.nodeType !== 1) return false;
        if (element.classList.contains('editable-text')) return false;
        if (element.hasAttribute('data-editor-ui')) return false;
        if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(element.tagName)) return false;
        return true;
    },

    treeContentChildren(element) {
        return Array.from(element.children).filter(child => this.isTreeContent(child));
    },

    renderTreePanel() {
        if (!this.treePanel || !this.treePanel.classList.contains('open')) return;

        const doc = this.getPreviewDoc();
        const list = document.getElementById('treeList');
        if (!doc || !doc.body || !list) return;

        // 선택 요소의 조상은 자동으로 펼친다 (선택이 접힌 가지에 숨지 않게)
        let ancestor = this.selectedElement && this.selectedElement.parentElement;
        while (ancestor && ancestor !== doc.body) {
            this.treeCollapsed.delete(ancestor);
            ancestor = ancestor.parentElement;
        }

        const scrollTop = list.scrollTop; // 다시 그려도 스크롤 위치 유지
        list.innerHTML = '';

        const build = (element, depth) => {
            const children = this.treeContentChildren(element);
            const row = document.createElement('div');
            row.className = 'tree-row' + (element === this.selectedElement ? ' current' : '');
            row.style.paddingLeft = (10 + depth * 14) + 'px';

            const caret = document.createElement('button');
            caret.type = 'button';
            caret.className = 'tree-caret';
            if (children.length > 0) {
                caret.textContent = this.treeCollapsed.has(element) ? '▸' : '▾';
                caret.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.treeCollapsed.has(element)) this.treeCollapsed.delete(element);
                    else this.treeCollapsed.add(element);
                    this.renderTreePanel();
                });
            } else {
                caret.textContent = '·';
                caret.disabled = true;
            }

            const label = document.createElement('span');
            label.className = 'tree-label';
            label.textContent = this.describeElementBrief(element);

            const snippet = document.createElement('span');
            snippet.className = 'tree-snippet';
            const text = (element.textContent || '').trim().replace(/\s+/g, ' ');
            snippet.textContent = text.slice(0, 20);

            row.appendChild(caret);
            row.appendChild(label);
            if (snippet.textContent) row.appendChild(snippet);

            row.addEventListener('click', () => {
                this.selectElement(element);
                element.scrollIntoView({ block: 'nearest' });
                this.renderTreePanel(); // 하이라이트 즉시 반영
            });

            list.appendChild(row);

            if (!this.treeCollapsed.has(element)) {
                children.forEach(child => build(child, depth + 1));
            }
        };

        this.treeContentChildren(doc.body).forEach(el => build(el, 0));
        list.scrollTop = scrollTop;
    },

    // 편집이 잦으니 재구축은 짧게 모아서 (연속 타이핑 중 매 글자 재렌더 방지)
    scheduleTreeRefresh() {
        if (!this.treePanel || !this.treePanel.classList.contains('open')) return;
        clearTimeout(this.treeRefreshTimeout);
        this.treeRefreshTimeout = setTimeout(() => this.renderTreePanel(), 200);
    },
});
