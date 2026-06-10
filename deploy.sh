#!/bin/bash
set -e  # stop on any error

echo "=== Building ==="
npm run build

BUNDLE=$(ls dist/assets/index-*.js | xargs basename)
CSS=$(ls dist/assets/index-*.css | xargs basename)
echo "Bundle: $BUNDLE | CSS: $CSS"

# Verify the built index.html references the correct bundle
BUILT_BUNDLE=$(grep -o 'index-[A-Za-z0-9]*\.js' dist/index.html | head -1)
if [ "$BUILT_BUNDLE" != "$BUNDLE" ]; then
  echo "ERROR: index.html references $BUILT_BUNDLE but bundle is $BUNDLE"
  exit 1
fi
echo "✅ index.html correctly references $BUNDLE"

echo "=== Switching to gh-pages ==="
git checkout gh-pages

# Remove old bundles
rm -f assets/index-*.js assets/index-*.css

# Copy new files
cp dist/assets/$BUNDLE assets/
cp dist/assets/$CSS assets/
cp dist/index.html index.html  # Always use the BUILT index.html — never hand-edit

# Verify
LIVE_BUNDLE=$(grep -o 'index-[A-Za-z0-9]*\.js' index.html | head -1)
if [ "$LIVE_BUNDLE" != "$BUNDLE" ]; then
  echo "ERROR: Deployed index.html references $LIVE_BUNDLE but bundle is $BUNDLE — aborting"
  git checkout -- index.html
  git checkout master
  exit 1
fi

echo "✅ Verified: index.html → $BUNDLE"
git add index.html assets/
git commit -m "deploy: $BUNDLE"
git push origin gh-pages
git checkout master
echo "=== DONE — live at phllandcare.github.io/phl-crm ==="
