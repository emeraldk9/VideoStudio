const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

const aliases = {
  '@main': path.join(repoRoot, 'src/main'),
  '@renderer': path.join(repoRoot, 'src/renderer'),
  '@preload': path.join(repoRoot, 'src/preload'),
  '@shared': path.join(repoRoot, 'src/shared'),
};

const tsconfigPaths = {
  '@main/*': ['./src/main/*'],
  '@renderer/*': ['./src/renderer/*'],
  '@preload/*': ['./src/preload/*'],
  '@shared': ['./src/shared/index.ts'],
  '@shared/*': ['./src/shared/*'],
};

module.exports = { aliases, tsconfigPaths, repoRoot };
