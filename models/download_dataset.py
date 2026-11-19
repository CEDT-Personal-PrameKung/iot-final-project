"""Download the toy-car detection dataset from Roboflow Universe in YOLOv11 format.

Dataset: https://universe.roboflow.com/shyam-47kjr/my-first-project-rmlqk

Usage:
    python download_dataset.py                          # uses ROBOFLOW_API_KEY env var
    python download_dataset.py --api-key <KEY>          # explicit key
    python download_dataset.py --version 2              # specific dataset version

The archive is extracted under models/datasets/ (git-ignored).
"""

import argparse
import os
from pathlib import Path

from roboflow import Roboflow

WORKSPACE = "shyam-47kjr"
PROJECT = "my-first-project-rmlqk"

DATASETS_DIR = Path(__file__).resolve().parent / "datasets"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", type=int, default=1, help="Dataset version on Roboflow (default: 1)")
    parser.add_argument(
        "--api-key",
        default=os.environ.get("ROBOFLOW_API_KEY"),
        help="Roboflow API key (default: ROBOFLOW_API_KEY env var)",
    )
    args = parser.parse_args()

    if not args.api_key:
        parser.error("Roboflow API key required: pass --api-key or set ROBOFLOW_API_KEY")

    # Roboflow SDK saves the zip and extracts into the current working
    # directory, so chdir into models/datasets/ regardless of where the
    # script is invoked from.
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    os.chdir(DATASETS_DIR)

    rf = Roboflow(api_key=args.api_key)
    project = rf.workspace(WORKSPACE).project(PROJECT)
    dataset = project.version(args.version).download("yolov11")
    print(f"Dataset downloaded to: {Path(dataset.location).resolve()}")


if __name__ == "__main__":
    main()
