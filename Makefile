build_loc ?= $(shell pwd)

build:
	docker build -t gitpages $(build_loc)

run:
	docker run --rm -v $(build_loc):/code -p 4000:4000 gitpages
