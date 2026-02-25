import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'assets/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'applications/cardboard-slicer/main.jsx',
      output: {
        entryFileNames: 'cardboard-slicer.js',
        assetFileNames: (assetInfo) =>
          /\.css$/.test(assetInfo.name || '')
            ? 'cardboard-slicer.css'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
