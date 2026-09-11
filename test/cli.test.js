'use strict';

/*
** bin/cli.js: what it writes beside a scanner, and the path Windows takes.
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
  assert.match(types, /export = Scanner;/);
  assert.match(types, /^ {2}unput\(/m);
  assert.doesNotMatch(types, /m4_/, 'm4 reached the declaration file');
});

test('the interface is named after -P', function () {
  var made = declared({ before: ['--emit=javascript', '-P', 'sql'] });

  assert.match(fs.readFileSync(made.header, 'utf8'), /interface sqlScanner \{/);
  assert.match(fs.readFileSync(made.output, 'utf8'), /module\.exports = sqlScanner;/);
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

test('the C header the pipe writes is the one flex writes', function () {
  var source = grammar();

  function build(name, environment) {
    var scanner = path.join(directory, name, 'scanner.c');
    var header = path.join(directory, name, 'scanner.h');

    fs.mkdirSync(path.dirname(scanner), { recursive: true });
    var made = run(['--header-file=' + header, '-o', scanner, source], environment);

    assert.strictEqual(made.status, 0, made.stderr);
    return {
      /* The directives name the file each run wrote, which is all that differs. */
      scanner: fs.readFileSync(scanner, 'utf8').split(scanner).join('X'),
      header: fs.readFileSync(header, 'utf8').split(header).join('X')
    };
  }

  var piped = build('c-piped', { FLEX_JS_PIPE_M4: '1' });
  var forked = build('c-forked', {});

  assert.strictEqual(piped.header, forked.header);
  assert.strictEqual(piped.scanner, forked.scanner);
});

test('the pipe writes the same header as a forked m4', function () {
  function build(name, environment) {
    var source = grammar();
    var output = path.join(directory, name, 'scanner.js');
    var header = path.join(directory, name, 'scanner.d.ts');

    fs.mkdirSync(path.dirname(output), { recursive: true });
    var made = run(['--emit=javascript', '--noline', '--header-file=' + header,
      '-o', output, source], environment);

    assert.strictEqual(made.status, 0, made.stderr);
    return fs.readFileSync(header, 'utf8');
  }

  assert.strictEqual(build('h-piped', { FLEX_JS_PIPE_M4: '1' }),
    build('h-forked', {}));
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

test('running m4 here gives the same scanner as letting flex fork it', function () {
  var source = grammar();
  var forked = source.replace(/\.l$/, '-forked.js');
  var piped = source.replace(/\.l$/, '-piped.js');

  assert.strictEqual(
    run(['--emit=javascript', '--noline', '-o', forked, source]).status, 0);
  var second = run(['--emit=javascript', '--noline', '-o', piped, source],
    { FLEX_JS_PIPE_M4: '1' });
  assert.strictEqual(second.status, 0, second.stderr);

  assert.strictEqual(fs.readFileSync(piped, 'utf8'), fs.readFileSync(forked, 'utf8'));
});

test('an option whose value holds a t still runs through the pipe', function () {
  var source = grammar();
  var output = source.replace(/\.l$/, '.js');
  var made = run(['--emit=javascript', '-Dtest', '--noline', '-o', output, source],
    { FLEX_JS_PIPE_M4: '1' });

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(output, 'utf8'), /module\.exports = Scanner;/);
});

/* No --noline: the directives are what the pipe has to renumber, and with
 * them suppressed neither that nor the blank-line squeezing is exercised.
 */
test('the pipe writes to stdout when flex was told to', function () {
  var source = grammar();
  var piped = run(['--emit=javascript', '-t', source], { FLEX_JS_PIPE_M4: '1' });
  var forked = run(['--emit=javascript', '-t', source]);

  assert.strictEqual(piped.status, 0, piped.stderr);
  assert.strictEqual(forked.status, 0, forked.stderr);
  assert.match(piped.stdout, /module\.exports = Scanner;/);
  assert.match(piped.stdout, /#line [0-9]+ "<stdout>"/);
  assert.strictEqual(piped.stdout, forked.stdout);
});

test('-t names the directives after -o, and still writes to stdout', function () {
  var source = grammar();
  var named = source.replace(/\.l$/, '.js');
  var piped = run(['--emit=javascript', '-t', '-o', named, source],
    { FLEX_JS_PIPE_M4: '1' });
  var forked = run(['--emit=javascript', '-t', '-o', named, source]);

  assert.strictEqual(piped.status, 0, piped.stderr);
  assert.strictEqual(piped.stdout, forked.stdout);
  assert.match(piped.stdout, /module\.exports = Scanner;/);
  assert.doesNotMatch(piped.stdout, /"<stdout>"/);
});

test('a C header with --noline ends where flex ends one', function () {
  var source = grammar();

  function build(name, environment) {
    var scanner = path.join(directory, name, 'noline.c');
    var header = path.join(directory, name, 'noline.h');

    fs.mkdirSync(path.dirname(scanner), { recursive: true });
    var made = run(['--noline', '--header-file=' + header, '-o', scanner, source],
      environment);

    assert.strictEqual(made.status, 0, made.stderr);
    return fs.readFileSync(header, 'utf8').split(header).join('X');
  }

  var piped = build('nl-piped', { FLEX_JS_PIPE_M4: '1' });

  assert.doesNotMatch(piped, /#line/, 'a directive was written under --noline');
  assert.strictEqual(piped, build('nl-forked', {}));
});

test('a grammar cannot name a file for the pipe to write', function () {
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
  var made = run(['--emit=javascript', '--noline', '-o', output, source],
    { FLEX_JS_PIPE_M4: '1' });

  assert.strictEqual(made.status, 0, made.stderr);
  assert.strictEqual(fs.existsSync(forged), false,
    'the grammar named a file and the pipe wrote it');
  assert.match(fs.readFileSync(output, 'utf8'), /module\.exports = Scanner;/);
});

test('a name with an accent in it is the name that gets written', function () {
  var source = grammar();
  var output = path.join(directory, 'scann\u00e9.js');
  var header = path.join(directory, 'h\u00e9ader.d.ts');
  var made = run(['--emit=javascript', '--noline', '--header-file=' + header,
    '-o', output, source], { FLEX_JS_PIPE_M4: '1' });

  assert.strictEqual(made.status, 0, made.stderr);
  assert.ok(fs.existsSync(output), 'the scanner landed under another name');
  assert.ok(fs.existsSync(header), 'the header landed under another name');
});

test('a scanner named - is a file, not stdout', function () {
  var source = grammar();
  var output = path.join(directory, '-');
  var made = run(['--emit=javascript', '--noline', '-o', output, source],
    { FLEX_JS_PIPE_M4: '1' });

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(output, 'utf8'), /module\.exports = Scanner;/);
});

['FLEX_JS_M4_OUT', 'FLEX_JS_M4_ABOUT'].forEach(function (named) {
  test('a stray ' + named + ' does not divert the scanner', function () {
    var source = grammar();
    var output = source.replace(/\.l$/, '.js');
    var stray = {};

    stray[named] = path.join(directory, 'stray-' + named);
    var made = run(['--emit=javascript', '--noline', '-o', output, source], stray);

    assert.strictEqual(made.status, 0, made.stderr);
    assert.match(fs.readFileSync(output, 'utf8'), /module\.exports = Scanner;/);
  });
});

/* flex resolves these, so the shim never reads them: the spellings it accepts
 * for naming a file are more than a wrapper could keep up with.
 */
[['clustered -vo', ['-vo']],
  ['an abbreviated --outfil=', ['--outfil=']],
  ['-o on its own', ['-o']]
].forEach(function (spelling) {
  test('the pipe writes where ' + spelling[0] + ' says', function () {
    var source = grammar();
    var output = source.replace(/\.l$/, '.js');
    var named = spelling[1][0];
    var args = named.charAt(named.length - 1) === '='
      ? ['--emit=javascript', '--noline', named + output, source]
      : ['--emit=javascript', '--noline', named, output, source];
    var made = run(args, { FLEX_JS_PIPE_M4: '1' });

    assert.strictEqual(made.status, 0, made.stderr);
    assert.match(fs.readFileSync(output, 'utf8'), /module\.exports = Scanner;/);
  });
});

test('the pipe writes where %option header-file says', function () {
  var header = path.join(directory, 'by-option.d.ts');
  var source = grammar(GRAMMAR.replace('%option noyywrap',
    '%option noyywrap header-file="' + header.replace(/\\/g, '\\\\') + '"'));
  var output = source.replace(/\.l$/, '.js');
  var made = run(['--emit=javascript', '--noline', '-o', output, source],
    { FLEX_JS_PIPE_M4: '1' });

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(header, 'utf8'), /interface Scanner \{/);
});

test('a header is written even when the scanner goes to stdout', function () {
  var source = grammar();
  var header = source.replace(/\.l$/, '.d.ts');
  var made = run(['--emit=javascript', '--noline', '--header-file=' + header,
    '-t', source], { FLEX_JS_PIPE_M4: '1' });

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(made.stdout, /module\.exports = Scanner;/);
  assert.match(fs.readFileSync(header, 'utf8'), /export = Scanner;/);
});

test('the pipe writes where %option outfile says', function () {
  var output = path.join(directory, 'by-option.js');
  var source = grammar(GRAMMAR.replace('%option noyywrap',
    '%option noyywrap outfile="' + output.replace(/\\/g, '\\\\') + '"'));
  var made = run(['--emit=javascript', '--noline', source],
    { FLEX_JS_PIPE_M4: '1' });

  assert.strictEqual(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(output, 'utf8'), /module\.exports = Scanner;/);
});



test('running m4 in a pipe gives what forking it gives', function () {
  var grammar = path.join(directory, 'both-ways.l');
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

  function build(name, environment) {
    var output = path.join(directory, name, 'scanner.js');
    fs.mkdirSync(path.dirname(output), { recursive: true });

    var made = run(['--emit=javascript', '-o', output, grammar], environment);
    assert.strictEqual(made.status, 0, made.stderr);

    // the directives name the file they are in, which is the only difference
    return fs.readFileSync(output, 'utf8').split(path.dirname(output)).join('X');
  }

  var forked = build('forked', {});
  var piped = build('piped', { FLEX_JS_PIPE_M4: '1' });

  assert.doesNotMatch(piped, /M4_YY_OUTFILE_NAME/,
    'the piped run left an m4 macro in the output');
  assert.strictEqual(piped, forked);
});

test('a grammar written with CRLF comes back the same either way', function () {
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

  function build(name, environment) {
    var output = path.join(directory, name + '-crlf.js');
    var made = run(['--emit=javascript', '--noline', '-o', output, source],
      environment);

    assert.strictEqual(made.status, 0, made.stderr);
    return fs.readFileSync(output, 'utf8');
  }

  assert.strictEqual(build('piped', { FLEX_JS_PIPE_M4: '1' }), build('forked', {}));
});

test('a grammar too big for one buffer still comes back through the pipe',
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
    var piped = path.join(directory, 'big-piped.js');
    var forked = path.join(directory, 'big-forked.js');

    // m4 writes well over a megabyte here, which is where a default pipe ends
    var one = run(['--emit=javascript', '-Cf', '--noline', '-o', piped, source],
      { FLEX_JS_PIPE_M4: '1' });
    assert.strictEqual(one.status, 0, one.stderr);

    var two = run(['--emit=javascript', '-Cf', '--noline', '-o', forked, source]);
    assert.strictEqual(two.status, 0, two.stderr);

    assert.ok(fs.statSync(piped).size > 1048576, 'the grammar was not big enough');
    assert.strictEqual(fs.readFileSync(piped, 'utf8'), fs.readFileSync(forked, 'utf8'));
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

  var Scanner = require(output);
  assert.strictEqual(new Scanner('a').lex(), 3);
});
