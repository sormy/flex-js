# Building from source, and how it works

## What this is

flex already emits C99, C++ and Go from skeletons, reaching its output through
m4 hooks. flex-js is two more skeletons plus the lines that register them.

```
skeleton/js-flex.skl    the JavaScript back end
skeleton/ts-flex.skl    the TypeScript one, the same scanner with types
patches/flex/0001, 0002 fixes for flex itself, written against a pristine
                        checkout so they can go upstream unchanged
patches/flex/0003       registers both back ends with flex
patches/m4/             lets m4 be called as a function
```

### Writing a patch back out

`build/flex` is a checkout with the patches applied on top, so editing a file
there and running `build.sh` tries what the edit does. Writing it back out is
where it goes wrong, because `git diff` compares against the index, and after
`build.sh` the index holds the pristine checkout - so the diff carries 0001 and
0002 as well, and the stack no longer applies to itself.

Give the diff the baseline it needs:

```sh
cd build/flex
git stash            # keep the edit
git checkout -- . && git clean -fd
git apply ../../patches/flex/0001-*.patch ../../patches/flex/0002-*.patch
git add -A           # the index is now pristine plus the flex fixes
git stash pop        # the edit comes back on top
git add -N .
git diff > ../../patches/flex/0003-js-backends-and-in-process-m4.patch
```

Then take `build/flex/.patches` away and run `build.sh`: it re-extracts and
applies all three, which is the only proof the stack still stands.

A fix to flex itself belongs in 0001 or 0002 rather than 0003, written against
the pristine checkout so it can go upstream as it stands.

The flex patch registers the back ends in `src/skeletons.c` and
`src/Makefile.am`, and teaches `src/main.c` what a back end has to be able to
say about itself - the character set its tables cover, whether it has a
fast-scanner matcher, whether the tables ended up 7-bit. It also replaces
`src/filter.c`, which is where flex forks m4; see "Running m4" below.

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
./build.sh          # fetch flex and m4, apply the patches, build them
./build.sh --clean  # start over
npm test            # the test suite, against what was just built
```

Fetches flex at a pinned commit from
[github.com/westes/flex](https://github.com/westes/flex) and m4 1.4.19 from
ftp.gnu.org, pinned by digest. Needs git, curl, patch, autoconf, automake,
libtool, bison, m4 and gettext, whose autopoint the bootstrap runs. m4 is built
first, since flex links against it. The generator lands at
`build/flex/src/flex`, which `FLEX_JS` points at.

## Running m4

flex reaches its output through m4, and upstream runs it as the middle link of a
chain of three forked filters: `filter_tee_header`, then `m4 -P`, then
`filter_fix_linedirs`. Windows has no `fork`, so that chain cannot run there at
all.

m4 is linked in instead and called as a function, on every platform. The patch
in `patches/m4/` gives `main_m4` an input buffer and an output buffer, since
mingw has no `open_memstream`, `fmemopen` or `fopencookie` to make a
memory-backed `FILE *` out of. Three things that patch has to get right:

- diversion 0 is the caller's result, so it is a buffer from the outset and is
  never the one flushed to a temporary file when m4 runs short of memory. What
  is flushed instead has to be a diversion still held in memory: m4 only ruled
  out an already-flushed one by where its search started, which exempting
  diversion 0 moved
- the file-scope state m4 leaves behind has to be reset, or a second call reuses
  a freed pointer and parses no options at all
- `m4exit` has to hand control back rather than end the process, which is what
  the header branch of `js-flex.skl` calls to stop reading the skeleton

flex writes the m4 source to a scratch file under `TMPDIR` and reads it back,
since its output goes through `stdout` and there are 20-odd places that write
there. Everything after that is in memory. `--header-file` expands the same
source a second time with `M4_YY_IN_HEADER` set, which is the second forked
pipeline upstream builds and the second call to `main_m4` here.

Linking the two together needed one collision settled: gnulib's `xstrdup` and
flex's are the same function, so flex's is dropped in favour of the one m4
brings. `--preproc=NUM` is gone, since it chose how many filters to fork.

## Building what is shipped

```sh
./build-dist.sh
```

| platform | compiler     | notes                                                       |
| -------- | ------------ | ----------------------------------------------------------- |
| macOS    | system clang | two slices joined with `lipo`, so arm64 keeps its signature |
| Linux    | `zig cc`     | static against musl                                         |
| Windows  | `zig cc`     | needs `compat/win32/`                                       |

m4 is cross-built for each target and linked into that target's generator, so
`bin/cli.js` only has to pick a binary for the platform it runs on.

Windows lacks the byte-swapping macros, which `compat/win32/` stands in for, and
`__mempcpy_chk`, which it defines. It has no POSIX regex either; flex wants one
to renumber line directives, and gets gnulib's out of m4 rather than a stub that
never matches, which is what it used to have.

After building, each binary generates the same grammar and its output is
compared against the host's, natively, in a Linux container through finch, and
under Wine. `--no-smoke` skips it, `--smoke-only` runs it against what is
already in `dist/`.

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
test/cli.test.js           what flex writes beside a scanner, through the shim
test/examples.test.js      the grammars under examples/
test/skeletons.test.js     the two skeletons saying the same thing
test/differential.test.js  the same grammar through both back ends
```

The last one matters most: the same rules through both back ends, traces
required to be identical, across a few hundred generated strings. Needs a C
compiler; skips itself without one.
