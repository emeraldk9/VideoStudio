import { createHash } from 'node:crypto';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { aliases } from './build/aliases.cjs';

function devCspInlineScriptHashes(): Plugin {
  return {
    name: 'dev-csp-inline-script-hashes',
    apply: 'serve',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
          (match) => `'sha256-${createHash('sha256').update(match[1], 'utf8').digest('base64')}'`,
        );
        return html.replace(
          /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/,
          (_whole, open: string, content: string, close: string) => {
            const updated = content.replace(/script-src [^;]*/, (directive) => {
              const missing = hashes.filter((hash) => !directive.includes(hash));
              return missing.length > 0 ? `${directive} ${missing.join(' ')}` : directive;
            });
            return `${open}${updated}${close}`;
          },
        );
      },
    },
  };
}

export default defineConfig(async () => {
  const { default: tailwindcss } = await import('@tailwindcss/vite');
  return {
    plugins: [react(), tailwindcss(), devCspInlineScriptHashes()],
    resolve: {
      alias: aliases,
    },
  };
});
