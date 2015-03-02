project := tchannel

flake8 := flake8
pytest := py.test -s --tb short --cov-config .coveragerc --cov \
          $(project) tests

html_report := --cov-report html
test_args := --cov-report term-missing

.DEFAULT_GOAL := test-lint

.PHONY: bootstrap test test-lint testhtml clean lint

bootstrap:
	pip install -r requirements-test.txt
	python setup.py develop

test: clean
	$(pytest) $(test_args)

testhtml: clean
	$(pytest) $(html_report) && open htmlcov/index.html

clean:
	@find $(project) -name "*.pyc" -delete

lint:
	@$(flake8) $(project) tests examples

test-lint: test lint
