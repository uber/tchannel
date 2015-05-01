from setuptools import find_packages, setup


setup(
    name='tchannel',
    version='0.4.1',
    author=", ".join([
        'Aiden Scandella',
        'Abhinav Gupta',
        'Bryce Lampe',
        'Junchao Wu',
        'Grayson Koonce',
    ]),
    author_email='dev@uber.com',
    description='Network multiplexing and framing protocol for RPC',
    license='MIT',
    url='https://github.com/uber/tchannel',
    packages=find_packages(),
    install_requires=[
        'contextlib2',
        'crcmod'
        'enum34',
        'futures',
        # 'pyfarmhash', TODO not yet used
        'tornado>=4.0,<5.0',
        'toro>=0.8,<0.9',
    ],
    entry_points={
        'console_scripts': [
            'tcurl.py = tchannel.tcurl:start_ioloop'
        ]
    },
)
