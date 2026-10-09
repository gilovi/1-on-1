import js from '@eslint/js';
import globals from 'globals';

const htmlSinks = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'createContextualFragment', 'parseFromString', 'setHTMLUnsafe'].map((property) => ({
  property,
  message: 'Use setHTML()/parseSafe() from js/ui/html.js (the single HTML sink).',
}));

const sinkMsg = 'Use setHTML()/parseSafe() from js/ui/html.js (the single HTML sink).';
const restrictedProperties = [
  ...htmlSinks,
  { object: 'document', property: 'write', message: sinkMsg },
  { object: 'document', property: 'writeln', message: sinkMsg },
];
const restrictedSyntax = [
  { selector: "CallExpression[callee.name='html']", message: 'html is a tag: write html`...`, never html(...).' },
  {
    selector: "CallExpression[callee.object.name='Object'][callee.property.name='assign'] Property[key.name=/^(innerHTML|outerHTML)$/]",
    message: sinkMsg,
  },
  { selector: 'TemplateElement[value.raw=/style\\s*=/i]', message: 'No inline style= in templates (CSP); use a CSS class.' },
];

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
      'no-restricted-properties': ['error', ...restrictedProperties],
      'no-restricted-syntax': ['error', ...restrictedSyntax],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/ui/html.js'], importNamePattern: '^raw$', message: 'raw is private to js/ui/html.js.' }] },
      ],
    },
  },
  { files: ['js/ui/html.js'], rules: { 'no-restricted-properties': 'off', 'no-restricted-syntax': 'off' } },
  // The html.js tests deliberately misuse html() as a plain function to prove it throws.
  { files: ['js/ui/html.test.js'], rules: { 'no-restricted-syntax': 'off' } },
];
