var nodeTest = require('node:test');
var assert = require('node:assert');

var assertThrows = require('./assertThrows.js');

var describe = nodeTest.describe;
var it = nodeTest.it;

var Lexer = require('../src/Lexer.js');

describe('Lexer', function() {
  it('#addDefinition() should accept string name', function() {
    var lexer = new Lexer();
    lexer.addDefinition('test', 'test');
    assert.ok('test' in lexer.definitions);
  });

  it('#addDefinition() should not accept invalid name', function() {
    var lexer = new Lexer();
    assertThrows(function () {
      lexer.addDefinition(null, 'test');
    }, 'Invalid definition name');
    assertThrows(function () {
      lexer.addDefinition(undefined, 'test');
    }, 'Invalid definition name');
    assertThrows(function () {
      lexer.addDefinition('', 'test');
    }, 'Invalid definition name');
    assertThrows(function () {
      lexer.addDefinition('123', 'test');
    }, 'Invalid definition name');
  });

  it('#addDefinition() should accept string expression', function() {
    var lexer = new Lexer();
    lexer.addDefinition('test', 'test');
    assert.strictEqual(lexer.definitions['test'], 'test');
  });

  it('#addDefinition() should escape string expression', function() {
    var lexer = new Lexer();
    lexer.addDefinition('test', 'test*');
    assert.strictEqual(lexer.definitions['test'], 'test\\*');
  });

  it('#addDefinition() should accept regular expression', function() {
    var lexer = new Lexer();
    lexer.addDefinition('test', /test/);
    assert.strictEqual(lexer.definitions['test'], 'test');
  });

  it('#addDefinition() should not escape regular expression', function() {
    var lexer = new Lexer();
    lexer.addDefinition('test', /.*/);
    assert.strictEqual(lexer.definitions['test'], '.*');
  });

  it('#addDefinition() should not allow flags for regular expression', function() {
    var lexer = new Lexer();
    assertThrows(function () {
      lexer.addDefinition('test', /.*/i);
    }, 'Expression flags are not supported')
  });

  it('#addDefinition() should not accept null/undefined expression', function() {
    var lexer = new Lexer();
    assertThrows(function () {
      lexer.addDefinition('test');
    }, 'Invalid expression');
    assertThrows(function () {
      lexer.addDefinition('test', null);
    }, 'Invalid expression');
  });

  it('#addDefinition() should not accept empty expression', function() {
    var lexer = new Lexer();
    assertThrows(function () {
      lexer.addDefinition('test', '');
    }, 'Empty expression');
    assertThrows(function () {
      lexer.addDefinition('test', new RegExp(''));
    }, 'Empty expression');
  });

  it('#addStateRule() use definitions', function() {
    var lexer = new Lexer();
    lexer.addDefinition('DIGIT', /[0-9]/);
    lexer.addRule(/{DIGIT}\.{DIGIT}/);
    assert.strictEqual(lexer.rules.INITIAL[0].expression.source, '(?:[0-9])\\.(?:[0-9])');
  });

  it('#lex() - echo all', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.setSource('bla bla bla');
    lexer.lex();
    assert.strictEqual(output, 'bla bla bla');
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
    assert.strictEqual(output, 'bla  bla  bla');
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
    assert.strictEqual(output, 'bla bla bla ME bla bla bla');
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

    assert.strictEqual(numLines, 3);
    assert.strictEqual(numChars, 17);
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

    assert.strictEqual(output, 'An integer: 123 (123)\n' +
      'A float: 1.23 (1.23)\n' +
      'An operator: +\n' +
      'An identifier: x\n' +
      'A keyword: function\n' +
      'An operator: *\n' +
      'A keyword: end\n');
  });

  it('#lex() - compress whitespace', function() {
    var output = '';
    var lexer = new Lexer();
    lexer.echo = function () {  // redirect echo to variable
      output += this.text;
    };
    lexer.addRule(/\s+$/); // ignore this token
    lexer.addRule(/\s+/, function () {
      output += ' ';
    });
    lexer.setSource('bla  bla   \nbla    \n');
    lexer.lex();
    assert.strictEqual(output, 'bla bla bla ');
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
    assert.strictEqual(wordCount, 3);
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
    assert.strictEqual(wordCount, 0);
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
    assert.strictEqual(output, 'abcdabcaba');
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
    assert.strictEqual(output, 'mega-mega-kludge');
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
    assert.strictEqual(output, 'foobarbar');
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
    assert.strictEqual(output, '(foobar)');
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
    assert.strictEqual(output, 'test  test');
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
    assert.strictEqual(output, '');
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
    assert.strictEqual(output, 'BLA');
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
    assert.strictEqual(output, 'found an integer: 1\n' +
      'found a dot\n' +
      'found an integer: 1\n' +
      'found a float: 2.2\n' +
      'found an integer: 3\n' +
      'found a dot\n' +
      'found an integer: 3\n');
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
    assert.strictEqual(output, 'test  test');
    assert.strictEqual(lineNumber, 3);
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

    assert.deepStrictEqual(strings, [
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
    assertThrows(function () {
      lexer.lex();
    }, 'Unterminated string constant');


    lexer.reset();
    lexer.setSource('bla "out of bounds constant \\777 str" bla')
    assertThrows(function () {
      lexer.lex();
    }, 'Constant is out of bounds');


    lexer.reset();
    lexer.setSource('bla "bad escape sequence \\9 str" bla')
    assertThrows(function () {
      lexer.lex();
    }, 'Bad escape sequence');
  });
});
