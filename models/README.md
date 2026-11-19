# Toy Car Detection Model

Training setup for the YOLOv11 toy-car detection model used by the Raspberry Pi 5 gateway for parking-slot vehicle detection.

Dataset: [my-first-project-rmlqk](https://universe.roboflow.com/shyam-47kjr/my-first-project-rmlqk) on Roboflow Universe (YOLOv11 export format). Class names come from the dataset's `data.yaml` at runtime, so no classes are hardcoded here.

## Directory Layout

```text
models/
├── README.md            # This guide
├── requirements.txt     # Python dependencies (install torch first, see below)
├── download_dataset.py  # Downloads the dataset from Roboflow
├── train.py             # Training entry point
├── predict.py           # Detection on images/videos/folder/webcam
├── yolo11n.pt           # Pretrained COCO checkpoint (auto-downloaded on first train)
├── config/              # Copy of the latest run config (train-args.yaml), committed
├── outputs/             # Prediction results (git-ignored, created by predict.py)
├── datasets/            # Downloaded datasets (git-ignored, created by download script)
└── runs/                # Training outputs (git-ignored, created by training)
```

## 1. Setup

Python 3.10+ required. Create and activate a virtual environment from the `models/` directory:

```bash
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
# Windows Git Bash / Linux
source .venv/bin/activate
```

### Install PyTorch with CUDA

Install the CUDA-enabled PyTorch build **before** the other requirements, otherwise `pip` pulls the CPU-only wheel and training will not use the GPU.

Pick the index URL matching your installed [NVIDIA driver / CUDA runtime](https://pytorch.org/get-started/locally/). CUDA 12.6 works for most current drivers:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu132
```

Verify CUDA is visible:

```bash
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

Expected output: `True <GPU name>`. If it prints `False`, fix the GPU/driver setup before continuing — training will silently fall back to CPU.

### Install remaining dependencies

```bash
pip install -r requirements.txt
```

## 2. Download the Dataset

Get a private API key from [Roboflow account settings](https://app.roboflow.com/settings/api), then either set it as an environment variable or pass it on the command line:

```bash
# Windows PowerShell
$env:ROBOFLOW_API_KEY = "<your-key>"
# Windows Git Bash / Linux
export ROBOFLOW_API_KEY="<your-key>"

python download_dataset.py
```

The dataset extracts to `datasets/<project-name>-<version>/` with `train/`, `valid/`, and `test/` splits plus a `data.yaml` describing classes and paths.

To use a specific published version: `python download_dataset.py --version 2`.

## 3. Train

```bash
python train.py
```

Defaults: `yolo11n.pt` (nano, fastest, fits the gateway use case), 100 epochs, 640px images, batch 16, device auto-selected (CUDA GPU when available). Ultralytics downloads the pretrained COCO checkpoint on first run.

Common adjustments:

```bash
python train.py --model yolo11s.pt          # heavier backbone, better accuracy
python train.py --epochs 150 --batch 32     # longer training, bigger batch
python train.py --batch 8                   # lower this if you hit CUDA out-of-memory
python train.py --device cpu                # force CPU (slow, for smoke tests only)
```

### Outputs

Results land in `runs/detect/train<N>/`:

| File | Purpose |
|---|---|
| `weights/best.pt` | Best checkpoint by validation fitness — use this one |
| `weights/last.pt` | Final epoch checkpoint — useful to resume |
| `results.png` | Loss/metric curves |
| `confusion_matrix.png` | Per-class error breakdown |
| `args.yaml` | Full training configuration used (copy kept in `config/train-args.yaml`) |

## 4. Evaluate

```bash
yolo val model=runs/detect/train/weights/best.pt data=datasets/<project-name>-<version>/data.yaml project=runs
```

## 5. Predict

```bash
python predict.py --source path/to/photo.jpg
python predict.py --source path/to/folder/    # batch
python predict.py --source 0                  # webcam
```

Prints detected objects per image/video frame and saves annotated output under `outputs/predict/` (overwritten each run).

## 6. Export for the Gateway

The Raspberry Pi 5 runs inference through Ultralytics. Export to ONNX for portable deployment:

```bash
yolo export model=runs/detect/train/weights/best.pt format=onnx
```

Copy `best.pt` (or the exported ONNX) to the gateway and load it in the gateway's YOLO/OpenCV pipeline.

## Troubleshooting

- **`torch.cuda.is_available()` returns `False`** — CPU wheel installed. Reinstall torch with the `--index-url` command from step 1: `pip uninstall torch torchvision` first, then install the CUDA build.
- **CUDA out of memory** — lower `--batch` (8 or 4), or `--imgsz 512`.
- **Roboflow 403 / auth error** — key missing or wrong; check `ROBOFLOW_API_KEY`. The key is private and must not be committed.
- **Wrong number of classes** — the class list lives in `datasets/<project>/data.yaml`; re-download if the Roboflow project changed, or point `--data` at the correct version's `data.yaml`.
