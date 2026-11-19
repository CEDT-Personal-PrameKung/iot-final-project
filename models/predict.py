"""Run toy-car detection on images, videos, a folder, or the webcam.

Usage:
    python predict.py --source path/to/photo.jpg
    python predict.py --source path/to/folder/          # all images/videos in folder
    python predict.py --source 0                        # webcam
    python predict.py --source video.mp4 --conf 0.4

Annotated results are saved under models/outputs/predict/ (overwritten each run).
"""

import argparse
from pathlib import Path

from ultralytics import YOLO

MODELS_DIR = Path(__file__).resolve().parent
RUNS_DIR = MODELS_DIR / "runs"
OUTPUTS_DIR = MODELS_DIR / "outputs"
DEFAULT_WEIGHTS = RUNS_DIR / "detect" / "train" / "weights" / "best.pt"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--weights",
        type=Path,
        default=DEFAULT_WEIGHTS,
        help=f"Model checkpoint (default: {DEFAULT_WEIGHTS})",
    )
    parser.add_argument("--source", required=True, help="Image, video, folder path, or webcam index (0)")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold (default: 0.25)")
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size")
    parser.add_argument("--show", action="store_true", help="Display results in a window")
    args = parser.parse_args()

    if not args.weights.exists():
        raise SystemExit(
            f"Weights not found: {args.weights}\n"
            "Train first (python train.py) or pass --weights explicitly."
        )

    model = YOLO(str(args.weights))
    results = model.predict(
        source=args.source,
        conf=args.conf,
        imgsz=args.imgsz,
        project=str(OUTPUTS_DIR),
        name="predict",
        exist_ok=True,
        save=True,
        show=args.show,
    )

    for r in results:
        names = [model.names[int(c)] for c in r.boxes.cls] if r.boxes is not None else []
        print(f"{Path(r.path).name}: {len(names)} object(s) {names}")
    print(f"Annotated results saved to: {results[0].save_dir}")


if __name__ == "__main__":
    main()
