'use strict';

/*
** The same grammar through both back ends, and the traces have to match.
**
** Only the prologue and the driver differ between the two files; the rules
** are the same text, and each rule reports its number and what it matched.
** If the JavaScript scanner and the C scanner disagree about anything, this
** is where it shows.
*/

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');
var helper = require('./helper.js');

var GENERATOR = helper.GENERATOR;

var CC = process.env.CC || 'cc';
var HAVE_CC = have(CC);

/* The comparison against C is the point of this file, so a run without a
 * compiler says so rather than passing quietly.
 */
if (!HAVE_CC) {
  process.stderr.write('differential tests skipped: ' + CC +
    ' cannot compile, so nothing was compared against C\n');
}

var directory = helper.tempDirectory('diff');
var counter = 0;

/** Whether the C scanners can actually be built, rather than whether cc talks. */
function have(program) {
  var probe = path.join(os.tmpdir(), 'flex-js-cc-' + process.pid + '.c');
  var built = probe.replace(/\.c$/, '.out');

  try {
    fs.writeFileSync(probe, 'int main(void) { return 0; }\n');
    return childProcess.spawnSync(program, ['-o', built, probe],
      { encoding: 'utf8' }).status === 0;
  } catch (error) {
    return false;
  } finally {
    fs.rmSync(probe, { force: true });
    fs.rmSync(built, { force: true });
  }
}

var C_PROLOGUE = [
  '%{',
  '#include <stdio.h>',
  '#include <string.h>',
  'static void emit(int rule, const char *text);',
  '%}'
].join('\n');

var C_DRIVER = [
  'static void emit(int rule, const char *text) {',
  '  printf("%d|%s\\n", rule, text);',
  '}',
  'int main(void) { yylex(); printf("EOF\\n"); return 0; }'
].join('\n');

var JS_PROLOGUE = [
  '%{',
  'function emit(rule, text) { console.log(rule + "|" + text); }',
  '%}'
].join('\n');

var JS_DRIVER = [
  // bytes, which is what the C scanner reads and what a Buffer input means
  'var input = require("fs").readFileSync(0);',
  'var scanner = new Scanner(input);',
  'scanner.lex();',
  'console.log("EOF");'
].join('\n');

function spell(rules, javascript) {
  return rules
    .replace(/@REJECT@/g, javascript ? 'REJECT()' : 'REJECT')
    .replace(/@ECHO@/g, javascript ? 'ECHO()' : 'ECHO')
    .replace(/@PUSH\(([^)]*)\)@/g, javascript
      ? 'yypush_buffer_state($1)'
      : 'yypush_buffer_state(yy_scan_string($1))')
    .replace(/@POP@/g, 'yypop_buffer_state()')
    .replace(/@LINENO@/g, 'yylineno')
    .replace(/@EAT_TO_HASH@/g, javascript
      ? 'var c; while ((c = input()) !== "" && c !== "#") { }'
      : 'int c; while ((c = input()) != 0 && c != \'#\') { }')
    .replace(/@EAT_TO_NL@/g, javascript
      ? 'var c; while ((c = input()) !== "" && c !== "\\n") { }'
      : 'int c; while ((c = input()) != 0 && c != \'\\n\') { }')
    .replace(/@UNPUT_NL@/g, javascript ? 'unput("\\n")' : 'unput(\'\\n\')')
    .replace(/@UNPUT_Q@/g, javascript ? 'unput("Q")' : 'unput(\'Q\')')
    .replace(/@UNPUT_X@/g, javascript ? 'unput("x")' : 'unput(\'x\')')
    .replace(/@TOP_STATE@/g, 'yy_top_state()')
    .replace(/@COUNTER@/g, javascript
      ? '%{\nvar inits = 0;\n%}'
      : '%{\nstatic int inits = 0;\n%}')
    .replace(/@SCAN\(([^)]*)\)@/g, 'yy_scan_string($1)')
    .replace(/@START@/g, javascript ? 'YY_START()' : 'YY_START')
    .replace(/@INPUT_CODES@/g, javascript
      ? 'var c, out = ""; while ((c = input()) !== "") ' +
        '{ out += "[" + c.charCodeAt(0) + "]"; } emit(7, out);'
      : 'int c; char seen[512]; int at = 0; while ((c = input()) != 0) ' +
        '{ at += sprintf(seen + at, "[%d]", c); } seen[at] = 0; emit(7, seen);');
}

function generate(name, options, rules, prologue, driver, args) {
  var source = path.join(directory, name + '.l');
  fs.writeFileSync(source, [prologue, options, '%%', rules, '%%', driver].join('\n') + '\n');

  var output = path.join(directory, name + (args.indexOf('--emit=javascript') === -1 ? '.c' : '.js'));
  var run = childProcess.spawnSync(GENERATOR,
    args.concat(['--noline', '-o', output, source]), { encoding: 'utf8' });

  if (run.status !== 0) {
    throw new Error('generating ' + name + ' failed: ' + run.stderr);
  }
  return output;
}

/** How an input reads in a failure message, Buffer or string alike. */
function show(input) {
  return JSON.stringify(Buffer.isBuffer(input) ? input.toString('latin1') : input);
}

/** Runs both scanners over every input and returns their traces. */
function compare(options, rules, inputs, extra, typed) {
  var name = 'case' + (++counter);
  var args = extra || [];
  /* Only this back end has the option, so only this side is asked for it. */
  var jsOptions = spell(options, true) + (typed ? '\n%option typed-tables' : '');

  var cFile = generate(name + 'c', spell(options, false), spell(rules, false),
    C_PROLOGUE, C_DRIVER, args);
  var jsFile = generate(name + 'js', jsOptions, spell(rules, true),
    JS_PROLOGUE, JS_DRIVER, args.concat(['--emit=javascript']));

  var binary = path.join(directory, name);
  var compiled = childProcess.spawnSync(CC, ['-o', binary, cFile], { encoding: 'utf8' });
  if (compiled.status !== 0) {
    throw new Error('compiling ' + name + ' failed: ' + compiled.stderr);
  }

  return inputs.map(function (input) {
    var fromC = childProcess.spawnSync(binary, [], { input: input, encoding: 'utf8' });
    var fromJs = childProcess.spawnSync(process.execPath, [jsFile],
      { input: input, encoding: 'utf8' });
    return {
      input: input,
      c: fromC.stdout,
      js: fromJs.stdout,
      jsError: fromJs.status === 0 ? fromJs.stderr
        : 'exited with ' + (fromJs.status === null ? fromJs.signal : fromJs.status) +
          '\n' + fromJs.stderr,
      cError: fromC.status === 0 ? '' : 'C exited with ' + fromC.status
    };
  });
}

/*
** Every case runs under each table mode. The bugs that got through the first
** time round all lived where two features crossed, so crossing them is the
** point: compressed tables and -Cf, equivalence classes and raw bytes, ASCII
** and bytes above it.
*/
var TABLE_MODES = [[], ['-C'], ['-Cm'], ['-Cf'], ['-Cfe']];

/*
** %option typed-tables changes what the scanner holds its tables in, so it has
** to be answered for against C too. Three shapes matter: a compressed table, a
** full one, and a full one over equivalence classes, where the flat index has
** to land inside its own row and NUL's column is folded onto 0. Crossing it
** with every mode would double the slowest test here and say nothing more.
*/
var TYPED_MODES = ['', '-Cf', '-Cfe'];

function agree(options, rules, inputs, extra) {
  TABLE_MODES.forEach(function (mode) {
    var fullTable = mode.indexOf('-Cf') !== -1 || mode.indexOf('-Cfe') !== -1;

    // flex refuses both REJECT and interactive with a full table
    if (fullTable && (rules.indexOf('@REJECT@') !== -1 ||
        options.indexOf('interactive') !== -1)) {
      return;
    }

    // nor is a case that names its own table mode crossed with the others
    if (mode.length && (extra || []).some(function (option) {
      return option.indexOf('-C') === 0;
    })) {
      return;
    }

    // -8 so the C scanner covers the same bytes this one always does
    var args = ['-8'].concat(extra || []).concat(mode);
    var ways = TYPED_MODES.indexOf(mode.join(' ')) === -1
      ? [false] : [false, true];

    ways.forEach(function (typed) {
      compare(options, rules, inputs, args, typed).forEach(function (result) {
        assert.strictEqual(result.cError, '', result.cError);
        assert.strictEqual(result.jsError, '', result.jsError);
        assert.strictEqual(result.js, result.c,
          'disagreed on ' + show(result.input) +
          ' with ' + (args.length ? args.join(' ') : 'the default tables') +
          (typed ? ' and typed tables' : '') +
          (result.jsError ? '\nJavaScript wrote: ' + result.jsError : ''));
      });
    });
  });
}

var WORDS = ['', 'a', 'ab', 'abc', 'a b', 'x\ny', 'aaa bbb\n', '  ', '\n\n',
  'if iffy if\n', '<= < >= > <>', '12 3.4 5.', '"str" \'q\'', 'a/*c*/b',
  'AbC dEf', 'a\tb\rc', 'zzz'];

/*
** Input above ASCII only goes to grammars that match whole characters. A rule
** matching a single byte splits one, and there C hands back the byte while
** this hands back what a lone byte decodes to, which docs/differences.md
** describes and no comparison can bridge.
*/
var MULTIBYTE = ['ü', 'a ü b', 'héllo wörld', '日本 x', '😀 x', 'aü', 'üa'];

var UTF8_CLASS =
  'UTF8    [\\x20-\\x7f]|[\\xc2-\\xdf][\\x80-\\xbf]|' +
  '[\\xe0-\\xef][\\x80-\\xbf]{2}|[\\xf0-\\xf4][\\x80-\\xbf]{3}';

test('longest match and ties', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap', [
    '"if"        emit(1, yytext);',
    '[a-z]+      emit(2, yytext);',
    '"<="        emit(3, yytext);',
    '"<"         emit(4, yytext);',
    '[0-9]+      emit(5, yytext);',
    '.|\\n       emit(6, yytext);'
  ].join('\n'), WORDS);
});

test('the default rule and start conditions', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap\n%x COMMENT', [
    '"/*"            BEGIN(COMMENT);',
    '<COMMENT>"*/"   BEGIN(INITIAL);',
    '<COMMENT>.|\\n  emit(1, yytext);',
    '[a-z]+          emit(2, yytext);'
  ].join('\n'), WORDS);
});

test('yymore and yyless', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap', [
    '"a"         yymore();',
    '"bc"        { yyless(1); emit(1, yytext); }',
    '[a-z]+      emit(2, yytext);',
    '.|\\n       emit(3, yytext);'
  ].join('\n'), WORDS);
});

test('trailing context and anchors', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap', [
    '^"a"        emit(1, yytext);',
    '"b"$        emit(2, yytext);',
    '"x"/"y"     emit(3, yytext);',
    '[a-z]+      emit(4, yytext);',
    '.|\\n       emit(5, yytext);'
  ].join('\n'), WORDS);
});

test('REJECT', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap', [
    '"abc"       { emit(1, yytext); @REJECT@; }',
    '"ab"        { emit(2, yytext); @REJECT@; }',
    '[a-z]       emit(3, yytext);',
    '.|\\n       emit(4, yytext);'
  ].join('\n'), WORDS);
});

test('yylineno', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap yylineno', [
    '[a-z]+      emit(yylineno, yytext);',
    '.|\\n       ;'
  ].join('\n'), WORDS);
});

test('caseless matching', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap caseless', [
    '"abc"       emit(1, yytext);',
    '[a-z]+      emit(2, yytext);',
    '.|\\n       emit(3, yytext);'
  ].join('\n'), WORDS);
});

test('the full table agrees with the compressed one', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap', [
    '"if"        emit(1, yytext);',
    '[a-z]+      emit(2, yytext);',
    '[0-9]+      emit(3, yytext);',
    '.|\\n       emit(4, yytext);'
  ].join('\n'), WORDS, ['-Cf']);
});

/* A few hundred strings drawn from an alphabet the grammar cares about, so
 * the two scanners are compared on input nobody thought to write down.
 */
function randomInputs(alphabet, count, longest) {
  var seed = 20260905;
  function next() {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return (seed >>> 15) & 0xffff;
  }
  var inputs = [];
  for (var i = 0; i < count; i++) {
    var length = next() % longest;
    var text = '';
    for (var c = 0; c < length; c++) {
      text += alphabet.charAt(next() % alphabet.length);
    }
    inputs.push(text);
  }
  return inputs;
}

test('random input, longest match', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap', [
    '"ab"        emit(1, yytext);',
    '"abc"       emit(2, yytext);',
    '[a-c]+      emit(3, yytext);',
    '[ \\n]+     emit(4, yytext);',
    '.           emit(5, yytext);'
  ].join('\n'), randomInputs('abc \n', 150, 12));
});

test('random input, anchors and trailing context', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap yylineno', [
    '^"a"        emit(1, yytext);',
    '"a"/"b"     emit(2, yytext);',
    '"b"$        emit(3, yytext);',
    '[ab]+       emit(4, yytext);',
    '.|\\n      emit(5, yytext);'
  ].join('\n'), randomInputs('ab\n', 150, 10));
});

test('random input, REJECT', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap', [
    '"aa"        { emit(1, yytext); @REJECT@; }',
    '"a"         emit(2, yytext);',
    '.|\\n      emit(3, yytext);'
  ].join('\n'), randomInputs('ab\n', 120, 10));
});

/* The cases a review found, each of which the two back ends disagreed on. */

test('yymore across a rule that returns', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap', [
    '"a"         { yymore(); emit(1, yytext); }',
    '[b-z]+      emit(2, yytext);',
    '.|\\n      emit(3, yytext);'
  ].join('\n'), ['abc', 'aabc', 'a', 'ab cd', 'aa\nbb']);
});

test('yymore that returns from the rule body', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap', [
    '"a"         { yymore(); return 1; }',
    '[b-z]+      emit(2, yytext);',
    '.|\\n      emit(3, yytext);'
  ].join('\n'), ['abc', 'aabc', 'ab']);
});

test('switching buffers from a rule that does not return',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap', [
      '"#inc"      { @PUSH("XY")@; }',
      '[A-Za-z]+   emit(1, yytext);',
      '.|\\n      emit(2, yytext);'
    ].join('\n'), ['#inc tail', 'a #inc b', '#inc']);
  });

test('yylineno with trailing context', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap yylineno', [
    '"foo"/"\\n"  emit(@LINENO@, yytext);',
    '[a-z]+      emit(@LINENO@, yytext);',
    '.|\\n      ;'
  ].join('\n'), ['foo\nbar', 'foo\nfoo\nbar', 'x\nfoo\ny']);
});

test('yylineno after input() has eaten newlines',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap yylineno', [
      '"/*"        { @EAT_TO_HASH@ }',
      '[a-z]+      emit(@LINENO@, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['/*a\nb\nc#x', 'y/*\n#z']);
  });

test('yyless with newlines in what it gives back',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap yylineno', [
      '"a"[^b]*"b" { yyless(1); emit(@LINENO@, yytext); }',
      '[a-z]+      emit(@LINENO@, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['a\n\nb c', 'ab', 'a\nb\nd']);
  });

test('variable trailing context with REJECT', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap', [
    '"ab"/[c-z]+ { emit(1, yytext); @REJECT@; }',
    '[a-z]+      emit(2, yytext);',
    '.|\\n      emit(3, yytext);'
  ].join('\n'), ['abcd', 'ab', 'abc ab', 'xabcy']);
});

test('a NUL byte in the middle of the input', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap', [
    '[a-z]+      emit(1, yytext);',
    '"\\0"       emit(2, "NUL");',
    '.|\\n      emit(3, yytext);'
  ].join('\n'), ['a\u0000b', '\u0000', 'ab\u0000\u0000cd']);
});


test('whole characters, both table modes', { skip: !HAVE_CC && 'no C compiler' }, function () {
  agree('%option noyywrap\n' + UTF8_CLASS, [
    '[a-z]+      emit(1, yytext);',
    '[ \\n]+     ;',
    '{UTF8}      emit(2, yytext);'
  ].join('\n'), MULTIBYTE);
});

test('yymore over multibyte input',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap\n' + UTF8_CLASS, [
      '"ü"         { yymore(); }',
      '[a-z]+      emit(2, yytext);',
      '{UTF8}      emit(3, yytext);'
    ].join('\n'), ['üabc', 'üü', 'xüy', 'ü']);
  });

/*
** Each of these reproduced a difference from C. They are grouped here because
** they all turn on when a thing is worked out rather than on what it is: the
** flag ^ reads, the length yymore carries, the line unput gives back.
*/

test('^ after a rule that gives text back', { skip: !HAVE_CC && 'no C compiler' },
  function () {
    agree('%option noyywrap', [
      '"foo"/"\\n"  emit(1, yytext);',
      '^"\\n"       emit(2, yytext);',
      '"\\n"        emit(3, yytext);',
      '[a-z]+      emit(4, yytext);'
    ].join('\n'), ['foo\nbar', 'x\nfoo\nbar', 'foo\n', '\nfoo\nx']);
  });

test('^ after input() has read the newline', { skip: !HAVE_CC && 'no C compiler' },
  function () {
    agree('%option noyywrap', [
      '"@"         { @EAT_TO_NL@ }',
      '^"a"        emit(2, yytext);',
      '"a"         emit(3, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['@zzz\na', 'a@z\na', '@\na']);
  });

test('interactive changes nothing about which rules fire',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap interactive', [
      '"ab"       emit(1, yytext);',
      '[a-z]+     emit(2, yytext);',
      '[0-9]+     emit(3, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['ab', 'abc', 'a1b', 'ab 12 xyz', '']);
  });

test('REJECT falls to a rule that matched the same length',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap', [
      '"abc"      { @REJECT@ }',
      '"ab"       emit(2, yytext);',
      '[a-z]+     emit(3, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['abc x', 'ab', 'abc', 'xabc', 'abcd']);
  });

test('yymore carries what the action left, not what it matched',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap', [
      '"x"         { yymore(); }',
      '"abc"       { yymore(); yyless(2); }',
      '[a-c]+      emit(3, yytext);',
      '.|\\n      emit(9, yytext);'
    ].join('\n'), ['99xabcdef', 'xabc', 'xabcabc']);
  });

test('unput gives a newline back to yylineno too',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap yylineno', [
      '"a\\n"       { @UNPUT_NL@; }',
      '"z"         emit(@LINENO@, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['a\nz', 'a\na\nz', '\na\nz']);
  });

test('yylineno counts the bytes a match added, not its decoded length',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap yylineno', [
      '"\\xc3\\xbc"  { yymore(); }',
      '"\\n"[a-z]*  emit(@LINENO@, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['\u00fc\nabc\nq', '\u00fc\n\u00fc\nq']);
  });

test('yy_top_state with nothing pushed is the condition in force',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap stack\n%s SC', [
      '"a"         emit(@TOP_STATE@, yytext);',
      '"b"         { BEGIN(SC); }',
      '.|\\n      ;'
    ].join('\n'), ['a', 'ba', 'aba']);
  });

test('input() reads a byte at a time the way C does',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap', [
      '"@"         { @INPUT_CODES@ }',
      '.|\\n      ;'
    ].join('\n'), [
      // Bytes rather than text, and none of them the start of a character:
      // input() hands a whole character back where C hands back its first
      // byte, which docs/differences.md describes and this cannot bridge.
      Buffer.from([0x40, 0x80, 0x41, 0xc0, 0x41]),
      Buffer.from([0x40, 0x61, 0x62, 0x63]),
      Buffer.from([0x40, 0xf5, 0x41]),
      Buffer.from([0x40, 0xed, 0xa0, 0x80]),
      Buffer.from([0x40, 0xff]),
      Buffer.from([0x40])
    ]);
  });

test('yyless measures the match, not what it decoded to',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap', [
      '[\\x80-\\xff]"x"  { yyless(1); emit(1, "kept"); }',
      '"x"             emit(2, "x");',
      '[A-Z]           emit(3, yytext);',
      '.|\\n          emit(9, "byte");'
    ].join('\n'), [
      // a byte that is no character re-encodes to three, which is not one
      Buffer.from([0xff, 0x78, 0x41, 0x42]),
      Buffer.from([0xc3, 0xa9, 0x78, 0x41]),
      Buffer.from([0x80, 0x78, 0x5a])
    ]);
  });

test('scanning another string keeps the condition and the line count',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap yylineno\n%s SC', [
      '"a"         { BEGIN(SC); }',
      '<SC>"R"     { @SCAN("q\\nq\\n")@; }',
      '[a-z]       emit(@START@, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['aRz', 'aR', 'R']);
  });

test('scanning another string carries on counting lines',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('%option noyywrap yylineno', [
      '"R"         { @SCAN("a\\na\\n")@; }',
      '"a"         emit(@LINENO@, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['a\na\nR', 'R', 'a\nR']);
  });

test('user-init runs once for the scanner, not once per call',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    agree('@COUNTER@\n%option noyywrap\n%option user-init="inits++;"', [
      '[a-z]+      emit(inits, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['a b c', 'aa', 'a']);
  });

test('a scanner with no line count does not start one',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    // no %option yylineno: input() and unput() must both leave it alone
    agree('%option noyywrap', [
      '"@"         { @EAT_TO_NL@ }',
      '"~"         { @UNPUT_NL@; }',
      '[a-z]+      emit(@LINENO@, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['@x\ny', 'a\n~b', '@a\nb\nc#z', '~q']);
  });

test('unput puts back text that was never there',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    // not what precedes the cursor, so the input really is rebuilt around it
    agree('%option noyywrap', [
      '"x"        { @UNPUT_Q@; }',
      '"Q"        emit(1, yytext);',
      '[a-z]+     emit(2, yytext);',
      '.|\\n      ;'
    ].join('\n'), ['xay', 'x', 'aax bb', 'xx']);
  });

test('yymore and unput in one action, either way round',
  { skip: !HAVE_CC && 'no C compiler' }, function () {
    // C writes over what is in front of the cursor, so what a yymore carries
    // depends on which of the two ran first
    agree('%option noyywrap', [
      '"@x"          { yymore(); @UNPUT_X@; }',
      '"#x"          { yymore(); @UNPUT_Q@; }',
      '"b"           { @UNPUT_Q@; yymore(); }',
      '[@#QA-Za-z]+  emit(2, yytext);',
      '.|\\n         ;'
    ].join('\n'), ['@x', '#x', 'b', '@x#x', 'b@x']);
  });
