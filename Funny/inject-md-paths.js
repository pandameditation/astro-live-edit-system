//THIS FILE IS NOT NECESSARY ANYMORE SINCE WE CAN HAVE A REMARK PLUGIN USING FILENAME DIRECTLY
// I spent some time to try to automatically inject the full path into the front matter of all md files and it worked but was not necessary


// import { subscribe } from '@parcel/watcher';
// import matter from 'gray-matter';
// import fs from 'fs/promises';
// import path from 'path';
// import fg from 'fast-glob';

// const SRC_PATH = path.resolve('src');
// const EXTENSIONS = ['md', 'mdx'];
// const FRONTMATTER_KEY = '_sourcePath';

// // Normalize file path to project-relative posix style
// function normalizePath(filePath) {
//     return path.relative(process.cwd(), filePath).split(path.sep).join('/');
// }

// // Update frontmatter with the source path
// async function updateFrontmatter(filePath) {
//     try {
//         const content = await fs.readFile(filePath, 'utf8');
//         const parsed = matter(content);

//         const relativePath = normalizePath(filePath);

//         if (parsed.data[FRONTMATTER_KEY] !== relativePath) {
//             parsed.data[FRONTMATTER_KEY] = relativePath;
//             const updated = matter.stringify(parsed.content, parsed.data);
//             await fs.writeFile(filePath, updated, { encoding: 'utf8' });
//             console.log(`✅ Updated: ${relativePath}`);
//         }
//     } catch (err) {
//         console.warn(`⚠️ Failed to update ${filePath}: ${err.message}`);
//     }
// }

// // (Optional) Remove frontmatter info if needed — implement as needed
// async function removeFrontmatterInfo(filePath) {
//     // For now, no-op or implement if you want to clean frontmatter on unlink/move
//     // e.g. could remove _sourcePath or log removal
//     const relativePath = normalizePath(filePath);
//     console.log(`🗑️ File removed or moved: ${relativePath}`);
// }

// // Initial scan of all files
// async function initialScan() {
//     const patterns = EXTENSIONS.map(ext => `src/**/*.${ext}`);
//     const files = await fg(patterns);
//     console.log(`🔍 Found ${files.length} files initially: ${files.map(normalizePath).join(', ')}`);
//     await Promise.all(files.map(file => updateFrontmatter(path.resolve(file))));
// }

// // Watch for changes using @parcel/watcher
// async function watch() {
//     await subscribe(SRC_PATH, async (err, events) => {
//         if (err) {
//             console.error('Watcher error:', err);
//             return;
//         }

//         for (const event of events) {
//             const ext = path.extname(event.path).slice(1);
//             if (!EXTENSIONS.includes(ext)) continue;

//             const eventPath = path.resolve(event.path);
//             switch (event.type) {
//                 case 'create':
//                 case 'update':
//                     await updateFrontmatter(eventPath);
//                     break;
//                 case 'move':
//                     if (event.oldPath) {
//                         await removeFrontmatterInfo(path.resolve(event.oldPath));
//                     }
//                     await updateFrontmatter(eventPath);
//                     break;
//                 case 'delete':
//                     await removeFrontmatterInfo(eventPath);
//                     break;
//             }
//         }
//     }, {
//         ignore: ['**/node_modules/**', '**/.git/**'],
//     });

//     console.log('👀 Watching for .md/.mdx file changes...');
// }

// // Main execution
// async function main() {
//     await initialScan();
//     await watch();
// }

// main().catch(console.error);
