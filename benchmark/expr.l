%option noyywrap nounput noinput
%%
[ \t\n]+                    ;
"//"[^\n]*                  ;
\"([^"\\]|\\.)*\"           return { type: 'str', value: yytext };
[0-9]+\.[0-9]+              return { type: 'float', value: yytext };
[0-9]+                      return { type: 'int', value: yytext };
let                         return { type: 'kw', value: yytext };
[a-zA-Z_][a-zA-Z0-9_]*      return { type: 'id', value: yytext };
[-+*/=();]                  return { type: 'op', value: yytext };
%%
