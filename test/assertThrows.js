var assert = require('node:assert');

/**
 * assert.throws matching the message by substring, so a caller can give the
 * text plainly rather than escaping it into an expression.
 *
 * @param {function} block
 * @param {string}   message
 */
module.exports = function assertThrows(block, message) {
  assert.throws(block, function (error) {
    assert.ok(error.message.indexOf(message) !== -1,
      'expected ' + JSON.stringify(error.message) + ' to contain ' + JSON.stringify(message));
    return true;
  });
};
