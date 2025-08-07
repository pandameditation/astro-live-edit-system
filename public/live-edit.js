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

//Allow editing indentable lists by pressing TAB
document.addEventListener('keydown', function (e) {

  // Fix TAB indentation behavior 
  if (e.key !== 'Tab') return;

  // Check if caret is at the first list item and collapsed (not selecting)


  // Get selection and get list container
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const container = range.startContainer.nodeType === 1
    ? range.startContainer
    : range.startContainer.parentElement;

  const li = container.closest('li');
  if (!li || !li.closest('.data-indentable')) return;

  if (isCaretInsideFirstLi()) return; //allow to move focus out

  e.preventDefault();

  // Get all top-level <li> siblings that are part of the selection
  const listRoot = li.closest('.data-indentable');
  const selectedLis = Array.from(listRoot.querySelectorAll('li')).filter(li => {
    return sel.containsNode(li, true) &&
      !Array.from(li.querySelectorAll('li')).some(childLi => sel.containsNode(childLi, true));
  });

  const targets = selectedLis.length > 0 ? selectedLis : [li];
  targets.forEach(li => {
    //Prevent focus lost bug when indenting an empty li
    if (li && li.textContent.trim() === '') {
      li.innerHTML = '&nbsp;';
    }
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

//For better caret handling after indentation
function getCaretCharacterOffsetWithin(element) {
  const sel = window.getSelection();
  let caretOffset = 0;
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    caretOffset = preCaretRange.toString().length;
  }
  return caretOffset;
}

function isCaretInsideFirstLi() {
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;

  let node = sel.getRangeAt(0).startContainer;

  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }

  // Step 1: Find initial ul/ol.data-indentable containing the caret
  let candidateList = node.closest('ul.data-indentable, ol.data-indentable');
  if (!candidateList) return false;

  // Step 2: Walk up to the topmost ul/ol.data-indentable that contains the caret
  let topList = candidateList;
  while (true) {
    const parentList = topList.parentElement?.closest('ul.data-indentable, ol.data-indentable');
    if (!parentList || !parentList.contains(node)) break;
    topList = parentList;
  }

  // Step 3: Check that topList does NOT have an ancestor with contenteditable="true"
  let ancestor = topList.parentElement;
  while (ancestor) {
    if (ancestor.getAttribute && ancestor.getAttribute('contenteditable') === 'true') {
      return false;
    }
    ancestor = ancestor.parentElement;
  }

  // Step 4: Get first direct li child of topList
  const firstLi = topList.querySelector(':scope > li');
  if (!firstLi) return false;

  // Step 5: Confirm caret is inside firstLi
  if (!firstLi.contains(node)) return false;

  // Step 6: Check if there is a nested list inside firstLi
  const firstNestedList = firstLi.querySelector('ul, ol');
  if (!firstNestedList) return true;

  // Step 7: Check caret position relative to firstNestedList
  const pos = node.compareDocumentPosition(firstNestedList);
  return !!(pos & Node.DOCUMENT_POSITION_FOLLOWING);
}


