"""
Train Stage 2: PhilSys Card & Field Detector (YOLOv8n) on synthetic PhilSys IDs.
Detects: card, header, pcn, last_name, first_name, middle_name, birthdate, address.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import torch
from ultralytics import YOLO

from philsys_config import DATASET_DIR, RUNS_DIR, WEIGHTS_DIR


def train_detector(
    epochs: int = 22,
    imgsz: int = 640,
    batch: int = 16,
    device: str | None = None,
) -> Path:
    data_yaml = DATASET_DIR / "field_det" / "data.yaml"
    if not data_yaml.exists():
        raise FileNotFoundError(f"Detector dataset YAML not found at {data_yaml}. Run generate_dataset.py first.")

    if device is None:
        device = "0" if torch.cuda.is_available() else "cpu"

    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[train_detector] Starting training on device={device}, epochs={epochs}, imgsz={imgsz}")
    model = YOLO(str(RUNS_DIR / "yolov8n.pt"))
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=device,
        project=str(RUNS_DIR),
        name="field_det",
        exist_ok=True,
        workers=0,
        # Keep fliplr=0 because text orientation & PhilSys left/right layout are asymmetric!
        fliplr=0.0,
        flipud=0.0,
        degrees=10.0,
        translate=0.08,
        scale=0.35,
        perspective=0.0005,
        mosaic=0.3,
        mixup=0.0,
        hsv_h=0.015,
        hsv_s=0.3,
        hsv_v=0.3,
        verbose=True,
    )

    best_src = Path(results.save_dir) / "weights" / "best.pt"
    best_dst = WEIGHTS_DIR / "detector_best.pt"
    shutil.copy2(best_src, best_dst)
    print(f"[train_detector] Saved best field detector model -> {best_dst}")
    return best_dst


def main() -> None:
    parser = argparse.ArgumentParser(description="Train PhilSys card & field detector.")
    parser.add_argument("--epochs", type=int, default=22)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", type=str, default=None)
    args = parser.parse_args()
    train_detector(epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, device=args.device)


if __name__ == "__main__":
    main()
