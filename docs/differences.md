# Differences from FLEX

A grammar written for FLEX works here once its rule bodies are JavaScript. What
follows is everything else.

## Going back to a buffer set aside

`yypush_buffer_state(text)` takes the text here, where C takes a buffer it made
with `yy_scan_string`. `yypop_buffer_state()` then goes back to what was set
aside, from a rule body or from outside the scanner.

C cannot do that from a rule body: it frees the buffer it is reading from and
carries on reading it, which crashes. So the differential suite cannot hold this
one to C, and `test/states.test.js` asserts what the scanner should do instead.

## The names FLEX writes as macros

C expands `ECHO`, `REJECT`, `YY_START` and `YY_AT_BOL` with its preprocessor,
and JavaScript has none, so they are functions in the generated scanner. A
grammar writes them the way FLEX writes them either way - FLEX hands the
spelling to the back end and the back end writes the call:

```
[a-z]+   ECHO;
"ab"     { REJECT; }
"s"      { return YY_START; }
```

`ECHO()`, `REJECT()` and `yyreject()` are accepted as well. What a name cannot
do is be passed around: `var f = ECHO;` holds a function rather than the value
C's macro would have given.

`BEGIN(sc)`, `yyless(n)`, `unput(text)`, `yymore()`, `input()` and
`yyterminate()` take arguments or take none in C as well, so they are written
exactly as they are in FLEX.

`REJECT` leaves the rule body by throwing, since C reaches the next rule with a
`goto` and JavaScript has nothing that leaves a function from the middle and
comes back. `yy_fatal_error` and `yyterminate()` go the same way. So a rule body
that wraps its own code in `try`/`catch` catches these too, and a `catch` that
does not rethrow turns a `REJECT` into the match it was refusing, with nothing
said. Catch what you meant to catch, or keep the `try` to the call that can
throw.

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

Rules are about characters: a rule written with one matches it, and so does `.`,
which [has a section of its own](#-is-one-character-not-one-byte).

`yytext` is text; `yyleng` is `yytext.length`, so an emoji counts as two.
`yyless(n)` keeps n characters for the same reason, where the C scanner keeps n
bytes. `yy_c_buf_p` is a byte offset. ASCII input is neither encoded nor
decoded.

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

A give-back longer than what has been read moves the whole input forward, and a
`yymore()` carry from the same rule body does not survive it: `yytext` is the
new match alone. FLEX reports only the last byte of that match, because the
give-back leaves the length it measures for the carry negative. Neither keeps
the carry, so do not put back more than the match holds and expect `yymore()` to
reach past it.

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

## Reading the top of an empty start-condition stack

`yy_top_state()` with nothing pushed answers the start condition in force. C
reads the slot below its stack, which is whatever happens to be there and a
crash where the stack was never allocated. Neither answer is useful; a rule that
asks whether it is nested has to keep count itself, or push once at the start.

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

## A match no rule reads is not built

A rule whose action is empty looks at nothing it matched, so the scanner does
not spend a string on it. FLEX names those rules in the generated switch and
`yytext` keeps whatever the rule before was handed - which the empty action
never reads. It is worth 3 to 10 percent, and needs no option.

Scanners that reach for the text behind an action's back keep the string every
time: `REJECT`, `yymore()`, tracking `^`, `%option debug`, and code a grammar
asks to run before or after every action with `%option pre-action` or
`post-action`.

C builds `yytext` unconditionally, which is only visible to a debugger stopped
inside an empty action.

## `.` is one character, not one byte

C's `.` matches a byte, and there that is coherent: `yytext` is a `char *`, so a
rule is handed bytes whatever it matched. Here `yytext` is a string, and half a
character is not one - it decodes to a replacement character and the byte is
gone. Everything else the scanner offers is already text: `yytext` is text,
`yyleng` counts its length. `.` was the one place bytes reached a rule.

Since flex is a machine over the 256 byte values, a C grammar that reads UTF-8
spells the shape of a character out for itself:

```
UTF8    [\x20-\x7f]|[\xc2-\xdf][\x80-\xbf]|\xe0[\xa0-\xbf][\x80-\xbf]|[\xe1-\xec][\x80-\xbf]{2}|\xed[\x80-\x9f][\x80-\xbf]|[\xee-\xef][\x80-\xbf]{2}|\xf0[\x90-\xbf][\x80-\xbf]{2}|[\xf1-\xf3][\x80-\xbf]{3}|\xf4[\x80-\x8f][\x80-\xbf]{2}
```

The lead byte decides which continuations may follow it, which is what keeps an
overlong encoding, half a surrogate pair and anything past U+10FFFF from being
one character. Here `.` compiles to that shape, so a grammar does not have to,
over every byte rather than from `\x20` up: NUL and the control bytes are
characters too, and `\n` is the only one `.` leaves out, as in C. The machine
underneath is the same one - bytes all the way down, which is how every fast
engine does Unicode - and only the pattern language changes. `test/differential`
holds it to that: the JavaScript scanner writes `.`, the C scanner writes
`{UTF8}`, and they have to agree token for token.

`.` stays the catch-all it is in C: where the bytes are not a character - a
stray continuation byte, a `\xff` - it matches one of them, since a whole
character is the longer match wherever there is one.

A 7-bit scanner refuses input above ASCII, and holds none of what it refused:
`restart()` keeps nothing and `unput()` gives nothing back, leaving `yytext` and
the cursor as they were. That matters where `yy_fatal_error` has been replaced
by one that returns, which `docs/scanner.md` allows - a byte above ASCII has no
column in a 128-wide table, so scanning it would not end. A give-back mixing
ASCII with such a byte is refused whole rather than in part.

`%option nounicode` asks for C's byte. `-7` has no byte above 127 to build a
character from, so there the byte is the character and the option means nothing.

## A start condition is a name, not a definition

C turns a start condition into a `#define`; here it becomes a binding in the
generated scanner, sharing a scope with the scanner's own. `yy` and `YY` are
FLEX's own namespace, so a start condition cannot take one - `%x YY_NL` left
`yylineno` stuck on 1 and stopped `^` matching after a newline. C takes that
grammar and leaves its compiler to warn, or not.

Every other name is a grammar's own business, as it is in C. One that JavaScript
keeps, or that the scanner reaches for, breaks the scanner - loudly for a
keyword, since the file will not parse; quietly for a name like `undefined`.

## An option of this back end's own

`%option typed` holds the tables as numbers of one width rather than as arrays
of them, and the full table as one run rather than a row per state, so the
matcher reaches an entry with a single indexed load. The width is the one FLEX
picked for the C table, `flex_int16_t` or `flex_int32_t`.

Nothing about the scanning changes, and neither does the size of what is
shipped. What changes is the floor a scanner runs on: it asks the engine for
`Int16Array`, which browsers have had since about 2011. `%option notyped` gives
plain arrays back.

## Platforms

Prebuilt generators are shipped for macOS, Linux and Windows, on x86_64 and
arm64. Nothing about a generated scanner is platform-specific.

flex reaches its output through m4, which upstream forks. Windows cannot fork,
so every generator has m4 linked into it and calls it in its own process
instead, on every platform alike. The output is byte for byte what a forked m4
produces, and there is no m4 to find on the PATH or install. `docs/building.md`
says how.
