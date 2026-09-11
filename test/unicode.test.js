'use strict';

/*
** The scanner runs over UTF-8 bytes, which is what a FLEX grammar describes.
** A rule written with a character in it matches that character's bytes, and
** yytext comes back as text.
*/

var test = require('node:test');
var assert = require('node:assert');
var helper = require('./helper.js');

var UTF8 = 'UTF8    [\\x20-\\x7f]|[\\xc2-\\xdf][\\x80-\\xbf]|' +
  '[\\xe0-\\xef][\\x80-\\xbf]{2}|[\\xf0-\\xf4][\\x80-\\xbf]{3}';

test('a rule written with a character matches that character', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"日本"        return "japan";',
    '"café"        return "cafe";',
    '[a-z]+        return yytext;',
    '.|\\n         ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'x 日本 café y'),
    ['x', 'japan', 'cafe', 'y']);
});

test('a UTF-8 character class matches one character at a time', function () {
  var built = helper.build([
    '%option noyywrap',
    UTF8,
    '%%',
    '[a-z]+        return "word:" + yytext;',
    '[ \\t\\n]+    ;',
    '{UTF8}        return "char:" + yytext;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'ab ü 日 😀'),
    ['word:ab', 'char:ü', 'char:日', 'char:😀']);
});

test('yytext counts characters rather than bytes', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"héllo"       return yyleng + ":" + yytext;',
    '.|\\n         ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'héllo'), ['5:héllo']);
});

test('yyleng is yytext.length, so an astral character counts as two', function () {
  var built = helper.build([
    '%option noyywrap',
    UTF8,
    '%%',
    '{UTF8}        return yyleng + ":" + yytext;',
    '%%'
  ].join('\n'));

  // one character, two JavaScript string units, exactly as "\u{1f600}".length
  assert.deepStrictEqual(helper.lexAll(built.Scanner, '\u{1f600}'), ['2:\u{1f600}']);
});

test('an emoji outside the basic plane survives', function () {
  var built = helper.build([
    '%option noyywrap',
    UTF8,
    '%%',
    '{UTF8}        return yytext;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, '😀🙏'), ['😀', '🙏']);
});

test('input() hands back whole characters', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"@"           { var seen = ""; var c; while ((c = input()) !== "") { seen += c; } return seen; }',
    '.|\\n         ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, '@日本'), ['日本']);
});

test('ASCII input is not slowed down by any of this', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]+        return yytext;',
    '.|\\n         ;',
    '%%'
  ].join('\n'));

  var scanner = new built.Scanner('plain ascii here');
  assert.strictEqual(scanner.yy_wide, false);
  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'plain ascii here'),
    ['plain', 'ascii', 'here']);
});

test('a Uint8Array is scanned as the bytes it already holds', function () {
  var built = helper.build([
    '%option noyywrap',
    UTF8,
    '%%',
    '[a-z]+        return "word:" + yytext;',
    '[ \\t\\n]+    ;',
    '{UTF8}        return "char:" + yytext;',
    '%%'
  ].join('\n'));

  var bytes = new Uint8Array(Buffer.from('ab ü', 'utf8'));
  assert.deepStrictEqual(helper.lexAll(built.Scanner, bytes),
    helper.lexAll(built.Scanner, 'ab ü'));
});

test('every one-byte view is scanned as the same bytes', function () {
  var built = helper.build([
    '%option noyywrap',
    UTF8,
    '%%',
    '[a-z]+        return "word:" + yytext;',
    '{UTF8}        return "char:" + yytext;',
    '.             return "byte:" + yytext;',
    '%%'
  ].join('\n'));
  var bytes = Buffer.from('h\u00e9llo', 'utf8');
  var wanted = helper.lexAll(built.Scanner, bytes);

  /* A signed view reads the same memory; its numbers are the ones that
   * differ, and a scan over them would never reach the jam state.
   */
  [new Uint8Array(bytes),
    new Uint8ClampedArray(bytes),
    new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length)
  ].forEach(function (view) {
    assert.deepStrictEqual(helper.lexAll(built.Scanner, view), wanted,
      view.constructor.name + ' was read differently');
  });
});

test('a view made in another realm is still bytes', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]+        return "word:" + yytext;',
    '.             ;',
    '%%'
  ].join('\n'));
  var foreign = require('node:vm')
    .runInNewContext('new Uint8Array([97, 98, 99])');

  assert.deepStrictEqual(helper.lexAll(built.Scanner, foreign), ['word:abc']);
});

test('a Buffer is scanned as the bytes it already holds', function () {
  var built = helper.build([
    '%option noyywrap',
    UTF8,
    '%%',
    '[a-z]+        return "word:" + yytext;',
    '[ \\t\\n]+    ;',
    '{UTF8}        return "char:" + yytext;',
    '%%'
  ].join('\n'));

  var fromBuffer = helper.lexAll(built.Scanner, Buffer.from('ab ü 日', 'utf8'));
  var fromString = helper.lexAll(built.Scanner, 'ab ü 日');

  assert.deepStrictEqual(fromBuffer, fromString);
  assert.deepStrictEqual(fromBuffer, ['word:ab', 'char:ü', 'char:日']);
});

test('yyless counts characters, not bytes', function () {
  var built = helper.build([
    '%option noyywrap',
    UTF8,
    '%%',
    '"üxy"         { yyless(1); return "kept:" + yytext; }',
    '[a-z]+        return "word:" + yytext;',
    '{UTF8}        return "char:" + yytext;',
    '%%'
  ].join('\n'));

  // C counts bytes here, because its yytext is bytes; ours is text
  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'üxy'),
    ['kept:ü', 'word:xy']);
});

test('yyless past the end of a multibyte match keeps the whole match', function () {
  var built = helper.build([
    '%option noyywrap',
    UTF8,
    '%%',
    '"\u00fcx"        { yyless(9); return "kept:" + yytext; }',
    '[a-z]+        return "word:" + yytext;',
    '{UTF8}        return "char:" + yytext;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, '\u00fcxyz'),
    ['kept:\u00fcx', 'word:yz']);
});

test('the fallback encoder agrees with the one Buffer provides', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '.|\\n     ;',
    '%%'
  ].join('\n'));

  var source = require('fs').readFileSync(built.path, 'utf8');
  var without = source.replace(/typeof Buffer !== 'undefined'/g, 'false');
  var path = built.path.replace(/\.js$/, '-nobuffer.js');
  require('fs').writeFileSync(path, without);
  var Fallback = require(path);

  ['ü', '日本', '😀', '\ud800a', 'a\udc00', 'plain'].forEach(function (text) {
    assert.strictEqual(new Fallback(text).yy_source, new built.Scanner(text).yy_source,
      'encoders differ on ' + JSON.stringify(text));
  });
});

test('%option 7bit scans ASCII and refuses anything above it', function () {
  ['%option 7bit\n', ''].forEach(function (option) {
    var built = helper.build([
      option + '%option noyywrap',
      '%%',
      '[a-z]+   { return 1; }',
      '.|\\n     ;',
      '%%'
    ].join('\n'), { args: option ? [] : ['-7'] });

    assert.deepStrictEqual(helper.lexAll(built.Scanner, 'abc def'), [1, 1]);
    assert.throws(function () {
      return new built.Scanner('caf\u00e9');
    }, /7bit/, 'non-ASCII input was accepted');
  });
});

test('a 7-bit refusal is reported the way every other one is', function () {
  var built = helper.build([
    '%option 7bit noyywrap',
    '%%',
    '[a-z]+   { return 1; }',
    '.|\\n     ;',
    '%%'
  ].join('\n'));
  var said = null;

  built.Scanner.prototype.yy_fatal_error = function (message) {
    said = message;
    throw new Error(message);
  };

  assert.throws(function () {
    return new built.Scanner('caf\u00e9');
  }, /7bit/);
  assert.match(said, /7bit/, 'the refusal went past yy_fatal_error');
});

test('input a 7-bit scanner refuses leaves it scanning what it had', function () {
  var built = helper.build([
    '%option 7bit noyywrap',
    '%%',
    '[a-z]+   { return 1; }',
    '.|\\n     ;',
    '%%'
  ].join('\n'));
  var scanner = new built.Scanner('abc def');

  assert.strictEqual(scanner.lex(), 1);
  assert.throws(function () {
    return scanner.restart('caf\u00e9 xyz');
  }, /7bit/);

  /* Refusing has to leave nothing of the input behind, or the matcher walks
   * bytes it has no column for and never reaches the jam state.
   */
  assert.strictEqual(scanner.lex(), 1);
  assert.strictEqual(scanner.lex(), 0);
});

test('a buffer a 7-bit scanner refuses is not pushed', function () {
  var built = helper.build([
    '%option 7bit noyywrap',
    '%%',
    '[a-z]+   { return 1; }',
    '.|\\n     ;',
    '%%'
  ].join('\n'));
  var scanner = new built.Scanner('ab');

  assert.throws(function () {
    return scanner.yypush_buffer_state('caf\u00e9');
  }, /7bit/);

  /* Nothing was set aside, and the input it was reading is still the one. */
  assert.strictEqual(scanner.yypop_buffer_state(), false);
  assert.strictEqual(scanner.lex(), 1);
  assert.strictEqual(scanner.lex(), 0);
});

test('a 7-bit table is half the width of an 8-bit one', function () {
  var grammar = [
    '%option noyywrap',
    '%%',
    '[a-z]+   { return 1; }',
    '.|\\n     ;',
    '%%'
  ].join('\n');

  function width(args) {
    var source = require('fs').readFileSync(
      helper.build(grammar, { args: args }).path, 'utf8');
    var table = source.slice(source.indexOf('var yy_nxt ='));

    return table.slice(0, table.indexOf('];')).match(/\[[^[\]]*\]/)[0]
      .split(',').length;
  }

  assert.strictEqual(width(['-Cf']), 256);
  assert.strictEqual(width(['-7', '-Cf']), 128);
});

test('the fallback decoder agrees with the one Buffer provides', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '.|\\n     return yytext;',
    '%%'
  ].join('\n'));

  var fs = require('fs');
  var path = built.path.replace(/\.js$/, '-nobuffer-decode.js');
  fs.writeFileSync(path, fs.readFileSync(built.path, 'utf8').replace(
    /typeof Buffer !== 'undefined'/g, 'false'));
  var Fallback = require(path);

  // leads, continuations, overlongs, surrogate halves and out-of-range bytes
  var bytes = [0x41, 0xc0, 0xc3, 0xaf, 0xbc, 0xe0, 0xe6, 0x97, 0xed, 0xa0, 0xf0, 0xf5];

  bytes.forEach(function (lead) {
    bytes.forEach(function (next) {
      var input = Buffer.from([lead, next]);

      assert.deepStrictEqual(helper.lexAll(Fallback, input),
        helper.lexAll(built.Scanner, input),
        'decoders differ on ' + lead.toString(16) + ' ' + next.toString(16));
    });
  });
});

test('yyless keeps a whole astral character rather than half of one', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"\u{1F600}x"     { yyless(1); return "kept:" + yytext; }',
    '.|\\n           return "rest:" + yytext;',
    '%%'
  ].join('\n'));

  // yyleng counts UTF-16 units, so 1 lands inside the surrogate pair
  assert.deepStrictEqual(helper.lexAll(built.Scanner, '\u{1F600}x'),
    ['kept:\u{1F600}', 'rest:x']);
});
