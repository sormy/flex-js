'use strict';

var js = require('@eslint/js');
var globals = require('globals');

module.exports = [
  {
    ignores: ['**/*.test.js']
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'commonjs',
      globals: Object.assign({}, globals.node, globals.browser)
    },
    rules: {
      'no-console': 'off',
      // ES5 has no optional catch binding, so an unused one cannot be helped
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      quotes: ['error', 'single']
    }
  }
];
