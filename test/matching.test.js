'use strict';

var test = require('node:test');
var assert = require('node:assert');
var helper = require('./helper.js');

test('takes the longest match', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"<"     return "lt";',
    '"<="    return "le";',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, '<= <'), ['le', 'lt']);
});

test('breaks a tie on the rule written first', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"if"                     return "keyword";',
    '[a-z]+                   return "word";',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'if iffy'),
    ['keyword', 'word']);
});

test('the order rules are written in does not decide the length', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]+                   return "word";',
    '"if"                     return "keyword";',
    '%%'
  ].join('\n'));

  // "if" is as long as the word rule allows, so the earlier rule wins
  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'if'), ['word']);
});

test('writes unmatched input out, which is the default rule', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[0-9]+   return "number";',
    '%%'
  ].join('\n'));

  var out = helper.sink();
  var tokens = helper.lexAll(built.Scanner, 'a1b', function (scanner) {
    scanner.yyout = out;
  });

  assert.deepStrictEqual(tokens, ['number']);
  assert.strictEqual(out.text(), 'ab');
});

test('%option nodefault refuses unmatched input instead', function () {
  var built = helper.build([
    '%option noyywrap nodefault',
    '%%',
    '[0-9]+   return "number";',
    '%%'
  ].join('\n'));

  assert.throws(function () {
    helper.lexAll(built.Scanner, 'a');
  }, /scanner jammed|no action found/);
});

test('matches with the full table too', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"<="    return "le";',
    '"<"     return "lt";',
    '[ ]+    ;',
    '%%'
  ].join('\n'), { args: ['-Cf'] });

  assert.deepStrictEqual(helper.lexAll(built.Scanner, '<= <'), ['le', 'lt']);
});

test('scans a string with no rules matching nothing at all', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '.|\\n    ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'anything\nat all'), []);
});

test('the fast-scanner tables have no matcher here, so they are refused', function () {
  ['-F', '-CF', '-CFe'].forEach(function (option) {
    assert.throws(function () {
      helper.build([
        '%option noyywrap',
        '%%',
        '[a-z]+   { return 1; }',
        '.|\\n     ;',
        '%%'
      ].join('\n'), { args: [option] });
    }, /-F\/-CF is not supported/, option + ' was not refused');
  });
});
