document.addEventListener('DOMContentLoaded', () => {
  const lastSavedContent = new WeakMap();
  const editableTags = 'br, p, ul, ol, div, blockquote, h1, h2, h3, h4, h5, h6';
  const changes = [];

  document.querySelectorAll(editableTags).forEach(el => {
    el.contentEditable = true;
    lastSavedContent.set(el, el.innerHTML);


    el.addEventListener('blur', () => {
      //Check that it has changed since last time
      const last = lastSavedContent.get(el);
      if (last === el.innerHTML) {
        return; //current innerHTML is same as last. No change detected
      }
      lastSavedContent.set(el, el.innerHTML);

      // If there are changes, Save and send them to server
      const file = el.getAttribute('data-source-file');
      const loc = el.getAttribute('data-source-loc');
      const tagName = el.tagName.toLowerCase();

      const content = cleanPlusBeautifyHTML(el.innerHTML);
      if (!file || !loc || !content) return;

      const index = changes.findIndex(change => change.file === file && change.loc === loc);
      if (index !== -1) {
        // Update existing entry
        changes[index].content = content;
      } else {
        // Add new entry
        changes.push({ file, loc, tagName, content });
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
    console.log('Sending changes:', JSON.stringify(changes, null, 2));
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



//####################################
// ####### UTILITY FUNCTIONS #########
//####################################


function cleanPlusBeautifyHTML(HTML) {
  // 1. Remove unwanted attributes
  const rawHTML = HTML
  const cleaned = rawHTML
    .replace(/\sdata-source-[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
    .replace(/\scontenteditable(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');

  // 2. Decode entities without DOM pollution
  const decodeHTML = (html) => {
    const el = document.createElement('div');
    el.style.display = 'none';
    document.body.appendChild(el);
    el.innerHTML = html;
    const decoded = el.innerHTML;
    el.remove();
    return decoded;
  };

  let decoded = decodeHTML(cleaned);

  // 3. Transform <div>text</div> into <br/>text
  decoded = decoded.replace(/<div>(.*?)<\/div>/gis, (_, inner) => {
    return `<br/>${inner.trim()}`;
  });


  function simpleBeautify(html) {
    const indent = '  ';
    let level = 0;
    return html
      .replace(/>\s*</g, '>\n<') // break tags onto lines
      .split('\n')
      .map(line => {
        const trimmedLine = line.trim();

        if (/^<\/\w/.test(trimmedLine)) {
          level = Math.max(0, level - 1);
        }

        const padded = indent.repeat(level) + trimmedLine;

        if (/^<\w[^>]*[^/>]>$/.test(trimmedLine)) {
          level++;
        }

        return padded;
      })
      .join('\n')
      .trim();
  }


  const prettyHTML = simpleBeautify(decoded);
  return prettyHTML
}