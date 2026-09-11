#!/usr/bin/env node

/*
** Runs the prebuilt generator for this platform.
**
** Arguments are flex's own and pass through untouched. FLEX_JS names a
** generator to use instead. The one thing flex cannot do for itself here is
** run m4 where there is no fork, which is what lib/m4-pipe.js is for.
*/

'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

var m4Pipe = require('./lib/m4-pipe.js');

var BINARIES = {
  'darwin-x64': 'flex-js-darwin-universal',
  'darwin-arm64': 'flex-js-darwin-universal',
  'linux-x64': 'flex-js-linux-x64',
  'linux-arm64': 'flex-js-linux-arm64',
  'win32-x64': 'flex-js-win32-x64.exe',
  'win32-arm64': 'flex-js-win32-arm64.exe'
};

/* Windows has no fork, so m4 runs here instead of inside flex. */
var PIPES_M4 = process.platform === 'win32' || process.env.FLEX_JS_PIPE_M4 === '1';

var args = process.argv.slice(2);

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
        ? 'On Windows, run it under WSL or build from source under MSYS2:'
        : 'It can be built from source:') + '\n' +
      'https://github.com/sormy/flex-js#installing');
  }

  return built;
}

var flex = generator();

/* The pipe sets both of these, so one arriving from outside would send the
 * scanner or what flex says about it somewhere nobody asked for.
 */
delete process.env.FLEX_JS_M4_OUT;
delete process.env.FLEX_JS_M4_ABOUT;

var run = PIPES_M4
  ? m4Pipe.generate(args, flex, fail)
  : childProcess.spawnSync(flex, args, { stdio: 'inherit', argv0: 'flex-js' });

if (run.error) {
  fail(run.error.message);
}

if (run.status !== 0) {
  process.exit(run.status === null ? 1 : run.status);
}
