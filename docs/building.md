# Building from source, and how it works

## What this is

flex already emits C99, C++ and Go from skeletons, reaching its output through
m4 hooks. flex-js is two more skeletons plus the lines that register them.

```
skeleton/js-flex.skl    the JavaScript back end
skeleton/ts-flex.skl    the TypeScript one, the same scanner with types
patches/                registers both back ends with flex
```

The patch touches four files: `src/skeletons.c` and `src/Makefile.am` to
register the back ends, `src/main.c` for what a back end has to be able to say
about itself - the character set its tables cover, whether it has a fast-scanner
matcher, whether the tables ended up 7-bit - and for saying where it wrote when
a wrapper is running m4, which `src/flexdef.h` declares.

Both skeletons are written by hand. `test/skeletons.test.js` strips the types
from the TypeScript one and compares it with the JavaScript one, so the matcher
cannot drift between them; what each back end owns is fenced with
`%# BACKEND-DIVERGENCE`. The declarations `--header-file` writes come from
`js-flex.skl`, which flex reads a second time with `M4_YY_IN_HEADER` set.

Nothing that runs is fenced. What is: the file header, the back end's name and
suffix, the declarations each writes, the `declare` lines that let TypeScript
read `Buffer` and `process`, and the `export`, which is `module.exports` in one
and `export default` in the other. Every other line is the same in both, which
is what the drift test checks.

## Building

```sh
./build.sh          # fetch flex, apply the patches, build it
./build.sh --clean  # start over
npm test            # the test suite, against what was just built
```

Fetches flex at a pinned commit from
[github.com/westes/flex](https://github.com/westes/flex). Needs git, autoconf,
automake, libtool, bison, m4 and gettext, whose autopoint the bootstrap runs.
The generator lands at `build/flex/src/flex`, which `FLEX_JS` points at.

## Building what is shipped

```sh
./build-dist.sh
```

| platform | compiler     | notes                                                       |
| -------- | ------------ | ----------------------------------------------------------- |
| macOS    | system clang | two slices joined with `lipo`, so arm64 keeps its signature |
| Linux    | `zig cc`     | static against musl                                         |
| Windows  | `zig cc`     | needs `compat/win32/`                                       |

`bin/cli.js` picks the binary for the platform it runs on. Windows also gets an
m4, since it has none: flex cannot write a scanner without one. `--no-m4` leaves
it out.

Windows lacks POSIX regex, `sys/wait.h` and the byte-swapping macros;
`compat/win32/` stands in. flex wants them for renumbering line directives and
forking m4, and does neither there. `FLEX_JS_M4_OUT` names a file for flex to
write what m4 reads, and `FLEX_JS_M4_ABOUT` one for it to say where the
expansion belongs; the shim runs m4 and the filters over that.
`FLEX_JS_PIPE_M4=1` takes that path anywhere, which is how it is tested.

After building, each binary generates the same grammar and its output is
compared against the host's, natively, in a Linux container through finch, and
under Wine, along with the m4 shipped for Windows. `--no-smoke` skips it,
`--smoke-only` runs it against what is already in `dist/`.

## Tests

```
test/matching.test.js      longest match, ties, the default rule
test/actions.test.js       yytext, yymore, yyless, unput, input, ECHO
test/states.test.js        start conditions, the stack, ^ and $, trailing context
test/reject.test.js        REJECT
test/lineno.test.js        yylineno
test/eof.test.js           <<EOF>> rules and yywrap
test/unicode.test.js       UTF-8
test/typescript.test.js    the TypeScript back end
test/cli.test.js           what bin/cli.js writes, and the m4-in-a-pipe path
test/examples.test.js      the grammars under examples/
test/skeletons.test.js     the two skeletons saying the same thing
test/differential.test.js  the same grammar through both back ends
```

The last one matters most: the same rules through both back ends, traces
required to be identical, across a few hundred generated strings. Needs a C
compiler; skips itself without one.
