from setuptools import find_packages, setup

with open('README.md') as f:
    long_description = f.read()


setup(
    name='tchannel',
    version='0.1.0+dev0',
    author='Aiden Scandella',
    author_email='dev@uber.com',
    description='Network multiplexing and framing protocol for RPC',
    long_description=long_description,
    license='MIT',
    url='https://github.com/uber/tchannel.py',
    packages=find_packages(),
    install_requires=[],
    entry_points={},
)
