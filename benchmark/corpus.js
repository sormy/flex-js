/*
** The text the lexers are given. Generated rather than one line repeated, so
** that the token sequence varies the way real input does, and deterministic,
** so every run and every lexer sees the same thing.
*/

function source(seed) {
  var state = seed;

  return function () {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    // the low bits of a generator like this barely move
    return (state >>> 15) & 0xffff;
  };
}

var NAMES = ['alpha', 'beta_1', 'gamma', 'delta2', 'total', 'price', 'count', 'owner_id'];
var WORDS = ['ready', 'pending', 'a string here', 'done', 'queued'];

function expressions(lines) {
  var next = source(20260905);

  function pick(list) {
    return list[next() % list.length];
  }

  function value() {
    var kind = next() % 4;
    if (kind === 0) {
      return String(next() % 999) + '.' + String(next() % 99);
    }
    if (kind === 1) {
      return '"' + pick(WORDS) + '"';
    }
    return kind === 2 ? String(next() % 9999) : pick(NAMES);
  }

  function expr(depth) {
    if (depth === 0 || next() % 3 === 0) {
      return value();
    }
    var body = expr(depth - 1) + ' ' + '+-*/'.charAt(next() % 4) + ' ' + expr(depth - 1);
    return next() % 2 === 0 ? '(' + body + ')' : body;
  }

  var out = [];
  for (var index = 0; index < lines; index++) {
    var line = 'let ' + pick(NAMES) + ' = ' + expr(3) + ' ;';
    if (next() % 3 === 0) {
      line += ' // ' + pick(WORDS);
    }
    out.push(line);
  }

  return out.join('\n') + '\n';
}

function keywords(lines) {
  var next = source(20260905);

  function pick(list) {
    return list[next() % list.length];
  }

  function condition() {
    return pick(NAMES) + ' ' + ['>=', '<=', '==', '<', '>'][next() % 5] + ' ' + (next() % 999);
  }

  function body() {
    return pick(NAMES) + ' = ' + pick(NAMES) + ' ' + '+*-/'.charAt(next() % 4) + ' ' +
      (next() % 99) + ';';
  }

  var out = [];
  for (var index = 0; index < lines; index++) {
    var line = 'if (' + condition() + ') { ' + body() + ' }';
    if (next() % 3 === 0) {
      line += ' else { return null; }';
    } else if (next() % 4 === 0) {
      line += ' else { ' + body() + ' }';
    }
    out.push(line);
  }

  return out.join('\n') + '\n';
}

function sql(lines) {
  var next = source(20260905);
  var tables = ['orders', 'items', 'users', 'ledger'];

  function pick(list) {
    return list[next() % list.length];
  }

  function value() {
    var kind = next() % 3;
    if (kind === 0) {
      return String(next() % 999 + 1);
    }
    return kind === 1 ? '\'' + pick(WORDS) + '\'' : pick(NAMES);
  }

  function comparison() {
    var left = next() % 4 === 0 ? pick(NAMES) + '(' + value() + ', ' + value() + ')' : pick(NAMES);
    if (next() % 7 === 0) {
      return left + ' IN (' + value() + ', ' + value() + ', ' + value() + ')';
    }
    return left + ' ' + ['=', '<>', '<', '>', '<=', '>='][next() % 6] + ' ' + value();
  }

  function condition(depth) {
    if (depth === 0 || next() % 4 === 0) {
      return comparison();
    }
    var body = condition(depth - 1) + (next() % 2 === 0 ? ' AND ' : ' OR ') + condition(depth - 1);
    if (next() % 5 === 0) {
      body = 'NOT (' + body + ')';
    }
    return next() % 2 === 0 ? '(' + body + ')' : body;
  }

  var out = [];
  for (var index = 0; index < lines; index++) {
    var columns = [];
    var count = next() % 4 + 1;
    for (var column = 0; column < count; column++) {
      columns.push(next() % 9 === 0 ? '*' : pick(NAMES));
    }
    out.push('SELECT ' + columns.join(', ') + ' FROM ' + pick(tables) +
      ' WHERE ' + condition(3) + ' ;');
  }

  return out.join('\n') + '\n';
}

module.exports = { expressions: expressions, keywords: keywords, sql: sql };
