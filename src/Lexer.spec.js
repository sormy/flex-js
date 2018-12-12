var chai = require('chai');
var expect = chai.expect;

var Lexer = require('./Lexer');

describe('Lexer', function() {
  it('#addDefinition() should accept string name', function() {
    var lexer = new Lexer();
    lexer.addDefinition('test', 'test');
    expect(lexer.definitions).to.have.property('test');
  });

  it('#addDefinition() should not accept invalid name', function() {
    var lexer = new Lexer();
    expect(function () {
      lexer.addDefinition(null, 'test');
    }).to.throw('Invalid definition name');
    expect(function () {
      lexer.addDefinition(undefined, 'test');
    }).to.throw('Invalid definition name');
    expect(function () {
      lexer.addDefinition('', 'test');
    }).to.throw('Invalid definition name');
    expect(function () {
      lexer.addDefinition('123', 'test');
    }).to.throw('Invalid definition name');
  });

  it('#addDefinition() should accept string expression', function() {
    var lexer = new Lexer();
    lexer.addDefinition('test', 'test');
    expect(lexer.definitions['test']).to.equal('test');
  });

  it('#addDefinition() should escape string expression', function() {
    var lexer = new Lexer();
    lexer.addDefinition('test', 'test*');
    expect(lexer.definitions['test']).to.equal('test\\*');
  });

  it('#addDefinition() should accept regular expression', function() {
    var lexer = new Lexer();
    lexer.addDefinition('test', /test/);
    expect(lexer.definitions['test']).to.equal('test');
  });

  it('#addDefinition() should not escape regular expression', function() {
    var lexer = new Lexer();
    lexer.addDefinition('test', /.*/);
    expect(lexer.definitions['test']).to.equal('.*');
  });

  it('#addDefinition() should not allow flags for regular expression', function() {
    var lexer = new Lexer();
    expect(function () {
      lexer.addDefinition('test', /.*/i);
    }).to.throw('Expression flags are not supported')
  });

  it('#addDefinition() should not accept null/undefined expression', function() {
    var lexer = new Lexer();
    expect(function () {
      lexer.addDefinition('test');
    }).to.throw('Invalid expression');
    expect(function () {
      lexer.addDefinition('test', null);
    }).to.throw('Invalid expression');
  });

  it('#addDefinition() should not accept empty expression', function() {
    var lexer = new Lexer();
    expect(function () {
      lexer.addDefinition('test', '');
    }).to.throw('Empty expression');
    expect(function () {
      lexer.addDefinition('test', new RegExp(''));
    }).to.throw('Empty expression');
  });

  it('#addStateRule() use definitions', function() {
    var lexer = new Lexer();
    lexer.addDefinition('DIGIT', /[0-9]/);
    lexer.addRule(/{DIGIT}\.{DIGIT}/);
    expect(lexer).with.deep.nested.property('rules.INITIAL.0.expression.source').to.equal('(?:[0-9])\\.(?:[0-9])');
  });

  it('#lex() - echo all', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.setSource('bla bla bla');
    lexer.lex();
    expect(output).to.equal('bla bla bla');
  });

  it('#lex() - zap me', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addRule('zap me');
    lexer.setSource('bla zap me bla zap me bla');
    lexer.lex();
    expect(output).to.equal('bla  bla  bla');
  });

  it('#lex() - echo match', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addRule('username', function () {
      output += 'ME';
    });
    lexer.setSource('bla bla bla username bla bla bla');
    lexer.lex();
    expect(output).to.equal('bla bla bla ME bla bla bla');
  });

  it('#lex() - count lines and characters', function() {
    var numLines = 1;
    var numChars = 0;

    var lexer = new Lexer();

    lexer.addRule('\n', function () {
      numLines++;
      numChars++;
    });
    lexer.addRule(/./, function () {
      numChars++;
    });
    lexer.setSource('line1\nline2\nline3');

    lexer.lex();

    expect(numLines).to.equal(3);
    expect(numChars).to.equal(17);
  });

  it('#lex() - toy pascal-like language', function() {
    var output = '';
    var lexer = new Lexer();

    lexer.addDefinition('DIGIT', /\d/);
    lexer.addDefinition('ID', /[a-zA-Z][a-zA-Z0-9]*/);

    lexer.addRule(/{DIGIT}+/, function (lexer) {
      output += 'An integer: ' + lexer.text + ' (' + parseInt(lexer.text, 10) + ')\n';
    });
    lexer.addRule(/{DIGIT}+\.{DIGIT}*/, function (lexer) {
      output += 'A float: ' + lexer.text + ' (' + parseFloat(lexer.text) + ')\n';
    });
    lexer.addRule(/if|then|begin|end|procedure|function/i, function (lexer) {
      output += 'A keyword: ' + lexer.text + '\n';
    });
    lexer.addRule(/{ID}/, function (lexer) {
      output += 'An identifier: ' + lexer.text + '\n';
    });
    lexer.addRule(/[*/+-]/, function (lexer) {
      output += 'An operator: ' + lexer.text + '\n';
    });
    lexer.addRule(/\{[^}\n]*\}/);  // eat up one-line comments
    lexer.addRule(/\s+/);          // eat up whitespace
    lexer.addRule(/./, function (lexer) {
      output += 'Unrecognized character: ' + lexer.text + '\n';
    })

    lexer.setSource('123 1.23 + x function * { commment } end');

    lexer.lex();

    expect(output).to.equal(
      'An integer: 123 (123)\n' +
      'A float: 1.23 (1.23)\n' +
      'An operator: +\n' +
      'An identifier: x\n' +
      'A keyword: function\n' +
      'An operator: *\n' +
      'A keyword: end\n'
    );
  });

  it('#lex() - compress whitespace', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addRule(/\s+/, function () {
      output += ' ';
    });
    lexer.addRule(/\s+$/); // ignore this token
    lexer.setSource('bla  bla   bla    ');
    lexer.lex();
    expect(output).to.equal('bla bla bla');
  });

  it('#reject() - with reject', function() {
    var output = '';
    var wordCount = 0;
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addRule('frob', function (lexer) {
      lexer.reject();
    });
    lexer.addRule(/[^\s]+/, function (lexer) {
      wordCount++;
    });
    lexer.setSource('frob frob frob');
    lexer.lex();
    expect(wordCount).to.equal(3);
  });

  it('#reject() - without reject', function() {
    var output = '';
    var wordCount = 0;
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addRule('frob');
    lexer.addRule(/[^\s]+/, function (lexer) {
      wordCount++;
    });
    lexer.setSource('frob frob frob');
    lexer.lex();
    expect(wordCount).to.equal(0);
  });

  it('#reject() - multiple rejects', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    var action = function (lexer) {
      lexer.echo();
      lexer.reject();
    };
    lexer.addRule('a', action);
    lexer.addRule('ab', action);
    lexer.addRule('abc', action);
    lexer.addRule('abcd', action);
    lexer.addRule(/./);
    lexer.setSource('abcd');
    lexer.lex();
    expect(output).to.equal('abcdabcaba');
  });

  it('#more()', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addRule('mega-', function (lexer) {
      lexer.echo();
      lexer.more();
    });
    lexer.addRule('kludge', function (lexer) {
      lexer.echo();
    });
    lexer.setSource('mega-kludge');
    lexer.lex();
    expect(output).to.equal('mega-mega-kludge');
  });

  it('#less()', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addRule('foobar', function (lexer) {
      lexer.echo();
      lexer.less(3);
    });
    lexer.addRule(/[a-z]+/, function (lexer) {
      lexer.echo();
    });
    lexer.setSource('foobar');
    lexer.lex();
    expect(output).to.equal('foobarbar');
  });

  it('#unput()', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addRule('foobar', function (lexer) {
      lexer.unput('(foobar)');
    });
    lexer.addRule(/.+/, function (lexer) {
      lexer.echo();
    });
    lexer.setSource('foobar');
    lexer.lex();
    expect(output).to.equal('(foobar)');
  });

  it('#input()', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addRule('/*', function (lexer) {
      do {
        var char = lexer.input();
        if (char === '*') {
          var nextChar = lexer.input();
          if (nextChar === '/') {
            break;
          }
        }
      } while (char !== '');
    });
    lexer.setSource('test /* comment */ test');
    lexer.lex();
    expect(output).to.equal('test  test');
  });

  it('#setIgnoreCase(false)', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.addRule(/bla/, function (lexer) {
      output += lexer.text;
    });
    lexer.addRule(/./);  // ignore
    lexer.setSource('BLA');
    lexer.lex();
    expect(output).to.equal('');
  });

  it('#setIgnoreCase(true)', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.setIgnoreCase(true);
    lexer.addRule(/bla/, function (lexer) {
      output += lexer.text;
    });
    lexer.addRule(/./);  // ignore
    lexer.setSource('BLA');
    lexer.lex();
    expect(output).to.equal('BLA');
  });

  it('should expect floats', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () { }; // redirect echo to null
    lexer.addState('expect');
    lexer.addRule('expect floats', function (lexer) {
      lexer.begin('expect');
    });
    lexer.addStateRule('expect', /\d+\.\d+/, function (lexer) {
      output += 'found a float: ' + parseFloat(lexer.text) + '\n';
    });
    lexer.addStateRule('expect', '\n', function (lexer) {
      lexer.begin(Lexer.STATE_INITIAL);
    });
    lexer.addRule(/\d+/, function (lexer) {
      output += 'found an integer: ' + parseInt(lexer.text, 10) + '\n';
    });
    lexer.addRule('.', function (lexer) {
      output += 'found a dot\n';
    });
    lexer.setSource('1.1\nexpect floats 2.2\n3.3\n');
    lexer.lex();
    expect(output).to.equal(
      'found an integer: 1\n' +
      'found a dot\n' +
      'found an integer: 1\n' +
      'found a float: 2.2\n' +
      'found an integer: 3\n' +
      'found a dot\n' +
      'found an integer: 3\n'
    );
  });

  it('#addState() - discard C comments', function() {
    var lineNumber = 1;
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addState('comment', true);
    lexer.addRule('/*', function (lexer) {
      lexer.begin('comment');
    });
    lexer.addStateRule('comment', /[^*\n]*/);     // eat anything that's not a '*'
    lexer.addStateRule('comment', /\*+[^*/\n]*/); // eat up '*'s not followed by '/'s
    lexer.addStateRule('comment', /\n/, function () { lineNumber++; });
    lexer.addStateRule('comment', /\*+\//, function (lexer) {
      lexer.begin(Lexer.STATE_INITIAL);
    });
    lexer.addRule(/\d+/, function (lexer) {
      output += 'found an integer: ' + parseInt(lexer.text, 10) + '\n';
    });
    lexer.addRule('.', function (lexer) {
      output += 'found a dot\n';
    });
    lexer.setSource('test /* line 1\nline 2\nline 3 */ test');
    lexer.lex();
    expect(output).to.equal('test  test');
    expect(lineNumber).to.equal(3);
  });

  it('should match C-style quoted strings', function () {
    var output = '';
    var str = '';

    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addState('str', true);
    lexer.addRule('"', function (lexer) {
      lexer.begin('str');
    });
    lexer.addStateRule('str', '"', function (lexer) {
      lexer.begin(Lexer.STATE_INITIAL);
      var token = str;
      str = '';
      return token;
    });
    lexer.addStateRule('str', '\n', function (lexer) {
      throw new Error('Unterminated string constant');
    });
    lexer.addStateRule('str', /\\[0-7]{1,3}/, function (lexer) {
      // octal escape sequence
      var charCode = parseInt(lexer.text.substr(1), 8);
      if (charCode > 255) {
        throw new Error('Constant is out of bounds');
      }
      str += String.fromCharCode(charCode);
    });
    lexer.addStateRule('str', /\\[0-9]+/, function (lexer) {
      throw new Error('Bad escape sequence');
    });
    lexer.addStateRule('str', '\\n', function (lexer) {
      str += '\n';
    });
    lexer.addStateRule('str', '\\t', function (lexer) {
      str += '\t';
    });
    lexer.addStateRule('str', '\\r', function (lexer) {
      str += '\r';
    });
    lexer.addStateRule('str', '\\b', function (lexer) {
      str += '\b';
    });
    lexer.addStateRule('str', '\\f', function (lexer) {
      str += '\f';
    });
    lexer.addStateRule('str', '\\(.|\n)', function (lexer) {
      str += lexer.text.substr(1);
    });
    lexer.addStateRule('str', /[^\\\n\"]+/, function (lexer) {
      str += lexer.text;
    });

    lexer.setSource(
      'bla bla bla "simple text" bla bla bla' +
      'bla bla bla "text with octal ~\\40~ value" bla bla bla' +
      'bla bla bla "text with escaped ~\\n~ new line" bla bla bla' +
      'bla bla bla "text with escaped ~\\t~ tab" bla bla bla' +
      'bla bla bla "text with escaped ~\\r~ carriage return" bla bla bla' +
      'bla bla bla "text with escaped ~\\b~ backspace" bla bla bla' +
      'bla bla bla "text with escaped ~\\f~ form feed" bla bla bla' +
      'bla bla bla "text with escaped ~\\s~ char" bla bla bla'
    );


    var strings = lexer.lexAll();

    expect(strings).to.eql([
      'simple text',
      'text with octal ~ ~ value',
      'text with escaped ~\n~ new line',
      'text with escaped ~\t~ tab',
      'text with escaped ~\r~ carriage return',
      'text with escaped ~\b~ backspace',
      'text with escaped ~\f~ form feed',
      'text with escaped ~s~ char'
    ]);


    lexer.reset();
    lexer.setSource('bla "unterminated string constant \n str" bla')
    expect(function () {
      lexer.lex();
    }).to.throw('Unterminated string constant');


    lexer.reset();
    lexer.setSource('bla "out of bounds constant \\777 str" bla')
    expect(function () {
      lexer.lex();
    }).to.throw('Constant is out of bounds');


    lexer.reset();
    lexer.setSource('bla "bad escape sequence \\9 str" bla')
    expect(function () {
      lexer.lex();
    }).to.throw('Bad escape sequence');
  });
});
