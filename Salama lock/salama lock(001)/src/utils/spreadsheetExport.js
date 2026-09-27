function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tableHtml(rows) {
  return `
    <table>
      <tbody>
        ${rows.map((row) => `
          <tr>
            ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename.replace(/\.xlsx$/i, '.xls');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSpreadsheet(filename, sheets) {
  const content = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; }
          h2 { font-size: 16px; margin: 18px 0 8px; }
          table { border-collapse: collapse; margin-bottom: 18px; }
          td { border: 1px solid #d8e2f0; padding: 6px 8px; mso-number-format:"\\@"; }
          tr:first-child td { font-weight: 700; background: #edf3fb; }
        </style>
      </head>
      <body>
        ${sheets.map((sheet) => `
          <h2>${escapeHtml(sheet.name)}</h2>
          ${tableHtml(sheet.rows)}
        `).join('')}
      </body>
    </html>
  `;

  downloadBlob(filename, content, 'application/vnd.ms-excel;charset=utf-8');
}
