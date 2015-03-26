project := tchannel

flake8 := flake8
pytest := py.test --tb short --cov-config .coveragerc --cov $(project) \
          --async-test-timeout=1 --timeout=30 tests

html_report := --cov-report html
test_args := --cov-report term-missing

.DEFAULT_GOAL := test-lint

.PHONY: install test test_ci test-lint testhtml clean lint

install:
	pip install -r requirements-test.txt --download-cache $(HOME)/.cache/pip
	python setup.py develop

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
