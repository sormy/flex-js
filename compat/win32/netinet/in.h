/*
** netinet/in.h for Windows, which keeps these in winsock2.h behind an
** initialisation flex has no reason to perform.
*/

#ifndef FLEX_JS_COMPAT_NETINET_IN_H
#define FLEX_JS_COMPAT_NETINET_IN_H

#include <stdint.h>

/* Every Windows target is little-endian, so these swap unconditionally. */
#if defined(__BYTE_ORDER__) && __BYTE_ORDER__ != __ORDER_LITTLE_ENDIAN__
#error "flex-js builds no big-endian Windows target"
#endif

static uint32_t htonl(uint32_t value)
{
	return ((value & 0xff000000u) >> 24) | ((value & 0x00ff0000u) >> 8) |
	       ((value & 0x0000ff00u) << 8) | ((value & 0x000000ffu) << 24);
}

static uint16_t htons(uint16_t value)
{
	return (uint16_t) (((value & 0xff00u) >> 8) | ((value & 0x00ffu) << 8));
}

static uint32_t ntohl(uint32_t value)
{
	return htonl(value);
}

static uint16_t ntohs(uint16_t value)
{
	return htons(value);
}

#endif
