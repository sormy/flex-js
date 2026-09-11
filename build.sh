#!/bin/sh
#
# Builds a flex with the JavaScript back end, from the upstream sources.
#
#   ./build.sh          fetch, patch and build if needed, then install the
#                       skeletons; an edited patch is picked up here
#   ./build.sh --clean  throw the checkout away and start over
#
# Needs git, autoconf, automake, libtool, bison and m4. Only src/ is built,
# so the documentation targets and their tools are not needed.

set -e

here=$(cd "$(dirname "$0")" && pwd)
repo=https://github.com/westes/flex
commit=4fcc71489ae298c35b0b786114ad524945f2cf95
src=$here/build/flex

if [ "$1" = "--clean" ]; then
	rm -rf "$here/build"
fi

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
if ! applied=$(cat "$here"/patches/*.patch | shasum); then
	echo "shasum is needed to tell whether the patches have changed" >&2
	exit 1
fi
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
make -C "$src/src" >/dev/null
echo "built $("$src/src/flex" --version)"
