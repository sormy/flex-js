#!/usr/bin/env node

/*
** Runs the prebuilt generator for this platform.
**
** Arguments are flex's own and pass through untouched. FLEX_JS names a
** generator to use instead.
*/

'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var os = require('os');

var BINARIES = {
  'darwin-x64': 'flex-js-darwin-universal',
  'darwin-arm64': 'flex-js-darwin-universal',
  'linux-x64': 'flex-js-linux-x64',
  'linux-arm64': 'flex-js-linux-arm64',
  'win32-x64': 'flex-js-win32-x64.exe',
  'win32-arm64': 'flex-js-win32-arm64.exe'
};

var args = process.argv.slice(2);

/* Ours, not flex's, so it is answered here rather than passed on: a C++ scanner
 * includes FlexLexer.h, and it has to be the one belonging to this flex.
 */
var INCLUDEDIR = '--print-includedir';

var BUILD_IT = 'It can be built from source:\n' +
  'https://github.com/sormy/flex-js#installing';

function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(1);
}

/** Whether a name reaches this very file, however it was written. */
function isThisFile(named) {
  try {
    return fs.realpathSync(named) === fs.realpathSync(__filename);
  } catch (error) {
    return false;
  }
}

function generator() {
  var named = process.env.FLEX_JS;

  /* test:dist points FLEX_JS here; running ourselves again would not end. */
  if (named && !isThisFile(named)) {
    return named;
  }

  var platform = process.platform + '-' + process.arch;
  var binary = BINARIES[platform];
  var built = binary && path.join(__dirname, '..', 'dist', binary);

  /* dist/ is what the published package carries and what build-dist.sh
   * writes, so a checkout without it has not been built yet.
   */
  if (!built || !fs.existsSync(built)) {
    fail(
      (binary
        ? 'flex-js has no generator in dist/ to run.'
        : 'flex-js ships no generator for ' + platform + '.') + '\n' +
      (process.platform === 'win32' && !binary
        ? 'On Windows, run it under WSL or build from source under MSYS2:\n' +
          'https://github.com/sormy/flex-js#installing'
        : BUILD_IT));
  }

  return built;
}

/* On its own, so that asking for it alongside a grammar cannot answer instead
 * of generating; anywhere else it goes to flex, which says it knows no such
 * option.
 */
if (args.length === 1 && args[0] === INCLUDEDIR) {
  var includedir = path.join(__dirname, '..', 'dist');

  if (!fs.existsSync(path.join(includedir, 'FlexLexer.h'))) {
    fail('flex-js has no headers in dist/ to point at.\n' + BUILD_IT);
  }
  process.stdout.write(includedir + '\n');
  process.exit(0);
}

var run = childProcess.spawnSync(generator(), args,
  { stdio: 'inherit', argv0: 'flex-js' });

if (run.error) {
  fail(run.error.message);
}

/* A shell says a signal as 128 plus its number, and a caller that reads an
 * interrupt as an ordinary failure carries on when it should stop.
 */
if (run.signal) {
  /* 128 alone would say signal 0, which is not one; a plain failure says
   * it died without naming a signal this platform does not carry.  */
  var number = os.constants.signals[run.signal];
  process.exit(number === undefined ? 1 : 128 + number);
}

/* A null status with no signal and no error is not a success. */
if (run.status !== 0) {
  process.exit(run.status === null ? 1 : run.status);
}
