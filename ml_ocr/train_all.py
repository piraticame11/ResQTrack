"""
End-to-end training orchestrator for ResQTrack's Philippine National ID OCR system.
Generates synthetic PhilSys dataset and trains:
  1) YOLOv8n-cls 4-way Orientation Classifier
  2) YOLOv8n PhilSys Card & Field Detector
  3) Custom PyTorch CRNN Text Recognizer
"""

from __future__ import annotations

import argparse

from generate_dataset import generate_all
from train_crnn import train_crnn
from train_detector import train_detector
from train_orientation import train_orientation


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate dataset and train all PhilSys OCR models.")
    parser.add_argument("--train-cards", type=int, default=1200)
    parser.add_argument("--val-cards", type=int, default=200)
    parser.add_argument("--ori-epochs", type=int, default=10)
    parser.add_argument("--det-epochs", type=int, default=30)
    parser.add_argument("--crnn-epochs", type=int, default=18)
    parser.add_argument("--skip-dataset", action="store_true")
    args = parser.parse_args()

    if not args.skip_dataset:
        print("=== Step 1/4: Generating Synthetic PhilSys Dataset ===")
        generate_all(num_train=args.train_cards, num_val=args.val_cards)

    print("=== Step 2/4: Training 4-Way Orientation Classifier ===")
    train_orientation(epochs=args.ori_epochs)

    print("=== Step 3/4: Training PhilSys Field Detector ===")
    train_detector(epochs=args.det_epochs)

    print("=== Step 4/4: Training Custom PhilSys CRNN Recognizer ===")
    train_crnn(epochs=args.crnn_epochs)

    print("=== Training Complete! Weights saved in ml_ocr/weights/ ===")


if __name__ == "__main__":
    main()
