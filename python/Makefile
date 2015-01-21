project := tchannel

flake8 := flake8
pytest := py.test -s --tb short --cov-config .coveragerc --cov \
          $(project) tests

html_report := --cov-report html
test_args := --cov-report term-missing

.DEFAULT_GOAL := test

.PHONY: bootstrap
bootstrap:
	pip install -r requirements-test.txt
	python setup.py develop

.PHONY: test
test: clean
	$(pytest) $(test_args)

.PHONY: testhtml
testhtml: clean
	$(pytest) $(html_report) && open htmlcov/index.html

.PHYNO: clean
clean:
	@find $(project) -name "*.pyc" -delete

.PHONY: lint
lint:
	$(flake8) $(project) tests
