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
    },

    isTransparentColor(value) {
        const v = (value || '').replace(/\s/g, '').toLowerCase();
        return !v || v === 'transparent' || v === 'rgba(0,0,0,0)';
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
        return ['element-selected', 'element-hover', 'element-multi-selected', 'element-dragging', 'element-similar-preview', 'drop-target-highlight', 'editable-text', 'editing'];
    },

    getContentClasses(element) {
        const editorClasses = this.getEditorClasses();
        return Array.from(element.classList).filter(cls => !editorClasses.includes(cls) && !cls.startsWith('drop-indicator-'));
    }
});
