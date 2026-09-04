var expect = require('chai').expect;

var Lexer = require('./Lexer.js');

function wordsAnd(rules, options) {
  var lexer = new Lexer();
  if (options && options.ignoreCase) {
    lexer.setIgnoreCase(true);
  }
  lexer.echoed = [];
  lexer.echo = function () { this.echoed.push(this.text); };
  rules.forEach(function (rule) {
    lexer.addRule(rule.expression, function (current) { return rule.name + ':' + current.text; });
  });
  return lexer;
}

describe('string rules', function () {
  it('matches a literal', function () {
    var lexer = wordsAnd([{ name: 'kw', expression: 'let' }]);

    lexer.setSource('let');

    expect(lexer.lexAll()).to.deep.equal(['kw:let']);
  });

  it('loses to a longer match', function () {
    var lexer = wordsAnd([
      { name: 'kw', expression: 'let' },
      { name: 'id', expression: /[a-z]+/ },
    ]);

    lexer.setSource('letter');

    expect(lexer.lexAll()).to.deep.equal(['id:letter']);
  });

  it('wins a tie against a rule added later', function () {
    var lexer = wordsAnd([
      { name: 'kw', expression: 'let' },
      { name: 'id', expression: /[a-z]+/ },
    ]);

    lexer.setSource('let');

    expect(lexer.lexAll()).to.deep.equal(['kw:let']);
  });

  it('does not match a prefix of itself at the end of the input', function () {
    var lexer = wordsAnd([
      { name: 'abc', expression: 'abc' },
      { name: 'any', expression: /./ },
    ]);

    lexer.setSource('ab');

    expect(lexer.lexAll()).to.deep.equal(['any:a', 'any:b']);
  });

  it('treats regular expression syntax in the literal as text', function () {
    var lexer = wordsAnd([
      { name: 'lit', expression: 'a.c' },
      { name: 'any', expression: /./ },
    ]);

    lexer.setSource('abc a.c');

    expect(lexer.lexAll()).to.deep.equal(['any:a', 'any:b', 'any:c', 'any: ', 'lit:a.c']);
  });

  it('matches a literal holding non-ascii characters', function () {
    var lexer = wordsAnd([{ name: 'word', expression: 'été' }]);

    lexer.setSource('été');

    expect(lexer.lexAll()).to.deep.equal(['word:été']);
  });

  it('keeps its case when the lexer is case sensitive', function () {
    var lexer = wordsAnd([
      { name: 'kw', expression: 'Let' },
      { name: 'id', expression: /[A-Za-z]+/ },
      { name: 'space', expression: / / },
    ]);

    lexer.setSource('Let let LET');

    expect(lexer.lexAll()).to.deep.equal(['kw:Let', 'space: ', 'id:let', 'space: ', 'id:LET']);
  });
});

describe('string rules with ignoreCase', function () {
  ['let', 'LET', 'Let', 'lEt'].forEach(function (written) {
    it('matches ' + JSON.stringify(written), function () {
      var lexer = wordsAnd([{ name: 'kw', expression: 'let' }], { ignoreCase: true });

      lexer.setSource(written);

      expect(lexer.lexAll()).to.deep.equal(['kw:' + written]);
    });
  });

  it('matches whichever case the rule was written in', function () {
    var lexer = wordsAnd([{ name: 'kw', expression: 'LET' }], { ignoreCase: true });

    lexer.setSource('let');

    expect(lexer.lexAll()).to.deep.equal(['kw:let']);
  });

  it('does not fold a digit or a punctuation mark', function () {
    var lexer = wordsAnd([
      { name: 'op', expression: '>=' },
      { name: 'num', expression: '10' },
      { name: 'space', expression: / / },
    ], { ignoreCase: true });

    lexer.setSource('>= 10');

    expect(lexer.lexAll()).to.deep.equal(['op:>=', 'space: ', 'num:10']);
  });

  it('still loses to a longer match', function () {
    var lexer = wordsAnd([
      { name: 'kw', expression: 'let' },
      { name: 'id', expression: /[a-z]+/ },
    ], { ignoreCase: true });

    lexer.setSource('lets');

    expect(lexer.lexAll()).to.deep.equal(['id:lets']);
  });

  it('folds a non-ascii literal the way the expression engine does', function () {
    var lexer = wordsAnd([{ name: 'word', expression: 'été' }], { ignoreCase: true });

    lexer.setSource('ÉTÉ');

    expect(lexer.lexAll()).to.deep.equal(['word:ÉTÉ']);
  });

  it('applies only to rules added after setIgnoreCase()', function () {
    var lexer = new Lexer();
    lexer.echo = function () { };
    lexer.addRule('one', function () { return 'before'; });
    lexer.setIgnoreCase(true);
    lexer.addRule('two', function () { return 'after'; });

    lexer.setSource('ONETWO');

    expect(lexer.lexAll()).to.deep.equal(['after']);
  });
});
