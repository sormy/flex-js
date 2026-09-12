'use strict';

/*
** bin/cli.js: the generator it picks, and what flex writes beside a scanner.
*/

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var helper = require('./helper.js');

var GENERATOR = helper.GENERATOR;

var CLI = path.join(__dirname, '..', 'bin', 'cli.js');

var directory = helper.tempDirectory('cli');
var counter = 0;

var GRAMMAR = [
  '%option noyywrap',
  '%%',
  '[a-z]+      return yytext;',
  '[ \\t\\n]+  ;',
  '%%'
].join('\n') + '\n';

/** Runs the shim, with the generator it should call underneath. */
function run(args, options) {
  var environment = Object.assign({}, process.env, options || {});
  environment.FLEX_JS = GENERATOR;
  return childProcess.spawnSync(process.execPath, [CLI].concat(args),
    { encoding: 'utf8', env: environment });
}

function grammar(text) {
  var file = path.join(directory, 'g' + (++counter) + '.l');
  fs.writeFileSync(file, text === undefined ? GRAMMAR : text);
  return file;
}




/* Declarations come from flex's own header branch, the way a .c and a .h do,
 * so what asks for them is --header-file rather than anything read here.
 */
function declared(args, options) {
  var source = grammar(args.grammar);
  var output = source.replace(/\.l$/, args.suffix || '.js');
  var header = source.replace(/\.l$/, '.d.ts');
  var made = run((args.before || []).concat(['--noline',
    '--header-file=' + header, '-o', output, source]), options);

  assert.strictEqual(made.status, 0, made.stderr);
  return { header: header, output: output, made: made };
}

test('--header-file writes the scanner types beside it', function () {
  var made = declared({ before: ['--emit=javascript'] });
  var types = fs.readFileSync(made.header, 'utf8');

  assert.match(types, /interface Scanner \{/);
  assert.match(types, /export const Scanner:/);
  assert.match(types, /^ {2}unput\(/m);
  assert.doesNotMatch(types, /m4_/, 'm4 reached the declaration file');
});

test('the interface is named after -P', function () {
  var made = declared({ before: ['--emit=javascript', '-P', 'sql'] });

  assert.match(fs.readFileSync(made.header, 'utf8'), /interface sqlScanner \{/);
  assert.match(fs.readFileSync(made.output, 'utf8'), /module\.exports\.sqlScanner = sqlScanner;/);
});

test('the interface is named after %option prefix', function () {
  var made = declared({
    before: ['--emit=javascript'],
    grammar: GRAMMAR.replace('%option noyywrap', '%option noyywrap prefix="lisp"')
  });

  assert.match(fs.readFileSync(made.header, 'utf8'), /interface lispScanner \{/);
});

test('the options that drop a method drop it from the types too', function () {
  var made = declared({
    before: ['--emit=javascript'],
    grammar: GRAMMAR.replace('%option noyywrap',
      '%option noyywrap nounput noinput stack noyy_push_state')
  });
  var types = fs.readFileSync(made.header, 'utf8');

  assert.doesNotMatch(types, /^ {2}unput\(/m);
  assert.doesNotMatch(types, /^ {2}input\(/m);
  assert.doesNotMatch(types, /^ {2}yy_push_state\(/m);
  assert.match(types, /^ {2}yy_pop_state\(/m);
  assert.doesNotMatch(types, /m4_/, 'm4 reached the declaration file');
});

test('a C header is written beside the C scanner', function () {
  var source = grammar();
  var scanner = path.join(directory, 'c-header', 'scanner.c');
  var header = path.join(directory, 'c-header', 'scanner.h');

  fs.mkdirSync(path.dirname(scanner), { recursive: true });
  var made = run(['--header-file=' + header, '-o', scanner, source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(header, 'utf8'), /yy_buffer_state/);
  assert.match(fs.readFileSync(scanner, 'utf8'), /yy_buffer_state/);
  assert.doesNotMatch(fs.readFileSync(header, 'utf8'), /m4_/);
});

test('TypeScript describes itself, so it is refused a header', function () {
  var source = grammar();
  var made = run(['--emit=typescript', '--noline',
    '--header-file=' + source.replace(/\.l$/, '.d.ts'),
    '-o', source.replace(/\.l$/, '.ts'), source]);

  assert.notStrictEqual(made.status, 0, 'a header was written for TypeScript');
  assert.match(made.stderr, /no header/);
});

test('emits C when no target is named, as any other flex does', function () {
  var source = grammar();
  var output = source.replace(/\.l$/, '.c');
  var result = run(['--noline', '-o', output, source]);

  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(output, 'utf8'), /yy_buffer_state/);
  assert.strictEqual(fs.existsSync(output.replace(/\.c$/, '.d.ts')), false);
});

test('an option whose value holds a t is not mistaken for -t', function () {
  var source = grammar();
  var output = source.replace(/\.l$/, '.js');
  var made = run(['--emit=javascript', '-Dtest', '--noline', '-o', output, source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(output, 'utf8'), /module\.exports\.Scanner = Scanner;/);
});

/* No --noline: the directives are what has to be renumbered, and with them
 * suppressed neither that nor the blank-line squeezing is exercised.
 */
test('-t writes the scanner to stdout, named as <stdout>', function () {
  var source = grammar();
  var made = run(['--emit=javascript', '-t', source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(made.stdout, /module\.exports\.Scanner = Scanner;/);
  assert.match(made.stdout, /#line [0-9]+ "<stdout>"/);
});

test('-t names the directives after -o, and still writes to stdout', function () {
  var source = grammar();
  var named = source.replace(/\.l$/, '.js');
  var made = run(['--emit=javascript', '-t', '-o', named, source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(made.stdout, /module\.exports\.Scanner = Scanner;/);
  assert.strictEqual(fs.existsSync(named), false, '-o was written as well');
  assert.doesNotMatch(made.stdout, /"<stdout>"/);
});

test('--noline writes a C header with no directives in it', function () {
  var source = grammar();
  var scanner = path.join(directory, 'noline', 'noline.c');
  var header = path.join(directory, 'noline', 'noline.h');

  fs.mkdirSync(path.dirname(scanner), { recursive: true });
  var made = run(['--noline', '--header-file=' + header, '-o', scanner, source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.doesNotMatch(fs.readFileSync(header, 'utf8'), /#line/,
    'a directive was written under --noline');
});

test('a grammar cannot name a file for flex to write', function () {
  var forged = path.join(directory, 'forged.d.ts');
  var source = grammar([
    '%top{',
    '/*',
    'outfile ' + forged,
    'header ' + forged,
    'stdout',
    '*/',
    '}',
    '%option noyywrap',
    '%%',
    '[a-z]+   { return 1; }',
    ''
  ].join('\n'));
  var output = source.replace(/\.l$/, '.js');
  var made = run(['--emit=javascript', '--noline', '-o', output, source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.strictEqual(fs.existsSync(forged), false,
    'the grammar named a file and it was written');
  assert.match(fs.readFileSync(output, 'utf8'), /module\.exports\.Scanner = Scanner;/);
});

test('a name with an accent in it is the name that gets written', function () {
  var source = grammar();
  var output = path.join(directory, 'scann\u00e9.js');
  var header = path.join(directory, 'h\u00e9ader.d.ts');
  var made = run(['--emit=javascript', '--noline', '--header-file=' + header,
    '-o', output, source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.ok(fs.existsSync(output), 'the scanner landed under another name');
  assert.ok(fs.existsSync(header), 'the header landed under another name');
});

test('a scanner named - is a file, not stdout', function () {
  var source = grammar();
  var output = path.join(directory, '-');
  var made = run(['--emit=javascript', '--noline', '-o', output, source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(output, 'utf8'), /module\.exports\.Scanner = Scanner;/);
});

/* flex resolves these, so the shim never reads them: the spellings it accepts
 * for naming a file are more than a wrapper could keep up with.
 */
[['clustered -vo', ['-vo']],
  ['an abbreviated --outfil=', ['--outfil=']],
  ['-o on its own', ['-o']]
].forEach(function (spelling) {
  test('the scanner is written where ' + spelling[0] + ' says', function () {
    var source = grammar();
    var output = source.replace(/\.l$/, '.js');
    var named = spelling[1][0];
    var args = named.charAt(named.length - 1) === '='
      ? ['--emit=javascript', '--noline', named + output, source]
      : ['--emit=javascript', '--noline', named, output, source];
    var made = run(args);

    assert.strictEqual(made.status, 0, made.stderr);
    assert.match(fs.readFileSync(output, 'utf8'), /module\.exports\.Scanner = Scanner;/);
  });
});

test('a header is written where %option header-file says', function () {
  var header = path.join(directory, 'by-option.d.ts');
  var source = grammar(GRAMMAR.replace('%option noyywrap',
    '%option noyywrap header-file="' + header.replace(/\\/g, '\\\\') + '"'));
  var output = source.replace(/\.l$/, '.js');
  var made = run(['--emit=javascript', '--noline', '-o', output, source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(header, 'utf8'), /interface Scanner \{/);
});

test('a header is written even when the scanner goes to stdout', function () {
  var source = grammar();
  var header = source.replace(/\.l$/, '.d.ts');
  var made = run(['--emit=javascript', '--noline', '--header-file=' + header,
    '-t', source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(made.stdout, /module\.exports\.Scanner = Scanner;/);
  assert.match(fs.readFileSync(header, 'utf8'), /export const Scanner:/);
});

test('the scanner is written where %option outfile says', function () {
  var output = path.join(directory, 'by-option.js');
  var source = grammar(GRAMMAR.replace('%option noyywrap',
    '%option noyywrap outfile="' + output.replace(/\\/g, '\\\\') + '"'));
  var made = run(['--emit=javascript', '--noline', source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(output, 'utf8'), /module\.exports\.Scanner = Scanner;/);
});



test('no m4 macro survives into the scanner', function () {
  var grammar = path.join(directory, 'expanded.l');
  fs.writeFileSync(grammar, [
    '%option noyywrap',
    '%%',
    '[a-z]+   { return 1; }',
    '',
    '.|\\n     ;',
    '%%',
    'var a = 1;',
    '',
    '',
    'var b = 2;',
    'module.exports.extra = function () { return a + b; };',
    ''
  ].join('\n'));

  var output = path.join(directory, 'expanded', 'scanner.js');

  fs.mkdirSync(path.dirname(output), { recursive: true });
  var made = run(['--emit=javascript', '-o', output, grammar]);
  assert.strictEqual(made.status, 0, made.stderr);

  var written = fs.readFileSync(output, 'utf8');

  /* flex writes the mode switches it chose as comments, so what says the
   * expansion ran is a macro that should have been substituted away.
   */
  assert.doesNotMatch(written, /M4_YY_OUTFILE_NAME/,
    'an unexpanded m4 macro reached the output');
  assert.doesNotMatch(written, /m4_ifdef/, 'an m4 conditional reached the output');
  /* The blank lines between the rules are squeezed, and the ones in the user
   * code below the second %% are left alone.
   */
  assert.match(written, /var a = 1;\n\n\nvar b = 2;/);
  assert.strictEqual(require(output).extra(), 3);
});

test('a grammar written with CRLF is scanned as written', function () {
  var source = path.join(directory, 'crlf.l');
  fs.writeFileSync(source, [
    '%option noyywrap',
    '%%',
    '[a-z]+   { return 1; }',
    '.|\\n     ;',
    '%%',
    'var kept = "a\\r\\nb";',
    ''
  ].join('\r\n'));

  var output = path.join(directory, 'crlf.js');
  var made = run(['--emit=javascript', '--noline', '-o', output, source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(output, 'utf8'), /var kept = "a\\r\\nb";/);
});

test('a scanner larger than m4 keeps in memory still comes back whole',
  function () {
    var rules = [];
    for (var index = 0; index < 900; index++) {
      rules.push('"KEYWORD' + index + '"  { return ' + index + '; }');
    }

    var source = grammar([
      '%option noyywrap',
      '%%',
      rules.join('\n'),
      '[a-z]+   { return -1; }',
      '.|\\n     ;',
      ''
    ].join('\n'));
    var output = path.join(directory, 'big.js');

    /* Well over a megabyte, which is past the point where m4 would flush a
     * diversion to a file rather than keep it.
     */
    var made = run(['--emit=javascript', '-Cf', '--noline', '-o', output, source]);
    assert.strictEqual(made.status, 0, made.stderr);
    assert.ok(fs.statSync(output).size > 1048576, 'the grammar was not big enough');

    var Scanner = require(output).Scanner;

    assert.strictEqual(new Scanner('KEYWORD5').lex(), 5);
    assert.strictEqual(new Scanner('KEYWORD899').lex(), 899);
  });

/* %top{} goes through m4 as it stands, so a grammar can divert. Enough of it
 * is flushed to a file rather than kept, which is the path diversion 0 is
 * exempt from and this one is not.
 */
test('a grammar that diverts more than m4 keeps in memory still works',
  function () {
    var diverted = new Array(600 * 1024).join('z');
    var source = grammar([
      '%top{',
      'm4_divert(1)' + diverted,
      'm4_divert(0)',
      '}',
      '%option noyywrap',
      '%%',
      '[a-z]+   { return 1; }',
      ''
    ].join('\n'));
    var output = path.join(directory, 'diverted.js');
    var made = run(['--emit=javascript', '--noline', '-o', output, source]);

    assert.strictEqual(made.status, 0, made.stderr);
    assert.ok(fs.readFileSync(output, 'utf8').indexOf(diverted) !== -1,
      'what the grammar diverted did not come back');
  });

/* --header-file expands the source a second time, so whatever the first pass
 * left behind in m4 has to be reset rather than reused - the name it hands a
 * spilled diversion among it.
 */
test('a grammar that diverts that much also gets a header', function () {
  var diverted = new Array(600 * 1024).join('z');
  var source = grammar([
    '%top{',
    'm4_divert(1)' + diverted,
    'm4_divert(0)',
    '}',
    '%option noyywrap',
    '%%',
    '[a-z]+   { return 1; }',
    ''
  ].join('\n'));
  var output = path.join(directory, 'divertedheader.js');
  var header = output.replace(/\.js$/, '.d.ts');
  var made = run(['--emit=javascript', '--noline', '--header-file=' + header,
    '-o', output, source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.ok(fs.readFileSync(output, 'utf8').indexOf(diverted) !== -1,
    'what the grammar diverted did not come back');
  assert.match(fs.readFileSync(header, 'utf8'), /export const Scanner/);
});

/* C unlinks what it was writing when it exits with a status; a pair where only
 * one of the two could be created has to leave neither.
 */
test('a header it cannot create leaves no scanner behind', function () {
  var source = grammar();
  var output = path.join(directory, 'unpaired.js');
  /* A path under a regular file, which no user can create - permissions
   * would not stop root, and CI often runs as one.
   */
  var wall = path.join(directory, 'wall');

  fs.writeFileSync(wall, '');

  var made = run(['--emit=javascript', '--noline',
    '--header-file=' + path.join(wall, 'x.d.ts'), '-o', output, source]);

  assert.notStrictEqual(made.status, 0, 'the unwritable header was accepted');
  assert.strictEqual(fs.existsSync(output), false,
    'the scanner was left behind without its header');
});

/* A start condition becomes a binding beside the scanner's own, and the one
 * declared last answers, so one named out of flex's own yy namespace would take
 * a scanner's binding over without a word.
 */
['YY_NL', 'yylex', 'YYSTATE'].forEach(function (name) {
    test('a start condition named ' + name + ' is refused', function () {
      var source = grammar([
        '%option noyywrap',
        '%x ' + name,
        '%%',
        '[a-z]+   { return 1; }',
        ''
      ].join('\n'));
      var output = path.join(directory, 'taken' + name + '.js');
      var made = run(['--emit=javascript', '--noline', '-o', output, source]);

      assert.notStrictEqual(made.status, 0, name + ' was accepted');
      assert.match(made.stderr, /flex's own/);
      assert.strictEqual(fs.existsSync(output), false,
        'a scanner was written anyway');
    });
  });

/* A file name travels to m4 inside the same quote pair a value does. One
 * carrying the pair used to exit 0 and write line directives naming a file
 * that does not exist, which the filter then never renumbered, or kill m4
 * with "end of file in string", naming neither the file nor the cause.
 */
[['the output', ['--emit=javascript', '--noline', '-o', 'we]]ird.js']],
 ['the header', ['--emit=javascript', '--noline', '--header-file=we]]ird.d.ts',
   '-o', 'fine.js']]].forEach(function (which) {
  test(which[0] + ' file name carrying a quote pair is refused', function () {
    var source = grammar([
      '%option noyywrap',
      '%%',
      '"a"      { return 1; }',
      '.|\\n     ;',
      ''
    ].join('\n'));
    var made = run(which[1].concat([source]));

    assert.notStrictEqual(made.status, 0, 'a corrupt name was accepted');
    assert.match(made.stderr, /cannot carry/);
  });
});

test('an input file name carrying a quote pair is refused', function () {
  var source = path.join(directory, 'we]]ird.l');
  fs.writeFileSync(source, [
    '%option noyywrap',
    '%%',
    '"a"      { return 1; }',
    '.|\\n     ;',
    ''
  ].join('\n'));
  var made = run(['--emit=javascript', '--noline', '-o',
    path.join(directory, 'fromweird.js'), source]);

  assert.notStrictEqual(made.status, 0, 'a corrupt name was accepted');
  assert.match(made.stderr, /cannot carry/);
});

/* A value is handed to m4 quoted so a comma in it survives, which leaves the
 * quote pairs. One escaping carries it through one m4 pass, and this back end
 * expands these rather than writing them out, which is a second. It used to
 * come out corrupt, or a subscript short, with flex reporting success.
 */
['pre-action', 'post-action', 'user-init'].forEach(function (option) {
  test('%option ' + option + ' carrying a quote pair is refused', function () {
    var source = grammar([
      '%option noyywrap',
      '%option ' + option + '="yy.a[yy.b[0]] = 1;"',
      '%%',
      '"a"      { return 1; }',
      '.|\\n     ;',
      ''
    ].join('\n'));
    var output = path.join(directory, 'pair-' + option + '.js');
    var made = run(['--emit=javascript', '--noline', '-o', output, source]);

    assert.notStrictEqual(made.status, 0, 'a corrupt value was accepted');
    assert.match(made.stderr, /cannot carry/);
  });
});

/* The comma the quoting was added for still has to survive. */
test('%option pre-action keeps a comma in its value', function () {
  var source = grammar([
    '%option noyywrap',
    '%option pre-action="yy.f(1, 2);"',
    '%%',
    '"a"      { return 1; }',
    '.|\\n     ;',
    ''
  ].join('\n'));
  var output = path.join(directory, 'comma.js');
  var made = run(['--emit=javascript', '--noline', '-o', output, source]);

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(output, 'utf8'), /yy\.f\(1, 2\);/);
});

/* %option emit chooses the back end again, and a back end brings a default for
 * `.' and for the table types. Defaults: what the grammar has already asked for
 * has to outlast the line that names the back end.
 */
[['before', '%option nounicode', '%option emit="javascript"'],
 ['after', '%option emit="javascript"', '%option nounicode']].forEach(function (order) {
  test('nounicode written ' + order[0] + ' emit is still honoured', function () {
    var source = grammar([
      '%option noyywrap',
      order[1],
      order[2],
      '%%',
      '.   { return 1; }',
      ''
    ].join('\n'));
    var output = path.join(directory, 'order-' + order[0] + '.js');
    var made = run(['--noline', '-o', output, source]);

    assert.strictEqual(made.status, 0, made.stderr);

    var Scanner = require(output).Scanner;
    var scanner = new Scanner('\u00e9');
    var count = 0;
    while (scanner.lex()) {
      count += 1;
    }

    // the two bytes of e-acute, one at a time, because `.' is a byte again
    assert.strictEqual(count, 2, 'nounicode was dropped');
  });
});

/* The names the back end writes beside the start conditions. A function in the
 * same scope shadows the constant, so BEGIN(input) reached the function and the
 * start condition came out NaN - one wrong token, then a fatal error.
 */
['BEGIN', 'ECHO', 'REJECT', 'input', 'unput', 'String', 'Buffer',
 'ArrayBuffer', 'Array', 'Error', 'process', 'module', 'exports',
 'undefined', 'Int8Array', 'Uint8Array', 'Int16Array', 'Uint16Array',
 'Int32Array', 'Uint32Array'].forEach(function (name) {
  test('a start condition named ' + name + ' is refused', function () {
    var source = grammar([
      '%option noyywrap',
      '%x ' + name,
      '%%',
      '[a-z]+   { return 1; }',
      ''
    ].join('\n'));
    var output = path.join(directory, 'bound' + name + '.js');
    var made = run(['--emit=javascript', '--noline', '-o', output, source]);

    assert.notStrictEqual(made.status, 0, name + ' was accepted');
    assert.match(made.stderr, /binds that name/);
    assert.strictEqual(fs.existsSync(output), false,
      'a scanner was written anyway');
  });
});

/* Loaded and run, not just generated: a name that breaks a scanner generates
 * perfectly well, so exit 0 says nothing on its own.
 */
['STRING', 'Yy', 'sc_yy', 'path', 'buffer', 'COMMENT'].forEach(function (name) {
  test('a start condition named ' + name + ' is left alone', function () {
    var source = grammar([
      '%option noyywrap',
      '%x ' + name,
      '%%',
      '[a-z]+   { return 1; }',
      '.|\\n     ;',
      ''
    ].join('\n'));
    var output = path.join(directory, 'fine' + name + '.js');
    var made = run(['--emit=javascript', '--noline', '-o', output, source]);

    assert.strictEqual(made.status, 0, made.stderr);

    var Scanner = require(output).Scanner;
    var scanner = new Scanner('ab');
    var tokens = [];

    while (scanner.lex() !== 0) {
      tokens.push(scanner.yytext);
    }
    assert.deepStrictEqual(tokens, ['ab']);

    var empty = new Scanner();
    assert.strictEqual(empty.lex(), 0);
  });
});

/* A C++ scanner includes FlexLexer.h, which has to be the one belonging to this
 * flex rather than whatever the system has, so the package carries it and says
 * where. The flag is ours, so it must not reach flex.
 */
test('--print-includedir names where the bundled headers are', function () {
  var dist = path.join(__dirname, '..', 'dist');
  var shown = childProcess.spawnSync(process.execPath,
    [path.join(__dirname, '..', 'bin', 'cli.js'), '--print-includedir'],
    { encoding: 'utf8' });

  /* dist/ is built rather than checked in, so a tree without it should say
   * so rather than name a directory that holds nothing.
   */
  if (!fs.existsSync(path.join(dist, 'FlexLexer.h'))) {
    assert.notStrictEqual(shown.status, 0,
      'it named a directory with no header in it');
    return;
  }

  assert.strictEqual(shown.status, 0, shown.stderr);
  assert.strictEqual(shown.stdout.trim(), dist);
});

test('--print-includedir beside a grammar does not answer instead of generating',
  function () {
    var source = grammar();
    var output = path.join(directory, 'notprinted.js');
    var made = childProcess.spawnSync(process.execPath,
      [path.join(__dirname, '..', 'bin', 'cli.js'), '--print-includedir',
        '--emit=javascript', '-o', output, source], { encoding: 'utf8' });

    assert.notStrictEqual(made.status, 0, 'it answered rather than refusing');
    assert.strictEqual(fs.existsSync(output), false);
  });

test('a reentrant scanner is refused rather than quietly not made', function () {
  ['reentrant', 'bison-bridge', 'bison-locations'].forEach(function (option) {
    var source = grammar([
      '%option noyywrap ' + option,
      '%%',
      '[a-z]+   { return 1; }',
      ''
    ].join('\n'));
    var made = run(['--emit=javascript', '--noline',
      '-o', path.join(directory, 'reentrant.js'), source]);

    assert.notStrictEqual(made.status, 0, option + ' was accepted');
    assert.match(made.stderr, /no reentrant mode/);
  });
});


test('yydecl is refused rather than quietly dropped', function () {
  var source = grammar([
    '%option noyywrap',
    '%option yydecl="int myscan(void)"',
    '%%',
    '[a-z]+   { return 1; }',
    ''
  ].join('\n'));
  var made = run(['--emit=javascript', '--noline',
    '-o', path.join(directory, 'yydecl.js'), source]);

  assert.notStrictEqual(made.status, 0, 'yydecl was accepted');
  assert.match(made.stderr, /yydecl is not supported/);
});

test('user-init reaches the scanner whole, commas and all', function () {
  var source = grammar([
    '%option noyywrap',
    '%option user-init="this.yy = { a: 1, b: 2 };"',
    '%%',
    '"a"      { return yy.a + yy.b; }',
    '.|\\n     ;',
    ''
  ].join('\n'));
  var output = path.join(directory, 'userinit.js');
  var made = run(['--emit=javascript', '--noline', '-o', output, source]);

  assert.strictEqual(made.status, 0, made.stderr);

  var Scanner = require(output).Scanner;
  assert.strictEqual(new Scanner('a').lex(), 3);
});
