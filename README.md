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
| Windows  | x86_64, arm64 | ships GNU M4 beside it, since flex needs one                 |

Generated scanners run anywhere; only the generator is platform-specific, and
only at build time.

On Windows, `flex-js` runs m4 itself rather than letting flex fork it, and the
m4 it runs is shipped in `dist/`. Nothing to install; `M4` names a different one
if you would rather. Same scanner either way.

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
npx flex-js --emit=javascript --header-file=tokens.d.ts -o tokens.js tokens.l
```

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
and having to return the same number of them. Each is driven the way its own
interface allows: flex-js and moo answer one token per call, the way FLEX's
`yylex()` does, and chevrotain and peggy take the whole input and loop inside.
What each does to take on an input is timed with it, which for flex-js includes
one pass to see whether the input holds anything above ASCII - 0.3 ms of the 7.4
below. SQL, 491 KB and 123,000 tokens, on a MacBook Pro (M1 Max), macOS 26.6.2,
Node 24.20.0:

| scanner                   | time       | peak memory | raw       | minified   | gzipped    | dependencies |
| ------------------------- | ---------- | ----------- | --------- | ---------- | ---------- | ------------ |
| flex-js 2, `-Cf`          | 7.4 ms     | ~100 MB     | 106 KB    | 54 KB      | 3.0 KB     | **none**     |
| flex-js 2, `-7 -Cf`       | 7.7 ms     | ~100 MB     | 63 KB     | 29 KB      | 3.0 KB     | **none**     |
| flex-js 2, `-Cfe`         | 7.8 ms     | ~100 MB     | 32 KB     | 12 KB      | 2.6 KB     | **none**     |
| flex-js 2, default tables | 9.4 ms     | ~100 MB     | **23 KB** | **7.1 KB** | **2.4 KB** | **none**     |
| chevrotain 13.2.0         | **7.3 ms** | 106 MB      | 240 KB    | 111 KB     | 30.5 KB    | 5 packages   |
| flex-js 1.x               | 8.6 ms     | ~100 MB     | 37 KB     | 14 KB      | 4.8 KB     | none         |
| moo 0.5.3                 | 15.6 ms    | 161 MB      | 18 KB     | 8.5 KB     | 3.2 KB     | none         |
| peggy 5.1.0               | 50.2 ms    | 164 MB      | 20 KB     | 6 KB       | 2.4 KB     | none         |

The size columns differ in kind: for flex-js and peggy they are the whole
scanner, grammar included; for the rest, the library before your grammar.
Minified with esbuild, gzipped with `gzip -9`. `FLEX_JS_TABLES` picks the table
mode the benchmark generates with.

Peak memory moves about 15 MB between runs, since it depends on when the
collector wakes; it separates these engines but says nothing about which table
mode a scanner was built with. Time moves about half a millisecond, so the three
full-table rows say nothing about each other either - only that the compressed
default is slower than all three.

Speed on the other two grammars, same conditions:

| scanner     | expression rules | keywords as strings |
| ----------- | ---------------- | ------------------- |
| flex-js 2   | **2.6 ms**       | 3.2 ms              |
| chevrotain  | 2.7 ms           | **2.9 ms**          |
| flex-js 1.x | 3.0 ms           | 3.4 ms              |
| moo         | 5.6 ms           | 6.7 ms              |
| peggy       | 13.2 ms          | 16.6 ms             |

Ahead of chevrotain on one of the three, about a tenth behind on the others,
under it on memory, a tenth of the bytes over the wire, no dependencies - while
doing more work, since chevrotain stops at the first rule that matches and this
takes the longest.

`-Cf` is the full transition table FLEX's manual asks for when speed is the
point. It holds a column per byte, and covering UTF-8 means 256 of them, which
is most of that 54 KB. `-Cfe` keeps the full table but indexes it by equivalence
class, so bytes no rule tells apart share a column - 32 of them for this
grammar - which is four times smaller and no slower. The default tables compress
further again and cost about a quarter more.

`%option 7bit` halves a full table by dropping the bytes above ASCII. It buys
size rather than speed - a narrower table is no quicker to read - and rules
UTF-8 out; `-Cfe` gets smaller than that without giving up either, which is the
reason to reach for it first.

The gap opens when the scanner feeds a parser instead of building objects: with
[lemon-js](https://github.com/sormy/lemon-js), the 103 TPC-DS queries parse from
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

flex's: BSD with the Berkeley clause, see [LICENSE](LICENSE). Generated scanners
carry no requirement of their own.
