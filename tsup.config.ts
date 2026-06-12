import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  dts: false,
  minify: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
