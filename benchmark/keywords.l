%option noyywrap nounput noinput
%%
[ \t\n]+                    ;
">="                        return { type: 'punct', value: yytext };
"<="                        return { type: 'punct', value: yytext };
"=="                        return { type: 'punct', value: yytext };
"("                         return { type: 'punct', value: yytext };
")"                         return { type: 'punct', value: yytext };
"{"                         return { type: 'punct', value: yytext };
"}"                         return { type: 'punct', value: yytext };
";"                         return { type: 'punct', value: yytext };
"="                         return { type: 'punct', value: yytext };
"+"                         return { type: 'punct', value: yytext };
"*"                         return { type: 'punct', value: yytext };
"-"                         return { type: 'punct', value: yytext };
"/"                         return { type: 'punct', value: yytext };
"<"                         return { type: 'punct', value: yytext };
">"                         return { type: 'punct', value: yytext };
"if"                        return { type: 'kw', value: yytext };
"else"                      return { type: 'kw', value: yytext };
"return"                    return { type: 'kw', value: yytext };
"null"                      return { type: 'kw', value: yytext };
[0-9]+                      return { type: 'int', value: yytext };
[a-zA-Z_][a-zA-Z0-9_]*      return { type: 'id', value: yytext };
%%
