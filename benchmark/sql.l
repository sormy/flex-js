%option noyywrap nounput noinput
%%
[ \t\n]+                    ;
"SELECT"                    return { type: 'kw', value: yytext };
"FROM"                      return { type: 'kw', value: yytext };
"WHERE"                     return { type: 'kw', value: yytext };
"AND"                       return { type: 'kw', value: yytext };
"OR"                        return { type: 'kw', value: yytext };
"NOT"                       return { type: 'kw', value: yytext };
"IN"                        return { type: 'kw', value: yytext };
'[^']*'                     return { type: 'str', value: yytext };
[0-9]+                      return { type: 'int', value: yytext };
[a-zA-Z_][a-zA-Z0-9_]*      return { type: 'id', value: yytext };
"<="                        return { type: 'punct', value: yytext };
">="                        return { type: 'punct', value: yytext };
"<>"                        return { type: 'punct', value: yytext };
"="                         return { type: 'punct', value: yytext };
"<"                         return { type: 'punct', value: yytext };
">"                         return { type: 'punct', value: yytext };
"+"                         return { type: 'punct', value: yytext };
"-"                         return { type: 'punct', value: yytext };
"*"                         return { type: 'punct', value: yytext };
"/"                         return { type: 'punct', value: yytext };
"("                         return { type: 'punct', value: yytext };
")"                         return { type: 'punct', value: yytext };
","                         return { type: 'punct', value: yytext };
";"                         return { type: 'punct', value: yytext };
%%
