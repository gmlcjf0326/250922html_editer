const { test, expect } = require('@playwright/test');
const { openEditor } = require('./helpers');

test.describe('요소 트리 사이드바', () => {
  test('Ctrl+E 로 열리고 문서 구조가 편집용 마크업 없이 표시된다', async ({ page }) => {
    await openEditor(page, 'editing.html');

    await page.keyboard.press('Control+e');
    const tree = await page.evaluate(() => ({
      open: document.getElementById('treePanel').classList.contains('open'),
      labels: Array.from(document.querySelectorAll('#treeList .tree-label')).map((el) => el.textContent),
      html: document.getElementById('treeList').innerHTML,
    }));
    expect(tree.open).toBe(true);
    expect(tree.labels).toContain('div#wrap');
    expect(tree.labels).toContain('h1');
    expect(tree.labels).toContain('p.note');
    expect(tree.html).not.toContain('editable-text');
    expect(tree.html).not.toContain('data-editor-ui');
  });

  test('트리 노드를 클릭하면 그 요소가 선택되고, 선택 노드가 하이라이트된다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    await page.keyboard.press('Control+e');

    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#treeList .tree-row'));
      rows.find((row) => row.querySelector('.tree-label').textContent === 'ul').click();
    });

    const state = await page.evaluate(() => ({
      selectedTag: window.htmlEditor.selectedElement.tagName,
      currentLabel: document.querySelector('#treeList .tree-row.current .tree-label').textContent,
    }));
    expect(state.selectedTag).toBe('UL');
    expect(state.currentLabel).toBe('ul');
  });

  test('접기/펼치기가 동작하고, 접힌 가지의 선택은 조상이 자동으로 펼쳐 보여준다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    await page.keyboard.press('Control+e');

    // #wrap 접기
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#treeList .tree-row'));
      rows.find((row) => row.querySelector('.tree-label').textContent === 'div#wrap')
        .querySelector('.tree-caret').click();
    });
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('#treeList .tree-label'))
      .map((el) => el.textContent).includes('h1'))).toBe(false);

    // 접힌 가지 안의 요소를 (캔버스에서) 선택하면 트리가 조상을 펼쳐 드러낸다
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('h1'));
      window.htmlEditor.renderTreePanel();
    });
    expect(await page.evaluate(() => {
      const current = document.querySelector('#treeList .tree-row.current .tree-label');
      return current && current.textContent;
    })).toBe('h1');
  });

  test('요소를 삭제하면 트리에서도 사라진다', async ({ page }) => {
    await openEditor(page, 'editing.html');
    await page.keyboard.press('Control+e');
    await page.evaluate(() => {
      const doc = document.getElementById('previewFrame').contentDocument;
      window.htmlEditor.selectElement(doc.querySelector('ul'));
      window.htmlEditor.deleteElement();
    });

    await expect
      .poll(() => page.evaluate(() => Array.from(document.querySelectorAll('#treeList .tree-label'))
        .map((el) => el.textContent).includes('ul')))
      .toBe(false);
  });
});
