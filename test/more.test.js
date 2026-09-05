var nodeTest = require('node:test');
var assert = require('node:assert');

var describe = nodeTest.describe;
var it = nodeTest.it;

var Lexer = require('../src/Lexer.js');

function collectingLexer() {
  var lexer = new Lexer();
  lexer.echoed = [];
  lexer.setOutput(function (text) { lexer.echoed.push(text); });
  return lexer;
}

describe('more()', function () {
  it('appends the next match to the current text', function () {
    var lexer = new Lexer();
    lexer.addRule(/a/, function (current) { current.more(); });
    lexer.addRule(/b/, function (current) { return current.text; });

    lexer.setSource('ab');

    assert.deepStrictEqual(lexer.lexAll(), ['ab']);
  });

  it('keeps scanning the text that follows', function () {
    var lexer = new Lexer();
    lexer.addRule(/a/, function (current) { current.more(); });
    lexer.addRule(/b/, function (current) { return current.text; });
    lexer.addRule(/z/, function (current) { return 'Z' + current.text; });

    lexer.setSource('abz');

    assert.deepStrictEqual(lexer.lexAll(), ['ab', 'Zz']);
  });

  it('advances the index by the new match only', function () {
    var lexer = new Lexer();
    var indexes = [];
    lexer.addRule(/a/, function (current) { indexes.push(current.index); current.more(); });
    lexer.addRule(/bc/, function (current) { indexes.push(current.index); return current.text; });

    lexer.setSource('abc');
    lexer.lexAll();

    assert.deepStrictEqual(indexes, [1, 3]);
  });

  it('accumulates across a chain of more() calls', function () {
    var lexer = new Lexer();
    lexer.addRule(/a/, function (current) { current.more(); });
    lexer.addRule(/b/, function (current) { current.more(); });
    lexer.addRule(/c/, function (current) { return current.text; });
    lexer.addRule(/z/, function (current) { return 'Z' + current.text; });

    lexer.setSource('abcz');

    assert.deepStrictEqual(lexer.lexAll(), ['abc', 'Zz']);
  });

  it('shows the accumulated text to every action', function () {
    var lexer = new Lexer();
    var texts = [];
    lexer.addRule(/a/, function (current) { texts.push(current.text); current.more(); });
    lexer.addRule(/b/, function (current) { texts.push(current.text); current.more(); });
    lexer.addRule(/c/, function (current) { texts.push(current.text); return current.text; });

    lexer.setSource('abc');
    lexer.lexAll();

    assert.deepStrictEqual(texts, ['a', 'ab', 'abc']);
  });

  it('still works when the continued match ends the input', function () {
    var lexer = collectingLexer();
    lexer.addRule('mega-', function (current) { current.echo(); current.more(); });
    lexer.addRule('kludge', function (current) { current.echo(); });

    lexer.setSource('mega-kludge');
    lexer.lex();

    assert.strictEqual(lexer.echoed.join(''), 'mega-mega-kludge');
  });

  it('carries the accumulated text into an echoed character', function () {
    var lexer = collectingLexer();
    lexer.addRule(/a/, function (current) { current.more(); });

    lexer.setSource('a!');

    assert.deepStrictEqual(lexer.lexAll(), []);
    assert.deepStrictEqual(lexer.echoed, ['a!']);
  });

  it('leaves the index at the end of the input for an EOF rule', function () {
    var lexer = new Lexer();
    var indexAtEOF = null;
    lexer.addRule(/a/, function (current) { current.more(); });
    lexer.addRule(Lexer.RULE_EOF, function (current) { indexAtEOF = current.index; });

    lexer.setSource('a');
    lexer.lexAll();

    assert.strictEqual(indexAtEOF, 1);
  });

  it('is cleared by reset()', function () {
    var lexer = new Lexer();
    lexer.addRule(/a/, function (current) { current.more(); });
    lexer.addRule(/b/, function (current) { return current.text; });

    lexer.setSource('ab');
    lexer.lex();
    lexer.reset();

    lexer.setSource('b');
    assert.deepStrictEqual(lexer.lexAll(), ['b']);
  });
});

describe('more() combined with other actions', function () {
  it('less() trims the accumulated text and puts the rest back', function () {
    var lexer = new Lexer();
    lexer.addRule(/a/, function (current) { current.more(); });
    lexer.addRule(/bc/, function (current) { current.less(2); return 'T:' + current.text; });
    lexer.addRule(/./, function (current) { return 'O:' + current.text; });

    lexer.setSource('abcZ');

    assert.deepStrictEqual(lexer.lexAll(), ['T:ab', 'O:c', 'O:Z']);
  });

  it('reject() retries the same position with the accumulated text intact', function () {
    var lexer = new Lexer();
    var seen = [];
    lexer.addRule(/a/, function (current) { current.more(); });
    lexer.addRule(/bc/, function (current) { seen.push('bc:' + current.text); current.reject(); });
    lexer.addRule(/b/, function (current) { seen.push('b:' + current.text); return current.text; });

    lexer.setSource('abc');
    var tokens = lexer.lexAll();

    assert.deepStrictEqual(seen, ['bc:abc', 'b:ab']);
    assert.deepStrictEqual(tokens, ['ab']);
  });

  it('reject() terminates instead of rescanning forever', function () {
    var lexer = new Lexer();
    var actions = 0;
    lexer.addRule(/a/, function (current) { actions++; current.more(); });
    lexer.addRule(/bc/, function (current) { actions++; current.reject(); });
    lexer.addRule(/b/, function (current) { actions++; return current.text; });

    lexer.setSource('abc');
    lexer.lexAll();

    assert.strictEqual(actions, 3);
  });

  it('unput() feeds text back after an accumulated match', function () {
    var lexer = new Lexer();
    var restored = false;
    lexer.addRule(/a/, function (current) { current.more(); });
    lexer.addRule(/b/, function (current) {
      if (!restored) {
        restored = true;
        current.unput('b');
      }
      return current.text;
    });

    lexer.setSource('ab');

    assert.deepStrictEqual(lexer.lexAll(), ['ab', 'b']);
  });
});

describe('reject() without more()', function () {
  it('retries the same position with the next best rule', function () {
    var lexer = new Lexer();
    var seen = [];
    lexer.addRule(/abc/, function (current) { seen.push('abc:' + current.text); current.reject(); });
    lexer.addRule(/ab/, function (current) { seen.push('ab:' + current.text); return current.text; });
    lexer.addRule(/c/, function (current) { return current.text; });

    lexer.setSource('abc');
    var tokens = lexer.lexAll();

    assert.deepStrictEqual(seen, ['abc:abc', 'ab:ab']);
    assert.deepStrictEqual(tokens, ['ab', 'c']);
  });

  it('leaves the index where the match started', function () {
    var lexer = new Lexer();
    var indexes = [];
    lexer.addRule(/abc/, function (current) { current.reject(); });
    lexer.addRule(/a/, function (current) { indexes.push(current.index); return current.text; });

    lexer.setSource('abc');
    lexer.lexAll();

    assert.deepStrictEqual(indexes, [1]);
  });
});
