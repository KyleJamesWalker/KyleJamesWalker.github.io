#!/bin/sh
set -e

cd /code

# Build Node assets if package.json exists
if [ -f package.json ]; then
  npm install
  npm run build
fi

# Start Jekyll
exec bundle exec jekyll serve --host 0.0.0.0 --config _config.yml,_config_dev.yml --force_polling
