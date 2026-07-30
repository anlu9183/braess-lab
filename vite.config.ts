import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `base` is set for GitHub Pages project-site hosting (served from
// /braess-lab/); dev keeps the root base so the local server works normally.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/braess-lab/' : '/',
  plugins: [react()],
}))
