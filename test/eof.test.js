var nodeTest = require('node:test');
var assert = require('node:assert');

var describe = nodeTest.describe;
var it = nodeTest.it;

var Lexer = require('../src/Lexer.js');

function wordLexer() {
  var lexer = new Lexer();
  lexer.addRule(/[a-z]+/, function (current) { return current.text; });
  lexer.addRule(/\s+/);
  return lexer;
}

describe('<<EOF>> rules', function () {
  it('runs the action when the input is exhausted', function () {
    var lexer = wordLexer();
    var fired = 0;
    lexer.addRule(Lexer.RULE_EOF, function () { fired++; });

    lexer.setSource('one two');

    assert.deepStrictEqual(lexer.lexAll(), ['one', 'two']);
    assert.strictEqual(fired, 1);
  });

  it('runs the action for an empty source', function () {
    var lexer = wordLexer();
    var fired = 0;
    lexer.addRule(Lexer.RULE_EOF, function () { fired++; });

    lexer.setSource('');

    assert.deepStrictEqual(lexer.lexAll(), []);
    assert.strictEqual(fired, 1);
  });

  it('does not run the action while input remains', function () {
    var lexer = wordLexer();
    var fired = 0;
    lexer.addRule(Lexer.RULE_EOF, function () { fired++; });

    lexer.setSource('one');
    lexer.lex();

    assert.strictEqual(fired, 0);
  });

  it('terminates when the action does nothing', function () {
    var lexer = wordLexer();
    lexer.addRule(Lexer.RULE_EOF, function () { });

    lexer.setSource('one');

    assert.strictEqual(lexer.lex(), 'one');
    assert.strictEqual(lexer.lex(), Lexer.EOF);
  });

  it('terminates when no EOF rule is registered', function () {
    var lexer = wordLexer();

    lexer.setSource('one');

    assert.deepStrictEqual(lexer.lexAll(), ['one']);
  });

  it('continues scanning when the action refills with restart()', function () {
    var lexer = wordLexer();
    var refilled = false;
    lexer.addRule(Lexer.RULE_EOF, function (current) {
      if (refilled) {
        return;
      }
      refilled = true;
      current.restart('three four');
    });

    lexer.setSource('one two');

    assert.deepStrictEqual(lexer.lexAll(), ['one', 'two', 'three', 'four']);
  });

  it('continues scanning when the action refills with unput()', function () {
    var lexer = wordLexer();
    var refilled = false;
    lexer.addRule(Lexer.RULE_EOF, function (current) {
      if (refilled) {
        return;
      }
      refilled = true;
      current.unput(' three');
    });

    lexer.setSource('one two');

    assert.deepStrictEqual(lexer.lexAll(), ['one', 'two', 'three']);
  });

  it('returns a token from the action once the buffer is refilled', function () {
    var lexer = wordLexer();
    var refilled = false;
    lexer.addRule(Lexer.RULE_EOF, function (current) {
      if (refilled) {
        return;
      }
      refilled = true;
      current.restart('two');
      return 'REFILLED';
    });

    lexer.setSource('one');

    assert.deepStrictEqual(lexer.lexAll(), ['one', 'REFILLED', 'two']);
  });

  it('discards a token from the action when the buffer is not refilled', function () {
    var lexer = wordLexer();
    lexer.addRule(Lexer.RULE_EOF, function () { return 'IGNORED'; });

    lexer.setSource('one');

    assert.deepStrictEqual(lexer.lexAll(), ['one']);
  });

  it('falls through to the next EOF rule after reject()', function () {
    var lexer = wordLexer();
    var fired = [];
    lexer.addRule(Lexer.RULE_EOF, function (current) {
      fired.push('first');
      current.reject();
    });
    lexer.addRule(Lexer.RULE_EOF, function () { fired.push('second'); });

    lexer.setSource('one');
    lexer.lexAll();

    assert.deepStrictEqual(fired, ['first', 'second']);
  });

  it('reports an unterminated construct from an exclusive state', function () {
    var lexer = new Lexer();
    var errors = [];
    lexer.addState('quote', true);
    lexer.addRule(/"/, function (current) { current.begin('quote'); });
    lexer.addStateRule('quote', /[^"]+/, function (current) { return current.text; });
    lexer.addStateRule('quote', /"/, function (current) { current.begin(); });
    lexer.addStateRule('quote', Lexer.RULE_EOF, function () { errors.push('unterminated quote'); });

    lexer.setSource('"still open');

    assert.deepStrictEqual(lexer.lexAll(), ['still open']);
    assert.deepStrictEqual(errors, ['unterminated quote']);
  });

  it('leaves a closed construct alone', function () {
    var lexer = new Lexer();
    var errors = [];
    lexer.addState('quote', true);
    lexer.addRule(/"/, function (current) { current.begin('quote'); });
    lexer.addStateRule('quote', /[^"]+/, function (current) { return current.text; });
    lexer.addStateRule('quote', /"/, function (current) { current.begin(); });
    lexer.addStateRule('quote', Lexer.RULE_EOF, function () { errors.push('unterminated quote'); });

    lexer.setSource('"closed"');

    assert.deepStrictEqual(lexer.lexAll(), ['closed']);
    assert.deepStrictEqual(errors, []);
  });

  ['specific first', 'unqualified first'].forEach(function (order) {
    it('prefers a state-specific EOF rule over an unqualified one, declared ' + order, function () {
      var lexer = new Lexer();
      var fired = [];
      lexer.addState('quote');
      var addSpecific = function () {
        lexer.addStateRule('quote', Lexer.RULE_EOF, function () { fired.push('specific'); });
      };
      var addUnqualified = function () {
        lexer.addRule(Lexer.RULE_EOF, function () { fired.push('unqualified'); });
      };

      if (order === 'specific first') {
        addSpecific();
        addUnqualified();
      } else {
        addUnqualified();
        addSpecific();
      }

      lexer.setSource('');
      lexer.begin('quote');
      lexer.lexAll();

      assert.deepStrictEqual(fired, ['specific']);
    });
  });

  it('applies an unqualified EOF rule to states without one of their own', function () {
    var lexer = new Lexer();
    var fired = [];
    lexer.addState('other');
    lexer.addRule(Lexer.RULE_EOF, function () { fired.push('unqualified'); });

    lexer.setSource('');
    lexer.begin('other');
    lexer.lexAll();

    assert.deepStrictEqual(fired, ['unqualified']);
  });

  it('does not reach an exclusive state from an unqualified EOF rule', function () {
    var lexer = new Lexer();
    var fired = [];
    lexer.addState('exclusive', true);
    lexer.addRule(Lexer.RULE_EOF, function () { fired.push('unqualified'); });

    lexer.setSource('');
    lexer.begin('exclusive');
    lexer.lexAll();

    assert.deepStrictEqual(fired, []);
  });

  it('registers an EOF rule in every state via STATE_ANY', function () {
    var lexer = new Lexer();
    var fired = [];
    lexer.addState('exclusive', true);
    lexer.addStateRule(Lexer.STATE_ANY, Lexer.RULE_EOF, function (current) {
      fired.push(current.state);
    });

    lexer.setSource('');
    lexer.begin('exclusive');
    lexer.lexAll();

    assert.deepStrictEqual(fired, ['exclusive']);
  });

  it('keeps ordinary rules working alongside an EOF rule', function () {
    var lexer = new Lexer();
    lexer.addRule(/[0-9]+/, function (current) { return 'N' + current.text; });
    lexer.addRule(/[a-z]+/, function (current) { return 'W' + current.text; });
    lexer.addRule(/\s+/);
    lexer.addRule(Lexer.RULE_EOF, function () { });

    lexer.setSource('ab 12 cd');

    assert.deepStrictEqual(lexer.lexAll(), ['Wab', 'N12', 'Wcd']);
  });

  it('exposes an empty text to the EOF action', function () {
    var lexer = wordLexer();
    var textAtEOF = null;
    lexer.addRule(Lexer.RULE_EOF, function (current) { textAtEOF = current.text; });

    lexer.setSource('one');
    lexer.lexAll();

    assert.strictEqual(textAtEOF, '');
  });
});
