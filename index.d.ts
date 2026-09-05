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

  setIgnoreCase(ignoreCase: boolean): void;

  setDebugEnabled(debugEnabled: boolean): void;

  /** With the default rule off, unmatched input raises an error, FLEX's %option nodefault. */
  setDefaultRuleEnabled(defaultRuleEnabled: boolean): void;

  /** Where echo() writes, FLEX's yyout. */
  setOutput(output: Lexer.Output | ((text: string) => void)): void;

  addState(name: string, exclusive?: boolean): void;

  addDefinition(name: string, expression: string | RegExp): void;

  /** Add a rule to every inclusive start condition. */
  addRule(expression: string | RegExp, action?: Lexer.Action<TToken>): void;

  addRules(rules: Array<Lexer.Rule<TToken>>): void;

  /** Passing null or undefined for states adds to every inclusive start condition. */
  addStateRule(
    states: string | string[] | null | undefined,
    expression: string | RegExp,
    action?: Lexer.Action<TToken>
  ): void;

  addStateRules(
    states: string | string[] | null | undefined,
    rules: Array<Lexer.Rule<TToken>>
  ): void;

  setSource(source: string): void;

  /** Scan until an action returns a token, or the input is exhausted. */
  lex(): TToken | 0;

  /** Scan to the end, collecting everything the actions returned. */
  lexAll(): TToken[];

  discard(): undefined;

  echo(): void;

  /** Switch start condition, to INITIAL when none is given. */
  begin(state?: string): void;

  reject(): void;

  more(): void;

  less(n: number): void;

  unput(s: string): void;

  input(n?: number): string;

  terminate(): 0;

  /** Rewind, to a new source when one is given. */
  restart(newSource?: string): void;

  pushState(state: string): void;

  topState(): string | undefined;

  popState(): void;

  switchState(state?: string): void;

  /** Throw a Lexer.Error naming the position the current token starts at. */
  error(message: string): never;
}

declare namespace Lexer {
  /** Returning a value emits it as a token; returning nothing discards the match. */
  type Action<TToken> = (lexer: Lexer<TToken>) => TToken | void;

  interface Rule<TToken> {
    expression: string | RegExp;
    action?: Action<TToken>;
  }

  /** Anything echo() can write to, a writable stream for instance. */
  interface Output {
    write(text: string): void;
    flush?(): void;
  }

  interface Error extends globalThis.Error {
    line: number;
    column: number;
    text: string;
  }
}

export = Lexer;
