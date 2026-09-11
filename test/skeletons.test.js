'use strict';

/*
** The two back ends emit the same scanner, so their skeletons have to stay
** the same but for the types and the few places marked as divergent. This is
** what keeps the matcher from drifting between them now that each is written
** by hand.
*/

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');

var SKELETON = path.join(__dirname, '..', 'skeleton');

/** Everything between the divergence markers, which each back end owns. */
function withoutDivergences(text) {
  var kept = [];
  var depth = 0;

  /* Counted rather than flagged, so an inner marker cannot end an outer block
   * and let the lines after it be compared out of alignment.
   */
  text.split('\n').forEach(function (line) {
    if (line.indexOf('%# BACKEND-DIVERGENCE') === 0) {
      depth += 1;
      return;
    }
    if (line.indexOf('%# END BACKEND-DIVERGENCE') === 0) {
      depth -= 1;
      return;
    }
    if (depth === 0) {
      kept.push(line);
    }
  });

  assert.strictEqual(depth, 0, 'a divergence marker was left open');
  return kept.join('\n');
}

/** TypeScript with its types taken back off reads as the JavaScript. */
function withoutTypes(text) {
  return text
    .replace(/\(this: ScannerState, /g, '(')
    .replace(/\(this: ScannerState\)/g, '()')
    .replace(/(?<![\w$])\((\w+) as unknown as [\w[\]]+\)/g, '$1')
    .replace(/ as unknown as [\w[\]]+/g, '')
    .replace(/: M4_JS_EXPORT_NAME\[\[Constructor\]\]/g, '')
    .replace(/: ScannerState/g, '')
    .replace(/\bsource\?(?=:)/g, 'source')
    /* Anchored on what follows, so the same words in a comment or a quoted
     * message are left alone rather than normalised into a match.
     */
    .replace(/: (?:string \| Uint8Array|number\[\]\[\]|number\[\]|Uint8Array|string|number|boolean|any|never|unknown)(?=\s*[),;={]|$)/gm, '');
}

test('taking the types off leaves the JavaScript alone', function () {
  /* Outside its own fences, where the declarations it writes are TypeScript. */
  var js = withoutDivergences(
    fs.readFileSync(path.join(SKELETON, 'js-flex.skl'), 'utf8'));

  /* The comparison below only means anything if the rewriting is confined to
   * what TypeScript adds; anything it changes here it could hide there.
   */
  assert.strictEqual(withoutTypes(js), js);
});

/* Prose and quoted text that reads like an annotation, which the rewriting
 * above would flatten - and so could flatten a real difference away.
 */
function proseIn(line) {
  var comment = /(?:%#|\/\/|\/\*|^\s*\*)(.*)$/.exec(line);

  return (line.match(/'(?:[^'\\]|\\.)*'/g) || [])
    .concat(comment ? [comment[1]] : []);
}

test('no comment or message reads like a type annotation', function () {
  ['js-flex.skl', 'ts-flex.skl'].forEach(function (name) {
    fs.readFileSync(path.join(SKELETON, name), 'utf8').split('\n')
      .forEach(function (line, at) {
        proseIn(line).forEach(function (prose) {
          assert.strictEqual(withoutTypes(prose), prose,
            name + ':' + (at + 1) + ' would be rewritten by the type stripper,' +
            ' which could hide a difference: ' + prose);
        });
      });
  });
});

test('the two skeletons say the same thing', function () {
  var js = withoutDivergences(fs.readFileSync(path.join(SKELETON, 'js-flex.skl'), 'utf8'));
  var ts = withoutTypes(withoutDivergences(
    fs.readFileSync(path.join(SKELETON, 'ts-flex.skl'), 'utf8')));

  if (js === ts) {
    return;
  }

  var jsLines = js.split('\n');
  var tsLines = ts.split('\n');
  var report = [];

  for (var index = 0; index < Math.max(jsLines.length, tsLines.length); index++) {
    if (jsLines[index] !== tsLines[index]) {
      report.push('line ' + (index + 1) +
        '\n  js: ' + JSON.stringify(jsLines[index]) +
        '\n  ts: ' + JSON.stringify(tsLines[index]));
      if (report.length === 5) {
        break;
      }
    }
  }

  assert.fail('the skeletons have drifted apart:\n' + report.join('\n'));
});

/*
** What a back end is allowed to own, by the line each fenced block opens with.
** The comparison above cannot see inside a fence, so a new one has to be added
** here first, which is what stops a fence being used to change one skeleton
** and not the other.
*/
var DIVERGENCES = {
  'js-flex.skl': [
    '%# JavaScript back end for flex.',
    'm4_define([[M4_PROPERTY_BACKEND_NAME]], [[JavaScript]])',
    '%# What --header-file writes: flex sends the same source down a second m4',
    'if (typeof module !== \'undefined\' && module.exports) {'
  ],
  'ts-flex.skl': [
    '%# TypeScript back end for flex.',
    'm4_define([[M4_PROPERTY_BACKEND_NAME]], [[TypeScript]])',
    '%# TypeScript will not read a name it has never been given, even under typeof,',
    '%# The scanner describes itself, so there is no header to write beside it.',
    'export interface M4_JS_EXPORT_NAME {',
    'export default M4_JS_EXPORT_NAME;'
  ]
};

/*
** The names a rule body may write that flex lets through as m4 macros. m4
** rewrites them wherever they appear, a comment or a string included, so
** every occurrence that reaches it has to be quoted.
*/
var EXPANDED = ['yyless', 'yyterminate'];

test('a macro name in skeleton text is quoted against m4', function () {
  ['js-flex.skl', 'ts-flex.skl'].forEach(function (name) {
    fs.readFileSync(path.join(SKELETON, name), 'utf8').split('\n')
      .forEach(function (line, at) {
        /* %# lines are the skeleton's own; flex drops them before m4. */
        if (line.indexOf('%#') === 0) {
          return;
        }
        EXPANDED.forEach(function (macro) {
          var bare = line.split('[[' + macro + ']]').join('');

          assert.ok(bare.indexOf(macro) === -1 || /m4_define/.test(line),
            name + ':' + (at + 1) + ' writes ' + macro +
            ' where m4 will expand it: ' + line.trim());
        });
      });
  });
});

test('the divergences are the ones that were agreed', function () {
  Object.keys(DIVERGENCES).forEach(function (name) {
    var lines = fs.readFileSync(path.join(SKELETON, name), 'utf8').split('\n');
    var opened = [];
    var depth = 0;

    lines.forEach(function (line, at) {
      if (line.indexOf('%# BACKEND-DIVERGENCE') === 0) {
        assert.notStrictEqual(lines[at + 1], undefined,
          'a divergence opens on the last line of ' + name);
        opened.push(lines[at + 1]);
        depth += 1;
      } else if (line.indexOf('%# END BACKEND-DIVERGENCE') === 0) {
        depth -= 1;
        assert.ok(depth >= 0, 'a divergence in ' + name + ' ends before it opens');
      }
    });

    assert.strictEqual(depth, 0, 'unbalanced markers in ' + name);
    assert.deepStrictEqual(opened, DIVERGENCES[name],
      'the divergences in ' + name + ' are not the ones listed here');
  });
});
