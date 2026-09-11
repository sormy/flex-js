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
  491 KB of SQL in **6.6 ms**, where chevrotain takes 7.3 and moo 16.2. We could
  not find a JavaScript lexer that beats it. [Go and check](#performance)
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

Every project's benchmark shows that project winning. Here is ours, showing us
winning.

`npm run bench`, best of 30 rounds, every engine building one object per token
and returning the same number of them. flex-js and moo answer one token per
call, the way FLEX's `yylex()` does; chevrotain and peggy take the whole input
and loop inside. SQL, 491 KB and 123,000 tokens, MacBook Pro (M1 Max), macOS
26.6.2, Node 24.20.0. `plain` is `%option notyped`, and a row with no table mode
named is the one FLEX builds unasked. Three are worth reaching for, in bold:
`-Cfe` is the balance [A first scanner](#a-first-scanner) uses, `-Cf` is the
quickest that still reads UTF-8, and `-Cfe plain` is that balance without typed
arrays:

| scanner                     | time    | peak memory | raw    | minified | gzipped | dependencies |
| --------------------------- | ------- | ----------- | ------ | -------- | ------- | ------------ |
| **flex-js 2, `-Cf`**        | 6.6 ms  | ~110 MB     | 107 KB | 54 KB    | 3.2 KB  | none         |
| flex-js 2, `-7 -Cf`         | 6.6 ms  | ~110 MB     | 64 KB  | 29 KB    | 3.1 KB  | none         |
| **flex-js 2, `-Cfe`**       | 6.8 ms  | ~110 MB     | 33 KB  | 12 KB    | 2.7 KB  | none         |
| chevrotain 13.2.0           | 7.3 ms  | 108 MB      | 240 KB | 111 KB   | 30.5 KB | 5 packages   |
| flex-js 2, `-7 -Cf` plain   | 7.7 ms  | ~110 MB     | 64 KB  | 29 KB    | 3.1 KB  | none         |
| flex-js 2, `-Cf` plain      | 7.8 ms  | ~110 MB     | 107 KB | 54 KB    | 3.2 KB  | none         |
| flex-js 2                   | 8.0 ms  | ~110 MB     | 24 KB  | 7.5 KB   | 2.5 KB  | none         |
| **flex-js 2, `-Cfe` plain** | 8.1 ms  | ~110 MB     | 33 KB  | 12 KB    | 2.7 KB  | none         |
| flex-js 1.x                 | 8.9 ms  | 99 MB       | 37 KB  | 14 KB    | 4.8 KB  | none         |
| flex-js 2 plain             | 9.8 ms  | ~110 MB     | 24 KB  | 7.4 KB   | 2.5 KB  | none         |
| moo 0.5.3                   | 16.2 ms | 163 MB      | 18 KB  | 8.5 KB   | 3.2 KB  | none         |
| peggy 5.1.0                 | 51.2 ms | 168 MB      | 20 KB  | 6 KB     | 2.4 KB  | none         |

The sizes are the whole scanner for flex-js and peggy, grammar included, and the
library before your grammar for the rest. Minified with esbuild, gzipped with
`gzip -9`. `FLEX_JS_TABLES` picks the mode the benchmark generates with. The
corpus, the grammars and the harness are all in `benchmark/`, so the correct
response to the paragraph above is to go and disagree with it.

Time moves about half a millisecond between runs and peak memory about 15 MB, so
neighbouring rows say nothing about each other, whatever we would like them to
say. What the table does say is that typed tables are worth more than the choice
between the three full ones, and that compressed tables are slower than all of
them.

The other two grammars, same conditions, flex-js with `-Cf`:

| scanner     | expression rules | keywords as strings |
| ----------- | ---------------- | ------------------- |
| flex-js 2   | **2.3 ms**       | **2.7 ms**          |
| chevrotain  | 2.9 ms           | 3.1 ms              |
| flex-js 1.x | 3.2 ms           | 3.6 ms              |
| moo         | 5.8 ms           | 7.1 ms              |
| peggy       | 14.1 ms          | 16.9 ms             |

Without the option those read 2.7 ms and 3.0 ms, still ahead of chevrotain but
by less than the spread between runs.

### The table modes

| mode     | what it holds                             | against `-Cf`              |
| -------- | ----------------------------------------- | -------------------------- |
| `-Cf`    | a column per byte, 256 to cover UTF-8     | -                          |
| `-Cfe`   | a column per equivalence class, 32 here   | a third, within noise      |
| `-7 -Cf` | ASCII only, and refuses anything above it | half, no UTF-8             |
| none     | compressed, what FLEX builds unasked      | smallest, a quarter slower |

Typed arrays are what the rows without `plain` above use, and they are the
default. They hold the tables as numbers of one width rather than as arrays of
them, and a full table as one run rather than a row per state. Nothing about the
scanning or the size changes. `%option notyped` gives plain arrays back, for an
engine without `Int16Array`.

Every row already leaves the text of a match unbuilt where the rule that matched
reads none of it - a rule whose action is empty. That asks for no option, and is
worth 3 to 10 percent on its own.

With a parser rather than objects, the gap opens: with
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
