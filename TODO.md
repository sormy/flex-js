# TODO

## Performance

- Extend the character class tables past one class and one repeated class, so
  `[0-9]+\.[0-9]+` and the like also stay out of the regex engine.
- Skip building the token text for a rule with no action, measured 5.51ms ->
  5.26ms. Nothing can read it before the next scan overwrites it, but FLEX sets
  `yytext` for every match, so the two disagree where it cannot be observed.
- Closing the last fifth against chevrotain needs compiled rules rather than
  tuning. It takes the first rule that matches and stops, where longest match
  has to try every rule that could start at the position.

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

## Robustness

- `addState()` and `addDefinition()` silently reconfigure a name already
  declared, where FLEX reports a redeclaration. `clear()` re-adds `INITIAL`, so
  refusing outright needs care.
- Options set after rules are added do not reach them, `setIgnoreCase()` most
  visibly. Refuse them once a rule exists, or apply them to what is already
  there.
- `input()` takes a negative count and `unput()` a non-string, where
  `setSource()` and `less()` now refuse both.

## Project hygiene

- The script-tag wrapper's body is left un-indented, so wrapping the file did
  not rewrite the blame of 1300 lines. Indenting it would let the editor format
  JavaScript on save: a formatter changes 2226 lines while it stays flat and
  100 once the wrapper is discounted.
- `repository` is a string npm rewrites to an object on publish.
- Past ES5 the source needs a build step, at which point the hand-written
  wrapper becomes bundler output and `main`, `module` and `exports` want setting.
