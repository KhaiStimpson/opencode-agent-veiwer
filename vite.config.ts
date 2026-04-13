import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // The SDK bundles cross-spawn/which/isexe which reference Node globals.
    // These are Node-only code paths we never hit in the browser, but the
    // references still need to resolve at parse time.
    'process.env': '{}',
    'process.platform': '"browser"',
    'process.cwd': '(() => "/")',
    'global': 'globalThis',
  },
})
