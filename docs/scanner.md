# The generated scanner

One file, no dependencies: tables, rules, and the code that runs them. ES5 in an
IIFE, so it loads under Node, a bundler, or a `<script>` tag.

```js
var { Scanner } = require("./tokens.js");

var scanner = new Scanner("let x = 1;");
var token;
while ((token = scanner.lex()) !== 0) {
  console.log(token);
}
```

TypeScript output is a module rather than a script, so it is imported rather
than required, and the two are not swapped without changing the line that brings
the scanner in:

```ts
import { Scanner } from "./tokens";
```

The name is the one `%option prefix` gave, exported rather than defaulted, so
the class and the interface of the same name arrive together and a caller can
write `let s: Scanner` beside `new Scanner(text)`.

## What it will read

A string, a `Buffer`, or any `Uint8Array`. Bytes cost less: the scanner reads
UTF-8, so a buffer is already in the shape it wants.

```js
var scanner = new Scanner(fs.readFileSync("input.txt"));
```

Not a stream: backing up, `yyless` and `REJECT` look backwards, so the input has
to be whole. Read it first:

```js
var chunks = [];
stream.on("data", function (chunk) {
  chunks.push(chunk);
});
stream.on("end", function () {
  var scanner = new Scanner(Buffer.concat(chunks));
  // ...
});
```

`yywrap()` is the other half: when one input runs out it can supply the next.

`%option prefix="sql"` exports `sqlScanner` instead, so two scanners can share a
page. The prefix is used as written, so `prefix="Sql"` gives `SqlScanner` - the
capital being what reads as a type in JavaScript and TypeScript alike.

## What lex() answers

`lex()` runs rules until one returns something. It answers `0` at the end of the
input, as FLEX's `yylex` does, so `0` is the one value a rule must not return.

## On the scanner

| name                        | what it is                                          |
| --------------------------- | --------------------------------------------------- |
| `yytext`                    | the text of the current match                       |
| `yyleng`                    | its length, in characters                           |
| `yylineno`                  | the line it is on, with `%option yylineno`          |
| `yy`                        | anything the caller wants the rules to reach        |
| `yyout`                     | where `ECHO` writes; stdout when this is null       |
| `yy_flex_debug`             | whether `%option debug` traces, which go to stderr  |
| `restart(text)`             | scan a string from its beginning                    |
| `yy_scan_string(text)`      | the same, under FLEX's name                         |
| `yypush_buffer_state(text)` | put this input aside and scan another               |
| `yypop_buffer_state()`      | go back to the one set aside                        |
| `yywrap()`                  | asked when the input runs out; false means carry on |
| `yy_source`                 | the input, as UTF-8 bytes                           |
| `yy_c_buf_p`                | how far into those bytes the scanner has read       |

## What a rule body can call

| name                                                    | what it does                                              |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `yytext`, `yyleng`, `yylineno`                          | the current match                                         |
| `yy`                                                    | what the caller left on the scanner                       |
| `BEGIN(sc)`                                             | switch start condition                                    |
| `YY_START`, `YY_START()`                                | the start condition in force                              |
| `ECHO;`, `ECHO()`                                       | write the match to `yyout`                                |
| `REJECT;`, `REJECT()`                                   | give this match up for the next rule that matched here    |
| `yymore()`                                              | add the next match to this one                            |
| `yyless(n)`                                             | keep the first n characters, return the rest to the input |
| `unput(text)`                                           | put text in front of the scanner                          |
| `input()`                                               | read the next character                                   |
| `yyterminate()`                                         | stop, answering 0                                         |
| `yy_push_state(sc)`, `yy_pop_state()`, `yy_top_state()` | with `%option stack`                                      |
| `YY_AT_BOL()`, `yy_set_bol(flag)`                       | whether the match began a line                            |

`ECHO`, `REJECT` and `YY_START` take parentheses here; see
[differences.md](differences.md).

`yy_fatal_error(message)` is where the scanner reports a state it cannot go on
from, and throws. Replacing it is how a caller changes what is reported; one
that returns instead leaves the scanner reading tables it has already run off
the end of, so it has to end the scan itself.

## Carrying something into the rules

`yy` is the way a rule body reaches the caller, and is what FLEX's `yyextra` and
`%option extra-type` are for:

```js
var scanner = new Scanner(text);
scanner.yy = { symbols: [], errors: [] };
scanner.lex();
console.log(scanner.yy.symbols);
```

```
[a-z]+    { yy.symbols.push(yytext); }
```

## Reading more than one string

Each scanner is an object, so two of them never interfere, and a scanner can be
pointed at another string when it runs out:

```js
var sources = ["first.txt", "second.txt"].map(read);
var scanner = new Scanner(sources.shift());

scanner.yywrap = function () {
  if (!sources.length) {
    return true;
  }
  this.restart(sources.shift());
  return false;
};
```

Without `%option noyywrap`, `yywrap()` is asked at the end of every input.
Answering false means it has supplied the next one, with `restart()` where C
sets `yyin`; answering false without supplying it loops, as it does in C.

## TypeScript

`--emit=typescript` writes a `.ts` that type-checks under `--strict` and exports
the interface it satisfies. JavaScript output gets the same from
`--header-file=tokens.d.ts`, which is flex's own way of writing a header beside
a scanner.
