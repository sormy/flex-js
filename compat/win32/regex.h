/*
** POSIX regex for Windows, which has none.
**
** The implementation is the one gnulib brings with m4, already linked in.
** Its entry points carry the names gnulib gives a replacement, and it was
** built with offsets wide enough for a pointer, which is what decides how
** big a regmatch_t is. See docs/building.md.
*/

#ifndef FLEX_JS_COMPAT_REGEX_H
#define FLEX_JS_COMPAT_REGEX_H

#define _REGEX_LARGE_OFFSETS 1

#define regcomp  rpl_regcomp
#define regexec  rpl_regexec
#define regerror rpl_regerror
#define regfree  rpl_regfree

#include_next <regex.h>

#endif
