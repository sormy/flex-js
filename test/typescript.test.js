'use strict';

/*
** The TypeScript back end emits the same scanner as the JavaScript one, so
** it has to type-check with nothing switched off and answer the same way
** once compiled.
*/

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var helper = require('./helper.js');

var GENERATOR = helper.GENERATOR;

var directory = helper.tempDirectory('ts');

var RULES = [
  '%option noyywrap',
  '%x QUOTED',
  '%%',
  '"\\""            BEGIN(QUOTED);',
  '<QUOTED>"\\""    BEGIN(INITIAL);',
  '<QUOTED>[^"]+    emit("string", yytext);',
  '[0-9]+           emit("number", yytext);',
  '[a-z]+           emit("word", yytext);',
  '[ \\t\\n]+       ;',
  '.                emit("other", yytext);',
  '%%'
].join('\n');

var EXPECTED = 'word|ab\nnumber|12\nstring|hi\nother|!\n';

function grammar(typed) {
  var declare = typed
    ? 'function emit(kind: string, text: string) { console.log(kind + "|" + text); }'
    : 'function emit(kind, text) { console.log(kind + "|" + text); }';
  var drive = typed
    ? 'const scanner = new Scanner("ab 12 \\"hi\\" !");\nscanner.lex();'
    : 'var scanner = new Scanner("ab 12 \\"hi\\" !");\nscanner.lex();';
  return ['%{', declare, '%}', RULES, drive].join('\n') + '\n';
}

function generate(name, emit, typed) {
  var source = path.join(directory, name + '.l');
  var output = path.join(directory, name + (typed ? '.ts' : '.js'));
  fs.writeFileSync(source, grammar(typed));
  var run = childProcess.spawnSync(GENERATOR,
    ['--emit=' + emit, '--noline', '-o', output, source], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, 'generating ' + name + ': ' + run.stderr);
  return output;
}

/* The compiler is a devDependency, so its absence is a failure rather than a
 * quietly green run, and every check answers for the same version.
 */
var TSC = path.join(__dirname, '..', 'node_modules', '.bin', 'tsc');

function tsc(args) {
  return childProcess.spawnSync(TSC, args, { encoding: 'utf8' });
}

var available = tsc(['--version']).status === 0;

assert.ok(available, 'TypeScript is a devDependency; run npm ci');

test('the JavaScript back end runs the grammar', function () {
  var file = generate('plain', 'javascript', false);
  var run = childProcess.spawnSync(process.execPath, [file], { encoding: 'utf8' });

  assert.strictEqual(run.status, 0, run.stderr);
  assert.strictEqual(run.stdout, EXPECTED);
});

test('TypeScript output type-checks under --strict', { timeout: 180000 }, function () {

  var file = generate('typed', 'typescript', true);
  var run = tsc(['--strict', '--noEmit', '--target', 'es5',
    '--lib', 'es2020,dom', file]);

  assert.strictEqual(run.status, 0, run.stdout || run.stderr);
});

test('and answers the same once compiled', { timeout: 180000 }, function () {

  var file = generate('typed2', 'typescript', true);
  var built = tsc(['--strict', '--target', 'es5', '--lib', 'es2020,dom',
    '--module', 'commonjs', file]);
  assert.strictEqual(built.status, 0, built.stdout || built.stderr);

  var run = childProcess.spawnSync(process.execPath,
    [file.replace(/\.ts$/, '.js')], { encoding: 'utf8' });

  assert.strictEqual(run.status, 0, run.stderr);
  assert.strictEqual(run.stdout, EXPECTED);
});

/*
** Most of the skeleton is behind a mode switch, and TypeScript only checks
** what a grammar asks for, so this one asks for as much as it can at once.
** %option debug is among them, which rules out the switch that skips the text
** of a match no rule reads - so that, and the typed tables it used to come
** with, are checked on their own below.
*/
var EVERY_MODE = [
  '%option noyywrap yylineno stack debug',
  '%x QUOTED',
  '%%',
  '^"#"[a-z]+       { yy_push_state(QUOTED); yy_top_state(); }',
  '<QUOTED>"\\""    { yy_pop_state(); }',
  '<QUOTED>[^"]+    { yymore(); }',
  '"a"/"b"          { yyless(1); }',
  '[0-9]+           { unput("x"); }',
  '[a-z]+           { emit("word", yytext + input()); }',
  '"z"              { REJECT(); }',
  '.|\\n            { ECHO(); }',
  '%%'
].join('\n');

test('nounput and noinput take those methods off the type',
  { timeout: 180000 }, function () {
    function check(options, body) {
      var name = 'surface' + options.length;
      var source = path.join(directory, name + '.l');
      var output = path.join(directory, name + '.ts');

      fs.writeFileSync(source, [
        '%option noyywrap ' + options,
        '%%',
        '[a-z]+   return 1;',
        '%%',
        body,
        ''
      ].join('\n'));

      var made = childProcess.spawnSync(GENERATOR,
        ['--emit=typescript', '--noline', '-o', output, source],
        { encoding: 'utf8' });

      assert.strictEqual(made.status, 0, made.stderr);
      return tsc(['--strict', '--noEmit', '--target', 'es5',
        '--lib', 'es2020,dom', output]);
    }

    var call = 'const scanner = new Scanner("ab");\n' +
      'scanner.unput("x");\nscanner.input();';
    var allowed = check('', call);
    var refused = check('nounput noinput', call);

    assert.strictEqual(allowed.status, 0, allowed.stdout || allowed.stderr);
    assert.notStrictEqual(refused.status, 0, 'they type-checked without them');
    assert.match(refused.stdout, /unput/);
    assert.match(refused.stdout, /input/);
  });

/* The .d.ts is sliced out of the skeleton by text, so that it reads as valid
 * TypeScript is worth checking rather than assuming.
 */
test('the declarations flex writes beside JavaScript output compile',
  { timeout: 180000 }, function () {
    var source = path.join(directory, 'declared.l');
    var output = path.join(directory, 'declared.js');

    fs.writeFileSync(source, [
      '%option noyywrap stack',
      '%x A',
      '%%',
      '"<"       yy_push_state(A);',
      '<A>">"    yy_pop_state();',
      '<A>.      ;',
      '[a-z]+    return 1;',
      '.         ;',
      ''
    ].join('\n'));

    var types = output.replace(/\.js$/, '.d.ts');
    var made = childProcess.spawnSync(GENERATOR,
      ['--emit=javascript', '--noline', '--header-file=' + types,
        '-o', output, source], { encoding: 'utf8' });

    assert.strictEqual(made.status, 0, made.stderr);
    assert.ok(fs.existsSync(types), 'no declarations were written');

    var driver = path.join(directory, 'declared-use.ts');

    fs.writeFileSync(driver, [
      'import Scanner = require("./declared");',
      'const scanner = new Scanner("a <z> b");',
      'scanner.yy_push_state(0);',
      'scanner.unput("x");',
      'scanner.yy = { seen: 0 };',
      '// the loop every consumer writes, with lex() typed as unknown',
      'let token: unknown;',
      'while ((token = scanner.lex()) !== 0) {',
      '  console.log(token, scanner.yytext, scanner.yyleng, scanner.yy_top_state());',
      '}',
      ''
    ].join('\n'));

    var run = tsc(['--strict', '--noEmit', '--target', 'es5',
      '--module', 'commonjs', '--lib', 'es2020,dom', driver]);

    assert.strictEqual(run.status, 0, run.stdout || run.stderr);
  });

/* What the TypeScript back end is for, and what README.md says it is for: the
 * rules are checked along with the scanner, which a .d.ts cannot do.
 */
test('a type error in a rule body fails the build', { timeout: 180000 },
  function () {
    function check(body) {
      var name = 'ruletype' + body.length;
      var source = path.join(directory, name + '.l');
      var output = path.join(directory, name + '.ts');

      fs.writeFileSync(source, [
        '%{',
        'type Token = { kind: string; text: string };',
        '%}',
        '%option noyywrap',
        '%%',
        '[a-z]+    return ' + body + ';',
        '.|\\n      ;',
        ''
      ].join('\n'));

      var made = childProcess.spawnSync(GENERATOR,
        ['--emit=typescript', '--noline', '-o', output, source],
        { encoding: 'utf8' });

      assert.strictEqual(made.status, 0, made.stderr);
      return tsc(['--strict', '--noEmit', '--target', 'es5',
        '--lib', 'es2020,dom', output]);
    }

    var right = check('{ kind: "word", text: yytext } as Token');
    var wrong = check('{ kind: "word", text: 42 } as Token');

    assert.strictEqual(right.status, 0, right.stdout || right.stderr);
    assert.notStrictEqual(wrong.status, 0, 'a wrong type in a rule body passed');
    assert.match(wrong.stdout, /Token/);
  });

test('every mode switch type-checks too', { timeout: 180000 }, function () {

  var source = path.join(directory, 'modes.l');
  var output = path.join(directory, 'modes.ts');
  fs.writeFileSync(source, [
    '%{',
    'function emit(kind: string, text: string) { console.log(kind + "|" + text); }',
    '%}',
    EVERY_MODE,
    'const scanner = new Scanner("#ab \\"q\\" 12 z");',
    'scanner.yy_flex_debug = true;',
    'scanner.lex();'
  ].join('\n') + '\n');

  var made = childProcess.spawnSync(GENERATOR,
    ['--emit=typescript', '--noline', '-o', output, source], { encoding: 'utf8' });
  assert.strictEqual(made.status, 0, made.stderr);

  var run = tsc(['--strict', '--noEmit', '--target', 'es5',
    '--lib', 'es2020,dom', output]);

  assert.strictEqual(run.status, 0, run.stdout || run.stderr);
});

/* Typed tables and the switch that skips a match nothing reads are shapes
 * TypeScript has to accept in every table mode, not just the default one.
 */
['', '-Cf', '-Cfe'].forEach(function (mode) {
  test('typed tables type-check with ' + (mode || 'the default tables'),
    { timeout: 180000 }, function () {
      var name = 'typed' + mode.replace(/[^a-z0-9]+/g, '');
      var source = path.join(directory, name + '.l');
      var output = path.join(directory, name + '.ts');

      fs.writeFileSync(source, [
        '%{',
        'function emit(kind: string, text: string) { console.log(kind + text); }',
        '%}',
        '%option noyywrap typed-tables',
        '%%',
        '[ \\t\\n]+        ;',
        '[a-z]+           emit("word", yytext);',
        '.                ;',
        '%%',
        'const scanner = new Scanner("ab cd");',
        'scanner.lex();'
      ].join('\n') + '\n');

      var made = childProcess.spawnSync(GENERATOR,
        ['--emit=typescript', '--noline'].concat(
          mode ? mode.split(' ') : [], ['-o', output, source]),
        { encoding: 'utf8' });
      assert.strictEqual(made.status, 0, made.stderr);

      var text = fs.readFileSync(output, 'utf8');
      assert.match(text, /new Int\d+Array\(/, 'the tables are not typed');
      assert.match(text, /switch \(yy_act\) \{\n\s*case 0: case 1: case 3: break;/,
        'the rules that read nothing they matched are not named');

      var run = tsc(['--strict', '--noEmit', '--target', 'es5',
        '--lib', 'es2020,dom', output]);
      assert.strictEqual(run.status, 0, run.stdout || run.stderr);
    });
});

test('a compiled scanner answers the same with Buffer taken away',
  { timeout: 180000 }, function () {
    var source = path.join(directory, 'nobuf.l');
    var output = path.join(directory, 'nobuf.ts');
    fs.writeFileSync(source, [
      '%{',
      'function emit(kind: string, text: string) { console.log(kind + "|" + text); }',
      '%}',
      '%option noyywrap',
      '%%',
      '[\\x80-\\xff]+   emit("wide", yytext);',
      '[a-z]+           emit("word", yytext);',
      '.|\\n            ;',
      '%%',
      'const scanner = new Scanner("ab \\u00e9\\u65e5 cd");',
      'scanner.lex();'
    ].join('\n') + '\n');

    var made = childProcess.spawnSync(GENERATOR,
      ['--emit=typescript', '--noline', '-o', output, source], { encoding: 'utf8' });
    assert.strictEqual(made.status, 0, made.stderr);

    var built = tsc(['--strict', '--target', 'es5', '--lib', 'es2020,dom',
      '--module', 'commonjs', output]);
    assert.strictEqual(built.status, 0, built.stdout || built.stderr);

    var compiled = output.replace(/\.ts$/, '.js');
    function scan(args) {
      var run = childProcess.spawnSync(process.execPath, args, { encoding: 'utf8' });
      assert.strictEqual(run.status, 0, run.stderr);
      return run.stdout;
    }

    // the fast path is looked up per call, so taking it away reaches the other
    var withBuffer = scan([compiled]);
    var without = scan(['-e',
      'delete globalThis.Buffer; require(' + JSON.stringify(compiled) + ');']);

    assert.match(withBuffer, /wide\|\u00e9\u65e5/);
    assert.strictEqual(without, withBuffer);
  });
