// 저장소 루트를 기준으로 실행한다 (npm run lint 참고)
module.exports = [
  {
    files: ['js/**/*.js', 'script.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', console: 'readonly', fetch: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', confirm: 'readonly',
        alert: 'readonly', Blob: 'readonly', URL: 'readonly', FileReader: 'readonly',
        NodeFilter: 'readonly', DOMParser: 'readonly', WeakSet: 'readonly',
        Event: 'readonly',
        // 클래식 스크립트라 파일 간에 전역으로 공유된다 (index.html 의 로드 순서 참고)
        HTMLLiveEditor: 'writable', GS_ICONS: 'writable', gsIcon: 'writable', hydrateIcons: 'writable',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^(HTMLLiveEditor|GS_ICONS|gsIcon|hydrateIcons)$' }],
      'no-undef': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly', process: 'readonly', window: 'readonly', document: 'readonly', localStorage: 'readonly', Event: 'readonly' },
    },
    rules: { 'no-unused-vars': 'warn' },
  },
];
