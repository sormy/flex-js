/*
** Counting words in text that is not necessarily English.
**
** The scanner reads UTF-8, so a rule about a character is a rule about its
** bytes. UTF8 names the shape of one character, which is how a FLEX grammar
** matches characters rather than bytes.
**
**   npx flex-js --emit=javascript -o words.js words.l
*/

%option noyywrap

UTF8    [\x20-\x7f]|[\xc2-\xdf][\x80-\xbf]|[\xe0-\xef][\x80-\xbf]{2}|[\xf0-\xf4][\x80-\xbf]{3}
LETTER  [a-zA-Z]|[\xc2-\xdf][\x80-\xbf]|[\xe0-\xef][\x80-\xbf]{2}

%%

{LETTER}+       return { kind: 'word', value: yytext, length: yyleng };
[0-9]+          return { kind: 'number', value: yytext };
[ \t\n]+        ;
{UTF8}          return { kind: 'other', value: yytext };

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
