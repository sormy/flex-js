# Examples

| grammar                      | what it shows                                                                |
| ---------------------------- | ---------------------------------------------------------------------------- |
| [calculator.l](calculator.l) | definitions, `yylineno`, a rule that throws its match away                   |
| [json.l](json.l)             | start conditions, building a token across several matches, an `<<EOF>>` rule |
| [words.l](words.l)           | UTF-8: matching characters rather than bytes                                 |

Generate and run one:

```sh
npx flex-js --emit=javascript -o calculator.js calculator.l
node -e "console.log(require('./calculator.js').tokenize('2 * (3 + x)'))"
```
