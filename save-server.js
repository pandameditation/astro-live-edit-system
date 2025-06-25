import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

function replaceMarkdownNodeByLineColumn(sourceText, line, column, newContent) {
  const lines = sourceText.split('\n');

  // Find start of node (go up until blank line or top)
  let startLine = line - 1;
  while (startLine > 0 && lines[startLine].trim() !== '') {
    startLine--;
  }
  if (lines[startLine].trim() === '') startLine++;

  // Find end of node (go down until blank line or bottom)
  let endLine = line - 1;
  while (endLine < lines.length && lines[endLine].trim() !== '') {
    endLine++;
  }
  endLine--;

  // Replace the lines from startLine to endLine inclusive
  const before = lines.slice(0, startLine);
  const after = lines.slice(endLine + 1);
  const replacementLines = newContent.split('\n');

  return [...before, ...replacementLines, ...after].join('\n');
}

function replaceAstroNodeByLineColumn(sourceText, line, column, newContent) {
  const lines = sourceText.split('\n');
  const totalLines = lines.length;

  // Find start of tag (search backwards from line)
  let startLine = line - 1;
  while (startLine >= 0) {
    if (lines[startLine].includes('<')) {
      // naive check if this line contains a tag start before or at the column
      const tagPos = lines[startLine].indexOf('<');
      if (tagPos <= column - 1) break;
    }
    startLine--;
  }
  if (startLine < 0) startLine = 0;

  // Guess tag name (simple regex on startLine)
  const tagMatch = lines[startLine].match(/<([^\s>\/]+)/);
  if (!tagMatch) {
    throw new Error('Cannot find opening tag on startLine');
  }
  const tagName = tagMatch[1];

  // Find closing tag line by scanning forwards from startLine
  let endLine = startLine;
  const closingTag = `</${tagName}>`;
  let foundClosingTag = false;

  while (endLine < totalLines) {
    if (lines[endLine].includes(closingTag)) {
      foundClosingTag = true;
      break;
    }
    endLine++;
  }

  if (!foundClosingTag) {
    // Possibly self-closing tag - assume single line node
    endLine = startLine;
  }

  // Replace lines from startLine to endLine inclusive
  const before = lines.slice(0, startLine);
  const after = lines.slice(endLine + 1);
  const replacementLines = newContent.split('\n');

  return [...before, ...replacementLines, ...after].join('\n');
}

app.post('/save', (req, res) => {
  const edits = req.body;
  if (!Array.isArray(edits)) {
    return res.status(400).send('Invalid data');
  }

  const changesByFile = {};

  // Group changes by file
  for (const { file, loc, content } of edits) {
    // Normalize file path relative to cwd
    const relPath = file.replace(process.cwd() + path.sep, '');
    if (!changesByFile[relPath]) changesByFile[relPath] = [];
    changesByFile[relPath].push({ loc, content });
  }

  try {
    for (const [file, changes] of Object.entries(changesByFile)) {
      const fullPath = path.resolve(file);
      let sourceText = fs.readFileSync(fullPath, 'utf-8');

      for (const { loc, content } of changes) {
        const [lineStr, colStr = '1'] = loc.split(':');
        const line = parseInt(lineStr, 10);
        const column = parseInt(colStr, 10);

        if (file.endsWith('.md') || file.endsWith('.mdx')) {
          sourceText = replaceMarkdownNodeByLineColumn(sourceText, line, column, content);
        } else if (file.endsWith('.astro')) {
          sourceText = replaceAstroNodeByLineColumn(sourceText, line, column, content);
        } else {
          // fallback: replace the entire line only
          const lines = sourceText.split('\n');
          lines[line - 1] = content;
          sourceText = lines.join('\n');
        }
      }

      fs.writeFileSync(fullPath, sourceText, 'utf-8');
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Error processing edits:', err);
    res.status(500).send('Failed to save');
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Edit server running at http://localhost:${PORT}`);
});
