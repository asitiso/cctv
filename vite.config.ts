import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    // All illustration layers belong in the distributable offline bundle.
    chunkSizeWarningLimit: 3500,
  },
})
