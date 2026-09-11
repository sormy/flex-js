# Worth doing, and worth not doing

Numbers here are the SQL grammar from `benchmark/`, 491 KB and 123,000 tokens,
`-Cf` unless another mode is named, best of a run interleaved against the
scanner it is being compared with. `npm run bench` is the same corpus.

## Speed

**Declare a helper only where a rule could call it.** Measured **-2.8%**: 8.03
ms against 7.80. `lex()` declares thirteen closures - `unput`, `input`, `ECHO`,
`BEGIN`, `YY_START`, `YY_AT_BOL`, `yy_less_to`, `yymore`, `yy_take_input`,
`yy_take_buffer`, `yypush_buffer_state`, `yypop_buffer_state`,
`yy_scan_string` - and does it once per returned token, whether or not a rule
mentions any of them. FLEX already leaves two of them out when it knows better:
`%option nounput` and `noinput` reach the skeleton as `M4_YY_NO_YYUNPUT` and
`M4_MODE_NO_YYINPUT`. The other eleven have no flag.

Reading the action text for each name is sound here in a way it would not be
elsewhere: the closures live inside `lex()`, so an action body and the code
`%option pre-action` and `post-action` inject are the only things that can name
them - a function in the prologue cannot see `ECHO`. A name inside a string
costs a closure that was not needed, and a name that is missed is a
`ReferenceError` when the rule fires rather than a quietly wrong answer.

**Moving them onto the prototype instead is the other way, and may well be
slower.** They close over `yy_cp`, `yy_bp`, `yytext` - what the matcher reads
per character. Losing one dependent load per character was worth a seventh when
the tables were flattened; adding a property read per character could cost more
than the thirteen allocations do. Measure it before writing it.

**One m4 run for both the scanner and the declarations.** Measured **+3.1 ms**
of 18.6. `--header-file` expands the whole source a second time, where the
forked chain ran two m4 processes at once. Generation is already 54-72% quicker
for not forking, so this is handing a little of that back rather than a
regression - and handing one run two sinks is not a small change.

## Reach

**An incremental lexer.** What an editor wants: keep the tokens from last time
and, on an edit, re-lex only from the last token boundary before it until the
scanner's state matches the state it had at that point before, then reuse the
rest. CodeMirror, TextMate grammars and tree-sitter all work this way.

A generated scanner is closer to this than a hand-written one, because between
tokens its whole state is a few plain fields - `yy_c_buf_p`, `yy_start` (start
condition and beginning-of-line in one), `yy_at_bol_flag`, plus `yy_start_stack`
with `%option stack`, `yy_more_flag` and `yy_more_len` with `yymore()`, and
`yylineno` with that option. `yy_current_state` is a local, rebuilt from
`yy_start` on each call, so it is not carried at all. Saving those and putting
them back into a fresh scanner already resumes mid-stream correctly, including
inside an exclusive start condition; nothing in the generator needs to change
for it.

What is missing is not state but invalidation. To know which cached tokens an
edit destroys you need how far the matcher _read_ for each token, not where the
token ended: trailing context, `REJECT` and `yymore()` all let a match depend on
text past its own end. The scanner knows this - it is `yy_cp` at its high-water
mark, before the backup rewinds it to `yy_last_accepting_cpos` - and does not
say so.

So the split is: a snapshot-and-resume pair and that high-water mark belong
here, and are small; the token cache and the re-lex-until-it-agrees loop belong
in a library beside flex-js, not in a FLEX back end. The constraint to write
down first is that re-lexing replays actions, so a grammar that wants this has
to keep its actions replayable - which is why editors keep the lexer pure and
put the effects in the parser.

## Measured, and not worth doing

Kept so the afternoon is not spent twice.

| tried                                   | result                              |
| --------------------------------------- | ----------------------------------- |
| flat table as a plain array             | **+29%**                            |
| rows as typed arrays, shape unchanged   | **+2.2%**                           |
| scanning a `Uint8Array`, not the string | +6% alone, nothing with flat tables |
| `Int8` against `Int16` against `Int32`  | inside noise                        |

The first two together say what the win actually is: not the element type, and
not the flattening, but the two at once. A flat plain array is 108 KB of tagged
values where `Int16Array` is 27, and keeping the two-dimensional shape leaves
the dependent load that cost the time. `charCodeAt` over a one-byte string is
already a byte read, so converting to bytes first is paid for nothing.

## Defaults

`%option typed-tables` is off, and `-Cfe` is not asked for, though the README
names both as the best buy. Either as a default changes what every existing
grammar emits: typed tables move a scanner from ES5 to ES2015, and `-Cfe` is not
the table mode FLEX builds. Worth deciding rather than drifting into.

## Known, and left

**A rule cannot borrow the next rule's action with `|`.** FLEX 2.6.4 quotes a
continued action unevenly and the generator stops with
`ERROR: end of file in string`; `--emit=c99` and `--emit=go` fail the same way,
so it is upstream's and not ours. Written up in `docs/differences.md`. It is an
ordering bug: `scan.l` writes the closing `]]` for a continued action before the
parser has reduced the rule, so `finish_rule` opens two quotes against one
close. When it is fixed, the switch naming the rules that read nothing needs a
continued rule handled: it looks like it reads nothing while its case arm falls
into the next rule's action, which does. No test can cover it while the grammar
will not build.

**`%option debug` traces an extra `--scanner backing up` with a full table.**
Only in `-Cf` and `-Cfe`: the matcher leaves its loop on the end of the input
with no rule chosen, so the backup arm runs where C, which stops on a sentinel,
has already accepted. The tokens are the same and the compressed modes trace the
same as C; only the trace differs, and `docs/differences.md` does not say so
yet.

**`--tables-file` and `--tables-verify` are not refused.** The skeletons have no
table loader, so a scanner built with either has empty tables and throws
`no action found` on the first token. Every other thing the back ends cannot do
is refused through `skel_property`; these two should be.

**The scratch file is reopened by name.** `open_m4_source` closes what `mkstemp`
opened and reopens the name, because `stdout` needs a read-and-write mode that
only `freopen` can give it. Anything that can write the temp directory can put
something else at that name in between. A temp directory of its own, made with
`mkdtemp`, would close the window; whether Windows has one to use wants checking
first.

**Windows can leave the scratch file behind on an error.** `atexit` handlers run
before C closes what is still open, and Windows keeps a name while a handle on
it is open, so `remove` fails on every path that does not close `stdout` itself.

**flex's own `xstrdup` is gone and gnulib's answers instead.** flex's called
`flexfatal`, which returns a status through flex's own path; gnulib's calls
`exit`. Nothing records that the deletion is only safe because m4's objects are
always linked in.

**`yy_fatal_error` is not obeyed everywhere it is called.** `yy_pop_state` and
`yy_less_to` return after calling it, as `docs/scanner.md` says a replacement
that returns requires; the three matcher arms that call it fall through instead,
which loops rather than leaving `lex()`.

**win32-arm64 ships unverified.** No wine on macOS loads an ARM64 PE - every
build of it is x86_64, and Rosetta translates the other way. The smoke test asks
rather than assumes, so it will check itself the day a capable one exists.
