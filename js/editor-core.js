// 에디터 코어 — 클래스 선언, 파일 로드/샌드박스, 텍스트 편집 준비, 다운로드
// 이 파일이 클래스를 선언하고, 나머지 js/*.js 가 prototype 을 확장한다.

// 빈 페이지에서 시작할 때 쓰는 기본 문서
const GS_BLANK_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>새 문서</title>
<style>
    body { font-family: -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif; margin: 0; padding: 48px 24px; color: #1e293b; }
    main { max-width: 720px; margin: 0 auto; }
</style>
</head>
<body>
<main>
    <h1>새 문서</h1>
    <p>여기를 클릭해 텍스트를 편집하고, 요소를 선택한 뒤 스타일 편집 패널에서 자유롭게 꾸며보세요.</p>
</main>
</body>
</html>`;

class HTMLLiveEditor {
    constructor() {
        this.originalHTML = '';
        this.selectedElement = null;
        this.isElementMode = true;

        // 되돌리기/다시실행 시스템
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 20;
        this.historyTimeout = null;

        // 드래그 앤 드롭 상태
        this.isDragging = false;
        this.draggedElement = null;
        this.dragStartPos = { x: 0, y: 0 };
        this.dropTarget = null;
        this.dropPosition = null;

        // 스타일 패널 상태
        this.stylePanelOpen = false;

        // AI 설정
        this.aiSettings = {
            model: 'gemini',
            apiKey: ''
        };

        // 다중 선택 상태
        this.selectedElements = [];

        // 신규 기능 상태
        this.currentFileName = '';
        this.localFilePath = localStorage.getItem('localFilePath') || '';
        this.preferredEditor = localStorage.getItem('preferredEditor') || 'vscode';
        this.fileHandle = null;
        this.commandPaletteVisible = false;
        // 문서 내 스크립트 실행 여부 (기본 차단 — 로드 시 사용자 동의로만 허용)
        this.allowScripts = false;

        this.initializeElements();
        this.bindEvents();
        this.loadSavedApiKeys();

        // 신규 모듈 초기화
        this.initTheme();
        this.initGluestackModules();
    }

    initializeElements() {
        this.fileInput = document.getElementById('fileInput');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.fileName = document.getElementById('fileName');
        this.dropZone = document.getElementById('dropZone');
        this.uploadScreen = document.getElementById('uploadScreen');
        this.previewFrame = document.getElementById('previewFrame');
        this.topButtons = document.getElementById('topButtons');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.undoBtn = document.getElementById('undoBtn');
        this.redoBtn = document.getElementById('redoBtn');
        this.fileInfo = document.getElementById('fileInfo');
        this.modeIndicator = document.getElementById('modeIndicator');
        this.contextMenu = document.getElementById('contextMenu');
        this.tableContextMenu = document.getElementById('tableContextMenu');
        this.floatingToolbar = document.getElementById('floatingToolbar');

        // 드래그 관련
        this.dragGuide = document.getElementById('dragGuide');
        this.dragGhost = document.getElementById('dragGhost');

        // 스타일 패널
        this.stylePanel = document.getElementById('stylePanel');
        this.stylePanelClose = document.getElementById('stylePanelClose');

        // AI 모달
        this.aiStyleBtn = document.getElementById('aiStyleBtn');
        this.aiModal = document.getElementById('aiModal');
        this.aiModalClose = document.getElementById('aiModalClose');
        this.aiModalCancel = document.getElementById('aiModalCancel');
        this.aiApplyBtn = document.getElementById('aiApplyBtn');
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.toggleApiKey = document.getElementById('toggleApiKey');
        this.aiPrompt = document.getElementById('aiPrompt');

        // 토스트
        this.toastContainer = document.getElementById('toastContainer');

        // 다중 선택 관련
        this.selectionCount = document.getElementById('selectionCount');

        // DOM 네비게이터
        this.domNavigator = document.getElementById('domNavigator');
        this.domBreadcrumb = document.getElementById('domBreadcrumb');
        this.navParent = document.getElementById('navParent');
        this.navPrevSibling = document.getElementById('navPrevSibling');
        this.navNextSibling = document.getElementById('navNextSibling');
        this.navFirstChild = document.getElementById('navFirstChild');
    }

    bindEvents() {
        // 파일 업로드 이벤트
        this.uploadBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));

        // 기본 버튼 이벤트
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

        // 스타일 패널 이벤트
        this.stylePanelClose.addEventListener('click', () => this.hideStylePanel());
        this.bindStylePanelEvents();
        this.bindDocThemePanel();

        // AI 모달 이벤트
        this.aiStyleBtn.addEventListener('click', () => this.showAIModal());
        this.aiModalClose.addEventListener('click', () => this.hideAIModal());
        this.aiModalCancel.addEventListener('click', () => this.hideAIModal());
        this.aiApplyBtn.addEventListener('click', () => this.applyAIStyle());
        this.toggleApiKey.addEventListener('click', () => this.toggleApiKeyVisibility());
        this.bindAIModalEvents();

        // DOM 네비게이터 이벤트
        this.navParent.addEventListener('click', () => this.navigateToParent());
        this.navPrevSibling.addEventListener('click', () => this.navigateToPrevSibling());
        this.navNextSibling.addEventListener('click', () => this.navigateToNextSibling());
        this.navFirstChild.addEventListener('click', () => this.navigateToFirstChild());

        // 페이지 새로고침 방지
        window.addEventListener('beforeunload', (e) => {
            if (this.history.length > 1) {
                e.preventDefault();
                e.returnValue = '편집한 내용이 있습니다. 페이지를 떠나시겠습니까?';
                return e.returnValue;
            }
        });
    }

    getPreviewDoc() {
        try {
            if (this.previewFrame.style.display === 'none') return null;
            return this.previewFrame.contentDocument || this.previewFrame.contentWindow.document;
        } catch (e) {
            return null;
        }
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
            this.showToast('HTML 파일만 업로드할 수 있습니다.', 'error');
            return;
        }

        this.fileName.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.originalHTML = e.target.result;
            this.loadHTMLToEditor();
        };

        reader.onerror = () => {
            this.showToast('파일을 읽는 중 오류가 발생했습니다.', 'error');
        };

        reader.readAsText(file, 'UTF-8');
    }

    decideScriptPolicy() {
        this.allowScripts = false;
        if (/<script[\s>]/i.test(this.originalHTML)) {
            this.allowScripts = confirm(
                '이 문서에는 스크립트(<script>)가 포함되어 있습니다.\n\n' +
                '신뢰할 수 없는 파일의 스크립트는 브라우저에 저장된 정보(AI API 키 등)에 접근할 수 있습니다.\n\n' +
                '스크립트를 실행할까요?\n확인 = 실행 허용 / 취소 = 차단 (편집 기능은 그대로 동작)'
            );
            if (!this.allowScripts) {
                this.showToast('보안을 위해 문서 내 스크립트 실행을 차단했습니다.', 'info');
            }
        }
    }

    applySandbox() {
        const value = this.allowScripts ? 'allow-same-origin allow-scripts' : 'allow-same-origin';
        if (this.previewFrame.getAttribute('sandbox') !== value) {
            this.previewFrame.setAttribute('sandbox', value);
        }
    }

    loadHTMLToEditor() {
        this.decideScriptPolicy();
        this.uploadScreen.style.display = 'none';
        this.previewFrame.style.display = 'block';
        this.topButtons.style.display = 'flex';
        const viewportSwitcher = document.getElementById('viewportSwitcher');
        if (viewportSwitcher) viewportSwitcher.style.display = 'flex';

        this.modeIndicator.innerHTML = gsIcon('wrench', 13) + ' 요소편집';
        this.modeIndicator.style.color = '#007bff';

        this.renderHTML();
    }

    renderHTML() {
        const iframe = this.previewFrame;
        this.applySandbox();

        // onload를 src 할당보다 먼저 설정 (역순이면 로드가 먼저 끝나
        // 콜백을 놓치고 미리보기가 빈 화면이 될 수 있음)
        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;

                doc.open();
                doc.write(this.originalHTML);
                doc.close();

                this.waitForDocumentReady(doc, () => {
                    this.injectEditorStyles(doc);
                    this.makeTextEditable(doc);
                    this.setupEditableListeners(doc);
                    this.setupElementSelection(doc);
                    this.setupDragAndDrop(doc);
                    this.saveToHistory('파일 로드', true);

                    window.htmlEditor = this;
                    console.log('🎯 HTML Live Editor Pro 로드 완료!');
                });
            } catch (error) {
                console.error('HTML 렌더링 중 오류:', error);
            } finally {
                iframe.onload = null;
            }
        };

        iframe.src = 'about:blank';
    }

    injectEditorStyles(doc) {
        // 히스토리 스냅샷에는 이 스타일 노드가 이미 포함되어 있다
        if (doc.getElementById('editor-styles')) return;

        const style = doc.createElement('style');
        style.id = 'editor-styles';
        // 편집 대상 문서 안이라 부모의 CSS 변수가 닿지 않는다 — A안 값을 그대로 쓴다
        style.textContent = `
            .element-selected {
                outline: 2px solid #2563eb !important;
                outline-offset: 2px;
                border-radius: 3px;
            }
            .element-hover {
                outline: 1px solid rgba(37, 99, 235, 0.4) !important;
                outline-offset: 2px;
                border-radius: 3px;
            }
            .element-multi-selected {
                outline: 2px solid #2563eb !important;
                outline-offset: 2px;
                border-radius: 3px;
                background-color: rgba(37, 99, 235, 0.05) !important;
            }
            .element-dragging {
                opacity: 0.5 !important;
                outline: 2px dashed #2563eb !important;
            }
            .drop-target-highlight {
                background: rgba(37, 99, 235, 0.05) !important;
                outline: 2px dashed #2563eb !important;
            }
            .drop-target-inside {
                background: rgba(37, 99, 235, 0.08) !important;
                outline: 2px dashed #2563eb !important;
                outline-offset: -2px;
            }
            .drop-indicator-before,
            .drop-indicator-after {
                /* ::before/::after 삽입선이 static 요소에서도 보이도록 기준을 만든다 */
                position: relative;
            }
            .drop-indicator-before::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: #2563eb;
                border-radius: 2px;
                z-index: 10000;
            }
            .drop-indicator-after::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: #2563eb;
                border-radius: 2px;
                z-index: 10000;
            }
            .editable-text {
                position: relative;
                padding: 2px 4px;
                border-radius: 3px;
                transition: background-color 160ms ease, outline-color 160ms ease;
                cursor: text;
                min-height: 1em;
                display: inline-block;
                min-width: 10px;
            }
            .editable-text:hover {
                background-color: rgba(37, 99, 235, 0.05);
                outline: 1px solid rgba(37, 99, 235, 0.2);
            }
            .editable-text:focus {
                background-color: rgba(37, 99, 235, 0.05);
                outline: 2px solid #2563eb;
                box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
            }
            #gs-canvas-overlay {
                position: absolute;
                display: none;
                pointer-events: none;
                z-index: 9990;
            }
            #gs-canvas-overlay .gs-rh {
                position: absolute;
                width: 10px;
                height: 10px;
                background: #fff;
                border: 2px solid #2563eb;
                border-radius: 3px;
                pointer-events: auto;
                box-sizing: border-box;
            }
            #gs-canvas-overlay .gs-rh[data-dir="e"] { right: -5px; top: calc(50% - 5px); cursor: ew-resize; }
            #gs-canvas-overlay .gs-rh[data-dir="s"] { bottom: -5px; left: calc(50% - 5px); cursor: ns-resize; }
            #gs-canvas-overlay .gs-rh[data-dir="se"] { right: -5px; bottom: -5px; cursor: nwse-resize; }
            #gs-canvas-overlay .gs-size-badge {
                position: absolute;
                right: 0;
                bottom: -26px;
                pointer-events: none;
                font: 500 11px/1 "JetBrains Mono", monospace;
                color: #fff;
                background: #2563eb;
                padding: 4px 7px;
                border-radius: 4px;
                white-space: nowrap;
            }
            #gs-canvas-overlay .gs-add-btn {
                /* 요소 '안쪽' 좌하단 모서리 — 밖으로 내밀면 다음 형제의 클릭을,
                   중앙에 두면 요소 자신의 재클릭을 가로챈다 */
                position: absolute;
                left: 4px;
                bottom: 4px;
                width: 22px;
                height: 22px;
                border: none;
                border-radius: 50%;
                background: #2563eb;
                color: #fff;
                font-size: 15px;
                line-height: 1;
                cursor: pointer;
                pointer-events: auto;
                box-shadow: 0 1px 4px rgba(16, 24, 40, 0.3);
            }
            #gs-canvas-overlay .gs-add-menu {
                position: absolute;
                left: 4px;
                bottom: 30px;
                display: none;
                grid-template-columns: repeat(3, 1fr);
                gap: 3px;
                width: 168px;
                padding: 4px;
                background: #fff;
                border: 1px solid #e4e7ec;
                border-radius: 8px;
                box-shadow: 0 6px 16px rgba(16, 24, 40, 0.14);
                pointer-events: auto;
                z-index: 9991;
            }
            #gs-canvas-overlay .gs-add-menu.open { display: grid; }
            #gs-canvas-overlay .gs-add-menu button {
                padding: 6px 4px;
                font-size: 11px;
                font-family: inherit;
                color: #344054;
                background: #fff;
                border: 1px solid #e4e7ec;
                border-radius: 5px;
                cursor: pointer;
                white-space: nowrap;
            }
            #gs-canvas-overlay .gs-add-menu button:hover {
                background: #eff4ff;
                border-color: #2563eb;
                color: #2563eb;
            }
        `;
        doc.head.appendChild(style);
    }

    makeTextEditable(doc) {
        if (!doc || !doc.head || !doc.body) return;

        this.processTextNodes(doc.body);
    }

    processTextNodes(element) {
        if (!element || !element.ownerDocument) return;

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

                    // span으로 감싸면 값·렌더링이 깨지는 컨테이너는 조상까지 확인해 제외
                    // (textarea 값 파괴, pre/code 서식 변형, svg 내 HTML 삽입 등)
                    if (parent.closest && parent.closest('textarea, pre, code, svg, noscript, select, option, [data-editor-ui]')) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    // 이미 편집용 스팬 안에 있는 텍스트는 다시 감싸지 않는다
                    // (되돌리기마다 스팬이 한 겹씩 중첩되던 문제 방지)
                    if (parent.closest && parent.closest('.editable-text')) {
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

        textNodes.forEach((textNode) => {
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
        if (!doc) return;

        doc.querySelectorAll('.editable-text').forEach(element => this.bindEditableSpan(element));
    }

    bindEditableSpan(span) {
        // DOM 속성 대신 WeakSet 사용: 속성은 히스토리 스냅샷에 저장되어
        // 복원된 새 문서에서 리스너 바인딩을 건너뛰게 만듦
        if (!this.boundEditableSpans) this.boundEditableSpans = new WeakSet();
        if (this.boundEditableSpans.has(span)) return;
        this.boundEditableSpans.add(span);

        span.addEventListener('focus', () => span.classList.add('editing'));
        span.addEventListener('blur', () => span.classList.remove('editing'));
        span.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                span.blur();
            }
        });
        span.addEventListener('input', () => this.saveToHistory('텍스트 편집', false));
    }

    makeElementEditable(element) {
        if (element.textContent.trim()) {
            const span = element.ownerDocument.createElement('span');
            span.className = 'editable-text';
            span.contentEditable = true;
            span.textContent = element.textContent;
            element.textContent = '';
            element.appendChild(span);
            // 리스너 없이 두면 편집은 되는데 히스토리에 기록되지 않는다
            this.bindEditableSpan(span);
        }
    }

    extractCleanHTML() {
        const iframe = this.previewFrame;
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        const clonedDoc = doc.cloneNode(true);

        // 에디터 스타일 제거
        const editorStyles = clonedDoc.getElementById('editor-styles');
        if (editorStyles) editorStyles.remove();

        // 편집용 오버레이(리사이즈 핸들 · + 버튼)는 산출물이 아니다
        clonedDoc.querySelectorAll('[data-editor-ui]').forEach(node => node.remove());

        const editStyles = clonedDoc.querySelectorAll('style');
        editStyles.forEach(style => {
            if (style.textContent.includes('.editable-text') || style.textContent.includes('.element-selected')) {
                style.remove();
            }
        });

        // 편집 가능한 요소에서 편집 속성 제거
        const editableElements = clonedDoc.querySelectorAll('.editable-text');
        editableElements.forEach(element => {
            const text = element.textContent;
            const textNode = clonedDoc.createTextNode(text);
            element.parentNode.replaceChild(textNode, element);
        });

        // 요소 편집 관련 클래스 제거
        const selectedElements = clonedDoc.querySelectorAll('.element-selected, .element-hover, .element-dragging, .drop-target-highlight, .drop-target-inside, .drop-indicator-before, .drop-indicator-after, .element-multi-selected, .element-similar-preview');
        selectedElements.forEach(element => {
            element.classList.remove('element-selected', 'element-hover', 'element-dragging', 'drop-target-highlight', 'drop-target-inside', 'drop-indicator-before', 'drop-indicator-after', 'element-multi-selected', 'element-similar-preview');
            if (!element.getAttribute('class')) {
                element.removeAttribute('class');
            }
        });

        // data 속성 제거
        const markedElements = clonedDoc.querySelectorAll('[data-editor-initialized], [data-original]');
        markedElements.forEach(element => {
            element.removeAttribute('data-editor-initialized');
            element.removeAttribute('data-original');
        });

        return this.serializeDocument(clonedDoc);
    }

    downloadHTML() {
        if (!this.originalHTML) {
            this.showToast('다운로드할 HTML이 없습니다.', 'error');
            return;
        }

        const editedHTML = this.extractCleanHTML();

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
        // 아이콘이 SVG 라 textContent 로는 복원되지 않는다
        const original = this.downloadBtn.innerHTML;
        this.downloadBtn.innerHTML = gsIcon('check', 15) + ' 완료!';
        this.downloadBtn.classList.add('done');

        setTimeout(() => {
            this.downloadBtn.innerHTML = original;
            this.downloadBtn.classList.remove('done');
        }, 1500);
    }

    loadFromString(html, name) {
        this.currentFileName = name;
        this.fileName.textContent = name;
        this.originalHTML = html;
        this.loadHTMLToEditor();
    }

    async pickLocalFile() {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{ description: 'HTML 파일', accept: { 'text/html': ['.html', '.htm'] } }]
            });
            this.fileHandle = handle;
            const file = await handle.getFile();
            const text = await file.text();
            this.loadFromString(text, file.name);
        } catch (error) {
            if (error && error.name !== 'AbortError') {
                console.error('파일 열기 오류:', error);
                this.showToast('파일을 여는 중 오류가 발생했습니다.', 'error');
            }
        }
    }

    bindStartOptions() {
        const blankBtn = document.getElementById('startBlankBtn');
        const pickBtn = document.getElementById('startPickBtn');

        if (blankBtn) {
            blankBtn.addEventListener('click', () => this.loadFromString(GS_BLANK_HTML, 'untitled.html'));
        }
        if (pickBtn) {
            // File System Access API 미지원 브라우저에서는 옵션 숨김
            if (!window.showOpenFilePicker) {
                pickBtn.style.display = 'none';
            } else {
                pickBtn.addEventListener('click', () => this.pickLocalFile());
            }
        }
    }
}
