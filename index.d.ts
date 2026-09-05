/**
 * FLEX.JS - FLEX-like lexer.
 *
 * The type parameter is whatever the rule actions return, which is what lex()
 * hands back and what lexAll() collects.
 */
declare class Lexer<TToken = unknown> {
  /** End of file indicator, returned by lex() when the input is exhausted. */
  static readonly EOF: 0;

  /** Default initial inclusive start condition. */
  static readonly STATE_INITIAL: 'INITIAL';

  /** Start condition matching any inclusive or exclusive one. */
  static readonly STATE_ANY: '*';

  /** Rule expression standing for an end of file. */
  static readonly RULE_EOF: '<<EOF>>';

  /** Text of the current token. May be modified. */
  text: string;

  /** Line of the first character of the current token, counting from one. */
  readonly line: number;

  /** Column of the first character of the current token, counting from one. */
  readonly column: number;

  /** Name of the current start condition. */
  state: string;

  /** String being scanned. */
  source: string;

  /** Current position in the source. */
  index: number;

  /** Drop the scanning state, keeping rules, definitions and options. */
  reset(): void;

  /** Drop the configuration as well, leaving the lexer as constructed. */
  clear(): void;

  /** Match without regard to case. Only affects rules added afterwards. */
  setIgnoreCase(ignoreCase: boolean): void;

  /** Compile rules as unicode expressions. Off by default. */
  setUnicode(unicode: boolean): void;

  /** Log the start condition, expression and text of every accepted rule. */
  setDebugEnabled(debugEnabled: boolean): void;

  /** With the default rule off, unmatched input raises an error, FLEX's %option nodefault. */
  setDefaultRuleEnabled(defaultRuleEnabled: boolean): void;

  /** Where echo() writes, FLEX's yyout. */
  setOutput(output: Lexer.Output | ((text: string) => void)): void;

  /** Declare a start condition, exclusive to hide rules that name no condition. */
  addState(name: string, exclusive?: boolean): void;

  /** Name an expression, for `{name}` to stand for in later patterns. Only the `u` flag is allowed, and only with unicode on. */
  addDefinition(name: string, expression: string | RegExp): void;

  /** Add a rule to every inclusive start condition. */
  addRule(expression: string | RegExp, action?: Lexer.Action<TToken>): void;

  /** Add several rules to every inclusive start condition. */
  addRules(rules: Array<Lexer.Rule<TToken>>): void;

  /** Passing null or undefined for states adds to every inclusive start condition. */
  addStateRule(
    states: string | string[] | null | undefined,
    expression: string | RegExp,
    action?: Lexer.Action<TToken>
  ): void;

  /** Add several rules to the given start conditions. */
  addStateRules(
    states: string | string[] | null | undefined,
    rules: Array<Lexer.Rule<TToken>>
  ): void;

  /** Set the string to scan, starting from its beginning. */
  setSource(source: string): void;

  /** Scan until an action returns a token, or the input is exhausted. */
  lex(): TToken | 0;

  /** Scan to the end, collecting everything the actions returned. */
  lexAll(): TToken[];

  /** Throw the match away, which is what leaving out an action does. */
  discard(): undefined;

  /** Write the current token to the output, FLEX's ECHO. */
  echo(): void;

  /** Switch start condition, to INITIAL when none is given. */
  begin(state?: string): void;

  /** Give up this match for the next best rule at the same position, FLEX's REJECT. */
  reject(): void;

  /** Append the next match to the current token instead of replacing it, FLEX's yymore. */
  more(): void;

  /** Return all but the first n characters of the token to the input, FLEX's yyless. */
  less(n: number): void;

  /** Put text back in front of the scanner. */
  unput(s: string): void;

  /** Read the next n characters, answering '' once the input is exhausted. */
  input(n?: number): string;

  /** Stop scanning and answer EOF, FLEX's yyterminate. */
  terminate(): 0;

  /** Rewind, to a new source when one is given. */
  restart(newSource?: string): void;

  /** Switch start condition, remembering the one being left. */
  pushState(state: string): void;

  /** The remembered start condition, or undefined when none is. */
  topState(): string | undefined;

  /** Return to the start condition pushState remembered. */
  popState(): void;

  /** Switch start condition, the same as begin(). */
  switchState(state?: string): void;

  /** Throw a Lexer.Error naming the position the current token starts at. */
  error(message: string): never;
}

declare namespace Lexer {
  /** Returning a value emits it as a token; returning nothing discards the match. */
  type Action<TToken> = (lexer: Lexer<TToken>) => TToken | void;

  /** A pattern and what to do when it matches. */
  interface Rule<TToken> {
    expression: string | RegExp;
    action?: Action<TToken>;
  }

  /** Anything echo() can write to, a writable stream for instance. */
  interface Output {
    write(text: string): void;
    flush?(): void;
  }

  /** What error() throws, carrying where in the input it happened. */
  interface Error extends globalThis.Error {
    line: number;
    column: number;
    text: string;
  }
}

export = Lexer;
