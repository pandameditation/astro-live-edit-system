import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { visit } from 'unist-util-visit';

const isDev = process.env.NODE_ENV === 'development';

function remarkAddSourcePathAndLine() {
  return (tree, file) => {
    const filename = file.path || ''; // Full file path
    const editableTypes = [
      'paragraph',
      'list',
      'listItem',
      'blockquote',
      'link',
      'heading'
    ];
    visit(tree, (node) => {
      if (editableTypes.includes(node.type)) {
        if (!node.data) node.data = {};
        if (!node.data.hProperties) node.data.hProperties = {};

        node.data.hProperties['data-source-file'] = filename;

        // Add line number if available
        if (node.position?.start?.line) {
          node.data.hProperties['data-source-loc'] = node.position.start.line + ":" + node.position.start.column;
        }
      }
    });
  };
}

export default defineConfig({
  integrations: [
    mdx({
      remarkPlugins: isDev ? [remarkAddSourcePathAndLine] : [],
    }),
  ],
  markdown: {
    remarkPlugins: isDev ? [remarkAddSourcePathAndLine] : [],
  },
});
