import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

// Find the tag encompassing the position line, column in the sourceText (.astro files)
function findTagAtPosition(sourceText, line, column, expectedTagName) {
  const lines = sourceText.split('\n');
  const lineIndex = line - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) return null;

  const lineText = lines[lineIndex];
  const searchStart = Math.max(0, column - 1);
  const beforeCursor = lineText.slice(0, searchStart);

  // Find last '<' before the column on this line (start of tag)
  const tagStartCol = beforeCursor.lastIndexOf('<');
  if (tagStartCol === -1) return null;

  // Calculate offset in entire source text of tag start
  let globalOffset =
    lines
      .slice(0, lineIndex)
      .reduce((acc, l) => acc + l.length + 1, 0) + // +1 for newline
    tagStartCol;

  // If expectedTagName is provided, scan backward until we find a match
  if (expectedTagName) {
    const openTagRegex = new RegExp(`<${expectedTagName}\\b[^>]*>`, 'gi');
    let searchOffset = globalOffset;

    while (searchOffset >= 0) {
      const beforeText = sourceText.slice(0, searchOffset);
      const match = [...beforeText.matchAll(openTagRegex)].pop();
      if (match) {
        globalOffset = match.index;
        break;
      }
      searchOffset -= 1;
    }
  }
  // Match opening tag
  const afterStart = sourceText.slice(globalOffset);
  const openTagMatch = afterStart.match(/^<([a-zA-Z0-9_\-]+)(\s[^>]*)?>/);
  if (!openTagMatch) return null;

  const tagName = openTagMatch[1];
  const openTagLength = openTagMatch[0].length;
  const openTagEndOffset = globalOffset + openTagLength;
  const closeTag = `</${tagName}>`;
  const closeTagOffset = sourceText.indexOf(closeTag, openTagEndOffset);
  if (closeTagOffset === -1) return null;
  const returnObject = {
    tagName,
    innerStart: openTagEndOffset,
    innerEnd: closeTagOffset,
  };
  console.log(tagName);
  return returnObject;
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

  for (const { file, loc, content, tagName } of edits) {
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

    changesByFile[relPath].push({ start: { line, column }, content, tagName });
  }

  try {
    for (const [file, changes] of Object.entries(changesByFile)) {
      const fullPath = path.resolve(file);
      let sourceText = fs.readFileSync(fullPath, 'utf-8');

      const isMarkdown = fullPath.endsWith('.md') || fullPath.endsWith('.mdx');
      const isAstro = fullPath.endsWith('.astro')
      const lines = sourceText.split('\n');

      if (isMarkdown) {
        // For Markdown: simple line-based replacement at start.line
        changes
          .sort((a, b) => b.start.line - a.start.line)
          .forEach(({ start, content }) => {
            const idx = start.line - 1;
            if (idx >= 0 && idx < lines.length) {
              const originalLine = lines[idx];
              const cleaned = cleanHtmlToMarkdown(content);
              lines[idx] = preserveMarkdownPrefix(originalLine, cleaned);
            } else {
              console.warn(`[MD] Invalid line index ${idx} for file ${file}`);
            }
          });

        fs.writeFileSync(fullPath, lines.join('\n'), 'utf-8');
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


//**** UTILITY FONCTIONS ****

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

  // Replace <div>...</div> with a newline + inner content
  html = html.replace(/<div>(.*?)<\/div>/gis, (_, inner) => {
    return '\n';
  });

  // Strip any other tags like <p>, <span>, etc.
  html = html.replace(/<\/?[^>]+>/g, '');

  // Normalize line breaks
  return html.trim();
}