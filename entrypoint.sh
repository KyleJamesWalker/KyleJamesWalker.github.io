#!/bin/sh
set -e

cd /code

# Build Node assets if package.json exists
if [ -f package.json ]; then
  npm install

  # Docker volume mounts may create copies in .bin instead of symlinks,
  # breaking relative imports. Recreate vite as a proper symlink.
  if [ -f node_modules/.bin/vite ] && [ ! -L node_modules/.bin/vite ]; then
    rm node_modules/.bin/vite
    ln -s ../vite/bin/vite.js node_modules/.bin/vite
  fi

  npm run build
fi

# Start Jekyll
exec bundle exec jekyll serve --host 0.0.0.0 --config _config.yml,_config_dev.yml --force_polling
