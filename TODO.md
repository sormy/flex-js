# TODO

## Performance

- Extend the fixed-width early exit to expressions of a known width.
- Fast path for rules matching exactly one character, measured 5.6ms -> 5.2ms.
  Sound only for candidates from an ASCII `byCharCode` bucket, since `nonAscii`
  promises no membership; needs a per-rule character set to re-check.
- Beating chevrotain needs compiled rules rather than tuning. It stays out of
  the regex engine for simple patterns; a hand-written scanner using this
  strategy costs 2.9ms against its 3.3ms, where flex-js is near 5.1ms, 1.25ms
  of which is the per-token action call the API exists for.

## Missing features

- Trailing context beyond a primitive `$`.
- `$` at the end of a pattern compiles to `(?=\n)` and counts one character of
  trailing width; anywhere else, `/(a$)/` for one, it stays a plain JavaScript
  anchor that also matches at the end of the input and adds no width. Rewriting
  every `$` means telling a real anchor from one inside a character class or
  behind a backslash.
- Multiple input buffers with a stack, FLEX's `yypush_buffer_state`. `restart()`
  already swaps the input; this needs the suspended buffer's source and index.
- Warn about a rule that can never match, as FLEX does. Two rules with the same
  expression are accepted and the second is silently dead.
- Translate POSIX character classes, `[[:alpha:]]` and friends, while compiling.
- TypeScript declarations (`index.d.ts`) and a `types` field.

## Project hygiene

- eslint ignores `*.test.js`. Turning it on reports 21 problems: unread echo
  collectors, unused callback parameters and one needless escape.
- The script-tag wrapper's body is left un-indented, so wrapping the file did
  not rewrite the blame of 1300 lines. Indenting it would let the editor format
  JavaScript on save: a formatter changes 2226 lines while it stays flat and
  100 once the wrapper is discounted.
- Past ES5 the source needs a build step, at which point the hand-written
  wrapper becomes bundler output and `main`, `module` and `exports` want setting.
