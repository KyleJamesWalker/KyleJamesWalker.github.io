FROM ruby:3.3-alpine

# Install build dependencies for native extensions + Node.js for app builds
RUN apk add --no-cache \
    build-base \
    git \
    libffi-dev \
    nodejs \
    npm

WORKDIR /code

COPY Gemfile .
COPY Gemfile.lock* .

# Install Ruby dependencies
RUN bundle install

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/entrypoint.sh"]
