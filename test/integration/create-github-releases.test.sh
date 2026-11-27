#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin"
export MOCK_DIR="$tmp" GH_REPO=owner/repo GH_TOKEN=test PATH="$tmp/bin:$PATH"
sha=0123456789012345678901234567890123456789
other=1111111111111111111111111111111111111111
notes=$(printf 'note\n%s(touch %s/injected)\nX' '$' "$tmp")
RELEASE_PLAN=$(jq -cn --arg sha "$sha" --arg notes "${notes%X}" '[{version:"0.2.1",commit:$sha,notes:$notes,latest:true}]')
export RELEASE_PLAN

cat > "$tmp/bin/git" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ $1 == ls-remote && $2 == https://github.com/owner/repo.git && $3 == refs/tags/v0.2.1 && $4 == 'refs/tags/v0.2.1^{}' ]] || exit 1
[[ ! -f $MOCK_DIR/git-fail ]] || exit 1
if [[ -f $MOCK_DIR/tag ]]; then
  printf '%s\trefs/tags/v0.2.1\n' "$(<"$MOCK_DIR/tag")"
  if [[ -f $MOCK_DIR/peeled ]]; then
    printf '%s\trefs/tags/v0.2.1^{}\n' "$(<"$MOCK_DIR/peeled")"
  fi
fi
MOCK
cat > "$tmp/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ ! -f $MOCK_DIR/gh-fail ]] || exit 1
if [[ $1 == api && $2 == --paginate ]]; then
  if [[ -f $MOCK_DIR/malformed ]]; then
    echo '[[{"tag_name":"v0.2.1"}]]'
  elif [[ -f $MOCK_DIR/draft ]]; then
    echo '[[{"tag_name":"v0.2.1","draft":true}]]'
  elif [[ -f $MOCK_DIR/release ]]; then
    echo '[[{"tag_name":"v0.2.1","draft":false}]]'
  else
    echo '[[]]'
  fi
elif [[ $1 == api && $2 == --method ]]; then
  printf '%s\n' "$*" >> "$MOCK_DIR/writes"
  [[ ! -f $MOCK_DIR/tag-post-fail ]] || exit 1
  [[ ! -f $MOCK_DIR/tag && $3 == POST && $4 == repos/owner/repo/git/refs && $6 == ref=refs/tags/v0.2.1 ]] || exit 1
  printf '%s' "${8#sha=}" > "$MOCK_DIR/tag"
elif [[ $1 == release && $2 == create ]]; then
  printf '%s\n' "$*" >> "$MOCK_DIR/writes"
  [[ -f $MOCK_DIR/tag && ! -f $MOCK_DIR/release ]] || exit 1
  [[ ! -f $MOCK_DIR/create-fail ]] || exit 1
  latest=missing
  verify=no
  while (($#)); do
    if [[ $1 == --notes-file ]]; then cp "$2" "$MOCK_DIR/notes"; fi
    if [[ $1 == --latest=* ]]; then latest=$1; fi
    if [[ $1 == --verify-tag ]]; then verify=yes; fi
    shift
  done
  [[ $latest == --latest=true && $verify == yes ]] || exit 1
  touch "$MOCK_DIR/release"
else
  exit 1
fi
MOCK
chmod +x "$tmp/bin/git" "$tmp/bin/gh"
run() { bash "$root/scripts/create-github-releases.sh" > /dev/null 2>&1; }
run
[[ $(<"$tmp/tag") == "$sha" && -f $tmp/release && ! -e $tmp/injected ]]
printf '%s' "${notes%X}" > "$tmp/expected"
cmp "$tmp/notes" "$tmp/expected"
[[ $(wc -l < "$tmp/writes") -eq 2 ]]
run
[[ $(wc -l < "$tmp/writes") -eq 2 ]]
rm "$tmp/release"
touch "$tmp/create-fail"
if bash "$root/scripts/create-github-releases.sh" > "$tmp/output" 2>&1 || [[ ! -f $tmp/tag || -f $tmp/release ]]; then
  echo 'ignored release failure' >&2; exit 1
fi
grep -F "Could not release v0.2.1 at verified commit $sha" "$tmp/output" > /dev/null
rm "$tmp/create-fail"
run
printf '%s' "$other" > "$tmp/tag"
printf '%s' "$sha" > "$tmp/peeled"
run
rm "$tmp/peeled"
if run; then echo 'accepted conflicting tag' >&2; exit 1; fi
rm "$tmp/tag" "$tmp/release"
touch "$tmp/draft"
if run || [[ -e $tmp/tag ]]; then echo 'accepted an existing draft' >&2; exit 1; fi
rm "$tmp/draft"
touch "$tmp/malformed"
if run || [[ -e $tmp/tag ]]; then echo 'accepted malformed GitHub release data' >&2; exit 1; fi
rm "$tmp/malformed"
original=$RELEASE_PLAN
RELEASE_PLAN="[$(printf '%s' "$original" | jq -c '.[0]'),{}]"
if run || [[ -e $tmp/tag ]]; then echo 'accepted invalid plan' >&2; exit 1; fi
RELEASE_PLAN=$original
touch "$tmp/gh-fail"
if run || [[ -e $tmp/tag ]]; then echo 'ignored API failure' >&2; exit 1; fi
rm "$tmp/gh-fail"
: > "$tmp/writes"
touch "$tmp/tag-post-fail"
if bash "$root/scripts/create-github-releases.sh" > "$tmp/output" 2>&1; then
  echo 'accepted a refused tag POST' >&2; exit 1
fi
grep -F "Could not create v0.2.1 at verified commit $sha" "$tmp/output" > /dev/null
[[ ! -e $tmp/tag && ! -e $tmp/release ]]
[[ $(wc -l < "$tmp/writes") -eq 1 ]]
grep -Fx "api --method POST repos/owner/repo/git/refs -f ref=refs/tags/v0.2.1 -f sha=$sha" "$tmp/writes" > /dev/null
rm "$tmp/tag-post-fail"
touch "$tmp/git-fail"
if run || [[ -e $tmp/tag ]]; then echo 'ignored git failure' >&2; exit 1; fi
echo 'Release writer mock tests passed'
