'use strict';

var test = require('node:test');
var assert = require('node:assert');
var helper = require('./helper.js');

test('REJECT goes on to the next rule that matched here', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"abc"       { yy.seen.push("abc"); REJECT(); }',
    '"ab"        { yy.seen.push("ab"); REJECT(); }',
    '"a"         { yy.seen.push("a"); }',
    '[a-z]       ;',
    '%%'
  ].join('\n'));

  var scanner = new built.Scanner('abc');
  scanner.yy = { seen: [] };
  scanner.lex();

  assert.deepStrictEqual(scanner.yy.seen, ['abc', 'ab', 'a']);
});

test('REJECT counts overlapping matches, which is what it is for', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"aa"        { yy.pairs += 1; REJECT(); }',
    '.|\\n       ;',
    '%%'
  ].join('\n'));

  var scanner = new built.Scanner('aaaa');
  scanner.yy = { pairs: 0 };
  scanner.lex();

  assert.strictEqual(scanner.yy.pairs, 3);
});

test('a rejected match leaves yytext as the shorter one', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"ab"        { yy.texts.push(yytext); REJECT(); }',
    '"a"         { yy.texts.push(yytext); }',
    '"b"         ;',
    '%%'
  ].join('\n'));

  var scanner = new built.Scanner('ab');
  scanner.yy = { texts: [] };
  scanner.lex();

  assert.deepStrictEqual(scanner.yy.texts, ['ab', 'a']);
});
