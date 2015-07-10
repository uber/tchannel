from setuptools import find_packages, setup


setup(
    name='tchannel',
    version='0.10.0',
    author='Abhinav Gupta, Aiden Scandella, Bryce Lampe, Grayson Koonce, Junchao Wu',
    author_email='dev@uber.com',
    description='Network multiplexing and framing protocol for RPC',
    license='MIT',
    url='https://github.com/uber/tchannel',
    packages=find_packages(),
    install_requires=[
        'contextlib2',
        'crcmod',
        'tornado>=4.0,<5.0',
        'toro>=0.8,<0.9',
        'threadloop>=0.3,<0.4',
        'futures',
    ],
    entry_points={
        'console_scripts': [
            'tcurl.py = tchannel.tcurl:start_ioloop'
        ]
    },
)
