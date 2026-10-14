import { useEffect } from 'react';
import './searchable-table.css';

const TABLE_SELECTOR = '.cw-table-wrap, .pa-table-wrap';

export default function SearchableTables() {
  useEffect(() => {
    const enhance = (root = document) => {
      root.querySelectorAll?.(TABLE_SELECTOR).forEach((tableWrap) => {
        if (tableWrap.querySelector(':scope > .searchable-table-field')) return;
        tableWrap.classList.add('has-table-search');
        const field = document.createElement('label');
        field.className = 'searchable-table-field';
        const icon = document.createElement('span');
        icon.className = 'searchable-table-icon';
        icon.setAttribute('aria-hidden', 'true');
        const input = document.createElement('input');
        input.type = 'search';
        input.placeholder = 'Search this table…';
        input.setAttribute('aria-label', 'Search this table');
        field.append(icon, input);
        tableWrap.prepend(field);
        const filterRows = () => {
          const query = input.value.trim().toLocaleLowerCase();
          tableWrap.querySelectorAll('tbody tr').forEach((row) => {
            if (row.querySelector('td[colspan]')) return;
            row.hidden = Boolean(query) && !(row.innerText || row.textContent || '').toLocaleLowerCase().includes(query);
          });
          tableWrap.dataset.searchEmpty = String(Boolean(query) && !Array.from(tableWrap.querySelectorAll('tbody tr')).some((row) => !row.hidden && !row.querySelector('td[colspan]')));
        };
        input.addEventListener('input', filterRows);
      });
    };
    enhance();
    const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches?.(TABLE_SELECTOR)) enhance(node.parentElement || document);
        enhance(node);
      }
    })));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
