#!/bin/sh
#
# Builds a flex with the JavaScript back end, from the upstream sources.
#
#   ./build.sh          fetch, patch and build if needed, then install the
#                       skeletons; an edited patch is picked up here
#   ./build.sh --clean  throw the checkout away and start over
#
# Needs git, curl, autoconf, automake, libtool, bison and m4, whose autopoint
# the bootstrap runs. Only src/ is built, so the documentation targets and
# their tools are not needed.

set -e

here=$(cd "$(dirname "$0")" && pwd)
repo=https://github.com/westes/flex
commit=4fcc71489ae298c35b0b786114ad524945f2cf95
src=$here/build/flex

# m4 is linked into the generator rather than forked, which Windows has no way
# to do. docs/building.md says how.
m4_version=1.4.19
m4_sha256=3be4a26d825ffdfda52a56fc43246456989a3630093cced3fbddf4771ee58a70
m4_src=$here/build/m4-$m4_version
m4_build=$here/build/m4

if [ "$1" = "--clean" ]; then
	rm -rf "$here/build"
fi

mkdir -p "$here/build"

# The tarball is kept, since a patched tree is thrown away and extracted again
# whenever the patches change.
tarball=$here/build/m4-$m4_version.tar.gz

if ! command -v shasum >/dev/null; then
	echo "shasum is needed to check what this downloads and applies" >&2
	exit 1
fi

if [ ! -f "$tarball" ]; then
	echo "fetching m4 $m4_version"
	curl -fsSL --retry 3 "https://ftp.gnu.org/gnu/m4/m4-$m4_version.tar.gz" \
		-o "$tarball.part"
	# Checked before it is moved into place, so a bad download is not kept
	# and handed to every build after this one.
	echo "$m4_sha256  $tarball.part" | shasum -a 256 -c - >/dev/null
	mv "$tarball.part" "$tarball"
fi
echo "$m4_sha256  $tarball" | shasum -a 256 -c - >/dev/null

m4_applied=$(cat "$here"/patches/m4/*.patch | shasum)
m4_applied="$m4_version ${m4_applied%% *}"

if [ "$(cat "$m4_src/.patches" 2>/dev/null)" != "$m4_applied" ]; then
	rm -rf "$m4_src" "$m4_build"
	tar xzf "$tarball" -C "$here/build"
	for patch in "$here"/patches/m4/*.patch; do
		echo "applying m4/$(basename "$patch")"
		patch -s -p1 -d "$m4_src" < "$patch"
	done
	echo "$m4_applied" > "$m4_src/.patches"
fi

if [ ! -d "$m4_build" ]; then
	echo "building m4"
	m4_rebuilt=yes
	mkdir -p "$m4_build"
	# m4 has no main of its own any more, so its own binary is the one thing
	# that cannot be linked. What flex wants is built before that, and flex
	# linking against it is what says whether it all arrived.
	if ! (cd "$m4_build" && "$m4_src/configure" --quiet >/dev/null \
			&& make) >"$here/build/m4.log" 2>&1; then
		if [ ! -f "$m4_build/src/output.o" ]; then
			cat "$here/build/m4.log" >&2
			rm -rf "$m4_build"
			exit 1
		fi
	fi
fi

# What m4 links against, asked of its own build rather than guessed at here.
printf 'flex_js_libs:\n\t@echo $(LDADD)\n' > "$m4_build/src/flex-js.mk"
m4_libs=$(make -s -C "$m4_build/src" -f Makefile -f flex-js.mk flex_js_libs \
	| sed "s|\.\./lib/libm4\.a|$m4_build/lib/libm4.a|")
m4_objects=$(find "$m4_build/src" -name '*.o' | sort | tr '\n' ' ')

if [ ! -d "$src/.git" ]; then
	mkdir -p "$src"
	git -C "$src" init -q
	git -C "$src" remote add origin "$repo"
fi

if ! git -C "$src" cat-file -e "$commit^{commit}" 2>/dev/null; then
	echo "fetching flex $commit"
	git -C "$src" fetch -q --depth 1 origin "$commit"
fi

# The patches are applied to a pristine tree, so a bumped commit or an edited
# patch takes effect on the next build rather than only after --clean.
stamp=$src/.patches
applied=$(cat "$here"/patches/*.patch | shasum)
applied="$commit ${applied%% *}"

if [ "$(cat "$stamp" 2>/dev/null)" != "$applied" ]; then
	git -C "$src" checkout -q --force "$commit"
	git -C "$src" clean -qfdx
	for patch in "$here"/patches/*.patch; do
		echo "applying $(basename "$patch")"
		git -C "$src" apply "$patch"
	done
	if ! (cd "$src" && ./autogen.sh && ./configure --quiet >/dev/null) \
			>"$src/bootstrap.log" 2>&1; then
		cat "$src/bootstrap.log" >&2
		echo "see docs/building.md for what a build needs" >&2
		exit 1
	fi
	echo "$applied" > "$stamp"
fi

# The skeletons are ours, so they are copied in rather than patched - but only
# where they differ, since a newer timestamp alone rebuilds and relinks flex.
for skeleton in "$here"/skeleton/*.skl; do
	if ! cmp -s "$skeleton" "$src/src/$(basename "$skeleton")"; then
		cp "$skeleton" "$src/src/"
	fi
done
# make is told the m4 objects on the command line, so it has no way to know a
# rebuilt m4 is newer than the binary it linked. Taking the binary away is what
# asks for the relink.
if [ -n "$m4_rebuilt" ]; then
	rm -f "$src/src/flex"
fi
make -C "$src/src" FLEX_JS_M4="$m4_objects $m4_libs" >/dev/null
echo "built $("$src/src/flex" --version)"
