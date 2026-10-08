import js from '@eslint/js';
import globals from 'globals';

const htmlSinks = ['innerHTML', 'outerHTML', 'insertAdjacentHTML'].map((property) => ({
  property,
  message: 'Use setHTML()/parseSafe() from js/ui/html.js (the single HTML sink).',
}));

export default [
  { ignores: ['node_modules/**', 'e2e/**', 'docs/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, google: 'readonly' } },
  },
  {
    files: ['sw.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: globals.serviceworker },
  },
  {
    files: ['*.js', 'js/**/*.test.js'],
    ignores: ['sw.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['**/*.js'],
    rules: {
      'no-restricted-properties': ['error', ...htmlSinks],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/ui/html.js'], importNamePattern: '^raw$', message: 'raw is private to js/ui/html.js.' }] },
      ],
    },
  },
  { files: ['js/ui/html.js'], rules: { 'no-restricted-properties': 'off' } },
];
