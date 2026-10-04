#!/usr/bin/env bash
# Builds trckable.zip, the file wordpress.org and "Upload Plugin" take: one
# folder, trckable/, with only what the plugin needs. Refuses a build whose
# plugin header, constant and readme.txt disagree about the version.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$here/trckable"
out="${1:-$here/trckable.zip}"
out="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")" # the zip is written from another folder: make the path absolute

header="$(sed -n 's/^ \* Version: *//p' "$src/trckable.php")"
const="$(sed -n "s/^define( 'TRCKABLE_VERSION', '\(.*\)' );/\1/p" "$src/trckable.php")"
stable="$(sed -n 's/^Stable tag: *//p' "$src/readme.txt")"
if [ -z "$header" ] || [ "$header" != "$const" ] || [ "$header" != "$stable" ]; then
	echo "version mismatch: header '$header', constant '$const', readme.txt '$stable'" >&2
	exit 1
fi

rm -f "$out"
(cd "$here" && zip -qrX "$out" trckable -x '*.DS_Store' -x '*/.*')
echo "$out ($header, $(wc -c <"$out" | tr -d ' ') bytes)"
