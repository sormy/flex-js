var expect = require('chai').expect;

var Lexer = require('./Lexer.js');

function lexerWith(rules) {
  var lexer = new Lexer();
  lexer.echoed = [];
  lexer.echo = function () { this.echoed.push(this.text); };
  rules.forEach(function (rule) {
    lexer.addRule(rule.expression, function (current) { return rule.name + ':' + current.text; });
  });
  return lexer;
}

describe('how the input is matched', function () {
  it('takes the rule matching the most text', function () {
    var lexer = lexerWith([
      { name: 'short', expression: /ab/ },
      { name: 'long', expression: /abc/ },
    ]);

    lexer.setSource('abc');

    expect(lexer.lexAll()).to.deep.equal(['long:abc']);
  });

  it('takes the most text whichever rule was added first', function () {
    var lexer = lexerWith([
      { name: 'long', expression: /abc/ },
      { name: 'short', expression: /ab/ },
    ]);

    lexer.setSource('abc');

    expect(lexer.lexAll()).to.deep.equal(['long:abc']);
  });

  it('breaks a tie with the rule added first', function () {
    var lexer = lexerWith([
      { name: 'first', expression: /[a-c]+/ },
      { name: 'second', expression: /abc/ },
    ]);

    lexer.setSource('abc');

    expect(lexer.lexAll()).to.deep.equal(['first:abc']);
  });
});

describe('beginning of line', function () {
  ['anchored first', 'anchored second'].forEach(function (order) {
    it('adds no length to the match, declared ' + order, function () {
      var anchored = { name: 'bol', expression: /^ab/ };
      var plain = { name: 'plain', expression: /abc/ };
      var lexer = lexerWith(order === 'anchored first' ? [anchored, plain] : [plain, anchored]);

      lexer.setSource('abc');

      expect(lexer.lexAll()).to.deep.equal(['plain:abc']);
    });
  });

  it('wins a tie when it was added first', function () {
    var lexer = lexerWith([
      { name: 'bol', expression: /^abc/ },
      { name: 'plain', expression: /abc/ },
    ]);

    lexer.setSource('abc');

    expect(lexer.lexAll()).to.deep.equal(['bol:abc']);
  });

  it('loses a tie when it was added second', function () {
    var lexer = lexerWith([
      { name: 'plain', expression: /abc/ },
      { name: 'bol', expression: /^abc/ },
    ]);

    lexer.setSource('abc');

    expect(lexer.lexAll()).to.deep.equal(['plain:abc']);
  });

  it('matches only where a line starts', function () {
    var lexer = lexerWith([
      { name: 'bol', expression: /^a/ },
      { name: 'plain', expression: /a/ },
    ]);

    lexer.setSource('aa');

    expect(lexer.lexAll()).to.deep.equal(['bol:a', 'plain:a']);
  });

  it('matches again after a newline', function () {
    var lexer = lexerWith([
      { name: 'bol', expression: /^a/ },
      { name: 'plain', expression: /a/ },
      { name: 'nl', expression: /\n/ },
    ]);

    lexer.setSource('a\na');

    expect(lexer.lexAll()).to.deep.equal(['bol:a', 'nl:\n', 'bol:a']);
  });
});

describe('end of line as trailing context', function () {
  it('counts the trailing newline toward the match length', function () {
    var lexer = lexerWith([
      { name: 'plain', expression: /[a-z]+/ },
      { name: 'eol', expression: /[a-z]+$/ },
      { name: 'nl', expression: /\n/ },
    ]);

    lexer.setSource('abc\n');

    expect(lexer.lexAll()).to.deep.equal(['eol:abc', 'nl:\n']);
  });

  it('leaves an unanchored match alone away from the line end', function () {
    var lexer = lexerWith([
      { name: 'plain', expression: /[a-z]+/ },
      { name: 'eol', expression: /[a-z]+$/ },
      { name: 'space', expression: / / },
      { name: 'nl', expression: /\n/ },
    ]);

    lexer.setSource('abc d\n');

    expect(lexer.lexAll()).to.deep.equal(['plain:abc', 'space: ', 'eol:d', 'nl:\n']);
  });

  it('does not include the newline in the text', function () {
    var lexer = lexerWith([
      { name: 'eol', expression: /ab$/ },
      { name: 'nl', expression: /\n/ },
    ]);

    lexer.setSource('ab\n');

    expect(lexer.lexAll()).to.deep.equal(['eol:ab', 'nl:\n']);
  });

  it('leaves the index before the newline', function () {
    var lexer = new Lexer();
    var indexes = [];
    lexer.addRule(/ab$/, function (current) { indexes.push(current.index); });
    lexer.addRule(/\n/);

    lexer.setSource('ab\n');
    lexer.lexAll();

    expect(indexes).to.deep.equal([2]);
  });

  it('gives an escaped dollar no trailing width', function () {
    var lexer = lexerWith([
      { name: 'literal', expression: /ab\$/ },
      { name: 'longer', expression: /ab\$c/ },
    ]);

    lexer.setSource('ab$c');

    expect(lexer.lexAll()).to.deep.equal(['longer:ab$c']);
  });

  it('treats an escaped backslash before the dollar as a real anchor', function () {
    var lexer = lexerWith([
      { name: 'anchored', expression: /a\\$/ },
      { name: 'nl', expression: /\n/ },
    ]);

    lexer.setSource('a\\\n');

    expect(lexer.lexAll()).to.deep.equal(['anchored:a\\', 'nl:\n']);
  });
});
