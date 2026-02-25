build_loc ?= $(shell pwd)
image_name ?= gitpages

build:
	docker build -t $(image_name) -f Dockerfile $(build_loc)

run:
	docker run --rm -v $(build_loc):/code -p 4000:4000 $(image_name)
