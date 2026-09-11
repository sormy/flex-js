'use strict';

/*
** The examples are what the documentation points a reader at first, so they
** are generated and run here.
*/

var test = require('node:test');
var assert = require('node:assert');
var path = require('path');
var childProcess = require('child_process');
var helper = require('./helper.js');

var GENERATOR = helper.GENERATOR;

var EXAMPLES = path.join(__dirname, '..', 'examples');

var directory = helper.tempDirectory('examples');

function build(name) {
  var output = path.join(directory, name + '.js');
  var run = childProcess.spawnSync(GENERATOR,
    ['--emit=javascript', '--noline', '-o', output,
     path.join(EXAMPLES, name + '.l')], { encoding: 'utf8' });

  assert.strictEqual(run.status, 0, 'generating ' + name + ': ' + run.stderr);
  return require(output);
}

test('calculator', function () {
  var tokens = build('calculator').tokenize('2 * (3 + abc) # note');

  assert.deepStrictEqual(tokens.map(function (token) { return token.kind; }),
    ['number', 'operator', 'bracket', 'number', 'operator', 'name', 'bracket']);
  assert.strictEqual(tokens[5].value, 'abc');
});

/* Built on first use: at load time a failure would take the whole file down
 * with it, and once built it is the same scanner for every case.
 */
var jsonExample = null;

function json() {
  if (jsonExample === null) {
    jsonExample = build('json');
  }
  return jsonExample;
}

test('json', function () {
  var tokens = json().tokenize('{"a": [1, true, "x\\ny"], "b": null}');

  assert.deepStrictEqual(tokens.map(function (token) { return token.kind; }),
    ['punctuation', 'string', 'punctuation', 'punctuation', 'number',
     'punctuation', 'boolean', 'punctuation', 'string', 'punctuation',
     'punctuation', 'string', 'punctuation', 'null', 'punctuation']);
  assert.strictEqual(tokens[8].value, 'x\ny');
});

test('json reads every escape the format defines', function () {
  var tokens = json().tokenize('"a\\u0041b\\/c\\rd\\be\\ff"');

  assert.deepStrictEqual(tokens,
    [{ kind: 'string', value: 'aAb/c\rd\be\ff' }]);
});

test('json names an escape it does not know', function () {
  ['"a\\qb"', '"a\\\nb"', '"ab\\'].forEach(function (text) {
    var bad = json().tokenize(text).filter(function (token) {
      return token.kind === 'error' && /bad escape/.test(token.value);
    });

    assert.strictEqual(bad.length, 1,
      'no bad escape reported for ' + JSON.stringify(text));
  });
});

test('json reports an unterminated string and stops', function () {
  var tokens = json().tokenize('{"a": "no closing quote');

  assert.deepStrictEqual(tokens.map(function (token) { return token.kind; }),
    ['punctuation', 'string', 'punctuation', 'error']);
  assert.match(tokens[3].value, /unterminated string on line 1/);
});

test('words', function () {
  var tokens = build('words').tokenize('héllo 42 日本');

  assert.deepStrictEqual(tokens, [
    { kind: 'word', value: 'héllo', length: 5 },
    { kind: 'number', value: '42' },
    { kind: 'word', value: '日本', length: 2 }
  ]);
});
