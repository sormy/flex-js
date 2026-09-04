var expect = require('chai').expect;

var firstCharCodes = require('./firstCharCodes.js');

function codesOf(text) {
  return text.split('').map(function (character) { return character.charCodeAt(0); });
}

describe('firstCharCodes', function () {
  var narrowed = [
    { expression: /abc/, expected: codesOf('a') },
    { expression: /let/, expected: codesOf('l') },
    { expression: /[abc]/, expected: codesOf('abc') },
    { expression: /[a-e]/, expected: codesOf('abcde') },
    { expression: /[a-cx]+/, expected: codesOf('abcx') },
    { expression: /a|bb|ccc/, expected: codesOf('abc') },
    { expression: /(?:ab)+/, expected: codesOf('a') },
    { expression: /(ab|cd)/, expected: codesOf('ac') },
    { expression: /\d+/, expected: codesOf('0123456789') },
    { expression: /\./, expected: codesOf('.') },
    { expression: /\n/, expected: [10] },
    { expression: /\x41/, expected: [65] },
    { expression: /A/, expected: [65] },
    { expression: /^foo/, expected: codesOf('f') },
    { expression: /\bword/, expected: codesOf('w') },
    { expression: /(?=x)[a-c]/, expected: codesOf('abc') },
    { expression: /[-+]?[0-9]+/, expected: codesOf('-+0123456789') },
    { expression: /x?y/, expected: codesOf('xy') },
    { expression: /a{2,3}/, expected: codesOf('a') },
    { expression: /a{0,3}b/, expected: codesOf('ab') },
    { expression: /"[^"]*"/, expected: codesOf('"') },
    { expression: /x/i, expected: codesOf('xX') },
    { expression: /[a-b]/i, expected: codesOf('abAB') },
    { expression: /é+/, expected: [233] },
  ];

  narrowed.forEach(function (testCase) {
    it('narrows ' + testCase.expression + ' to its possible first characters', function () {
      expect(firstCharCodes(testCase.expression)).to.have.members(testCase.expected);
    });
  });

  var unknown = [
    /./,          // matches almost anything
    /[^x]/,       // negated class
    /\D/,         // negated class escape
    /\W/,
    /\S/,
    /a*/,         // can match empty
    /(?:)?b/,     // optional empty group
    /\1x/,        // backreference
    /[\d-\D]/,    // class member that cannot be narrowed
  ];

  unknown.forEach(function (expression) {
    it('gives up on ' + expression + ' so the rule is always tried', function () {
      expect(firstCharCodes(expression)).to.equal(null);
    });
  });

  it('never omits a character an expression can really start with', function () {
    var corpus = [];
    var alphabet = 'abcxyzABCXYZ019 .+-_"\\\n\t{}()[]|?*$^éà';
    for (var sample = 0; sample < 4000; sample++) {
      var text = '';
      var length = 1 + (sample % 6);
      for (var position = 0; position < length; position++) {
        text += alphabet.charAt((sample * 7 + position * 13) % alphabet.length);
      }
      corpus.push(text);
    }

    narrowed.concat(unknown.map(function (expression) { return { expression: expression }; }))
      .forEach(function (testCase) {
        var codes = firstCharCodes(testCase.expression);
        if (codes === null) {
          return;
        }
        var sticky = new RegExp(testCase.expression.source, testCase.expression.flags + 'y');
        corpus.forEach(function (text) {
          sticky.lastIndex = 0;
          var match = sticky.exec(text);
          if (match && match[0].length) {
            expect(codes, 'expression ' + testCase.expression + ' matched ' + JSON.stringify(text))
              .to.include(text.charCodeAt(0));
          }
        });
      });
  });
});
