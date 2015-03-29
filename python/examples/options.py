import argparse


def get_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--port",
        dest="port", default=8888, type=int,
    )
    parser.add_argument(
        "--host",
        dest="host", default="0.0.0.0"
    )
    return parser.parse_args()
