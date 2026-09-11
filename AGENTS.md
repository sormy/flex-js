# Working on flex-js

flex-js is a back end for [flex](https://github.com/westes/flex): two skeletons
and a small patch that registers them. Read [docs/building.md](docs/building.md)
first.

## The rules that matter here

**Match flex.** When the C skeleton does something a particular way, do the same
thing rather than a better idea. The C back end is the specification, and a
divergence is a bug unless it is written down in
[docs/differences.md](docs/differences.md) with the reason.

**Prove it against C.** `test/differential.test.js` generates a C scanner and a
JavaScript scanner from the same rules and requires identical traces. Every
behaviour change adds a case there. Bugs found later mean the case was missing,
so add it before fixing.

**Two skeletons, no generator.** `js-flex.skl` and `ts-flex.skl` are both
written by hand. `test/skeletons.test.js` strips the types and compares them, so
they cannot drift; what each back end owns is fenced with
`%# BACKEND-DIVERGENCE`.

**Keep flex's names.** `BEGIN`, `ECHO`, `REJECT`, `YY_START`, `yytext`,
`yyless`. A grammar written for flex should work here. Where JavaScript forces a
change, it is a documented one, not a rename.

**Generated output is ES5** in an IIFE, `'use strict'`, no dependencies, loading
under Node, a bundler or a `<script>` tag. The TypeScript output type-checks
under `--strict` and must not need `@types/node`: say `Uint8Array`, not
`Buffer`.

## Numbers

Anything published is measured, reproducible, and stated on every axis: time,
peak memory, bytes raw, minified and gzipped, and dependencies. Note the machine
and the Node version. Benchmark dependencies are pinned exactly.

Re-measure rather than trusting a figure in a file, including one written here
last week. If a published number does not reproduce, fix the number.

## Prose

Comments say why, in less space than the code they sit above. Rationale and
history go in `docs/`, never inline. Documentation is scannable: tables and
short sentences, no narration, and each thing said once.

## Releases

`./build.sh` builds the generator; `./build-dist.sh` cross-compiles what ships
and then runs it against the host's output, natively, in a Linux container and
under Wine. Every platform has to answer for itself on one architecture; the
other is the same source through the same compiler, and rides on that. A
platform none of whose binaries ran is not shipped.

`1.x` holds the old library. `master` is 2.x. Versions are tags.

## Commits

Nothing about how the work was produced belongs in a commit message, a tag, a
branch name, or a file. No tool attribution, no session links, no co-author
trailers.
