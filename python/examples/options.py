import argparse


def get_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--port",
        dest="port", default=8888, type=int,
    )
    parser.add_argument(
        "--host",
        dest="host", default="localhost"
    )
    return parser.parse_args()
