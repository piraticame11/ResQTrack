"""
Train Stage 3: Custom PhilSys CRNN Text Recognizer (ResNet-CNN + BiLSTM + CTC Loss).
Trained on single-line field crops with realistic guilloche waves, hologram overlays,
and camera degradation so it accurately reads PhilSys PCNs, names, dates, and addresses.
"""

from __future__ import annotations

import argparse
import io
import random
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset, Sampler

from crnn_model import PhilSysCRNN, decode_ctc_greedy, preprocess_crop_for_crnn
from philsys_config import (
    CHAR_TO_IDX,
    CRNN_ALPHABET,
    CRNN_IMG_HEIGHT,
    CRNN_MAX_WIDTH,
    CTC_BLANK_IDX,
    DATASET_DIR,
    NUM_CRNN_CLASSES,
    WEIGHTS_DIR,
)


def encode_text(text: str) -> list[int]:
    out: list[int] = []
    for ch in text.upper():
        if ch in CHAR_TO_IDX:
            out.append(CHAR_TO_IDX[ch])
    return out


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            curr.append(min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


class PhilSysTextDataset(Dataset):
    def __init__(self, split_dir: Path, augment: bool = False):
        self.split_dir = split_dir
        self.augment = augment
        self.samples: list[tuple[bytes, str]] = []
        self.widths: list[int] = []
        manifest = split_dir / "labels.tsv"
        if not manifest.exists():
            raise FileNotFoundError(f"Missing manifest: {manifest}. Run generate_dataset.py first.")
        for line in manifest.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            rel_path, label = line.split("\t", 1)
            if encode_text(label):
                img_bytes = (split_dir / rel_path).read_bytes()
                with Image.open(io.BytesIO(img_bytes)) as im:
                    w, h = im.size
                est_w = min(CRNN_MAX_WIDTH, max(16, int(round(w * (CRNN_IMG_HEIGHT / float(max(1, h)))))))
                self.samples.append((img_bytes, label.upper()))
                self.widths.append(est_w)


    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int, list[int], str]:
        img_bytes, label = self.samples[idx]
        with Image.open(io.BytesIO(img_bytes)) as im:
            img = im.convert("RGB")
        if self.augment:
            if random.random() < 0.5:
                img = ImageEnhance.Brightness(img).enhance(random.uniform(0.85, 1.15))
            if random.random() < 0.5:
                img = ImageEnhance.Contrast(img).enhance(random.uniform(0.85, 1.25))
            # Mild horizontal scale jitter
            if random.random() < 0.35:
                w, h = img.size
                nw = max(16, int(w * random.uniform(0.92, 1.08)))
                img = img.resize((nw, h), Image.Resampling.BILINEAR)

        tensor, valid_steps = preprocess_crop_for_crnn(img, CRNN_IMG_HEIGHT, CRNN_MAX_WIDTH)
        encoded = encode_text(label)
        return tensor, valid_steps, encoded, label


class BucketBatchSampler(Sampler[list[int]]):
    """Groups crops of similar width per batch to minimize right-padding waste while keeping batch order random."""

    def __init__(self, widths: list[int], batch_size: int, shuffle: bool = True):
        self.widths = widths
        self.batch_size = batch_size
        self.shuffle = shuffle

    def __iter__(self):
        indices = list(range(len(self.widths)))
        if self.shuffle:
            indices.sort(key=lambda i: self.widths[i] + random.randint(-28, 28))
        else:
            indices.sort(key=lambda i: self.widths[i])
        batches = [indices[i : i + self.batch_size] for i in range(0, len(indices), self.batch_size)]
        if len(batches) > 1 and len(batches[-1]) == 1:
            batches[-2].extend(batches.pop())
        if self.shuffle:
            random.shuffle(batches)
        return iter(batches)

    def __len__(self) -> int:
        full, rem = divmod(len(self.widths), self.batch_size)
        return max(1 if len(self.widths) > 0 else 0, full + (1 if rem > 1 else 0))


def collate_fn(batch):
    tensors, steps, encs, labels = zip(*batch)
    max_w = max(t.shape[2] for t in tensors)
    max_w = ((max_w + 3) // 4) * 4

    padded = torch.ones((len(tensors), 3, CRNN_IMG_HEIGHT, max_w), dtype=torch.float32) * 0.9
    for i, t in enumerate(tensors):
        w = t.shape[2]
        padded[i, :, :, :w] = t

    input_lengths = torch.tensor(steps, dtype=torch.long)
    target_lengths = torch.tensor([len(e) for e in encs], dtype=torch.long)
    targets = torch.tensor([tok for e in encs for tok in e], dtype=torch.long)
    return padded, input_lengths, targets, target_lengths, list(labels)


def train_crnn(
    epochs: int = 18,
    batch_size: int = 16,
    lr: float = 2e-3,
    device_str: str | None = None,
) -> Path:
    rec_root = DATASET_DIR / "text_rec"
    train_ds = PhilSysTextDataset(rec_root / "train", augment=True)
    val_ds = PhilSysTextDataset(rec_root / "val", augment=False)

    # Single-process loading + width-bucketed batches avoids Windows spawn stalls and padding waste.
    train_sampler = BucketBatchSampler(train_ds.widths, batch_size=batch_size, shuffle=True)
    val_sampler = BucketBatchSampler(val_ds.widths, batch_size=batch_size, shuffle=False)
    train_loader = DataLoader(train_ds, batch_sampler=train_sampler, num_workers=0, collate_fn=collate_fn, pin_memory=False)
    val_loader = DataLoader(val_ds, batch_sampler=val_sampler, num_workers=0, collate_fn=collate_fn, pin_memory=False)

    use_cuda = (device_str != "cpu") and torch.cuda.is_available()
    device = torch.device("cuda" if use_cuda else "cpu")
    print(f"[train_crnn] Device={device}, train_crops={len(train_ds)}, val_crops={len(val_ds)}, classes={NUM_CRNN_CLASSES}", flush=True)

    model = PhilSysCRNN(num_classes=NUM_CRNN_CLASSES).to(device)
    criterion = nn.CTCLoss(blank=CTC_BLANK_IDX, zero_infinity=True)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer,
        max_lr=lr,
        epochs=epochs,
        steps_per_epoch=max(1, len(train_loader)),
        pct_start=0.15,
    )

    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    best_path = WEIGHTS_DIR / "crnn_best.pt"
    best_cer = float("inf")

    for epoch in range(1, epochs + 1):
        t0 = time.perf_counter()
        model.train()
        total_loss = 0.0
        num_batches = len(train_loader)
        for step, (imgs, input_lengths, targets, target_lengths, _) in enumerate(train_loader, 1):
            imgs = imgs.to(device)
            targets = targets.to(device)
            optimizer.zero_grad(set_to_none=True)

            # FP32 avoids GTX 1650 AMP overflows in CTCLoss / BiLSTM
            log_probs = model(imgs)  # (T, B, C)
            T_max = log_probs.shape[0]
            in_lens = torch.clamp(input_lengths, max=T_max)
            loss = criterion(log_probs.float(), targets, in_lens, target_lengths)

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optimizer.step()
            scheduler.step()
            total_loss += float(loss.item())

            if epoch == 1 and (step % 50 == 0 or step == num_batches):
                print(
                    f"[train_crnn] Epoch 01 batch {step}/{num_batches} | loss={loss.item():.4f} | elapsed={time.perf_counter() - t0:.1f}s",
                    flush=True,
                )

        avg_loss = total_loss / max(1, num_batches)

        # Validation
        model.eval()
        total_chars = 0
        total_edits = 0
        exact_hits = 0
        total_samples = 0
        with torch.no_grad():
            for imgs, _, _, _, labels in val_loader:
                imgs = imgs.to(device)
                log_probs = model(imgs)
                preds = decode_ctc_greedy(log_probs.float().cpu())
                for (pred_txt, _), gt_txt in zip(preds, labels):
                    total_edits += levenshtein(pred_txt, gt_txt)
                    total_chars += max(1, len(gt_txt))
                    if pred_txt == gt_txt:
                        exact_hits += 1
                    total_samples += 1

        cer = total_edits / max(1, total_chars)
        exact_acc = exact_hits / max(1, total_samples)
        dt = time.perf_counter() - t0
        print(
            f"[train_crnn] Epoch {epoch:02d}/{epochs:02d} ({dt:.1f}s) | loss={avg_loss:.4f} | val_CER={cer:.4f} | val_exact={exact_acc:.3f}",
            flush=True,
        )

        if cer < best_cer:
            best_cer = cer
            torch.save(
                {
                    "model_state": model.state_dict(),
                    "alphabet": CRNN_ALPHABET,
                    "img_height": CRNN_IMG_HEIGHT,
                    "max_width": CRNN_MAX_WIDTH,
                    "val_cer": cer,
                    "val_exact": exact_acc,
                },
                best_path,
            )

    print(f"[train_crnn] Best val_CER={best_cer:.4f} saved -> {best_path}")
    return best_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Train custom PhilSys CRNN text recognizer.")
    parser.add_argument("--epochs", type=int, default=18)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-3)
    parser.add_argument("--device", type=str, default=None)
    args = parser.parse_args()
    train_crnn(epochs=args.epochs, batch_size=args.batch, lr=args.lr, device_str=args.device)


if __name__ == "__main__":
    main()
