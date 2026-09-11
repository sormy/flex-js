'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var helper = require('./helper.js');

test('takes the longest match', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"<"     return "lt";',
    '"<="    return "le";',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, '<= <'), ['le', 'lt']);
});

test('breaks a tie on the rule written first', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"if"                     return "keyword";',
    '[a-z]+                   return "word";',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'if iffy'),
    ['keyword', 'word']);
});

test('the order rules are written in does not decide the length', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]+                   return "word";',
    '"if"                     return "keyword";',
    '%%'
  ].join('\n'));

  // "if" is as long as the word rule allows, so the earlier rule wins
  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'if'), ['word']);
});

test('writes unmatched input out, which is the default rule', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[0-9]+   return "number";',
    '%%'
  ].join('\n'));

  var out = helper.sink();
  var tokens = helper.lexAll(built.Scanner, 'a1b', function (scanner) {
    scanner.yyout = out;
  });

  assert.deepStrictEqual(tokens, ['number']);
  assert.strictEqual(out.text(), 'ab');
});

test('%option nodefault refuses unmatched input instead', function () {
  var built = helper.build([
    '%option noyywrap nodefault',
    '%%',
    '[0-9]+   return "number";',
    '%%'
  ].join('\n'));

  assert.throws(function () {
    helper.lexAll(built.Scanner, 'a');
  }, /scanner jammed|no action found/);
});

test('matches with the full table too', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '"<="    return "le";',
    '"<"     return "lt";',
    '[ ]+    ;',
    '%%'
  ].join('\n'), { args: ['-Cf'] });

  assert.deepStrictEqual(helper.lexAll(built.Scanner, '<= <'), ['le', 'lt']);
});

test('scans a string with no rules matching nothing at all', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '.|\\n    ;',
    '%%'
  ].join('\n'));

  assert.deepStrictEqual(helper.lexAll(built.Scanner, 'anything\nat all'), []);
});

test('the fast-scanner tables have no matcher here, so they are refused', function () {
  ['-F', '-CF', '-CFe'].forEach(function (option) {
    assert.throws(function () {
      helper.build([
        '%option noyywrap',
        '%%',
        '[a-z]+   { return 1; }',
        '.|\\n     ;',
        '%%'
      ].join('\n'), { args: [option] });
    }, /-F\/-CF is not supported/, option + ' was not refused');
  });
});

/* The tables are the same automaton either way they are held, so the option
 * only has to leave the matching alone. Full and compressed both, since they
 * index the table differently.
 */
['-Cf', '-Cfe', '-Cm', ''].forEach(function (tables) {
  test('typed tables scan the same as untyped ones' +
    (tables ? ' with ' + tables : ' with the default tables'), function () {
    var rules = [
      '%%',
      '"<="       return "le";',
      '"<"        return "lt";',
      '[0-9]+     return "int";',
      '[a-z]+     return "word";',
      '[ \\t\\n]+   ;',
      '.          return "other";',
      '%%'
    ];
    var input = 'ab <= 12 < c9 ?\n x';
    var args = tables ? [tables] : [];

    function scanned(options) {
      return helper.lexAll(helper.build(
        ['%option noyywrap' + options].concat(rules).join('\n'),
        { args: args }).Scanner, input);
    }

    var untyped = scanned('');

    assert.deepStrictEqual(scanned(' notyped'), untyped);
    assert.ok(untyped.length > 0, 'the grammar matched nothing');
  });
});

test('typed tables are the numbers flex sized them for', function () {
  var built = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]+   return "word";',
    '.|\\n     ;',
    '%%'
  ].join('\n'), { args: ['-Cf'] });
  var source = fs.readFileSync(built.path, 'utf8');

  assert.match(source, /var yy_nxt = new Int(16|32)Array\(\[/);
  assert.match(source, /yy_nxt\[yy_current_state \* [0-9]+ \+/);
});

/* An empty action reads nothing it matched, so the string is not built for it.
 * These are the ways something else reads that string anyway, behind the
 * action's back, and each has to keep working.
 */
[
  ['a plain grammar', [
    '"a"        return "a";',
    '[b-z]+     return "word";',
    '[ \\t\\n]+   ;'
  ], 'a bb a  c', ['a', 'word', 'a', 'word']],
  ['^ rules, which read the text to track it', [
    '^"a"       return "bol";',
    '"a"        return "a";',
    '[b-z]+     return "word";',
    '[ \\t\\n]+   ;'
  ], 'a b\na c', ['bol', 'word', 'bol', 'word']],
  ['REJECT, which runs a rule again', [
    '"ab"       { REJECT(); }',
    '"a"        return "a";',
    '[a-z]      return "one";',
    '[ \\t\\n]+   ;'
  ], 'ab a b', ['a', 'one', 'a', 'one']],
  ['yymore, which keeps the text for the next match', [
    '"a"        { yymore(); }',
    '"b"        return yytext;',
    '[ \\t\\n]+   ;'
  ], 'ab b', ['ab', 'b']]
].forEach(function (grammar) {
  test('an unread match is not missed with ' + grammar[0], function () {
    function scanned(options) {
      /* REJECT is not allowed with a full table, so that one asks for none. */
      var args = grammar[1].join('').indexOf('REJECT') === -1 ? ['-Cf'] : [];

      return helper.lexAll(helper.build(
        ['%option noyywrap' + options, '%%']
          .concat(grammar[1], ['%%']).join('\n'),
        { args: args }).Scanner, grammar[2]);
    }

    /* Against the tokens themselves, not just against each other: two runs
     * of the same broken grammar agree perfectly.
     */
    assert.deepStrictEqual(scanned(''), grammar[3]);
    assert.deepStrictEqual(scanned(' notyped'), grammar[3]);
  });
});

/* An <<EOF>> rule is given its rule number back after it is parsed, so its
 * action arrives while the count points at the rule before it.
 */
test('an <<EOF>> rule does not spend the rule before it', function () {
  var withEof = helper.build([
    '%option noyywrap',
    '%%',
    '[a-z]+     return "word";',
    '[ \\n]+     ;',
    '<<EOF>>    return "end";',
    '%%'
  ].join('\n'), { args: [] });
  var source = fs.readFileSync(withEof.path, 'utf8');

  assert.match(source, /switch \(yy_act\) \{\n\s*case 0: case 2: break;/,
    'the spacing rule lost its place in the switch');

  /* Counted rather than run to exhaustion: an <<EOF>> action that returns is
   * asked again on the next call, which is FLEX's own behaviour.
   */
  var scanner = new withEof.Scanner('ab cd');
  assert.deepStrictEqual(
    [scanner.lex(), scanner.lex(), scanner.lex()],
    ['word', 'word', 'end']);
});

/* Vanilla defaults as well, since naming the rules costs nothing a table of
 * numbers would have to earn back.
 */
[[], ['-Cf']].forEach(function (args) {
  test('a rule that reads nothing it matched is named apart from one that does'
    + (args.length ? ' with ' + args.join(' ') : ''), function () {
    var built = helper.build([
      '%option noyywrap',
      '%%',
      '[a-z]+     return "word";',
      '[ \\t\\n]+   ;',
      '%%'
    ].join('\n'), { args: args });
    var source = fs.readFileSync(built.path, 'utf8');
    var named = source.match(/switch \(yy_act\) \{\n\s*((?:case \d+: )+)break;/);

    assert.ok(named, 'no switch naming the rules that read nothing');
    /* 0 is the backup arm rather than a rule: it picks a real one and comes
     * back through here, so the string it would be handed is thrown away.
     */
    assert.deepStrictEqual(named[1].match(/\d+/g), ['0', '2'],
      'only the spacing rule is left without the text it matched');
  });
});

/* Code a grammar asks to run before or after every action reads the match the
 * same way an action does, without being one.
 */
/* post-action stands in for the break that ends a case, so it writes one, and
 * only rules that reach a break run it - here the spacing rule and no other.
 */
[['pre-action', '', '[ab][ ][cd]'],
  ['post-action', ' break;', '[ ]']].forEach(function (which) {
  test(which[0] + ' sees the match of a rule whose own action is empty',
    function () {
      function echoed(options) {
        var built = helper.build([
          '%option noyywrap' + options,
          '%option ' + which[0] + '="yy_scanner.yy_echo(\'[\' + yytext + \']\');'
            + which[1] + '"',
          '%%',
          '[a-z]+     return "word";',
          '[ \\t\\n]+   ;',
          '%%'
        ].join('\n'), { args: ['-Cf'] });
        var written = [];
        var scanner = new built.Scanner('ab cd');

        scanner.yyout = { write: function (text) { written.push(text); } };
        while (scanner.lex() !== 0) { /* the echo is what is being read */ }
        return written.join('');
      }

      assert.strictEqual(echoed(' notyped'), echoed(''));
      assert.strictEqual(echoed(''), which[2]);
    });
});
