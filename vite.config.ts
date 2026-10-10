import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    'global': 'globalThis'
  },
  resolve: {
    alias: {
      'buffer': 'buffer/'
    }
  },
  worker: {
    format: 'es'
  },
  server: {
    watch: {
      // ignore latex artifacts and texlive cache to prevent hot reload on file save
      ignored: [
        '**/*.tex', '**/*.bib', '**/*.bbl', '**/*.aux', '**/*.log',
        '**/*.blg', '**/*.out', '**/*.toc', '**/*.lof', '**/*.lot',
        '**/*.fls', '**/*.fdb_latexmk', '**/*.bcf', '**/*.run.xml',
        '**/static/texlive/cache/**'
      ]
    },
    fs: {
      // the app reads its version from package.json, the dev server only
      // hands out src and node_modules unless told otherwise
      allow: ['package.json']
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.keep': 'text'
      }
    }
  }
});
