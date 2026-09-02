import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs', '*.config.{ts,mts,mjs}'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'src/domain holds pure functions — metrics, diff, ranking. Keeping React out is what makes them testable without a DOM and reusable outside this app.',
            },
          ],
        },
      ],
    },
  },
);
