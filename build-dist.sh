#!/bin/sh
#
# Builds the generators shipped to npm, one per platform.
#
# The generator is flex, so it needs a flex to build its own scanner. The
# host build in ./build makes that, and the sources it wrote are copied into
# a clean tree that each target configures for itself. macOS is built with
# the system compiler so the arm64 slice carries the signature it needs; the
# rest come from zig.

set -e

here=$(cd "$(dirname "$0")" && pwd)
work=$here/build/dist
source=$here/build/flex

smoke=yes
smoke_only=no

# m4 is linked into every generator, from the tree build.sh fetched and patched.
m4_version=1.4.19
m4_src=$here/build/m4-$m4_version

# WINE names it; otherwise look where the app bundles and the package managers
# put it. The bundles' own MacOS/wine is a launcher that drops arguments, so
# the one under Resources is the one worth finding.
find_wine() {
	if [ -n "${WINE:-}" ]; then
		echo "$WINE"
		return
	fi

	for prefix in /Applications "$HOME/Applications"; do
		for variant in "Wine Staging" "Wine Stable" "Wine Devel" "Wine"; do
			candidate="$prefix/$variant.app/Contents/Resources/wine/bin/wine"
			if [ -x "$candidate" ]; then
				echo "$candidate"
				return
			fi
		done
	done

	for candidate in \
		/opt/homebrew/bin/wine /usr/local/bin/wine /usr/bin/wine \
		/opt/homebrew/bin/wine64 /usr/local/bin/wine64 /usr/bin/wine64
	do
		if [ -x "$candidate" ]; then
			echo "$candidate"
			return
		fi
	done

	command -v wine 2>/dev/null || command -v wine64 2>/dev/null || echo ""
}

wine=$(find_wine)

for argument in "$@"; do
	case $argument in
		--no-smoke) smoke=no ;;
		--smoke-only) smoke_only=yes ;;
	esac
done

if [ ! -x "$source/src/flex" ] || [ ! -x "$m4_src/configure" ]; then
	echo "run ./build.sh first" >&2
	exit 1
fi

if [ "$smoke_only" = no ]; then
	rm -rf "$work"
	mkdir -p "$work" "$here/dist"

	# A tree without the host's configuration, keeping the scanner and parser
	# the host build generated: a cross build cannot run the flex it is
	# building.
	rsync -a \
		--exclude 'config.status' --exclude 'Makefile' --exclude 'config.h' \
		--exclude 'config.log' --exclude 'stamp-h1' --exclude '.deps' \
		--exclude '*.o' --exclude '*.lo' --exclude '.libs' --exclude 'dist' \
		"$source/" "$work/source/"
fi

# m4 goes into the generator, so it is cross-built for the same target first.
# Its own binary has no main to link any more; the objects are what flex wants,
# and flex linking against them is what says they all arrived.
build_m4() {
	name=$1
	host=$2
	compiler=$3

	# The archiver has to understand the target's objects: Apple's ar makes an
	# archive with nothing in it out of ELF or COFF ones, and says nothing.
	case $compiler in
		"zig cc"*) archiver="zig ar"; indexer="zig ranlib" ;;
		*)         archiver=ar;       indexer=ranlib ;;
	esac

	echo "building m4 for $name"
	rm -rf "$work/m4-$name"
	mkdir -p "$work/m4-$name"
	(
		cd "$work/m4-$name"
		if ! CC="$compiler" AR="$archiver" RANLIB="$indexer" \
				CFLAGS="-O2 -g0" "$m4_src/configure" \
				--host="$host" --quiet >"$work/m4-$name.log" 2>&1; then
			cat "$work/m4-$name.log" >&2
			exit 1
		fi
		make >>"$work/m4-$name.log" 2>&1 || true
		if [ -z "$(find src -name 'output.o' -o -name 'output.obj')" ]; then
			cat "$work/m4-$name.log" >&2
			exit 1
		fi
	)
}

# What linking m4 in takes: its objects, then whatever its own build says it
# needs, asked of that build rather than guessed at here.
m4_link_flags() {
	dir=$1

	printf 'flex_js_libs:\n\t@echo $(LDADD)\n' > "$dir/src/flex-js.mk"
	echo "$(find "$dir/src" -name '*.o' -o -name '*.obj' | sort | tr '\n' ' ') \
$(make -s -C "$dir/src" -f Makefile -f flex-js.mk flex_js_libs \
	| sed "s|\.\./lib/libm4\.a|$dir/lib/libm4.a|")"
}

build_one() {
	name=$1
	host=$2
	compiler=$3
	target=${4:-flex}
	windows=$5

	build_m4 "$name" "$host" "$compiler"
	m4_flags=$(m4_link_flags "$work/m4-$name")

	echo "building $name"
	rm -rf "$work/$name"
	mkdir -p "$work/$name"
	(
		cd "$work/$name"

		if [ "$windows" = windows ]; then
			# Windows has no POSIX regex and no byte-swapping header. The
			# regex comes from the gnulib m4 brings with it, which is the
			# same one everywhere else; compat/win32 stands in for the rest.
			CPPFLAGS="-I$here/compat/win32 -I$m4_src/lib"
			ac_cv_header_regex_h=yes
			ac_cv_header_netinet_in_h=yes
			ac_cv_func_regcomp=yes
			ac_cv_func_dup2=yes
			export CPPFLAGS ac_cv_header_regex_h \
				ac_cv_header_netinet_in_h ac_cv_func_regcomp ac_cv_func_dup2

			# glibc's fortified headers name this and mingw has none; bcrypt
			# is what gnulib draws randomness from there.
			$compiler -O2 -c -o "$work/m4-$name/mempcpy_chk.o" \
				"$here/compat/win32/mempcpy_chk.c"
			m4_flags="$m4_flags $work/m4-$name/mempcpy_chk.o -lbcrypt"
		fi

		CC="$compiler" CFLAGS="-O2 -g0" "$work/source/configure" \
			--host="$host" --quiet >/dev/null
		# flex builds its own scanner with itself, and a cross build cannot run
		# what it just built. Building that stage first, then putting the
		# host's copy of its output in place, leaves make with nothing to run.
		make -C src "stage1flex${target#flex}" FLEX_JS_M4="$m4_flags" \
			FLEX_JS_M4_FOR_BUILD="$m4_for_build" >/dev/null 2>&1 || true
		cp "$source/src/stage1scan.c" src/stage1scan.c
		touch src/stage1scan.c
		# Kept rather than shown, since a working build is loud about
		# warnings; a failing one has nothing else to say for itself.
		if ! make -C src "$target" FLEX_JS_M4="$m4_flags" \
				FLEX_JS_M4_FOR_BUILD="$m4_for_build" \
				>"$work/$name.log" 2>&1; then
			cat "$work/$name.log" >&2
			exit 1
		fi
	)
}

# Every binary writes the same scanner from the same grammar, so the one built
# here is the reference and the others have to match it.
smoke_grammar() {
	cat > "$work/smoke.l" <<'GRAMMAR'
%option noyywrap yylineno
%x COMMENT
%%
"/*"            BEGIN(COMMENT);
<COMMENT>"*/"   BEGIN(INITIAL);
<COMMENT>.|\n   ;
"if"            return { kind: 'keyword', text: yytext };
[a-z]+          return { kind: 'word', text: yytext };
[0-9]+          return { kind: 'number', text: yytext };
[ \t\n]+        ;
.               return { kind: 'other', text: yytext };
%%
GRAMMAR
	mkdir -p "$work/out-reference"
	FLEX_JS="$source/src/flex" node "$here/bin/cli.js" --emit=javascript \
		-o "$work/out-reference/scanner.js" "$work/smoke.l"
	sed "s#out-reference/#X/#g" "$work/out-reference/scanner.js" \
		> "$work/smoke-reference.js"
}

# Each generator is driven the way a user drives it: through bin/cli.js.
# FLEX_JS names one program, so a runner that needs arguments gets a wrapper.
smoke_one() {
	name=$1
	shift

	runner=$work/run-$name
	{
		printf '#!/bin/sh\nexec'
		for word in "$@"; do
			# a quote inside the word ends the quoting, so it is closed,
			# escaped and opened again
			printf " '%s'" "$(printf '%s' "$word" | sed "s/'/'\\\\''/g")"
		done
		printf ' "$@"\n'
	} > "$runner"
	chmod +x "$runner"

	# cleared, or a run that writes nothing is compared against the last one
	rm -rf "$work/out-$name"
	mkdir -p "$work/out-$name"
	# The scratch flex writes the m4 source to has to be somewhere a container
	# can see, which is what TMPDIR names.
	if ! TMPDIR="$work" FLEX_JS="$runner" node "$here/bin/cli.js" \
			--emit=javascript -o "$work/out-$name/scanner.js" "$work/smoke.l" \
			>/dev/null 2>&1; then
		echo "  $name: failed to run"
		smoke_failures=$((smoke_failures + 1))
		return
	fi

	if [ ! -f "$work/out-$name/scanner.js" ]; then
		echo "  $name: wrote no scanner"
		smoke_failures=$((smoke_failures + 1))
		return
	fi

	# The directives name the file each run wrote, which is all that may differ
	sed "s#out-$name/#X/#g" "$work/out-$name/scanner.js" > "$work/smoke-$name.js"

	if cmp -s "$work/smoke-reference.js" "$work/smoke-$name.js"; then
		echo "  $name: matches"
	else
		echo "  $name: output differs from the reference"
		smoke_failures=$((smoke_failures + 1))
	fi
}

smoke_all() {
	echo "smoke testing"
	smoke_failures=0
	smoke_unverified=""
	smoke_grammar

	# A C++ scanner is no use without it, and it ships rather than being
	# looked for on the system.
	if [ ! -f "$here/dist/FlexLexer.h" ]; then
		echo "  FlexLexer.h: missing from dist/"
		smoke_failures=$((smoke_failures + 1))
	fi

	if [ -x "$here/dist/flex-js-darwin-universal" ]; then
		smoke_one darwin "$here/dist/flex-js-darwin-universal"
	else
		echo "  darwin: skipped, not built"
		smoke_unverified="$smoke_unverified darwin"
	fi

	if command -v finch >/dev/null 2>&1; then
		smoke_one linux-arm64 finch run --rm -e TMPDIR \
			-v "$here:$here" -w "$work" --platform linux/arm64 \
			public.ecr.aws/docker/library/alpine:latest \
			"$here/dist/flex-js-linux-arm64"
		smoke_one linux-x64 finch run --rm -e TMPDIR \
			-v "$here:$here" -w "$work" --platform linux/amd64 \
			public.ecr.aws/docker/library/alpine:latest \
			"$here/dist/flex-js-linux-x64"
	else
		echo "  linux: skipped, no finch"
		smoke_unverified="$smoke_unverified linux"
	fi

	if [ -x "$wine" ]; then
		smoke_one win32-x64 "$wine" "$here/dist/flex-js-win32-x64.exe"

		# An x86_64 wine loads no arm64 binary, and every build of it for
		# macOS is one so far. Asking is what says whether this one is.
		if "$wine" "$here/dist/flex-js-win32-arm64.exe" --version \
				>/dev/null 2>&1; then
			smoke_one win32-arm64 "$wine" \
				"$here/dist/flex-js-win32-arm64.exe"
		else
			# win32 itself is covered by the x64 run above, so this is
			# said rather than counted against the build.
			echo "  win32-arm64: skipped, this wine runs no arm64 binary"
		fi
	else
		echo "  win32: skipped, no wine"
		smoke_unverified="$smoke_unverified win32"
	fi

	if [ "$smoke_failures" -gt 0 ]; then
		echo "$smoke_failures binaries did not match the reference" >&2
	fi

	if [ -n "$smoke_unverified" ]; then
		# a platform none of whose binaries ran has nothing standing behind it
		echo "no binary ran for:$smoke_unverified" >&2
	fi

	if [ "$smoke_failures" -gt 0 ] || [ -n "$smoke_unverified" ]; then
		exit 1
	fi
}

if [ "$smoke_only" = yes ]; then
	mkdir -p "$work"
	smoke_all
	exit 0
fi

# stage1flex is built for the build machine even in a cross build, so it takes
# the m4 build.sh made here. Asked for after the smoke-only exit, since it
# builds in a tree a smoke test does not need.
m4_for_build=$(m4_link_flags "$here/build/m4")

# macOS, both slices, joined into one binary
build_one mac-x64 x86_64-apple-darwin "clang -arch x86_64 -mmacosx-version-min=10.13"
build_one mac-arm64 aarch64-apple-darwin "clang -arch arm64 -mmacosx-version-min=11.0"
lipo -create "$work/mac-x64/src/flex" "$work/mac-arm64/src/flex" \
	-output "$here/dist/flex-js-darwin-universal"
strip -x "$here/dist/flex-js-darwin-universal" 2>/dev/null || true

build_one linux-x64 x86_64-linux-musl "zig cc -target x86_64-linux-musl"
cp "$work/linux-x64/src/flex" "$here/dist/flex-js-linux-x64"

build_one linux-arm64 aarch64-linux-musl "zig cc -target aarch64-linux-musl"
cp "$work/linux-arm64/src/flex" "$here/dist/flex-js-linux-arm64"

build_one win32-x64 x86_64-w64-mingw32 "zig cc -target x86_64-windows-gnu" \
	flex.exe windows
# libtool leaves a wrapper where the binary is expected; the real one is
# under .libs, and the wrapper cannot run anywhere but the build tree.
cp "$work/win32-x64/src/.libs/flex.exe" "$here/dist/flex-js-win32-x64.exe"

build_one win32-arm64 aarch64-w64-mingw32 "zig cc -target aarch64-windows-gnu" \
	flex.exe windows
cp "$work/win32-arm64/src/.libs/flex.exe" "$here/dist/flex-js-win32-arm64.exe"

# The C++ back end's scanner includes this, and it has to be the one belonging
# to the same flex, so it ships beside the binaries rather than being looked for
# on the system.
cp "$source/src/FlexLexer.h" "$here/dist/FlexLexer.h"

rm -f "$here"/dist/*.pdb
ls -l "$here/dist"

if [ "$smoke" = yes ]; then
	smoke_all
fi
