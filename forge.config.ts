import fs from 'node:fs/promises';
import path from 'node:path';

import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/onnxruntime-node/bin/**',
    },
    icon: './assets/icon',
    extraResource: ['./node_modules/ffmpeg-static', './render-assets'],
    afterCopy: [
      (
        buildPath: string,
        _electronVersion: string,
        _platform: string,
        _arch: string,
        callback: (err?: Error) => void,
      ) => {
        const packages = ['better-sqlite3', 'onnxruntime-node'];
        Promise.all(
          packages.map((name) => {
            const src = path.resolve(__dirname, 'node_modules', name);
            const dest = path.join(buildPath, 'node_modules', name);
            return fs
              .mkdir(path.dirname(dest), { recursive: true })
              .then(() => fs.cp(src, dest, { recursive: true }));
          }),
        )
          .then(() => callback())
          .catch((err: Error) => callback(err));
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupIcon: './assets/icon.ico',
    }),
    new MakerZIP({}, ['darwin', 'win32']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/main/media/watermark-worker.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
