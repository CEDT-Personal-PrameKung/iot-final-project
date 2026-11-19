"""Train YOLOv11 on the toy-car detection dataset.

Usage:
    python train.py                          # defaults: yolo11n, 100 epochs, auto-detected data.yaml
    python train.py --model yolo11s.pt       # larger variant: n/s/m/l/x
    python train.py --data datasets/toy-cars-1/data.yaml
    python train.py --epochs 150 --batch 32  # tuning

Trained weights land in runs/detect/train/weights/best.pt (see README.md).
"""

import argparse
import shutil
from pathlib import Path

from ultralytics import YOLO

MODELS_DIR = Path(__file__).resolve().parent
# Pin output here; ultralytics otherwise saves under a global settings.json
# runs_dir that may point at any project on this machine.
RUNS_DIR = MODELS_DIR / "runs"
CONFIG_DIR = MODELS_DIR / "config"


def find_data_yaml() -> Path:
    candidates = sorted(Path(__file__).parent.glob("datasets/*/data.yaml"))
    if not candidates:
        raise SystemExit(
            "No data.yaml found under models/datasets/. "
            "Run download_dataset.py first, or pass --data explicitly."
        )
    if len(candidates) > 1:
        print("Multiple dataset versions found:")
        for i, path in enumerate(candidates):
            print(f"  [{i}] {path}")
        index = input("Select dataset [0]: ").strip() or "0"
        return candidates[int(index)]
    return candidates[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=None, help="Path to data.yaml (default: auto-detect)")
    parser.add_argument(
        "--model",
        default=str(MODELS_DIR / "yolo11n.pt"),
        help="Base checkpoint path; default downloads yolo11n.pt into models/ on first run",
    )
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640, help="Training image size")
    parser.add_argument("--batch", type=int, default=16, help="Batch size; lower if CUDA out of memory")
    parser.add_argument(
        "--device",
        default=None,
        help="Device: 0 for first GPU, cpu for CPU. Default: auto (CUDA if available).",
    )
    args = parser.parse_args()

    data = args.data if args.data else find_data_yaml()
    print(f"Dataset: {data}")

    model = YOLO(args.model)  # downloads the pretrained checkpoint on first run
    results = model.train(
        data=str(data),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=str(RUNS_DIR),
    )
    # Keep a durable copy of the run config under models/config/.
    CONFIG_DIR.mkdir(exist_ok=True)
    shutil.copy(Path(results.save_dir) / "args.yaml", CONFIG_DIR / "train-args.yaml")
    print(f"Training done. Best weights: {results.save_dir}/weights/best.pt")


if __name__ == "__main__":
    main()
