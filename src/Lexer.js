(function (root) {
'use strict';

var ASCII_LIMIT = 128;
var NEWLINE = 10;

/**
 * console.log ends every call with a newline, so text is held back until one
 * arrives and the scanner's own line breaks decide where lines fall.
 */
function consoleOutput() {
  var pending = '';

  return {
    write: function (text) {
      pending += text;
      var lastBreak = pending.lastIndexOf('\n');
      if (lastBreak !== -1) {
        console.log(pending.slice(0, lastBreak));
        pending = pending.slice(lastBreak + 1);
      }
    },
    flush: function () {
      if (pending) {
        console.log(pending);
        pending = '';
      }
    }
  };
}

function defaultOutput() {
  if (typeof process !== 'undefined' && process.stdout &&
    typeof process.stdout.write === 'function') {
    return process.stdout;
  }

  return consoleOutput();
}

function toCharCodes(text) {
  var codes = [];

  for (var index = 0; index < text.length; index++) {
    codes.push(text.charCodeAt(index));
  }

  return codes;
}

function isAscii(text) {
  for (var index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) >= ASCII_LIMIT) {
      return false;
    }
  }

  return true;
}

// flex reads "$" as the trailing context "/\n"
var TRAILING_NEWLINE = '(?=\\n)';

/**
 * FLEX.JS - FLEX-like lexer.
 *
 * @class Lexer
 */
function Lexer() {
  this.idRegExp = /^[a-z_][a-z0-9_-]*$/i;

  Object.defineProperty(this, 'line', {
    get: function () { return this.getLineAt(this.tokenStart) + 1; }
  });

  Object.defineProperty(this, 'column', {
    get: function () {
      var line = this.getLineAt(this.tokenStart);
      return this.tokenStart - this.getLineOffsets()[line] + 1;
    }
  });

  this.clear();
}

/**
 * End of file indicator.
 *
 * @const
 * @public
 */
Lexer.EOF = 0;

/**
 * Default initial inclusive state name.
 *
 * @const
 * @public
 */
Lexer.STATE_INITIAL = 'INITIAL';

/**
 * State name reserved to match with any inclusive/exclusive state.
 *
 * @const
 * @public
 */
Lexer.STATE_ANY = '*';

/**
 * Rule indicating EOF.
 *
 * @const
 * @public
 */
Lexer.RULE_EOF = '<<EOF>>';

/**
 * Reset lexer state but keep configuration.
 *
 * @public
 */
Lexer.prototype.reset = function () {
  this.source = '';
  this.index = 0;
  this.text = undefined;
  this.state = Lexer.STATE_INITIAL;

  this.tokenStart = 0;
  this.lineOffsets = null;
  this.ruleIndex = undefined;
  this.readMore = false;
  this.stateStack = [];
  this.rejectedRules = [];
};

/**
 * Reset lexer configuration and internal state.
 *
 * @public
 */
Lexer.prototype.clear = function () {
  // bare maps so an inherited name is never mistaken for a registered entry
  this.states = Object.create(null);
  this.definitions = Object.create(null);
  this.rules = {};
  this.dispatches = {};
  this.output = defaultOutput();
  this.ignoreCase = false;
  this.debugEnabled = false;
  this.defaultRuleEnabled = true;

  this.addState(Lexer.STATE_INITIAL);

  this.reset();
};

/**
 * Set ignore case mode.
 *
 * By default it is case sensitie.
 *
 * @param {boolean} ignoreCase
 *
 * @public
 */
Lexer.prototype.setIgnoreCase = function (ignoreCase) {
  this.ignoreCase = ignoreCase;
};

/**
 * Set debug enabled.
 *
 * By default it is disabled.
 *
 * @param {boolean} debugEnabled
 *
 * @public
 */
Lexer.prototype.setDebugEnabled = function (debugEnabled) {
  this.debugEnabled = debugEnabled;
};

/**
 * Set whether input matching no rule is echoed, as FLEX does by default.
 *
 * With the default rule off, such input raises an error instead, which is
 * FLEX's "%option nodefault".
 *
 * @param {boolean} defaultRuleEnabled
 *
 * @public
 */
Lexer.prototype.setDefaultRuleEnabled = function (defaultRuleEnabled) {
  this.defaultRuleEnabled = defaultRuleEnabled;
};

/**
 * Set where echo() writes, FLEX's yyout.
 *
 * @param {object|function} output  Anything with a write method, a writable
 *                                  stream for instance, or a function taking
 *                                  the text.
 *
 * @public
 */
Lexer.prototype.setOutput = function (output) {
  if (typeof output === 'function') {
    output = { write: output };
  }

  if (!output || typeof output.write !== 'function') {
    throw new Error('Invalid output: should be a function or have a write method');
  }

  this.output = output;
};

/**
 * Add additional state.
 *
 * @param {string}  name        State name, case sensitive.
 * @param {boolean} [exclusive]
 *
 * @public
 */
Lexer.prototype.addState = function (name, exclusive) {
  // a state name also keys this.rules and this.dispatches, which are plain
  if (typeof name !== 'string' || !this.idRegExp.test(name) || name in Object.prototype) {
    throw new Error('Invalid state name "' + name + '"');
  }

  this.states[name] = { name: name, exclusive: !!exclusive };
};

/**
 * @private
 */
Lexer.prototype.getInclusiveStateNames = function () {
  var names = [];

  for (var name in this.states) {
    if (!this.states[name].exclusive) {
      names.push(name);
    }
  }

  return names;
};

/**
 * Add definition.
 *
 * @param {string}        name        Definition name, case sensitive.
 * @param {string|RegExp} expression  Expression, can't use flags.
 *
 * @public
 */
Lexer.prototype.addDefinition = function (name, expression) {
  if (typeof name !== 'string' || !this.idRegExp.test(name)) {
    throw new Error('Invalid definition name "' + name + '"');
  }

  if (typeof expression === 'string') {
    if (expression.length === 0) {
      throw new Error('Empty expression for definition "' + name + '"');
    }
    expression = this.escapeRegExp(expression);
  } else if (expression instanceof RegExp) {
    if (expression.source === '(?:)') {
      throw new Error('Empty expression for definition "' + name + '"');
    }
    if (expression.flags !== '') {
      throw new Error('Expression flags are not supported for definition expressions');
    }
    expression = expression.source;
  } else {
    throw new Error('Invalid expression for definition "' + name + '"');
  }

  this.definitions[name] = this.expandDefinitions(expression);
};

/**
 * Add state-specific rule.
 *
 * Action return value 0 is reserved for TERMINATE action.
 * Action return value undefined is reserved for DISCARD action.
 * Any other value could be used as return value from action as token.
 *
 * @param {string[]|string} states      Single state or state array, case sensitive.
 * @param {string|RegExp}   expression  Expression, can use flags and definitions.
 * @param {function}        [action]    Default action is DISCARD.
 *
 * @public
 */
Lexer.prototype.addStateRule = function (states, expression, action) {
  var isUnqualified = states === undefined || states === null;

  if (isUnqualified) {
    states = this.getInclusiveStateNames();
  } else if (states === Lexer.STATE_ANY) {
    states = Object.keys(this.states);
  } else if (typeof states === 'string') {
    states = [states];
  }

  // drop empty names, and any state named twice, which would file the rule twice
  states = states.filter(function (state, index) {
    return !!state && states.indexOf(state) === index;
  });

  // validate if we have at least one state to add rule into
  if (!states.length) {
    throw new Error('Unable to add rule to empty list of states');
  }

  // do not allow to add rules into not registered states
  var notRegisteredStates = states.reduce(function (acc, state) {
    if (!this.states[state]) {
      acc.push(state);
    }
    return acc;
  }.bind(this), []);
  if (notRegisteredStates.length) {
    throw new Error('Unable to register rule within unregistered state(s): ' + notRegisteredStates.join(', '));
  }

  var source;
  var flags;
  var fixedWidth;
  var literal;

  if (expression === Lexer.RULE_EOF) {
    source = null;
  } else if (typeof expression === 'string') {
    if (expression.length === 0) {
      throw new Error('Empty expression for rule used in states "' + states.join(', ') + '"');
    }
    source = this.escapeRegExp(expression);
    fixedWidth = expression.length;
    flags = '';
    literal = expression;
  } else if (expression instanceof RegExp) {
    if (expression.source === '(?:)') {
      throw new Error('Empty expression for rule used in states "' + states.join(', ') + '"');
    }
    if (expression.flags !== '') {
      var notSupportedFlags = expression.flags
        .split('')
        .filter(function (flag) {
          return flag !== 'i' && flag !== 'u';
        });
      if (notSupportedFlags.length) {
        throw new Error('Expression flags besides "i" and "u" are not supported');
      }
    }
    source = expression.source;
    flags = expression.flags;
  } else {
    throw new Error('Invalid rule expression "' + expression + '"');
  }

  if (action && typeof action !== 'function') {
    throw new Error('Invalid rule action: should be function or empty');
  }

  var isEOF = source === null;
  var expandedSource = isEOF ? '' : this.expandDefinitions(source);
  var compiledExpression = isEOF ? null : this.compileRuleExpression(expandedSource, flags);

  // regard "i" as ASCII case folding, which it is for an ASCII literal
  var foldsCase = compiledExpression !== null && compiledExpression.ignoreCase;
  var comparable = literal !== undefined && (!foldsCase || isAscii(literal));

  var rule = {
    expression: compiledExpression,
    isEOF: isEOF,
    isFallbackEOF: isEOF && isUnqualified,
    trailingContextWidth: isEOF ? 0 : this.getTrailingContextWidth(expandedSource),
    firstCharCodes: isEOF ? null : this.getFirstCharCodes(compiledExpression),
    literalLower: comparable ? toCharCodes(foldsCase ? literal.toLowerCase() : literal) : null,
    literalUpper: comparable ? toCharCodes(foldsCase ? literal.toUpperCase() : literal) : null,
    action: action,
    fixedWidth: fixedWidth // used for weighted match optimization
  };

  for (var index = 0; index < states.length; index++) {
    var state = states[index];
    if (!this.rules[state]) {
      this.rules[state] = [];
    }
    this.rules[state].push(rule);
  }

  this.dispatches = {};
};

/**
 * Add multiple rules into one or more states at once.
 *
 * @param {string[]|string} states      Single state or state array, case sensitive.
 * @param {Array}          rules       Each item should have expression and action keys.
 *
 * @public
 */
Lexer.prototype.addStateRules = function (states, rules) {
  for (var index = 0; index < rules.length; index++) {
    this.addStateRule(states, rules[index].expression, rules[index].action);
  }
};

/**
 * Add rule without explicit state.
 *
 * Based on inclusive/exclusive state option it could be available within any state
 * or within specific states.
 *
 * @param {string|RegExp} expression
 * @param {function}      [action]    Default action is DISCARD.
 *
 * @public
 */
Lexer.prototype.addRule = function (expression, action) {
  this.addStateRule(undefined, expression, action);
};

/**
 * Add multiple rules without explicit state.
 *
 * @param {Array}          rules       Each item should have expression and action keys.
 *
 * @public
 */
Lexer.prototype.addRules = function (rules) {
  this.addStateRules(undefined, rules);
};

/**
 * Set source text string to lex.
 *
 * @param {string} source
 *
 * @public
 */
Lexer.prototype.setSource = function (source) {
  if (typeof source !== 'string') {
    throw new Error('Invalid source: should be a string');
  }

  this.source = source;
  this.index = 0;
  this.tokenStart = 0;
  this.lineOffsets = null;
};

/**
 * Run lexer until end or until token will be found.
 *
 * @return Either EOF {@link Lexer.EOF} or specific token produced by action.
 *
 * @public
 */
Lexer.prototype.lex = function () {
  var result;

  do {
    result = this.scan();
  } while (result === undefined);

  return result;
};

/**
 * Run lexer until end, collect all tokens into array and return it.
 *
 * @return {Array} Array of tokens.
 *
 * @public
 */
Lexer.prototype.lexAll = function () {
  var result = [];
  var token;
  while ((token = this.lex()) !== Lexer.EOF) {
    result.push(token);
  }
  return result;
};

/**
 * DISCARD action.
 *
 * @public
 */
Lexer.prototype.discard = function () {
  return undefined;
};

/**
 * ECHO action.
 *
 * @public
 */
Lexer.prototype.echo = function () {
  this.output.write(this.text);
};

/**
 * BEGIN action.
 *
 * @param {string} [newState] Default is INITIAL state.
 *
 * @public
 */
Lexer.prototype.begin = function (newState) {
  if (newState === undefined) {
    newState = Lexer.STATE_INITIAL;
  }
  if (!this.states[newState]) {
    throw new Error('State "' + newState + '" is not registered');
  }
  this.state = newState;
};

/**
 * REJECT action.
 *
 * @public
 */
Lexer.prototype.reject = function () {
  this.rejectedRules.push(this.ruleIndex);
};

/**
 * MORE action.
 *
 * @public
 */
Lexer.prototype.more = function () {
  this.readMore = true;
};

/**
 * LESS action.
 *
 * @param {number} n
 *
 * @public
 */
Lexer.prototype.less = function (n) {
  // a negative length would push the scanner behind where the token started
  if (n < 0) {
    throw new Error('Invalid length: should not be negative');
  }

  if (n > this.text.length) {
    return;
  }
  this.index -= this.text.length - n;
  this.text = this.text.substr(0, n);
};

/**
 * UNPUT action.
 *
 * @param {string} s
 *
 * @public
 */
Lexer.prototype.unput = function (s) {
  this.source = this.source.substr(0, this.index) + s + this.source.substr(this.index);
  this.lineOffsets = null;
};

/**
 * INPUT action.
 *
 * @param {number} n
 *
 * @return String read from current position (up to N characters).
 *
 * @public
 */
Lexer.prototype.input = function (n) {
  var value = this.source.substr(this.index, n === undefined ? 1 : n);
  this.index += value.length;
  return value;
};

/**
 * TERMINATE action.
 *
 * @public
 */
Lexer.prototype.terminate = function () {
  if (typeof this.output.flush === 'function') {
    this.output.flush();
  }
  this.reset();
  return Lexer.EOF;
};

/**
 * RESTART action.
 *
 * @public
 */
Lexer.prototype.restart = function (newSource) {
  if (newSource !== undefined) {
    if (typeof newSource !== 'string') {
      throw new Error('Invalid source: should be a string');
    }
    this.source = newSource;
    this.lineOffsets = null;
  }
  this.index = 0;
  this.tokenStart = 0;
};

/**
 * Pust State.
 *
 * @param {string} newState
 *
 * @public
 */
Lexer.prototype.pushState = function (newState) {
  if (!this.states[newState]) {
    throw new Error('State "' + newState + '" is not registered');
  }
  this.stateStack.push(this.state);
  this.begin(newState);
};

/**
 * Get top state.
 *
 * @return {string} top state
 *
 * @public
 */
Lexer.prototype.topState = function () {
  if (!this.stateStack.length) {
    return undefined;
  }
  return this.stateStack[this.stateStack.length - 1];
};

/**
 * Pop state.
 *
 * @public
 */
Lexer.prototype.popState = function () {
  if (!this.stateStack.length) {
    throw new Error('Unable to pop state');
  }
  var oldState = this.stateStack.pop();
  this.begin(oldState);
};

/**
 * Switch state.
 *
 * @param {string} [newState] Switch to specific state or initial if omitted.
 *
 * @public
 */
Lexer.prototype.switchState = function (newState) {
  this.begin(newState);
};

/**
 * Scan for one token.
 *
 * @private
 */
Lexer.prototype.scan = function () {
  var isEOF = this.index >= this.source.length;

  var matchedRule;
  var matchedIndex;
  var matchedValue = '';
  var matchedEnd = 0;
  var matchedValueLength = 0; // could be 1 char more than matchedValue for expressions with $ at end

  var rules = this.rules[this.state] || [];
  var dispatch = this.getDispatch(this.state);
  var rejectedRules = this.rejectedRules;

  var candidates;
  if (isEOF) {
    candidates = dispatch.eof;
  } else {
    var charCode = this.source.charCodeAt(this.index);
    candidates = charCode < ASCII_LIMIT ? dispatch.byCharCode[charCode] : dispatch.nonAscii;
  }

  for (var candidate = 0; candidate < candidates.length; candidate++) {
    var ruleIndex = candidates[candidate];
    if (rejectedRules.length && rejectedRules.indexOf(ruleIndex) !== -1) {
      continue;
    }

    var rule = rules[ruleIndex];

    if (isEOF) {
      matchedRule = rule;
      matchedIndex = ruleIndex;
      // no need to search for other EOF rules
      break;
    }

    if (rule.fixedWidth !== undefined && rule.fixedWidth <= matchedValueLength) {
      continue;
    }

    var matchEnd;

    if (rule.literalLower !== null) {
      if (!this.matchesLiteral(rule, this.index)) {
        continue;
      }
      matchEnd = this.index + rule.literalLower.length;
    } else {
      var expression = rule.expression;
      expression.lastIndex = this.index;
      // test() leaves the end in lastIndex without building a match array
      if (!expression.test(this.source)) {
        continue;
      }
      matchEnd = expression.lastIndex;
    }

    var curMatchLength = matchEnd - this.index + rule.trailingContextWidth;
    if (curMatchLength > matchedValueLength) {
      matchedRule = rule;
      matchedIndex = ruleIndex;
      matchedEnd = matchEnd;
      matchedValueLength = curMatchLength;
    }
  }

  if (matchedRule && !isEOF) {
    matchedValue = this.source.substring(this.index, matchedEnd);
  }

  if (matchedRule && this.debugEnabled) {
    this.logAccept(this.state, matchedRule.expression, matchedValue);
  }

  this.ruleIndex = matchedIndex;
  var carriedText = this.readMore ? this.text : '';
  var carriedMore = this.readMore;
  if (!carriedMore) {
    this.tokenStart = this.index;
  }
  this.text = carriedText;
  this.readMore = false;

  if (!matchedRule) {
    if (!isEOF) {
      this.text += this.source.charAt(this.index);
      if (!this.defaultRuleEnabled) {
        this.error('scanner jammed');
      }
      this.index++;
      return this.echo();
    } else {
      this.text = '';
      return this.terminate();
    }
  }

  this.text = carriedText + matchedValue;
  this.index += matchedValue.length;

  var rejectedBefore = this.rejectedRules.length;
  var actionResult = matchedRule.action ? matchedRule.action(this) : this.discard();
  var hasRejection = this.rejectedRules.length > rejectedBefore;

  // reset reject state if there is no rejection in last action
  if (hasRejection) {
    this.index -= matchedValue.length;
    this.text = carriedText;
    this.readMore = carriedMore;
    // ignore result if there is rejection in action
    return;
  }

  if (rejectedRules.length) {
    this.rejectedRules = [];
  }

  // rule action could change buffer or position, so EOF state could be changed too
  // we need revalidate EOF only if EOF was identified before action were executed
  if (isEOF) {
    isEOF = this.index >= this.source.length;
  }

  return isEOF ? this.terminate() : actionResult;
};

/**
 * Report a message against the position the current token starts at, in the
 * shape a compiler front end would print.
 *
 * @param {string} message
 *
 * @public
 */
Lexer.prototype.error = function (message) {
  var error = new Error(message + ' at line ' + this.line + ', column ' + this.column);

  error.line = this.line;
  error.column = this.column;
  error.text = this.text;

  throw error;
};

/**
 * Offset at which every line of the source begins, built once per source.
 *
 * @private
 */
Lexer.prototype.getLineOffsets = function () {
  if (this.lineOffsets === null) {
    var offsets = [0];

    for (var index = 0; index < this.source.length; index++) {
      if (this.source.charCodeAt(index) === NEWLINE) {
        offsets.push(index + 1);
      }
    }

    this.lineOffsets = offsets;
  }

  return this.lineOffsets;
};

/**
 * Zero based line holding the given position.
 *
 * @private
 */
Lexer.prototype.getLineAt = function (position) {
  var offsets = this.getLineOffsets();
  var low = 0;
  var high = offsets.length - 1;

  while (low < high) {
    var middle = Math.ceil((low + high) / 2);
    if (offsets[middle] <= position) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low;
};

/**
 * @private
 */
Lexer.prototype.logAccept = function (state, expression, value) {
  console.log(
    ' - [' + state + '] accepting rule'+
    ' /' + this.encodeString(expression.source) + '/' +
    ' ("' + this.encodeString(value) + '")'
  );
}

/**
 * @private
 */
Lexer.prototype.encodeString = function (s) {
  return s.replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\f/g, '\\f')
    .replace(/\0/g, '\\0');
};

/**
 * @private
 */
Lexer.prototype.expandDefinitions = function (source) {
  for (var name in this.definitions) {
    var body = '(?:' + this.definitions[name] + ')';
    source = source.replace(new RegExp('{' + name + '}', 'g'), function () { return body; });
  }
  return source;
};

/**
 * @private
 */
Lexer.prototype.compileRuleExpression = function (source, flags) {
  if (this.getTrailingContextWidth(source)) {
    source = source.slice(0, -1) + TRAILING_NEWLINE;
  }

  if (this.ignoreCase && flags.indexOf('i') === -1) {
    flags += 'i';
  }

  // sticky flag required for engine to work
  // multiline flag required to be able to match line start
  return new RegExp(source, flags + 'ym');
};

/**
 * @private
 */
Lexer.prototype.escapeRegExp = function (s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Width of a rule's trailing context, which counts toward the longest match
 * even though it is not consumed. Only a trailing "$" is supported, standing
 * for one newline. "^" is a position, not trailing context, and adds nothing.
 *
 * @private
 */
Lexer.prototype.getTrailingContextWidth = function (source) {
  if (source.charAt(source.length - 1) !== '$') {
    return 0;
  }

  var backslashes = 0;
  for (var index = source.length - 2; index >= 0 && source.charAt(index) === '\\'; index--) {
    backslashes++;
  }

  return backslashes % 2 === 0 ? 1 : 0;
};

/**
 * @private
 */
Lexer.prototype.matchesLiteral = function (rule, index) {
  var lower = rule.literalLower;
  var upper = rule.literalUpper;
  var source = this.source;

  for (var offset = 0; offset < lower.length; offset++) {
    var code = source.charCodeAt(index + offset);
    if (code !== lower[offset] && code !== upper[offset]) {
      return false;
    }
  }

  return true;
};

/**
 * @private
 */
Lexer.prototype.getDispatch = function (state) {
  var dispatch = this.dispatches[state];
  if (!dispatch) {
    dispatch = this.dispatches[state] = this.buildDispatch(this.rules[state] || []);
  }
  return dispatch;
};

/**
 * Index rules by the characters a match can start with, so that a scan only
 * tries the rules that can possibly apply. Declaration order is preserved
 * within every bucket, keeping longest-match ties on the earliest rule.
 *
 * @private
 */
Lexer.prototype.buildDispatch = function (rules) {
  var byCharCode = new Array(ASCII_LIMIT);
  var nonAscii = [];
  var eof = [];
  var fallbackEof = [];
  var charCode;

  for (charCode = 0; charCode < ASCII_LIMIT; charCode++) {
    byCharCode[charCode] = [];
  }

  for (var index = 0; index < rules.length; index++) {
    var rule = rules[index];

    if (rule.isEOF) {
      (rule.isFallbackEOF ? fallbackEof : eof).push(index);
      continue;
    }

    if (rule.firstCharCodes === null) {
      for (charCode = 0; charCode < ASCII_LIMIT; charCode++) {
        byCharCode[charCode].push(index);
      }
      nonAscii.push(index);
      continue;
    }

    // case folding can cross the ASCII boundary (K and U+212A), so widen
    var reachesNonAscii = rule.expression.ignoreCase;
    for (var codeIndex = 0; codeIndex < rule.firstCharCodes.length; codeIndex++) {
      charCode = rule.firstCharCodes[codeIndex];
      if (charCode < ASCII_LIMIT) {
        byCharCode[charCode].push(index);
      } else {
        reachesNonAscii = true;
      }
    }
    if (reachesNonAscii) {
      nonAscii.push(index);
    }
  }

  return { byCharCode: byCharCode, nonAscii: nonAscii, eof: eof.concat(fallbackEof) };
};

var UNKNOWN = null;

var ASCII_UPPER_TO_LOWER = 32;

function codeRange(from, to) {
  var codes = [];
  for (var code = from; code <= to; code++) {
    codes.push(code);
  }
  return codes;
}

var DIGIT_CODES = codeRange(48, 57);
var WORD_CODES = DIGIT_CODES.concat(codeRange(65, 90), codeRange(97, 122), [95]);
var SPACE_CODES = [9, 10, 11, 12, 13, 32, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];

var CLASS_ESCAPES = { d: DIGIT_CODES, w: WORD_CODES, s: SPACE_CODES };
var CONTROL_ESCAPES = { n: 10, r: 13, t: 9, f: 12, v: 11, '0': 0 };
var ZERO_WIDTH_ESCAPES = { b: true, B: true };
var UNSUPPORTED_ESCAPE = /[DWScpPk1-9]/;
var COUNTED_QUANTIFIER = /^\d+(,\d*)?$/;
var HEX_DIGITS = /^[0-9a-f]+$/i;

function appendCodes(target, codes) {
  for (var index = 0; index < codes.length; index++) {
    target.push(codes[index]);
  }
}

function uniqueCodes(codes) {
  var seen = {};
  var result = [];
  for (var index = 0; index < codes.length; index++) {
    if (!seen[codes[index]]) {
      seen[codes[index]] = true;
      result.push(codes[index]);
    }
  }
  return result;
}

function withBothCases(codes) {
  var result = codes.slice();
  for (var index = 0; index < codes.length; index++) {
    var code = codes[index];
    if (code >= 65 && code <= 90) {
      result.push(code + ASCII_UPPER_TO_LOWER);
    } else if (code >= 97 && code <= 122) {
      result.push(code - ASCII_UPPER_TO_LOWER);
    }
  }
  return result;
}

function readHexEscape(source, start, length) {
  var digits = source.substr(start, length);
  if (digits.length !== length || !HEX_DIGITS.test(digits)) {
    return UNKNOWN;
  }
  return { codes: [parseInt(digits, 16)], end: start + length };
}

function readEscape(source, index) {
  var escaped = source.charAt(index + 1);

  if (ZERO_WIDTH_ESCAPES[escaped]) {
    return { codes: [], end: index + 2 };
  }
  if (CLASS_ESCAPES[escaped]) {
    return { codes: CLASS_ESCAPES[escaped], end: index + 2 };
  }
  var control = CONTROL_ESCAPES[escaped];
  if (control !== undefined) {
    return { codes: [control], end: index + 2 };
  }
  if (escaped === 'x') {
    return readHexEscape(source, index + 2, 2);
  }
  if (escaped === 'u') {
    return readHexEscape(source, index + 2, 4);
  }
  if (escaped === '' || UNSUPPORTED_ESCAPE.test(escaped)) {
    return UNKNOWN;
  }
  return { codes: [source.charCodeAt(index + 1)], end: index + 2 };
}

function readClassMember(source, index) {
  if (source.charAt(index) !== '\\') {
    return { codes: [source.charCodeAt(index)], end: index + 1 };
  }
  if (source.charAt(index + 1) === 'b') {
    return { codes: [8], end: index + 2 };
  }
  var escape = readEscape(source, index);
  if (escape === UNKNOWN || !escape.codes.length) {
    return UNKNOWN;
  }
  return escape;
}

function isRangeStart(source, member, cursor) {
  return member.codes.length === 1
    && source.charAt(cursor) === '-'
    && cursor + 1 < source.length
    && source.charAt(cursor + 1) !== ']';
}

function readCharClass(source, index) {
  // a negated class matches nearly everything, so narrowing buys nothing
  if (source.charAt(index + 1) === '^') {
    return UNKNOWN;
  }

  var codes = [];
  var cursor = index + 1;

  while (cursor < source.length && source.charAt(cursor) !== ']') {
    var member = readClassMember(source, cursor);
    if (member === UNKNOWN) {
      return UNKNOWN;
    }
    cursor = member.end;

    if (isRangeStart(source, member, cursor)) {
      var upper = readClassMember(source, cursor + 1);
      if (upper === UNKNOWN || upper.codes.length !== 1) {
        return UNKNOWN;
      }
      appendCodes(codes, codeRange(member.codes[0], upper.codes[0]));
      cursor = upper.end;
    } else {
      appendCodes(codes, member.codes);
    }
  }

  if (cursor >= source.length) {
    return UNKNOWN;
  }
  return { codes: codes, end: cursor + 1 };
}

function findGroupEnd(source, index) {
  var depth = 0;
  var inClass = false;

  for (var cursor = index; cursor < source.length; cursor++) {
    var character = source.charAt(cursor);
    if (character === '\\') {
      cursor++;
    } else if (inClass) {
      inClass = character !== ']';
    } else if (character === '[') {
      inClass = true;
    } else if (character === '(') {
      depth++;
    } else if (character === ')') {
      depth--;
      if (depth === 0) {
        return cursor;
      }
    }
  }
  return -1;
}

function groupBodyStart(source, index) {
  if (source.substr(index, 3) === '(?:') {
    return index + 3;
  }
  if (source.substr(index, 2) === '(?') {
    return source.indexOf('>', index) + 1;
  }
  return index + 1;
}

function isLookaround(source, index) {
  var prefix = source.substr(index, 4);
  return prefix.substr(0, 3) === '(?=' || prefix.substr(0, 3) === '(?!'
    || prefix === '(?<=' || prefix === '(?<!';
}

function readGroup(source, index) {
  var end = findGroupEnd(source, index);
  if (end === -1) {
    return UNKNOWN;
  }
  // lookaround is zero-width; the following atom still bounds the first character
  if (isLookaround(source, index)) {
    return { codes: [], end: end + 1 };
  }

  var bodyStart = groupBodyStart(source, index);
  if (bodyStart <= index) {
    return UNKNOWN;
  }
  var codes = expressionFirstCodes(source.slice(bodyStart, end));
  if (codes === UNKNOWN) {
    return UNKNOWN;
  }
  return { codes: codes, end: end + 1 };
}

function readAtom(source, index) {
  var character = source.charAt(index);

  if (character === '^' || character === '$') {
    return { codes: [], end: index + 1 };
  }
  if (character === '\\') {
    return readEscape(source, index);
  }
  if (character === '[') {
    return readCharClass(source, index);
  }
  if (character === '(') {
    return readGroup(source, index);
  }
  if (character === '.' || character === '*' || character === '+' || character === '?' || character === ')') {
    return UNKNOWN;
  }
  return { codes: [source.charCodeAt(index)], end: index + 1 };
}

function readQuantifier(source, index) {
  var character = source.charAt(index);
  var end;
  var optional;

  if (character === '*' || character === '?') {
    optional = true;
    end = index + 1;
  } else if (character === '+') {
    optional = false;
    end = index + 1;
  } else if (character === '{') {
    var close = source.indexOf('}', index);
    var body = close === -1 ? '' : source.slice(index + 1, close);
    if (!COUNTED_QUANTIFIER.test(body)) {
      return { optional: false, end: index };
    }
    optional = parseInt(body, 10) === 0;
    end = close + 1;
  } else {
    return { optional: false, end: index };
  }

  if (source.charAt(end) === '?') {
    end++;
  }
  return { optional: optional, end: end };
}

function splitAlternatives(source) {
  var alternatives = [];
  var depth = 0;
  var inClass = false;
  var start = 0;

  for (var cursor = 0; cursor < source.length; cursor++) {
    var character = source.charAt(cursor);
    if (character === '\\') {
      cursor++;
    } else if (inClass) {
      inClass = character !== ']';
    } else if (character === '[') {
      inClass = true;
    } else if (character === '(') {
      depth++;
    } else if (character === ')') {
      depth--;
    } else if (character === '|' && depth === 0) {
      alternatives.push(source.slice(start, cursor));
      start = cursor + 1;
    }
  }

  alternatives.push(source.slice(start));
  return alternatives;
}

function alternativeFirstCodes(source) {
  var codes = [];
  var cursor = 0;

  while (cursor < source.length) {
    var atom = readAtom(source, cursor);
    if (atom === UNKNOWN) {
      return UNKNOWN;
    }
    var quantifier = readQuantifier(source, atom.end);
    cursor = quantifier.end;

    if (atom.codes.length) {
      appendCodes(codes, atom.codes);
      if (!quantifier.optional) {
        return codes;
      }
    }
  }

  // every atom was zero-width or optional, so the expression can match empty
  return UNKNOWN;
}

function expressionFirstCodes(source) {
  var alternatives = splitAlternatives(source);
  var codes = [];

  for (var index = 0; index < alternatives.length; index++) {
    var alternativeCodes = alternativeFirstCodes(alternatives[index]);
    if (alternativeCodes === UNKNOWN) {
      return UNKNOWN;
    }
    appendCodes(codes, alternativeCodes);
  }

  return codes;
}

/**
 * @param {RegExp} expression
 *
 * @return {number[]|null} Character codes a match can start with, or null when unknown.
 */

/**
 * Character codes a rule expression can start with. The result is always a
 * superset of the true set; null means the caller must always try the rule.
 *
 * @private
 */
Lexer.prototype.getFirstCharCodes = function (expression) {
  var codes = expressionFirstCodes(expression.source);
  if (codes === UNKNOWN || !codes.length) {
    return UNKNOWN;
  }
  return uniqueCodes(expression.ignoreCase ? withBothCases(codes) : codes);
};

if (typeof module === 'object' && typeof module.exports === 'object') {
  module.exports = Lexer;
} else {
  root.Lexer = Lexer;
}
}(typeof self === 'undefined' ? this : self));
