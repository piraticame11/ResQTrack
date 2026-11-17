"""
Train Stage 1: 4-way Orientation Classifier (YOLOv8n-cls) on synthetic PhilSys IDs.
Classifies upright vs 90/180/270-degree rotated card photos so sideways/upside-down
images (with or without EXIF metadata) are corrected prior to field detection.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import torch
from ultralytics import YOLO

from philsys_config import DATASET_DIR, RUNS_DIR, WEIGHTS_DIR


def train_orientation(
    epochs: int = 12,
    imgsz: int = 224,
    batch: int = 32,
    device: str | None = None,
) -> Path:
    data_dir = DATASET_DIR / "orientation_cls"
    if not (data_dir / "train").exists():
        raise FileNotFoundError(f"Orientation dataset not found at {data_dir}. Run generate_dataset.py first.")

    if device is None:
        device = "0" if torch.cuda.is_available() else "cpu"

    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[train_orientation] Starting training on device={device}, epochs={epochs}, imgsz={imgsz}")
    model = YOLO(str(RUNS_DIR / "yolov8n-cls.pt"))
    results = model.train(
        data=str(data_dir),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=device,
        project=str(RUNS_DIR),
        name="orientation_cls",
        exist_ok=True,
        workers=2,
        # Disable random horizontal/vertical flip — flips break 90/270 text orientation labels!
        fliplr=0.0,
        flipud=0.0,
        degrees=10.0,
        hsv_s=0.3,
        hsv_v=0.3,
        verbose=True,
    )

    best_src = Path(results.save_dir) / "weights" / "best.pt"
    best_dst = WEIGHTS_DIR / "orientation_best.pt"
    shutil.copy2(best_src, best_dst)
    print(f"[train_orientation] Saved best orientation model -> {best_dst}")
    return best_dst


def main() -> None:
    parser = argparse.ArgumentParser(description="Train PhilSys 4-way orientation classifier.")
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--imgsz", type=int, default=224)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--device", type=str, default=None)
    args = parser.parse_args()
    train_orientation(epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, device=args.device)


if __name__ == "__main__":
    main()
