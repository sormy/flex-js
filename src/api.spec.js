var expect = require('chai').expect;

var Lexer = require('./Lexer.js');

function collectingLexer() {
  var lexer = new Lexer();
  lexer.echoed = [];
  lexer.echo = function () { this.echoed.push(this.text); };
  return lexer;
}

describe('states', function () {
  it('starts in the initial state', function () {
    expect(new Lexer().state).to.equal(Lexer.STATE_INITIAL);
  });

  it('switches state with begin()', function () {
    var lexer = new Lexer();
    lexer.addState('other');

    lexer.begin('other');

    expect(lexer.state).to.equal('other');
  });

  it('returns to the initial state when begin() is called without a state', function () {
    var lexer = new Lexer();
    lexer.addState('other');
    lexer.begin('other');

    lexer.begin();

    expect(lexer.state).to.equal(Lexer.STATE_INITIAL);
  });

  it('switches state with switchState()', function () {
    var lexer = new Lexer();
    lexer.addState('other');

    lexer.switchState('other');

    expect(lexer.state).to.equal('other');
  });

  it('rejects an unregistered state', function () {
    var lexer = new Lexer();

    expect(function () { lexer.begin('missing'); })
      .to.throw('State "missing" is not registered');
  });

  it('offers inclusive states to unqualified rules', function () {
    var lexer = new Lexer();
    lexer.addState('inclusive');
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('word');
    lexer.begin('inclusive');

    expect(lexer.lexAll()).to.deep.equal(['word']);
  });

  it('withholds unqualified rules from exclusive states', function () {
    var lexer = collectingLexer();
    lexer.addState('exclusive', true);
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('word');
    lexer.begin('exclusive');

    expect(lexer.lexAll()).to.deep.equal([]);
    expect(lexer.echoed.join('')).to.equal('word');
  });

  it('reaches every state through STATE_ANY', function () {
    var lexer = new Lexer();
    lexer.addState('exclusive', true);
    lexer.addStateRule(Lexer.STATE_ANY, /[a-z]+/, function (current) { return current.text; });

    lexer.setSource('word');
    lexer.begin('exclusive');

    expect(lexer.lexAll()).to.deep.equal(['word']);
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
      expect(lexer.lexAll(), state).to.deep.equal(['word']);
    });
  });
});

describe('state stack', function () {
  it('has no top state initially', function () {
    expect(new Lexer().topState()).to.equal(undefined);
  });

  it('remembers the previous state on pushState()', function () {
    var lexer = new Lexer();
    lexer.addState('other');

    lexer.pushState('other');

    expect(lexer.state).to.equal('other');
    expect(lexer.topState()).to.equal(Lexer.STATE_INITIAL);
  });

  it('restores the previous state on popState()', function () {
    var lexer = new Lexer();
    lexer.addState('other');
    lexer.pushState('other');

    lexer.popState();

    expect(lexer.state).to.equal(Lexer.STATE_INITIAL);
    expect(lexer.topState()).to.equal(undefined);
  });

  it('nests pushes and pops', function () {
    var lexer = new Lexer();
    lexer.addState('first');
    lexer.addState('second');

    lexer.pushState('first');
    lexer.pushState('second');

    expect(lexer.state).to.equal('second');
    expect(lexer.topState()).to.equal('first');

    lexer.popState();
    expect(lexer.state).to.equal('first');

    lexer.popState();
    expect(lexer.state).to.equal(Lexer.STATE_INITIAL);
  });

  it('rejects pushing an unregistered state', function () {
    var lexer = new Lexer();

    expect(function () { lexer.pushState('missing'); })
      .to.throw('State "missing" is not registered');
  });

  it('rejects popping an empty stack', function () {
    var lexer = new Lexer();

    expect(function () { lexer.popState(); }).to.throw('Unable to pop state');
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
      expect(function () { testCase.call(lexer); }).to.throw(testCase.message);
    });
  });

  it('accepts the supported i and u flags', function () {
    var lexer = new Lexer();

    expect(function () { lexer.addRule(/a/iu); }).to.not.throw();
  });

  it('adds several unqualified rules at once', function () {
    var lexer = new Lexer();
    lexer.addRules([
      { expression: /[0-9]+/, action: function (current) { return 'N' + current.text; } },
      { expression: /[a-z]+/, action: function (current) { return 'W' + current.text; } },
      { expression: /\s+/ },
    ]);

    lexer.setSource('ab 12');

    expect(lexer.lexAll()).to.deep.equal(['Wab', 'N12']);
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

    expect(lexer.lexAll()).to.deep.equal(['ab', 'cd']);
  });

  it('discards a match when no action is given', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/);

    lexer.setSource('word');

    expect(lexer.lexAll()).to.deep.equal([]);
  });
});

describe('actions', function () {
  it('less() shortens the match and puts the rest back', function () {
    var lexer = new Lexer();
    lexer.addRule(/abcd/, function (current) { current.less(2); return current.text; });
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('abcd');

    expect(lexer.lexAll()).to.deep.equal(['ab', 'cd']);
  });

  it('less() ignores a length beyond the match', function () {
    var lexer = new Lexer();
    lexer.addRule(/ab/, function (current) { current.less(10); return current.text; });

    lexer.setSource('ab');

    expect(lexer.lexAll()).to.deep.equal(['ab']);
  });

  it('input() consumes one character by default', function () {
    var lexer = new Lexer();
    var taken = [];
    lexer.addRule(/a/, function (current) { taken.push(current.input()); return current.text; });

    lexer.setSource('axb');
    lexer.lex();

    expect(taken).to.deep.equal(['x']);
  });

  it('input() consumes at most the requested number of characters', function () {
    var lexer = new Lexer();
    var taken = [];
    lexer.addRule(/a/, function (current) { taken.push(current.input(10)); return current.text; });

    lexer.setSource('abc');
    lexer.lex();

    expect(taken).to.deep.equal(['bc']);
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

    expect(lexer.lexAll()).to.deep.equal(['a', 'bb']);
  });

  it('terminate() ends the scan early', function () {
    var lexer = new Lexer();
    lexer.addRule(/stop/, function (current) { return current.terminate(); });
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });
    lexer.addRule(/\s+/);

    lexer.setSource('go stop never');

    expect(lexer.lexAll()).to.deep.equal(['go']);
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

    expect(lexer.lexAll()).to.deep.equal(['a1', 'a2']);
  });

  it('echoes input that matches no rule', function () {
    var lexer = collectingLexer();
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('ab!!cd');

    expect(lexer.lexAll()).to.deep.equal(['ab', 'cd']);
    expect(lexer.echoed.join('')).to.equal('!!');
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

    expect(written).to.equal('!');
  });
});

describe('lifecycle', function () {
  it('lex() returns EOF for an empty source', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('');

    expect(lexer.lex()).to.equal(Lexer.EOF);
  });

  it('lexAll() collects every token', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });
    lexer.addRule(/\s+/);

    lexer.setSource('a b c');

    expect(lexer.lexAll()).to.deep.equal(['a', 'b', 'c']);
  });

  it('lex() skips discarded matches and returns the next token', function () {
    var lexer = new Lexer();
    var scans = 0;
    lexer.addRule(/\s+/, function () { scans++; });
    lexer.addRule(/[a-z]+/, function (current) { scans++; return current.text; });

    lexer.setSource('   word');

    expect(lexer.lex()).to.equal('word');
    expect(scans).to.equal(2);
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

      expect(lexer.lex()).to.deep.equal(testCase.token);
    });
  });

  it('lex() treats a token of 0 as EOF, which is reserved', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/, function () { return 0; });

    lexer.setSource('word');

    expect(lexer.lex()).to.equal(Lexer.EOF);
  });

  it('reset() clears scanning state but keeps the rules', function () {
    var lexer = new Lexer();
    lexer.addState('other');
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });
    lexer.setSource('word');
    lexer.begin('other');
    lexer.lex();

    lexer.reset();

    expect(lexer.state).to.equal(Lexer.STATE_INITIAL);
    expect(lexer.index).to.equal(0);
    expect(lexer.source).to.equal('');

    lexer.setSource('again');
    expect(lexer.lexAll()).to.deep.equal(['again']);
  });

  it('clear() drops the rules as well', function () {
    var lexer = collectingLexer();
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.clear();
    lexer.setSource('word');

    expect(lexer.lexAll()).to.deep.equal([]);
    expect(lexer.echoed.join('')).to.equal('word');
  });

  it('clear() drops added states', function () {
    var lexer = new Lexer();
    lexer.addState('other');

    lexer.clear();

    expect(function () { lexer.begin('other'); })
      .to.throw('State "other" is not registered');
  });

  it('setSource() rewinds to the start of the new source', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });
    lexer.setSource('first');
    lexer.lex();

    lexer.setSource('second');

    expect(lexer.index).to.equal(0);
    expect(lexer.lexAll()).to.deep.equal(['second']);
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

    expect(lines).to.have.length(1);
    expect(lines[0]).to.contain('[INITIAL]');
    expect(lines[0]).to.contain('word');
  });

  it('stays quiet when disabled', function () {
    expect(capture(debugLexer(false))).to.deep.equal([]);
  });
});
