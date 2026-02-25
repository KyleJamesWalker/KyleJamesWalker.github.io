# KyleJamesWalker.github.io

GitHub Pages personal site.

## Local development

### Option 1: Docker (recommended)

Requires Docker. Uses Ruby 3.3 for compatibility with current dependencies.

```bash
make build   # Build the Docker image
make run     # Serve at http://localhost:4000
```

### Option 2: Ruby + Bundler

Requires Ruby 3.0+ (Ruby 2.6 is too old for current gem dependencies).

```bash
bundle install
bundle exec jekyll serve
```

## Recent updates (2026)

This site was updated from a 10-year-old setup to current GitHub Pages standards:

- **Jekyll**: 3.0.4 → 3.10.0 (matches GitHub Pages)
- **URLs**: HTTP → HTTPS throughout
- **Google Analytics**: Universal Analytics (UA-*, deprecated) → GA4. Add your `G-XXXXXXXXXX` measurement ID in `_config.yml` under `google_analytics_measurement_id` to enable tracking
- **Syntax highlighter**: Pygments → Rouge
- **jQuery**: 2.1 → 3.7 (for media player pages)
- **Docker**: Alpine 3.2 → Ruby 3.3 Alpine base image
- **Removed**: `.htaccess` include (file didn't exist), deprecated Universal Analytics

## Based on Feeling Responsive

Originally based: `0b3f6650f72ee2cf4fe6180ac08054fe7fe1823a`  
Updated based: `9f3f272bf577030af62e878e0b2af7b3b54b7996`
