import js from '@eslint/js';
import globals from 'globals';

export default [
  // Global ignores — must be a standalone object with only `ignores` key [18]
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'js/cardsarchive.js'
    ]
  },

  // Base recommended rules
  js.configs.recommended,

  // Application source files
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        THREE: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': 'warn',
      'no-debugger': 'error',
      'no-var': 'warn',
      'prefer-const': 'warn',
      'eqeqeq': ['warn', 'smart']
    }
  },

  // Test files
  {
    files: ['tests/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      'no-unused-vars': 'off'
    }
  },

  // Tooling scripts
  {
    files: ['tools/**/*.mjs', 'vite.config.js', 'vitest.config.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    }
  }
];
