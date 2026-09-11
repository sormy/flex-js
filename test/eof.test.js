'use strict';

var test = require('node:test');
var assert = require('node:assert');
var helper = require('./helper.js');

test('an <<EOF>> rule runs when the input is exhausted', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]+      return yytext;',
    '<<EOF>>     return "done";',
    '%%'
  ].join('\n'));

  var scanner = new built.Scanner('ab');
  assert.strictEqual(scanner.lex(), 'ab');
  assert.strictEqual(scanner.lex(), 'done');
});

test('each start condition can have its own <<EOF>> rule', function () {
  var built = helper.build([
    '%option noyywrap',
    '%x STRING',
    '%%',
    '"\\""             BEGIN(STRING);',
    '<STRING>"\\""     BEGIN(INITIAL);',
    '<STRING>.        ;',
    '<STRING><<EOF>>  return "unterminated";',
    '<<EOF>>          return "clean";',
    '.|\\n            ;',
    '%%'
  ].join('\n'));

  assert.strictEqual(new built.Scanner('ok').lex(), 'clean');
  assert.strictEqual(new built.Scanner('"open').lex(), 'unterminated');
});

test('yywrap is asked whether anything follows', function () {
  var built = helper.build([
    '%%',
    '[a-z]+      return yytext;',
    '.|\\n       ;',
    '%%'
  ].join('\n'));

  var scanner = new built.Scanner('one');
  var more = ['two'];
  scanner.yywrap = function () {
    if (!more.length) {
      return true;
    }
    this.restart(more.shift());
    return false;
  };

  assert.strictEqual(scanner.lex(), 'one');
  assert.strictEqual(scanner.lex(), 'two');
  assert.strictEqual(scanner.lex(), 0);
});
