# TODO

Issues found during a full review of `src/Lexer.js` (v1.0.5). Each item was
reproduced against the current code unless marked otherwise.

## Critical

- [ ] **`<<EOF>>` rules crash on any non-empty input.** `scan()` reaches the
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

  *Fixed incidentally by the rule-dispatch rewrite: EOF rules now live in
  their own bucket and are never entered on the non-EOF path.*

- [ ] **`more()` silently drops input.** `scan()` advances by `this.text.length`,
  but after `more()` `this.text` also holds the *previous* match, so the index
  over-advances and skips characters.

  ```javascript
  // rule /a/ calls more(), rule /b/ returns text, rule /./ returns OTHER
  lexer.setSource('abZ');
  lexer.lexAll(); // ["ab"] — the "Z" is gone
  ```

  Fix is `this.index += matchedValue.length`. The existing `#more()` test
  passes only by luck: its `more()` lands at end of input, where the overshoot
  runs off the end instead of eating a real character. Add a regression test
  with trailing input.

## Bugs

- [ ] **`definitions` is an array used as a map** (`clear()`). A definition
  named `length` throws `RangeError: Invalid array length`. Should be `{}`.
- [ ] **Definition substitution ignores case**, contradicting the documented
  "case sensitive" contract on `addDefinition()`. `compileRuleExpression()`
  builds the placeholder regex with the `ig` flags, so `{digit}` expands a
  definition registered as `DIGIT`. Drop the `i`.
- [ ] **Definitions referencing definitions only resolve in one direction.**
  Substitution loops over definitions in insertion order, so a definition whose
  body cites an *earlier* definition is left unexpanded: declaring `D` then
  `NUM = {D}+` compiles the rule to the literal `(?:{D}+)`; the reverse order
  works. Substitute repeatedly until stable, or expand definition bodies at
  registration time.
- [ ] **The BOL/EOL `+1` weight breaks longest-match.** Anchored rules get an
  artificial extra character of weight, so `/^ab/` beats `/abc/` on input
  `"abc"` where flex would pick `abc`. Either document this as a deliberate
  deviation or weigh anchors only to break exact ties.

## Robustness

- [ ] `lex()` loops on `result === undefined && result !== Lexer.EOF`; the
  second test can never be false. Dead condition.
- [ ] `reject()` subtracts `this.text.length`, which includes `more()`-accumulated
  text. The `more()` + `reject()` interaction is untested — verify and cover.
- [ ] `addState()` performs no name validation, unlike `addDefinition()`.
- [ ] `echo()` writes straight to `process.stdout`, and `isNode` is decided by
  `typeof window === 'undefined'` in the constructor — wrong under bundlers,
  workers, and SSR. Make the output sink injectable (the tests already have to
  monkey-patch `echo` to observe it).
- [ ] `.eslintrc.json` disables `no-redeclare` to accommodate two `var index`
  declarations in one scope in `addStateRule()`. Rename and re-enable the rule.

## Performance

- [x] **One regex exec per rule per token.** Replaced with a first-character
  dispatch table (`src/firstCharCodes.js`): every rule is analysed once for the
  characters it can start with, and a scan only tries the rules reachable from
  the current character. Longest-match semantics and rule declaration order are
  preserved — ties still resolve to the earliest rule.
- [x] `for...in` over rule arrays in the hot path, replaced with indexed loops.
- [x] `rejectedRules.indexOf()` ran for every rule on every scan; now skipped
  entirely while no rule is rejected (the overwhelmingly common case).
- [ ] Extend the `fixedWidth` early-exit beyond plain string rules by computing
  a maximum match width for simple expressions.
- [ ] Close the remaining gap to chevrotain, which is still ~2x faster. The
  regex exec count is already near its floor, so the next win has to come from
  per-scan overhead rather than from matching fewer rules.

Measured on a 266 KB source producing 52,000 tokens, 40 interleaved rounds,
median (`node` 24, 8 rules):

| lexer                | time    | throughput |
| -------------------- | ------- | ---------- |
| flex-js (before)     | 42.2 ms |  6.2 MB/s  |
| flex-js (after)      |  7.3 ms | 35.4 MB/s  |
| moo 0.5.3            |  7.8 ms | 33.2 MB/s  |
| chevrotain 13.2.0    |  3.5 ms | 75.0 MB/s  |

5.8x faster than before, and slightly ahead of moo. Regex executions dropped
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
- [ ] TypeScript declarations (`index.d.ts`), and a `types` field.

## Project hygiene

- [ ] Dev dependencies are from 2018 (eslint 5, mocha 5); no CI workflow.
- [ ] No `files` field in `package.json`, so the whole repo is published.
