/**
 * FLEX.JS - FLEX-like lexer.
 *
 * @class Lexer
 */
function Lexer() {
  this.isNode = typeof window === 'undefined';
  this.idRegExp = /[a-z_][a-z0-9_-]*/i;

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
  this.states = {};
  this.definitions = [];
  this.rules = {};
  this.ignoreCase = false;
  this.debugEnabled = false;

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
 * Add additional state
 *
 * @param {string}  name
 * @param {boolean} [exclusive]
 */
Lexer.prototype.addState = function (name, exclusive) {
  this.states[name] = { name: name, exclusive: !!exclusive };
}

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

  this.definitions[name] = expression;
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
  if (states === undefined || states === null) {
    // convert default state into list of target states
    states = [];
    for (var index in this.states) {
      var state = this.states[index];
      if (!state.exclusive) {
        states.push(state.name);
      }
    }
  } else if (states === Lexer.STATE_ANY) {
    // convert any state into list of target states
    states = [];
    for (var index in this.states) {
      var state = this.states[index];
      states.push(state.name);
    }
  } else if (typeof states === 'string') {
    // convert single state into list of target states
    states = [states];
  }

  // filter empty states
  states = states.filter(function (state) { return !!state; });

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

  if (expression === Lexer.RULE_EOF) {
    source = null;
  } else if (typeof expression === 'string') {
    if (expression.length === 0) {
      throw new Error('Empty expression for rule used in states "' + states.join(', ') + '"');
    }
    source = this.escapeRegExp(expression);
    fixedWidth = expression.length;
    flags = '';
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

  var compiledExpression = source === null ? null : this.compileRuleExpression(source, flags);
  var hasBOL = compiledExpression === null ? null : this.isRegExpMatchBOL(compiledExpression);
  var hasEOL = compiledExpression === null ? null : this.isRegExpMatchEOL(compiledExpression);
  var isEOF = source === null;

  var rule = {
    expression: compiledExpression,
    hasBOL: hasBOL,
    hasEOL: hasEOL,
    isEOF: isEOF,
    action: action,
    fixedWidth: fixedWidth // used for weighted match optmization
  };

  for (var index in states) {
    var state = states[index];
    if (!this.rules[state]) {
      this.rules[state] = [];
    }
    this.rules[state].push(rule);
  }
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
  for (var index in rules) {
    var rule = rules[index];
    this.addStateRule(states, rule.expression, rule.action);
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
  this.source = source;
  this.index = 0;
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
  } while (result === undefined && result !== Lexer.EOF);

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
  if (this.isNode) {
    process.stdout.write(this.text);
  } else {
    console.log(this.text);
  }
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
  this.index -= this.text.length;
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
    this.source = newSource;
  }
  this.index = 0;
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
  var matchedValueLength = 0; // could be 1 char more than matchedValue for expressions with $ at end

  var rules = this.rules[this.state] || [];
  for (var index in rules) {
    if (this.rejectedRules.indexOf(index) !== -1) {
      continue;
    }

    var rule = rules[index];

    if (isEOF) {
      // skip non EOF rules
      if (rule.isEOF) {
        matchedRule = rule;
        matchedIndex = index;
        matchedValue = '';
        // no need to search for other EOF rules
        break;
      }
    } else {
      if (rule.fixedWidth === undefined
        || rule.fixedWidth > matchedValueLength
      ) {
        var curMatch = this.execRegExp(rule.expression);
        if (curMatch !== undefined) {
          var curMatchLength = curMatch.length;

          if (rule.hasBOL) {
            curMatchLength++;
          }
          if (rule.hasEOL) {
            curMatchLength++;
          }

          if (curMatchLength > matchedValueLength) {
            matchedRule = rule;
            matchedIndex = index;
            matchedValue = curMatch;
            matchedValueLength = curMatchLength;
          }
        }
      }
    }
  }

  if (matchedRule && this.debugEnabled) {
    this.logAccept(this.state, matchedRule.expression, matchedValue);
  }

  this.ruleIndex = matchedIndex;
  this.text = this.readMore ? this.text : '';
  this.readMore = false

  if (!matchedRule) {
    if (!isEOF) {
      this.text += this.source.charAt(this.index);
      this.index++;
      return this.echo();
    } else {
      this.text = '';
      return this.terminate();
    }
  }

  this.text += matchedValue;
  this.index += this.text.length;

  var rejectedBefore = this.rejectedRules.length;
  var actionResult = matchedRule.action ? matchedRule.action(this) : this.discard();
  var hasRejection = this.rejectedRules.length > rejectedBefore;

  // reset reject state if there is no rejection in last action
  if (hasRejection) {
    // ignore result if there is rejection in action
    return;
  }

  this.rejectedRules = [];

  // rule action could change buffer or position, so EOF state could be changed too
  // we need revalidate EOF only if EOF was identified before action were executed
  if (isEOF) {
    isEOF = this.index >= this.source.length;
  }

  return isEOF ? this.terminate() : actionResult;
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
Lexer.prototype.execRegExp = function (re) {
  re.lastIndex = this.index;
  var result = re.exec(this.source);
  return result ? result[0] : undefined;
}

/**
 * @private
 */
Lexer.prototype.compileRuleExpression = function (source, flags) {
  for (var defName in this.definitions) {
    var defExpression = this.definitions[defName];
    var defNameRe = new RegExp('{' + defName + '}', 'ig');
    source = source.replace(defNameRe, '(?:' + defExpression + ')');
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
 * @private
 */
Lexer.prototype.isRegExpMatchBOL = function(re) {
  // primitive detection but in most cases it is more than enough
  return re.source.substr(0, 1) === '^';
}

/**
 * @private
 */
Lexer.prototype.isRegExpMatchEOL = function(re) {
  // primitive detection but in most cases it is more than enough
  return re.source.substr(-1) === '$';
}

module.exports = Lexer;
