import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';

// Relative base so the built app works when loaded via file:// in the
// Chromium kiosk (--app=file:///.../index.html) as well as from a server.
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    outDir: 'dist',
    // Single file-ish output keeps the kiosk deploy simple; tweak as needed.
    target: 'esnext',
  },
});
