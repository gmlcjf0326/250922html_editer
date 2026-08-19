class HTMLLiveEditor {
    constructor() {
        this.originalHTML = '';
        this.updateTimeout = null;
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
        this.selectedColorTarget = 'background';

        // AI 설정
        this.aiSettings = {
            model: 'gemini',
            apiKey: ''
        };

        // 다중 선택 상태
        this.selectedElements = [];
        this.isSelectionDragging = false;
        this.selectionStart = { x: 0, y: 0 };

        // 신규 기능 상태
        this.currentFileName = '';
        this.localFilePath = localStorage.getItem('localFilePath') || '';
        this.preferredEditor = localStorage.getItem('preferredEditor') || 'vscode';
        this.fileHandle = null;
        this.iconCache = new Map();
        this.iconConfig = { size: 24, stroke: 2, color: '#0f172a' };
        this.activeAssetTab = 'icon';
        this.activeTemplateCategory = 'component';
        this.commandPaletteVisible = false;
        this.autosaveTimer = null;
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
        this.selectionBox = document.getElementById('selectionBox');

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

    // ============== 스타일 패널 이벤트 바인딩 ==============
    bindStylePanelEvents() {
        // 배경색
        const bgColor = document.getElementById('bgColor');
        const bgColorText = document.getElementById('bgColorText');
        const bgColorClear = document.getElementById('bgColorClear');

        bgColor.addEventListener('input', (e) => {
            bgColorText.value = e.target.value;
            this.applyStyle('backgroundColor', e.target.value);
        });

        bgColorText.addEventListener('change', (e) => {
            bgColor.value = e.target.value;
            this.applyStyle('backgroundColor', e.target.value);
        });

        bgColorClear.addEventListener('click', () => {
            this.applyStyle('backgroundColor', '');
            this.applyStyle('background', '');
        });

        // 그라데이션
        document.getElementById('applyGradient').addEventListener('click', () => {
            const start = document.getElementById('gradientStart').value;
            const end = document.getElementById('gradientEnd').value;
            const direction = document.getElementById('gradientDirection').value;
            this.applyStyle('background', `linear-gradient(${direction}, ${start}, ${end})`);
        });

        document.getElementById('clearGradient').addEventListener('click', () => {
            this.applyStyle('background', '');
        });

        // 텍스트 색상
        const textColor = document.getElementById('textColor');
        const textColorText = document.getElementById('textColorText');

        textColor.addEventListener('input', (e) => {
            textColorText.value = e.target.value;
            this.applyStyle('color', e.target.value);
        });

        textColorText.addEventListener('change', (e) => {
            textColor.value = e.target.value;
            this.applyStyle('color', e.target.value);
        });

        // 보더
        document.getElementById('applyBorder').addEventListener('click', () => {
            const width = document.getElementById('borderWidth').value;
            const style = document.getElementById('borderStyle').value;
            const color = document.getElementById('borderColor').value;
            this.applyStyle('border', `${width}px ${style} ${color}`);
        });

        document.getElementById('clearBorder').addEventListener('click', () => {
            this.applyStyle('border', 'none');
        });

        // 보더 래디우스
        const borderRadius = document.getElementById('borderRadius');
        const borderRadiusValue = document.getElementById('borderRadiusValue');

        borderRadius.addEventListener('input', (e) => {
            borderRadiusValue.textContent = `${e.target.value}px`;
            this.applyStyle('borderRadius', `${e.target.value}px`);
        });

        // 여백 (마진)
        ['Top', 'Bottom', 'Left', 'Right'].forEach(dir => {
            document.getElementById(`margin${dir}`).addEventListener('change', (e) => {
                this.applyStyle(`margin${dir}`, `${e.target.value}px`);
            });
        });

        // 패딩
        ['Top', 'Bottom', 'Left', 'Right'].forEach(dir => {
            document.getElementById(`padding${dir}`).addEventListener('change', (e) => {
                this.applyStyle(`padding${dir}`, `${e.target.value}px`);
            });
        });

        // 그림자
        document.getElementById('applyShadow').addEventListener('click', () => {
            const x = document.getElementById('shadowX').value;
            const y = document.getElementById('shadowY').value;
            const blur = document.getElementById('shadowBlur').value;
            const color = document.getElementById('shadowColor').value;
            this.applyStyle('boxShadow', `${x}px ${y}px ${blur}px ${this.hexToRgba(color, 0.3)}`);
        });

        document.getElementById('clearShadow').addEventListener('click', () => {
            this.applyStyle('boxShadow', 'none');
        });

        // 폰트 크기
        const fontSize = document.getElementById('fontSize');
        const fontSizeValue = document.getElementById('fontSizeValue');

        fontSize.addEventListener('input', (e) => {
            fontSizeValue.textContent = `${e.target.value}px`;
            this.applyStyle('fontSize', `${e.target.value}px`);
        });

        // 컬러 팔레트
        document.getElementById('colorPalette').addEventListener('click', (e) => {
            if (e.target.classList.contains('palette-color')) {
                const color = e.target.dataset.color;
                this.applyStyle('backgroundColor', color);
                document.getElementById('bgColor').value = color;
                document.getElementById('bgColorText').value = color;
            }
        });

    }

    // ============== AI 모달 이벤트 바인딩 ==============
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

        // 빠른 프롬프트
        document.querySelectorAll('.quick-prompt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.aiPrompt.value = btn.dataset.prompt;
            });
        });
    }

    getAIModelName(provider) {
        const custom = (localStorage.getItem(`ai_model_${provider}`) || '').trim();
        return custom || AI_PROVIDERS[provider].defaultModel;
    }

    loadModelNameForProvider(provider) {
        if (!this.aiModelInput) return;
        this.aiModelInput.value = (localStorage.getItem(`ai_model_${provider}`) || '').trim();
        this.aiModelInput.placeholder = AI_PROVIDERS[provider].defaultModel;
        const defaultLabel = document.getElementById('aiModelDefault');
        if (defaultLabel) defaultLabel.textContent = `(기본: ${AI_PROVIDERS[provider].defaultModel})`;
    }

    // ============== 파일 처리 ==============
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

    // 문서에 스크립트가 있으면 기본 차단하고, 실행이 필요한 경우에만 사용자 동의로 허용.
    // 허용 없이 열면 악성 HTML이 에디터와 same-origin으로 실행되어
    // localStorage의 AI API 키 등을 읽을 수 있음
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

        this.modeIndicator.textContent = '🔧 요소편집';
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

    // iframe에 에디터 스타일 주입
    injectEditorStyles(doc) {
        const style = doc.createElement('style');
        style.id = 'editor-styles';
        style.textContent = `
            .element-selected {
                outline: 2px solid #007bff !important;
                outline-offset: 2px;
            }
            .element-hover {
                outline: 1px dashed #007bff !important;
                outline-offset: 1px;
            }
            .element-multi-selected {
                outline: 2px solid #6366f1 !important;
                outline-offset: 1px;
                background-color: rgba(99, 102, 241, 0.08) !important;
            }
            .element-dragging {
                opacity: 0.5 !important;
                outline: 2px dashed #007bff !important;
            }
            .drop-target-highlight {
                background: rgba(0, 123, 255, 0.1) !important;
                outline: 2px dashed #007bff !important;
            }
            .drop-indicator-before::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 4px;
                background: linear-gradient(90deg, #007bff, #00d4ff);
                border-radius: 2px;
                z-index: 10000;
            }
            .drop-indicator-after::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 4px;
                background: linear-gradient(90deg, #007bff, #00d4ff);
                border-radius: 2px;
                z-index: 10000;
            }
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
        `;
        doc.head.appendChild(style);
    }

    waitForDocumentReady(doc, callback) {
        const checkReady = () => {
            if (doc && doc.body && doc.head && doc.readyState === 'complete') {
                callback();
            } else {
                setTimeout(checkReady, 50);
            }
        };

        if (doc && doc.body && doc.head) {
            callback();
        } else {
            setTimeout(checkReady, 50);
        }
    }

    // ============== 드래그 앤 드롭 ==============
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
    }

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
    }

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
    }

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
    }

    updateGhostPosition(e) {
        const iframe = this.previewFrame;
        const iframeRect = iframe.getBoundingClientRect();

        this.dragGhost.style.left = (iframeRect.left + e.clientX + 15) + 'px';
        this.dragGhost.style.top = (iframeRect.top + e.clientY + 15) + 'px';
    }

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
    }

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
    }

    // ============== 스타일 패널 ==============
    showStylePanel() {
        if (!this.selectedElement && this.selectedElements.length === 0) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        this.stylePanel.style.display = 'block';
        this.stylePanelOpen = true;
        this.loadCurrentStyles();

        if (this.selectedElements.length > 1) {
            this.showToast(`${this.selectedElements.length}개 요소에 스타일이 일괄 적용됩니다.`, 'info');
        }
    }

    hideStylePanel() {
        this.stylePanel.style.display = 'none';
        this.stylePanelOpen = false;
    }

    loadCurrentStyles() {
        // 다중 선택만 있는 경우 첫 요소 기준으로 현재 값 표시
        const reference = this.selectedElement || this.selectedElements[0];
        if (!reference) return;

        const view = reference.ownerDocument.defaultView || window;
        const computed = view.getComputedStyle(reference);
        const style = reference.style;

        // 배경색
        const bgColor = style.backgroundColor || computed.backgroundColor;
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
            const hex = this.rgbToHex(bgColor);
            document.getElementById('bgColor').value = hex;
            document.getElementById('bgColorText').value = hex;
        }

        // 텍스트 색상
        const textColor = style.color || computed.color;
        if (textColor) {
            const hex = this.rgbToHex(textColor);
            document.getElementById('textColor').value = hex;
            document.getElementById('textColorText').value = hex;
        }

        // 보더 래디우스
        const borderRadius = parseInt(style.borderRadius || computed.borderRadius) || 0;
        document.getElementById('borderRadius').value = borderRadius;
        document.getElementById('borderRadiusValue').textContent = `${borderRadius}px`;

        // 폰트 크기
        const fontSize = parseInt(style.fontSize || computed.fontSize) || 16;
        document.getElementById('fontSize').value = fontSize;
        document.getElementById('fontSizeValue').textContent = `${fontSize}px`;

        // 여백
        document.getElementById('marginTop').value = parseInt(style.marginTop || computed.marginTop) || 0;
        document.getElementById('marginBottom').value = parseInt(style.marginBottom || computed.marginBottom) || 0;
        document.getElementById('marginLeft').value = parseInt(style.marginLeft || computed.marginLeft) || 0;
        document.getElementById('marginRight').value = parseInt(style.marginRight || computed.marginRight) || 0;

        // 패딩
        document.getElementById('paddingTop').value = parseInt(style.paddingTop || computed.paddingTop) || 0;
        document.getElementById('paddingBottom').value = parseInt(style.paddingBottom || computed.paddingBottom) || 0;
        document.getElementById('paddingLeft').value = parseInt(style.paddingLeft || computed.paddingLeft) || 0;
        document.getElementById('paddingRight').value = parseInt(style.paddingRight || computed.paddingRight) || 0;
    }

    // 스타일·삭제·복제 등 일괄 작업 대상: 다중 선택이 있으면 전체, 없으면 단일 선택
    getBatchTargets() {
        if (this.selectedElements.length > 0) return [...this.selectedElements];
        return this.selectedElement ? [this.selectedElement] : [];
    }

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

    // ============== AI 스타일 변환 ==============
    showAIModal() {
        this.aiModal.style.display = 'flex';
        this.loadApiKeyForModel(this.aiSettings.model);
        this.loadModelNameForProvider(this.aiSettings.model);
    }

    hideAIModal() {
        this.aiModal.style.display = 'none';
    }

    toggleApiKeyVisibility() {
        const input = this.apiKeyInput;
        if (input.type === 'password') {
            input.type = 'text';
            this.toggleApiKey.textContent = '🙈';
        } else {
            input.type = 'password';
            this.toggleApiKey.textContent = '👁';
        }
    }

    saveApiKey(model, key) {
        localStorage.setItem(`ai_api_key_${model}`, key);
        this.aiSettings.apiKey = key;
    }

    loadApiKeyForModel(model) {
        const key = localStorage.getItem(`ai_api_key_${model}`) || '';
        this.apiKeyInput.value = key;
        this.aiSettings.apiKey = key;
    }

    loadSavedApiKeys() {
        this.loadApiKeyForModel(this.aiSettings.model);
    }

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

        try {
            const iframe = this.previewFrame;
            const doc = iframe.contentDocument || iframe.contentWindow.document;

            const targetHTML = this.getAIContextHTML(scope, doc);

            const cssResponse = await this.callAIAPI(model, apiKey, prompt, targetHTML);

            if (cssResponse) {
                this.applyAIGeneratedStyles(doc, cssResponse, scope);
                this.saveToHistory('AI 스타일 적용', true);
                this.showToast('AI 스타일이 적용되었습니다!', 'success');
                this.hideAIModal();
            }

        } catch (error) {
            console.error('AI API 오류:', error);
            this.showToast(`오류: ${error.message}`, 'error');
        } finally {
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
            this.aiApplyBtn.disabled = false;
        }
    }

    // AI에 보낼 HTML: 편집용 스팬·에디터 클래스·스크립트를 제거한 원본에 가까운 형태
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
    }

    buildAIPrompt(prompt, html) {
        return `당신은 웹 디자인 전문가입니다. 사용자가 요청하는 스타일로 HTML 요소의 CSS를 생성해주세요.

규칙:
1. 반드시 유효한 CSS만 응답하세요.
2. 각 스타일 규칙은 인라인 스타일 형식으로 작성하세요.
3. 응답은 JSON 형식으로, 각 CSS 선택자와 스타일을 포함하세요.
4. 예시 형식:
{
    "styles": [
        {"selector": "body", "css": "background-color: #1a1a2e; color: #eee;"},
        {"selector": "h1", "css": "color: #00d4ff; font-size: 2.5rem;"},
        {"selector": "button", "css": "background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 8px;"}
    ]
}

현재 HTML:
${html}

사용자 요청: ${prompt}`;
    }

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
                    max_tokens: 4096,
                    messages: [{ role: 'user', content: systemPrompt }]
                })
            });

            data = await response.json();
            if (data.error) throw new Error(data.error.message);
            if (!response.ok) throw new Error(`Claude API 오류 (HTTP ${response.status})`);
            if (data.stop_reason === 'refusal') throw new Error('Claude가 이 요청을 거절했습니다. 프롬프트를 바꿔 다시 시도해주세요.');

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

            const text = data.choices?.[0]?.message?.content || '';
            return this.parseAIResponse(text);
        }

        return null;
    }

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
    }

    applyAIGeneratedStyles(doc, response, scope) {
        if (!response || !response.styles) return;

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
    }

    // ============== 유틸리티 ==============
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    rgbToHex(rgb) {
        if (rgb.startsWith('#')) return rgb;

        const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            const r = parseInt(match[1]).toString(16).padStart(2, '0');
            const g = parseInt(match[2]).toString(16).padStart(2, '0');
            const b = parseInt(match[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        return '#000000';
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icon = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        }[type] || 'ℹ️';

        toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ============== 텍스트 편집 ==============
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
                    if (parent.closest && parent.closest('textarea, pre, code, svg, noscript, select, option')) {
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

    // ============== 히스토리 시스템 ==============
    saveToHistory(actionName, immediate = true) {
        if (!immediate) {
            clearTimeout(this.historyTimeout);
            this.historyTimeout = setTimeout(() => {
                this.doSaveToHistory(actionName);
            }, 200);
        } else {
            this.doSaveToHistory(actionName);
        }
    }

    // DOCTYPE까지 포함해 문서를 직렬화 (outerHTML만 쓰면 doctype이 사라져
    // undo 이후·다운로드 파일이 quirks mode로 렌더링됨)
    serializeDocument(doc) {
        let doctype = '';
        if (doc.doctype) {
            const dt = doc.doctype;
            doctype = '<!DOCTYPE ' + dt.name
                + (dt.publicId ? ` PUBLIC "${dt.publicId}"` : '')
                + (!dt.publicId && dt.systemId ? ' SYSTEM' : '')
                + (dt.systemId ? ` "${dt.systemId}"` : '')
                + '>\n';
        }
        return doctype + doc.documentElement.outerHTML;
    }

    doSaveToHistory(actionName) {
        const iframe = this.previewFrame;
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        let selectedElementSelector = null;
        if (this.selectedElement) {
            selectedElementSelector = this.getElementSelector(this.selectedElement);
        }

        const snapshot = {
            html: this.serializeDocument(doc),
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
    }

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
    }

    generateClassBasedSelector(element) {
        if (!element.className) return null;

        const classes = Array.from(element.classList)
            .filter(cls => !cls.startsWith('element-') && !cls.startsWith('editable-') && !cls.startsWith('drop-'));

        if (classes.length === 0) return null;

        return element.tagName.toLowerCase() + '.' + classes.join('.');
    }

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
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreFromHistory();
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreFromHistory();
        }
    }

    async restoreFromHistory() {
        if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
            const snapshot = this.history[this.historyIndex];
            const iframe = this.previewFrame;

            try {
                this.clearAllDOMReferences();

                const doc = await this.resetAndLoadIframe(iframe, snapshot.html);

                await this.setupAllEventListeners(doc);

                await this.restoreToolbarWithRetry(doc, snapshot.selectedElementSelector);

                this.hideContextualMenus();
                this.updateHistoryButtons();

            } catch (error) {
                console.error('히스토리 복원 실패:', error);
                this.updateHistoryButtons();
            }
        }
    }

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
    }

    resetAndLoadIframe(iframe, html) {
        return new Promise((resolve, reject) => {
            this.applySandbox();

            iframe.onload = () => {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;

                    doc.open();
                    doc.write(html);
                    doc.close();

                    this.waitForDocumentReady(doc, () => {
                        iframe.onload = null;
                        resolve(doc);
                    });
                } catch (error) {
                    iframe.onload = null;
                    reject(error);
                }
            };

            iframe.src = 'about:blank';

            setTimeout(() => {
                iframe.onload = null;
                reject(new Error('iframe 로드 타임아웃'));
            }, 5000);
        });
    }

    setupAllEventListeners(doc) {
        return new Promise((resolve) => {
            try {
                this.injectEditorStyles(doc);
                this.makeTextEditable(doc);
                this.setupEditableListeners(doc);
                this.setupElementSelection(doc);
                this.setupDragAndDrop(doc);

                setTimeout(() => resolve(), 100);
            } catch (error) {
                console.error('이벤트 리스너 설정 오류:', error);
                resolve();
            }
        });
    }

    restoreToolbarWithRetry(doc, originalSelector) {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 3;

            const attemptRestore = () => {
                attempts++;

                const success = this.attemptToolbarRestore(doc, originalSelector);

                if (success || attempts >= maxAttempts) {
                    resolve();
                } else {
                    setTimeout(attemptRestore, 500);
                }
            };

            setTimeout(attemptRestore, 300);
        });
    }

    attemptToolbarRestore(doc, originalSelector) {
        let selectedElement = this.findElementBySelector(doc, originalSelector);
        if (selectedElement) {
            this.selectElement(selectedElement);
            return true;
        }

        selectedElement = this.findFirstVisibleElement(doc);
        if (selectedElement) {
            this.selectElement(selectedElement);
            return true;
        }

        return false;
    }

    findElementBySelector(doc, selector) {
        if (!selector) return null;

        try {
            const element = doc.querySelector(selector);
            if (element && this.isElementVisible(element)) {
                return element;
            }
        } catch (e) {}
        return null;
    }

    findFirstVisibleElement(doc) {
        const candidates = doc.querySelectorAll('button, h1, h2, h3, p, li, a, div, span');

        for (let element of candidates) {
            if (this.isElementVisible(element) && element.textContent.trim()) {
                return element;
            }
        }
        return null;
    }

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
    }

    // 부모 문서의 입력 요소에 포커스가 있으면 편집 단축키를 가로채지 않음
    isTypingContext(event) {
        const target = event.target;
        if (!target || !target.closest) return false;
        return !!target.closest('input, textarea, select, [contenteditable="true"]');
    }

    handleKeydown(event) {
        const typing = this.isTypingContext(event);
        // iframe 안의 편집용 텍스트 스팬에서 입력 중인지 (일반 입력창과 구분)
        const inEditableSpan = typing && event.target.closest && !!event.target.closest('.editable-text');

        // Escape: 어디서든 열린 UI 닫기 (텍스트 편집 중이면 편집 종료)
        if (event.key === 'Escape') {
            if (inEditableSpan) {
                event.target.closest('.editable-text').blur();
            }
            if (this.commandPaletteVisible) {
                this.closeCommandPalette();
                return;
            }
            this.hideStylePanel();
            this.hideAIModal();
            this.hideContextualMenus();
            this.hideShortcutsModal();
            this.hidePathModal();
            this.closeSidePanels();
            this.closeEditorDropdown();
            this.hideSimilarDropdown();
            if (!typing) this.clearMultiSelection();
            return;
        }

        // Ctrl+K: 명령 팔레트 (입력 중에도 허용)
        if (event.ctrlKey && !event.shiftKey && (event.key === 'k' || event.key === 'K')) {
            event.preventDefault();
            this.toggleCommandPalette();
            return;
        }

        // 입력 중에는 브라우저 기본 동작(텍스트 undo, 문자 입력 등)을 존중.
        // 단, iframe의 편집 스팬 안에서는 텍스트 편집과 충돌하지 않는
        // 요소 수준 Ctrl 단축키(Ctrl+D, Ctrl+Shift+L/O)는 통과시킴
        if (typing) {
            const elementLevelCombo =
                (event.ctrlKey && event.shiftKey && ['l', 'o'].includes(event.key.toLowerCase())) ||
                (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'd');
            if (!inEditableSpan || !elementLevelCombo) return;
        }

        if (event.ctrlKey && event.shiftKey && (event.key === 'l' || event.key === 'L')) {
            event.preventDefault();
            this.toggleTheme();
        } else if (event.ctrlKey && event.shiftKey && (event.key === 'o' || event.key === 'O')) {
            event.preventDefault();
            this.openInExternalEditor(this.preferredEditor);
        } else if (event.ctrlKey && !event.shiftKey && (event.key === 'd' || event.key === 'D')) {
            if (this.selectedElement || this.selectedElements.length > 0) {
                event.preventDefault();
                this.duplicateElement();
            }
        } else if (event.ctrlKey && !event.shiftKey && (event.key === 'a' || event.key === 'A')) {
            // Ctrl+A: 선택 요소와 같은 태그 전체 선택
            if (this.selectedElement) {
                event.preventDefault();
                this.selectSimilar(this.selectedElement, 'tag');
            }
        } else if (event.ctrlKey && event.key.toLowerCase() === 'z' && !event.shiftKey) {
            event.preventDefault();
            this.undo();
        } else if (event.ctrlKey && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
            event.preventDefault();
            this.redo();
        } else if (event.key === '?') {
            event.preventDefault();
            this.showShortcutsModal();
        } else if (event.key === 'p' || event.key === 'P') {
            // P: 부모 요소 선택
            if (!event.ctrlKey && !event.altKey && this.selectedElement) {
                event.preventDefault();
                this.navigateToParent();
            }
        } else if (event.key === 'c' || event.key === 'C') {
            // C: 첫 자식 요소 선택 (Ctrl+C는 복사이므로 제외)
            if (!event.ctrlKey && !event.altKey && this.selectedElement) {
                event.preventDefault();
                this.navigateToFirstChild();
            }
        } else if (event.key === 'ArrowLeft' && !event.ctrlKey && this.selectedElement) {
            // 왼쪽 화살표: 이전 형제
            event.preventDefault();
            this.navigateToPrevSibling();
        } else if (event.key === 'ArrowRight' && !event.ctrlKey && this.selectedElement) {
            // 오른쪽 화살표: 다음 형제
            event.preventDefault();
            this.navigateToNextSibling();
        } else if (event.key === 'ArrowUp' && !event.ctrlKey && this.selectedElement) {
            // 위 화살표: 요소를 위로 이동
            event.preventDefault();
            this.moveElement(this.selectedElement, 'up');
        } else if (event.key === 'ArrowDown' && !event.ctrlKey && this.selectedElement) {
            // 아래 화살표: 요소를 아래로 이동
            event.preventDefault();
            this.moveElement(this.selectedElement, 'down');
        } else if (event.key === 'Delete' && (this.selectedElement || this.selectedElements.length > 0)) {
            // Delete: 요소 삭제 (다중 선택 포함)
            event.preventDefault();
            this.deleteElement();
        }
    }

    // ============== 요소 선택 ==============
    setupElementSelection(doc) {
        if (!this.isElementMode || !doc || !doc.body) return;

        try {
            this.cleanupExistingEventListeners(doc);
            this.setupEventDelegation(doc);
        } catch (error) {
            console.error('이벤트 리스너 설정 중 오류:', error);
        }
    }

    cleanupExistingEventListeners(doc) {
        try {
            if (doc.body && this.currentEventListeners) {
                this.currentEventListeners.forEach(({ event, handler }) => {
                    doc.body.removeEventListener(event, handler, true);
                });
            }

            const markedElements = doc.querySelectorAll('[data-editor-initialized]');
            markedElements.forEach(element => {
                element.removeAttribute('data-editor-initialized');
                element.classList.remove('element-hover', 'element-selected');
            });

            this.currentEventListeners = [];
        } catch (error) {
            console.error('이벤트 리스너 정리 중 오류:', error);
        }
    }

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

            this.currentEventListeners = [
                { event: 'mouseenter', handler: mouseenterHandler },
                { event: 'mouseleave', handler: mouseleaveHandler },
                { event: 'click', handler: clickHandler },
                { event: 'contextmenu', handler: contextmenuHandler }
            ];
        } catch (error) {
            console.error('이벤트 위임 등록 실패:', error);
        }
    }

    findEditableTarget(element) {
        if (!element || !element.tagName) return null;

        const excludedTags = ['html', 'head', 'body', 'script', 'style', 'meta', 'link'];
        const excludedClasses = ['editable-text'];

        let current = element;
        let attempts = 0;
        const maxAttempts = 10;

        while (current && current.tagName && attempts < maxAttempts) {
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
    }

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
    }

    isTableElement(element) {
        const tagName = element.tagName.toLowerCase();
        return ['table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot'].includes(tagName) ||
               element.closest('table') !== null;
    }

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

        // 스타일 패널이 열려있으면 업데이트
        if (this.stylePanelOpen) {
            this.loadCurrentStyles();
        }
    }

    // ============== 다중 선택 ==============
    clearMultiSelection() {
        this.selectedElements.forEach(el => {
            el.classList.remove('element-multi-selected');
        });
        this.selectedElements = [];
        this.updateSelectionCount();
    }

    updateSelectionCount() {
        const count = this.selectedElements.length;
        if (count > 0) {
            this.selectionCount.textContent = `${count}개 선택`;
            this.selectionCount.style.display = 'inline-block';
        } else {
            this.selectionCount.style.display = 'none';
        }
    }

    // 다중 선택 직후 Delete 등 요소 단축키가 바로 동작하도록 텍스트 편집 포커스 해제
    blurIframeText() {
        const doc = this.getPreviewDoc();
        if (doc && doc.activeElement && doc.activeElement.classList &&
            doc.activeElement.classList.contains('editable-text')) {
            doc.activeElement.blur();
        }
    }

    // ============== 유사 요소 일괄 선택 ==============
    getEditorClasses() {
        return ['element-selected', 'element-hover', 'element-multi-selected', 'element-dragging', 'element-similar-preview', 'drop-target-highlight', 'editable-text', 'editing'];
    }

    getContentClasses(element) {
        const editorClasses = this.getEditorClasses();
        return Array.from(element.classList).filter(cls => !editorClasses.includes(cls) && !cls.startsWith('drop-indicator-'));
    }

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
    }

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
    }

    // Ctrl+Shift+클릭: 현재 선택과 같은 부모 안에서 두 요소 사이의 형제들을 범위 선택
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
    }

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
    }

    hideSimilarDropdown() {
        const dropdown = document.getElementById('similarDropdown');
        if (dropdown) dropdown.classList.remove('open');
    }

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
    }

    // ============== DOM 네비게이터 ==============
    showDOMNavigator(element) {
        if (!element) {
            this.domNavigator.style.display = 'none';
            return;
        }

        this.domNavigator.style.display = 'flex';
        this.updateBreadcrumb(element);
        this.updateNavigationButtons(element);
    }

    hideDOMNavigator() {
        this.domNavigator.style.display = 'none';
    }

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
    }

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
    }

    findValidSibling(element, direction) {
        let sibling = direction === 'previous' ? element.previousElementSibling : element.nextElementSibling;
        while (sibling) {
            if (this.isValidEditTarget(sibling)) {
                return sibling;
            }
            sibling = direction === 'previous' ? sibling.previousElementSibling : sibling.nextElementSibling;
        }
        return null;
    }

    findValidChild(element) {
        for (const child of element.children) {
            if (this.isValidEditTarget(child)) {
                return child;
            }
        }
        return null;
    }

    navigateToParent() {
        if (!this.selectedElement) return;
        const parent = this.selectedElement.parentElement;
        const doc = this.selectedElement.ownerDocument;
        if (parent && parent !== doc.body && parent.tagName !== 'BODY') {
            this.selectElement(parent);
        }
    }

    navigateToPrevSibling() {
        if (!this.selectedElement) return;
        const sibling = this.findValidSibling(this.selectedElement, 'previous');
        if (sibling) {
            this.selectElement(sibling);
        }
    }

    navigateToNextSibling() {
        if (!this.selectedElement) return;
        const sibling = this.findValidSibling(this.selectedElement, 'next');
        if (sibling) {
            this.selectElement(sibling);
        }
    }

    navigateToFirstChild() {
        if (!this.selectedElement) return;
        const child = this.findValidChild(this.selectedElement);
        if (child) {
            this.selectElement(child);
        }
    }

    // ============== Wrap/Unwrap/Move-out ==============
    wrapWithDiv() {
        if (!this.selectedElement) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        const element = this.selectedElement;
        const doc = element.ownerDocument;
        const parent = element.parentElement;

        if (!parent) {
            this.showToast('부모 요소가 없습니다.', 'error');
            return;
        }

        // 새 div 생성
        const wrapper = doc.createElement('div');
        wrapper.style.cssText = 'padding: 10px; border: 1px dashed #ccc;';

        // 요소를 div로 감싸기
        parent.insertBefore(wrapper, element);
        wrapper.appendChild(element);

        this.setupElementEventListeners(wrapper);
        this.selectElement(wrapper);
        this.saveToHistory('div로 감싸기', true);
        this.showToast('요소를 div로 감쌌습니다.', 'success');
    }

    unwrapElement() {
        if (!this.selectedElement) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        const element = this.selectedElement;
        const parent = element.parentElement;

        if (!parent || parent.tagName === 'BODY') {
            this.showToast('감싸기를 해제할 수 없습니다.', 'error');
            return;
        }

        // 요소의 모든 자식들을 부모 앞으로 이동
        const children = Array.from(element.children);
        if (children.length === 0) {
            this.showToast('자식 요소가 없습니다.', 'warning');
            return;
        }

        children.forEach(child => {
            parent.insertBefore(child, element);
            this.setupElementEventListeners(child);
        });

        // 원래 요소 삭제
        element.remove();

        // 첫 번째 자식 선택
        if (children.length > 0) {
            this.selectElement(children[0]);
        } else {
            this.clearSelection();
        }

        this.saveToHistory('감싸기 해제', true);
        this.showToast('감싸기가 해제되었습니다.', 'success');
    }

    moveOutOfParent() {
        if (!this.selectedElement) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        const element = this.selectedElement;
        const parent = element.parentElement;
        const grandparent = parent ? parent.parentElement : null;

        if (!grandparent || grandparent.tagName === 'HTML') {
            this.showToast('더 이상 밖으로 이동할 수 없습니다.', 'error');
            return;
        }

        // 부모 다음 위치로 이동
        grandparent.insertBefore(element, parent.nextSibling);

        this.selectElement(element);
        this.saveToHistory('부모 밖으로 이동', true);
        this.showToast('요소를 부모 밖으로 이동했습니다.', 'success');
    }

    clearSelection() {
        if (this.selectedElement) {
            this.selectedElement.classList.remove('element-selected');
            this.selectedElement = null;
        }
        this.hideFloatingToolbar();
        this.hideDOMNavigator();
        this.clearMultiSelection();
    }

    // ============== 컨텍스트 메뉴 ==============
    showContextMenu(event, element) {
        this.contextMenuTarget = element;

        const iframe = this.previewFrame;
        const iframeRect = iframe.getBoundingClientRect();

        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = (iframeRect.left + event.clientX) + 'px';
        this.contextMenu.style.top = (iframeRect.top + event.clientY) + 'px';
        this.tableContextMenu.style.display = 'none';
    }

    showTableContextMenu(event, element) {
        this.contextMenuTarget = element;

        const iframe = this.previewFrame;
        const iframeRect = iframe.getBoundingClientRect();

        this.tableContextMenu.style.display = 'block';
        this.tableContextMenu.style.left = (iframeRect.left + event.clientX) + 'px';
        this.tableContextMenu.style.top = (iframeRect.top + event.clientY) + 'px';
        this.contextMenu.style.display = 'none';
    }

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

        // 유사 선택 드롭다운: 바깥 클릭 시 닫기 (🧲 버튼 클릭은 토글 로직이 처리)
        const similarDropdown = document.getElementById('similarDropdown');
        if (similarDropdown && !similarDropdown.contains(event.target) && !this.floatingToolbar.contains(event.target)) {
            similarDropdown.classList.remove('open');
        }
    }

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
            case 'duplicate':
                this.duplicateElement();
                break;
            case 'delete':
                this.deleteElement();
                break;
        }
    }

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
    }

    // ============== 플로팅 툴바 ==============
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
    }

    hideFloatingToolbar() {
        this.floatingToolbar.style.display = 'none';
    }

    // ============== 요소 조작 ==============
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

        this.setupElementEventListeners(newElement);
        this.selectElement(newElement);
        this.saveToHistory(`${tagName} 요소 추가`, true);
    }

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

    setupElementEventListeners(element) {
        if (!element || element.hasAttribute('data-editor-initialized')) return;

        element.setAttribute('data-editor-initialized', 'true');

        element.addEventListener('mouseenter', (e) => {
            if (this.isElementMode && !this.selectedElement && !this.isDragging) {
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
            if (this.isElementMode && !this.isDragging) {
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
        const targets = this.getBatchTargets();
        if (targets.length === 0) return;

        let lastClone = null;
        targets.forEach(element => {
            if (!element.parentNode) return;

            const clone = element.cloneNode(true);
            element.parentNode.insertBefore(clone, element.nextSibling);

            clone.removeAttribute('data-editor-initialized');
            clone.classList.remove('element-selected', 'element-multi-selected');
            clone.querySelectorAll('*').forEach(child => {
                child.removeAttribute('data-editor-initialized');
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
    }

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

        this.selectElement(element);
        this.saveToHistory(`요소 ${direction === 'up' ? '위로' : '아래로'} 이동`, true);
    }

    // ============== 테이블 조작 ==============
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
            this.setupElementEventListeners(newCell);
            newRow.appendChild(newCell);
        }

        if (position === 'above') {
            targetRow.parentNode.insertBefore(newRow, targetRow);
        } else {
            targetRow.parentNode.insertBefore(newRow, targetRow.nextSibling);
        }

        this.selectElement(newRow);
        this.saveToHistory(`테이블 행 ${position === 'above' ? '위에' : '아래에'} 추가`, true);
    }

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

        this.selectElement(element);
        this.saveToHistory(`테이블 열 ${position === 'left' ? '왼쪽에' : '오른쪽에'} 추가`, true);
    }

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
    }

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

    // ============== 다운로드 ==============
    extractCleanHTML() {
        const iframe = this.previewFrame;
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        const clonedDoc = doc.cloneNode(true);

        // 에디터 스타일 제거
        const editorStyles = clonedDoc.getElementById('editor-styles');
        if (editorStyles) editorStyles.remove();

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
        const selectedElements = clonedDoc.querySelectorAll('.element-selected, .element-hover, .element-dragging, .drop-target-highlight, .element-multi-selected, .element-similar-preview');
        selectedElements.forEach(element => {
            element.classList.remove('element-selected', 'element-hover', 'element-dragging', 'drop-target-highlight', 'element-multi-selected', 'element-similar-preview');
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
        const originalText = this.downloadBtn.textContent;
        this.downloadBtn.textContent = '✅ 완료!';
        this.downloadBtn.style.background = '#218838';

        setTimeout(() => {
            this.downloadBtn.textContent = originalText;
            this.downloadBtn.style.background = '';
        }, 1500);
    }

    // ============== 테마 ==============
    initTheme() {
        this.themeToggleBtn = document.getElementById('themeToggleBtn');
        this.applyTheme(localStorage.getItem('editorTheme') || 'light');

        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        }
    }

    applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem('editorTheme', theme);

        if (this.themeToggleBtn) {
            this.themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
            this.themeToggleBtn.title = theme === 'dark' ? '라이트 테마로 전환 (Ctrl+Shift+L)' : '다크 테마로 전환 (Ctrl+Shift+L)';
        }
    }

    toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        this.applyTheme(isDark ? 'light' : 'dark');
    }

    // ============== Gluestack 신규 모듈 초기화 ==============
    initGluestackModules() {
        this.bindStartOptions();
        this.bindSidePanels();
        this.bindTemplateLibrary();
        this.bindCommandPalette();
        this.bindViewportSwitcher();
        this.bindEditorDropdown();
        this.bindPathModal();
        this.bindShortcutsModal();
        this.bindSimilarDropdown();
    }

    getPreviewDoc() {
        try {
            if (this.previewFrame.style.display === 'none') return null;
            return this.previewFrame.contentDocument || this.previewFrame.contentWindow.document;
        } catch (e) {
            return null;
        }
    }

    // ============== 시작 화면 옵션 ==============
    bindStartOptions() {
        const blankBtn = document.getElementById('startBlankBtn');
        const sampleBtn = document.getElementById('startSampleBtn');
        const pickBtn = document.getElementById('startPickBtn');

        if (blankBtn) {
            blankBtn.addEventListener('click', () => this.loadFromString(GS_BLANK_HTML, 'untitled.html'));
        }
        if (sampleBtn) {
            sampleBtn.addEventListener('click', () => this.loadFromString(GS_SAMPLE_HTML, 'sample.html'));
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

    // ============== 사이드 패널 (템플릿 / 히스토리) ==============
    bindSidePanels() {
        this.templatePanel = document.getElementById('templatePanel');
        this.historyPanel = document.getElementById('historyPanel');
        this.assetPanel = document.getElementById('assetPanel');

        const templatesBtn = document.getElementById('templatesBtn');
        const historyBtn = document.getElementById('historyBtn');
        const templateClose = document.getElementById('templatePanelClose');
        const historyClose = document.getElementById('historyPanelClose');
        const assetClose = document.getElementById('assetPanelClose');

        if (templatesBtn) {
            templatesBtn.addEventListener('click', () => this.toggleSidePanel(this.templatePanel));
        }
        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                this.toggleSidePanel(this.historyPanel);
                this.renderHistoryPanel();
            });
        }
        if (templateClose) templateClose.addEventListener('click', () => this.templatePanel.classList.remove('open'));
        if (historyClose) historyClose.addEventListener('click', () => this.historyPanel.classList.remove('open'));
        if (assetClose) assetClose.addEventListener('click', () => this.assetPanel.classList.remove('open'));
    }

    toggleSidePanel(panel) {
        if (!panel) return;
        const wasOpen = panel.classList.contains('open');
        this.closeSidePanels();
        if (!wasOpen) panel.classList.add('open');
    }

    closeSidePanels() {
        [this.templatePanel, this.historyPanel, this.assetPanel].forEach(panel => {
            if (panel) panel.classList.remove('open');
        });
    }

    // ============== 템플릿 라이브러리 ==============
    bindTemplateLibrary() {
        this.templateGrid = document.getElementById('templateGrid');
        this.templateSearchInput = document.getElementById('templateSearch');

        document.querySelectorAll('.template-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.template-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.activeTemplateCategory = tab.dataset.category;
                this.renderTemplateGrid();
            });
        });

        if (this.templateSearchInput) {
            this.templateSearchInput.addEventListener('input', () => this.renderTemplateGrid());
        }

        this.renderTemplateGrid();
    }

    renderTemplateGrid() {
        if (!this.templateGrid) return;

        const query = (this.templateSearchInput ? this.templateSearchInput.value : '').trim().toLowerCase();
        const items = GS_TEMPLATES.filter(t =>
            t.category === this.activeTemplateCategory &&
            (!query || t.name.toLowerCase().includes(query) || t.desc.toLowerCase().includes(query))
        );

        this.templateGrid.innerHTML = '';

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'command-palette-empty';
            empty.textContent = '일치하는 템플릿이 없습니다.';
            this.templateGrid.appendChild(empty);
            return;
        }

        items.forEach(template => {
            const card = document.createElement('div');
            card.className = 'template-card';

            const preview = document.createElement('div');
            preview.className = 'template-card-preview';
            preview.innerHTML = template.html;

            const name = document.createElement('div');
            name.className = 'template-card-name';
            name.textContent = template.name;

            const desc = document.createElement('div');
            desc.className = 'template-card-desc';
            desc.textContent = template.desc;

            card.appendChild(preview);
            card.appendChild(name);
            card.appendChild(desc);
            card.addEventListener('click', () => this.insertTemplate(template));

            this.templateGrid.appendChild(card);
        });
    }

    insertTemplate(template) {
        const doc = this.getPreviewDoc();
        if (!doc || !doc.body) {
            this.showToast('먼저 문서를 열어주세요.', 'warning');
            return;
        }

        const container = doc.createElement('div');
        container.innerHTML = template.html;
        const nodes = Array.from(container.children);

        if (nodes.length === 0) return;

        // 선택된 요소 뒤에 삽입, 없으면 body 끝에 추가
        let anchor = (this.selectedElement && this.selectedElement.ownerDocument === doc && this.selectedElement.parentNode)
            ? this.selectedElement
            : null;

        nodes.forEach(node => {
            if (anchor) {
                anchor.parentNode.insertBefore(node, anchor.nextSibling);
                anchor = node;
            } else {
                doc.body.appendChild(node);
            }
        });

        // 삽입된 콘텐츠를 편집 가능하게 처리
        // (요소 선택은 body 이벤트 위임이 이미 커버하므로 텍스트 편집 바인딩만 수행)
        nodes.forEach(node => {
            this.processTextNodes(node);
            node.querySelectorAll('.editable-text').forEach(span => this.bindEditableSpan(span));
        });

        this.selectElement(nodes[0]);
        nodes[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.saveToHistory(`템플릿 삽입: ${template.name}`, true);
        this.showToast(`"${template.name}" 템플릿이 삽입되었습니다.`, 'success');
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

    // ============== 히스토리 타임라인 패널 ==============
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
    }

    jumpToHistory(index) {
        if (index === this.historyIndex || index < 0 || index >= this.history.length) return;
        this.historyIndex = index;
        this.restoreFromHistory();
    }

    // ============== 명령 팔레트 ==============
    bindCommandPalette() {
        this.commandPaletteOverlay = document.getElementById('commandPaletteOverlay');
        this.commandPaletteInput = document.getElementById('commandPaletteInput');
        this.commandPaletteList = document.getElementById('commandPaletteList');
        this.cpActiveIndex = 0;
        this.cpFiltered = [];

        const paletteBtn = document.getElementById('commandPaletteBtn');
        if (paletteBtn) {
            paletteBtn.addEventListener('click', () => this.openCommandPalette());
        }

        if (!this.commandPaletteOverlay) return;

        // 배경 클릭으로 닫기
        this.commandPaletteOverlay.addEventListener('click', (e) => {
            if (e.target === this.commandPaletteOverlay) this.closeCommandPalette();
        });

        this.commandPaletteInput.addEventListener('input', () => {
            this.renderCommandList(this.commandPaletteInput.value);
        });

        this.commandPaletteInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.moveCommandSelection(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.moveCommandSelection(-1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const command = this.cpFiltered[this.cpActiveIndex];
                if (command) this.executeCommand(command);
            }
        });
    }

    getCommands() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return [
            { icon: '↶', title: '실행 취소', desc: '마지막 편집을 되돌립니다', kbd: 'Ctrl+Z', run: () => this.undo() },
            { icon: '↷', title: '다시 실행', desc: '되돌린 편집을 다시 적용합니다', kbd: 'Ctrl+Y', run: () => this.redo() },
            { icon: '📥', title: 'HTML 다운로드', desc: '편집된 HTML을 파일로 저장합니다', kbd: '', run: () => this.downloadHTML() },
            { icon: isDark ? '☀️' : '🌙', title: isDark ? '라이트 테마로 전환' : '다크 테마로 전환', desc: '에디터 UI 테마를 전환합니다', kbd: 'Ctrl+Shift+L', run: () => this.toggleTheme() },
            { icon: '🧩', title: '템플릿 라이브러리', desc: '컴포넌트·섹션·페이지 템플릿을 삽입합니다', kbd: '', run: () => this.toggleSidePanel(this.templatePanel) },
            { icon: '🕐', title: '히스토리 타임라인', desc: '편집 기록을 보고 특정 시점으로 이동합니다', kbd: '', run: () => { this.toggleSidePanel(this.historyPanel); this.renderHistoryPanel(); } },
            { icon: '⌨️', title: '단축키 가이드', desc: '사용 가능한 단축키를 확인합니다', kbd: '?', run: () => this.showShortcutsModal() },
            { icon: '🤖', title: 'AI 스타일 변환', desc: 'AI로 페이지 스타일을 변경합니다', kbd: '', run: () => this.showAIModal() },
            { icon: '🎨', title: '스타일 패널 열기', desc: '선택한 요소의 스타일을 편집합니다', kbd: '', run: () => this.showStylePanel() },
            { icon: '📄', title: '요소 복제', desc: '선택한 요소를 복제합니다', kbd: 'Ctrl+D', run: () => this.duplicateElement() },
            { icon: '🗑️', title: '요소 삭제', desc: '선택한 요소를 삭제합니다', kbd: 'Del', run: () => this.deleteElement() },
            { icon: '📦', title: 'div로 감싸기', desc: '선택한 요소를 div로 감쌉니다', kbd: '', run: () => this.wrapWithDiv() },
            { icon: '📤', title: '감싸기 해제', desc: '선택한 요소의 자식을 밖으로 꺼냅니다', kbd: '', run: () => this.unwrapElement() },
            { icon: '↗️', title: '부모 밖으로 이동', desc: '선택한 요소를 부모 밖으로 이동합니다', kbd: '', run: () => this.moveOutOfParent() },
            { icon: '🖥', title: '뷰포트: 전체 화면', desc: '미리보기를 전체 너비로 표시합니다', kbd: '', run: () => this.setViewport('full') },
            { icon: '💻', title: '뷰포트: 데스크톱 1440', desc: '1440px 너비로 미리봅니다', kbd: '', run: () => this.setViewport('desktop') },
            { icon: '📱', title: '뷰포트: 태블릿 768', desc: '768px 너비로 미리봅니다', kbd: '', run: () => this.setViewport('tablet') },
            { icon: '📱', title: '뷰포트: 모바일 375', desc: '375px 너비로 미리봅니다', kbd: '', run: () => this.setViewport('mobile') },
            { icon: '💻', title: '외부 에디터로 열기', desc: '설정된 에디터에서 원본 파일을 엽니다', kbd: 'Ctrl+Shift+O', run: () => this.openInExternalEditor(this.preferredEditor) },
            { icon: '📁', title: '로컬 파일 경로 설정', desc: '외부 에디터 연동을 위한 파일 경로를 설정합니다', kbd: '', run: () => this.showPathModal() }
        ];
    }

    openCommandPalette() {
        if (!this.commandPaletteOverlay) return;
        this.commandPaletteOverlay.style.display = 'flex';
        this.commandPaletteVisible = true;
        this.commandPaletteInput.value = '';
        this.renderCommandList('');
        this.commandPaletteInput.focus();
    }

    closeCommandPalette() {
        if (!this.commandPaletteOverlay) return;
        this.commandPaletteOverlay.style.display = 'none';
        this.commandPaletteVisible = false;
    }

    toggleCommandPalette() {
        if (this.commandPaletteVisible) {
            this.closeCommandPalette();
        } else {
            this.openCommandPalette();
        }
    }

    renderCommandList(query) {
        const q = (query || '').trim().toLowerCase();
        this.cpFiltered = this.getCommands().filter(command =>
            !q || command.title.toLowerCase().includes(q) || command.desc.toLowerCase().includes(q)
        );
        this.cpActiveIndex = 0;

        this.commandPaletteList.innerHTML = '';

        if (this.cpFiltered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'command-palette-empty';
            empty.textContent = '일치하는 명령이 없습니다.';
            this.commandPaletteList.appendChild(empty);
            return;
        }

        this.cpFiltered.forEach((command, index) => {
            const item = document.createElement('div');
            item.className = 'command-item' + (index === this.cpActiveIndex ? ' active' : '');

            const icon = document.createElement('div');
            icon.className = 'command-item-icon';
            icon.textContent = command.icon;

            const body = document.createElement('div');
            body.className = 'command-item-body';
            const title = document.createElement('div');
            title.className = 'command-item-title';
            title.textContent = command.title;
            const desc = document.createElement('div');
            desc.className = 'command-item-desc';
            desc.textContent = command.desc;
            body.appendChild(title);
            body.appendChild(desc);

            item.appendChild(icon);
            item.appendChild(body);

            if (command.kbd) {
                const kbd = document.createElement('span');
                kbd.className = 'kbd';
                kbd.textContent = command.kbd;
                item.appendChild(kbd);
            }

            item.addEventListener('click', () => this.executeCommand(command));
            item.addEventListener('mouseenter', () => {
                this.cpActiveIndex = index;
                this.updateCommandActiveState();
            });

            this.commandPaletteList.appendChild(item);
        });
    }

    moveCommandSelection(delta) {
        if (this.cpFiltered.length === 0) return;
        this.cpActiveIndex = (this.cpActiveIndex + delta + this.cpFiltered.length) % this.cpFiltered.length;
        this.updateCommandActiveState();
    }

    updateCommandActiveState() {
        const items = this.commandPaletteList.querySelectorAll('.command-item');
        items.forEach((item, index) => {
            item.classList.toggle('active', index === this.cpActiveIndex);
        });
        const activeItem = items[this.cpActiveIndex];
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
    }

    executeCommand(command) {
        this.closeCommandPalette();
        command.run();
    }

    // ============== 뷰포트 스위처 ==============
    bindViewportSwitcher() {
        document.querySelectorAll('.viewport-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setViewport(btn.dataset.viewport));
        });
    }

    setViewport(mode) {
        if (mode === 'full') {
            delete document.body.dataset.viewport;
        } else {
            document.body.dataset.viewport = mode;
        }

        document.querySelectorAll('.viewport-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.viewport === mode);
        });
    }

    // ============== 원본 편집 (외부 에디터 연동) ==============
    bindEditorDropdown() {
        const dropdown = document.getElementById('openInEditorDropdown');
        const openBtn = document.getElementById('openInEditorBtn');
        if (!dropdown || !openBtn) return;

        openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        dropdown.querySelectorAll('.gs-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                dropdown.classList.remove('open');
                const editor = item.dataset.editor;

                if (editor === 'set-path') {
                    this.showPathModal();
                } else if (editor && editor !== 'monaco') {
                    this.openInExternalEditor(editor);
                }
            });
        });
    }

    closeEditorDropdown() {
        const dropdown = document.getElementById('openInEditorDropdown');
        if (dropdown) dropdown.classList.remove('open');
    }

    openInExternalEditor(editor) {
        if (!editor || editor === 'monaco') editor = 'vscode';
        this.preferredEditor = editor;
        localStorage.setItem('preferredEditor', editor);

        if (!this.localFilePath) {
            this.showToast('먼저 로컬 파일 경로를 설정해주세요.', 'warning');
            this.showPathModal();
            return;
        }

        const path = this.localFilePath.replace(/\\/g, '/');
        const urls = {
            vscode: `vscode://file/${encodeURI(path)}`,
            cursor: `cursor://file/${encodeURI(path)}`,
            sublime: `subl://open?url=file://${encodeURI(path)}`,
            webstorm: `webstorm://open?file=${encodeURIComponent(this.localFilePath)}`
        };

        const url = urls[editor];
        if (!url) return;

        const link = document.createElement('a');
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();

        this.showToast('외부 에디터 열기를 요청했습니다. 응답이 없다면 해당 에디터 설치 여부를 확인해주세요.', 'info');
    }

    // ============== 경로 설정 모달 ==============
    bindPathModal() {
        this.pathModal = document.getElementById('pathModal');
        this.pathInput = document.getElementById('pathInput');
        if (!this.pathModal) return;

        const closeBtn = document.getElementById('pathModalClose');
        const cancelBtn = document.getElementById('pathCancelBtn');
        const saveBtn = document.getElementById('pathSaveBtn');

        if (closeBtn) closeBtn.addEventListener('click', () => this.hidePathModal());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hidePathModal());
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.localFilePath = this.pathInput.value.trim();
                localStorage.setItem('localFilePath', this.localFilePath);
                this.hidePathModal();
                this.showToast(this.localFilePath ? '파일 경로가 저장되었습니다.' : '파일 경로가 비워졌습니다.', 'success');
            });
        }

        this.pathModal.addEventListener('click', (e) => {
            if (e.target === this.pathModal) this.hidePathModal();
        });
    }

    showPathModal() {
        if (!this.pathModal) return;
        this.pathInput.value = this.localFilePath || '';
        this.pathModal.style.display = 'flex';
        this.pathInput.focus();
    }

    hidePathModal() {
        if (this.pathModal) this.pathModal.style.display = 'none';
    }

    // ============== 단축키 가이드 모달 ==============
    bindShortcutsModal() {
        this.shortcutsModal = document.getElementById('shortcutsModal');
        if (!this.shortcutsModal) return;

        const openBtn = document.getElementById('shortcutBtn');
        const closeBtn = document.getElementById('shortcutsModalClose');

        if (openBtn) openBtn.addEventListener('click', () => this.showShortcutsModal());
        if (closeBtn) closeBtn.addEventListener('click', () => this.hideShortcutsModal());

        this.shortcutsModal.addEventListener('click', (e) => {
            if (e.target === this.shortcutsModal) this.hideShortcutsModal();
        });
    }

    showShortcutsModal() {
        if (this.shortcutsModal) this.shortcutsModal.style.display = 'flex';
    }

    hideShortcutsModal() {
        if (this.shortcutsModal) this.shortcutsModal.style.display = 'none';
    }
}

// ============== AI 프로바이더 설정 ==============
// 기본 모델은 AI 모달의 "모델명" 입력으로 프로바이더별 변경 가능 (localStorage: ai_model_<provider>)
const AI_PROVIDERS = {
    gemini: { label: 'Gemini', defaultModel: 'gemini-2.5-flash' },
    claude: { label: 'Claude', defaultModel: 'claude-opus-5' },
    gpt: { label: 'GPT', defaultModel: 'gpt-4o-mini' }
};

// ============== 시작 문서 템플릿 ==============
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
    <p>여기를 클릭해 텍스트를 편집하거나, 템플릿 라이브러리(🧩)에서 컴포넌트를 추가해보세요.</p>
</main>
</body>
</html>`;

const GS_SAMPLE_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>샘플 랜딩 페이지</title>
<style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif; color: #1e293b; line-height: 1.6; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 16px 32px; border-bottom: 1px solid #e2e8f0; }
    header nav a { margin-left: 20px; color: #475569; text-decoration: none; font-size: 14px; }
    .hero { text-align: center; padding: 90px 24px; background: linear-gradient(135deg, #eef2ff, #f5f3ff); }
    .hero h1 { font-size: 42px; letter-spacing: -0.02em; margin-bottom: 14px; }
    .hero p { color: #64748b; font-size: 18px; margin-bottom: 28px; }
    .hero button { padding: 13px 30px; font-size: 15px; background: #6366f1; color: #fff; border: none; border-radius: 10px; cursor: pointer; }
    .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 960px; margin: 0 auto; padding: 70px 24px; }
    .feature { padding: 26px; border: 1px solid #e2e8f0; border-radius: 14px; }
    .feature h3 { margin-bottom: 8px; font-size: 17px; }
    .feature p { color: #64748b; font-size: 14px; }
    footer { text-align: center; padding: 34px; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
<header>
    <strong>🚀 MyProduct</strong>
    <nav><a href="#">기능</a><a href="#">가격</a><a href="#">문의</a></nav>
</header>
<section class="hero">
    <h1>더 빠르게 만들고, 더 쉽게 편집하세요</h1>
    <p>HTML Live Editor Pro 샘플 페이지입니다. 요소를 클릭해 편집해보세요.</p>
    <button>지금 시작하기</button>
</section>
<section class="features">
    <div class="feature"><h3>⚡ 실시간 편집</h3><p>클릭 한 번으로 텍스트와 요소를 바로 수정합니다.</p></div>
    <div class="feature"><h3>🧩 템플릿</h3><p>준비된 컴포넌트와 섹션을 페이지에 끼워 넣습니다.</p></div>
    <div class="feature"><h3>📥 즉시 저장</h3><p>편집이 끝나면 깨끗한 HTML로 다운로드합니다.</p></div>
</section>
<footer>© 2026 MyProduct. All rights reserved.</footer>
</body>
</html>`;

// ============== 템플릿 라이브러리 데이터 ==============
const GS_TEMPLATES = [
    // 컴포넌트
    {
        category: 'component', name: '버튼 세트', desc: '기본 · 보조 버튼 한 쌍',
        html: `<div style="display:flex; gap:10px; padding:8px 0;"><button style="padding:10px 22px; background:#6366f1; color:#fff; border:none; border-radius:8px; font-size:14px; cursor:pointer;">기본 버튼</button><button style="padding:10px 22px; background:transparent; color:#6366f1; border:1px solid #6366f1; border-radius:8px; font-size:14px; cursor:pointer;">보조 버튼</button></div>`
    },
    {
        category: 'component', name: '카드', desc: '제목·본문·액션이 있는 기본 카드',
        html: `<div style="max-width:340px; padding:22px; border:1px solid #e2e8f0; border-radius:14px; box-shadow:0 1px 3px rgba(15,23,42,0.08); background:#fff;"><h3 style="margin:0 0 8px; font-size:17px; color:#1e293b;">카드 제목</h3><p style="margin:0 0 16px; font-size:14px; color:#64748b; line-height:1.6;">카드 내용을 여기에 작성하세요. 클릭해서 바로 편집할 수 있습니다.</p><button style="padding:8px 18px; background:#6366f1; color:#fff; border:none; border-radius:8px; font-size:13px; cursor:pointer;">자세히 보기</button></div>`
    },
    {
        category: 'component', name: '알림 배너', desc: '정보 전달용 인라인 알림',
        html: `<div style="display:flex; gap:10px; align-items:flex-start; padding:14px 16px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; color:#1d4ed8; font-size:14px;"><span>ℹ️</span><div><strong style="display:block; margin-bottom:2px;">알림 제목</strong><span style="color:#3b82f6;">전달할 안내 메시지를 여기에 작성하세요.</span></div></div>`
    },
    {
        category: 'component', name: '배지 세트', desc: '상태 표시용 배지 4종',
        html: `<div style="display:flex; gap:8px; flex-wrap:wrap; padding:6px 0;"><span style="padding:4px 12px; background:#eef2ff; color:#6366f1; border-radius:999px; font-size:12px; font-weight:600;">신규</span><span style="padding:4px 12px; background:#f0fdf4; color:#16a34a; border-radius:999px; font-size:12px; font-weight:600;">완료</span><span style="padding:4px 12px; background:#fffbeb; color:#d97706; border-radius:999px; font-size:12px; font-weight:600;">진행 중</span><span style="padding:4px 12px; background:#fef2f2; color:#dc2626; border-radius:999px; font-size:12px; font-weight:600;">긴급</span></div>`
    },
    {
        category: 'component', name: '입력 필드', desc: '레이블이 있는 텍스트 입력',
        html: `<div style="max-width:340px; padding:6px 0;"><label style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:#334155;">이름</label><input type="text" placeholder="이름을 입력하세요" style="width:100%; padding:10px 14px; border:1px solid #cbd5e1; border-radius:8px; font-size:14px; box-sizing:border-box;"></div>`
    },
    // 섹션
    {
        category: 'section', name: '히어로 섹션', desc: '큰 제목 + 설명 + CTA 버튼',
        html: `<section style="text-align:center; padding:80px 24px; background:linear-gradient(135deg, #eef2ff, #f5f3ff);"><h1 style="margin:0 0 14px; font-size:40px; letter-spacing:-0.02em; color:#1e293b;">멋진 제품을 소개합니다</h1><p style="margin:0 0 26px; font-size:17px; color:#64748b;">한 문장으로 제품의 핵심 가치를 전달하세요.</p><button style="padding:13px 30px; background:#6366f1; color:#fff; border:none; border-radius:10px; font-size:15px; cursor:pointer;">지금 시작하기</button></section>`
    },
    {
        category: 'section', name: '특징 3열', desc: '아이콘·제목·설명 3열 그리드',
        html: `<section style="display:grid; grid-template-columns:repeat(3, 1fr); gap:22px; max-width:960px; margin:0 auto; padding:56px 24px;"><div style="padding:24px; border:1px solid #e2e8f0; border-radius:14px;"><h3 style="margin:0 0 8px; font-size:16px;">⚡ 빠른 속도</h3><p style="margin:0; font-size:14px; color:#64748b;">특징에 대한 설명을 작성하세요.</p></div><div style="padding:24px; border:1px solid #e2e8f0; border-radius:14px;"><h3 style="margin:0 0 8px; font-size:16px;">🔒 안전한 보안</h3><p style="margin:0; font-size:14px; color:#64748b;">특징에 대한 설명을 작성하세요.</p></div><div style="padding:24px; border:1px solid #e2e8f0; border-radius:14px;"><h3 style="margin:0 0 8px; font-size:16px;">🎨 쉬운 사용</h3><p style="margin:0; font-size:14px; color:#64748b;">특징에 대한 설명을 작성하세요.</p></div></section>`
    },
    {
        category: 'section', name: 'CTA 배너', desc: '행동 유도 풀와이드 배너',
        html: `<section style="text-align:center; padding:52px 24px; background:#6366f1; border-radius:16px; margin:24px;"><h2 style="margin:0 0 10px; font-size:26px; color:#fff;">지금 바로 시작해보세요</h2><p style="margin:0 0 22px; font-size:15px; color:#e0e7ff;">가입은 무료이며 1분이면 충분합니다.</p><button style="padding:12px 28px; background:#fff; color:#6366f1; border:none; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer;">무료로 시작하기</button></section>`
    },
    {
        category: 'section', name: '푸터', desc: '저작권·링크가 있는 페이지 하단',
        html: `<footer style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding:30px 32px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:13px;"><span>© 2026 회사명. All rights reserved.</span><nav style="display:flex; gap:18px;"><a href="#" style="color:#64748b; text-decoration:none;">이용약관</a><a href="#" style="color:#64748b; text-decoration:none;">개인정보처리방침</a><a href="#" style="color:#64748b; text-decoration:none;">문의</a></nav></footer>`
    },
    // 페이지
    {
        category: 'page', name: '미니 랜딩 페이지', desc: '히어로 + 특징 + 푸터 구성',
        html: `<section style="text-align:center; padding:80px 24px; background:linear-gradient(135deg, #eef2ff, #f5f3ff);"><h1 style="margin:0 0 14px; font-size:40px; letter-spacing:-0.02em; color:#1e293b;">제품 이름</h1><p style="margin:0 0 26px; font-size:17px; color:#64748b;">제품의 핵심 가치를 한 문장으로 전달하세요.</p><button style="padding:13px 30px; background:#6366f1; color:#fff; border:none; border-radius:10px; font-size:15px; cursor:pointer;">시작하기</button></section><section style="display:grid; grid-template-columns:repeat(3, 1fr); gap:22px; max-width:960px; margin:0 auto; padding:56px 24px;"><div style="padding:24px; border:1px solid #e2e8f0; border-radius:14px;"><h3 style="margin:0 0 8px; font-size:16px;">⚡ 특징 1</h3><p style="margin:0; font-size:14px; color:#64748b;">설명을 작성하세요.</p></div><div style="padding:24px; border:1px solid #e2e8f0; border-radius:14px;"><h3 style="margin:0 0 8px; font-size:16px;">🧩 특징 2</h3><p style="margin:0; font-size:14px; color:#64748b;">설명을 작성하세요.</p></div><div style="padding:24px; border:1px solid #e2e8f0; border-radius:14px;"><h3 style="margin:0 0 8px; font-size:16px;">📥 특징 3</h3><p style="margin:0; font-size:14px; color:#64748b;">설명을 작성하세요.</p></div></section><footer style="text-align:center; padding:30px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:13px;">© 2026 회사명. All rights reserved.</footer>`
    },
    {
        category: 'page', name: '심플 문서', desc: '제목·부제·본문 구조의 문서 레이아웃',
        html: `<article style="max-width:720px; margin:0 auto; padding:48px 24px;"><h1 style="margin:0 0 6px; font-size:32px; color:#1e293b;">문서 제목</h1><p style="margin:0 0 28px; font-size:14px; color:#94a3b8;">작성일: 2026-01-01 · 작성자: 홍길동</p><h2 style="margin:0 0 10px; font-size:22px; color:#1e293b;">첫 번째 소제목</h2><p style="margin:0 0 22px; font-size:15px; color:#475569; line-height:1.7;">본문 내용을 작성하세요. 요소를 클릭하면 바로 편집할 수 있습니다.</p><h2 style="margin:0 0 10px; font-size:22px; color:#1e293b;">두 번째 소제목</h2><p style="margin:0; font-size:15px; color:#475569; line-height:1.7;">이어지는 본문 내용을 작성하세요.</p></article>`
    }
];

// 에디터 초기화
document.addEventListener('DOMContentLoaded', () => {
    new HTMLLiveEditor();
});
