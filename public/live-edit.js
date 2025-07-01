document.addEventListener('DOMContentLoaded', () => {
  const editableTags = 'p, li, ul, ol, blockquote, a, h1, h2, h3, h4, h5, h6';
  const changes = [];

  document.querySelectorAll(editableTags).forEach(el => {
    el.contentEditable = true;
    el.addEventListener('blur', () => {
      const file = el.getAttribute('data-source-file');
      const loc = el.getAttribute('data-source-loc');
      //const content = getCleanedMarkdownFromElement(el.innerText);
      const content = el.innerText;

      if (file && loc && content) {
        changes.push({ file, loc, content });
      }
    });
  });

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '💾 Save';
  Object.assign(saveBtn.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    padding: '10px 20px',
    zIndex: '10000',
    background: '#222',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  });

  saveBtn.addEventListener('click', async () => {
    const response = await fetch('http://localhost:3000/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes)
    });

    if (response.ok) {
      alert('Changes saved!');
    } else {
      alert(`Save failed: ${response.status} ${response.statusText}`);
      console.log(changes)
    }
  });

  document.body.appendChild(saveBtn);
});

function getCleanedMarkdownFromElement(el) {
  let html = el.innerHTML;

  // Normalize HTML to Markdown-style text
  html = html
    .replace(/<div>(.*?)<\/div>/gis, '\n\n$1')
    .replace(/<br\s*\/?>/gi, '\n\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/<\/?p[^>]*>/gi, '')
    .trim();

  return html;
}