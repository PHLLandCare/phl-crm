import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so the same build works whether it's served at
  // phllandcare.github.io/phl-crm/ (default project URL) or at the root of
  // a custom domain like crm.phllandcare.com — an absolute '/phl-crm/' base
  // 404s every asset the moment the site is reached via a custom domain,
  // since GitHub Pages serves custom-domain requests from the repo root,
  // not under a '/phl-crm/' prefix.
  base: './',
})
