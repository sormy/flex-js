/*
** Throughput of the scanners flex-js 2 generates, against the 1.x library
** and the other lexers people reach for.
**
** Every engine is given the same input and has to return the same number of
** tokens, each as an object, so a change in that count means the grammars
** have drifted apart and the timings are not comparable.
**
** Run with `npm run bench` from the repository root.
*/

'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');

var corpus = require('./corpus.js');

var LINES = 3000;
var WARMUP_ROUNDS = 20;
var TIMED_ROUNDS = 30;
/* Scans inside one child, to warm the heap before maxRSS is read. */
var MEMORY_ROUNDS = 3;
/* Children whose peaks are compared, the smallest being the honest one. */
var MEMORY_CHILDREN = 3;

var GENERATOR = process.env.FLEX_JS ||
  path.join(__dirname, '..', 'build', 'flex', 'src', 'flex');

/* Not installed is a reason to leave a lexer out of the table. Installed and
 * broken is not: that would publish a comparison quietly missing an entrant.
 */
function optional(name) {
  try {
    /* resolve answers whether it is installed; require would also report a
     * MODULE_NOT_FOUND raised inside it, which is the broken case.
     */
    require.resolve(name);
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
    return null;
  }
  return require(name);
}

var LegacyLexer = optional('flex-js');
var moo = optional('moo');
var peggy = optional('peggy');
/* The package entry, not a path inside it: ./lib/src/api.js stopped being
 * exported and the fallback was quietly carrying every run.
 */
var chevrotain = optional('chevrotain');
var JisonLex = optional('jison-lex');

/* lezer ships as ES modules only, so it arrives through import() before
 * anything is measured rather than through require() here.
 */
var lezerBuild = null;

/* What the README recommends and publishes numbers for, so `npm run bench`
 * reproduces them. Empty asks for flex's own default tables instead.
 */
var TABLES = (process.env.FLEX_JS_TABLES === undefined
  ? '-Cfe'
  : process.env.FLEX_JS_TABLES).split(' ').filter(Boolean);

var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flex-js-bench-'));

/* One run spawns a process per engine per workload, so the scanners each one
 * generates go away with it rather than accumulating in the temp directory.
 */
process.on('exit', function () {
  fs.rmSync(directory, { recursive: true, force: true });
});

/**
 * Generates a scanner from one of the grammars beside this file. Options are
 * written into the grammar rather than given on the command line, since that
 * is where flex takes them.
 */
function generated(name, options) {
  /* A name, not a summary of one: two option strings that differ only in
   * their digits would otherwise share a file, and the second require()
   * would hand back the first scanner out of the module cache.
   */
  var suffix = options ? '-' + options.replace(/[^A-Za-z0-9]+/g, '-') : '';
  var output = path.join(directory, name + suffix + '.js');
  var grammar = path.join(__dirname, name + '.l');

  if (options) {
    var written = path.join(directory, name + suffix + '.l');

    fs.writeFileSync(written,
      '%option ' + options + '\n' + fs.readFileSync(grammar, 'utf8'));
    grammar = written;
  }

  var run = childProcess.spawnSync(GENERATOR,
    ['--emit=javascript'].concat(TABLES,
      ['--noline', '-o', output, grammar]),
    { encoding: 'utf8' });

  if (run.error) {
    throw new Error('running ' + GENERATOR + ' failed: ' + run.error.message);
  }

  if (run.status !== 0) {
    throw new Error('generating ' + name + ' failed: ' + run.stderr);
  }
  return require(output).Scanner;
}

function token(type) {
  return function (lexer) {
    return { type: type, value: lexer.text };
  };
}

var PUNCTUATION = ['>=', '<=', '==', '(', ')', '{', '}', ';', '=', '+', '*', '-', '/', '<', '>'];
var KEYWORDS = ['if', 'else', 'return', 'null'];
var SQL_KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN'];
var SQL_PUNCTUATION = ['<=', '>=', '<>', '=', '<', '>', '+', '-', '*', '/', '(', ')', ',', ';'];

/*
** PEG is ordered choice, so the rules are written longest first and a keyword
** is followed by a lookahead, which is what longest match does on its own.
*/
var PEGGY_HEAD = [
  'Tokens = t:Token* { return t.filter(function (x) { return x !== null; }); }',
  ''
].join('\n');

var PEGGY = {
  'expression rules': [
    'Token = Ws / Comment / Str / Float / Int / Kw / Id / Op',
    'Ws = [ \\t\\n]+ { return null; }',
    'Comment = "//" [^\\n]* { return null; }',
    'Str = \'"\' ( [^"\\\\] / "\\\\" . )* \'"\' { return { type: "str", value: text() }; }',
    'Float = [0-9]+ "." [0-9]+ { return { type: "float", value: text() }; }',
    'Int = [0-9]+ { return { type: "int", value: text() }; }',
    'Kw = "let" ![a-zA-Z0-9_] { return { type: "kw", value: text() }; }',
    'Id = [a-zA-Z_][a-zA-Z0-9_]* { return { type: "id", value: text() }; }',
    'Op = [-+*/=();] { return { type: "op", value: text() }; }'
  ].join('\n'),
  'string rules': [
    'Token = Ws / Punct / Kw / Int / Id',
    'Ws = [ \\t\\n]+ { return null; }',
    'Punct = (">=" / "<=" / "==" / "(" / ")" / "{" / "}" / ";" / "=" / "+" / "*" / "-" / "/" / "<" / ">")',
    '  { return { type: "punct", value: text() }; }',
    'Kw = ("if" / "else" / "return" / "null") ![a-zA-Z0-9_]',
    '  { return { type: "kw", value: text() }; }',
    'Int = [0-9]+ { return { type: "int", value: text() }; }',
    'Id = [a-zA-Z_][a-zA-Z0-9_]* { return { type: "id", value: text() }; }'
  ].join('\n'),
  'keyword rules': [
    'Token = Ws / Kw / Str / Int / Id / Punct',
    'Ws = [ \\t\\n]+ { return null; }',
    'Kw = ("SELECT" / "FROM" / "WHERE" / "AND" / "OR" / "NOT" / "IN") ![a-zA-Z0-9_]',
    '  { return { type: "kw", value: text() }; }',
    'Str = "\'" [^\']* "\'" { return { type: "str", value: text() }; }',
    'Int = [0-9]+ { return { type: "int", value: text() }; }',
    'Id = [a-zA-Z_][a-zA-Z0-9_]* { return { type: "id", value: text() }; }',
    'Punct = ("<=" / ">=" / "<>" / "=" / "<" / ">" / "+" / "-" / "*" / "/" / "(" / ")" / "," / ";")',
    '  { return { type: "punct", value: text() }; }'
  ].join('\n')
};

/*
** lezer generates an LR parser rather than a lexer, so it builds a tree where
** the others hand back tokens. Counting the nodes is the same work asked for.
*/
/*
** jison-lex is the closest thing to this project's ancestry: a lex grammar in,
** a JavaScript lexer out. The rules are the same ones, in lex's own syntax.
*/
var JISON = {
  'expression rules': [
    '%%',
    '[ \\t\\n]+                 /* skip */',
    '"//"[^\\n]*                 /* skip */',
    '\'"\'([^"\\\\]|\\\\.)*\'"\'        return "str";',
    '[0-9]+"."[0-9]+           return "float";',
    '[0-9]+                    return "int";',
    '"let"                     return "kw";',
    '[a-zA-Z_][a-zA-Z0-9_]*    return "id";',
    '[-+*/=();]                return "op";'
  ].join('\n'),
  'string rules': [
    '%%',
    '[ \\t\\n]+                 /* skip */',
    '">="|"<="|"=="            return "punct";',
    '"if"|"else"|"return"|"null"  return "kw";',
    '[0-9]+                    return "int";',
    '[a-zA-Z_][a-zA-Z0-9_]*    return "id";',
    '[(){};=+*\\-/<>]            return "punct";'
  ].join('\n'),
  'keyword rules': [
    '%%',
    '[ \\t\\n]+                 /* skip */',
    '"SELECT"|"FROM"|"WHERE"|"AND"|"OR"|"NOT"|"IN"  return "kw";',
    '"\'"[^\']*"\'"              return "str";',
    '[0-9]+                    return "int";',
    '[a-zA-Z_][a-zA-Z0-9_]*    return "id";',
    '"<="|">="|"<>"            return "punct";',
    '[=<>+*\\-/(),;]             return "punct";'
  ].join('\n')
};

var LEZER = {
  'expression rules': [
    '@top Program { item* }',
    'item { Kw | Str | Float | Int | Id | Op }',
    '@skip { space | comment }',
    '@tokens {',
    '  space { $[ \\t\\n]+ }',
    '  comment { "//" ![\\n]* }',
    '  Str { \'"\' (![\'"\\\\] | "\\\\" _)* \'"\' }',
    '  Float { $[0-9]+ "." $[0-9]+ }',
    '  Int { $[0-9]+ }',
    '  identifier { $[a-zA-Z_] $[a-zA-Z0-9_]* }',
    '  Op { $[-+*/=();] }',
    '  @precedence { comment, Op }',
    '  @precedence { Float, Int }',
    '}',
    'Kw { @specialize<identifier, "let"> }',
    'Id { identifier }'
  ].join('\n'),
  'string rules': [
    '@top Program { item* }',
    'item { Kw | Int | Id | Punct }',
    '@skip { space }',
    '@tokens {',
    '  space { $[ \\t\\n]+ }',
    '  Int { $[0-9]+ }',
    '  identifier { $[a-zA-Z_] $[a-zA-Z0-9_]* }',
    '  Punct { ">=" | "<=" | "==" | "(" | ")" | "{" | "}" | ";" | "=" | "+" | "*" | "-" | "/" | "<" | ">" }',
    '}',
    'Kw { @specialize<identifier, "if" | "else" | "return" | "null"> }',
    'Id { identifier }'
  ].join('\n'),
  'keyword rules': [
    '@top Program { item* }',
    'item { Kw | Str | Int | Id | Punct }',
    '@skip { space }',
    '@tokens {',
    '  space { $[ \\t\\n]+ }',
    '  Str { "\'" ![\']* "\'" }',
    '  Int { $[0-9]+ }',
    '  identifier { $[a-zA-Z_] $[a-zA-Z0-9_]* }',
    '  Punct { "<=" | ">=" | "<>" | "=" | "<" | ">" | "+" | "-" | "*" | "/" | "(" | ")" | "," | ";" }',
    '}',
    'Kw { @specialize<identifier, "SELECT" | "FROM" | "WHERE" | "AND" | "OR" | "NOT" | "IN"> }',
    'Id { identifier }'
  ].join('\n')
};

var WORKLOADS = [
  {
    name: 'expression rules',
    grammar: 'expr',
    corpus: function () { return corpus.expressions(LINES); },
    legacy: function (lexer) {
      lexer.addRule(/[ \t\n]+/);
      lexer.addRule(/\/\/[^\n]*/);
      lexer.addRule(/"(?:[^"\\]|\\.)*"/, token('str'));
      lexer.addRule(/[0-9]+\.[0-9]+/, token('float'));
      lexer.addRule(/[0-9]+/, token('int'));
      lexer.addRule('let', token('kw'));
      lexer.addRule(/[a-zA-Z_][a-zA-Z0-9_]*/, token('id'));
      lexer.addRule(/[-+*/=();]/, token('op'));
    },
    moo: function () {
      return moo.compile({
        ws: { match: /[ \t\n]+/, lineBreaks: true },
        comment: /\/\/[^\n]*/,
        str: /"(?:[^"\\]|\\.)*"/,
        float: /[0-9]+\.[0-9]+/,
        int: /[0-9]+/,
        id: { match: /[a-zA-Z_][a-zA-Z0-9_]*/, type: moo.keywords({ kw: 'let' }) },
        op: /[-+*/=();]/
      });
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
        create({ name: 'Op', pattern: /[-+*/=();]/ })
      ];
    }
  },
  {
    name: 'string rules',
    grammar: 'keywords',
    corpus: function () { return corpus.keywords(LINES); },
    legacy: function (lexer) {
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
  },
  {
    name: 'keyword rules',
    grammar: 'sql',
    corpus: function () { return corpus.sql(LINES); },
    legacy: function (lexer) {
      lexer.addRule(/[ \t\n]+/);
      SQL_KEYWORDS.forEach(function (word) { lexer.addRule(word, token('kw')); });
      lexer.addRule(/'[^']*'/, token('str'));
      lexer.addRule(/[0-9]+/, token('int'));
      lexer.addRule(/[a-zA-Z_][a-zA-Z0-9_]*/, token('id'));
      SQL_PUNCTUATION.forEach(function (text) { lexer.addRule(text, token('punct')); });
    },
    moo: function () {
      return moo.compile({
        ws: { match: /[ \t\n]+/, lineBreaks: true },
        str: /'[^']*'/,
        int: /[0-9]+/,
        id: { match: /[a-zA-Z_][a-zA-Z0-9_]*/, type: moo.keywords({ kw: SQL_KEYWORDS }) },
        punct: SQL_PUNCTUATION.slice()
      });
    },
    chevrotain: function (create, skipped) {
      var id = create({ name: 'Id', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/ });
      var types = [create({ name: 'Ws', pattern: /[ \t\n]+/, group: skipped })];
      SQL_KEYWORDS.forEach(function (word, index) {
        types.push(create({ name: 'Kw' + index, pattern: word, longer_alt: id }));
      });
      types.push(create({ name: 'Str', pattern: /'[^']*'/ }));
      types.push(create({ name: 'Int', pattern: /[0-9]+/ }));
      types.push(id);
      SQL_PUNCTUATION.forEach(function (text, index) {
        types.push(create({ name: 'Punct' + index, pattern: text }));
      });
      return types;
    }
  }
];

function scannerRunner(Scanner, workload) {
  /* Built empty: the round below takes the input, and taking it twice would
   * pay for a pass over the corpus that nothing measures.
   */
  var scanner = new Scanner();
  return function () {
    scanner.restart(workload.source);
    var tokens = [];
    var next;
    while ((next = scanner.lex()) !== 0) {
      tokens.push(next);
    }
    return tokens.length;
  };
}

function generatedRunner(workload) {
  return scannerRunner(generated(workload.grammar), workload);
}

function plainRunner(workload) {
  return scannerRunner(generated(workload.grammar, 'notyped'), workload);
}

function legacyRunner(workload) {
  var lexer = new LegacyLexer();
  workload.legacy(lexer);
  return function () {
    lexer.reset();
    lexer.setSource(workload.source);
    var tokens = [];
    var next;
    while ((next = lexer.lex()) !== 0) {
      tokens.push(next);
    }
    return tokens.length;
  };
}

function lezerRunner(workload) {
  var parser = lezerBuild(LEZER[workload.name]);
  return function () {
    var tree = parser.parse(workload.source);
    var cursor = tree.cursor();
    var tokens = 0;

    do {
      if (cursor.name !== 'Program' && cursor.name !== 'item') {
        tokens++;
      }
    } while (cursor.next());
    return tokens;
  };
}

function jisonRunner(workload) {
  var lexer = new JisonLex(JISON[workload.name]);
  return function () {
    lexer.setInput(workload.source);
    var tokens = [];
    var next;
    while ((next = lexer.lex()) !== lexer.EOF) {
      tokens.push(next);
    }
    return tokens.length;
  };
}

function peggyRunner(workload) {
  var parser = peggy.generate(PEGGY_HEAD + PEGGY[workload.name]);
  return function () {
    return parser.parse(workload.source).length;
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

function chevrotainRunner(workload) {
  var types = workload.chevrotain(chevrotain.createToken, chevrotain.Lexer.SKIPPED);
  var lexer = new chevrotain.Lexer(types, { positionTracking: 'onlyOffset' });
  return function () {
    return lexer.tokenize(workload.source).tokens.length;
  };
}

/*
** Only what is asked for is built: constructing an engine costs memory, and
** the memory figures are taken from a process running one engine and nothing
** else.
*/
/** The engines that would take part, whichever of them are installed. */
function candidates(workload) {
  return [
    ['flex-js 2', true, generatedRunner],
    ['flex-js 2 plain', true, plainRunner],
    ['flex-js 1.x', LegacyLexer, legacyRunner],
    ['moo', moo, mooRunner],
    ['peggy', peggy && PEGGY[workload.name], peggyRunner],
    ['chevrotain', chevrotain, chevrotainRunner],
    ['lezer', lezerBuild && LEZER[workload.name], lezerRunner],
    ['jison-lex', JisonLex && JISON[workload.name], jisonRunner]
  ].filter(function (candidate) {
    return candidate[1];
  });
}

/** Their names, without building any of them. */
function runnerNames(workload) {
  return candidates(workload).map(function (candidate) {
    return candidate[0];
  });
}

function buildRunners(workload, only) {
  return candidates(workload).filter(function (candidate) {
    return !only || candidate[0] === only;
  }).map(function (candidate) {
    return { name: candidate[0], run: candidate[2](workload) };
  });
}

function measure(runners) {
  runners.forEach(function (runner) {
    runner.count = runner.run();
    for (var round = 1; round < WARMUP_ROUNDS; round++) {
      runner.run();
    }
    runner.samples = [];
  });

  // interleaved, so drift over the run reaches every engine alike
  for (var round = 0; round < TIMED_ROUNDS; round++) {
    runners.forEach(function (runner) {
      var started = process.hrtime.bigint();
      runner.run();
      runner.samples.push(Number(process.hrtime.bigint() - started) / 1e6);
    });
  }

  runners.forEach(function (runner) {
    runner.samples.sort(function (left, right) { return left - right; });
  });
}

function reportMemory(workload, name) {
  var runner = buildRunners(workload, name)[0];

  if (!runner) {
    throw new Error(name + ' is not among the lexers this run can measure');
  }

  for (var round = 0; round < MEMORY_ROUNDS; round++) {
    runner.run();
  }

  console.log((process.resourceUsage().maxRSS / 1024).toFixed(1));
}

function report(workload) {
  var runners = buildRunners(workload);
  measure(runners);

  var reference = runners[0];
  var megabytes = workload.source.length / 1048576;

  console.log('\n' + workload.name + ' - ' + Math.round(workload.source.length / 1024) +
    ' KB, ' + reference.count + ' tokens, best of ' + TIMED_ROUNDS);

  runners.forEach(function (runner) {
    if (runner.count !== reference.count) {
      /* Before a single row is printed: a ranked table reads as if it meant
       * something, and someone copies it out of a log.
       */
      throw new Error(runner.name + ' returned ' + runner.count + ' tokens against ' +
        reference.name + '\'s ' + reference.count + ': the grammars have drifted ' +
        'apart and nothing here is comparable');
    }
  });

  runners.slice().sort(function (left, right) {
    return left.samples[0] - right.samples[0];
  }).forEach(function (runner, position) {
    var best = runner.samples[0];
    console.log('  ' + String(position + 1) + '. ' + runner.name.padEnd(12) +
      best.toFixed(2).padStart(7) + ' ms  ' +
      (megabytes / (best / 1000)).toFixed(1).padStart(7) + ' MB/s  ' +
      (runner.count / best / 1000).toFixed(1).padStart(6) + ' Mtokens/s  ' +
      (runner === reference ? '' : (best / reference.samples[0]).toFixed(2) + 'x ' + reference.name));

  });
}

/* The text is built here rather than where the workload is declared: every
 * child process loads this file, and building all three would charge the
 * memory figure for two corpora the measured engine never reads.
 */
function selected() {
  var workload = WORKLOADS.filter(function (candidate) {
    return candidate.name === process.argv[2];
  })[0];

  if (!workload) {
    throw new Error('no such workload: ' + process.argv[2]);
  }
  workload.source = workload.corpus();
  return workload;
}

// one process per workload, so the shapes of one grammar do not leave the
// scanner polymorphic while the next is measured
function runEachSeparately() {
  WORKLOADS.forEach(function (workload) {
    var timed = childProcess.spawnSync(process.execPath, [__filename, workload.name],
      { stdio: 'inherit' });

    if (timed.status !== 0) {
      throw new Error('timing ' + workload.name + ' failed');
    }
    console.log('');
    // peak memory wanders with the collector, so the smallest of a few
    // processes is what gets reported
    runnerNames(workload).forEach(function (name) {
      var peaks = [];
      for (var round = 0; round < MEMORY_CHILDREN; round++) {
        var run = childProcess.spawnSync(process.execPath,
          [__filename, workload.name, name], { encoding: 'utf8' });

        if (run.status !== 0) {
          throw new Error('measuring ' + name + ' on ' + workload.name +
            ' failed: ' + (run.stderr || run.error));
        }
        peaks.push(parseFloat(run.stdout));
      }
      console.log('  ' + name.padEnd(12) +
        Math.min.apply(null, peaks).toFixed(1).padStart(7) + ' MB peak');
    });
  });
}

function main() {
  if (process.argv[3]) {
    reportMemory(selected(), process.argv[3]);
  } else if (process.argv[2]) {
    report(selected());
  } else {
    runEachSeparately();
  }
}

import('@lezer/generator')
  .then(function (lezer) {
    lezerBuild = lezer.buildParser;
  })
  .catch(function (error) {
    /* As optional(): absent is fine, broken is not. */
    if (error.code !== 'ERR_MODULE_NOT_FOUND') {
      throw error;
    }
  })
  .then(main)
  .catch(function (error) {
    /* main() and what it calls throw with a message written to be read; an
     * unhandled rejection would print a stack over the top of it.
     */
    console.error(error.message);
    process.exit(1);
  });
