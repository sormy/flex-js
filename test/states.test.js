'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var helper = require('./helper.js');

test('BEGIN switches to an exclusive start condition', function () {
  var built = helper.build([
    '%option noyywrap',
    '%x COMMENT',
    '%%',
    '"/*"            BEGIN(COMMENT);',
    '<COMMENT>"*/"   BEGIN(INITIAL);',
    '<COMMENT>.      ;',
    '[a-z]+          return yytext;',
    '.               ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'a /*hidden*/ b'), ['a', 'b']);
});

test('an inclusive start condition still sees the unmarked rules', function () {
  var built = helper.build([
    '%option noyywrap',
    '%s EXTRA',
    '%%',
    '"on"            BEGIN(EXTRA);',
    '<EXTRA>"x"      return "extra";',
    '[a-z]+          return yytext;',
    '.|\\n           ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'a on x b'),
    ['a', 'extra', 'b']);
});

test('YY_START answers the start condition in force', function () {
  var built = helper.build([
    '%option noyywrap',
    '%x OTHER',
    '%%',
    '"go"            { BEGIN(OTHER); return YY_START(); }',
    '<OTHER>.        return YY_START();',
    '%%'
  ].join('\n'));

  var tokens = helper.lexAll(built.Scanner, 'goX');
  assert.deepStrictEqual(tokens, [1, 1]);  // OTHER, in both rules
});

test('the start-condition stack is left out without %option stack', function () {
  var withStack = helper.build([
    '%option noyywrap stack',
    '%x A',
    '%%',
    '"<"       yy_push_state(A);',
    '<A>">"    yy_pop_state();',
    '<A>.      ;',
    '[a-z]+    return yytext;',
    '.         ;',
    '%%'
  ].join('\n'));
  var without = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]+    return yytext;',
    '.         ;',
    '%%'
  ].join('\n'));

  function has(built) {
    return /prototype\.yy_push_state/.test(fs.readFileSync(built.path, 'utf8'));
  }

  assert.strictEqual(has(withStack), true, '%option stack lost the stack');
  assert.strictEqual(has(without), false, 'the stack was emitted unasked for');
  assert.deepStrictEqual(helper.lexAll(withStack.Scanner, 'a <zz> b'), ['a', 'b']);
  assert.deepStrictEqual(helper.lexAll(without.Scanner, 'a b'), ['a', 'b']);
});

test('a pop with nothing to go back to leaves the match alone', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"abc"     { var ok = yypop_buffer_state(); yyless(1); ' +
      'return (ok ? "yes" : "no") + ":" + yytext; }',
    '[a-z]     return "one:" + yytext;',
    '%%'
  ].join('\n'));

  /* Nothing was pushed, so the pop says so and the match is untouched. */
  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'abc'),
    ['no:a', 'one:b', 'one:c']);
});

test('each stack method can be turned off on its own', function () {
  function built(options) {
    return fs.readFileSync(helper.build([
      '%option noyywrap stack ' + options,
      '%x A',
      '%%',
      '[a-z]+    return yytext;',
      '<A>.      ;',
      '.         ;',
      '%%'
    ].join('\n')).path, 'utf8');
  }

  function has(text, name) {
    return text.indexOf('YYScanner.prototype.' + name + ' =') !== -1;
  }

  var all = built('');
  var none = built('noyy_push_state noyy_pop_state noyy_top_state');
  var noPush = built('noyy_push_state');

  ['yy_push_state', 'yy_pop_state', 'yy_top_state'].forEach(function (name) {
    assert.strictEqual(has(all, name), true, name + ' was dropped unasked');
    assert.strictEqual(has(none, name), false, name + ' survived being turned off');
  });
  assert.strictEqual(has(noPush, 'yy_push_state'), false);
  assert.strictEqual(has(noPush, 'yy_pop_state'), true);
});

test('the start-condition stack remembers where it came from', function () {
  var built = helper.build([
    '%option noyywrap stack',
    '%x A',
    '%x B',
    '%%',
    '"a"             yy_push_state(A);',
    '<A>"b"          yy_push_state(B);',
    '<B>"c"          { yy_pop_state(); return "in-b"; }',
    '<A>"d"          { yy_pop_state(); return "in-a"; }',
    '.|\\n           ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'abcd'), ['in-b', 'in-a']);
});

test('yy_top_state looks without leaving', function () {
  var built = helper.build([
    '%option noyywrap stack',
    '%x A',
    '%%',
    '"a"             { yy_push_state(A); }',
    '<A>"b"          return "top:" + yy_top_state();',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'ab'), ['top:0']);
});

test('^ matches only where a line starts', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '^"a"            return "first";',
    '"a"             return "later";',
    '.|\\n           ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'a a\na'),
    ['first', 'later', 'first']);
});

test('$ matches only where a line ends', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"a"$            return "last";',
    '"a"             return "middle";',
    '.|\\n           ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'ab\na\n'),
    ['middle', 'last']);
});

test('trailing context is not part of the match', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"a"/"b"         return "a-before-b:" + yytext;',
    '[ab]            return yytext;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'ab'),
    ['a-before-b:a', 'b']);
});

test('the start condition a rule chose survives a buffer being popped', function () {
  var built = helper.build([
    '%option noyywrap',
    '%s SC',
    '%%',
    '"("            { yypush_buffer_state("q"); }',
    '"q"            { BEGIN(SC); }',
    '<SC>[a-z]+     return "sc:" + yytext;',
    '[a-z]+         return "init:" + yytext;',
    '.|\\n          ;',
    '%%'
  ].join('\n'));

  var scanner = new built.Scanner('(abc');

  // "(" pushes "q", whose rule switches condition, and the pushed input ends
  assert.strictEqual(scanner.lex(), 0);
  assert.strictEqual(scanner.yypop_buffer_state(), true);
  assert.strictEqual(scanner.lex(), 'sc:abc');
});

/* C is not the oracle here: it deletes the buffer it is reading from and
 * carries on reading it, which segfaults. This is asserted against what the
 * scanner should do rather than against what C does.
 */
test('a rule can go back to the buffer it set aside', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"#inc"    { yypush_buffer_state("x!"); }',
    '"!"       { yypop_buffer_state(); }',
    '[a-z]     return "L:" + yytext;',
    '.|\\n      return "O:" + yytext;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, '#inc t'),
    ['L:x', 'O: ', 'L:t']);
});
