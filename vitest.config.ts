import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two projects, matching the two halves of the app:
//
//   node — src/domain: metrics, the diff model, ranking maths. No DOM. If a
//          test here needs jsdom, something has leaked out of the domain.
//   dom  — components and routes under jsdom + Testing Library.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          globals: true,
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx', 'test/**/*.test.tsx'],
          setupFiles: ['./test/setup-dom.ts'],
          globals: true,
        },
      },
    ],
  },
});
