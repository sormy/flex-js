# FLEX.JS

FLEX.JS - Fast lexer (tokenizer, scanner) for JavaScript inspired by FLEX lexer generator.

## Description

This is a library for creating scanners: programs which recognized lexical patterns in text. It analyzes its input for occurrences of the regular expressions. Whenever it finds one, it executes the corresponding JavaScript code.

This lexer is inspired by well-known FLEX lexer generator for C. See more: http://westes.github.io/flex/manual/ and https://github.com/westes/flex

## What is common between FLEX and FLEX.JS

- general idea, rules, logic
- the same default behavior where it is possible to implement
- the same examples and the same output

## Differences between FLEX and FLEX.JS

- FLEX is lexer generator but FLEX.JS is configurable lexer class.
- FLEX.JS uses JavaScript regular expression, this fact effect on syntax and some limitations.
- FLEX could work with streams/buffers but FLEX.JS works with fixed-size strings.
- REJECT action is not a branch, code after REJECT will be executed, but action return value will be ignored.
- Trailing context besides primitive $ is not supported. Lookahead assertion could be used instead but lookahead value is not used to increase weight for expression. (TODO: should be fixable)
- support for buffer
- support buffer switch
- custom input handler
- yywrap()
- EOF rule handling is slightly different (TODO: fix?)
- custom output buffer
- Track line number (TODO: fix)

## Simple example

A simple example of float value scanner:

```javascript
var Lexer = require('flex-js');

var lexer = new Lexer();

// options
lexer.setIgnoreCase(true);  // does not make sense for this scanner, just for reference

// definitions
lexer.addDefinition('DIGIT', /[0-9]/);

// rules
lexer.addRule(/{DIGIT}+\.{DIGIT}+/, function (lexer) {
  console.log('Found float: ' + lexer.text);
});
lexer.addRule(/\s+/);

// code
lexer.setSource('1.2 3.4 5.6');
lexer.lex();
```

## Format of configuration

The lexer configuration consists of three sections:

- options
- definitions
- rules
- user code

The **options** section contains configuration for lexer, like default case sensivity behavior.

The **definitions** section contains declarations of simple **name** definitions to simplify the scanner specification, and declarations of **start conditions**, which are explained in a later section. Name definitions have the form:

```javascript
lexer.addDefinition(name, definition);
```

The "name" is a word beginning with a letter or an underscore ('\_') followed by zero or more letters, digits, '\_', or '-' (dash). The definition can subsequently be referred to using "{name}", which will expand to "(definition)". For example,

```javascript
lexer.addDefinition('DIGIT', /[0-9]/);
lexer.addDefinition('ID', /[a-z][a-z0-9]*/);
```

defines "DIGIT" to be a regular expression which matches a single digit, and "ID" to be a regular expression which matches a letter followed by zero-or-more letters-or-digits. A subsequent reference to `{DIGIT}+"."{DIGIT}*` is identical to `([0-9])+"."([0-9])*` and matches one-or-more digits followed by a '.' followed by zero-or-more digits.

There is no way to set case sensivity flag per definition, only per pattern or globally for whole lexer instance.

The **rules** section of the lexer configuration contains a series of rules of the form:

```javascript
lexer.addRule(pattern, action);
lexer.addRules(rules);
lexer.addStateRule(state, pattern, action);
lexer.addStateRules(state, rules);
```

Lexer defaults and definitions should be added before adding new rules.

## Options

- Ignore Case - case sensivity could be set via `setIgnoreCase(false)` or `setIgnoreCase(true)`. By defalt lexer is case sensitive.
- Debug Mode - debug mode could be enabled with `setDebugEnabled(true)`. In debug mode lexer will output on console state, expression and matched value for each accepted value.
- track line number (TODO)
- read from stdin or custom file handler without boilerplate (TODO)
- echo to stdout, stderr or custom file handler (TODO)

## States

- `addStateRule('s', 'r', action);` - an `r`, but only in start condition `s `(see below for discussion of start conditions)
- `addStateRule(['s1', 's2', 's3'], 'r', action);` - same, but in any of start conditions `s1`, `s2`, or `s3`
- `addStateRule('*', 'r', action);` or `addStateRule(Lexer.STATE_ANY, 'r', action);` - an `r` in any start condition, even an exclusive one.
- `addStateRule(['s1', 's2'], '<<EOF>>', action);` or `addStateRule(['s1', 's2'], Lexer.RULE_EOF, action);` - an end-of-file when in start condition `s1` or `s2`

## Patterns

Read more here: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions

The patterns are written using an standard syntex for JavaScript regular expressions + string values are also supported. These are:

- `"[xyz]\"foo"` - the literal string: `[xyz]"foo`
- `/x/` - match the character `x`
- `/./` - any unicode character except newline
- `/[xyz]/` - a "character class"; in this case, the pattern matches either an `x`, a `y`, or a `z`
- `/[abj-oZ]/` - a "character class" with a range in it; matches an `a`, a `b`, any letter from `j` through `o`, or a `Z`
- `/[^A-Z]/` - a "negated character class", i.e., any character but those in the class. In this case, any character EXCEPT an uppercase letter.
- `/[^A-Z\n]/` any character EXCEPT an uppercase letter or a newline
- `/r*/` - zero or more r's, where r is any regular expression
- `/r+/` - one or more r's
- `/r?/` - zero or one r's (that is, "an optional r")
- `/r{2,5}/` - anywhere from two to five r's
- `/r{2,}/` - two or more r's
- `/r{4}/` - exactly 4 r's
- `/{name}/` - the expansion of the "name" definition (see above)
- `/[\b]/` - a backspace (`U+0008`), you need to use square brackets if you want to match a literal backspace character. (Not to be confused with `\b`.)
- `/\b/` - a word boundary. A word boundary matches the position where a word character is not followed or preceded by another word-character. Note that a matched word boundary is not included in the match. In other words, the length of a matched word boundary is zero. (Not to be confused with `[\b]`.)
- `/\B/` - a non-word boundary. This matches a position where the previous and next character are of the same type: Either both must be words, or both must be non-words. The beginning and end of a string are considered non-words.
- `/\cX/` - where `X` is a character ranging from `A` to `Z`. Matches a control character in a string.
- `/\d/` - a digit character. Equivalent to `[0-9]`.
- `/\D/` - a non-digit character. Equivalent to `[^0-9]`.
- `/\f/` - a form feed (`U+000C`).
- `/\n/` - a line feed (`U+000A`).
- `/\r/` - a carriage return (`U+000D`).
- `/\s/` - a single white space character, including space, tab, form feed, line feed.
- `/\S/` - a single character other than white space.
- `/\t/` - a tab (`U+0009`).
- `/\v/` - a vertical tab (`U+000B`).
- `/\w/` - any alphanumeric character including the underscore. Equivalent to `[A-Za-z0-9_]`.
- `/\W/` - any non-word character. Equivalent to `[^A-Za-z0-9_]`.
- `/\n/` - where `n` is a positive integer, a back reference to the last substring matching the `n` parenthetical in the regular expression (counting left parentheses).
- `/\0/` - a NULL (`U+0000`) character.
- `/\xhh/` - the character with the code `hh` (two hexadecimal digits)
- `/\uhhhh/` - caracter with the code `hhhh` (four hexadecimal digits).
- `/\u{hhhh}/` - (only when `u` flag is set) the character with the Unicode value `hhhh` (hexadecimal digits).
- `/(r)/` - match an `r`; parentheses are used to override precedence (see below)
- `/rs/` - the regular expression `r` followed by the regular expression `s`; called "concatenation"
- `/r|s/` - either an `r` or an `s`
- `/^r/` - an `r`, but only at the beginning of a line (i.e., which just starting to scan, or right after a newline has been scanned).
- `/r$/` - an `r`, but only at the end of a line (i.e., just before a newline).
- `/x(?=y)/` - an `x` only if `x` is followed by `y`. This is called a lookahead.
- `/x(?!y)/` - an `x` only if `x` is not followed by `y`. This is called a negated lookahead.
- `/\x/` - a backslash that precedes a non-special character indicates that the next character is special and is not to be interpreted literally. A backslash that precedes a special character indicates that the next character is not special and should be interpreted literally.
- `"<<EOF>>"` or `Lexer.RULE_EOF` - an end-of-file.

Note that inside of a character class, all regular expression operators lose their special meaning except escape ('\') and the character class operators, '-', ']', and, at the beginning of the class, '^'.

The regular expressions listed above are grouped according to precedence, from highest precedence at the top to lowest at the bottom. Those grouped together have equal precedence. For example, `foo|bar*` is the same as `(foo)|(ba(r*))` since the '*' operator has higher precedence than concatenation, and concatenation higher than alternation ('|'). This pattern therefore matches either the string "foo" or the string "ba" followed by zero-or-more r's. To match "foo" or zero-or-more "bar"'s, use: `foo|(bar)*` and to match zero-or-more "foo"'s-or-"bar"'s: `(foo|bar)*`

Some notes on patterns:

- A negated character class such as the example "[^A-Z]" above will match a newline unless "\n" (or an equivalent escape sequence) is one of the characters explicitly present in the negated character class (e.g., "[^A-Z\n]"). This is unlike how many other regular expression tools treat negated character classes, but unfortunately the inconsistency is historically entrenched. Matching newlines means that a pattern like [^"]* can match the entire input unless there's another quote in the input.

- A rule can have at most one instance of trailing context (the '$' operator). '^' pattern can only occur at the beginning of a pattern, and, as well as with '$', cannot be grouped inside parentheses.

## How the input is matched

When the lexer is run, it analyzes its input looking for strings which match any of its patterns. If it finds more than one match, it takes the one matching the most text (for trailing context rules, this includes the length of the trailing part, even though it will then be returned to the input). If it finds two or more matches of the same length, the rule added first in the configuration is chosen.

Once the match is determined, the text corresponding to the match (called the token) is made available in the lexer property `text`, and its length in `text.length`. The action corresponding to the matched pattern is then executed (a more detailed description of actions follows), and then the remaining input is scanned for another match.

If no match is found, then the default rule is executed: the next character in the input is considered matched and copied to the standard output (action `echo()`). Thus, the simplest legal lexer configuration is:

```javascript
var lexer = new Lexer();
lexer.setSource(text)
lexer.lex();
```

which run a scanner that simply copies its input (one character at a time) to its output.

## Actions

Each pattern in a rule has a corresponding action, which can be any arbitrary JavaScript function. If the action is empty, then when the pattern is matched the input token is simply discarded. For example, here is the a program which deletes all occurrences of "zap me" from its input:

```javascript
var lexer = new Lexer();
lexer.addRule('zap me');
lexer.setSource('bla zap me bla zap me bla');
lexer.lex();
```

It will copy all other characters in the input to the output since they will be matched by the default rule.

Here is a program which compresses multiple blanks and tabs down to a single blank, and throws away whitespace found at the end of a line:

```javascript
var lexer = new Lexer();
lexer.addRule(/\s+/, function () {
  process.stdout.write(' ');
});
lexer.addRule(/\s+$/); // ignore
lexer.setSource('bla  bla   bla    ');
lexer.lex();
```

It will output "bla bla bla" on stdout.

You could assign the same action function for multiple patterns.

Actions can include arbitrary JavaScript code, including return statements to return a value to whatever routine called `lex()`. Each time `lex()` is called it continues processing tokens from where it last left off until it either reaches the end of the file or executes a return.

Return value `undefined` is reserved for `discard()` action.

Return value `0` is reserved for EOF.

Actions are free to modify `text`.

There are a number of special actions which can be called within an action:

### DISCARD

`discard()` return `undefined` which is reseved value for DISCARD action.

### ECHO

`echo()` copies `text` to the scanner's output.

### BEGIN

`begin(state)` with the name of a start condition places the scanner in the corresponding start condition (see below).

### REJECT

`reject()` directs the scanner to proceed on to the "second best" rule which matched the input (or a prefix of the input). The rule is chosen as described above in "How the Input is Matched", and `text` set up appropriately. It may either be one which matched as much text as the originally chosen rule but came later in the flex input file, or one which matched less text. For example, the following will both count the words in the input and call the function `special()` whenever "frob" is seen:

```javascript
var wordCount = 0;
var lexer = new Lexer();
lexer.addRule('frob', function (lexer) {
  lexer.reject();
});
lexer.addRule(/[^\s]+/, function (lexer) {
  wordCount++;
});
lexer.setSource('frob frob frob');
lexer.lex();
```

Without the `reject()`, any "frob"'s in the input would not be counted as words, since the scanner normally executes only one action per token. Multiple `reject()` calls are allowed, each one finding the next best choice to the currently active rule. For example, when the following scanner scans the token "abcd", it will write "abcdabcaba" to the output:

```javascript
var lexer = new Lexer();
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
```

The first four rules share the same action. `reject()` is a particularly expensive feature in terms of scanner performance; if it is used in any of the scanner's actions it will slow down all of the scanner's matching.

### MORE

`more()` tells the scanner that the next time it matches a rule, the corresponding token should be appended onto the current value of `text` rather than replacing it. For example, given the input "mega-kludge" the following will write "mega-mega-kludge" to the output:

```javascript
var lexer = new Lexer();
lexer.addRule('mega-', function (lexer) {
  lexer.echo();
  lexer.more();
});
lexer.addRule('kludge', function (lexer) {
  lexer.echo();
});
lexer.setSource('mega-kludge');
lexer.lex();
```

First "mega-" is matched and echoed to the output. Then "kludge" is matched, but the previous "mega-" is still hanging around at the beginning of text so the `echo()` for the "kludge" rule will actually write "mega-kludge".

### LESS

`less(n)` returns all but the first `n` characters of the current token back to the input stream, where they will be rescanned when the scanner looks for the next match. `text` is adjusted appropriately (e.g., `text.length` will now be equal to `n`). For example, on the input "foobar" the following will write out "foobarbar":

```javascript
var lexer = new Lexer();
lexer.addRule('foobar', function (lexer) {
  lexer.echo();
  lexer.less(3);
});
lexer.addRule(/[a-z]+/, function (lexer) {
  lexer.echo();
});
lexer.setSource('foobar');
lexer.lex();
```

`less(0)` will cause the entire current input string to be scanned again. Unless you've changed how the scanner will subsequently process its input (using `begin()`, for example), this will result in an endless loop.

### UNPUT

`unput(s)` puts the string `s` back onto the input stream. It will be the next character scanned. The following action will take the current token and cause it to be rescanned enclosed in parentheses.

```javascript
var lexer = new Lexer();
lexer.addRule('foobar', function (lexer) {
  lexer.unput('(foobar)');
});
lexer.addRule(/.+/, function (lexer) {
  lexer.echo();
});
lexer.setSource('foobar');
lexer.lex();
```

`unput()` modifies input source string, so using `unput()` will slowdown your lexer.

Note that you cannot put back EOF to attempt to mark the input stream with an end-of-file.

### INPUT

`input()` reads the next character or `input(n)` reads `n` next characters from the input stream. For example, the following is one way to eat up C comments:

```javascript
var lexer = new Lexer();
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
```

### TERMINATE

`terminate()` can be used in lieu of a return statement in an action. It terminates the scanner and returns a `0` (EOF) to the scanner's caller, indicating "all done". By default, `terminate()` is also called when an end-of-file is encountered.

## The generated scanner

Whenever `lex()` is called, it scans tokens from the input source string. It continues until it either reaches an end-of-file (at which point it returns the value 0) or one of its actions executes a return statement with token.

If the scanner reaches an end-of-file, subsequent calls are undefined unless new source input string is set or `restart()` is called. `restart()` takes one argument, a new string input source (which can be null, if you want to rescan the same input string). Essentially there is no difference between just assigning a new input source string with `setSource()` or using `restart()` to do so; the latter is available for compatibility with previous versions of flex, and because it can be used to switch input strings in the middle of scanning. It can also be used to throw away the current input buffer, by calling it with an `''`; but better is to use `clear()`. Note that `restart()` does not reset the start condition to `INITIAL` (see Start Conditions, below).

If `lex()` stops scanning due to executing a return statement in one of the actions, the scanner may then be called again and it will resume scanning where it left off.

Note that in either case, the start condition remains unchanged; it does not revert to `INITIAL`.

By default (and for purposes of efficiency), the scanner uses native RegExp objects to read characters from input string and match them.

## Start conditions

Lexer provides a mechanism for conditionally activating rules. Any rule whose pattern is added with `addStateRule(state, rule, action)` will only be active when the scanner is in the start condition named `state`. For example,

```javascript
lexer.addStateRule('STRING', /[^"]*/);  // eat up the string body
```

will be active only when the scanner is in the "STRING" start condition, and

```javascript
lexer.addStateRule(['INITIAL', 'STRING', 'QUOTE'], '.', action);
```

will be active only when the current start condition is either "INITIAL", "STRING", or "QUOTE".

Start conditions are declared before patterns as `addState(name, isExclusive)`. Start conditions could be inclusive (default) or exclusive. A start condition is activated using the `begin()` action. Until the next `begin()` action is executed, rules with the given start condition will be active and rules with other start conditions will be inactive. If the start condition is inclusive, then rules with no start conditions at all will also be active. If it is exclusive, then only rules qualified with the start condition will be active. A set of rules contingent on the same exclusive start condition describe a scanner which is independent of any of the other rules in the flex input. Because of this, exclusive start conditions make it easy to specify "mini-scanners" which scan portions of the input that are syntactically different from the rest (e.g., comments).

If the distinction between inclusive and exclusive start conditions is still a little vague, here's a simple example illustrating the connection between the two. The set of rules:

```javascript
lexer.addState('example');
lexer.addStateRule('example', 'foo', doSomething);
lexer.addRule('bar', doSomethingElse);
```

is equivalent to

```javascript
lexer.addState('example', true);
lexer.addStateRule('example', 'foo', doSomething);
lexer.addStateRule(['INITIAL', 'example'], 'bar', doSomethingElse);
```

Without the `INITIAL` and `example` qualifier, the `bar` pattern in the second example wouldn't be active (i.e., couldn't match) when in start condition `example`. If we just used `example` to qualify `bar`, though, then it would only be active in `example` and not in `INITIAL`, while in the first example it's active in both, because in the first example the `example` starting condition is an inclusive (default) start condition.

Also note that the special start-condition specifier `*` matches every start condition. Thus, the above example could also have been written:

```javascript
lexer.addState('example', true);
lexer.addStateRule('example', 'foo', doSomething);
lexer.addStateRule('*', 'bar', doSomethingElse);
```

The default rule (to `ECHO` any unmatched character) remains active in start conditions. It is equivalent to:

```javascript
lexer.addStateRule('*', /.|\n/, function (lexer) { lexer.echo(); });
```

`begin()` or  returns to the original state where only the rules with no start conditions are active. This state can also be referred to as the start-condition "INITIAL", so `begin(Lexer.STATE_INITIAL)` is equivalent to `begin()` and `begin('INITIAL')`.

To illustrate the uses of start conditions, here is a scanner which provides two different interpretations of a string like "123.456". By default it will treat it as as three tokens, the integer "123", a dot ('.'), and the integer "456". But if the string is preceded earlier in the line by the string "expect-floats" it will treat it as a single token, the floating-point number 123.456:

```javascript
var lexer = new Lexer();
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
```

Here is a scanner which recognizes (and discards) C comments while maintaining a count of the current input line.

```javascript
var lineNumber = 1;
var lexer = new Lexer();
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
console.log(lineNumber);
```

This scanner goes to a bit of trouble to match as much text as possible with each rule. In general, when attempting to write a high-speed scanner try to match as much possible in each rule, as it's a big win.

Note that start-conditions names are really string values.

Finally, here's an example of how to match C-style quoted strings using exclusive start conditions, including expanded escape sequences (but not including checking for a string that's too long):

```javascript
var str = '';

var lexer = new Lexer();
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

var strings = [];

var token;
while ((token = lexer.lex()) !== Lexer.EOF) {
  strings.push(token);
}

console.log(strings);
```

Often, such as in some of the examples above, you wind up writing a whole bunch of rules all preceded by the same start condition(s). Flex makes this a little easier and cleaner by introducing a notion of start condition scope. A start condition scope could be defined with `addRules(rules)` or `addStateRules(states, rules)`.

So, for example,

```javascript
lexer.addStateRules('ESC', [
  { expression: '\\n', action: function () { return '\n'; } },
  { expression: '\\r', action: function () { return '\r'; } },
  { expression: '\\f', action: function () { return '\f'; } },
  { expression: '\\0', action: function () { return '\0'; } }
]);
```

is equivalent to:

```javascript
lexer.addStateRule('ESC', '\\n', function () { return '\n'; });
lexer.addStateRule('ESC', '\\r', function () { return '\r'; });
lexer.addStateRule('ESC', '\\f', function () { return '\f'; });
lexer.addStateRule('ESC', '\\0', function () { return '\0'; });
```

Three routines are available for manipulating stacks of start conditions:

- `switchState(newState)` switch to new state and loose previous state value (the same as `begin()`).
- `pushState(newState)` pushes the current start condition onto the top of the start condition stack and switches to `newState` as though you had used `begin(newState)` (recall that start condition names are also strings).
- `popState()` pops the top of the stack and switches to it via BEGIN.
- `topState()` returns the top of the stack without altering the stack's contents.

The start condition stack grows dynamically and so has no built-in size limitation. If memory is exhausted, program execution aborts.

## Multiple input buffers

Not supported :-)

## End-of-file rules

The special rule `"<<EOF>>"` or `Lexer.RULE_EOF` indicates actions which are to be taken when an end-of-file is encountered. The action must finish by doing one of things:

- do nothing, default `terminate()` will be called.
- switch input string with `restart(newString)` and continue scan.
- add some text to input with `unput()`.
- use `reject()` to try another EOF rule (what???).
- return something if buffer refilled with `restart()` or `unput()`.

<<EOF>> rules may not be used with other patterns; they may only be qualified with a list of start conditions. If an unqualified <<EOF>> rule is given, it applies to all start conditions which do not already have <<EOF>> actions. To specify an <<EOF>> rule for only the initial start condition, use

```javascript
lexer.addRule(Lexer.RULE_EOF, action);
```

These rules are useful for catching things like unclosed comments. An example:

```javascript
var lexer = new Lexer();
lexer.addState('quote', true);
// ...other rules for dealing with quotes...
lexer.addStateRule('quote', Lexer.RULE_EOF, function (lexer) {
  console.error('unterminated quote');
});
lexer.addRule(Lexer.RULE_EOF, function (lexer) {
  lexer.restart('add some more text to lexer');
});
```

## Miscellaneous methods

...


## Values available to the user

This section summarizes the various values available to the user in the rule actions.

- `text` holds the text of the current token. It may be modified.
- `state` holds string name of current start condition.
- `restart(newSource)` may be called to point lexer at the new input string. The switch-over to the new file is immediate. Note that calling `restart()` without an argument thus throws away the current input buffer and continues scanning the same input string again. Once scanning terminates because an end-of-file has been seen, you can call `restart(newSource)` to continue scanning.
- `source` is the string which by default lexer reads from. It may be redefined but doing so only makes sense before scanning begins or after an EOF has been encountered. Changing it in the midst of scanning with use
- `index` holds current position in source string.

## Interfacing with parser

One of the main uses of lexer is as a companion to the parser.

Here is example how can you use this lexer together with parser produced by Lemon.JS parser generator.

```javascript
var parser = new Parser();
var lexer = new Lexer();
// confgure lexer here
var token;
while ((token = lexer.lex()) !== Lexer.EOF) {
  parser.parse(token);
}
parser.parse();
```

## Performance considerations

TODO: Add some notes about performance.

## Alternative Lexers

- https://github.com/tantaman/lexed.js
- https://github.com/aaditmshah/lexer
- https://github.com/YuhangGe/jslex

## License

MIT
