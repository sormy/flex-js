'use strict';

var js = require('@eslint/js');
var globals = require('globals');

module.exports = [
  {
    // the flex checkout, the binaries, and anything the generator wrote:
    // generated scanners are flex's output, not this repository's source
    ignores: ['build/**', 'dist/**', 'benchmark/node_modules/**']
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
  },
  {
    // the generator's own scripts and the tests only have to run on Node
    files: ['test/**/*.js', 'bin/**/*.js', 'benchmark/*.js'],
    languageOptions: {
      ecmaVersion: 2022
    }
  }
];
