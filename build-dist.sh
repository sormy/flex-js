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
m4=yes
m4_version=1.4.19
m4_sha256=3be4a26d825ffdfda52a56fc43246456989a3630093cced3fbddf4771ee58a70

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
		--no-m4) m4=no ;;
		--smoke-only) smoke_only=yes ;;
	esac
done

if [ ! -x "$source/src/flex" ]; then
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

build_one() {
	name=$1
	host=$2
	compiler=$3
	target=${4:-flex}
	windows=$5

	echo "building $name"
	rm -rf "$work/$name"
	mkdir -p "$work/$name"
	(
		cd "$work/$name"

		if [ "$windows" = windows ]; then
			# Windows has no POSIX regex, no fork and no byte-swapping
			# header; compat/win32 stands in, and the shim runs m4 itself
			# rather than asking flex to fork it.
			CPPFLAGS="-I$here/compat/win32"
			ac_cv_header_regex_h=yes
			ac_cv_header_sys_wait_h=yes
			ac_cv_header_netinet_in_h=yes
			ac_cv_func_regcomp=yes
			ac_cv_func_fork=yes
			ac_cv_func_dup2=yes
			export CPPFLAGS ac_cv_header_regex_h ac_cv_header_sys_wait_h \
				ac_cv_header_netinet_in_h ac_cv_func_regcomp \
				ac_cv_func_fork ac_cv_func_dup2
		fi

		CC="$compiler" CFLAGS="-O2 -g0" "$work/source/configure" \
			--host="$host" --quiet >/dev/null
		# flex builds its own scanner with itself, and a cross build cannot run
		# what it just built. Building that stage first, then putting the
		# host's copy of its output in place, leaves make with nothing to run.
		make -C src "stage1flex${target#flex}" >/dev/null 2>&1 || true
		cp "$source/src/stage1scan.c" src/stage1scan.c
		touch src/stage1scan.c
		# Kept rather than shown, since a working build is loud about
		# warnings; a failing one has nothing else to say for itself.
		if ! make -C src "$target" >"$work/$name.log" 2>&1; then
			cat "$work/$name.log" >&2
			exit 1
		fi
	)
}

# Every binary writes the same scanner from the same grammar, so the one built
# here is the reference and the others have to match it. The reference is the
# host generator with a forked m4; each other binary goes through bin/cli.js
# and the m4 pipe, so this doubles as a fork-against-pipe comparison.
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

# Each generator is driven the way a user drives it: through bin/cli.js, with
# the m4 pipe on, which is the only path Windows has. FLEX_JS names one
# program, so a runner that needs arguments gets a wrapper.
smoke_one() {
	name=$1
	shift

	runner=$work/run-$name
	{
		printf '#!/bin/sh\nexec'
		for word in "$@"; do
			printf " '%s'" "$word"
		done
		printf ' "$@"\n'
	} > "$runner"
	chmod +x "$runner"

	# cleared, or a run that writes nothing is compared against the last one
	rm -rf "$work/out-$name"
	mkdir -p "$work/out-$name"
	# The scratch the pipe uses has to be somewhere a container can see
	if ! TMPDIR="$work" FLEX_JS="$runner" FLEX_JS_PIPE_M4=1 node "$here/bin/cli.js" \
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

	smoke_one darwin "$here/dist/flex-js-darwin-universal"

	if command -v finch >/dev/null 2>&1; then
		# -e forwards what the shim sets, which the container would not see
		smoke_one linux-arm64 finch run --rm \
			-e FLEX_JS_M4_OUT -e FLEX_JS_M4_ABOUT \
			-v "$here:$here" -w "$work" --platform linux/arm64 \
			public.ecr.aws/docker/library/alpine:latest \
			"$here/dist/flex-js-linux-arm64"
		smoke_one linux-x64 finch run --rm \
			-e FLEX_JS_M4_OUT -e FLEX_JS_M4_ABOUT \
			-v "$here:$here" -w "$work" --platform linux/amd64 \
			public.ecr.aws/docker/library/alpine:latest \
			"$here/dist/flex-js-linux-x64"
	else
		echo "  linux: skipped, no finch"
		smoke_unverified="$smoke_unverified linux"
	fi

	if [ -x "$wine" ]; then
		smoke_one win32-x64 "$wine" "$here/dist/flex-js-win32-x64.exe"

		# the m4 shipped for Windows has to agree with the host's, so the
		# same run is made again with that one doing the expanding
		if [ -f "$here/dist/m4-win32-x64.exe" ]; then
			printf '#!/bin/sh\nexec "%s" "%s" "$@"\n' \
				"$wine" "$here/dist/m4-win32-x64.exe" > "$work/run-m4"
			chmod +x "$work/run-m4"

			M4=$work/run-m4
			export M4
			smoke_one m4-win32-x64 "$wine" "$here/dist/flex-js-win32-x64.exe"
			unset M4
		fi

		echo "  win32-arm64: skipped, wine runs no arm64 Windows binary here"
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

# Windows has no m4 of its own, and flex cannot write a scanner without one.
# It is shipped beside flex rather than linked into it: separate programs are
# an aggregate, so m4 stays GPL and flex-js stays BSD.
build_m4() {
	name=$1
	host=$2
	compiler=$3

	# kept beside the work directory rather than in it, which is wiped each
	# run; configure is what the extraction writes, so a half one is redone
	source_dir=$here/build/m4-$m4_version
	if [ ! -x "$source_dir/configure" ]; then
		rm -rf "$source_dir"
		echo "fetching m4 $m4_version"
		curl -fsSL --retry 3 "https://ftp.gnu.org/gnu/m4/m4-$m4_version.tar.gz" \
			-o "$here/build/m4.tar.gz"
		# The binary built from this ships; everything else the build reads is
		# pinned by commit, so this is pinned by digest.
		echo "$m4_sha256  $here/build/m4.tar.gz" | shasum -a 256 -c - >/dev/null
		tar xzf "$here/build/m4.tar.gz" -C "$here/build"
		rm -f "$here/build/m4.tar.gz"
	fi

	echo "building m4 for $name"
	rm -rf "$work/m4-$name"
	mkdir -p "$work/m4-$name"
	(
		cd "$work/m4-$name"
		if ! CC="$compiler" CFLAGS="-O2 -g0" "$source_dir/configure" \
				--host="$host" --quiet >"$work/m4-$name.log" 2>&1; then
			cat "$work/m4-$name.log" >&2
			exit 1
		fi
		# the final link fails without the pieces below, the objects do not
		make >>"$work/m4-$name.log" 2>&1 || true
		if ! $compiler -O2 -o m4.exe src/*.obj lib/*.obj lib/*/*.obj \
				"$here/compat/win32/mempcpy_chk.c" -lbcrypt; then
			# the link says only what it could not find; make said why
			cat "$work/m4-$name.log" >&2
			exit 1
		fi
	)
}

build_one win32-x64 x86_64-w64-mingw32 "zig cc -target x86_64-windows-gnu" \
	flex.exe windows
# libtool leaves a wrapper where the binary is expected; the real one is
# under .libs, and the wrapper cannot run anywhere but the build tree.
cp "$work/win32-x64/src/.libs/flex.exe" "$here/dist/flex-js-win32-x64.exe"

build_one win32-arm64 aarch64-w64-mingw32 "zig cc -target aarch64-windows-gnu" \
	flex.exe windows
cp "$work/win32-arm64/src/.libs/flex.exe" "$here/dist/flex-js-win32-arm64.exe"

if [ "$m4" = yes ]; then
	build_m4 win32-x64 x86_64-w64-mingw32 "zig cc -target x86_64-windows-gnu"
	cp "$work/m4-win32-x64/m4.exe" "$here/dist/m4-win32-x64.exe"

	build_m4 win32-arm64 aarch64-w64-mingw32 "zig cc -target aarch64-windows-gnu"
	cp "$work/m4-win32-arm64/m4.exe" "$here/dist/m4-win32-arm64.exe"
fi

rm -f "$here"/dist/*.pdb
ls -l "$here/dist"

if [ "$smoke" = yes ]; then
	smoke_all
fi
