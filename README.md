# FLEX.JS

> Lexing was solved in 1987. This is not a library that imitates flex, it is
> flex, taught to write JavaScript.

You have written a tokenizer before. It was a `while` loop, a `switch`, and a
regex with three alternations in it. Eighty lines, and you were quietly proud.
Then the grammar grew string escapes, and nested comments, and a keyword that is
also a valid identifier, and now it is four hundred lines that nobody touches.
Including you. Especially you.

A back end for [flex](https://github.com/westes/flex). Give it a grammar file,
get a scanner in JavaScript or TypeScript with no dependencies. Not "no runtime
dependencies". None. Nothing in `node_modules` that turns out, two years later,
to have opinions about your bundler.

- blazing fast, which is what every README says, so here is the table instead:
  491 KB of SQL in **6.6 ms**, where chevrotain takes 7.3 and moo 16.5. Against
  seven others, on three grammars, nothing beat it. [Go and check](#performance)
- longest match wins, so `>=` beats `>` whichever order you wrote them in - that
  is the bug you were going to spend Thursday on, already fixed
- start conditions, `REJECT`, `yymore`, `yyless`, trailing context, `<<EOF>>` -
  the whole cabinet, including the drawers nobody opens
- reads UTF-8, from a string, a `Buffer` or a `Uint8Array`
- a `.d.ts` beside JavaScript output with `--header-file`, or emit TypeScript
  directly

## Installing

```sh
npm install --save-dev flex-js
```

That brings a prebuilt generator. Nothing compiles. Nothing clones a toolchain.
Nothing prints forty lines of `node-gyp` and then a link to an issue from 2019
with three hundred thumbs-up and no fix:

| platform | architectures | what ships                                                   |
| -------- | ------------- | ------------------------------------------------------------ |
| macOS    | x86_64, arm64 | one universal binary, back to 10.13                          |
| Linux    | x86_64, arm64 | statically linked against musl, so no glibc version to match |
| Windows  | x86_64, arm64 | no MSYS2 or Cygwin needed                                    |

Generated scanners run anywhere; only the generator is platform-specific, and
only at build time.

flex needs m4 to write a scanner. m4 is a macro processor from 1977 whose
quoting characters are `[[` and `]]` because the sensible ones were already
spoken for, and which most people meet exactly once - during a build failure, at
speed, at night. Every generator here has one linked in, so there is nothing to
install, nothing to find on the PATH, and no occasion to be introduced. You will
live a longer and calmer life. It writes the same scanner on every platform.

Not only a JavaScript back end, either. Each of those binaries is flex 2.6.4
entire, so the same file writes C, C++ with `%option c++`, or Go with
`--emit=go`. On Windows it does that with no MSYS2, no Cygwin and no m4 beside
it, which fell out of making the JavaScript back end work there the way
penicillin fell out of a dirty petri dish, and is arguably the more useful half
of the accident.

C needs nothing but its own standard library. A C++ scanner includes
`FlexLexer.h`, which has to be the one belonging to the same flex. The copy
already on your system will compile beautifully and then behave like a haunted
house, so that one ships as well:

```sh
c++ -I "$(npx flex-js --print-includedir)" scanner.cc
```

## A first scanner

Write a grammar, `tokens.l`:

```
%option noyywrap
%%
[0-9]+          return { kind: 'number', value: parseInt(yytext, 10) };
[a-z]+          return { kind: 'word', value: yytext };
"+"|"-"|"*"|"/" return { kind: 'operator', value: yytext };
[ \t\n]+        ;
.               return { kind: 'other', value: yytext };
%%
```

Generate a scanner from it:

```sh
npx flex-js --emit=javascript -Cfe --header-file=tokens.d.ts -o tokens.js tokens.l
```

`-Cfe` is what to reach for unless you know otherwise: within noise of the
quickest table mode at under a third of its size, measured under
[Performance](#performance).

Typed arrays hold the tables unless you say otherwise, which is worth a seventh
to a fifth. `%option notyped` gives plain arrays back, for an engine without
`Int16Array` - roughly, older than about 2011.

`--header-file` is flex's own, the way a `.c` gets a `.h`; without it only
`tokens.js` is written.

`%option noyywrap` appears at the top of every flex example ever written,
including that one. It means "when the input runs out, stop". Yes, that has to
be asked for. No, nobody remembers why.

That grammar ends in `.` as a catch-all, which reads one whole character however
many bytes it is made of - see [Unicode](#unicode).

And use it:

```js
var Scanner = require("./tokens.js");

var scanner = new Scanner("2 apples + 3");
var token;
while ((token = scanner.lex()) !== 0) {
  console.log(token);
}
```

```
{ kind: 'number', value: 2 }
{ kind: 'word', value: 'apples' }
{ kind: 'operator', value: '+' }
{ kind: 'number', value: 3 }
```

`lex()` answers `0` at the end of the input. Not `null`. Not `undefined`. Not a
`Symbol.for("eof")` you import from a third package. `0` - which has outlived
every convention that was going to replace it, and will outlive the next one.

## TypeScript

```sh
npx flex-js --emit=typescript -o tokens.ts tokens.l
```

Type-checks under `--strict`, and exports the interface it satisfies.

The rules are TypeScript too, which is what this gives over a `.d.ts`: a type
error in a rule body fails the build along with the scanner. A declaration file
describes the scanner's surface, not the code you wrote inside it.

```
%{
type Token = { kind: string; text: string };
%}
%option noyywrap
%%
[a-z]+    return { kind: "word", text: yytext } as Token;
```

## Start conditions

For comments, strings, and anything else that needs the scanner to remember
where it is. This is the hand-rolled state machine you were about to write. It
is a table, it is correct, and it will not quietly grow a bug the first time
somebody nests a comment inside a string inside a comment:

```
%option noyywrap
%x COMMENT
%%
"/*"                BEGIN(COMMENT);
<COMMENT>"*/"       BEGIN(INITIAL);
<COMMENT>.|\n       ;
[a-z]+              return yytext;
.|\n                ;
%%
```

## Talking to the caller

`yy` is the caller's, and every rule body can reach it. Yes, it is called `yy`.
Everything here is called `yy` something - `yytext`, `yyleng`, `yylex`,
`yywrap` - from an era when identifiers were rationed. flex has never
apologised, and at this point it would be unsettling if it started:

```js
var scanner = new Scanner(source);
scanner.yy = { words: [] };
scanner.lex();
```

```
[a-z]+    { yy.words.push(yytext); }
```

## Unicode

Rules are about characters. A rule written with one matches it, and `.` is one
character - however many bytes that takes:

```
"日本"     return { kind: 'japan' };
"café"     return { kind: 'cafe' };
.          return { kind: 'other', value: yytext };
```

```
2 café 日本 🚀 3  ->  number=2  word=caf  other=é  other=日  other=本  other=🚀  number=3
```

C's `.` is one byte, because flex is a machine over the 256 byte values, and a
grammar there has to spell the shape of a character out for itself. Underneath
this is the same machine - `.` compiles to that shape - but a grammar does not
have to know. `%option nounicode` asks for the byte, and `-7` has no byte above
127 to build a character from, so there the byte is the character.

`yytext` is text, not bytes. `yyleng` is `yytext.length`, so an emoji counts as
two, as it does everywhere in JavaScript. Take that up with 1995; we tried.

## Performance

`npm run bench`, best of 30 rounds, every lexer building one object per token
and returning the same number of them. flex-js and moo answer one token per
call, the way FLEX's `yylex()` does; chevrotain, peggy and lezer take the whole
input and loop inside. Every engine is held to the same token count, and the
harness says so when one differs. MacBook Pro (M1 Max), macOS 26.6.2, Node
24.20.0. flex-js with `-Cfe`, which [A first scanner](#a-first-scanner) uses.

\* parses rather than lexes. There is no tokenizing stage in there to measure on
its own, so it is being asked for strictly more work than the rest and the
comparison is unfair to it.

Rules written as regular expressions, 155 KB and 39,500 tokens:

| lexer             | time    | throughput | tokens/s | peak memory |
| ----------------- | ------- | ---------- | -------- | ----------- |
| flex-js 2         | 2.2 ms  | 69.1 MB/s  | 18.0 M   | 77 MB       |
| chevrotain 13.2.0 | 2.4 ms  | 62.4 MB/s  | 16.3 M   | 70 MB       |
| flex-js 1.x       | 2.8 ms  | 54.4 MB/s  | 14.2 M   | 69 MB       |
| moo 0.5.3         | 5.1 ms  | 29.5 MB/s  | 7.7 M    | 92 MB       |
| peggy 5.1.0 \*    | 12.8 ms | 11.9 MB/s  | 3.1 M    | 92 MB       |
| jison-lex 0.3.4   | 13.2 ms | 11.5 MB/s  | 3.0 M    | 80 MB       |
| lezer 1.4.10 \*   | 14.3 ms | 10.6 MB/s  | 2.8 M    | 98 MB       |

Keywords and punctuation written as plain strings, 163 KB and 52,500 tokens:

| lexer             | time    | throughput | tokens/s | peak memory |
| ----------------- | ------- | ---------- | -------- | ----------- |
| flex-js 2         | 2.4 ms  | 66.1 MB/s  | 21.8 M   | 83 MB       |
| chevrotain 13.2.0 | 2.6 ms  | 61.8 MB/s  | 20.4 M   | 74 MB       |
| flex-js 1.x       | 3.1 ms  | 51.7 MB/s  | 17.1 M   | 72 MB       |
| moo 0.5.3         | 6.3 ms  | 25.2 MB/s  | 8.3 M    | 95 MB       |
| jison-lex 0.3.4   | 15.1 ms | 10.5 MB/s  | 3.5 M    | 97 MB       |
| peggy 5.1.0 \*    | 15.7 ms | 10.1 MB/s  | 3.3 M    | 108 MB      |
| lezer 1.4.10 \*   | 17.4 ms | 9.2 MB/s   | 3.0 M    | 110 MB      |

SQL, seven keywords against identifiers and fourteen pieces of punctuation, 491
KB and 123,000 tokens:

| lexer             | time    | throughput | tokens/s | peak memory |
| ----------------- | ------- | ---------- | -------- | ----------- |
| flex-js 2         | 6.6 ms  | 72.9 MB/s  | 18.7 M   | 107 MB      |
| chevrotain 13.2.0 | 7.3 ms  | 65.5 MB/s  | 16.8 M   | 107 MB      |
| flex-js 1.x       | 8.6 ms  | 55.8 MB/s  | 14.3 M   | 100 MB      |
| moo 0.5.3         | 16.5 ms | 29.0 MB/s  | 7.5 M    | 163 MB      |
| jison-lex 0.3.4   | 34.8 ms | 13.8 MB/s  | 3.5 M    | 140 MB      |
| lezer 1.4.10 \*   | 43.3 ms | 11.1 MB/s  | 2.8 M    | 161 MB      |
| peggy 5.1.0 \*    | 51.6 ms | 9.3 MB/s   | 2.4 M    | 165 MB      |

Time moves about half a millisecond between runs and peak memory about 15 MB.
The corpus, the grammars and the harness are all in `benchmark/`.

### The table modes

`-C` picks what the DFA is held in. The SQL scanner above, generated four ways:

| mode     | what it holds                             | time   | raw    | minified | gzipped |
| -------- | ----------------------------------------- | ------ | ------ | -------- | ------- |
| `-Cf`    | a column per byte, 256 to cover UTF-8     | 6.5 ms | 107 KB | 54 KB    | 3.2 KB  |
| `-Cfe`   | a column per equivalence class, 32 here   | 6.5 ms | 33 KB  | 12 KB    | 2.7 KB  |
| `-7 -Cf` | ASCII only, and refuses anything above it | 6.5 ms | 64 KB  | 29 KB    | 3.1 KB  |
| none     | compressed, what FLEX builds unasked      | 8.0 ms | 24 KB  | 7 KB     | 2.5 KB  |

`-Cfe` is the buy: within noise of the widest table at under a third of its
size.

### What ships

| lexer             | minified | gzipped | dependencies |
| ----------------- | -------- | ------- | ------------ |
| jison-lex 0.3.4   | 5 KB     | 1.7 KB  | none         |
| peggy 5.1.0       | 7 KB     | 2.6 KB  | none         |
| moo 0.5.3         | 9 KB     | 3.3 KB  | none         |
| flex-js 2, `-Cfe` | 12 KB    | 2.7 KB  | none         |
| flex-js 1.x       | 15 KB    | 5.0 KB  | none         |
| lezer 1.4.10      | 54 KB    | 17.5 KB | 1 package    |
| chevrotain 13.2.0 | 112 KB   | 30.9 KB | 5 packages   |

flex-js, peggy and jison-lex generate: that is the whole thing, your grammar
included, and nothing is needed at runtime. chevrotain, moo and flex-js 1.x are
libraries, measured bundled with their own dependencies and before your grammar.
lezer is both - the row is its runtime, and a generated parser sits on top.
Minified with esbuild, gzipped with `gzip -9`.

Typed arrays hold the tables unless `%option notyped` says otherwise, which is
worth a seventh to a fifth. A match no rule reads is never built, which asks for
nothing and is worth 3 to 10 percent.

With a parser rather than objects the gap opens: with
[lemon-js](https://github.com/sormy/lemon-js) the 103 TPC-DS queries parse from
text in 2.8 ms against chevrotain's 9.2 ms. Two tools old enough to draw a
pension, entirely unbothered.

## Documentation

- [The grammar file](docs/grammar.md) - sections, patterns, options
- [The generated scanner](docs/scanner.md) - what it offers and what rules can
  call
- [Differences from FLEX](docs/differences.md) - the short list
- [Building from source](docs/building.md) - and how the back end works

The [FLEX manual](https://westes.github.io/flex/manual/) applies, except for
what [differences.md](docs/differences.md) lists. It is older than this README,
longer than this README, and better than this README.

## Upgrading from 1.x

1.x was a library with `addRule`, and it worked, in the way a hand-written lexer
works right up until the grammar gets interesting - see the top of this page.
2.x is flex, so rules live in a grammar file. The old line is on the
[`1.x` branch](https://github.com/sormy/flex-js/tree/1.x);
`npm install flex-js@1` still installs it.

## License

This repository is flex's: BSD with the Berkeley clause, see [LICENSE](LICENSE).
Generated scanners carry no requirement of their own.

The prebuilt generators in `dist/` have GNU M4 linked in, so those binaries are
GPL-3.0-or-later as wholes - see [LICENSE.m4](LICENSE.m4). That reaches the
generator, not the scanners it writes.
