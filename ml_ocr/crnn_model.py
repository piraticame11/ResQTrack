"""
Custom PyTorch CRNN (ResNet-CNN + BiLSTM + CTC) text recognizer tailored to
Philippine National ID (PhilSys) typography, guilloche backgrounds, and hologram glare.
"""

from __future__ import annotations

import numpy as np
from PIL import Image
import torch
import torch.nn as nn
import torch.nn.functional as F

from philsys_config import (
    CRNN_IMG_HEIGHT,
    CRNN_MAX_WIDTH,
    CTC_BLANK_IDX,
    IDX_TO_CHAR,
    NUM_CRNN_CLASSES,
)


class ConvBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, kernel_size: int = 3, padding: int = 1):
        super().__init__()
        self.conv = nn.Conv2d(in_ch, out_ch, kernel_size, padding=padding, bias=False)
        self.bn = nn.BatchNorm2d(out_ch)
        self.act = nn.GELU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.act(self.bn(self.conv(x)))


class ResidualBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)
        self.act = nn.GELU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.act(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return self.act(x + out)


class PhilSysCRNN(nn.Module):
    """
    Input:  (B, 3, 48, W) RGB tensor normalized to [-1, 1]
    Output: (T, B, NUM_CRNN_CLASSES) log-probabilities for CTCLoss / greedy decode
            where T = W // 4
    """

    def __init__(self, num_classes: int = NUM_CRNN_CLASSES, hidden_size: int = 192):
        super().__init__()
        self.cnn = nn.Sequential(
            ConvBlock(3, 32),
            nn.MaxPool2d(kernel_size=(2, 2), stride=(2, 2)),     # 48xW -> 24x(W/2)

            ConvBlock(32, 64),
            nn.MaxPool2d(kernel_size=(2, 2), stride=(2, 2)),     # 24x(W/2) -> 12x(W/4)

            ConvBlock(64, 128),
            ResidualBlock(128),
            nn.MaxPool2d(kernel_size=(2, 1), stride=(2, 1)),     # 12x(W/4) -> 6x(W/4)

            ConvBlock(128, 256),
            ResidualBlock(256),
            nn.MaxPool2d(kernel_size=(2, 1), stride=(2, 1)),     # 6x(W/4) -> 3x(W/4)

            nn.Conv2d(256, 256, kernel_size=(3, 1), padding=(0, 0), bias=False),  # 3x(W/4) -> 1x(W/4)
            nn.BatchNorm2d(256),
            nn.GELU(),
        )
        self.rnn = nn.LSTM(
            input_size=256,
            hidden_size=hidden_size,
            num_layers=2,
            bidirectional=True,
            batch_first=True,
            dropout=0.2,
        )
        self.head = nn.Linear(hidden_size * 2, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feat = self.cnn(x)                       # (B, 256, 1, T)
        feat = feat.squeeze(2).permute(0, 2, 1)  # (B, T, 256)
        seq, _ = self.rnn(feat)                  # (B, T, hidden_size * 2)
        logits = self.head(seq)                  # (B, T, C)
        return F.log_softmax(logits, dim=-1).permute(1, 0, 2)  # (T, B, C)


def preprocess_crop_for_crnn(
    img: Image.Image,
    target_height: int = CRNN_IMG_HEIGHT,
    max_width: int = CRNN_MAX_WIDTH,
    pad_width: int | None = None,
) -> tuple[torch.Tensor, int]:
    """
    Aspect-ratio preserving resize to target_height, padded on the right with white/light background
    to either pad_width or a multiple of 4 (min 32, max max_width).
    Returns (tensor[3, H, W], valid_timesteps).
    """
    rgb = img.convert("RGB")
    w, h = rgb.size
    if h <= 0 or w <= 0:
        w, h = 64, target_height
        rgb = Image.new("RGB", (w, h), (255, 255, 255))

    new_w = max(16, int(round(w * (target_height / float(h)))))
    if new_w > max_width:
        new_w = max_width

    resized = rgb.resize((new_w, target_height), Image.Resampling.BICUBIC)
    canvas_w = pad_width if pad_width is not None else max(32, ((new_w + 3) // 4) * 4)
    canvas_w = min(max_width, max(canvas_w, ((new_w + 3) // 4) * 4))

    # Estimate border background color to pad smoothly instead of creating a hard edge
    arr = np.asarray(resized, dtype=np.float32)
    right_col = arr[:, -2:, :].mean(axis=(0, 1)) if new_w >= 2 else np.array([245.0, 245.0, 245.0])
    pad_color = tuple(int(np.clip(c, 180, 255)) for c in right_col)

    canvas = Image.new("RGB", (canvas_w, target_height), pad_color)
    canvas.paste(resized, (0, 0))

    tensor = torch.from_numpy(np.asarray(canvas, dtype=np.float32)).permute(2, 0, 1) / 255.0
    tensor = (tensor - 0.5) / 0.5
    valid_steps = max(1, new_w // 4)
    return tensor, valid_steps


def decode_ctc_greedy(log_probs: torch.Tensor) -> list[tuple[str, float]]:
    """
    log_probs: (T, B, C)
    Returns list of (decoded_text, mean_token_confidence) of length B.
    """
    probs = log_probs.exp()
    best_probs, best_ids = probs.max(dim=-1)  # (T, B)
    T, B = best_ids.shape
    results: list[tuple[str, float]] = []

    for b in range(B):
        chars: list[str] = []
        confs: list[float] = []
        prev = CTC_BLANK_IDX
        for t in range(T):
            idx = int(best_ids[t, b].item())
            prob = float(best_probs[t, b].item())
            if idx != CTC_BLANK_IDX and idx != prev:
                ch = IDX_TO_CHAR.get(idx, "")
                if ch:
                    chars.append(ch)
                    confs.append(prob)
            prev = idx
        text = "".join(chars).strip()
        conf = float(sum(confs) / len(confs)) if confs else 0.0
        results.append((text, conf))

    return results
