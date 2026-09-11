/*
** POSIX regex for Windows, which has none.
**
** flex uses it only to renumber line directives, so this never matches and
** that renumbering does not happen there. See docs/building.md.
*/

#ifndef FLEX_JS_COMPAT_REGEX_H
#define FLEX_JS_COMPAT_REGEX_H

#include <stddef.h>
#include <string.h>

typedef struct {
	size_t re_nsub;
} regex_t;

typedef long regoff_t;

typedef struct {
	regoff_t rm_so;
	regoff_t rm_eo;
} regmatch_t;

#define REG_EXTENDED 1
#define REG_ICASE    2
#define REG_NEWLINE  4
#define REG_NOSUB    8
#define REG_NOTBOL   16
#define REG_NOTEOL   32
#define REG_NOMATCH  1

static int regcomp(regex_t *preg, const char *pattern, int flags)
{
	(void) pattern;
	(void) flags;
	if (preg) {
		preg->re_nsub = 0;
	}
	return 0;
}

static int regexec(const regex_t *preg, const char *string, size_t nmatch,
		   regmatch_t pmatch[], int flags)
{
	(void) preg;
	(void) string;
	(void) flags;
	if (pmatch) {
		size_t index;
		for (index = 0; index < nmatch; index++) {
			pmatch[index].rm_so = -1;
			pmatch[index].rm_eo = -1;
		}
	}
	return REG_NOMATCH;
}

static void regfree(regex_t *preg)
{
	(void) preg;
}

static size_t regerror(int code, const regex_t *preg, char *buffer, size_t size)
{
	static const char message[] = "regular expressions are not built in";
	(void) code;
	(void) preg;
	if (buffer && size) {
		strncpy(buffer, message, size - 1);
		buffer[size - 1] = '\0';
	}
	return sizeof(message);
}

#endif
