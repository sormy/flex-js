# The grammar file

A grammar file has three sections, separated by lines holding `%%`:

```
definitions
%%
rules
%%
user code
```

This follows the FLEX manual, and a grammar written for FLEX usually needs no
changes beyond its rule bodies, which are JavaScript here rather than C.

## Definitions

Names for patterns, so a rule can say `{DIGIT}` instead of repeating itself:

```
DIGIT    [0-9]
NUMBER   {DIGIT}+("."{DIGIT}+)?
```

Code between `%{` and `%}` is copied into the generated file, above the scanner,
which is where a helper a rule body calls belongs:

```
%{
function keyword(text) { return { kind: 'keyword', text: text }; }
%}
```

Start conditions are declared here, `%s` for inclusive and `%x` for exclusive:

```
%x COMMENT
%x STRING
```

Options are set here too, one or more per line:

```
%option noyywrap yylineno caseless
```

## Rules

A rule is a pattern, whitespace, and the JavaScript to run when it matches:

```
%%
[0-9]+          return { kind: 'number', value: parseInt(yytext, 10) };
[a-z]+          return { kind: 'word', value: yytext };
[ \t\n]+        ;
.               return { kind: 'other', value: yytext };
%%
```

A rule body spanning several lines is written in braces. A rule with no body
throws the match away, which is what `;` says above.

Longest match wins; on a tie, the rule written first. That is why the order of
`"if"` and `[a-z]+` does not matter.

A rule can be limited to start conditions:

```
<COMMENT>"*/"       BEGIN(INITIAL);
<COMMENT>.|\n       ;
<STRING,COMMENT>.   ;
<*>.                ;
```

A start condition becomes a name in the generated scanner rather than a
preprocessor definition, so `yy` and `YY`, which are FLEX's own, are refused.
Anything else is yours to name, and shares a scope with the scanner's own
bindings - so a name JavaScript keeps, or one the scanner reaches for, breaks
the scanner the way it would in any other JavaScript.

`<<EOF>>` runs when the input is exhausted, and can be given per start
condition:

```
<STRING><<EOF>>     return { kind: 'unterminated-string' };
<<EOF>>             return { kind: 'end' };
```

## Patterns

The syntax is FLEX's:

| pattern                    | matches                                       |
| -------------------------- | --------------------------------------------- |
| `x`                        | the character x                               |
| `.`                        | any character except a newline                |
| `[xyz]`, `[a-z]`, `[^a-z]` | a character class                             |
| `r*`, `r+`, `r?`           | none or more, one or more, none or one        |
| `r{2,5}`, `r{2,}`, `r{3}`  | counted repetition                            |
| `{NAME}`                   | the definition called NAME                    |
| `"text"`                   | the text, taken literally                     |
| `\x`, `\123`, `\x2a`       | an escaped character                          |
| `(r)`, `rs`, `r\|s`        | grouping, sequence, either                    |
| `^r`                       | r, at the start of a line                     |
| `r$`                       | r, at the end of a line                       |
| `r/s`                      | r, but only where s follows: trailing context |
| `<<EOF>>`                  | the end of the input                          |

The scanner reads UTF-8, so a pattern written with a character in it matches
that character:

```
"日本"          return { kind: 'japan' };
"café"          return { kind: 'cafe' };
```

To match any single character rather than any single byte, name the shape of a
UTF-8 sequence, which is the idiom FLEX grammars use:

```
UTF8    [\x20-\x7f]|[\xc2-\xdf][\x80-\xbf]|[\xe0-\xef][\x80-\xbf]{2}|[\xf0-\xf4][\x80-\xbf]{3}
```

## User code

Everything after the second `%%` is copied to the end of the generated file,
outside the scanner, where the name it is exported under is in scope:

```
%%
module.exports.tokenize = function (text) {
  var scanner = new Scanner(text);
  var tokens = [];
  var token;
  while ((token = scanner.lex()) !== 0) {
    tokens.push(token);
  }
  return tokens;
};
```

## Options

| option                         | what it does                                             |
| ------------------------------ | -------------------------------------------------------- |
| `noyywrap`                     | do not ask `yywrap()` whether anything follows the input |
| `yylineno`                     | keep `yylineno` up to date                               |
| `caseless`, `case-insensitive` | match without regard to case                             |
| `nodefault`                    | fail on unmatched input rather than writing it out       |
| `stack`                        | allow `yy_push_state`, `yy_pop_state`, `yy_top_state`    |
| `debug`                        | trace every match, when `yy_flex_debug` is on            |
| `prefix="name"`                | export `nameScanner` rather than `Scanner`               |
| `never-interactive`            | the only mode there is: the input is a string            |
| `yyterminate="..."`            | what `yyterminate()` becomes                             |
| `user-init="..."`              | code to run once, before the first match                 |

`user-init` runs once for the scanner rather than once per `lex()`, so it is
where `this.yy` is set up.

`%option 7bit` builds tables for ASCII alone, which halves a full table and
rules UTF-8 out: such a scanner refuses input carrying anything above ASCII. The
default covers all 256 bytes.

Options describing C, a file to read, or a reentrant scanner are unnecessary or
unsupported; [differences.md](differences.md) says which.
