# 에디터 현황 진단 및 개선 계획

작성일: 2026-08-19 · 대상 커밋: `c3fcf29` (main)

## 요약

PR #3(`3992b8f`)에서 새 UI 셸(HTML/CSS)과 생성자 초기화 코드만 머지되고 **자바스크립트 구현이 통째로 빠진 상태**입니다. 그 결과 현재 main은:

- 페이지 로드 시마다 `TypeError: this.initTheme is not a function` 발생 (헤드리스 Chromium으로 재현 확인)
- 상단 툴바의 신규 버튼(템플릿·에셋·히스토리·원본편집·테마·명령팔레트 등)과 시작 화면 옵션 3종이 **전부 무반응**
- 기존 기능(업로드, 요소 선택/이동/복제/삭제, 스타일 패널, 실행취소, 다운로드)은 이벤트 바인딩이 예외 발생 이전에 완료되는 덕분에 우연히 동작

즉 "동작하는 구버전 + 죽어있는 신버전 UI"가 겹쳐진 상태이며, 최우선 과제는 앱을 다시 일관된 상태로 복구하는 것입니다.

---

## 발견된 문제

### P0 — 치명 (앱이 깨져 보이는 원인)

| # | 문제 | 근거 |
|---|------|------|
| 1 | 생성자가 미정의 메서드 `initTheme()`, `initGluestackModules()`를 호출 → 매 로드마다 uncaught TypeError | `script.js:53-54`, 파일 전체에 정의 없음 |
| 2 | 신규 UI 전체가 데드 코드: 시작 옵션 3버튼(빈 페이지/샘플/로컬 열기), 최근 파일, 템플릿 패널, 에셋 팔레트, 히스토리 패널, 명령 팔레트(Ctrl+K), Monaco 모달, 단축키 모달, 경로 설정 모달, 테마 토글, 뷰포트 스위처, 자동저장 배너, 원본편집 드롭다운 — **이벤트 바인딩과 구현이 전무** | `index.html:29-142, 484-629`에 마크업만 존재. 클릭 무반응 재현 확인 |

### P1 — 기능 버그

| # | 문제 | 근거 |
|---|------|------|
| 3 | 컨텍스트 메뉴의 유사 선택 4항목(`select-same-tag` 등)과 플로팅 툴바 🧲 버튼, `similarDropdown`에 대응하는 핸들러 케이스가 없음 → 클릭해도 아무 일 없음 | `script.js:2004-2035` (handleContextMenuClick), `script.js:2082-2098` (handleToolbarClick) |
| 4 | 단축키 가이드에 표기된 다수가 미구현: Ctrl+K, Ctrl+D(복제), Ctrl+A(같은 태그), Alt+클릭, Ctrl+Shift+클릭, Ctrl+Shift+O, Ctrl+Shift+L, `?`, ↑/↓(요소 이동) | `script.js:1451-1488` (handleKeydown에 해당 분기 없음) |
| 5 | 키보드 단축키가 부모 document에만 바인딩되어 **iframe(편집 영역)에 포커스가 있으면 동작하지 않음** — 실사용 중 대부분의 시간 | `script.js:131` (iframe doc에는 keydown 미등록) |
| 6 | `processTextNodes`가 `textarea`, `pre`, `code`, `svg` 내부 텍스트까지 contenteditable `<span>`으로 감쌈 → textarea 값 파괴, pre/code 레이아웃 변형 | `script.js:1067-1082` 제외 목록에 script/style/meta/title/link만 존재. textarea 훼손 재현 확인 |
| 7 | 히스토리 스냅샷과 다운로드가 `documentElement.outerHTML`만 저장 → **DOCTYPE 소실**. 첫 undo 이후 quirks mode 렌더링, 다운로드 파일에도 DOCTYPE 없음 | `script.js:1155`, `script.js:2449` |
| 8 | 드래그앤드롭: 드롭 대상이 드래그 요소의 자손인지 검증하지 않음 → 컨테이너를 자기 자식 위에 드롭하면 `HierarchyRequestError`. 또한 마우스를 움직이지 않아도 150ms 홀드만으로 드래그 시작 | `script.js:572-585` (자손 체크 없음), `script.js:495-497` |
| 9 | 다중 선택(Shift+클릭): `.element-multi-selected` 스타일이 부모 `style.css`에만 있고 iframe에는 주입되지 않아 **시각 피드백이 전혀 없음**. 게다가 스타일 패널·삭제·복제 등 모든 동작이 `selectedElement` 단일 요소만 대상으로 해 다중 선택으로 할 수 있는 일이 없음 | `script.js:396-454` (injectEditorStyles에 해당 클래스 없음), `script.js:739-747` |
| 10 | 요소 선택 상태에서 `P`/`C`/←/→ 키를 전역에서 가로챔 → 부모 문서의 입력창(AI 프롬프트, 템플릿 검색, 경로 입력)에 해당 문자를 입력할 수 없음 | `script.js:1463-1482` (입력 요소 포커스 가드 없음) |
| 11 | 이미지 추가가 `via.placeholder.com` 사용 — 서비스 종료로 항상 깨진 이미지 | `script.js:2167` |
| 12 | `renderHTML`의 onload 레이스: `src` 할당 후 `onload`를 설정하므로 타이밍에 따라 미리보기가 빈 화면이 될 수 있음 | `script.js:363-365` |

### P2 — 보안·품질

| # | 문제 | 근거 |
|---|------|------|
| 13 | 업로드된 HTML의 `<script>`가 `doc.write`로 **에디터와 same-origin으로 실행**됨 → 악성 HTML 파일이 localStorage에 저장된 AI API 키를 탈취 가능. undo/redo마다 재실행됨 | `script.js:369-371`, iframe에 sandbox 속성 없음 |
| 14 | "API 키는 외부로 전송되지 않습니다" 문구가 부정확 (선택한 AI 제공사로 전송됨) + localStorage 평문 저장 | `index.html:379`, `script.js:770-772` |
| 15 | AI 모델명 구식·하드코딩: `gemini-1.5-flash`, `claude-3-haiku-20240307`, `gpt-3.5-turbo`. HTML 컨텍스트도 3,000자에서 단순 절단 | `script.js:860-915` |
| 16 | undo/redo마다 iframe 전체 재로드(`doc.write`) → 느리고 스크롤 위치 소실. 복원 실패 시 `findFirstVisibleElement`가 **임의의 첫 요소를 자동 선택**하는 의외의 동작 | `script.js:1279-1432` |
| 17 | 히스토리가 전체 문서 outerHTML 스냅샷 20개 — 큰 문서에서 메모리 낭비 | `script.js:1145-1171` |
| 18 | body 캡처 위임과 요소별 개별 리스너(`setupElementEventListeners`)가 공존 → 추가/복제된 요소는 클릭 핸들러가 중복 실행 | `script.js:1522-1586` vs `script.js:2203-2242` |
| 19 | `style.css`에 `.element-multi-selected`가 서로 다른 색으로 2회 정의(1164행, 2235행), 사용처 없는 상태 필드 다수(`fileHandle`, `autosaveTimer`, `iconCache` 등) | `style.css`, `script.js:37-46` |
| 20 | 구조적 부채: 단일 클래스 2,490줄, 모듈 분리·테스트·린트·CI 전무. README가 신규 UI를 전혀 반영하지 못함 | 저장소 전체 |

---

## 개선 계획

### Phase 1 — 앱 복구 (최우선, 규모: 소~중) ✅ 구현 완료

목표: 콘솔 에러 0, 화면에 보이는 모든 컨트롤이 동작하거나 사라지게.

> 2026-08-19 구현 완료. 헤드리스 Chromium 검증 19항목 전체 통과 (로드 에러 0).
> 추가로 P1 일부를 선반영: 입력창 포커스 시 단축키 가드(#10), Ctrl+D 복제·↑/↓ 요소 이동 단축키.
> Monaco·에셋 팔레트·유사 선택·자동저장·최근 파일은 Phase 2 전까지 UI에서 숨김 처리.

1. `initTheme()` 구현: `localStorage` 테마 저장/복원 + `themeToggleBtn` 토글 + `data-theme` 속성 적용 (CSS는 이미 준비됨).
2. `initGluestackModules()` 구현 — 최소 범위:
   - 시작 옵션: 빈 페이지/샘플 템플릿으로 시작, 로컬 파일 열기(File System Access API, 미지원 브라우저는 버튼 숨김)
   - 패널 open/close 토글: 템플릿·에셋·히스토리 패널, 원본편집 드롭다운
   - 단축키 모달(`?` 버튼·키), 명령 팔레트(Ctrl+K, 기존 동작들 호출)
   - 뷰포트 스위처(iframe 너비 전환)
3. 당장 구현하지 않을 항목(Monaco, 자동저장, 최근 파일, 아이콘 라이브러리 등)은 **UI에서 숨기거나 "준비 중" 표시** — 허위 UI 제거가 원칙.
4. 단축키 가이드 모달을 실제 구현과 일치하도록 수정(구현하거나 표기 삭제).

### Phase 2 — 핵심 버그 수정 (규모: 중) ✅ 구현 완료

> 2026-08-19 구현 완료. 헤드리스 Chromium 검증 16항목 전체 통과, Phase 1 스위트 19항목 회귀 통과.
> 텍스트 편집 스팬에 포커스가 있어도 Ctrl+D / Ctrl+Shift+L/O는 동작하고, Escape가 텍스트 편집을
> 종료하며, 다중 선택 생성 시 텍스트 포커스를 자동 해제해 Delete가 바로 동작하도록 조정.
> Alt+클릭 / Ctrl+Shift+클릭 범위 선택 / Ctrl+A 도 함께 구현되어 단축키 가이드에 복원됨.
>
> 신규 발견(추후 개선): 상단 중앙의 뷰포트 스위처가 부모 문서 오버레이라서 바로 아래 영역의
> iframe 콘텐츠 클릭을 가로챔 — 접기/자동 숨김 등은 Phase 4 UX 개선에서 다룰 것.

5. DOCTYPE 보존: 스냅샷/다운로드 시 `<!DOCTYPE html>` + outerHTML로 직렬화 (#7).
6. `processTextNodes` 제외 목록에 `textarea`, `pre`, `code`, `svg`, `noscript`, `select/option` 추가 (#6).
7. iframe 문서에도 keydown 리스너 등록 + 부모/iframe 공히 입력 요소 포커스 시 단축키 무시 가드 (#5, #10).
8. 드롭 대상이 드래그 요소의 자손이면 무효 처리(`draggedElement.contains(target)`), 드래그 시작을 "이동 거리 5px 초과"로 통일 (#8).
9. `injectEditorStyles`에 `.element-multi-selected` 추가 + 스타일 패널·삭제·복제가 다중 선택 전체에 적용되도록 확장 (#9).
10. 유사 선택 기능 구현(컨텍스트 메뉴 4항목 + 🧲 버튼 + similarDropdown) — 다중 선택 배열에 채워 넣는 방식 (#3).
11. placeholder 이미지를 인라인 SVG data URI로 교체 (#11).
12. `renderHTML`에서 onload를 src 할당 전에 설정하거나 `srcdoc` 방식으로 전환 (#12).

### Phase 3 — 보안·AI 개선 (규모: 소~중) ✅ 구현 완료

> 2026-08-19 구현 완료. 헤드리스 Chromium 검증 16항목 통과, Phase 1·2 스위트(35항목) 회귀 통과.
> iframe은 기본 `sandbox="allow-same-origin"`으로 문서 스크립트를 차단하고(편집 기능은 전부
> 정상 동작 확인), `<script>` 포함 문서 로드 시 사용자 동의로만 `allow-scripts`를 추가함.
> 다운로드 파일에는 원본 스크립트가 그대로 보존됨. AI 기본 모델은 Gemini `gemini-2.5-flash`,
> Claude `claude-opus-5`, GPT `gpt-4o-mini`로 갱신했고, AI 모달의 "모델명" 입력으로 프로바이더별
> 재정의 가능(localStorage). AI에는 편집용 스팬·에디터 클래스·스크립트를 제거한 정리된 HTML을
> 전송하며, HTTP 오류와 Claude `stop_reason: "refusal"`을 명시적으로 처리함.

13. iframe에 `sandbox="allow-same-origin"`(스크립트 차단)을 기본 적용하고, 스크립트 실행이 필요한 경우 사용자 확인 후 허용 (#13).
14. API 키 안내 문구를 "키는 브라우저(localStorage)에 저장되며, 선택한 AI 제공사에만 전송됩니다"로 수정 (#14).
15. AI 모델명을 최신 세대로 갱신하고 설정에서 변경 가능하게 상수 분리. 컨텍스트는 단순 절단 대신 선택 요소 중심 요약 전달 (#15).

### Phase 4 — 아키텍처·품질 (규모: 대, 점진 진행)

16. `script.js`를 ES 모듈로 분할: `editor-core`, `selection`, `history`, `style-panel`, `ai`, `panels`, `utils` 등.
17. 히스토리를 전체 스냅샷에서 필요 시 diff 기반으로 개선, undo 시 iframe 재로드 대신 body 교체 + 스크롤 보존. "복원 실패 시 임의 요소 자동 선택" 제거 (#16, #17).
18. 이벤트 처리를 위임 일원화로 정리(요소별 리스너 제거) (#18).
19. `style.css` 중복 정의 정리, 미사용 상태 필드 제거 (#19).
20. Playwright 스모크 테스트(로드 에러 0, 업로드→편집→다운로드 왕복) + ESLint + GitHub Actions CI 추가.
21. README를 현재 기능 기준으로 갱신 (#20).

### 권장 진행 순서

Phase 1 → 2는 사용자 체감이 가장 크므로 한 묶음으로 먼저 진행하고, Phase 3은 배포(Netlify) 전 필수, Phase 4는 기능 추가를 멈추지 않는 선에서 점진적으로 진행하는 것을 권장합니다.
