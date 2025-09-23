class HTMLLiveEditor {
    constructor() {
        this.originalHTML = '';
        this.updateTimeout = null;
        this.selectedElement = null;
        this.isElementMode = true; // 기본적으로 요소편집 모드

        // 되돌리기/다시실행 시스템
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 20;
        this.historyTimeout = null;

        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.fileInput = document.getElementById('fileInput');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.fileName = document.getElementById('fileName');
        this.dropZone = document.getElementById('dropZone');
        this.uploadScreen = document.getElementById('uploadScreen');
        this.previewFrame = document.getElementById('previewFrame');
        this.downloadButton = document.getElementById('downloadButton');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.undoBtn = document.getElementById('undoBtn');
        this.redoBtn = document.getElementById('redoBtn');
        this.fileInfo = document.getElementById('fileInfo');
        this.modeIndicator = document.getElementById('modeIndicator');
        this.contextMenu = document.getElementById('contextMenu');
        this.tableContextMenu = document.getElementById('tableContextMenu');
        this.floatingToolbar = document.getElementById('floatingToolbar');
    }

    bindEvents() {
        this.uploadBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));

        this.downloadBtn.addEventListener('click', () => this.downloadHTML());
        this.undoBtn.addEventListener('click', () => this.undo());
        this.redoBtn.addEventListener('click', () => this.redo());

        // 컨텍스트 메뉴 이벤트
        this.contextMenu.addEventListener('click', (e) => this.handleContextMenuClick(e));
        this.tableContextMenu.addEventListener('click', (e) => this.handleTableContextMenuClick(e));
        this.floatingToolbar.addEventListener('click', (e) => this.handleToolbarClick(e));

        // 전역 클릭으로 메뉴 닫기
        document.addEventListener('click', (e) => this.hideContextualMenus(e));

        // 키보드 단축키
        document.addEventListener('keydown', (e) => this.handleKeydown(e));

        // 페이지 새로고침 방지
        window.addEventListener('beforeunload', (e) => {
            if (this.history.length > 1) { // 초기 상태 이후 변경사항이 있는 경우
                e.preventDefault();
                e.returnValue = '편집한 내용이 있습니다. 페이지를 떠나시겠습니까?';
                return e.returnValue;
            }
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        this.dropZone.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.dropZone.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        this.dropZone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.processFile(file);
        }
    }

    processFile(file) {
        if (!file.name.toLowerCase().endsWith('.html') && !file.name.toLowerCase().endsWith('.htm')) {
            alert('HTML 파일만 업로드할 수 있습니다.');
            return;
        }

        this.fileName.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.originalHTML = e.target.result;
            this.loadHTMLToEditor();
        };

        reader.onerror = () => {
            alert('파일을 읽는 중 오류가 발생했습니다.');
        };

        reader.readAsText(file, 'UTF-8');
    }

    loadHTMLToEditor() {
        this.uploadScreen.style.display = 'none';
        this.previewFrame.style.display = 'block';
        this.downloadButton.style.display = 'block';
        this.fileInfo.style.display = 'block';

        // 요소편집 모드는 기본 활성화
        this.modeIndicator.textContent = '🔧 요소편집';
        this.modeIndicator.style.color = '#007bff';

        this.renderHTML();
    }

    renderHTML() {
        const iframe = this.previewFrame;

        // iframe을 완전히 새로 로드
        iframe.src = 'about:blank';

        // iframe이 완전히 리셋된 후 새 내용 로드
        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;

                // 새로운 document에 HTML 작성
                doc.open();
                doc.write(this.originalHTML);
                doc.close();

                // iframe 로드 완료 대기 및 편집 가능하게 만들기
                this.waitForDocumentReady(doc, () => {
                    this.makeTextEditable(doc);
                    this.setupEditableListeners(doc);
                    this.setupElementSelection(doc);
                    // 초기 상태를 히스토리에 저장
                    this.saveToHistory('파일 로드', true);

                    // 디버깅을 위한 전역 접근 함수 추가
                    window.htmlEditor = this;
                    console.log('🎯 HTML Live Editor 로드 완료!');
                    console.log('디버깅: window.htmlEditor 로 에디터 접근 가능');
                    console.log('유용한 명령어:');
                    console.log('  - window.htmlEditor.selectedElement : 현재 선택된 요소');
                    console.log('  - window.htmlEditor.history : 히스토리 목록');
                    console.log('  - window.htmlEditor.showFixedPositionToolbar() : 고정 위치 툴바 표시');
                    console.log('  - window.htmlEditor.forceShowToolbar(element) : 특정 요소에 강제 툴바 표시');
                });
            } catch (error) {
                console.error('HTML 렌더링 중 오류:', error);
            } finally {
                // onload 이벤트 핸들러 제거 (일회성)
                iframe.onload = null;
            }
        };
    }

    // Document가 완전히 로드될 때까지 대기
    waitForDocumentReady(doc, callback) {
        const checkReady = () => {
            if (doc && doc.body && doc.head && doc.readyState === 'complete') {
                callback();
            } else {
                setTimeout(checkReady, 50);
            }
        };

        // 즉시 확인 후 준비되지 않았으면 재시도
        if (doc && doc.body && doc.head) {
            callback();
        } else {
            setTimeout(checkReady, 50);
        }
    }

    makeTextEditable(doc) {
        // 안전성 검사: doc와 필요한 요소들이 존재하는지 확인
        if (!doc || !doc.head || !doc.body) {
            console.error('makeTextEditable: 유효하지 않은 document 또는 누락된 요소:', {
                doc: !!doc,
                head: !!doc?.head,
                body: !!doc?.body
            });
            return;
        }

        // 편집 가능한 스타일 추가
        const style = doc.createElement('style');
        style.textContent = `
            .editable-text {
                position: relative;
                padding: 2px 4px;
                border-radius: 3px;
                transition: all 0.2s ease;
                cursor: text;
                min-height: 1em;
                display: inline-block;
                min-width: 10px;
            }
            .editable-text:hover {
                background-color: rgba(102, 126, 234, 0.1);
                outline: 1px dashed rgba(102, 126, 234, 0.3);
            }
            .editable-text:focus {
                background-color: rgba(102, 126, 234, 0.15);
                outline: 2px solid rgba(102, 126, 234, 0.5);
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            .editable-text.editing {
                background-color: rgba(102, 126, 234, 0.2);
                outline: 2px solid #667eea;
            }
        `;
        doc.head.appendChild(style);

        // 텍스트 노드를 편집 가능하게 변환
        this.processTextNodes(doc.body);
    }

    processTextNodes(element) {
        // 안전성 검사: element가 유효한지 확인
        if (!element || !element.ownerDocument) {
            console.error('processTextNodes: 유효하지 않은 element:', element);
            return;
        }

        const doc = element.ownerDocument;
        const walker = doc.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;

                    const tagName = parent.tagName.toLowerCase();
                    if (['script', 'style', 'meta', 'title', 'link'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    const text = node.textContent.trim();
                    if (text.length === 0) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        textNodes.forEach((textNode, index) => {
            const text = textNode.textContent;
            if (text.trim()) {
                const span = textNode.ownerDocument.createElement('span');
                span.className = 'editable-text';
                span.contentEditable = true;
                span.textContent = text;
                span.setAttribute('data-original', text);

                textNode.parentNode.replaceChild(span, textNode);
            }
        });
    }

    setupEditableListeners(doc) {
        if (!doc) {
            console.error('setupEditableListeners: 유효하지 않은 document');
            return;
        }

        const editableElements = doc.querySelectorAll('.editable-text');

        editableElements.forEach(element => {
            element.addEventListener('focus', () => {
                element.classList.add('editing');
            });

            element.addEventListener('blur', () => {
                element.classList.remove('editing');
            });

            element.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    element.blur();
                }
            });

            element.addEventListener('input', () => {
                // 텍스트 변경 시 디바운스된 히스토리 저장
                console.log('텍스트 변경됨:', element.textContent);
                this.saveToHistory('텍스트 편집', false);
            });
        });
    }

    // 되돌리기/다시실행 시스템
    saveToHistory(actionName, immediate = true) {
        // 기본적으로 즉시 저장으로 변경하여 안정성 향상
        if (!immediate) {
            clearTimeout(this.historyTimeout);
            this.historyTimeout = setTimeout(() => {
                this.doSaveToHistory(actionName);
            }, 200); // 디바운스 시간 단축
        } else {
            this.doSaveToHistory(actionName);
        }
    }

    doSaveToHistory(actionName) {
        const iframe = this.previewFrame;
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        // 선택된 요소의 식별자 저장 (CSS 선택자 형태로)
        let selectedElementSelector = null;
        if (this.selectedElement) {
            selectedElementSelector = this.getElementSelector(this.selectedElement);
            console.log('히스토리 저장 - 선택된 요소 선택자:', selectedElementSelector);
        } else {
            console.log('히스토리 저장 - 선택된 요소 없음');
        }

        // 현재 DOM 상태 저장
        const snapshot = {
            html: doc.documentElement.outerHTML,
            action: actionName,
            timestamp: Date.now(),
            selectedElementSelector: selectedElementSelector
        };

        // 현재 위치 이후의 히스토리 삭제 (새 브랜치 생성)
        this.history = this.history.slice(0, this.historyIndex + 1);

        // 새 스냅샷 추가
        this.history.push(snapshot);
        this.historyIndex = this.history.length - 1;

        // 최대 크기 초과 시 오래된 항목 제거
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.historyIndex--;
        }

        this.updateHistoryButtons();
        console.log(`히스토리 저장: ${actionName} (${this.historyIndex + 1}/${this.history.length})`);
    }

    // 요소의 고유한 CSS 선택자 생성 (개선된 버전)
    getElementSelector(element) {
        if (!element || !element.parentNode) return null;

        const doc = element.ownerDocument;

        // 요소에 ID가 있으면 ID 사용
        if (element.id) {
            return `#${element.id}`;
        }

        // 다양한 방식으로 선택자 생성 시도
        const selectors = [];

        // 방법 1: 클래스명 기반 선택자
        if (element.className) {
            const classSelector = this.generateClassBasedSelector(element);
            if (classSelector) selectors.push(classSelector);
        }

        // 방법 2: 텍스트 내용 기반 선택자 (고유한 텍스트인 경우)
        const textSelector = this.generateTextBasedSelector(element);
        if (textSelector) selectors.push(textSelector);

        // 방법 3: 속성 기반 선택자
        const attrSelector = this.generateAttributeBasedSelector(element);
        if (attrSelector) selectors.push(attrSelector);

        // 방법 4: 기존 방식 (태그 + nth-of-type)
        const pathSelector = this.generatePathBasedSelector(element);
        if (pathSelector) selectors.push(pathSelector);

        // 각 선택자의 유효성 검증 및 반환
        for (const selector of selectors) {
            try {
                const found = doc.querySelector(selector);
                if (found === element) {
                    console.log('선택자 생성 성공:', selector);
                    return selector;
                }
            } catch (e) {
                console.warn('유효하지 않은 선택자:', selector, e);
            }
        }

        console.warn('선택자 생성 실패:', element);
        return pathSelector; // 최후의 수단
    }

    // 클래스 기반 선택자 생성
    generateClassBasedSelector(element) {
        if (!element.className) return null;

        const classes = Array.from(element.classList)
            .filter(cls => !cls.startsWith('element-') && !cls.startsWith('editable-'));

        if (classes.length === 0) return null;

        return element.tagName.toLowerCase() + '.' + classes.join('.');
    }

    // 텍스트 기반 선택자 생성
    generateTextBasedSelector(element) {
        const text = element.textContent.trim();
        if (text.length < 3 || text.length > 50) return null;

        // 특수 문자 이스케이프
        const escapedText = text.replace(/['"\\]/g, '\\$&');
        const doc = element.ownerDocument;

        // 동일한 텍스트를 가진 요소가 유일한지 확인
        const selector = `${element.tagName.toLowerCase()}[textContent="${escapedText}"]`;
        try {
            const matches = doc.querySelectorAll(element.tagName.toLowerCase());
            const uniqueMatch = Array.from(matches).filter(el => el.textContent.trim() === text);
            if (uniqueMatch.length === 1) {
                return selector;
            }
        } catch (e) {
            return null;
        }

        return null;
    }

    // 속성 기반 선택자 생성
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
    }

    // 경로 기반 선택자 생성 (기존 방식)
    generatePathBasedSelector(element) {
        const doc = element.ownerDocument;
        const path = [];
        let current = element;

        while (current && current !== doc.body && current.parentNode) {
            let selector = current.tagName.toLowerCase();

            // 같은 태그의 형제 요소들 중 몇 번째인지 계산
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
    }

    // 요소 복원을 위한 강력한 대기 함수
    waitForElementRestoration(doc, selector) {
        if (!selector || !doc) return;

        let attempts = 0;
        const maxAttempts = 10; // 최대 2초 대기 (200ms * 10)

        const tryRestore = () => {
            attempts++;
            console.log(`선택 복원 시도 ${attempts}/${maxAttempts}:`, selector);

            try {
                const element = doc.querySelector(selector);
                if (element) {
                    // 요소를 찾았지만 렌더링이 완료되었는지 확인
                    const rect = element.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        // 요소가 완전히 렌더링됨
                        setTimeout(() => {
                            this.restoreElementSelection(doc, selector);
                        }, 100); // 추가 100ms 대기 후 선택
                        return;
                    }
                }

                // 요소를 찾지 못했거나 아직 렌더링되지 않음
                if (attempts < maxAttempts) {
                    setTimeout(tryRestore, 200);
                } else {
                    console.warn('선택 복원 최종 실패:', selector);
                }
            } catch (error) {
                console.error('선택 복원 시도 중 오류:', error);
                if (attempts < maxAttempts) {
                    setTimeout(tryRestore, 200);
                }
            }
        };

        // 첫 번째 시도
        setTimeout(tryRestore, 200);
    }

    // 저장된 선택자로 요소 선택 복원
    restoreElementSelection(doc, selector) {
        if (!selector || !doc) return;

        try {
            // CSS 선택자로 요소 찾기
            const element = doc.querySelector(selector);
            if (element) {
                console.log('선택 복원 성공 - 요소 선택 중:', selector);
                // 요소 선택 및 툴바 표시
                this.selectElement(element);
                console.log('선택 상태 복원 완료:', selector);
            } else {
                console.log('선택 복원 실패: 요소를 찾을 수 없음:', selector);
            }
        } catch (error) {
            console.error('선택 복원 중 오류:', error, 'selector:', selector);
        }
    }

    // 모든 DOM 참조 완전 정리 (히스토리 복원 전)
    clearAllDOMReferences() {
        console.log('DOM 참조 정리 중...');

        // 1. 선택된 요소 참조 정리
        if (this.selectedElement) {
            // 안전하게 클래스 제거 시도
            try {
                this.selectedElement.classList.remove('element-selected');
            } catch (e) {
                console.log('이전 요소 클래스 제거 실패 (정상):', e);
            }
            this.selectedElement = null;
        }

        // 2. 컨텍스트 메뉴 타겟 참조 정리
        this.contextMenuTarget = null;

        // 3. 모든 UI 요소 숨기기
        this.hideFloatingToolbar();
        this.hideContextualMenus();

        // 4. 기타 상태 초기화
        console.log('DOM 참조 정리 완료');
    }


    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            console.log(`🔄 되돌리기 시작: ${this.history[this.historyIndex].action} (${this.historyIndex + 1}/${this.history.length})`);
            console.log('복원할 선택자:', this.history[this.historyIndex].selectedElementSelector);
            this.restoreFromHistory();
        } else {
            console.log('되돌리기: 더 이상 되돌릴 수 없음');
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            console.log(`🔄 다시실행 시작: ${this.history[this.historyIndex].action} (${this.historyIndex + 1}/${this.history.length})`);
            console.log('복원할 선택자:', this.history[this.historyIndex].selectedElementSelector);
            this.restoreFromHistory();
        } else {
            console.log('다시실행: 더 이상 다시실행할 수 없음');
        }
    }

    async restoreFromHistory() {
        if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
            const snapshot = this.history[this.historyIndex];
            const iframe = this.previewFrame;

            try {
                // 1단계: 모든 이전 DOM 참조 완전 정리
                console.log('🧹 1단계: DOM 참조 정리');
                this.clearAllDOMReferences();

                // 2단계: iframe 리셋 및 로드
                console.log('🔄 2단계: iframe 리셋 및 로드');
                const doc = await this.resetAndLoadIframe(iframe, snapshot.html);

                // 3단계: 이벤트 리스너 설정
                console.log('⚙️ 3단계: 이벤트 리스너 설정');
                await this.setupAllEventListeners(doc);

                // 4단계: 툴바 복원
                console.log('🎯 4단계: 툴바 복원');
                await this.restoreToolbarWithRetry(doc, snapshot.selectedElementSelector);

                // 5단계: 최종 정리
                console.log('✅ 히스토리 복원 완료');
                this.hideContextualMenus();
                this.updateHistoryButtons();

            } catch (error) {
                console.error('❌ 히스토리 복원 실패:', error);
                this.updateHistoryButtons();
            }
        }
    }

    // iframe 리셋 및 HTML 로드 (Promise 기반)
    resetAndLoadIframe(iframe, html) {
        return new Promise((resolve, reject) => {
            iframe.src = 'about:blank';

            iframe.onload = () => {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;

                    // HTML 작성
                    doc.open();
                    doc.write(html);
                    doc.close();

                    // DOM이 완전히 준비될 때까지 대기
                    this.waitForDocumentReady(doc, () => {
                        iframe.onload = null; // 이벤트 핸들러 제거
                        resolve(doc);
                    });
                } catch (error) {
                    iframe.onload = null;
                    reject(error);
                }
            };

            // 타임아웃 설정 (5초)
            setTimeout(() => {
                iframe.onload = null;
                reject(new Error('iframe 로드 타임아웃'));
            }, 5000);
        });
    }

    // 모든 이벤트 리스너 설정 (Promise 기반)
    setupAllEventListeners(doc) {
        return new Promise((resolve) => {
            try {
                this.makeTextEditable(doc);
                this.setupEditableListeners(doc);
                this.setupElementSelection(doc);

                // 이벤트 리스너 설정 완료 후 약간의 지연
                setTimeout(() => {
                    console.log('이벤트 리스너 설정 완료');
                    resolve();
                }, 100);
            } catch (error) {
                console.error('이벤트 리스너 설정 오류:', error);
                resolve(); // 오류가 있어도 계속 진행
            }
        });
    }

    // 재시도 로직이 포함된 툴바 복원 (Promise 기반)
    restoreToolbarWithRetry(doc, originalSelector) {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 3;

            const attemptRestore = () => {
                attempts++;
                console.log(`툴바 복원 시도 ${attempts}/${maxAttempts}`);

                const success = this.attemptToolbarRestore(doc, originalSelector);

                if (success || attempts >= maxAttempts) {
                    console.log(success ? '툴바 복원 성공' : '툴바 복원 최종 실패 (계속 진행)');
                    resolve();
                } else {
                    // 500ms 후 재시도
                    setTimeout(attemptRestore, 500);
                }
            };

            // 첫 시도 전 300ms 대기 (DOM 안정화)
            setTimeout(attemptRestore, 300);
        });
    }

    // 다단계 백업을 포함한 툴바 복원 시도
    attemptToolbarRestore(doc, originalSelector) {
        console.log('📍 툴바 복원 시도 시작:', originalSelector);

        // 방법 1: CSS 선택자로 정확한 요소 찾기
        let selectedElement = this.findElementBySelector(doc, originalSelector);
        if (selectedElement) {
            console.log('✅ 방법 1 성공: CSS 선택자');
            this.selectElement(selectedElement);
            return true;
        }

        // 방법 2: 텍스트 기반 매칭
        selectedElement = this.findElementByText(doc, originalSelector);
        if (selectedElement) {
            console.log('✅ 방법 2 성공: 텍스트 매칭');
            this.selectElement(selectedElement);
            return true;
        }

        // 방법 3: 위치 기반 선택 (첫 번째로 보이는 요소)
        selectedElement = this.findFirstVisibleElement(doc);
        if (selectedElement) {
            console.log('✅ 방법 3 성공: 첫 번째 보이는 요소');
            this.selectElement(selectedElement);
            return true;
        }

        // 방법 4: 타입별 우선순위 선택
        selectedElement = this.findElementByPriority(doc);
        if (selectedElement) {
            console.log('✅ 방법 4 성공: 우선순위 요소');
            this.selectElement(selectedElement);
            return true;
        }

        // 방법 5: 최후 수단 - 아무 요소라도
        selectedElement = this.findAnyElement(doc);
        if (selectedElement) {
            console.log('⚠️ 방법 5 성공: 아무 요소');
            this.selectElement(selectedElement);
            return true;
        }

        console.log('❌ 모든 방법 실패');
        return false;
    }

    // CSS 선택자로 요소 찾기
    findElementBySelector(doc, selector) {
        if (!selector) return null;

        try {
            const element = doc.querySelector(selector);
            if (element && this.isElementVisible(element)) {
                return element;
            }
        } catch (e) {
            console.log('CSS 선택자 오류:', e);
        }
        return null;
    }

    // 텍스트 기반으로 요소 찾기
    findElementByText(doc, originalSelector) {
        if (!originalSelector) return null;

        // 원래 선택자에서 텍스트 추출 시도
        try {
            const tempElement = doc.querySelector(originalSelector);
            if (tempElement) {
                const targetText = tempElement.textContent.trim();
                if (targetText) {
                    // 같은 텍스트를 가진 요소 찾기
                    const candidates = doc.querySelectorAll('*');
                    for (let element of candidates) {
                        if (element.textContent.trim() === targetText && this.isElementVisible(element)) {
                            return element;
                        }
                    }
                }
            }
        } catch (e) {
            console.log('텍스트 매칭 오류:', e);
        }
        return null;
    }

    // 첫 번째로 보이는 요소 찾기
    findFirstVisibleElement(doc) {
        const candidates = doc.querySelectorAll('button, h1, h2, h3, p, li, a, div, span');

        for (let element of candidates) {
            if (this.isElementVisible(element) && element.textContent.trim()) {
                return element;
            }
        }
        return null;
    }

    // 우선순위에 따른 요소 찾기
    findElementByPriority(doc) {
        const prioritySelectors = [
            'button',
            'h1, h2, h3, h4, h5, h6',
            'p',
            'li',
            'a',
            'div',
            'span'
        ];

        for (const selector of prioritySelectors) {
            const elements = doc.querySelectorAll(selector);
            for (let element of elements) {
                if (this.isElementVisible(element) && element.textContent.trim()) {
                    return element;
                }
            }
        }
        return null;
    }

    // 아무 요소라도 찾기 (최후 수단)
    findAnyElement(doc) {
        const allElements = doc.querySelectorAll('*');
        for (let element of allElements) {
            if (this.isElementVisible(element)) {
                return element;
            }
        }
        return null;
    }

    // 요소가 보이는지 확인
    isElementVisible(element) {
        if (!element) return false;

        try {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        } catch (e) {
            return false;
        }
    }

    updateHistoryButtons() {
        this.undoBtn.disabled = this.historyIndex <= 0;
        this.redoBtn.disabled = this.historyIndex >= this.history.length - 1;

        // 툴팁 업데이트
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
    }

    handleKeydown(event) {
        // Ctrl+Z: 되돌리기
        if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
            event.preventDefault();
            this.undo();
        }
        // Ctrl+Y 또는 Ctrl+Shift+Z: 다시실행
        else if (event.ctrlKey && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
            event.preventDefault();
            this.redo();
        }
    }

    setupElementSelection(doc) {
        console.log('⚙️ 이벤트 리스너 설정 시작');

        // 요소 모드가 아닐 때는 설정하지 않음
        if (!this.isElementMode) {
            console.log('요소 모드가 아님 - 이벤트 리스너 설정 건너뜀');
            return;
        }

        if (!doc || !doc.body) {
            console.error('setupElementSelection: 유효하지 않은 document 또는 body');
            return;
        }

        try {
            // 1단계: 기존 이벤트 리스너 완전 제거
            this.cleanupExistingEventListeners(doc);

            // 2단계: 효율적인 이벤트 위임 설정
            this.setupEventDelegation(doc);

            console.log('✅ 이벤트 리스너 설정 완료');

        } catch (error) {
            console.error('이벤트 리스너 설정 중 오류:', error);
        }
    }

    // 기존 이벤트 리스너 완전 제거
    cleanupExistingEventListeners(doc) {
        console.log('🧹 기존 이벤트 리스너 정리 중...');

        try {
            // 기존 이벤트 위임 리스너 제거
            if (doc.body && this.currentEventListeners) {
                this.currentEventListeners.forEach(({ event, handler }) => {
                    doc.body.removeEventListener(event, handler, true);
                });
            }

            // 개별 요소의 에디터 마크 제거
            const markedElements = doc.querySelectorAll('[data-editor-initialized]');
            markedElements.forEach(element => {
                element.removeAttribute('data-editor-initialized');
                element.classList.remove('element-hover', 'element-selected');
            });

            // 리스너 배열 초기화
            this.currentEventListeners = [];

            console.log(`정리된 요소 수: ${markedElements.length}`);

        } catch (error) {
            console.error('이벤트 리스너 정리 중 오류:', error);
        }
    }

    // 효율적인 이벤트 위임 설정
    setupEventDelegation(doc) {
        console.log('📡 이벤트 위임 설정 중...');

        // 이벤트 리스너 저장 배열 초기화
        this.currentEventListeners = [];

        // 마우스 진입 이벤트 (버블링 단계)
        const mouseenterHandler = (e) => {
            if (!this.isElementMode) return;

            const target = this.findEditableTarget(e.target);
            if (target && !this.selectedElement) {
                target.classList.add('element-hover');
            }
        };

        // 마우스 나가기 이벤트 (버블링 단계)
        const mouseleaveHandler = (e) => {
            if (!this.isElementMode) return;

            const target = this.findEditableTarget(e.target);
            if (target) {
                target.classList.remove('element-hover');
            }
        };

        // 클릭 이벤트 (캡처 단계)
        const clickHandler = (e) => {
            if (!this.isElementMode) return;

            const target = this.findEditableTarget(e.target);
            if (target) {
                e.preventDefault();
                e.stopPropagation();
                this.selectElement(target);
            }
        };

        // 컨텍스트 메뉴 이벤트 (캡처 단계)
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

        // 이벤트 리스너 등록 (body에 위임)
        try {
            doc.body.addEventListener('mouseenter', mouseenterHandler, true);
            doc.body.addEventListener('mouseleave', mouseleaveHandler, true);
            doc.body.addEventListener('click', clickHandler, true);
            doc.body.addEventListener('contextmenu', contextmenuHandler, true);

            // 나중에 제거할 수 있도록 저장
            this.currentEventListeners = [
                { event: 'mouseenter', handler: mouseenterHandler },
                { event: 'mouseleave', handler: mouseleaveHandler },
                { event: 'click', handler: clickHandler },
                { event: 'contextmenu', handler: contextmenuHandler }
            ];

            console.log('이벤트 위임 등록 완료');

        } catch (error) {
            console.error('이벤트 위임 등록 실패:', error);
        }
    }

    // 편집 가능한 타겟 요소 찾기
    findEditableTarget(element) {
        if (!element || !element.tagName) return null;

        // 제외할 요소들
        const excludedTags = ['html', 'head', 'body', 'script', 'style', 'meta', 'link'];
        const excludedClasses = ['editable-text'];

        // 현재 요소부터 상위로 탐색
        let current = element;
        let attempts = 0;
        const maxAttempts = 10; // 무한 루프 방지

        while (current && current.tagName && attempts < maxAttempts) {
            const tagName = current.tagName.toLowerCase();

            // 제외 조건 확인
            if (excludedTags.includes(tagName)) {
                return null;
            }

            // 편집 불가능한 클래스 확인
            let hasExcludedClass = false;
            for (const className of excludedClasses) {
                if (current.classList && current.classList.contains(className)) {
                    hasExcludedClass = true;
                    break;
                }
            }

            if (!hasExcludedClass) {
                // 유효한 편집 대상인지 확인
                if (this.isValidEditTarget(current)) {
                    return current;
                }
            }

            current = current.parentElement;
            attempts++;
        }

        return null;
    }

    // 유효한 편집 대상인지 확인
    isValidEditTarget(element) {
        if (!element || !element.tagName) return false;

        try {
            // 화면에 보이는 요소인지 확인
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                return false;
            }

            // 편집 가능한 요소 타입인지 확인
            const editableTags = [
                'div', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'button', 'a', 'li', 'ul', 'ol', 'table', 'tr', 'td', 'th',
                'img', 'section', 'article', 'header', 'footer', 'nav'
            ];

            const tagName = element.tagName.toLowerCase();
            return editableTags.includes(tagName);

        } catch (error) {
            console.warn('편집 대상 검증 중 오류:', error);
            return false;
        }
    }

    // 테이블 요소 확인 함수
    isTableElement(element) {
        const tagName = element.tagName.toLowerCase();
        return ['table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot'].includes(tagName) ||
               element.closest('table') !== null;
    }

    // 테이블 전용 컨텍스트 메뉴 표시
    showTableContextMenu(event, element) {
        this.contextMenuTarget = element;
        this.tableContextMenu.style.display = 'block';
        this.tableContextMenu.style.left = event.pageX + 'px';
        this.tableContextMenu.style.top = event.pageY + 'px';
        this.contextMenu.style.display = 'none';
    }

    // 테이블 컨텍스트 메뉴 클릭 처리
    handleTableContextMenuClick(event) {
        const action = event.target.getAttribute('data-action');
        const element = this.contextMenuTarget;

        if (!action || !element) return;

        this.hideContextualMenus();

        // 클릭된 요소를 먼저 선택 (테이블 요소인 경우)
        this.selectElement(element);

        switch (action) {
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
    }

    // 테이블 행 추가
    addTableRow(element, position) {
        const table = element.closest('table');
        if (!table) return;

        let targetRow = element.closest('tr');
        if (!targetRow) return;

        const colCount = targetRow.cells.length;
        const newRow = targetRow.cloneNode(false);

        // 새 셀들 생성
        for (let i = 0; i < colCount; i++) {
            const newCell = document.createElement(targetRow.cells[i].tagName.toLowerCase());
            newCell.textContent = '새 셀';
            this.makeElementEditable(newCell);
            this.setupElementEventListeners(newCell);
            newRow.appendChild(newCell);
        }

        if (position === 'above') {
            targetRow.parentNode.insertBefore(newRow, targetRow);
        } else {
            targetRow.parentNode.insertBefore(newRow, targetRow.nextSibling);
        }

        // 새로 추가된 행을 선택하여 툴바 유지
        this.selectElement(newRow);
        this.saveToHistory(`테이블 행 ${position === 'above' ? '위에' : '아래에'} 추가`, true);
    }

    // 테이블 열 추가
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
            this.setupElementEventListeners(newCell);

            if (insertIndex >= row.cells.length) {
                row.appendChild(newCell);
            } else {
                row.insertBefore(newCell, row.cells[insertIndex]);
            }
        });

        // 원래 선택된 요소를 다시 선택하여 툴바 유지
        this.selectElement(element);
        this.saveToHistory(`테이블 열 ${position === 'left' ? '왼쪽에' : '오른쪽에'} 추가`, true);
    }

    // 테이블 행 삭제
    deleteTableRow(element) {
        const row = element.closest('tr');
        if (!row) return;

        const table = row.closest('table');
        const rowCount = table.querySelectorAll('tr').length;

        if (rowCount <= 1) {
            alert('마지막 행은 삭제할 수 없습니다.');
            return;
        }

        row.remove();
        // 행 삭제 시에만 선택 해제 (요소가 삭제되었으므로)
        this.clearSelection();
        this.saveToHistory('테이블 행 삭제', true);
    }

    // 테이블 열 삭제
    deleteTableColumn(element) {
        const cell = element.closest('td, th');
        if (!cell) return;

        const table = cell.closest('table');
        const cellIndex = Array.from(cell.parentNode.cells).indexOf(cell);
        const colCount = table.querySelector('tr').cells.length;

        if (colCount <= 1) {
            alert('마지막 열은 삭제할 수 없습니다.');
            return;
        }

        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            if (row.cells[cellIndex]) {
                row.cells[cellIndex].remove();
            }
        });

        // 열 삭제 시에만 선택 해제 (요소가 삭제되었으므로)
        this.clearSelection();
        this.saveToHistory('테이블 열 삭제', true);
    }

    // 요소를 편집 가능하게 만들기
    makeElementEditable(element) {
        if (element.textContent.trim()) {
            const span = element.ownerDocument.createElement('span');
            span.className = 'editable-text';
            span.contentEditable = true;
            span.textContent = element.textContent;
            element.textContent = '';
            element.appendChild(span);
        }
    }

    toggleElementMode() {
        this.isElementMode = !this.isElementMode;

        if (this.isElementMode) {
            this.elementModeBtn.classList.add('active');
            this.modeIndicator.textContent = '🔧 요소편집';
            this.modeIndicator.style.color = '#007bff';
        } else {
            this.elementModeBtn.classList.remove('active');
            this.modeIndicator.textContent = '📝 텍스트편집';
            this.modeIndicator.style.color = '#28a745';
            this.clearSelection();
        }

        // iframe 다시 설정
        const iframe = this.previewFrame;
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        this.setupElementSelection(doc);
    }

    selectElement(element) {
        // 이전 선택된 요소가 있으면 클래스만 제거 (툴바는 숨기지 않음)
        if (this.selectedElement && this.selectedElement !== element) {
            this.selectedElement.classList.remove('element-selected');
        }

        // 새 요소 선택
        this.selectedElement = element;
        element.classList.add('element-selected');
        element.classList.remove('element-hover');

        // 플로팅 툴바 표시
        this.showFloatingToolbar(element);
    }

    clearSelection() {
        if (this.selectedElement) {
            this.selectedElement.classList.remove('element-selected');
            this.selectedElement = null;
        }
        this.hideFloatingToolbar();
    }

    showContextMenu(event, element) {
        this.contextMenuTarget = element;
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = event.clientX + 'px';
        this.contextMenu.style.top = event.clientY + 'px';
        // 다른 메뉴들 숨기기
        this.tableContextMenu.style.display = 'none';
    }

    showFloatingToolbar(element) {
        console.log('🎯 툴바 표시 시작');

        // 1단계: 기본 유효성 검사
        if (!this.validateToolbarRequirements(element)) {
            return;
        }

        // 2단계: 안전한 좌표 계산
        const coordinates = this.calculateSafeToolbarPosition(element);
        if (!coordinates) {
            console.warn('좌표 계산 실패 - 기본 위치 사용');
            this.showToolbarAtDefaultPosition();
            return;
        }

        // 3단계: 툴바 표시
        this.displayToolbarAtPosition(coordinates);
        console.log('✅ 툴바 표시 완료');
    }

    // 툴바 표시 요구사항 검증
    validateToolbarRequirements(element) {
        // 요소 유효성 검사
        if (!element) {
            console.warn('showFloatingToolbar: 요소가 없습니다');
            return false;
        }

        // 요소가 DOM에 연결되어 있는지 확인
        if (!element.isConnected) {
            console.warn('showFloatingToolbar: 요소가 DOM에 연결되어 있지 않습니다');
            return false;
        }

        // iframe 유효성 검사
        const iframe = this.previewFrame;
        if (!iframe) {
            console.warn('showFloatingToolbar: iframe이 없습니다');
            return false;
        }

        // iframe document 유효성 검사
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc || !doc.body) {
                console.warn('showFloatingToolbar: iframe document가 준비되지 않음');
                return false;
            }
        } catch (e) {
            console.warn('showFloatingToolbar: iframe 접근 불가:', e);
            return false;
        }

        // 툴바 DOM 요소 유효성 검사
        if (!this.floatingToolbar) {
            console.warn('showFloatingToolbar: 툴바 요소가 없습니다');
            return false;
        }

        return true;
    }

    // 안전한 툴바 위치 계산
    calculateSafeToolbarPosition(element) {
        try {
            const iframe = this.previewFrame;

            // iframe 위치 가져오기
            let iframeRect;
            try {
                iframeRect = iframe.getBoundingClientRect();
                if (!iframeRect || iframeRect.width === 0 || iframeRect.height === 0) {
                    console.warn('iframe이 화면에 보이지 않음');
                    return null;
                }
            } catch (e) {
                console.error('iframe 위치 계산 실패:', e);
                return null;
            }

            // 요소 위치 가져오기
            let elementRect;
            try {
                elementRect = element.getBoundingClientRect();
                if (!elementRect || elementRect.width === 0 || elementRect.height === 0) {
                    console.warn('요소가 화면에 보이지 않음');
                    return null;
                }
            } catch (e) {
                console.error('요소 위치 계산 실패:', e);
                return null;
            }

            // 툴바 위치 계산
            const toolbarWidth = 200;
            const toolbarHeight = 45;
            const margin = 10;

            let toolbarLeft = iframeRect.left + elementRect.left;
            let toolbarTop = iframeRect.top + elementRect.top - toolbarHeight - margin;

            // 화면 경계 조정
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            // 좌우 경계 체크
            if (toolbarLeft < margin) {
                toolbarLeft = margin;
            } else if (toolbarLeft + toolbarWidth > screenWidth - margin) {
                toolbarLeft = screenWidth - toolbarWidth - margin;
            }

            // 상하 경계 체크
            if (toolbarTop < margin) {
                // 위쪽에 공간이 없으면 요소 아래쪽에 배치
                toolbarTop = iframeRect.top + elementRect.top + elementRect.height + margin;

                // 아래쪽에도 공간이 없으면 화면 내 최적 위치
                if (toolbarTop + toolbarHeight > screenHeight - margin) {
                    toolbarTop = Math.max(margin, screenHeight - toolbarHeight - margin);
                }
            }

            return {
                left: Math.round(toolbarLeft),
                top: Math.round(toolbarTop),
                elementInfo: {
                    left: elementRect.left,
                    top: elementRect.top,
                    width: elementRect.width,
                    height: elementRect.height
                }
            };

        } catch (error) {
            console.error('좌표 계산 중 오류:', error);
            return null;
        }
    }

    // 계산된 위치에 툴바 표시
    displayToolbarAtPosition(coordinates) {
        try {
            this.floatingToolbar.style.display = 'flex';
            this.floatingToolbar.style.position = 'fixed';
            this.floatingToolbar.style.left = coordinates.left + 'px';
            this.floatingToolbar.style.top = coordinates.top + 'px';
            this.floatingToolbar.style.zIndex = '10000';

            console.log('툴바 위치:', coordinates);
        } catch (error) {
            console.error('툴바 표시 오류:', error);
            this.showToolbarAtDefaultPosition();
        }
    }

    // 기본 위치에 툴바 표시 (최후 수단)
    showToolbarAtDefaultPosition() {
        try {
            console.log('기본 위치에 툴바 표시');
            this.floatingToolbar.style.display = 'flex';
            this.floatingToolbar.style.position = 'fixed';
            this.floatingToolbar.style.left = '50px';
            this.floatingToolbar.style.top = '100px';
            this.floatingToolbar.style.zIndex = '10000';
        } catch (error) {
            console.error('기본 툴바 표시 실패:', error);
        }
    }

    hideFloatingToolbar() {
        this.floatingToolbar.style.display = 'none';
    }

    hideContextualMenus(event) {
        // 인수가 없으면 모든 메뉴 강제로 숨기기 (메뉴 클릭 시)
        if (!event) {
            this.contextMenu.style.display = 'none';
            this.tableContextMenu.style.display = 'none';
            return;
        }

        // 이벤트가 있으면 각 메뉴 영역 외부 클릭 시에만 숨기기
        if (!this.contextMenu.contains(event.target)) {
            this.contextMenu.style.display = 'none';
        }
        if (!this.tableContextMenu.contains(event.target)) {
            this.tableContextMenu.style.display = 'none';
        }
        // 툴바 영역이나 선택된 요소 영역 외부 클릭 시에도 선택 상태 유지
        // (자연스러운 편집 경험을 위해 선택 해제를 최소화)
    }

    handleContextMenuClick(event) {
        const action = event.target.getAttribute('data-action');
        const element = this.contextMenuTarget;

        if (!action || !element) return;

        const iframe = this.previewFrame;
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        this.hideContextualMenus();

        // 클릭된 요소를 먼저 선택
        this.selectElement(element);

        switch (action) {
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
            case 'duplicate':
                this.duplicateElement();
                break;
            case 'delete':
                this.deleteElement();
                break;
        }
    }

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
            case 'duplicate':
                this.duplicateElement();
                break;
            case 'delete':
                this.deleteElement();
                break;
        }
    }

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
            case 'img':
                newElement.src = 'https://via.placeholder.com/150x100';
                newElement.alt = '새 이미지';
                newElement.style.maxWidth = '100%';
                break;
            case 'a':
                newElement.textContent = textContent;
                newElement.href = '#';
                break;
        }

        // 선택된 요소 다음에 추가하거나 body 끝에 추가
        if (this.selectedElement) {
            this.selectedElement.parentNode.insertBefore(newElement, this.selectedElement.nextSibling);
        } else {
            doc.body.appendChild(newElement);
        }

        // 텍스트 요소인 경우 편집 가능하게 만들기
        if (textContent && ['button', 'li', 'a'].includes(tagName)) {
            this.makeElementEditable(newElement);
        }

        // 새 요소에 이벤트 리스너 설정
        this.setupElementEventListeners(newElement);

        // 새 요소 선택
        this.selectElement(newElement);
        this.saveToHistory(`${tagName} 요소 추가`, true);
        console.log(`${tagName} 요소가 추가되었습니다.`);
    }

    // 단일 요소에 이벤트 리스너 설정
    setupElementEventListeners(element) {
        if (!element || element.hasAttribute('data-editor-initialized')) return;

        element.setAttribute('data-editor-initialized', 'true');

        element.addEventListener('mouseenter', (e) => {
            if (this.isElementMode && !this.selectedElement) {
                e.stopPropagation();
                element.classList.add('element-hover');
            }
        });

        element.addEventListener('mouseleave', (e) => {
            if (this.isElementMode) {
                e.stopPropagation();
                element.classList.remove('element-hover');
            }
        });

        element.addEventListener('click', (e) => {
            if (this.isElementMode) {
                e.preventDefault();
                e.stopPropagation();
                this.selectElement(element);
            }
        });

        element.addEventListener('contextmenu', (e) => {
            if (this.isElementMode) {
                e.preventDefault();
                e.stopPropagation();

                if (this.isTableElement(element)) {
                    this.showTableContextMenu(e, element);
                } else {
                    this.showContextMenu(e, element);
                }
            }
        });
    }

    duplicateElement() {
        if (!this.selectedElement) return;

        const element = this.selectedElement;
        const tagName = element.tagName.toLowerCase();

        console.log(`복제 시작: ${tagName} 요소`);

        const clone = element.cloneNode(true);
        element.parentNode.insertBefore(clone, element.nextSibling);

        // 복제된 요소에 이벤트 리스너 설정
        this.setupElementEventListeners(clone);

        // 복제된 요소 내의 모든 자식 요소에도 이벤트 리스너 설정
        const childElements = clone.querySelectorAll('*');
        childElements.forEach(child => {
            this.setupElementEventListeners(child);
        });

        this.selectElement(clone);
        this.saveToHistory(`${tagName} 요소 복제`, true);
        console.log(`복제 완료: ${tagName} 요소`);
    }

    deleteElement() {
        if (!this.selectedElement) return;

        const element = this.selectedElement;
        const tagName = element.tagName.toLowerCase();
        const elementText = element.textContent.trim().substring(0, 50) || tagName;

        // 중요 요소 삭제 방지
        if (['html', 'head', 'body'].includes(tagName)) {
            alert(`${tagName} 요소는 삭제할 수 없습니다.`);
            return;
        }

        // 삭제 확인 (대형 요소나 많은 자식 요소가 있을 경우)
        const childCount = element.children.length;
        if (childCount > 5) {
            const confirmed = confirm(`이 ${tagName} 요소는 ${childCount}개의 자식 요소를 포함하고 있습니다. 정말 삭제하시겠습니까?\n\n내용: "${elementText}"`);
            if (!confirmed) return;
        }

        console.log(`삭제 시작: ${tagName} 요소 (자식: ${childCount}개)`);

        // 삭제 실행
        try {
            const parent = element.parentNode;
            if (parent) {
                parent.removeChild(element);
                this.clearSelection();
                this.saveToHistory(`${tagName} 요소 삭제`, true);
                console.log(`삭제 완료: ${tagName} 요소`);
            } else {
                console.error('삭제 실패: 부모 요소를 찾을 수 없습니다.');
            }
        } catch (error) {
            console.error('삭제 중 오류:', error);
            alert('요소 삭제 중 오류가 발생했습니다.');
        }
    }

    moveElement(element, direction) {
        const parent = element.parentNode;
        const siblings = Array.from(parent.children);
        const currentIndex = siblings.indexOf(element);

        if (direction === 'up' && currentIndex > 0) {
            parent.insertBefore(element, siblings[currentIndex - 1]);
        } else if (direction === 'down' && currentIndex < siblings.length - 1) {
            parent.insertBefore(element, siblings[currentIndex + 2]);
        }

        // 요소 이동 후 선택 상태와 툴바 유지
        this.selectElement(element);
        this.saveToHistory(`${element.tagName.toLowerCase()} 요소 ${direction === 'up' ? '위로' : '아래로'} 이동`, true);
        console.log(`요소가 ${direction === 'up' ? '위로' : '아래로'} 이동되었습니다.`);
    }


    extractCleanHTML() {
        const iframe = this.previewFrame;
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        // iframe DOM을 복제하여 수정
        const clonedDoc = doc.cloneNode(true);

        // 편집 관련 스타일 제거
        const editStyles = clonedDoc.querySelectorAll('style');
        editStyles.forEach(style => {
            if (style.textContent.includes('.editable-text')) {
                style.remove();
            }
        });

        // 모든 편집 가능한 요소에서 편집 속성 제거하고 텍스트만 남기기
        const editableElements = clonedDoc.querySelectorAll('.editable-text');
        editableElements.forEach(element => {
            const text = element.textContent;
            const textNode = clonedDoc.createTextNode(text);
            element.parentNode.replaceChild(textNode, element);
        });

        // 요소 편집 관련 클래스 제거
        const selectedElements = clonedDoc.querySelectorAll('.element-selected, .element-hover');
        selectedElements.forEach(element => {
            element.classList.remove('element-selected', 'element-hover');
        });

        // 깨끗한 HTML 반환
        return clonedDoc.documentElement.outerHTML;
    }


    downloadHTML() {
        if (!this.originalHTML) {
            alert('다운로드할 HTML이 없습니다.');
            return;
        }

        // iframe에서 편집된 HTML 추출
        const editedHTML = this.extractCleanHTML();

        console.log(`파일 다운로드: ${this.fileName.textContent}`);
        console.log('편집된 HTML 길이:', editedHTML.length);

        const blob = new Blob([editedHTML], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = this.fileName.textContent || 'edited.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);

        this.showDownloadSuccess();
    }

    showDownloadSuccess() {
        const originalText = this.downloadBtn.textContent;
        this.downloadBtn.textContent = '✅ 완료!';
        this.downloadBtn.style.background = '#218838';

        setTimeout(() => {
            this.downloadBtn.textContent = originalText;
            this.downloadBtn.style.background = '';
        }, 1500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HTMLLiveEditor();
});