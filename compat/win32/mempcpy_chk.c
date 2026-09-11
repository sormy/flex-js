/* __mempcpy_chk, which glibc's fortified headers reference and mingw lacks. */

#include <stdlib.h>
#include <string.h>

void *__mempcpy_chk(void *dest, const void *src, size_t n, size_t destlen)
{
	/* The check is the whole point of the fortified name. */
	if (n > destlen)
		abort();

	return (char *) memcpy(dest, src, n) + n;
}
