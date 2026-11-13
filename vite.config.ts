import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { precacheList } from './src/precache.ts';

const SW_ENTRY = 'sw';

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

/**
 * Writes this build's version and file list into `sw.js` (src/sw.ts), once
 * every file, public ones included, is in the output folder. The version
 * hashes the files' contents, so each deploy that changes them installs a new
 * service worker and cache.
 */
function serviceWorkerManifest(): Plugin {
  let outDir = 'dist';
  return {
    name: 'route-gpx-service-worker-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = precacheList(await listFiles(outDir));
      const hash = createHash('sha256');
      for (const file of files) {
        hash.update(file);
        hash.update(await readFile(join(outDir, file)));
      }
      const version = hash.digest('hex').slice(0, 16);
      const path = join(outDir, 'sw.js');
      const source = await readFile(path, 'utf8');
      const token = /(["'`])__ROUTE_GPX_BUILD__\1/;
      if (!token.test(source))
        throw new Error('sw.js has no build manifest placeholder');
      await writeFile(
        path,
        source.replace(
          token,
          JSON.stringify(JSON.stringify({ version, files })),
        ),
      );
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [serviceWorkerManifest()],
  build: {
    // MapLibre GL JS (about 1,090 kB minified, 296 kB gzipped) is one
    // lazy chunk loaded only when navigation starts; the default 500 kB
    // limit warned about it on every build. The app's own entry stays far
    // below this, so a new warning still means a chunk worth reviewing.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: 'index.html',
        help: 'help.html',
        changelog: 'changelog.html',
        // The service worker is served at the root, unhashed, so its scope is
        // the whole site and the browser finds each new version at one URL.
        [SW_ENTRY]: 'src/sw.ts',
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === SW_ENTRY ? 'sw.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
