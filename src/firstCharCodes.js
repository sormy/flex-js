/**
 * Character codes a rule expression can start with.
 *
 * The result is always a superset of the true set; UNKNOWN means the caller
 * must always try the rule.
 */

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
module.exports = function firstCharCodes(expression) {
  var codes = expressionFirstCodes(expression.source);
  if (codes === UNKNOWN || !codes.length) {
    return UNKNOWN;
  }
  return uniqueCodes(expression.ignoreCase ? withBothCases(codes) : codes);
};
