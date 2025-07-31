import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import TurndownService from 'turndown';

const app = express();
app.use(express.json());
app.use(cors());

// List of HTML void elements that are self-closing by nature
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr'
]);

// Finds the tag that wraps the given (line, column) position in sourceText
function findTagAtPosition(sourceText, line, column, expectedTagName) {
  const lines = sourceText.split('\n');
  const lineIndex = line - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) return null;

  const tagName = expectedTagName?.toLowerCase();
  const offset = lines
    .slice(0, lineIndex)
    .reduce((acc, l) => acc + l.length + 1, 0) + (column - 1);

  const tagRegex = new RegExp(`<${tagName}\\b[^>]*?>`, 'gi');
  tagRegex.lastIndex = 0;

  let match;

  // Scan through all opening tags matching expectedTagName
  while ((match = tagRegex.exec(sourceText)) !== null) {
    const openTagStart = match.index;
    const openTagEnd = tagRegex.lastIndex;

    const isSelfClosing = VOID_ELEMENTS.has(tagName) || match[0].endsWith('/>');

    if (isSelfClosing) {
      // If the tag is self-closing, check if the cursor falls inside its bounds
      if (offset >= openTagStart && offset <= openTagEnd) {
        return {
          tagName,
          innerStart: openTagStart,
          innerEnd: openTagEnd,
          selfClosing: true
        };
      }
    } else {
      // Find the matching close tag for non-void elements
      const closeTagOffset = findMatchingCloseTag(sourceText, openTagEnd, tagName);
      if (closeTagOffset === -1) continue;

      // Check if the cursor offset is inside the opening/closing tag range
      if (offset >= openTagEnd && offset < closeTagOffset) {
        return {
          tagName,
          innerStart: openTagEnd,
          innerEnd: closeTagOffset
        };
      }
    }
  }

  return null; // No tag found containing the position
}

// Replace the content between innerStart and innerEnd in sourceText with newContent
function replaceInnerContent(sourceText, innerStart, innerEnd, newContent) {
  return sourceText.slice(0, innerStart) + newContent + sourceText.slice(innerEnd);
}

app.post('/save', (req, res) => {
  const edits = req.body;
  if (!Array.isArray(edits)) {
    return res.status(400).send('Invalid data: expected an array');
  }

  // Group edits by file path
  const changesByFile = {};

  for (const { file, loc, content, tagName, outerContent } of edits) {
    if (!loc || typeof loc !== 'string') {
      console.warn(`Skipping edit with invalid loc: ${loc}`);
      continue;
    }

    const [lineStr, colStr] = loc.split(':');
    const line = parseInt(lineStr, 10);
    const column = parseInt(colStr, 10);

    if (isNaN(line) || isNaN(column)) {
      console.warn(`Skipping edit with invalid loc format: ${loc}`);
      continue;
    }

    // Normalize file path to relative from cwd
    const relPath = file.replace(process.cwd() + path.sep, '');

    if (!changesByFile[relPath]) changesByFile[relPath] = [];

    changesByFile[relPath].push({ start: { line, column }, content, tagName, outerContent });
  }

  try {
    for (const [file, changes] of Object.entries(changesByFile)) {
      const fullPath = path.resolve(file);
      let sourceText = fs.readFileSync(fullPath, 'utf-8');

      const isMarkdown = fullPath.endsWith('.md') || fullPath.endsWith('.mdx');
      const isAstro = fullPath.endsWith('.astro')
      const lines = sourceText.split('\n');

      if (isMarkdown) {
        const { frontmatter, body, offset } = extractFrontmatter(lines);
        changes
          .sort((a, b) => b.start.line - a.start.line)
          .forEach(({ start, content, tagName }) => {
            const idx = start.line - 1 - offset;
            if (idx < 0 || idx >= body.length) {
              console.warn(`[MD] Invalid line index ${idx} for file ${file}`);
              return;
            }

            const wrapped = `<${tagName}>${content}</${tagName}>`;
            const markdown = turndownWithListContext(wrapped, tagName);
            const newLines = markdown.split('\n');

            const isHeading = /^h[1-6]$/i.test(tagName);

            if (isHeading) {
              // Only replace the line of the heading
              body.splice(idx, 1, ...newLines);
            } else {
              // Replace entire block (until blank line or block stop)
              const { start: blockStart, end: blockEnd } = findMarkdownBlock(body, idx);
              body.splice(blockStart, blockEnd - blockStart + 1, ...newLines);
            }
          });
        console.log(frontmatter)
        const finalOutput = [...frontmatter, ...body].join('\n');
        fs.writeFileSync(fullPath, finalOutput, 'utf-8');
      } else if (isAstro) {
        // For Astro files: find tag by start line/column and replace inner content
        changes
          .sort((a, b) => b.start.line - a.start.line)
          .forEach(({ start, content, tagName }) => {
            const tagRange = findTagAtPosition(sourceText, start.line, start.column, tagName);
            if (!tagRange) {
              console.warn(`Could not find tag at ${file}:${start.line}:${start.column}`);
              return;
            }

            sourceText = replaceInnerContent(sourceText, tagRange.innerStart, tagRange.innerEnd, content);
          });

        fs.writeFileSync(fullPath, sourceText, 'utf-8');
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Error saving file:', err);
    res.status(500).send('Failed to save');
  }
});

app.listen(3000, () => {
  console.log('Edit server running at http://localhost:3000');
});

//###########################
//**** UTILITY FONCTIONS ****
//###########################

function preserveMarkdownPrefix(originalLine, newContent) {
  // Regex to capture common Markdown prefixes (headers, lists, blockquotes)
  const mdPrefixMatch = originalLine.match(/^(\s*(#{1,6}\s|[-*+]\s|>\s))/);
  if (mdPrefixMatch) {
    const prefix = mdPrefixMatch[1];
    return prefix + newContent;
  }
  // No markdown prefix found, just replace whole line
  return newContent;
}


function cleanHtmlToMarkdown(html) {
  if (typeof html !== 'string') return html;

  // Decode HTML entities
  html = html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Replace <div><br></div> or any <div> with only whitespace and <br> inside with a double line break
  html = html.replace(/<div>\s*(<br\s*\/?>)?\s*<\/div>/gi, '\n\n');

  // Replace <div>some content</div> with \n + content + \n
  html = html.replace(/<div>(.*?)<\/div>/gis, (_, inner) => {
    return '\n' + inner.trim() + '\n';
  });

  // Strip all remaining HTML tags (but preserve inner text)
  html = html.replace(/<\/?[^>]+>/g, '');

  // Collapse multiple line breaks to max two
  html = html.replace(/\n{3,}/g, '\n\n');

  // Final trim
  return html.trim();
}

// Nesting-aware search for matching close tag
function findMatchingCloseTag(sourceText, startOffset, tagName) {
  const tagRegex = new RegExp(`<${tagName}\\b[^>]*>|</${tagName}>`, 'gi');
  tagRegex.lastIndex = startOffset;

  let depth = 1;
  let match;

  while ((match = tagRegex.exec(sourceText)) !== null) {
    if (match[0].startsWith('</')) {
      depth--;
      if (depth === 0) return match.index;
    } else {
      depth++;
    }
  }

  return -1; // Not found
}

function turndownWithListContext(html, parentTag) {
  const turndown = new TurndownService({
    headingStyle: 'atx',         // Use `## Heading` style
    bulletListMarker: '-',       // Use dash for bullet lists
    codeBlockStyle: 'fenced',    // Use triple-backtick code blocks
    emDelimiter: '*',            // Use `*italic*`
    strongDelimiter: '**',       // Use `**bold**`
    hr: '---',                   // Horizontal rule style
    br: '  \n',                  // Line break: double space + newline
  });

  // Disable default list handling for nesting support
  turndown.remove('list');
  turndown.remove('listItem');

  // Custom rendering for <ul> and <ol>
  turndown.addRule('customList', {
    filter: ['ul', 'ol'],
    replacement: function (_content, node) {
      return renderList(node, 0);
    }
  });


  // Recursive rendering of lists with depth
  function renderList(node, depth) {
    const isOrdered = node.nodeName.toLowerCase() === 'ol';
    const items = Array.from(node.children).filter(c => c.nodeName.toLowerCase() === 'li');

    return items
      .map((li, i) => {
        const bullet = isOrdered ? `${i + 1}. ` : '- ';
        const indent = '    '.repeat(depth);

        const chunks = [];
        let hasNonListContent = false;

        for (const child of li.childNodes) {
          const tag = child.nodeName.toLowerCase();

          if (tag === 'ul' || tag === 'ol') {
            // Recursive nested list
            const nested = renderList(child, depth + 1);
            if (nested.trim()) {
              chunks.push('\n' + nested);
            }
          } else {
            const rendered = turndown.turndown(child.outerHTML || child.textContent || '');
            if (rendered.trim()) {
              hasNonListContent = true;
              chunks.push(rendered.trim());
            }
          }
        }

        if (!hasNonListContent && chunks.length === 0) {
          // ❌ skip empty <li> (no text content and no nested list)
          return '';
        }

        const body = chunks.join('').trim();
        return `${indent}${bullet}${body}`;
      })
      .filter(Boolean) // Remove empty strings
      .join('\n');
  }



  turndown.addRule('smartBrHandling', {
    filter: 'br',
    replacement: function (content, node, options) {
      const prev = node.previousSibling;
      const next = node.nextSibling;

      const prevIsText = prev && prev.nodeType === 3 && prev.textContent.trim().length > 0;
      const nextIsText = next && next.nodeType === 3 && next.textContent.trim().length > 0;

      if (prevIsText || nextIsText) {
        // Inline <br/>
        return '<br/>';
      } else {
        // Block-level break (e.g. <div><br/></div>)
        return '\n\n';
      }
    }
  });


  return turndown.turndown(html);
}

function findMarkdownBlock(lines, startIndex) {
  const isBlank = line => line.trim() === '';
  const isListItem = line => /^(\s*)([-+*]|\d+\.)\s+/.test(line);
  const isHeading = line => /^#{1,6}\s+/.test(line);
  const isCodeFence = line => /^```/.test(line);
  const isIndentedCode = line => /^ {4,}\S/.test(line);
  const isBlockquote = line => /^\s*>/.test(line);
  const isHtmlTag = line => /^\s*<[^ >]+.*?>/.test(line); // naive HTML/JSX block start
  const isMDXComponent = line => /^\s*<[A-Z][A-Za-z0-9]*\b/.test(line); // <Component>

  const currentLine = lines[startIndex];

  // Detect block type
  let blockType = 'paragraph';

  if (isListItem(currentLine)) blockType = 'list';
  else if (isHeading(currentLine)) blockType = 'heading';
  else if (isCodeFence(currentLine)) blockType = 'codeFence';
  else if (isIndentedCode(currentLine)) blockType = 'codeIndent';
  else if (isBlockquote(currentLine)) blockType = 'blockquote';
  else if (isMDXComponent(currentLine)) blockType = 'mdx';
  else if (isHtmlTag(currentLine)) blockType = 'html';

  let start = startIndex;
  let end = startIndex;

  // Helper to check if a line belongs to the same block
  function belongsToBlock(line) {
    if (isBlank(line)) return false;

    switch (blockType) {
      case 'list': return isListItem(line);
      case 'heading': return false; // headings are single-line
      case 'codeFence': return !isCodeFence(line);
      case 'codeIndent': return isIndentedCode(line);
      case 'blockquote': return isBlockquote(line);
      case 'html': return isHtmlTag(line) || !isBlank(line);
      case 'mdx': return isMDXComponent(line) || !isBlank(line);
      case 'paragraph':
      default:
        return (
          !isListItem(line) &&
          !isHeading(line) &&
          !isCodeFence(line) &&
          !isIndentedCode(line) &&
          !isBlockquote(line) &&
          !isMDXComponent(line) &&
          !isHtmlTag(line)
        );
    }
  }

  // Go backward
  for (let i = startIndex - 1; i >= 0; i--) {
    if (!belongsToBlock(lines[i])) break;
    start = i;
  }

  // Go forward
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (!belongsToBlock(lines[i])) break;
    end = i;
  }

  return { start, end, blockType };
}

function extractFrontmatter(lines) {
  if (lines[0].trim() === '---') {
    const endIndex = lines.slice(1).findIndex(line => line.trim() === '---');
    if (endIndex !== -1) {
      const frontmatterEnd = endIndex + 1;
      return {
        frontmatter: lines.slice(0, frontmatterEnd + 1),
        body: lines.slice(frontmatterEnd + 1),
        offset: frontmatterEnd + 1
      };
    }
  }
  return { frontmatter: [], body: lines, offset: 0 };
}

