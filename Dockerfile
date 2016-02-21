FROM alpine:3.2
MAINTAINER Kyle James Walker <KyleJamesWalker@gmail.com>

COPY Gemfile /Gemfile
COPY Gemfile.lock /Gemfile.lock

RUN apk add --update \
      gcc \
      git \
      libffi-dev \
      nodejs \
      make \
      python \
      musl-dev \
      ruby-dev && \
    wget http://production.cf.rubygems.org/rubygems/rubygems-2.4.8.zip -q -O /tmp/gems.zip && \
    unzip /tmp/gems.zip -q -d /tmp && \
    cd /tmp/rubygems-2.4.8 && \
    ruby setup.rb && \
    cd / && \
    rm -rf /tmp/rubygems-2.4.8 /tmp/gems.zip && \
    gem install rubygems-update && \
    gem install bundler && \
    bundle install && \
    apk del git gcc musl-dev make && \
    rm -rf /var/cache/apk/*

WORKDIR /code

EXPOSE 4000
CMD ["jekyll", "serve", "--host", "0.0.0.0", "--config", "_config.yml,_config_dev.yml", "--force_polling"]
