// 요소 편집 — 드래그 앤 드롭, 구조 변경(감싸기·꺼내기·태그 변경), 추가·복제·삭제, 테이블

Object.assign(HTMLLiveEditor.prototype, {
    setupDragAndDrop(doc) {
        if (!doc || !doc.body) return;

        // 마우스 다운 이벤트 (드래그 시작)
        doc.body.addEventListener('mousedown', (e) => {
            if (!this.isElementMode) return;
            if (e.button !== 0) return; // 좌클릭만

            const target = this.findEditableTarget(e.target);
            if (!target) return;

            // 텍스트 편집 중이면 드래그 시작하지 않음
            if (e.target.classList.contains('editable-text') && e.target.isContentEditable) {
                return;
            }

            this.dragStartPos = { x: e.clientX, y: e.clientY };
            this.potentialDragElement = target;
            // 실제 드래그는 마우스가 5px 이상 움직였을 때만 시작
            // (제자리 클릭·홀드가 드래그로 오인되지 않도록)
        });

        // 마우스 이동 이벤트
        doc.body.addEventListener('mousemove', (e) => {
            // 드래그 시작 전 움직임이 작으면 무시
            if (this.potentialDragElement && !this.isDragging) {
                const dx = Math.abs(e.clientX - this.dragStartPos.x);
                const dy = Math.abs(e.clientY - this.dragStartPos.y);
                if (dx < 5 && dy < 5) return;

                this.startDrag(this.potentialDragElement, e);
            }

            if (this.isDragging) {
                this.handleDragMove(e, doc);
            }
        });

        // 마우스 업 이벤트 (드래그 종료)
        doc.body.addEventListener('mouseup', (e) => {
            this.potentialDragElement = null;

            if (this.isDragging) {
                this.endDrag(doc);
            }
        });

        // 마우스가 iframe 밖으로 나갈 때
        doc.body.addEventListener('mouseleave', () => {
            if (this.isDragging) {
                // 드래그 유지하되 가이드만 숨김
                this.dragGuide.style.display = 'none';
            }
        });
    },

    startDrag(element, e) {
        if (this.isDragging) return;

        this.isDragging = true;
        this.draggedElement = element;

        // 드래그 중인 요소 스타일 변경
        element.classList.add('element-dragging');

        // 고스트 요소 표시
        this.dragGhost.textContent = element.tagName.toLowerCase() + ': ' +
            (element.textContent.substring(0, 30) || '(비어있음)');
        this.dragGhost.style.display = 'block';

        this.updateGhostPosition(e);

        console.log('🎯 드래그 시작:', element.tagName);
    },

    handleDragMove(e, doc) {
        if (!this.isDragging || !this.draggedElement) return;

        // 고스트 위치 업데이트
        this.updateGhostPosition(e);

        // iframe 내 좌표 계산
        const iframe = this.previewFrame;
        const iframeRect = iframe.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;

        // 드롭 타겟 찾기
        const elementsAtPoint = doc.elementsFromPoint(x, y);
        let newDropTarget = null;
        let newDropPosition = null;

        for (const el of elementsAtPoint) {
            if (el === this.draggedElement) continue;
            // 자기 자신의 자손에게는 드롭 불가 (insertBefore가 HierarchyRequestError로 크래시)
            if (this.draggedElement.contains(el)) continue;
            if (el.classList.contains('editable-text')) continue;
            if (['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE'].includes(el.tagName)) continue;

            // 유효한 드롭 타겟 찾음
            const rect = el.getBoundingClientRect();
            const relativeY = y - rect.top;
            const threshold = rect.height / 2;

            newDropTarget = el;
            newDropPosition = relativeY < threshold ? 'before' : 'after';
            break;
        }

        // 이전 하이라이트 제거
        if (this.dropTarget && this.dropTarget !== newDropTarget) {
            this.dropTarget.classList.remove('drop-target-highlight', 'drop-indicator-before', 'drop-indicator-after');
        }

        // 새 하이라이트 적용
        if (newDropTarget) {
            this.dropTarget = newDropTarget;
            this.dropPosition = newDropPosition;

            newDropTarget.classList.add('drop-target-highlight');

            // 드롭 가이드 라인 표시
            this.showDropGuide(newDropTarget, newDropPosition, iframeRect);
        } else {
            this.dragGuide.style.display = 'none';
        }
    },

    showDropGuide(target, position, iframeRect) {
        const rect = target.getBoundingClientRect();

        this.dragGuide.style.display = 'block';
        this.dragGuide.style.left = (iframeRect.left + rect.left) + 'px';
        this.dragGuide.style.width = rect.width + 'px';

        if (position === 'before') {
            this.dragGuide.style.top = (iframeRect.top + rect.top - 2) + 'px';
            this.dragGuide.querySelector('.drag-guide-text').textContent = '↑ 이 위치에 삽입';
        } else {
            this.dragGuide.style.top = (iframeRect.top + rect.bottom - 2) + 'px';
            this.dragGuide.querySelector('.drag-guide-text').textContent = '↓ 이 위치에 삽입';
        }
    },

    updateGhostPosition(e) {
        const iframe = this.previewFrame;
        const iframeRect = iframe.getBoundingClientRect();

        this.dragGhost.style.left = (iframeRect.left + e.clientX + 15) + 'px';
        this.dragGhost.style.top = (iframeRect.top + e.clientY + 15) + 'px';
    },

    endDrag(doc) {
        if (!this.isDragging) return;

        // 드롭 실행
        if (this.dropTarget && this.draggedElement && this.dropTarget !== this.draggedElement) {
            this.performDrop();
        }

        // 정리
        if (this.draggedElement) {
            this.draggedElement.classList.remove('element-dragging');
        }

        if (this.dropTarget) {
            this.dropTarget.classList.remove('drop-target-highlight', 'drop-indicator-before', 'drop-indicator-after');
        }

        this.dragGuide.style.display = 'none';
        this.dragGhost.style.display = 'none';

        this.isDragging = false;
        this.draggedElement = null;
        this.dropTarget = null;
        this.dropPosition = null;

        console.log('🎯 드래그 종료');
    },

    performDrop() {
        if (!this.draggedElement || !this.dropTarget) return;
        if (this.draggedElement.contains(this.dropTarget)) return;

        const parent = this.dropTarget.parentNode;

        if (this.dropPosition === 'before') {
            parent.insertBefore(this.draggedElement, this.dropTarget);
        } else {
            parent.insertBefore(this.draggedElement, this.dropTarget.nextSibling);
        }

        // 요소 다시 선택
        this.selectElement(this.draggedElement);
        this.saveToHistory('요소 이동', true);
        this.showToast('요소가 이동되었습니다.', 'success');

        console.log('✅ 드롭 완료');
    },

    getPrimaryTarget() {
        return this.selectedElement || this.selectedElements[0] || null;
    },

    wrapWithDiv() {
        const targets = this.getBatchTargets();
        if (targets.length === 0) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        const parent = targets[0].parentElement;
        if (!parent) {
            this.showToast('부모 요소가 없습니다.', 'error');
            return;
        }

        // 다중 선택은 같은 부모일 때만 하나의 div 로 묶는다
        const sameParent = targets.every(el => el.parentElement === parent);
        const group = sameParent ? targets : [targets[0]];

        // 문서 순서대로 정렬해야 감싼 뒤에도 순서가 유지됨
        const ordered = Array.from(parent.children).filter(child => group.includes(child));

        const doc = parent.ownerDocument;
        const wrapper = doc.createElement('div');
        parent.insertBefore(wrapper, ordered[0]);
        ordered.forEach(el => wrapper.appendChild(el));

        this.clearMultiSelection();
        this.selectElement(wrapper);
        this.saveToHistory('div로 감싸기', true);
        this.showToast(ordered.length > 1 ? `${ordered.length}개 요소를 div로 묶었습니다.` : '요소를 div로 감쌌습니다.', 'success');
    },

    unwrapElement() {
        const element = this.getPrimaryTarget();
        if (!element) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        const parent = element.parentElement;
        if (!parent || element.tagName === 'BODY') {
            this.showToast('감싸기를 해제할 수 없습니다.', 'error');
            return;
        }

        // 텍스트 노드까지 포함해 모든 자식을 옮긴다 (요소만 옮기면 글자가 사라짐)
        const movedChildren = Array.from(element.children);
        if (element.childNodes.length === 0) {
            this.showToast('내용이 없어 해제할 것이 없습니다.', 'warning');
            return;
        }

        while (element.firstChild) {
            parent.insertBefore(element.firstChild, element);
        }
        element.remove();

        this.clearMultiSelection();
        if (movedChildren.length > 0) {
            this.selectElement(movedChildren[0]);
        } else {
            this.clearSelection();
        }

        this.saveToHistory('감싸기 해제', true);
        this.showToast('감싸기가 해제되었습니다.', 'success');
    },

    moveOutOfParent() {
        const element = this.getPrimaryTarget();
        if (!element) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        const parent = element.parentElement;
        const grandparent = parent ? parent.parentElement : null;

        if (!parent || parent.tagName === 'BODY') {
            this.showToast('이미 최상위에 있어 더 꺼낼 수 없습니다.', 'warning');
            return;
        }
        if (!grandparent || grandparent.tagName === 'HTML') {
            this.showToast('더 이상 밖으로 이동할 수 없습니다.', 'error');
            return;
        }

        grandparent.insertBefore(element, parent.nextSibling);

        // 껍데기만 남았다면 함께 정리
        if (parent.children.length === 0 && !parent.textContent.trim()) {
            parent.remove();
        }

        this.selectElement(element);
        this.saveToHistory('부모 밖으로 이동', true);
        this.showToast(`<${parent.tagName.toLowerCase()}> 밖으로 꺼냈습니다.`, 'success');
    },

    nestIntoPreviousSibling() {
        const element = this.getPrimaryTarget();
        if (!element) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        const previous = element.previousElementSibling;
        if (!previous) {
            this.showToast('앞에 넣을 형제 요소가 없습니다.', 'warning');
            return;
        }

        const voidTags = ['IMG', 'INPUT', 'BR', 'HR', 'TEXTAREA', 'SELECT'];
        if (voidTags.includes(previous.tagName)) {
            this.showToast(`<${previous.tagName.toLowerCase()}> 안에는 넣을 수 없습니다.`, 'error');
            return;
        }

        previous.appendChild(element);
        this.selectElement(element);
        this.saveToHistory('앞 요소 안으로 이동', true);
        this.showToast(`<${previous.tagName.toLowerCase()}> 안으로 넣었습니다.`, 'success');
    },

    changeElementTag(newTag) {
        const element = this.getPrimaryTarget();
        if (!element) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }
        if (element.tagName.toLowerCase() === newTag) return;
        if (['BODY', 'HTML', 'HEAD'].includes(element.tagName)) {
            this.showToast('이 요소의 태그는 변경할 수 없습니다.', 'error');
            return;
        }

        const doc = element.ownerDocument;
        const created = doc.createElement(newTag);

        Array.from(element.attributes).forEach(attr => {
            try {
                created.setAttribute(attr.name, attr.value);
            } catch (e) {}
        });
        while (element.firstChild) {
            created.appendChild(element.firstChild);
        }

        element.parentNode.replaceChild(created, element);

        this.clearMultiSelection();
        this.selectElement(created);
        this.saveToHistory(`태그 변경: ${newTag}`, true);
        this.showToast(`<${newTag}> 로 변경했습니다.`, 'success');
    },

    applyElementIdentity() {
        const element = this.getPrimaryTarget();
        if (!element) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        const classInput = document.getElementById('spClassInput');
        const idInput = document.getElementById('spIdInput');

        if (idInput) {
            const id = idInput.value.trim();
            if (id) {
                element.id = id;
            } else {
                element.removeAttribute('id');
            }
        }

        if (classInput) {
            // 에디터 내부 클래스(선택 표시 등)는 유지한 채 콘텐츠 클래스만 교체
            const editorClasses = this.getEditorClasses().filter(cls => element.classList.contains(cls));
            const next = classInput.value.trim().split(/\s+/).filter(Boolean);
            element.className = '';
            [...next, ...editorClasses].forEach(cls => element.classList.add(cls));
            if (!element.getAttribute('class')) element.removeAttribute('class');
        }

        this.saveToHistory('클래스/ID 변경', true);
        this.showToast('클래스/ID가 적용되었습니다.', 'success');
    },

    copyElementStyle() {
        const element = this.getPrimaryTarget();
        if (!element) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        this.copiedStyle = element.getAttribute('style') || '';
        this.showToast(this.copiedStyle ? '스타일을 복사했습니다.' : '이 요소에는 인라인 스타일이 없습니다.', this.copiedStyle ? 'success' : 'warning');
    },

    pasteElementStyle() {
        if (!this.copiedStyle) {
            this.showToast('먼저 스타일을 복사해주세요.', 'warning');
            return;
        }
        this.applyCssText(this.copiedStyle, '스타일 붙여넣기');
    },

    applyCssText(cssText, actionName = 'CSS 직접 적용') {
        const targets = this.getBatchTargets();
        if (targets.length === 0) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        const declarations = (cssText || '').split(';')
            .map(part => part.trim())
            .filter(Boolean)
            .map(part => {
                const index = part.indexOf(':');
                if (index === -1) return null;
                return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
            })
            .filter(Boolean);

        if (declarations.length === 0) {
            this.showToast('적용할 CSS 가 없습니다.', 'warning');
            return;
        }

        targets.forEach(el => {
            declarations.forEach(([name, value]) => {
                try {
                    el.style.setProperty(name, value);
                } catch (e) {}
            });
        });

        this.saveToHistory(actionName, true);
        this.loadCurrentStyles();
        this.showToast(`${declarations.length}개 속성을 적용했습니다.`, 'success');
    },

    clearInlineStyles() {
        const targets = this.getBatchTargets();
        if (targets.length === 0) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        targets.forEach(el => el.removeAttribute('style'));
        this.saveToHistory('인라인 스타일 초기화', true);
        this.loadCurrentStyles();
        this.showToast('인라인 스타일을 모두 지웠습니다.', 'success');
    },

    addElement(doc, tagName, textContent = '') {
        const newElement = doc.createElement(tagName);

        switch (tagName) {
            case 'button':
                newElement.textContent = textContent;
                newElement.style.padding = '8px 16px';
                newElement.style.margin = '4px';
                break;
            case 'li':
                newElement.textContent = textContent;
                break;
            case 'img': {
                // 외부 placeholder 서비스 대신 인라인 SVG 사용 (via.placeholder.com은 서비스 종료됨)
                const placeholderSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="100"><rect width="150" height="100" fill="#e2e8f0"/><rect x="0.5" y="0.5" width="149" height="99" fill="none" stroke="#94a3b8" stroke-dasharray="4 3"/><text x="75" y="55" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#64748b">150 × 100</text></svg>';
                newElement.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(placeholderSvg);
                newElement.alt = '새 이미지';
                newElement.style.maxWidth = '100%';
                break;
            }
            case 'a':
                newElement.textContent = textContent;
                newElement.href = '#';
                break;
        }

        if (this.selectedElement) {
            this.selectedElement.parentNode.insertBefore(newElement, this.selectedElement.nextSibling);
        } else {
            doc.body.appendChild(newElement);
        }

        if (textContent && ['button', 'li', 'a'].includes(tagName)) {
            this.makeElementEditable(newElement);
        }

        this.selectElement(newElement);
        this.saveToHistory(`${tagName} 요소 추가`, true);
    },

    duplicateElement() {
        const targets = this.getBatchTargets();
        if (targets.length === 0) return;

        let lastClone = null;
        targets.forEach(element => {
            if (!element.parentNode) return;

            const clone = element.cloneNode(true);
            element.parentNode.insertBefore(clone, element.nextSibling);

            clone.classList.remove('element-selected', 'element-multi-selected');
            clone.querySelectorAll('*').forEach(child => {
                child.classList.remove('element-selected', 'element-multi-selected');
            });
            // 클론에는 이벤트 리스너가 복사되지 않으므로 텍스트 편집 바인딩 재적용
            clone.querySelectorAll('.editable-text').forEach(span => this.bindEditableSpan(span));

            lastClone = clone;
        });

        if (!lastClone) return;

        if (targets.length > 1) {
            this.clearMultiSelection();
            this.saveToHistory(`요소 ${targets.length}개 복제`, true);
            this.showToast(`${targets.length}개 요소가 복제되었습니다.`, 'success');
        } else {
            this.selectElement(lastClone);
            this.saveToHistory(`${targets[0].tagName.toLowerCase()} 요소 복제`, true);
            this.showToast('요소가 복제되었습니다.', 'success');
        }
    },

    deleteElement() {
        const targets = this.getBatchTargets()
            .filter(el => !['html', 'head', 'body'].includes(el.tagName.toLowerCase()));

        if (targets.length === 0) {
            if (this.selectedElement) {
                this.showToast(`${this.selectedElement.tagName.toLowerCase()} 요소는 삭제할 수 없습니다.`, 'error');
            }
            return;
        }

        // 큰 컨테이너나 다중 삭제는 한 번만 확인
        const bigTarget = targets.find(el => el.children.length > 5);
        if (targets.length > 1 || bigTarget) {
            const message = targets.length > 1
                ? `선택된 ${targets.length}개 요소를 모두 삭제하시겠습니까?`
                : `이 ${bigTarget.tagName.toLowerCase()} 요소는 ${bigTarget.children.length}개의 자식 요소를 포함하고 있습니다. 정말 삭제하시겠습니까?`;
            if (!confirm(message)) return;
        }

        try {
            targets.forEach(element => {
                if (element.parentNode) element.parentNode.removeChild(element);
            });
            this.clearSelection();
            this.saveToHistory(targets.length > 1 ? `요소 ${targets.length}개 삭제` : `${targets[0].tagName.toLowerCase()} 요소 삭제`, true);
            this.showToast(targets.length > 1 ? `${targets.length}개 요소가 삭제되었습니다.` : '요소가 삭제되었습니다.', 'success');
        } catch (error) {
            console.error('삭제 중 오류:', error);
            this.showToast('요소 삭제 중 오류가 발생했습니다.', 'error');
        }
    },

    moveElement(element, direction) {
        const parent = element.parentNode;
        const siblings = Array.from(parent.children);
        const currentIndex = siblings.indexOf(element);

        if (direction === 'up' && currentIndex > 0) {
            parent.insertBefore(element, siblings[currentIndex - 1]);
        } else if (direction === 'down' && currentIndex < siblings.length - 1) {
            parent.insertBefore(element, siblings[currentIndex + 2]);
        }

        this.selectElement(element);
        this.saveToHistory(`요소 ${direction === 'up' ? '위로' : '아래로'} 이동`, true);
    },

    addTableRow(element, position) {
        const table = element.closest('table');
        if (!table) return;

        let targetRow = element.closest('tr');
        if (!targetRow) return;

        const colCount = targetRow.cells.length;
        const newRow = targetRow.cloneNode(false);

        for (let i = 0; i < colCount; i++) {
            const newCell = document.createElement(targetRow.cells[i].tagName.toLowerCase());
            newCell.textContent = '새 셀';
            this.makeElementEditable(newCell);
            newRow.appendChild(newCell);
        }

        if (position === 'above') {
            targetRow.parentNode.insertBefore(newRow, targetRow);
        } else {
            targetRow.parentNode.insertBefore(newRow, targetRow.nextSibling);
        }

        this.selectElement(newRow);
        this.saveToHistory(`테이블 행 ${position === 'above' ? '위에' : '아래에'} 추가`, true);
    },

    addTableColumn(element, position) {
        const table = element.closest('table');
        if (!table) return;

        let targetCell = element.closest('td, th');
        if (!targetCell) return;

        const cellIndex = Array.from(targetCell.parentNode.cells).indexOf(targetCell);
        const insertIndex = position === 'left' ? cellIndex : cellIndex + 1;

        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const newCell = document.createElement(row.cells[cellIndex] ? row.cells[cellIndex].tagName.toLowerCase() : 'td');
            newCell.textContent = '새 셀';
            this.makeElementEditable(newCell);

            if (insertIndex >= row.cells.length) {
                row.appendChild(newCell);
            } else {
                row.insertBefore(newCell, row.cells[insertIndex]);
            }
        });

        this.selectElement(element);
        this.saveToHistory(`테이블 열 ${position === 'left' ? '왼쪽에' : '오른쪽에'} 추가`, true);
    },

    deleteTableRow(element) {
        const row = element.closest('tr');
        if (!row) return;

        const table = row.closest('table');
        const rowCount = table.querySelectorAll('tr').length;

        if (rowCount <= 1) {
            this.showToast('마지막 행은 삭제할 수 없습니다.', 'error');
            return;
        }

        row.remove();
        this.clearSelection();
        this.saveToHistory('테이블 행 삭제', true);
    },

    deleteTableColumn(element) {
        const cell = element.closest('td, th');
        if (!cell) return;

        const table = cell.closest('table');
        const cellIndex = Array.from(cell.parentNode.cells).indexOf(cell);
        const colCount = table.querySelector('tr').cells.length;

        if (colCount <= 1) {
            this.showToast('마지막 열은 삭제할 수 없습니다.', 'error');
            return;
        }

        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            if (row.cells[cellIndex]) {
                row.cells[cellIndex].remove();
            }
        });

        this.clearSelection();
        this.saveToHistory('테이블 열 삭제', true);
    }
});
