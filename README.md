# FLEX.JS

> Lexing was solved in 1987. This is not a library that imitates flex, it is
> flex, taught to write JavaScript.

A back end for [flex](https://github.com/westes/flex). Give it a grammar file,
get a scanner in JavaScript or TypeScript with no dependencies.

- longest match wins, so `>=` beats `>` whichever order you wrote them in
- start conditions, `REJECT`, `yymore`, `yyless`, trailing context, `<<EOF>>`
- reads UTF-8, from a string, a `Buffer` or a `Uint8Array`
- a `.d.ts` beside JavaScript output with `--header-file`, or emit TypeScript
  directly

## Installing

```sh
npm install --save-dev flex-js
```

That brings a prebuilt generator:

| platform | architectures | what ships                                                   |
| -------- | ------------- | ------------------------------------------------------------ |
| macOS    | x86_64, arm64 | one universal binary, back to 10.13                          |
| Linux    | x86_64, arm64 | statically linked against musl, so no glibc version to match |
| Windows  | x86_64, arm64 | no MSYS2 or Cygwin needed                                    |

Generated scanners run anywhere; only the generator is platform-specific, and
only at build time.

flex needs m4 to write a scanner, and every generator has one linked in, so
there is nothing to install and nothing to find on the PATH. It writes the same
scanner on every platform.

## A first scanner

Write a grammar, `tokens.l`:

```
%option noyywrap typed-tables
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

Those two are what to reach for unless you know otherwise: `-Cfe` is within
noise of the quickest table mode at under a third of its size, and
`%option typed-tables` is worth a seventh to a fifth more. It needs typed
arrays, so leave it out for an engine older than about 2011. Both are measured
under [Performance](#performance).

`--header-file` is flex's own, the way a `.c` gets a `.h`; without it only
`tokens.js` is written.

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

`lex()` answers `0` at the end of the input.

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

For comments, strings, and anything else with a mode:

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

`yy` is the caller's, and every rule body can reach it:

```js
var scanner = new Scanner(source);
scanner.yy = { words: [] };
scanner.lex();
```

```
[a-z]+    { yy.words.push(yytext); }
```

## Unicode

Rules are about UTF-8 bytes, so a rule written with a character matches it:

```
"日本"     return { kind: 'japan' };
"café"     return { kind: 'cafe' };
```

`.` matches one byte, as in a C scanner. To match whole characters, name their
shape:

```
UTF8    [\x20-\x7f]|[\xc2-\xdf][\x80-\xbf]|[\xe0-\xef][\x80-\xbf]{2}|[\xf0-\xf4][\x80-\xbf]{3}
```

`yytext` is text, not bytes. `yyleng` is `yytext.length`, so an emoji counts as
two, as it does everywhere in JavaScript.

## Performance

`npm run bench`, best of 30 rounds, every engine building one object per token
and returning the same number of them. flex-js and moo answer one token per
call, the way FLEX's `yylex()` does; chevrotain and peggy take the whole input
and loop inside. SQL, 491 KB and 123,000 tokens, MacBook Pro (M1 Max), macOS
26.6.2, Node 24.20.0. `typed` is `%option typed-tables`, and a row with no table
mode named is the one FLEX builds unasked. In bold is the pairing
[A first scanner](#a-first-scanner) reaches for, quickest within noise at under
a third of the size:

| scanner                     | time       | peak memory | raw       | minified  | gzipped    | dependencies |
| --------------------------- | ---------- | ----------- | --------- | --------- | ---------- | ------------ |
| flex-js 2, `-Cf` typed      | 6.6 ms     | ~110 MB     | 107 KB    | 54 KB     | 3.2 KB     | none         |
| flex-js 2, `-7 -Cf` typed   | 6.6 ms     | ~110 MB     | 64 KB     | 29 KB     | 3.1 KB     | none         |
| **flex-js 2, `-Cfe` typed** | **6.8 ms** | ~110 MB     | **33 KB** | **12 KB** | **2.7 KB** | none         |
| chevrotain 13.2.0           | 7.3 ms     | 108 MB      | 240 KB    | 111 KB    | 30.5 KB    | 5 packages   |
| flex-js 2, `-7 -Cf`         | 7.7 ms     | ~110 MB     | 64 KB     | 29 KB     | 3.1 KB     | none         |
| flex-js 2, `-Cf`            | 7.8 ms     | ~110 MB     | 107 KB    | 54 KB     | 3.2 KB     | none         |
| flex-js 2 typed             | 8.0 ms     | ~110 MB     | 24 KB     | 7.5 KB    | 2.5 KB     | none         |
| flex-js 2, `-Cfe`           | 8.1 ms     | ~110 MB     | 33 KB     | 12 KB     | 2.7 KB     | none         |
| flex-js 1.x                 | 8.9 ms     | 99 MB       | 37 KB     | 14 KB     | 4.8 KB     | none         |
| flex-js 2                   | 9.8 ms     | ~110 MB     | 24 KB     | 7.4 KB    | 2.5 KB     | none         |
| moo 0.5.3                   | 16.2 ms    | 163 MB      | 18 KB     | 8.5 KB    | 3.2 KB     | none         |
| peggy 5.1.0                 | 51.2 ms    | 168 MB      | 20 KB     | 6 KB      | 2.4 KB     | none         |

The sizes are the whole scanner for flex-js and peggy, grammar included, and the
library before your grammar for the rest. Minified with esbuild, gzipped with
`gzip -9`. `FLEX_JS_TABLES` picks the mode the benchmark generates with.

Time moves about half a millisecond between runs and peak memory about 15 MB, so
neighbouring rows say nothing about each other. What the table does say is that
typed tables are worth more than the choice between the three full ones, and
that compressed tables are slower than all of them.

The other two grammars, same conditions, flex-js with `-Cf` and
`%option typed-tables`:

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

`%option typed-tables` is what the `typed` rows above ask for. It holds the
tables as numbers of one width rather than as arrays of them, and a full table
as one run rather than a row per state. Nothing about the scanning or the size
changes. It needs typed arrays, which are ES2015 where the rest of a generated
scanner is ES5.

Every row already leaves the text of a match unbuilt where the rule that matched
reads none of it - a rule whose action is empty. That asks for no option, and is
worth 3 to 10 percent on its own.

With a parser rather than objects, the gap opens: with
[lemon-js](https://github.com/sormy/lemon-js) the 103 TPC-DS queries parse from
text in 2.8 ms against chevrotain's 9.2 ms.

## Documentation

- [The grammar file](docs/grammar.md) - sections, patterns, options
- [The generated scanner](docs/scanner.md) - what it offers and what rules can
  call
- [Differences from FLEX](docs/differences.md) - the short list
- [Building from source](docs/building.md) - and how the back end works

The [FLEX manual](https://westes.github.io/flex/manual/) applies, except for
what [differences.md](docs/differences.md) lists.

## Upgrading from 1.x

1.x was a library with `addRule`. 2.x is flex, so rules live in a grammar file.
The old line is on the
[`1.x` branch](https://github.com/sormy/flex-js/tree/1.x);
`npm install flex-js@1` still installs it.

## License

This repository is flex's: BSD with the Berkeley clause, see [LICENSE](LICENSE).
Generated scanners carry no requirement of their own.

The prebuilt generators in `dist/` have GNU M4 linked in, so those binaries are
GPL-3.0-or-later as wholes - see [LICENSE.m4](LICENSE.m4). That reaches the
generator, not the scanners it writes.
