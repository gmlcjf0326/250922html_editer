/* 인라인 SVG 아이콘 — 24×24 viewBox, currentColor 스트로크.
   이모지와 달리 색·굵기가 주변 텍스트를 따라가므로 다크 모드와 활성 상태가 저절로 맞는다.
   마크업에서는 <span class="gs-ico" data-icon="download"></span> 로 쓰고,
   부팅 때 hydrateIcons() 가 한 번 훑어 주입한다. 동적으로 만드는 버튼은 gsIcon() 을 직접 부른다. */
const GS_ICONS = {
    // 파일 · 문서
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    'file-plus': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 12v6"/><path d="M9 15h6"/>',
    folder: '<path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    paste: '<rect x="8" y="4" width="8" height="4" rx="1"/><path d="M16 6h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/>',
    // 도구
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    command: '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    sparkle: '<path d="M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/>',
    square: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
    diamond: '<path d="m12 3 9 9-9 9-9-9z"/>',
    palette: '<path d="M12 3a9 9 0 1 0 9 9c0-1-1-1.5-2-1.5h-2a2 2 0 0 1 0-4h1c1 0 2-.6 2-2A3.5 3.5 0 0 0 12 3Z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="8" r="1"/><circle cx="16" cy="13" r="1"/>',
    magnet: '<path d="M6 4H3v7a9 9 0 0 0 18 0V4h-3v7a6 6 0 0 1-12 0z"/><path d="M3 8h3M18 8h3"/>',
    wrench: '<path d="M15 3a5 5 0 0 0-4.6 7L3 17.4 6.6 21l7.4-7.4A5 5 0 0 0 21 9l-3 3-3-3 3-3a5 5 0 0 0-3-3Z"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    bulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.3.3.5.7.5 1.1v1h6v-1c0-.4.2-.8.5-1.1A6 6 0 0 0 12 3Z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    heart: '<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20Z"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
    eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="m3 3 18 18"/><path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.3 3.9"/><path d="M6.3 8.1A17 17 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 3.9-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    // 테마 · 화면
    moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M2 12h3m14 0h3M4.2 19.8l2.1-2.1m11.4-11.4 2.1-2.1"/>',
    monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    tablet: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    maximize: '<path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M20 9V5a1 1 0 0 0-1-1h-4"/><path d="M4 15v4a1 1 0 0 0 1 1h4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/>',
    // 인스펙터 탭
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    type: '<path d="M4 6V4h16v2"/><path d="M12 4v16"/><path d="M9 20h6"/>',
    box: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
    // 구조 편집
    'move-out': '<rect x="3" y="8" width="12" height="13" rx="2"/><path d="M20 15V4"/><path d="m16.5 7.5 3.5-3.5 3.5 3.5"/>',
    'move-in': '<rect x="9" y="3" width="12" height="13" rx="2"/><path d="M4 8v11"/><path d="m1 15.5 3 3.5 3-3.5"/>',
    package: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5"/><path d="M12 12v9"/>',
    unwrap: '<path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M20 8V5a1 1 0 0 0-1-1h-3"/><path d="M4 16v3a1 1 0 0 0 1 1h3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M9 12h6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    reset: '<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.2-9.3L3 7"/>',
    undo: '<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.2-9.3L3 7"/>',
    redo: '<path d="M21 7v6h-6"/><path d="M20.5 13a9 9 0 1 1-2.2-9.3L21 7"/>',
    'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    'arrow-down': '<path d="m19 12-7 7-7-7"/><path d="M12 5v14"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5A2.5 2.5 0 1 1 12 12v2"/><path d="M12 17.5h.01"/>',
    // 정렬
    'align-left': '<path d="M4 6h16M4 12h10M4 18h13"/>',
    'align-center': '<path d="M4 6h16M7 12h10M6 18h12"/>',
    'align-right': '<path d="M4 6h16M10 12h10M7 18h13"/>',
    'align-justify': '<path d="M4 6h16M4 12h16M4 18h16"/>',
    // 상태
    check: '<path d="m5 13 4 4 10-10"/>',
    warning: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
};

function gsIcon(name, size = 16) {
    const body = GS_ICONS[name];
    if (!body) return '';
    return `<svg class="gs-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" `
        + `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" `
        + `aria-hidden="true">${body}</svg>`;
}

// data-icon 이 달린 자리를 한 번 훑어 SVG 를 채운다 (이미 채워진 곳은 건너뛴다)
function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
        if (el.firstElementChild) return;
        const size = parseInt(el.dataset.iconSize, 10) || 16;
        el.innerHTML = gsIcon(el.dataset.icon, size);
    });
}
