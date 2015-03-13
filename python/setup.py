from setuptools import find_packages, setup


setup(
    name='tchannel',
    version='0.1.0+dev0',
    author='Aiden Scandella',
    author_email='dev@uber.com',
    description='Network multiplexing and framing protocol for RPC',
    license='MIT',
    url='https://github.com/uber/tchannel',
    packages=find_packages(),
    install_requires=['contextlib2', 'enum34'],
    entry_points={
        'console_scripts': [
            'tcurl.py = tchannel.tcurl:main'
        ]
    },
)
