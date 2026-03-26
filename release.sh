#!/bin/bash
set -e

# Usage: ./release.sh [patch|minor|major]
# Default: patch

BUMP=${1:-patch}
PKG="package.json"
SRC="src/index.ts"

# Get current version
CURRENT=$(node -p "require('./$PKG').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case $BUMP in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  *) echo "Usage: ./release.sh [patch|minor|major]"; exit 1 ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"
echo "Bumping $CURRENT → $NEW"

# Update version in package.json and src/index.ts
sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" "$PKG"
sed -i '' "s/VERSION = '$CURRENT'/VERSION = '$NEW'/" "$SRC"

# Build
bun run build

# Commit, tag, push
git add -A
git commit -m "release: v$NEW"
git tag "v$NEW"
git push && git push --tags

# Publish
npm publish --access public

echo ""
echo "Published @construct-space/cli@$NEW"
