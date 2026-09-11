/*
** Tokens for a calculator, the smallest grammar worth writing.
**
**   npx flex-js --emit=javascript -o calculator.js calculator.l
*/

%option noyywrap yylineno

DIGIT   [0-9]
NUMBER  {DIGIT}+("."{DIGIT}+)?

%%

{NUMBER}        return { kind: 'number', value: parseFloat(yytext), line: yylineno };
[a-zA-Z_][a-zA-Z0-9_]*  return { kind: 'name', value: yytext, line: yylineno };
"+"|"-"|"*"|"/" return { kind: 'operator', value: yytext, line: yylineno };
"("|")"         return { kind: 'bracket', value: yytext, line: yylineno };
[ \t\n]+        ;
"#"[^\n]*       ;
.               return { kind: 'unexpected', value: yytext, line: yylineno };

%%

module.exports.tokenize = function (text) {
  var scanner = new Scanner(text);
  var tokens = [];
  var token;
  while ((token = scanner.lex()) !== 0) {
    tokens.push(token);
  }
  return tokens;
};
