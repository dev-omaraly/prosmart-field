import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' makes the build work both on GitHub Pages and inside the Capacitor APK
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
