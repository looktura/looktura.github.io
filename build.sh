#!/usr/bin/env bash
# LOOKTURA — quick production build.
# Static site: copies the deployable files into dist/ and minifies HTML/CSS/JS.
# Re-run after any edit:  bash build.sh
set -e
cd "$(dirname "$0")"

# Pages: homepage, for-stores (partners), privacy.
HTML="index.html partners.html privacy.html"
# home.css powers index.html + privacy.html. partners.html is self-contained (inline styles).
CSS="home.css"
# ES modules. home.js imports phone.js (homepage 3D carousel);
# partners.html imports diorama.js (for-stores scroll-story). All parsed as modules.
JS="home.js phone.js diorama.js"

echo "Cleaning dist/ ..."
rm -rf dist && mkdir -p dist

echo "Copying assets ..."
cp -R assets dist/
# drop app screenshots only if no page references them
grep -rqs "assets/screens" $HTML || rm -rf dist/assets/screens

echo "Copying deploy files ..."
# .nojekyll lets GitHub Pages serve files/folders as-is (no Jekyll processing)
touch dist/.nojekyll
[ -f CNAME ] && cp CNAME dist/ || true

echo "Minifying HTML ..."
for f in $HTML; do
  npx -y html-minifier-terser --collapse-whitespace --remove-comments --remove-redundant-attributes --minify-css --minify-js -o "dist/$f" "$f" 2>/dev/null || cp "$f" "dist/$f"
done

echo "Minifying CSS ..."
for f in $CSS; do
  npx -y clean-css-cli -o "dist/$f" "$f" 2>/dev/null || cp "$f" "dist/$f"
done

echo "Minifying JS (ES modules) ..."
for f in $JS; do
  npx -y terser "$f" -c -m --module -o "dist/$f" 2>/dev/null || cp "$f" "dist/$f"
done

echo "Validating JS (ES modules) ..."
for f in $JS; do
  node --check --input-type=module - < "dist/$f" || { echo "  SYNTAX ERROR in dist/$f"; exit 1; }
done

echo "Done. Deployable site is in dist/  ($(du -sh dist | cut -f1))"
