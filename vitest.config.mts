import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts']
        }
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['src/renderer/src/test/setup.ts'],
          // Cada teste monta o app inteiro com o banco de verdade; com o computador ocupado, os
          // limites padrão (5 s por teste, 1 s no expect.poll) às vezes não bastam.
          testTimeout: 20_000,
          expect: { poll: { timeout: 5000 } }
        }
      }
    ]
  }
})
