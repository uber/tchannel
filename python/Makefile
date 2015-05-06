project := tchannel

flake8 := flake8
pytest := PYTHONDONTWRITEBYTECODE=1 py.test --tb short \
	--cov-config .coveragerc --cov $(project) \
	--async-test-timeout=1 --timeout=30 tests

html_report := --cov-report html
test_args := --cov-report term-missing

TEST_HOST=127.0.0.1
TEST_PORT=0
TEST_LOG_FILE=test-server.log

.DEFAULT_GOAL := test-lint

.PHONY: install test test_ci test-lint testhtml clean lint

env/bin/activate:
	virtualenv env

env_install: env/bin/activate
	./env/bin/pip install -r requirements-test.txt --download-cache $(HOME)/.cache/pip
	./env/bin/python setup.py develop

tox_install:
	pip install -r requirements-test.txt --download-cache $(HOME)/.cache/pip
	python setup.py develop

install:
ifdef TOX_ENV
	make tox_install
else
	make env_install
endif

test_server:
	# TODO: use ${TEST_LOG_FILE}
	./env/bin/python test_server.py --host ${TEST_HOST} --port ${TEST_PORT}

test: clean
	$(pytest) $(test_args)

test_ci: clean
	tox -e $(TOX_ENV)

testhtml: clean
	$(pytest) $(html_report) && open htmlcov/index.html

clean:
	@find $(project) -name "*.pyc" -delete

lint:
	@$(flake8) $(project) tests examples

test-lint: test lint
