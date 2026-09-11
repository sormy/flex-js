/*
** sys/wait.h for Windows, which has none.
**
** flex forks m4; --preproc=0 means it never does, so these only have to
** compile. execvp mingw declares itself. See docs/building.md.
*/

#ifndef FLEX_JS_COMPAT_SYS_WAIT_H
#define FLEX_JS_COMPAT_SYS_WAIT_H

#include <errno.h>

#define WIFEXITED(status)   (1)
#define WEXITSTATUS(status) ((status) & 0xff)
#define WIFSIGNALED(status) (0)
#define WTERMSIG(status)    (0)
#define WNOHANG             1

static int wait(int *status)
{
	(void) status;
	errno = ECHILD;
	return -1;
}

static int waitpid(int pid, int *status, int options)
{
	(void) pid;
	(void) status;
	(void) options;
	errno = ECHILD;
	return -1;
}

static int pipe(int fds[2])
{
	(void) fds;
	errno = ENOSYS;
	return -1;
}

static int fork(void)
{
	errno = ENOSYS;
	return -1;
}

#endif
