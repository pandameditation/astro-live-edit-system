document.addEventListener('DOMContentLoaded', () => {
  const lastSavedContent = new WeakMap();
  const editableTags = 'p, span, ul, ol, div, blockquote, h1, h2, h3, h4, h5, h6';
  const changes = [];
  markIndentableLists();

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

//For indentable lists TAB key
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Tab') return;

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const container = range.startContainer.nodeType === 1
    ? range.startContainer
    : range.startContainer.parentElement;
  const li = container.closest('li');
  if (!li || !li.closest('.data-indentable')) return;

  e.preventDefault();

  const caretOffset = getCaretCharacterOffsetWithin(li);

  if (!e.shiftKey) {
    // ➤ INDENT
    const prevLi = li.previousElementSibling;
    if (prevLi) {
      // Find the first nested list only
      const firstNestedList = li.querySelector('ul, ol');
      let remainingElements = [];

      if (firstNestedList) {
        // Collect ALL remaining elements after the first nested list
        let currentElement = firstNestedList.nextSibling;
        while (currentElement) {
          const nextElement = currentElement.nextSibling;
          if (currentElement.nodeType === 1) { // Element node
            remainingElements.push(currentElement);
          }
          currentElement = nextElement;
        }

        // Remove remaining elements from the current li (we'll put them back later)
        remainingElements.forEach(element => element.remove());
      }

      let sublist = prevLi.querySelector('ul, ol');
      if (!sublist) {
        sublist = document.createElement(prevLi.parentElement.tagName.toLowerCase());
        prevLi.appendChild(sublist);
      }

      // Move the current li to the sublist (with its first nested list intact)
      sublist.appendChild(li);

      // Put remaining elements at the SAME LEVEL as the newly indented item
      // (i.e., as siblings in the same sublist, not at the original parent level)
      if (remainingElements.length > 0) {
        remainingElements.forEach(element => {
          if (element.tagName === 'UL' || element.tagName === 'OL') {
            // This is a nested list - convert its children to list items at the current sublist level
            const listChildren = Array.from(element.children);
            listChildren.forEach(child => {
              sublist.appendChild(child); // Add to the same sublist as the indented item
            });
          } else if (element.tagName === 'LI') {
            // This is already a list item - add it to the same sublist
            sublist.appendChild(element);
          }
        });
      }
    }
  } else {
    // ➤ OUTDENT (unchanged)
    const currentList = li.parentElement;
    const parentLi = currentList.closest('li');

    if (parentLi && parentLi.parentElement) {
      const grandList = parentLi.parentElement;

      const remainingSiblings = [];
      let nextSibling = li.nextElementSibling;
      while (nextSibling) {
        const temp = nextSibling.nextElementSibling;
        remainingSiblings.push(nextSibling);
        nextSibling = temp;
      }

      grandList.insertBefore(li, parentLi.nextSibling);

      if (remainingSiblings.length > 0) {
        const newSublist = document.createElement(currentList.tagName.toLowerCase());
        remainingSiblings.forEach(sibling => {
          newSublist.appendChild(sibling);
        });
        li.appendChild(newSublist);
      }

      if (currentList.children.length === 0) {
        currentList.remove();
      }
    }
  }

  restoreCaretToOffset(li, caretOffset);
});

//Better behavior for handling backspace on a list from the browser
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Backspace') return;

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const container = range.startContainer.nodeType === 1
    ? range.startContainer
    : range.startContainer.parentElement;
  const li = container.closest('li');

  if (!li || !li.closest('.data-indentable')) return;

  // Check if cursor is at the very beginning of the list item content
  const caretOffset = getCaretCharacterOffsetWithin(li);
  if (caretOffset !== 0) return; // Not at the beginning, let normal backspace work

  e.preventDefault();

  // When backspacing at the beginning, we always want to merge with previous item
  // Check if this li has nested children that need to be preserved
  const nestedList = li.querySelector('ul, ol');
  let prevLi = li.previousElementSibling;

  // If no direct sibling, find the parent li to merge with
  if (!prevLi) {
    const currentList = li.parentElement;
    const parentLi = currentList.closest('li');
    if (parentLi) {
      prevLi = parentLi;
    }
  }

  if (prevLi) {
    // Get the content of the current li
    const currentContent = li.childNodes[0]?.textContent || '';
    const prevContentLength = prevLi.textContent.length;

    // Merge content with previous li
    if (currentContent) {
      const lastNode = prevLi.lastChild;
      if (lastNode && lastNode.nodeType === 3) {
        lastNode.textContent += currentContent;
      } else {
        prevLi.appendChild(document.createTextNode(currentContent));
      }
    }

    // If there were nested children, move them to after the merged item
    if (nestedList) {
      const parentList = prevLi.parentElement;
      parentList.insertBefore(nestedList, prevLi.nextSibling);
    }

    // Remove the current li
    li.remove();

    // Set cursor at merge point
    restoreCaretToOffset(prevLi, prevContentLength);
  }
});




//####################################
// ####### UTILITY FUNCTIONS #########
//####################################


function cleanPlusBeautifyHTML(HTML) {
  // 1. Remove unwanted attributes
  const rawHTML = HTML
  const cleaned = rawHTML
    .replace(/\sdata-source-[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
    .replace(/\scontenteditable(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
    .replace(/\sclass="[^"]*\bdata-indentable\b[^"]*"/gi, '');


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

function markIndentableLists() {
  document.querySelectorAll('ul, ol').forEach(list => {
    list.classList.add('data-indentable');
  });
}

//For better caret handling after indentation
function getCaretCharacterOffsetWithin(element) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;

  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);

  return preRange.toString().length;
}

function restoreCaretToOffset(el, offset) {
  const range = document.createRange();
  const sel = window.getSelection();

  let currentOffset = 0;
  let nodeStack = [el];
  let node;

  while (nodeStack.length && offset >= 0) {
    node = nodeStack.pop();

    if (node.nodeType === 3) {
      const textLength = node.nodeValue.length;
      if (currentOffset + textLength >= offset) {
        range.setStart(node, offset - currentOffset);
        break;
      }
      currentOffset += textLength;
    } else if (node.nodeType === 1 && node.childNodes.length) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        nodeStack.push(node.childNodes[i]);
      }
    }
  }

  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
