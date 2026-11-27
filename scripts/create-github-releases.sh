#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_PLAN:?RELEASE_PLAN must be set}"
: "${GH_REPO:?GH_REPO must be set}"
: "${GH_TOKEN:?GH_TOKEN must be set}"

if [[ ! $GH_REPO =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo 'Invalid GH_REPO' >&2
  exit 1
fi

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
printf '%s' "$RELEASE_PLAN" > "$workdir/plan.json"

# Compare numeric components as strings to avoid jq's numeric precision limit.
if ! jq -e -s '
  def numeric_key: split(".") | map([length, .]);
  length == 1 and (.[0] |
    type == "array" and length <= 10 and
    all(.[]; type == "object" and
      (keys == ["commit", "latest", "notes", "version"]) and
      (.version | type == "string" and test("^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\z")) and
      ((.version | numeric_key) >= ("0.2.1" | numeric_key)) and
      (.commit | type == "string" and test("^[0-9a-fA-F]{40}\\z")) and
      (.notes | type == "string") and (.latest | type == "boolean")) and
    ([.[].version | numeric_key] as $versions | $versions == ($versions | unique))
  )
' "$workdir/plan.json" > /dev/null; then
  echo 'Invalid RELEASE_PLAN' >&2
  exit 1
fi

gh api --paginate --slurp "repos/$GH_REPO/releases" > "$workdir/releases.json"
jq -e 'type == "array" and all(.[]; type == "array" and all(.[]; type == "object" and (.tag_name | type == "string") and (.draft | type == "boolean")))' \
  "$workdir/releases.json" > /dev/null

tag_target() {
  git ls-remote "https://github.com/$GH_REPO.git" "$1" "$1^{}" |
    awk -v ref="$1" '$2 == ref { base = $1 } $2 == ref "^{}" { peeled = $1 } END { print (peeled != "" ? peeled : base) }'
}

count=$(jq 'length' "$workdir/plan.json")
for ((i = 0; i < count; i++)); do
  version=$(jq -r --argjson i "$i" '.[$i].version' "$workdir/plan.json")
  commit=$(jq -r --argjson i "$i" '.[$i].commit | ascii_downcase' "$workdir/plan.json")
  latest=$(jq -r --argjson i "$i" '.[$i].latest' "$workdir/plan.json")
  tag="v$version"
  ref="refs/tags/$tag"

  target=$(tag_target "$ref")
  if [[ -n $target && $target != "$commit" ]]; then
    echo "Tag $tag points to a different commit" >&2
    exit 1
  fi

  if jq -e --arg tag "$tag" 'any(.[][]; .tag_name == $tag and .draft)' "$workdir/releases.json" > /dev/null; then
    echo "Release $tag already has a draft. Review the draft before retrying." >&2
    exit 1
  fi
  if jq -e --arg tag "$tag" 'any(.[][]; .tag_name == $tag)' "$workdir/releases.json" > /dev/null; then
    if [[ $target != "$commit" ]]; then
      echo "Release $tag has no matching tag" >&2
      exit 1
    fi
    echo "Release $tag already exists"
    continue
  fi

  if [[ -z $target ]]; then
    if ! gh api --method POST "repos/$GH_REPO/git/refs" -f "ref=$ref" -f "sha=$commit" > /dev/null; then
      echo "Could not create $tag at verified commit $commit. See docs/releasing.md for recovery." >&2
      exit 1
    fi
    target=$(tag_target "$ref")
    if [[ $target != "$commit" ]]; then
      echo "Tag $tag did not resolve to the expected commit" >&2
      exit 1
    fi
  fi

  jq -j --argjson i "$i" '.[$i].notes' "$workdir/plan.json" > "$workdir/notes"
  if ! gh release create "$tag" --repo "$GH_REPO" --verify-tag --title "$tag" \
    --notes-file "$workdir/notes" "--latest=$latest"; then
    echo "Could not release $tag at verified commit $commit. See docs/releasing.md for recovery." >&2
    exit 1
  fi
done
