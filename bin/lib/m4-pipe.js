/*
** Running m4 here rather than inside flex, which Windows has no fork for.
** flex/src/filter.c is what this stands in for; docs/building.md says how.
*/

'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');

/* What flex resolved, in a file of its own: the source carries whatever the
 * grammar's %top{} put there. See docs/building.md.
 */
function destinations(about) {
  /* Written through flex's own stdio, which ends lines with CRLF on Windows. */
  var lines = about.split(/\r?\n/);

  function said(key) {
    var found = null;

    lines.forEach(function (line) {
      if (line.indexOf(key + ' ') === 0) {
        found = line.slice(key.length + 1);
      }
    });
    return found;
  }

  return {
    outfile: said('outfile'),
    header: said('header'),
    toStdout: lines.indexOf('stdout') !== -1,
    lineExpression: said('lineregexp'),
    lineFormat: said('lineformat'),
    /* The generator wrote this file, so its line endings are the ones it
     * will write everywhere else too.
     */
    crlf: /\r\n/.test(about)
  };
}

/* What flex writes after the header branch: a blank line and a directive
 * naming the header, numbered the way flex numbers it before renumbering.
 */
var HEADER_TAIL = '\nm4_ifdef([[M4_HOOK_TRACE_LINE_FORMAT]], ' +
  '[[M4_HOOK_TRACE_LINE_FORMAT([[0]], [[M4_YY_OUTFILE_NAME]])]])';

/**
 * What flex defines for m4 before handing it the skeleton. The header branch
 * is the same source read again with M4_YY_IN_HEADER set, which is how flex
 * splits the two apart.
 */
function prologue(outfile, forHeader) {
  return [
    'm4_dnl ifdef(`__gnu__\', ,`errprint(Flex requires GNU M4. Set the PATH' +
      ' or set the M4 environment variable to its path name.) m4exit(2)\')',
    'm4_changecom`\'m4_dnl',
    'm4_changequote`\'m4_dnl',
    'm4_changequote([[,]])[[]]m4_dnl',
    'm4_define([[M4_YY_NOOP]])[[]]m4_dnl'
  ].concat(forHeader ? ['m4_define([[M4_YY_IN_HEADER]],[[]])m4_dnl'] : []).concat([
    'm4_define( [[M4_YY_OUTFILE_NAME]],[[' + (outfile || '<stdout>') + ']])m4_dnl',
    ''
  ]).join('\n');
}

/* Windows has no m4, so one is shipped beside the generator. */
function bundled() {
  var name = 'm4-' + process.platform + '-' + process.arch + '.exe';
  var candidate = path.join(__dirname, '..', '..', 'dist', name);
  return fs.existsSync(candidate) ? candidate : null;
}

/*
** How flex matches a line directive and how it writes one: the two properties
** the back end declares, so neither is worked out again here.
*/
function lineDirective(target) {
  return {
    write: function (lineno, named) {
      var escaped = named.replace(/[\\"]/g, '\\$&');

      /* Every conversion the template holds, the way flex's snprintf takes
       * them, and given as a function so a $ in the name stays a $.
       */
      return target.lineFormat.replace(/%[ds]/g, function (found) {
        return found === '%d' ? lineno : escaped;
      });
    },
    /* None where flex writes no directives, and blank lines are squeezed
     * all the same: that half of the filter does not depend on them.
     */
    expression: target.lineExpression && new RegExp(target.lineExpression)
  };
}


/* What one fgets takes out of filter_fix_linedirs's buffer. */
var FLEX_LINE_READ = 4095;

/** Renumbers the directives naming what flex wrote, and squeezes it. */
function fixLineDirectives(text, wrote, directive, crlf) {
  /* Undone where they were added, which is a Windows generator or m4. */
  var body = crlf ? text.replace(/\r\n/g, '\n') : text;
  var ends = body.charAt(body.length - 1) === '\n';
  var lines = body.split('\n');
  var kept = [];
  var generated = true;
  var wasBlank = false;
  var lineno = 1;

  /* Splitting leaves an empty piece after a final newline; flex reads lines. */
  if (ends) {
    lines.pop();
  }

  lines.forEach(function (line) {
    var found = directive.expression && directive.expression.exec(line);
    var read = line.length;

    if (found) {
      /* flex counts a directive naming either file it writes as its own. */
      generated = wrote.indexOf(found[2]) !== -1;
      if (generated) {
        line = directive.write(lineno + 1, found[2]);
      }
      wasBlank = false;
    } else if (generated && /^[ \t\v\f\r]*$/.test(line)) {
      if (wasBlank) {
        return;
      }
      wasBlank = true;
    } else {
      wasBlank = false;
    }
    kept.push(line);

    /* Counted the way flex counts, which is per read and not per newline. */
    lineno += Math.ceil((read + 1) / FLEX_LINE_READ);
  });

  return kept.join('\n') + (ends ? '\n' : '');
}

/*
** Generates through flex and then m4, and answers as spawnSync would. flex is
** given the command line untouched; where it wrote is what it says.
*/
function generate(list, flex, fail) {
  var scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'flex-js-m4-'));

  function clear() {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  /* fail() ends the process, which runs no finally, so it clears up first. */
  function give(message) {
    clear();
    fail(message);
  }

  try {
    /* flex leaves its filters to this one, so asking for some of them would
     * be answered by neither.
     */
    list.forEach(function (argument) {
      if (argument.indexOf('--preproc') === 0) {
        give('flex-js runs m4 itself on this platform, so it chooses ' +
          '--preproc. Generate without it.');
      }
    });

    var written = path.join(scratch, 'source.m4');
    var about = path.join(scratch, 'about');

    var ran = childProcess.spawnSync(flex, list, {
      stdio: 'inherit',
      env: Object.assign({}, process.env, {
        FLEX_JS_M4_OUT: written,
        FLEX_JS_M4_ABOUT: about
      })
    });

    if (ran.error || ran.status !== 0 || !fs.existsSync(about)) {
      return ran;
    }

    var source = fs.readFileSync(written);
    var target = destinations(fs.readFileSync(about, 'latin1'));
    var m4 = process.env.M4 || bundled() || 'm4';
    /* What flex counts as its own to renumber: both files it writes, each
     * standing in as <stdout> where there is no name for it.
     */
    var wrote = [target.outfile || '<stdout>', target.header || '<stdout>'];
    var failed = null;

    /* The same source, read once for the scanner and again for the header,
     * which is the pair of m4 runs flex forks when it can.
     */
    function expand(name, forHeader) {
      var input = path.join(scratch, forHeader ? 'header.m4' : 'scanner.m4');

      var tail = forHeader && target.lineFormat ? HEADER_TAIL : '';

      fs.writeFileSync(input, Buffer.concat([
        Buffer.from(prologue(name, forHeader), 'latin1'), source,
        Buffer.from(tail, 'latin1')
      ]));

      var out = childProcess.spawnSync(m4, ['-P', input],
        { encoding: 'buffer', maxBuffer: Infinity });

      if (out.error) {
        give('flex-js could not run m4 (' + m4 + '): ' + out.error.message);
      }

      /* A forked m4 writes straight to the console, so a warning from one that
       * still succeeded has to reach it from here too.
       */
      if (out.stderr && out.stderr.length) {
        process.stderr.write(out.stderr);
      }

      if (out.status !== 0) {
        failed = failed || out;
        return null;
      }

      var text = out.stdout.toString('latin1');

      return Buffer.from(
        fixLineDirectives(text, wrote, lineDirective(target), target.crlf),
        'latin1');
    }

    var scanner = expand(target.outfile, false);
    var declared = !failed && target.header ? expand(target.header, true) : null;

    if (failed) {
      return failed;
    }

    /* The name came out of flex as bytes and is held one per code unit, so
     * it goes to the filesystem as those bytes rather than as text again.
     */
    function land(named, content) {
      try {
        fs.writeFileSync(Buffer.from(named, 'latin1'), content);
      } catch (error) {
        give('flex-js: could not create ' + named);
      }
    }

    if (target.toStdout) {
      process.stdout.write(scanner);
    } else {
      land(target.outfile, scanner);
    }

    if (declared) {
      land(target.header, declared);
    }
    return ran;
  } finally {
    clear();
  }
}

module.exports = {
  prologue: prologue,
  generate: generate
};
