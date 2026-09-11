# Differences from FLEX

A grammar written for FLEX works here once its rule bodies are JavaScript. What
follows is everything else.

## Three names take parentheses

C expands `ECHO`, `REJECT` and `YY_START` with its preprocessor, and JavaScript
has none, so they are functions:

| FLEX       | here         |
| ---------- | ------------ |
| `ECHO;`    | `ECHO();`    |
| `REJECT;`  | `REJECT();`  |
| `YY_START` | `YY_START()` |

`yyterminate()`, `yyless(n)`, `yymore()`, `unput()`, `input()` and `BEGIN()` are
written exactly as they are in FLEX.

## The input is held, not read

No `yyin`, no file reading, no interactive mode. A scanner is handed a string, a
`Buffer` or a `Uint8Array`. `yy_scan_string`, `restart`, `yypush_buffer_state`
and `yypop_buffer_state` are the whole of it.

`%option interactive` and `-I` are accepted and change nothing. They tell a C
scanner to stop reading at each character rather than filling a buffer, which is
the whole of what they are for; the input is already here. The same tokens come
out either way.

Streams are not accepted. A synchronous refill, the way C's `YY_INPUT` works,
would fit; an asynchronous one would make `lex()` asynchronous and every rule
body with it. Collect the stream first, or feed the next piece from `yywrap()`.

`ECHO` writes to `yyout`, which is stdout under Node unless the caller sets it,
and nowhere in a browser.

## Every scanner is its own

A scanner is an object: no globals, nothing to declare reentrant. The scan is a
method on it, so its name is fixed. `%option reentrant`, `bison-bridge`,
`bison-locations` and `yydecl` have nothing to add, so asking for them is an
error rather than an option quietly dropped. `--header-file` writes the
scanner's TypeScript declarations, which is the one header there is to write;
TypeScript output describes itself and refuses one. `-P` names the scanner, so
it is an error to give it something a binding cannot be called.

## UTF-8

Rules are about UTF-8 bytes, so a rule written with a character matches it. `.`
and a negated class match one **byte**; name the shape for whole characters:

```
UTF8    [\x20-\x7f]|[\xc2-\xdf][\x80-\xbf]|[\xe0-\xef][\x80-\xbf]{2}|[\xf0-\xf4][\x80-\xbf]{3}
```

`yytext` is text; `yyleng` is `yytext.length`, so an emoji counts as two.
`yyless(n)` keeps n characters for the same reason, where the C scanner keeps n
bytes. `yy_c_buf_p` is a byte offset. ASCII input is neither encoded nor
decoded.

A rule that matches part of a character, `.` over a multibyte one, gets back
what that byte alone decodes to. The C scanner hands back the byte itself. Match
whole characters and the question does not arise.

## What a rule body sees after unput and input

`unput()` empties `yytext` and `yyleng`; the C scanner leaves them describing
the buffer it just shifted, which is text the rule no longer matched. Read
`yytext` before putting anything back.

`yyless(n)` with n past the end of the match keeps the whole match and no more;
FLEX faults, reporting "end of buffer missed".

`yyless()` after `unput()` in the same rule body reads a position the give-back
moved, and answers differently here. FLEX either faults on it, reporting "end of
buffer missed", or reads a byte twice, so neither says what it should mean. Do
one or the other in a rule, not both.

`input()` hands back the byte itself for anything that cannot begin a character,
which is what C does, where `yytext` would show U+FFFD for the same byte. It
answers `''` at the end of the input. The C scanner asks `yywrap()` first and
reads on if it supplies more, so a rule body that consumes with `input()` stops
at the end of each piece here rather than running through them.

## Scanning another string

`yy_scan_string(text)` puts that text in front of the scanner, where C makes a
buffer and hands it back to be pushed. `yypush_buffer_state(text)` takes the
text itself for the same reason, so C's `yypush_buffer_state(yy_scan_string(s))`
is `yypush_buffer_state(s)` here.

## Popping input that was never pushed

`yypop_buffer_state()` answers whether there was anything to go back to, and
does nothing when there was not. C's returns nothing and reads past the bottom
of its stack.

## Popping a start condition that was never pushed

`yy_pop_state()` reports the underflow through `yy_fatal_error`, which throws
out of `lex()`; C reports it through its own panic, which exits the process.
Neither goes on to change the start condition.

## yylineno inside a rule body

`yylineno` can be read in a rule body but not set there: the scanner reads its
own count back at every match, so an assignment is overwritten before the next
rule sees it. Set `yylineno` on the scanner instead, which lasts.

## What %option debug traces

Every rule the scanner accepts is traced the way C traces it, and so is the end
of the input. C also reports each time it refills its buffer, as
`--(end of buffer or a NUL)`; the input is one string here, so there is no
refill to report.

## Table modes

Every `-C` combination is implemented: the compressed tables FLEX builds by
default, the full table `-Cf` gives, and `-Ce`, `-Cm`, `-Ca` and `-Cr` in any
mixture. `-Cfe` is worth knowing about - a full table indexed by equivalence
class, nearly as quick as `-Cf` and a fraction of the size.

The fast-scanner tables, `-F` and `-CF`, are pointer arithmetic over transition
records, which has no counterpart here; asking for them is an error rather than
a scanner that does not work.

`%option 7bit` is honoured rather than ignored. It halves the width of a full
table, and a scanner built that way refuses input holding anything above ASCII
instead of reading past the end of a row the way C does. `-Cfe` is smaller still
and keeps UTF-8, so reach for 7bit only to halve a full table for input that can
never be anything but ASCII - it is no quicker than the 8-bit one.

## Platforms

Prebuilt generators are shipped for macOS, Linux and Windows, on x86_64 and
arm64. Nothing about a generated scanner is platform-specific.

flex reaches its output through m4, which upstream forks. Windows cannot fork,
so every generator has m4 linked into it and calls it in its own process
instead, on every platform alike. The output is byte for byte what a forked m4
produces, and there is no m4 to find on the PATH or install. `docs/building.md`
says how.
