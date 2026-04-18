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
        // 모델 선택
        document.querySelectorAll('input[name="aiModel"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.aiSettings.model = e.target.value;
                this.loadApiKeyForModel(e.target.value);
            });
        });

        // API 키 저장
        this.apiKeyInput.addEventListener('change', (e) => {
            this.saveApiKey(this.aiSettings.model, e.target.value);
        });

        // 빠른 프롬프트
        document.querySelectorAll('.quick-prompt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.aiPrompt.value = btn.dataset.prompt;
            });
        });
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

    loadHTMLToEditor() {
        this.uploadScreen.style.display = 'none';
        this.previewFrame.style.display = 'block';
        this.topButtons.style.display = 'flex';

        this.modeIndicator.textContent = '🔧 요소편집';
        this.modeIndicator.style.color = '#007bff';

        this.renderHTML();
    }

    renderHTML() {
        const iframe = this.previewFrame;
        iframe.src = 'about:blank';

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

            // 드래그 시작 대기 (100ms 후 드래그 시작)
            this.dragStartTimeout = setTimeout(() => {
                this.startDrag(target, e);
            }, 150);
        });

        // 마우스 이동 이벤트
        doc.body.addEventListener('mousemove', (e) => {
            // 드래그 시작 전 움직임이 작으면 무시
            if (this.potentialDragElement && !this.isDragging) {
                const dx = Math.abs(e.clientX - this.dragStartPos.x);
                const dy = Math.abs(e.clientY - this.dragStartPos.y);
                if (dx < 5 && dy < 5) return;

                clearTimeout(this.dragStartTimeout);
                this.startDrag(this.potentialDragElement, e);
            }

            if (this.isDragging) {
                this.handleDragMove(e, doc);
            }
        });

        // 마우스 업 이벤트 (드래그 종료)
        doc.body.addEventListener('mouseup', (e) => {
            clearTimeout(this.dragStartTimeout);
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
        if (!this.selectedElement) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        this.stylePanel.style.display = 'block';
        this.stylePanelOpen = true;
        this.loadCurrentStyles();
    }

    hideStylePanel() {
        this.stylePanel.style.display = 'none';
        this.stylePanelOpen = false;
    }

    loadCurrentStyles() {
        if (!this.selectedElement) return;

        const computed = window.getComputedStyle(this.selectedElement);
        const style = this.selectedElement.style;

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

    applyStyle(property, value) {
        if (!this.selectedElement) {
            this.showToast('먼저 요소를 선택해주세요.', 'warning');
            return;
        }

        this.selectedElement.style[property] = value;
        this.saveToHistory(`스타일 변경: ${property}`, false);
    }

    // ============== AI 스타일 변환 ==============
    showAIModal() {
        this.aiModal.style.display = 'flex';
        this.loadApiKeyForModel(this.aiSettings.model);
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

            let targetHTML;
            if (scope === 'selected') {
                targetHTML = this.selectedElement.outerHTML;
            } else {
                targetHTML = doc.body.innerHTML;
            }

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

    async callAIAPI(model, apiKey, prompt, html) {
        const systemPrompt = `당신은 웹 디자인 전문가입니다. 사용자가 요청하는 스타일로 HTML 요소의 CSS를 생성해주세요.

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
${html.substring(0, 3000)}

사용자 요청: ${prompt}`;

        let response;

        if (model === 'gemini') {
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: systemPrompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048
                    }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return this.parseAIResponse(text);

        } else if (model === 'claude') {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 2048,
                    messages: [{ role: 'user', content: systemPrompt }]
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            const text = data.content?.[0]?.text || '';
            return this.parseAIResponse(text);

        } else if (model === 'gpt') {
            response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: '당신은 웹 디자인 전문가입니다.' },
                        { role: 'user', content: systemPrompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 2048
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

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
                this.saveToHistory('텍스트 편집', false);
            });
        });
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

    doSaveToHistory(actionName) {
        const iframe = this.previewFrame;
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        let selectedElementSelector = null;
        if (this.selectedElement) {
            selectedElementSelector = this.getElementSelector(this.selectedElement);
        }

        const snapshot = {
            html: doc.documentElement.outerHTML,
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

        this.contextMenuTarget = null;
        this.hideFloatingToolbar();
        this.hideContextualMenus();
        this.hideStylePanel();
    }

    resetAndLoadIframe(iframe, html) {
        return new Promise((resolve, reject) => {
            iframe.src = 'about:blank';

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
    }

    handleKeydown(event) {
        if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
            event.preventDefault();
            this.undo();
        } else if (event.ctrlKey && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
            event.preventDefault();
            this.redo();
        } else if (event.key === 'Escape') {
            this.hideStylePanel();
            this.hideAIModal();
            this.hideContextualMenus();
            this.clearMultiSelection();
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
        } else if (event.key === 'Delete' && this.selectedElement) {
            // Delete: 요소 삭제
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
                // Shift+클릭: 다중 선택
                this.selectElement(target, e.shiftKey);
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
    }

    handleContextMenuClick(event) {
        const action = event.target.getAttribute('data-action');
        const element = this.contextMenuTarget;

        if (!action || !element) return;

        const iframe = this.previewFrame;
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        this.hideContextualMenus();
        this.selectElement(element);

        switch (action) {
            case 'style':
                this.showStylePanel();
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
        if (!this.selectedElement) return;

        const element = this.selectedElement;
        const tagName = element.tagName.toLowerCase();

        const clone = element.cloneNode(true);
        element.parentNode.insertBefore(clone, element.nextSibling);

        this.setupElementEventListeners(clone);

        const childElements = clone.querySelectorAll('*');
        childElements.forEach(child => {
            child.removeAttribute('data-editor-initialized');
            this.setupElementEventListeners(child);
        });

        this.selectElement(clone);
        this.saveToHistory(`${tagName} 요소 복제`, true);
        this.showToast('요소가 복제되었습니다.', 'success');
    }

    deleteElement() {
        if (!this.selectedElement) return;

        const element = this.selectedElement;
        const tagName = element.tagName.toLowerCase();

        if (['html', 'head', 'body'].includes(tagName)) {
            this.showToast(`${tagName} 요소는 삭제할 수 없습니다.`, 'error');
            return;
        }

        const childCount = element.children.length;
        if (childCount > 5) {
            const confirmed = confirm(`이 ${tagName} 요소는 ${childCount}개의 자식 요소를 포함하고 있습니다. 정말 삭제하시겠습니까?`);
            if (!confirmed) return;
        }

        try {
            const parent = element.parentNode;
            if (parent) {
                parent.removeChild(element);
                this.clearSelection();
                this.saveToHistory(`${tagName} 요소 삭제`, true);
                this.showToast('요소가 삭제되었습니다.', 'success');
            }
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
        const selectedElements = clonedDoc.querySelectorAll('.element-selected, .element-hover, .element-dragging, .drop-target-highlight');
        selectedElements.forEach(element => {
            element.classList.remove('element-selected', 'element-hover', 'element-dragging', 'drop-target-highlight');
        });

        // data 속성 제거
        const markedElements = clonedDoc.querySelectorAll('[data-editor-initialized], [data-original]');
        markedElements.forEach(element => {
            element.removeAttribute('data-editor-initialized');
            element.removeAttribute('data-original');
        });

        return clonedDoc.documentElement.outerHTML;
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
}

// 에디터 초기화
document.addEventListener('DOMContentLoaded', () => {
    new HTMLLiveEditor();
});
