/*
** Tokens for JSON, which is where start conditions earn their keep: a string
** is scanned piece by piece and handed over whole.
**
**   npx flex-js --emit=javascript -o json.js json.l
*/

%option noyywrap yylineno
%x STRING

%%

"{"|"}"|"["|"]"|":"|","   return { kind: 'punctuation', value: yytext };
"true"|"false"            return { kind: 'boolean', value: yytext === 'true' };
"null"                    return { kind: 'null', value: null };
-?[0-9]+("."[0-9]+)?([eE][-+]?[0-9]+)?  return { kind: 'number', value: parseFloat(yytext) };

"\""                      { yy.text = ''; BEGIN(STRING); }
<STRING>"\""              { BEGIN(INITIAL); return { kind: 'string', value: yy.text }; }
<STRING>"\\n"             yy.text += '\n';
<STRING>"\\t"             yy.text += '\t';
<STRING>"\\\""            yy.text += '"';
<STRING>"\\\\"            yy.text += '\\';
<STRING>"\\/"             yy.text += '/';
<STRING>"\\b"             yy.text += '\b';
<STRING>"\\f"             yy.text += '\f';
<STRING>"\\r"             yy.text += '\r';
<STRING>"\\u"[0-9a-fA-F]{4} yy.text += String.fromCharCode(parseInt(yytext.slice(2), 16));
<STRING>"\\"(.|\n)?       return { kind: 'error', value: 'bad escape ' + JSON.stringify(yytext) };
<STRING>[^"\\]+           yy.text += yytext;
<STRING><<EOF>>           { BEGIN(INITIAL);
                            return { kind: 'error', value: 'unterminated string on line ' + yylineno }; }

[ \t\n\r]+                ;
.                         return { kind: 'error', value: 'unexpected ' + JSON.stringify(yytext) };

%%

module.exports.tokenize = function (text) {
  var scanner = new Scanner(text);
  scanner.yy = { text: '' };
  var tokens = [];
  var token;
  while ((token = scanner.lex()) !== 0) {
    tokens.push(token);
  }
  return tokens;
};
