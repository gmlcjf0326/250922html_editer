// 공용 유틸리티 — 색 변환, 토스트, 직렬화 등 다른 모듈이 두루 쓰는 helper

Object.assign(HTMLLiveEditor.prototype, {
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },

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
    },

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icon = {
            success: 'check',
            error: 'x',
            warning: 'warning',
            info: 'info'
        }[type] || 'info';

        toast.innerHTML = `<span class="toast-icon">${gsIcon(icon, 16)}</span><span>${message}</span>`;
        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    isTransparentColor(value) {
        const v = (value || '').replace(/\s/g, '').toLowerCase();
        return !v || v === 'transparent' || v === 'rgba(0,0,0,0)';
    },

    formatRelativeTime(timestamp) {
        const diff = Date.now() - timestamp;
        const min = Math.floor(diff / 60000);
        if (min < 1) return '방금 전';
        if (min < 60) return `${min}분 전`;
        const hour = Math.floor(min / 60);
        if (hour < 24) return `${hour}시간 전`;
        return `${Math.floor(hour / 24)}일 전`;
    },

    formatComputedHint(value) {
        return value.replace(/(-?[\d.]+)px/g, (match, num) => `${Math.round(parseFloat(num))}px`);
    },

    normalizeFontName(stack) {
        return (stack || '').split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
    },

    normalizeFontWeight(value) {
        const v = (value || '').toString().toLowerCase();
        if (v === 'bold') return '700';
        if (v === 'normal') return '400';
        return v;
    },

    isElementVisible(element) {
        if (!element) return false;

        try {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        } catch (e) {
            return false;
        }
    },

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
    },

    // 히스토리 스냅숏용 — 편집용 오버레이는 문서 상태가 아니므로 뺀다
    serializeDocumentForSnapshot(doc) {
        const clone = doc.documentElement.cloneNode(true);
        clone.querySelectorAll('[data-editor-ui]').forEach(node => node.remove());

        let doctype = '';
        if (doc.doctype) {
            const dt = doc.doctype;
            doctype = '<!DOCTYPE ' + dt.name
                + (dt.publicId ? ` PUBLIC "${dt.publicId}"` : '')
                + (!dt.publicId && dt.systemId ? ' SYSTEM' : '')
                + (dt.systemId ? ` "${dt.systemId}"` : '') + '>\n';
        }
        return doctype + clone.outerHTML;
    },

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
    },

    getEditorClasses() {
        return ['element-selected', 'element-hover', 'element-multi-selected', 'element-dragging', 'element-similar-preview', 'drop-target-highlight', 'drop-target-inside', 'editable-text', 'editing'];
    },

    // "p.note" 형태의 짧은 설명 — 드래그 가이드처럼 사람이 읽는 자리용
    describeElementBrief(element) {
        if (!element || !element.tagName) return '';
        const tag = element.tagName.toLowerCase();
        const id = element.id ? '#' + element.id : '';
        const classes = this.getContentClasses(element).slice(0, 2);
        return tag + id + (classes.length ? '.' + classes.join('.') : '');
    },

    getContentClasses(element) {
        const editorClasses = this.getEditorClasses();
        return Array.from(element.classList).filter(cls => !editorClasses.includes(cls) && !cls.startsWith('drop-indicator-'));
    }
});
