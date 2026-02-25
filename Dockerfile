FROM ruby:3.3-alpine

# Install build dependencies for native extensions
RUN apk add --no-cache \
    build-base \
    git \
    libffi-dev

WORKDIR /code

COPY Gemfile .
COPY Gemfile.lock* .

# Install dependencies (Gemfile.lock optional on first build)
RUN bundle install

EXPOSE 4000
CMD ["bundle", "exec", "jekyll", "serve", "--host", "0.0.0.0", "--config", "_config.yml,_config_dev.yml", "--force_polling"]
