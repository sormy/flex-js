var nodeTest = require('node:test');
var assert = require('node:assert');

var describe = nodeTest.describe;
var it = nodeTest.it;

var Lexer = require('../src/Lexer.js');

var ASCII_LIMIT = 128;

/**
 * Reference dispatch: offers every rule for every character.
 */
function buildExhaustiveDispatch(rules) {
  var byCharCode = new Array(ASCII_LIMIT);
  var nonAscii = [];
  var eof = [];
  var charCode;

  for (charCode = 0; charCode < ASCII_LIMIT; charCode++) {
    byCharCode[charCode] = [];
  }

  var fallbackEof = [];

  for (var index = 0; index < rules.length; index++) {
    if (rules[index].isEOF) {
      (rules[index].isFallbackEOF ? fallbackEof : eof).push(index);
      continue;
    }
    for (charCode = 0; charCode < ASCII_LIMIT; charCode++) {
      byCharCode[charCode].push(index);
    }
    nonAscii.push(index);
  }

  return { byCharCode: byCharCode, nonAscii: nonAscii, eof: eof.concat(fallbackEof) };
}

function lexWith(grammar, source, exhaustive) {
  var lexer = new Lexer();
  if (exhaustive) {
    lexer.buildDispatch = buildExhaustiveDispatch;
  }
  var echoed = [];
  lexer.setOutput(function (text) { echoed.push(text); });

  if (grammar.ignoreCase) {
    lexer.setIgnoreCase(true);
  }
  grammar.rules.forEach(function (expression, index) {
    lexer.addRule(expression, function (current) { return index + ':' + current.text; });
  });

  lexer.setSource(source);
  return { tokens: lexer.lexAll(), echoed: echoed, index: lexer.index };
}

describe('rule dispatch', function () {
  var grammars = [
    { name: 'identifiers and numbers', rules: [/[a-zA-Z_][a-zA-Z0-9_]*/, /[0-9]+/, /\s+/] },
    { name: 'longest match across overlapping rules', rules: [/[0-9]+/, /[0-9]+\.[0-9]+/, /\./] },
    { name: 'shorter rule declared first', rules: ['>', '>=', 'in', /[a-z]+/] },
    { name: 'anchored rules', rules: [/^start/, /end$/, /[a-z]+/, /\s+/] },
    { name: 'alternation and groups', rules: [/a|bb|ccc/, /(?:xy)+/, /[a-z]/] },
    { name: 'catch-all dot', rules: [/[0-9]+/, /./] },
    { name: 'negated classes', rules: [/"[^"]*"/, /[^ ]+/, / +/] },
    { name: 'unicode literals', rules: [/é+/, /[à-ÿ]+/, /[a-z]+/] },
    { name: 'case insensitive', rules: [/let/i, /[a-z]+/i, /\s+/], ignoreCase: true },
    { name: 'ignore case option', rules: ['LET', /[a-z]+/, /\s+/], ignoreCase: true },
    { name: 'optional leading atom', rules: [/[-+]?[0-9]+/, /[a-z]+/, /\s+/] },
  ];

  var sources = [
    '',
    'abc 123 x_1',
    'start middle end',
    '3.14 42 .',
    '>= > index in',
    'aaa bb ccc xyxy',
    '"quoted text" bare',
    'éàé abc',
    'LET let Let lEt',
    '-12 +34 56 abc',
    'unmatched ￿ chars',
    'aéb1 \t\n mixed-42',
  ];

  grammars.forEach(function (grammar) {
    sources.forEach(function (source) {
      it('matches the exhaustive scan for ' + grammar.name + ' on ' + JSON.stringify(source), function () {
        assert.deepStrictEqual(lexWith(grammar, source, false), lexWith(grammar, source, true));
      });
    });
  });

  it('reuses a cached dispatch per state', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/);
    var first = lexer.getDispatch(Lexer.STATE_INITIAL);
    assert.strictEqual(lexer.getDispatch(Lexer.STATE_INITIAL), first);
  });

  it('rebuilds the dispatch after a rule is added', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/);
    var before = lexer.getDispatch(Lexer.STATE_INITIAL);
    lexer.addRule(/[0-9]+/);
    assert.notStrictEqual(lexer.getDispatch(Lexer.STATE_INITIAL), before);
  });

  it('only offers rules that can start at the current character', function () {
    var lexer = new Lexer();
    lexer.addRule(/[0-9]+/);
    lexer.addRule(/[a-z]+/);
    lexer.addRule(/./);
    var dispatch = lexer.getDispatch(Lexer.STATE_INITIAL);
    assert.deepStrictEqual(dispatch.byCharCode['5'.charCodeAt(0)], [0, 2]);
    assert.deepStrictEqual(dispatch.byCharCode['x'.charCodeAt(0)], [1, 2]);
    assert.deepStrictEqual(dispatch.byCharCode['!'.charCodeAt(0)], [2]);
  });
});
