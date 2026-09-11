'use strict';

var test = require('node:test');
var assert = require('node:assert');
var helper = require('./helper.js');

test('yylineno counts the lines the match crossed', function () {
  var built = helper.build([
    '%option noyywrap yylineno',
    '%%',
    '[a-z]+      return yytext + "@" + yylineno;',
    '.|\\n       ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'a\nb\n\nc'),
    ['a@1', 'b@2', 'c@4']);
});

test('yylineno counts newlines inside a single match', function () {
  var built = helper.build([
    '%option noyywrap yylineno',
    '%%',
    '"/*"([^*]|\\n)*"*/"   return "comment";',
    '[a-z]+                return "word@" + yylineno;',
    '.|\\n                 ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, '/*one\ntwo*/x'),
    ['comment', 'word@2']);
});
