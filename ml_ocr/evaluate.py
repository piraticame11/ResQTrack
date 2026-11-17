"""
Evaluate the trained ResQTrack PhilSys OCR pipeline on validation images
and optional real ID photo(s).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from infer import PhilSysOcrEngine
from philsys_config import DATASET_DIR


def evaluate_val_orientation(engine: PhilSysOcrEngine, limit: int = 80) -> None:
    ori_val = DATASET_DIR / "orientation_cls" / "val"
    if not ori_val.exists():
        print("[evaluate] Orientation val directory not found, skipping.")
        return

    correct = 0
    total = 0
    for cls_dir in sorted(ori_val.iterdir()):
        if not cls_dir.is_dir():
            continue
        expected_angle = int(cls_dir.name.split("_")[1])
        imgs = sorted(cls_dir.glob("*.jpg"))[: max(1, limit // 4)]
        for img_path in imgs:
            preds = engine._predict_orientations(
                __import__("PIL.Image").Image.open(img_path).convert("RGB")
            )
            if preds[0][0] == expected_angle:
                correct += 1
            total += 1
    acc = correct / max(1, total)
    print(f"[evaluate] Orientation Val Accuracy ({total} samples): {acc:.4f} ({correct}/{total})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate trained PhilSys OCR models.")
    parser.add_argument("--image", type=str, default=None, help="Optional real National ID image to inspect")
    parser.add_argument("--ori-limit", type=int, default=80)
    args = parser.parse_args()

    engine = PhilSysOcrEngine()
    evaluate_val_orientation(engine, limit=args.ori_limit)

    if args.image:
        print(f"\n[evaluate] Running full pipeline on: {args.image}")
        res = engine.recognize_image(Path(args.image))
        print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
