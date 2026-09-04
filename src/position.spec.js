var expect = require('chai').expect;

var Lexer = require('./Lexer.js');

function positionsOf(source, rules) {
  var lexer = new Lexer();
  var seen = [];
  lexer.echo = function () { };
  (rules || [/[a-z]+/]).forEach(function (expression) {
    lexer.addRule(expression, function (current) {
      seen.push(current.text + '@' + current.line + ':' + current.column);
    });
  });
  lexer.addRule(/\s+/);
  lexer.setSource(source);
  lexer.lexAll();
  return seen;
}

describe('line and column', function () {
  it('starts at the first line and column', function () {
    var lexer = new Lexer();

    expect(lexer.line).to.equal(1);
    expect(lexer.column).to.equal(1);
  });

  it('counts columns along a line', function () {
    expect(positionsOf('ab cd ef')).to.deep.equal(['ab@1:1', 'cd@1:4', 'ef@1:7']);
  });

  it('counts lines across newlines', function () {
    expect(positionsOf('ab\ncd\nef')).to.deep.equal(['ab@1:1', 'cd@2:1', 'ef@3:1']);
  });

  it('counts an empty line', function () {
    expect(positionsOf('ab\n\n  cd')).to.deep.equal(['ab@1:1', 'cd@3:3']);
  });

  it('reports where a token starts, not where it ends', function () {
    var lexer = new Lexer();
    var seen = [];
    lexer.addRule(/\/\*[\s\S]*?\*\//, function (current) {
      seen.push('comment@' + current.line + ':' + current.column);
    });
    lexer.addRule(/[a-z]+/, function (current) {
      seen.push(current.text + '@' + current.line + ':' + current.column);
    });
    lexer.addRule(/\s+/);

    lexer.setSource('a\n/* two\nlines */\nb');
    lexer.lexAll();

    expect(seen).to.deep.equal(['a@1:1', 'comment@2:1', 'b@4:1']);
  });

  it('keeps the earlier start across more()', function () {
    var lexer = new Lexer();
    var seen;
    lexer.addRule(/\n/);
    lexer.addRule(/a/, function (current) { current.more(); });
    lexer.addRule(/b/, function (current) {
      seen = current.text + '@' + current.line + ':' + current.column;
    });

    lexer.setSource('\n\nab');
    lexer.lexAll();

    expect(seen).to.equal('ab@3:1');
  });

  it('counts a tab as one column', function () {
    expect(positionsOf('\tab')).to.deep.equal(['ab@1:2']);
  });

  it('counts the carriage return of a CRLF pair as a column', function () {
    expect(positionsOf('ab\r\ncd')).to.deep.equal(['ab@1:1', 'cd@2:1']);
  });

  it('follows text put back with unput()', function () {
    var lexer = new Lexer();
    var seen = [];
    var restored = false;
    lexer.addRule(/[a-z]+/, function (current) {
      seen.push(current.text + '@' + current.line + ':' + current.column);
      if (!restored) {
        restored = true;
        current.unput('\ncd');
      }
    });
    lexer.addRule(/\s+/);

    lexer.setSource('ab');
    lexer.lexAll();

    expect(seen).to.deep.equal(['ab@1:1', 'cd@2:1']);
  });

  it('starts over for a new source', function () {
    var lexer = new Lexer();
    var seen = [];
    lexer.addRule(/[a-z]+/, function (current) {
      seen.push(current.text + '@' + current.line + ':' + current.column);
    });
    lexer.addRule(/\s+/);

    lexer.setSource('\n\nab');
    lexer.lexAll();
    lexer.setSource('cd');
    lexer.lexAll();

    expect(seen).to.deep.equal(['ab@3:1', 'cd@1:1']);
  });

  it('starts over for a source given to restart()', function () {
    var lexer = new Lexer();
    var seen = [];
    var refilled = false;
    lexer.addRule(/[a-z]+/, function (current) {
      seen.push(current.text + '@' + current.line + ':' + current.column);
    });
    lexer.addRule(/\s+/);
    lexer.addRule(Lexer.RULE_EOF, function (current) {
      if (!refilled) {
        refilled = true;
        current.restart('cd');
      }
    });

    lexer.setSource('\nab');
    lexer.lexAll();

    expect(seen).to.deep.equal(['ab@2:1', 'cd@1:1']);
  });
});

describe('error()', function () {
  it('names the position the token starts at', function () {
    var lexer = new Lexer();
    lexer.addRule(/\n/);
    lexer.addRule(/[a-z]+/, function (current) { current.error('unexpected word'); });

    lexer.setSource('\n  bad');

    expect(function () { lexer.lexAll(); })
      .to.throw('unexpected word at line 2, column 3');
  });

  it('carries the position and the token on the error', function () {
    var lexer = new Lexer();
    lexer.addRule(/[a-z]+/, function (current) { current.error('bad'); });
    lexer.setSource('word');

    try {
      lexer.lexAll();
      throw new Error('should have thrown');
    } catch (error) {
      expect(error.line).to.equal(1);
      expect(error.column).to.equal(1);
      expect(error.text).to.equal('word');
    }
  });
});

describe('the default rule', function () {
  it('echoes unmatched input while it is on', function () {
    var lexer = new Lexer();
    var echoed = '';
    lexer.echo = function () { echoed += this.text; };
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('ok?');

    expect(lexer.lexAll()).to.deep.equal(['ok']);
    expect(echoed).to.equal('?');
  });

  it('jams on unmatched input once it is off', function () {
    var lexer = new Lexer();
    lexer.setDefaultRuleEnabled(false);
    lexer.addRule(/\n/);
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });

    lexer.setSource('ok\nok?');

    expect(function () { lexer.lexAll(); })
      .to.throw('scanner jammed at line 2, column 3');
  });

  it('reports the character it jammed on', function () {
    var lexer = new Lexer();
    lexer.setDefaultRuleEnabled(false);
    lexer.addRule(/[a-z]+/, function (current) { return current.text; });
    lexer.setSource('ok?');

    try {
      lexer.lexAll();
      throw new Error('should have thrown');
    } catch (error) {
      expect(error.text).to.equal('?');
    }
  });

  it('is restored by clear()', function () {
    var lexer = new Lexer();
    lexer.setDefaultRuleEnabled(false);

    lexer.clear();

    expect(lexer.defaultRuleEnabled).to.equal(true);
  });
});
