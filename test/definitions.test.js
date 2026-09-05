var nodeTest = require('node:test');
var assert = require('node:assert');

var assertThrows = require('./assertThrows.js');

var describe = nodeTest.describe;
var it = nodeTest.it;

var Lexer = require('../src/Lexer.js');

function sourceOf(lexer) {
  return lexer.rules[Lexer.STATE_INITIAL][0].expression.source;
}

describe('definition names', function () {
  ['a', 'A', '_', '_x', 'A9', 'a-b', 'a_b', 'abc123'].forEach(function (name) {
    it('accepts ' + JSON.stringify(name), function () {
      var lexer = new Lexer();

      lexer.addDefinition(name, /[0-9]/);

      assert.strictEqual(lexer.definitions[name], '[0-9]');
    });
  });

  [null, undefined, '', '123', '9foo', 'a.b', 'a b', 'a+b', 'a}b', 42].forEach(function (name) {
    it('rejects ' + JSON.stringify(name), function () {
      var lexer = new Lexer();

      assertThrows(function () { lexer.addDefinition(name, /[0-9]/); }, 'Invalid definition name');
    });
  });

  ['length', 'constructor', 'toString', '__proto__', 'hasOwnProperty'].forEach(function (name) {
    it('treats ' + JSON.stringify(name) + ' as an ordinary name', function () {
      var lexer = new Lexer();
      lexer.addDefinition(name, /[0-9]/);
      lexer.addRule(new RegExp('{' + name + '}'), function (current) { return current.text; });

      lexer.setSource('7');

      assert.deepStrictEqual(lexer.lexAll(), ['7']);
    });
  });
});

describe('definition references', function () {
  it('expands a reference in a rule', function () {
    var lexer = new Lexer();
    lexer.addDefinition('DIGIT', /[0-9]/);

    lexer.addRule(/{DIGIT}\.{DIGIT}/);

    assert.strictEqual(sourceOf(lexer), '(?:[0-9])\\.(?:[0-9])');
  });

  it('matches the name case sensitively', function () {
    var lexer = new Lexer();
    lexer.addDefinition('DIGIT', /[0-9]/);

    lexer.addRule(/{digit}/);

    assert.strictEqual(sourceOf(lexer), '{digit}');
  });

  it('leaves an unknown reference alone', function () {
    var lexer = new Lexer();

    lexer.addRule(/{MISSING}/);

    assert.strictEqual(sourceOf(lexer), '{MISSING}');
  });

  it('leaves the braces of a unicode property escape alone', function () {
    var lexer = new Lexer();
    lexer.setUnicode(true);
    lexer.addDefinition('L', /[0-9]/);
    lexer.addRule(/\p{L}+/, function (current) { return current.text; });

    lexer.setSource('h\u00e9llo');

    assert.deepStrictEqual(lexer.lexAll(), ['h\u00e9llo']);
  });

  it('leaves a counted quantifier alone', function () {
    var lexer = new Lexer();
    lexer.addDefinition('D', /[0-9]/);
    lexer.addRule(/{D}{2}/, function (current) { return current.text; });

    lexer.setSource('42');

    assert.deepStrictEqual(lexer.lexAll(), ['42']);
  });

  it('does not expand references inside a string rule', function () {
    var lexer = new Lexer();
    lexer.addDefinition('D', /[0-9]/);
    lexer.addRule('{D}', function (current) { return current.text; });

    lexer.setSource('{D}');

    assert.deepStrictEqual(lexer.lexAll(), ['{D}']);
  });

  it('does not reinterpret a body containing a replacement pattern', function () {
    var lexer = new Lexer();
    lexer.addDefinition('A', /a$/);

    lexer.addRule(/{A}/);

    assert.strictEqual(sourceOf(lexer), '(?:a$)');
  });

  it('is dropped by clear()', function () {
    var lexer = new Lexer();
    lexer.addDefinition('D', /[0-9]/);

    lexer.clear();
    lexer.addRule(/{D}/);

    assert.strictEqual(sourceOf(lexer), '{D}');
  });
});

describe('definitions built from other definitions', function () {
  it('resolves a reference to an earlier definition', function () {
    var lexer = new Lexer();
    lexer.addDefinition('D', /[0-9]/);
    lexer.addDefinition('NUM', /{D}+/);

    lexer.addRule(/{NUM}/);

    assert.strictEqual(sourceOf(lexer), '(?:(?:[0-9])+)');
  });

  it('resolves a reference to a later definition', function () {
    var lexer = new Lexer();
    lexer.addDefinition('NUM', /{D}+/);
    lexer.addDefinition('D', /[0-9]/);

    lexer.addRule(/{NUM}/);

    assert.strictEqual(sourceOf(lexer), '(?:(?:[0-9])+)');
  });

  it('resolves through several levels', function () {
    var lexer = new Lexer();
    lexer.addDefinition('D', /[0-9]/);
    lexer.addDefinition('NUM', /{D}+/);
    lexer.addDefinition('FLOAT', /{NUM}\.{NUM}/);
    lexer.addRule(/{FLOAT}/, function (current) { return current.text; });

    lexer.setSource('3.14');

    assert.deepStrictEqual(lexer.lexAll(), ['3.14']);
  });

  it('keeps the body a definition had when it was registered', function () {
    var lexer = new Lexer();
    lexer.addDefinition('D', /[0-9]/);
    lexer.addDefinition('NUM', /{D}+/);

    lexer.addDefinition('D', /[a-z]/);

    assert.strictEqual(lexer.definitions.NUM, '(?:[0-9])+');
  });

  it('does not loop on a self reference', function () {
    var lexer = new Lexer();
    lexer.addDefinition('A', /{A}x/);

    lexer.addRule(/{A}/);

    assert.strictEqual(sourceOf(lexer), '(?:{A}x)');
  });

  it('does not loop on a cycle between two definitions', function () {
    var lexer = new Lexer();
    lexer.addDefinition('A', /{B}x/);
    lexer.addDefinition('B', /{A}y/);

    lexer.addRule(/{A}/);

    assert.strictEqual(typeof sourceOf(lexer), 'string');
  });
});
