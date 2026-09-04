# TODO

Issues found during a full review of `src/Lexer.js` (v1.0.5). Each item was
reproduced against the current code unless marked otherwise.

## Critical

- [x] **`<<EOF>>` rules crash on any non-empty input.** `scan()` reaches the
  non-EOF branch for every rule, including EOF rules, which store
  `expression: null` — `execRegExp()` then throws
  `TypeError: Cannot set properties of null (setting 'lastIndex')`.
  The feature is documented in README ("End-of-file rules", with a worked
  "unterminated quote" example) but is unusable, and no test covers it.

  ```javascript
  var lexer = new Lexer();
  lexer.addRule(/x/, function () { return 'X'; });
  lexer.addRule(Lexer.RULE_EOF, function () { /* never runs */ });
  lexer.setSource('x');
  lexer.lexAll(); // throws
  ```

  *Fixed by the rule-dispatch rewrite: EOF rules live in their own bucket and
  are never entered on the non-EOF path. The whole documented contract — plain
  termination, `restart()`/`unput()` refill, returning a token after a refill,
  `reject()` fall-through, and state-qualified rules — is covered by
  `src/eof.spec.js`.*

- [x] **An unqualified `<<EOF>>` rule outranked a state's own one.** Registering
  `addRule(Lexer.RULE_EOF, ...)` before `addStateRule('quote', Lexer.RULE_EOF, ...)`
  meant the general rule fired inside `quote`, contradicting both flex and the
  README ("applies to all start conditions which do not already have `<<EOF>>`
  actions"). Unqualified EOF rules are now sorted after qualified ones when the
  dispatch is built, so declaration order no longer decides.

- [x] **`more()` silently drops input.** `scan()` advances by `this.text.length`,
  but after `more()` `this.text` also holds the *previous* match, so the index
  over-advances and skips characters.

  ```javascript
  // rule /a/ calls more(), rule /b/ returns text, rule /./ returns OTHER
  lexer.setSource('abZ');
  lexer.lexAll(); // ["ab"] — the "Z" is gone
  ```

  Fixed by advancing the index with the newly matched text instead of the
  accumulated text. `reject()` needed the same treatment: it rewound by the
  accumulated length, which after `more()` restarted the scan before the
  continued rule and looped forever. The rewind now lives in `scan()`, where
  the match length is known, and restores the carried text so a rejected rule
  retries the same position with the `more()` prefix intact, as flex does.
  Covered by `src/more.spec.js`.

## Bugs

- [x] **`definitions` is an array used as a map** (`clear()`). A definition
  named `length` threw `RangeError: Invalid array length`. Now a bare map
  (`Object.create(null)`), so `length`, `constructor` and `__proto__` behave
  like any other name — a plain `{}` would still have swallowed `__proto__`.
- [x] **Definition substitution ignores case**, contradicting the documented
  "case sensitive" contract on `addDefinition()`. The `i` flag is gone from the
  placeholder regex. Name validation is also anchored now: `idRegExp` was
  unanchored, so `9foo` and `a.b` were accepted and the latter went on to be
  used as a pattern when substituting.
- [x] **Definitions referencing definitions only resolve in one direction.**
  Bodies are now expanded at registration time, as flex does, so a definition
  builds on the ones already registered; the existing rule-time pass still
  covers the reverse order. Both orders work, and a self reference or a cycle
  is left unexpanded rather than looping. Covered by `src/definitions.spec.js`.
- [x] **The BOL/EOL `+1` weight breaks longest-match.** `^` and `$` both added
  a character of weight. flex only counts trailing context: "for trailing
  context rules, this includes the length of the trailing part, even though it
  will then be returned to the input" — `$` is trailing context (one newline),
  `^` is a position and adds nothing. `^` now adds 0 and `$` still adds 1, so
  `/^ab/` no longer beats `/abc/` on `"abc"`. Detection of `$` also counts the
  backslashes before it, so a literal `\$` no longer earns the extra width.
  Covered by `src/matching.spec.js`.

## Robustness

- [x] `lex()` looped on `result === undefined && result !== Lexer.EOF`. Since
  `Lexer.EOF` is `0`, the second test could never be false once the first held.
  Removed, and the loop's real contract is covered: discarded matches are
  skipped, a falsy token such as `null` or `''` is returned rather than scanned
  past, and only `0` reads as EOF.
- [x] `reject()` subtracted `this.text.length`, which includes
  `more()`-accumulated text. Fixed and covered alongside `more()`.
- [x] `addState()` performs no name validation, unlike `addDefinition()`. It
  now rejects a non-string, a name that does not match `idRegExp`, and a name
  every object already carries, since state names also key `this.rules` and
  `this.dispatches`. `this.states` is a bare map too, which fixes a worse
  problem: `begin('toString')` used to find `Object.prototype.toString`, pass
  the "is not registered" guard and switch to a state with no rules at all,
  and `addStateRule('toString', ...)` failed with
  `this.rules[state].push is not a function` instead of a clear error.
  `this.rules` and `this.dispatches` stay plain objects; making them bare cost
  about 15% of scan throughput, and the name check keeps them safe.
- [ ] `echo()` writes straight to `process.stdout`, and `isNode` is decided by
  `typeof window === 'undefined'` in the constructor — wrong under bundlers,
  workers, and SSR. Make the output sink injectable (the tests already have to
  monkey-patch `echo` to observe it).
- [x] `.eslintrc.json` disables `no-redeclare` to accommodate two `var index`
  declarations in one scope in `addStateRule()`. The two loops that turned
  `this.states` into a list of names were doing the same work as
  `Object.keys()`, so they are gone rather than renamed: `STATE_ANY` reads the
  keys directly and the default case has its own `getInclusiveStateNames()`.
  The rule is on, and it was hiding a third duplicate, `var state`.

## Performance

- [x] **One regex exec per rule per token.** Replaced with a first-character
  dispatch table (`src/firstCharCodes.js`): every rule is analysed once for the
  characters it can start with, and a scan only tries the rules reachable from
  the current character. Longest-match semantics and rule declaration order are
  preserved — ties still resolve to the earliest rule.
- [x] `for...in` over rule arrays in the hot path, replaced with indexed loops.
- [x] `rejectedRules.indexOf()` ran for every rule on every scan; now skipped
  entirely while no rule is rejected (the overwhelmingly common case).
- [x] A rule given as a string is compared against the input directly rather
  than run through the expression engine, which is sound because the comparison
  checks the match itself instead of trusting the dispatch. `ignoreCase` is
  covered by holding both case forms; a literal with non-ascii characters falls
  back to the expression, since `i` is only plain ASCII folding for ASCII text.
  10% on a grammar whose keywords and punctuation are strings, neutral
  otherwise. Covered by `src/literal.spec.js`.
- [ ] Extend the same early-exit to expressions with a known fixed width.
- [x] Cut per-scan overhead: `scan()` replaced `exec()` with `test()`, which
  leaves the match end in `lastIndex` without building a match array, and the
  matched text is now cut once for the winning rule instead of once per rule
  that matched. `rejectedRules` is only replaced when a rule was actually
  rejected, rather than allocating an array on every scan. Together 6.8ms ->
  5.7ms, with GC falling from 9.4% of samples to 5.5%.
- [ ] Beating chevrotain needs a different architecture, not more tuning. A
  hand-written scanner using this very strategy — first-character dispatch,
  one sticky `test()` per candidate, `substring()` for the token — costs 2.9ms
  on the benchmark, against chevrotain's 3.3ms; replacing the regex for the
  single-character operator rule with a character-code check takes it to 2.5ms.
  So chevrotain runs at hand-written speed by not entering the regex engine for
  simple patterns. flex-js sits at 5.7ms, and 1.25ms of that is calling the
  rule action once per token, which is the whole point of the API and cannot be
  removed. Closing the rest means compiling rules rather than interpreting them.
- [ ] A fast path for rules matching exactly one character (skip the regex, the
  dispatch already narrowed by first character) measured 5.6ms -> 5.2ms. Left
  out: it is only sound when the candidate came from an ASCII `byCharCode`
  bucket, since the `nonAscii` bucket makes no membership promise, and
  `src/dispatch.spec.js` rejected the first attempt for exactly that reason. It
  needs a per-rule character set to re-check membership before it is safe.

Measured with `npm run bench`, best of 30 rounds (`node` 24):

| lexer                | time    | throughput |
| -------------------- | ------- | ---------- |
| flex-js (before)     | 42.2 ms |  6.2 MB/s  |
| flex-js (after)      |  5.7 ms | 45.6 MB/s  |
| moo 0.5.3            |  7.5 ms | 34.4 MB/s  |
| chevrotain 13.2.0    |  3.3 ms | 79.5 MB/s  |

7.4x faster than before, and a third faster than moo. Regex executions dropped
from ~832,000 to ~120,000 for the same input (1.15 per scan, against a floor of
1.0 for a single-regex lexer).

The rewrite was checked against the previous implementation by differential
fuzzing — 4,000 random grammar/input pairs per seed over six seeds, covering
states, `ignoreCase`, anchors, unicode, and the `more()`/`less()`/`begin()`
actions — with byte-identical output in every case. `src/dispatch.spec.js`
keeps a permanent version of that check by comparing against a reference
dispatch that offers every rule for every character.

## Missing features

- [ ] **Line and column tracking.** The biggest functional gap — it is what
  callers need to report errors, and every comparable library provides it.
  Already flagged as a TODO in the README.
- [ ] Trailing context beyond a primitive `$` (README TODO).
- [x] `$` also matched at the end of the input, where flex requires a real
  newline (`r$` is `r/\n`). A trailing `$` is now compiled to `(?=\n)`, so it
  needs a newline to follow and still does not consume it.
- [ ] TypeScript declarations (`index.d.ts`), and a `types` field.

## Test coverage

- [x] `src/eof.spec.js` covers the `<<EOF>>` contract end to end.
- [x] `src/api.spec.js` covers the state stack, inclusive/exclusive states,
  `STATE_ANY`, bulk rule registration, every action, the lifecycle methods and
  the rule validation errors — none of which had tests before.
- [x] `src/firstCharCodes.spec.js` and `src/dispatch.spec.js` cover the
  first-character analysis and its equivalence with an exhaustive scan.
- [x] `src/definitions.spec.js` covers name validation, reference expansion,
  case sensitivity and definitions built from other definitions.
- [x] `src/matching.spec.js` covers longest match, tie-breaking by declaration
  order, `^`, and `$` as trailing context.
- [x] `src/more.spec.js` covers `more()`, its interaction with `less()`,
  `reject()` and `unput()`, and `reject()` on its own.

## Project hygiene

- [ ] Dev dependencies are from 2018 (eslint 5, mocha 5); no CI workflow.
- [ ] No `files` field in `package.json`, so the whole repo is published.
