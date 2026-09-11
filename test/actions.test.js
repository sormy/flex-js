'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var helper = require('./helper.js');

test('yytext and yyleng describe the match', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]+    return yytext + ":" + yyleng;',
    '[ ]+      ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'ab cde'), ['ab:2', 'cde:3']);
});

test('yymore adds the next match to this one', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"a"       yymore();',
    '"b"       return yytext;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'ab'), ['ab']);
});

test('yymore accumulates over several matches', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]     yymore();',
    '"."       return yytext;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'abc.'), ['abc.']);
});

test('yyless returns all but the first characters to the input', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"abc"     { yyless(1); return yytext; }',
    '[a-z]     return "one:" + yytext;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'abc'),
    ['a', 'one:b', 'one:c']);
});

test('yyless below zero is reported rather than scanned forever', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"ab"      { yyless(-3); return 1; }',
    '.|\\n      ;',
    '%%'
  ].join('\n'));
  var scanner = new built.Scanner('abc');

  assert.throws(function () {
    return scanner.lex();
  }, /below zero/);
});

test('yyless past the end of the match keeps the whole match', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"ab"      { yyless(5); return "L:" + yytext; }',
    '[0-9]+    return "N:" + yytext;',
    '.|\\n      ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'ab1234567'),
    ['L:ab', 'N:1234567']);
});

test('yyless(0) with a state change is how a rule looks ahead', function () {
  var built = helper.build([
    '%option noyywrap',
    '%x AGAIN',
    '%%',
    '"num"           { yyless(0); BEGIN(AGAIN); return "seen"; }',
    '<AGAIN>"num"    return "read:" + yytext;',
    '<AGAIN>.|\\n     ;',
    '%%'
  ].join('\n'));

  // the whole match goes back, and the condition it comes back in is the one
  // that reads it, which is what stops the first rule matching it again
  var scanner = new built.Scanner('num');

  assert.strictEqual(scanner.lex(), 'seen');
  assert.strictEqual(scanner.lex(), 'read:num');
  assert.strictEqual(scanner.lex(), 0);
});

test('unput puts text back in front of the scanner', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"a"       { unput("xy"); return "a"; }',
    '[a-z]     return yytext;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'az'), ['a', 'x', 'y', 'z']);
});

test('input reads the next character itself', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"/*"      { var c, seen = ""; while ((c = input()) !== "") { if (c === "*") { break; } seen += c; } return "comment:" + seen; }',
    '[a-z]+    return yytext;',
    '"/"       ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, '/*hi*/tail'),
    ['comment:hi', 'tail']);
});

test('nounput and noinput leave those functions out', function () {
  var built = helper.build([
    '%option noyywrap nounput noinput',
    '%%',
    '[a-z]+    return yytext;',
    '%%'
  ].join('\n'));
  var generated = fs.readFileSync(built.path, 'utf8');

  assert.ok(!/function unput\b/.test(generated), 'unput is still there');
  assert.ok(!/function input\b/.test(generated), 'input is still there');
  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'ab cd'), ['ab', 'cd']);
});

test('ECHO() writes the match where yyout points', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]+    ECHO();',
    '[ ]+      ;',
    '%%'
  ].join('\n'));

  var out = helper.sink();
  helper.lexAll(built.Scanner, 'one two', function (scanner) { scanner.yyout = out; });

  assert.strictEqual(out.text(), 'onetwo');
});

test('yyterminate stops the scan', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"stop"    yyterminate();',
    '[a-z]+    return yytext;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'go stop go'), ['go']);
});

test('the scanner carries whatever the caller puts on yy', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]+    { yy.seen.push(yytext); }',
    '[ ]+      ;',
    '%%'
  ].join('\n'));

  var scanner = new built.Scanner('one two');
  scanner.yy = { seen: [] };
  scanner.lex();

  assert.deepStrictEqual(scanner.yy.seen, ['one', 'two']);
});

test('restart leaves nothing of the last input behind', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"a"      { yymore(); }',
    '"b"      return "B:" + yytext;',
    '.|\\n     return "O:" + yytext;',
    '%%'
  ].join('\n'));

  function drain(scanner) {
    var tokens = [];
    var token;

    while ((token = scanner.lex()) !== 0) {
      tokens.push(token);
    }
    return tokens;
  }

  // this input runs out with a yymore() outstanding, which must not carry over
  var reused = new built.Scanner('zzza');
  drain(reused);

  assert.deepStrictEqual(drain(reused.restart('qb')),
    drain(new built.Scanner('qb')));
});

/* FLEX's macros are rewritten by name, and the scanner that reads a rule body
 * is caseless, so a grammar's own echo(), Echo() or obj.ECHO() once became
 * FLEX's - silently, in the last case turning a property read into a call.
 */
test('a name that is not FLEX\'s is left alone', function () {
  var built = helper.build([
    '%{',
    'function Echo() { return "Echo"; }',
    'function echo() { return "echo"; }',
    'function Reject() { return "Reject"; }',
    'var obj = { ECHO: function () { return "member"; }, REJECT: "prop" };',
    '%}',
    '%option noyywrap',
    '%%',
    '"a"      { return Echo(); }',
    '"b"      { return echo(); }',
    '"c"      { return Reject(); }',
    '"d"      { return obj.ECHO(); }',
    '"e"      { return obj.REJECT; }',
    '.|\\n     ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'abcde'),
    ['Echo', 'echo', 'Reject', 'member', 'prop']);
});
