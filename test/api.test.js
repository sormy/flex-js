var nodeTest = require('node:test');
var assert = require('node:assert');

var assertThrows = require('./assertThrows.js');

var describe = nodeTest.describe;
var it = nodeTest.it;

var Lexer = require('../src/Lexer.js');

function collectingLexer() {
  var lexer = new Lexer();
  lexer.echoed = [];
  lexer.setOutput(function (text) { lexer.echoed.push(text); });
  return lexer;
}

describe('states', function () {
  it('starts in the initial state', function () {
    assert.strictEqual(new Lexer().state, Lexer.STATE_INITIAL);
  });

  ['quote', '_x', 'A9', 'a-b', 'a_b'].forEach(function (name) {
    it('registers the state name ' + JSON.stringify(name), function () {
      var lexer = new Lexer();

      lexer.addState(name);
      lexer.begin(name);

      assert.strictEqual(lexer.state, name);
    });
  });

  [undefined, null, 42, '', '9foo', 'a b', 'a.b', '*',
    'toString', 'constructor', 'hasOwnProperty', '__proto__'].forEach(function (name) {
    it('rejects the state name ' + JSON.stringify(name), function () {
      var lexer = new Lexer();

      assertThrows(function () { lexer.addState(name); }, 'Invalid state name');
    });
  });

  ['toString', 'constructor', 'hasOwnProperty'].forEach(function (name) {
    it('does not accept ' + JSON.stringify(name) + ' as registered without addState()', function () {
      var lexer = new Lexer();

      assertThrows(function () { lexer.begin(name); }, 'is not registered');
      assertThrows(function () { lexer.pushState(name); }, 'is not registered');
      assertThrows(function () { lexer.addStateRule(name, /a/); }, 'Unable to register rule within unregistered state(s)');
    });
  });

  it('keeps the exclusive flag', function () {
    var lexer = new Lexer();

    lexer.addState('exclusive', true);

    assert.strictEqual(lexer.states.exclusive.exclusive, true);
  });

  it('switches state with begin()', function () {
    var lexer = new Lexer();
    lexer.addState('other');

    lexer.begin('other');

    assert.strictEqual(lexer.state, 'other');
  });

  it('returns to the initial state when begin() is called without a state', function () {
    var lexer = new Lexer();
    lexer.addState('other');
    lexer.begin('other');

    lexer.begin();

    assert.strictEqual(lexer.state, Lexer.STATE_INITIAL);
  });

  it('switches state with switchState()', function () {
    var lexer = new Lexer();
    lexer.addState('other');

    lexer.switchState('other');

    assert.strictEqual(lexer.state, 'other');
  });

  it('rejects an unregistered state', function () {
    var lexer = new Lexer();

    assertThrows(function () { lexer.begin('missing'); }, 'State "missing" is not registered');
  });

  it('offers inclusive states to unqualified rules', function () {
    var lexer = new Lexer();
    lexer.addState('inclusive');
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('word');
    lexer.begin('inclusive');

    assert.deepStrictEqual(lexer.lexAll(), ['word']);
  });

  it('withholds unqualified rules from exclusive states', function () {
    var lexer = collectingLexer();
    lexer.addState('exclusive', true);
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('word');
    lexer.begin('exclusive');

    assert.deepStrictEqual(lexer.lexAll(), []);
    assert.strictEqual(lexer.echoed.join(''), 'word');
  });

  it('reaches every state through STATE_ANY', function () {
    var lexer = new Lexer();
    lexer.addState('exclusive', true);
    lexer.addStateRule(Lexer.STATE_ANY, /[a-z]+/, function (current) { return current.text; });

    lexer.setSource('word');
    lexer.begin('exclusive');

    assert.deepStrictEqual(lexer.lexAll(), ['word']);
  });

  it('ignores an empty name among the target states', function () {
    var lexer = new Lexer();
    lexer.addState('other', true);
    lexer.addStateRule(['other', ''], /[a-z]+/, function (current) { return current.text; });

    lexer.setSource('word');
    lexer.begin('other');

    assert.deepStrictEqual(lexer.lexAll(), ['word']);
  });

  it('files a rule once for a state named twice', function () {
    var lexer = new Lexer();
    lexer.addState('other', true);

    lexer.addStateRule(['other', 'other'], /[a-z]+/, function (current) { return current.text; });

    assert.strictEqual(lexer.rules.other.length, 1);
  });

  it('rejects an unqualified rule when every state is exclusive', function () {
    var lexer = new Lexer();
    lexer.addState(Lexer.STATE_INITIAL, true);

    assertThrows(function () { lexer.addRule(/[a-z]+/); }, 'Unable to add rule to empty list of states');
  });

  it('adds a rule to several named states at once', function () {
    var lexer = new Lexer();
    lexer.addState('first', true);
    lexer.addState('second', true);
    lexer.addStateRule(['first', 'second'], /[a-z]+/, function (current) { return current.text; });

    ['first', 'second'].forEach(function (state) {
      lexer.reset();
      lexer.setSource('word');
      lexer.begin(state);
      assert.deepStrictEqual(lexer.lexAll(), ['word'], state);
    });
  });
});

describe('state stack', function () {
  it('has no top state initially', function () {
    assert.strictEqual(new Lexer().topState(), undefined);
  });

  it('remembers the previous state on pushState()', function () {
    var lexer = new Lexer();
    lexer.addState('other');

    lexer.pushState('other');

    assert.strictEqual(lexer.state, 'other');
    assert.strictEqual(lexer.topState(), Lexer.STATE_INITIAL);
  });

  it('restores the previous state on popState()', function () {
    var lexer = new Lexer();
    lexer.addState('other');
    lexer.pushState('other');

    lexer.popState();

    assert.strictEqual(lexer.state, Lexer.STATE_INITIAL);
    assert.strictEqual(lexer.topState(), undefined);
  });

  it('nests pushes and pops', function () {
    var lexer = new Lexer();
    lexer.addState('first');
    lexer.addState('second');

    lexer.pushState('first');
    lexer.pushState('second');

    assert.strictEqual(lexer.state, 'second');
    assert.strictEqual(lexer.topState(), 'first');

    lexer.popState();
    assert.strictEqual(lexer.state, 'first');

    lexer.popState();
    assert.strictEqual(lexer.state, Lexer.STATE_INITIAL);
  });

  it('rejects pushing an unregistered state', function () {
    var lexer = new Lexer();

    assertThrows(function () { lexer.pushState('missing'); }, 'State "missing" is not registered');
  });

  it('rejects popping an empty stack', function () {
    var lexer = new Lexer();

    assertThrows(function () { lexer.popState(); }, 'Unable to pop state');
  });
});

describe('rule registration', function () {
  var invalid = [
    {
      name: 'an empty list of states',
      call: function (lexer) { lexer.addStateRule([], /a/); },
      message: 'Unable to add rule to empty list of states',
    },
    {
      name: 'an unregistered state',
      call: function (lexer) { lexer.addStateRule('missing', /a/); },
      message: 'Unable to register rule within unregistered state(s): missing',
    },
    {
      name: 'an empty string expression',
      call: function (lexer) { lexer.addRule(''); },
      message: 'Empty expression for rule used in states "INITIAL"',
    },
    {
      name: 'an empty regular expression',
      call: function (lexer) { lexer.addRule(new RegExp('')); },
      message: 'Empty expression for rule used in states "INITIAL"',
    },
    {
      name: 'an unsupported flag',
      call: function (lexer) { lexer.addRule(/a/g); },
      message: 'Expression flags besides "i" and "u" are not supported',
    },
    {
      name: 'a non-expression',
      call: function (lexer) { lexer.addRule(42); },
      message: 'Invalid rule expression "42"',
    },
    {
      name: 'a non-function action',
      call: function (lexer) { lexer.addRule(/a/, 'not a function'); },
      message: 'Invalid rule action: should be function or empty',
    },
  ];

  invalid.forEach(function (testCase) {
    it('rejects ' + testCase.name, function () {
      var lexer = new Lexer();
      assertThrows(function () { testCase.call(lexer); }, testCase.message);
    });
  });

  it('accepts the supported i and u flags', function () {
    var lexer = new Lexer();

    assert.doesNotThrow(function () { lexer.addRule(/a/iu); });
  });

  it('adds several unqualified rules at once', function () {
    var lexer = new Lexer();
    lexer.addRules([
      { expression: /[0-9]+/, action: function (current) { return 'N' + current.text; } },
      { expression: /[a-z]+/, action: function (current) { return 'W' + current.text; } },
      { expression: /\s+/ },
    ]);

    lexer.setSource('ab 12');

    assert.deepStrictEqual(lexer.lexAll(), ['Wab', 'N12']);
  });

  it('adds several state rules at once', function () {
    var lexer = new Lexer();
    lexer.addState('other', true);
    lexer.addStateRules('other', [
      { expression: /[a-z]+/, action: function (current) { return current.text; } },
      { expression: /\s+/ },
    ]);

    lexer.setSource('ab cd');
    lexer.begin('other');

    assert.deepStrictEqual(lexer.lexAll(), ['ab', 'cd']);
  });

  // a polyfill that adds enumerable members to Array.prototype used to be walked
  // as though it were part of the rules array
  it('adds rules in bulk with a polluted Array prototype', function () {
    Object.defineProperty(Array.prototype, 'polyfilled', {
      value: function () { }, enumerable: true, configurable: true
    });

    try {
      var lexer = new Lexer();
      lexer.addRules([
        { expression: /[0-9]+/, action: function (current) { return current.text; } },
        { expression: /\s+/ }
      ]);

      lexer.setSource('12 34');

      assert.deepStrictEqual(lexer.lexAll(), ['12', '34']);
    } finally {
      delete Array.prototype.polyfilled;
    }
  });

  it('discards a match when no action is given', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/);

    lexer.setSource('word');

    assert.deepStrictEqual(lexer.lexAll(), []);
  });
});

describe('actions', function () {
  it('less() shortens the match and puts the rest back', function () {
    var lexer = new Lexer();
    lexer.addRule(/abcd/, function (current) { current.less(2); return current.text; });
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('abcd');

    assert.deepStrictEqual(lexer.lexAll(), ['ab', 'cd']);
  });

  it('less() refuses a negative length, which would not advance', function () {
    var lexer = new Lexer();
    lexer.addRule(/ab/, function (current) { current.less(-1); });

    lexer.setSource('ab');

    assertThrows(function () { lexer.lexAll(); }, 'Invalid length');
  });

  it('less() ignores a length beyond the match', function () {
    var lexer = new Lexer();
    lexer.addRule(/ab/, function (current) { current.less(10); return current.text; });

    lexer.setSource('ab');

    assert.deepStrictEqual(lexer.lexAll(), ['ab']);
  });

  it('input() consumes one character by default', function () {
    var lexer = new Lexer();
    var taken = [];
    lexer.addRule(/a/, function (current) { taken.push(current.input()); return current.text; });

    lexer.setSource('axb');
    lexer.lex();

    assert.deepStrictEqual(taken, ['x']);
  });

  it('input() consumes at most the requested number of characters', function () {
    var lexer = new Lexer();
    var taken = [];
    lexer.addRule(/a/, function (current) { taken.push(current.input(10)); return current.text; });

    lexer.setSource('abc');
    lexer.lex();

    assert.deepStrictEqual(taken, ['bc']);
  });

  it('unput() inserts text at the current position', function () {
    var lexer = new Lexer();
    var restored = false;
    lexer.addRule(/a/, function (current) {
      if (!restored) {
        restored = true;
        current.unput('bb');
      }
      return current.text;
    });
    lexer.addRule(/b+/, function (current) { return current.text; });

    lexer.setSource('a');

    assert.deepStrictEqual(lexer.lexAll(), ['a', 'bb']);
  });

  it('terminate() ends the scan early', function () {
    var lexer = new Lexer();
    lexer.addRule(/stop/, function (current) { return current.terminate(); });
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });
    lexer.addRule(/\s+/);

    lexer.setSource('go stop never');

    assert.deepStrictEqual(lexer.lexAll(), ['go']);
  });

  it('restart() rescans the current source from the beginning', function () {
    var lexer = new Lexer();
    var passes = 0;
    lexer.addRule(/a/, function (current) {
      passes++;
      if (passes === 1) {
        current.restart();
      }
      return 'a' + passes;
    });

    lexer.setSource('a');

    assert.deepStrictEqual(lexer.lexAll(), ['a1', 'a2']);
  });

  it('echoes input that matches no rule', function () {
    var lexer = collectingLexer();
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('ab!!cd');

    assert.deepStrictEqual(lexer.lexAll(), ['ab', 'cd']);
    assert.strictEqual(lexer.echoed.join(''), '!!');
  });

  it('writes to a sink given as an object', function () {
    var written = '';
    var lexer = new Lexer();
    lexer.setOutput({ write: function (text) { written += text; } });
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('a!b?');
    lexer.lexAll();

    assert.strictEqual(written, '!?');
  });

  it('flushes a sink that offers it when the scan ends', function () {
    var written = '';
    var flushed = 0;
    var lexer = new Lexer();
    lexer.setOutput({
      write: function (text) { written += text; },
      flush: function () { flushed++; }
    });
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('a!');
    lexer.lexAll();

    assert.strictEqual(written, '!');
    assert.strictEqual(flushed, 1);
  });

  it('refuses a sink it cannot write to', function () {
    var lexer = new Lexer();

    assertThrows(function () { lexer.setOutput(42); }, 'Invalid output');
  });

  it('writes to stdout from the default echo action', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });
    lexer.setSource('a!');

    var written = '';
    var original = process.stdout.write;
    process.stdout.write = function (chunk) { written += chunk; return true; };
    try {
      lexer.lexAll();
    } finally {
      process.stdout.write = original;
    }

    assert.strictEqual(written, '!');
  });
});

describe('lifecycle', function () {
  it('lex() returns EOF for an empty source', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('');

    assert.strictEqual(lexer.lex(), Lexer.EOF);
  });

  it('lexAll() collects every token', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });
    lexer.addRule(/\s+/);

    lexer.setSource('a b c');

    assert.deepStrictEqual(lexer.lexAll(), ['a', 'b', 'c']);
  });

  it('lex() skips discarded matches and returns the next token', function () {
    var lexer = new Lexer();
    var scans = 0;
    lexer.addRule(/\s+/, function () { scans++; });
    lexer.addRule(/[a-z]+/, function (current) { scans++; return current.text; });

    lexer.setSource('   word');

    assert.strictEqual(lexer.lex(), 'word');
    assert.strictEqual(scans, 2);
  });

  var falsyTokens = [
    { label: 'null', token: null },
    { label: 'false', token: false },
    { label: 'an empty string', token: '' },
    { label: 'NaN', token: NaN },
  ];

  falsyTokens.forEach(function (testCase) {
    it('lex() returns ' + testCase.label + ' rather than scanning on', function () {
      var lexer = new Lexer();
      lexer.addRule(/[a-z]+/, function () { return testCase.token; });
      lexer.addRule(/[0-9]+/, function () { return 'NUMBER'; });

      lexer.setSource('word1');

      assert.deepStrictEqual(lexer.lex(), testCase.token);
    });
  });

  it('lex() treats a token of 0 as EOF, which is reserved', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/, function () { return 0; });

    lexer.setSource('word');

    assert.strictEqual(lexer.lex(), Lexer.EOF);
  });

  it('reset() clears scanning state but keeps the rules', function () {
    var lexer = new Lexer();
    lexer.addState('other');
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });
    lexer.setSource('word');
    lexer.begin('other');
    lexer.lex();

    lexer.reset();

    assert.strictEqual(lexer.state, Lexer.STATE_INITIAL);
    assert.strictEqual(lexer.index, 0);
    assert.strictEqual(lexer.source, '');

    lexer.setSource('again');
    assert.deepStrictEqual(lexer.lexAll(), ['again']);
  });

  it('clear() drops the rules as well', function () {
    var lexer = collectingLexer();
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.clear();
    lexer.setOutput(function (text) { lexer.echoed.push(text); });
    lexer.setSource('word');

    assert.deepStrictEqual(lexer.lexAll(), []);
    assert.strictEqual(lexer.echoed.join(''), 'word');
  });

  it('clear() drops added states', function () {
    var lexer = new Lexer();
    lexer.addState('other');

    lexer.clear();

    assertThrows(function () { lexer.begin('other'); }, 'State "other" is not registered');
  });

  it('refuses a source that is not a string', function () {
    var lexer = new Lexer();

    assertThrows(function () { lexer.setSource(42); }, 'Invalid source');
    assertThrows(function () { lexer.setSource(); }, 'Invalid source');
  });

  it('refuses a restart source that is not a string', function () {
    var lexer = new Lexer();

    assertThrows(function () { lexer.restart(42); }, 'Invalid source');
  });

  it('setSource() rewinds to the start of the new source', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });
    lexer.setSource('first');
    lexer.lex();

    lexer.setSource('second');

    assert.strictEqual(lexer.index, 0);
    assert.deepStrictEqual(lexer.lexAll(), ['second']);
  });
});

describe('debug output', function () {
  function capture(lexer) {
    var lines = [];
    var original = console.log;
    console.log = function (line) { lines.push(line); };
    try {
      lexer.lexAll();
    } finally {
      console.log = original;
    }
    return lines;
  }

  function debugLexer(enabled) {
    var lexer = new Lexer();
    lexer.setDebugEnabled(enabled);
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });
    lexer.setSource('word');
    return lexer;
  }

  it('reports accepted rules when enabled', function () {
    var lines = capture(debugLexer(true));

    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0].indexOf('[INITIAL]') !== -1);
    assert.ok(lines[0].indexOf('word') !== -1);
  });

  it('stays quiet when disabled', function () {
    assert.deepStrictEqual(capture(debugLexer(false)), []);
  });
});
