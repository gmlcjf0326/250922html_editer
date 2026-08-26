// 에디터 셸 — 테마, 명령 팔레트, 뷰포트 스위처, 외부 에디터 연동, 모달, 전역 단축키

Object.assign(HTMLLiveEditor.prototype, {
    initTheme() {
        this.themeToggleBtn = document.getElementById('themeToggleBtn');
        this.applyTheme(localStorage.getItem('editorTheme') || 'light');

        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        }
    },

    applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem('editorTheme', theme);

        if (this.themeToggleBtn) {
            this.themeToggleBtn.innerHTML = gsIcon(theme === 'dark' ? 'sun' : 'moon', 16);
            this.themeToggleBtn.title = theme === 'dark' ? '라이트 테마로 전환 (Ctrl+Shift+L)' : '다크 테마로 전환 (Ctrl+Shift+L)';
        }
    },

    toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        this.applyTheme(isDark ? 'light' : 'dark');
    },

    initGluestackModules() {
        this.bindStartOptions();
        this.initRestoreCard();
        this.bindSidePanels();
        this.bindTreePanel();
        this.bindCommandPalette();
        this.bindViewportSwitcher();
        this.bindEditorDropdown();
        this.bindPathModal();
        this.bindShortcutsModal();
        this.bindSimilarDropdown();
    },

    bindSidePanels() {
        this.historyPanel = document.getElementById('historyPanel');

        const historyBtn = document.getElementById('historyBtn');
        const historyClose = document.getElementById('historyPanelClose');

        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                this.toggleSidePanel(this.historyPanel);
                this.renderHistoryPanel();
            });
        }
        if (historyClose) historyClose.addEventListener('click', () => this.historyPanel.classList.remove('open'));
    },

    toggleSidePanel(panel) {
        if (!panel) return;
        const wasOpen = panel.classList.contains('open');
        this.closeSidePanels();
        if (!wasOpen) panel.classList.add('open');
    },

    closeSidePanels() {
        [this.historyPanel, this.treePanel].forEach(panel => {
            if (panel) panel.classList.remove('open');
        });
    },

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
    },

    getCommands() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return [
            { icon: 'undo', title: '실행 취소', desc: '마지막 편집을 되돌립니다', kbd: 'Ctrl+Z', run: () => this.undo() },
            { icon: 'redo', title: '다시 실행', desc: '되돌린 편집을 다시 적용합니다', kbd: 'Ctrl+Y', run: () => this.redo() },
            { icon: 'download', title: 'HTML 다운로드', desc: '편집된 HTML을 파일로 저장합니다', kbd: '', run: () => this.downloadHTML() },
            { icon: isDark ? 'sun' : 'moon', title: isDark ? '라이트 테마로 전환' : '다크 테마로 전환', desc: '에디터 UI 테마를 전환합니다', kbd: 'Ctrl+Shift+L', run: () => this.toggleTheme() },
            { icon: 'clock', title: '히스토리 타임라인', desc: '편집 기록을 보고 특정 시점으로 이동합니다', kbd: '', run: () => { this.toggleSidePanel(this.historyPanel); this.renderHistoryPanel(); } },
            { icon: 'help', title: '단축키 가이드', desc: '사용 가능한 단축키를 확인합니다', kbd: '?', run: () => this.showShortcutsModal() },
            { icon: 'sparkle', title: 'AI 스타일 변환', desc: 'AI로 페이지 스타일을 변경합니다', kbd: '', run: () => this.showAIModal() },
            { icon: 'palette', title: '스타일 패널 열기', desc: '선택한 요소의 스타일을 편집합니다', kbd: '', run: () => this.showStylePanel() },
            { icon: 'copy', title: '요소 복제', desc: '선택한 요소를 복제합니다', kbd: 'Ctrl+D', run: () => this.duplicateElement() },
            { icon: 'copy', title: '요소 복사', desc: '선택한 요소를 클립보드에 담습니다', kbd: 'Ctrl+C', run: () => this.copySelectedElements() },
            { icon: 'copy', title: '요소 잘라내기', desc: '복사 후 원본을 삭제합니다', kbd: 'Ctrl+X', run: () => this.cutSelectedElements() },
            { icon: 'paste', title: '요소 붙여넣기', desc: '복사한 요소를 선택 뒤에 붙입니다', kbd: 'Ctrl+V', run: () => this.pasteElements() },
            { icon: 'type', title: '텍스트 편집 시작', desc: '선택 요소의 텍스트로 커서를 옮깁니다', kbd: 'Enter', run: () => this.enterTextEditMode() },
            { icon: 'trash', title: '요소 삭제', desc: '선택한 요소를 삭제합니다', kbd: 'Del', run: () => this.deleteElement() },
            { icon: 'package', title: 'div로 감싸기', desc: '선택한 요소를 div로 감쌉니다', kbd: '', run: () => this.wrapWithDiv() },
            { icon: 'unwrap', title: '감싸기 해제', desc: '선택한 요소의 자식을 밖으로 꺼냅니다', kbd: '', run: () => this.unwrapElement() },
            { icon: 'move-out', title: '부모 밖으로 이동', desc: 'div 안에 갇힌 요소를 한 단계 위로 꺼냅니다', kbd: '', run: () => this.moveOutOfParent() },
            { icon: 'move-in', title: '앞 요소 안으로 이동', desc: '바로 앞 형제 요소 안으로 집어넣습니다', kbd: '', run: () => this.nestIntoPreviousSibling() },
            { icon: 'reset', title: '인라인 스타일 초기화', desc: '선택한 요소의 인라인 스타일을 모두 지웁니다', kbd: '', run: () => this.clearInlineStyles() },
            { icon: 'maximize', title: '뷰포트: 전체 화면', desc: '미리보기를 전체 너비로 표시합니다', kbd: '', run: () => this.setViewport('full') },
            { icon: 'monitor', title: '뷰포트: 데스크톱 1440', desc: '1440px 너비로 미리봅니다', kbd: '', run: () => this.setViewport('desktop') },
            { icon: 'tablet', title: '뷰포트: 태블릿 768', desc: '768px 너비로 미리봅니다', kbd: '', run: () => this.setViewport('tablet') },
            { icon: 'phone', title: '뷰포트: 모바일 375', desc: '375px 너비로 미리봅니다', kbd: '', run: () => this.setViewport('mobile') },
            { icon: 'code', title: '외부 에디터로 열기', desc: '설정된 에디터에서 원본 파일을 엽니다', kbd: 'Ctrl+Shift+O', run: () => this.openInExternalEditor(this.preferredEditor) },
            { icon: 'folder', title: '로컬 파일 경로 설정', desc: '외부 에디터 연동을 위한 파일 경로를 설정합니다', kbd: '', run: () => this.showPathModal() }
        ];
    },

    openCommandPalette() {
        if (!this.commandPaletteOverlay) return;
        this.commandPaletteOverlay.style.display = 'flex';
        this.commandPaletteVisible = true;
        this.commandPaletteInput.value = '';
        this.renderCommandList('');
        this.commandPaletteInput.focus();
    },

    closeCommandPalette() {
        if (!this.commandPaletteOverlay) return;
        this.commandPaletteOverlay.style.display = 'none';
        this.commandPaletteVisible = false;
    },

    toggleCommandPalette() {
        if (this.commandPaletteVisible) {
            this.closeCommandPalette();
        } else {
            this.openCommandPalette();
        }
    },

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
            icon.innerHTML = gsIcon(command.icon, 16);

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
    },

    moveCommandSelection(delta) {
        if (this.cpFiltered.length === 0) return;
        this.cpActiveIndex = (this.cpActiveIndex + delta + this.cpFiltered.length) % this.cpFiltered.length;
        this.updateCommandActiveState();
    },

    updateCommandActiveState() {
        const items = this.commandPaletteList.querySelectorAll('.command-item');
        items.forEach((item, index) => {
            item.classList.toggle('active', index === this.cpActiveIndex);
        });
        const activeItem = items[this.cpActiveIndex];
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
    },

    executeCommand(command) {
        this.closeCommandPalette();
        command.run();
    },

    bindViewportSwitcher() {
        document.querySelectorAll('.viewport-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setViewport(btn.dataset.viewport));
        });
    },

    setViewport(mode) {
        if (mode === 'full') {
            delete document.body.dataset.viewport;
        } else {
            document.body.dataset.viewport = mode;
        }

        document.querySelectorAll('.viewport-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.viewport === mode);
        });
    },

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
    },

    closeEditorDropdown() {
        const dropdown = document.getElementById('openInEditorDropdown');
        if (dropdown) dropdown.classList.remove('open');
    },

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
    },

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
    },

    showPathModal() {
        if (!this.pathModal) return;
        this.pathInput.value = this.localFilePath || '';
        this.pathModal.style.display = 'flex';
        this.pathInput.focus();
    },

    hidePathModal() {
        if (this.pathModal) this.pathModal.style.display = 'none';
    },

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
    },

    showShortcutsModal() {
        if (this.shortcutsModal) this.shortcutsModal.style.display = 'flex';
    },

    hideShortcutsModal() {
        if (this.shortcutsModal) this.shortcutsModal.style.display = 'none';
    },

    isTypingContext(event) {
        const target = event.target;
        if (!target || !target.closest) return false;
        return !!target.closest('input, textarea, select, [contenteditable="true"]');
    },

    handleKeydown(event) {
        const typing = this.isTypingContext(event);
        // iframe 안의 편집용 텍스트 스팬에서 입력 중인지 (일반 입력창과 구분)
        const inEditableSpan = typing && event.target.closest && !!event.target.closest('.editable-text');

        // Escape: 어디서든 열린 UI 닫기 (텍스트 편집 중이면 편집 종료)
        if (event.key === 'Escape') {
            // 드래그 중이면 드롭 없이 취소가 최우선
            if (this.isDragging) {
                this.cancelDrag();
                return;
            }
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
            if (!typing) {
                // 단계적 해제: 다중 선택 먼저, 다음 Esc 에 단일 선택까지
                if (this.selectedElements.length > 0) {
                    this.clearMultiSelection();
                } else if (this.selectedElement) {
                    this.clearSelection();
                }
            }
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

        if (event.ctrlKey && !event.shiftKey && (event.key === 'e' || event.key === 'E')) {
            // Ctrl+E: 요소 트리
            event.preventDefault();
            this.toggleSidePanel(this.treePanel);
            this.renderTreePanel();
        } else if (event.ctrlKey && event.shiftKey && (event.key === 'l' || event.key === 'L')) {
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
        } else if (event.ctrlKey && !event.shiftKey && (event.key === 'c' || event.key === 'C')) {
            // Ctrl+C: 선택 요소 복사 (입력 중 텍스트 복사는 typing 가드가 이미 통과시켰다)
            if (this.selectedElement || this.selectedElements.length > 0) {
                event.preventDefault();
                this.copySelectedElements();
            }
        } else if (event.ctrlKey && !event.shiftKey && (event.key === 'x' || event.key === 'X')) {
            if (this.selectedElement || this.selectedElements.length > 0) {
                event.preventDefault();
                this.cutSelectedElements();
            }
        } else if (event.ctrlKey && !event.shiftKey && (event.key === 'v' || event.key === 'V')) {
            if (this.elementClipboard && this.elementClipboard.length > 0) {
                event.preventDefault();
                this.pasteElements();
            }
        } else if ((event.key === 'Enter' || event.key === 'F2')
            && !event.ctrlKey && !event.altKey && !event.shiftKey && this.selectedElement) {
            // Enter/F2: 선택 요소의 텍스트 편집으로 바로 진입
            event.preventDefault();
            this.enterTextEditMode();
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
});
