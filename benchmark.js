/**
 * Throughput comparison against other JavaScript lexers.
 *
 * Run with `npm run bench`. moo and chevrotain are optional: whichever is
 * installed takes part, and the rest of the table is still produced without
 * them. Every engine is fed the same source and must return the same number of
 * tokens, so a change in that count means the grammars have drifted apart and
 * the timings are not comparable.
 *
 * BENCH_ALL=1 adds lex, which is unmaintained and runs its rules as global
 * rather than sticky expressions, so a rule that does not match here scans the
 * rest of the input. That costs seconds per round once a grammar has a couple
 * of dozen rules, which is why it is left out by default.
 */

var childProcess = require('child_process');

var Lexer = require('./index.js');

var REPEATS = 4000;
var MEMORY_ROUNDS = 3;
var WARMUP_ROUNDS = 20;
var TIMED_ROUNDS = 30;
var BUDGET_MS = 1500;

function optional(name) {
  try {
    return require(name);
  } catch (error) {
    return null;
  }
}

var moo = optional('moo');
var chevrotain = optional('chevrotain');
var Lex = optional('lex');

function repeat(line) {
  var source = '';
  for (var index = 0; index < REPEATS; index++) {
    source += line;
  }
  return source;
}

var KEYWORDS = ['if', 'else', 'return', 'null'];
var PUNCTUATION = ['>=', '<=', '==', '(', ')', '{', '}', ';', '=', '+', '*', '-', '/', '<', '>'];

var WORKLOADS = [
  {
    name: 'expression rules',
    source: repeat('let alpha_1 = 1234 + 56.78 * (beta - "a string here") ; // trailing\n'),
    flex: function (lexer) {
      lexer.addRule(/[ \t\n]+/);
      lexer.addRule(/\/\/[^\n]*/);
      lexer.addRule(/"(?:[^"\\]|\\.)*"/, token('str'));
      lexer.addRule(/[0-9]+\.[0-9]+/, token('float'));
      lexer.addRule(/[0-9]+/, token('int'));
      lexer.addRule('let', token('kw'));
      lexer.addRule(/[a-zA-Z_][a-zA-Z0-9_]*/, token('id'));
      lexer.addRule(/[-+*\/=();]/, token('op'));
    },
    moo: function () {
      return moo.compile({
        ws: { match: /[ \t\n]+/, lineBreaks: true },
        comment: /\/\/[^\n]*/,
        str: /"(?:[^"\\]|\\.)*"/,
        float: /[0-9]+\.[0-9]+/,
        int: /[0-9]+/,
        id: { match: /[a-zA-Z_][a-zA-Z0-9_]*/, type: moo.keywords({ kw: 'let' }) },
        op: /[-+*\/=();]/
      });
    },
    lex: function (lexer) {
      lexer.addRule(/[ \t\n]+/, function () { });
      lexer.addRule(/\/\/[^\n]*/, function () { });
      lexer.addRule(/"(?:[^"\\]|\\.)*"/, lexeme('str'));
      lexer.addRule(/[0-9]+\.[0-9]+/, lexeme('float'));
      lexer.addRule(/[0-9]+/, lexeme('int'));
      lexer.addRule(/let/, lexeme('kw'));
      lexer.addRule(/[a-zA-Z_][a-zA-Z0-9_]*/, lexeme('id'));
      lexer.addRule(/[-+*\/=();]/, lexeme('op'));
    },
    chevrotain: function (create, skipped) {
      var id = create({ name: 'Id', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/ });
      return [
        create({ name: 'Ws', pattern: /[ \t\n]+/, group: skipped }),
        create({ name: 'Comment', pattern: /\/\/[^\n]*/, group: skipped }),
        create({ name: 'Str', pattern: /"(?:[^"\\]|\\.)*"/ }),
        create({ name: 'Float', pattern: /[0-9]+\.[0-9]+/ }),
        create({ name: 'Int', pattern: /[0-9]+/ }),
        create({ name: 'Kw', pattern: /let/, longer_alt: id }),
        id,
        create({ name: 'Op', pattern: /[-+*\/=();]/ })
      ];
    }
  },
  {
    name: 'string rules',
    source: repeat('if (count >= 10) { total = total + price * 2; } else { return null; }\n'),
    flex: function (lexer) {
      lexer.addRule(/[ \t\n]+/);
      PUNCTUATION.forEach(function (text) { lexer.addRule(text, token('punct')); });
      KEYWORDS.forEach(function (text) { lexer.addRule(text, token('kw')); });
      lexer.addRule(/[0-9]+/, token('int'));
      lexer.addRule(/[a-zA-Z_][a-zA-Z0-9_]*/, token('id'));
    },
    moo: function () {
      return moo.compile({
        ws: { match: /[ \t\n]+/, lineBreaks: true },
        punct: PUNCTUATION.slice(),
        int: /[0-9]+/,
        id: { match: /[a-zA-Z_][a-zA-Z0-9_]*/, type: moo.keywords({ kw: KEYWORDS }) }
      });
    },
    lex: function (lexer) {
      lexer.addRule(/[ \t\n]+/, function () { });
      PUNCTUATION.forEach(function (text) { lexer.addRule(asExpression(text), lexeme('punct')); });
      KEYWORDS.forEach(function (text) { lexer.addRule(asExpression(text), lexeme('kw')); });
      lexer.addRule(/[0-9]+/, lexeme('int'));
      lexer.addRule(/[a-zA-Z_][a-zA-Z0-9_]*/, lexeme('id'));
    },
    chevrotain: function (create, skipped) {
      var id = create({ name: 'Id', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/ });
      var types = [create({ name: 'Ws', pattern: /[ \t\n]+/, group: skipped })];
      PUNCTUATION.forEach(function (text, index) {
        types.push(create({ name: 'Punct' + index, pattern: text }));
      });
      KEYWORDS.forEach(function (text, index) {
        types.push(create({ name: 'Kw' + index, pattern: text, longer_alt: id }));
      });
      types.push(create({ name: 'Int', pattern: /[0-9]+/ }));
      types.push(id);
      return types;
    }
  }
];

function token(type) {
  return function (lexer) {
    return { type: type, value: lexer.text };
  };
}

function asExpression(text) {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'));
}

function lexeme(type) {
  return function (text) {
    return { type: type, value: text };
  };
}

function flexRunner(workload) {
  var lexer = new Lexer();
  workload.flex(lexer);
  return function () {
    lexer.reset();
    lexer.setSource(workload.source);
    return lexer.lexAll().length;
  };
}

function mooRunner(workload) {
  var lexer = workload.moo();
  return function () {
    lexer.reset(workload.source);
    var tokens = [];
    var next;
    while ((next = lexer.next())) {
      if (next.type !== 'ws' && next.type !== 'comment') {
        tokens.push(next);
      }
    }
    return tokens.length;
  };
}

function lexRunner(workload) {
  var lexer = new Lex();
  workload.lex(lexer);
  return function () {
    lexer.setInput(workload.source);
    var count = 0;
    while (lexer.lex() !== undefined) {
      count++;
    }
    return count;
  };
}

function chevrotainRunner(workload) {
  var types = workload.chevrotain(chevrotain.createToken, chevrotain.Lexer.SKIPPED);
  var lexer = new chevrotain.Lexer(types, { positionTracking: 'onlyOffset' });
  return function () {
    return lexer.tokenize(workload.source).tokens.length;
  };
}

function measure(runners) {
  runners.forEach(function (runner) {
    var started = process.hrtime.bigint();
    runner.count = runner.run();
    var first = Number(process.hrtime.bigint() - started) / 1e6;

    // a slow engine gets fewer rounds rather than holding up the whole run
    runner.rounds = Math.max(5, Math.min(TIMED_ROUNDS, Math.floor(BUDGET_MS / first)));
    var warmup = Math.min(WARMUP_ROUNDS, runner.rounds);
    for (var round = 1; round < warmup; round++) {
      runner.run();
    }
    runner.samples = [];
  });

  // interleave so that any drift over the run reaches every engine alike
  for (var round = 0; round < TIMED_ROUNDS; round++) {
    runners.forEach(function (runner) {
      if (round >= runner.rounds) {
        return;
      }
      var started = process.hrtime.bigint();
      runner.run();
      runner.samples.push(Number(process.hrtime.bigint() - started) / 1e6);
    });
  }

  runners.forEach(function (runner) {
    runner.samples.sort(function (left, right) { return left - right; });
  });
}

function buildRunners(workload) {
  var runners = [{ name: 'flex-js', run: flexRunner(workload) }];
  if (moo) {
    runners.push({ name: 'moo', run: mooRunner(workload) });
  }
  if (chevrotain) {
    runners.push({ name: 'chevrotain', run: chevrotainRunner(workload) });
  }
  if (Lex && process.env.BENCH_ALL) {
    runners.push({ name: 'lex', run: lexRunner(workload) });
  }
  return runners;
}

/**
 * Peak resident memory, reported by a process running this engine and nothing
 * else, so that the figure covers loading the library as well as scanning.
 */
function reportMemory(workload, name) {
  var runner = buildRunners(workload).filter(function (candidate) {
    return candidate.name === name;
  })[0];

  if (!runner) {
    return;
  }

  for (var round = 0; round < MEMORY_ROUNDS; round++) {
    runner.run();
  }

  console.log('  ' + name.padEnd(12) +
    (process.resourceUsage().maxRSS / 1024).toFixed(1).padStart(7) + ' MB peak');
}

function report(workload) {
  var runners = buildRunners(workload);

  measure(runners);

  var reference = runners[0];
  var megabytes = workload.source.length / 1048576;
  console.log('\n' + workload.name + ' - ' + Math.round(workload.source.length / 1024) +
    ' KB, ' + reference.count + ' tokens, best of ' + reference.rounds);

  var ranked = runners.slice().sort(function (left, right) {
    return left.samples[0] - right.samples[0];
  });

  ranked.forEach(function (runner, position) {
    var best = runner.samples[0];
    var relative = best / reference.samples[0];
    console.log('  ' + String(position + 1) + '. ' + runner.name.padEnd(12) +
      best.toFixed(2).padStart(7) + ' ms  ' +
      (megabytes / (best / 1000)).toFixed(1).padStart(7) + ' MB/s  ' +
      (runner.count / best / 1000).toFixed(1).padStart(6) + ' Mtokens/s  ' +
      (runner === reference ? '' : relative.toFixed(2) + 'x flex-js'));
    if (runner.count !== reference.count) {
      console.log('     token count differs from flex-js (' + runner.count +
        ' against ' + reference.count + '), timings are not comparable');
    }
  });
}

function selected() {
  var wanted = process.argv[2];
  return WORKLOADS.filter(function (workload) { return workload.name === wanted; })[0];
}

// each workload gets its own process, so that the shapes of one grammar do not
// leave the scanner polymorphic while the next one is measured
function runEachSeparately() {
  WORKLOADS.forEach(function (workload) {
    childProcess.spawnSync(process.execPath, [__filename, workload.name], { stdio: 'inherit' });
    console.log('');
    buildRunners(workload).forEach(function (runner) {
      childProcess.spawnSync(process.execPath, [__filename, workload.name, runner.name], { stdio: 'inherit' });
    });
  });
}

if (!moo || !chevrotain) {
  console.log('note: install moo and chevrotain for the full comparison');
}

if (process.argv[3]) {
  reportMemory(selected(), process.argv[3]);
} else if (process.argv[2]) {
  report(selected());
} else {
  runEachSeparately();
}
