/*
** Generates a scanner from a grammar written inline and loads it.
**
** FLEX_JS names the generator; without it the one built by ./build.sh is used,
** so the tests run against a checkout as well as against the shipped binary.
*/

'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');
var test = require('node:test');

var GENERATOR = process.env.FLEX_JS ||
  path.join(__dirname, '..', 'build', 'flex', 'src', 'flex');

/**
 * A directory for what a run generates, taken away again when it ends.
 */
function tempDirectory(name) {
  var made = fs.mkdtempSync(path.join(os.tmpdir(), 'flex-js-' + name + '-'));

  test.after(function () {
    fs.rmSync(made, { recursive: true, force: true });
  });
  return made;
}

var directory = tempDirectory('test');
var counter = 0;

/**
 * Writes the grammar, generates a scanner from it and returns the module.
 * Extra arguments for the generator go in options.args.
 */
function build(grammar, options) {
  var name = 'scanner' + (++counter);
  var source = path.join(directory, name + '.l');
  var output = path.join(directory, name + '.js');

  fs.writeFileSync(source, grammar);

  var args = (options && options.args ? options.args : [])
    .concat(['--emit=javascript', '--noline', '-o', output, source]);
  var run = childProcess.spawnSync(GENERATOR, args, { encoding: 'utf8' });

  if (run.error) {
    throw new Error('running ' + GENERATOR + ' failed: ' + run.error.message);
  }

  if (run.status !== 0) {
    throw new Error('generating ' + name + ' failed: ' + (run.stderr || run.stdout));
  }

  return { Scanner: require(output), path: output };
}

/** Everything the scanner returns for a string, as an array. */
function lexAll(Scanner, source, prepare) {
  var scanner = new Scanner(source);
  if (prepare) {
    prepare(scanner);
  }
  var tokens = [];
  var token;
  while ((token = scanner.lex()) !== 0) {
    tokens.push(token);
  }
  return tokens;
}

/** Collects what ECHO and the default rule write. */
function sink() {
  var written = [];
  return {
    write: function (text) { written.push(text); },
    text: function () { return written.join(''); }
  };
}

module.exports = {
  GENERATOR: GENERATOR,
  build: build,
  lexAll: lexAll,
  sink: sink,
  directory: directory,
  tempDirectory: tempDirectory
};
