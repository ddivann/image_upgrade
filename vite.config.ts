import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        passes: 2,
      },
      format: {
        comments: false,
      },
    },
    lib: {
      entry: resolve(__dirname, 'src/api/index.ts'),
      name: 'ImageEnhancer',      formats: ['es', 'cjs'],      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      external: ['onnxruntime-web'],
      plugins: [
        visualizer({
          filename: 'stats.html',
          gzipSize: true,
          brotliSize: true,
        }),
      ],
    },
  },
  worker: {
    format: 'es',
  },
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
});
