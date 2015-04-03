from setuptools import find_packages, setup


setup(
    name='tchannel',
    version='0.3.0',
    author='Aiden Scandella, Abhinav Gupta, Bryce Lampe, Junchao Wu, Grayson Koonce',
    author_email='dev@uber.com',
    description='Network multiplexing and framing protocol for RPC',
    license='MIT',
    url='https://github.com/uber/tchannel',
    packages=find_packages(),
    install_requires=['contextlib2', 'enum34', 'futures'],
    entry_points={
        'console_scripts': [
            'tcurl.py = tchannel.tcurl:start_ioloop'
        ]
    },
)
