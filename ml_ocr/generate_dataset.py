"""
Synthetic Philippine National ID (PhilSys PVC & ePhilID) dataset generator.

Generates three aligned datasets for ResQTrack's OCR pipeline:
1. dataset/orientation_cls/{train,val}/{rot_0,rot_90,rot_180,rot_270}
2. dataset/field_det/{images,labels}/{train,val} + data.yaml (YOLO format)
3. dataset/text_rec/{train,val}/crops/*.png + labels.tsv (single-line CRNN crops)
"""

from __future__ import annotations

import argparse
import io
import math
import random
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

from philsys_config import (
    BARANGAY_SAMPLES,
    CLASS_TO_ID,
    DATASET_DIR,
    DETECTOR_CLASSES,
    FILIPINO_FIRST_NAMES,
    FILIPINO_LAST_NAMES,
    FILIPINO_MIDDLE_NAMES,
    MONTHS_EN,
    ORIENTATION_CLASSES,
    PUROK_NAMES,
    STREET_PREFIXES,
    load_ph_locations,
)

# Font discovery (Windows standard + cross-platform fallbacks)
FONT_CANDIDATES_BOLD = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\ARIALNB.TTF",
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
    r"C:\Windows\Fonts\tahomabd.ttf",
    r"C:\Windows\Fonts\verdanab.ttf",
]
FONT_CANDIDATES_REG = [
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\ARIALN.TTF",
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\calibri.ttf",
    r"C:\Windows\Fonts\tahoma.ttf",
    r"C:\Windows\Fonts\verdana.ttf",
]
FONT_CANDIDATES_ITALIC = [
    r"C:\Windows\Fonts\ariali.ttf",
    r"C:\Windows\Fonts\segoeuii.ttf",
    r"C:\Windows\Fonts\calibrii.ttf",
    r"C:\Windows\Fonts\arial.ttf",
]


def _existing_fonts(paths: list[str]) -> list[str]:
    found = [p for p in paths if Path(p).exists()]
    return found if found else []


BOLD_FONTS = _existing_fonts(FONT_CANDIDATES_BOLD)
REG_FONTS = _existing_fonts(FONT_CANDIDATES_REG)
ITALIC_FONTS = _existing_fonts(FONT_CANDIDATES_ITALIC)


def load_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if candidates:
        path = random.choice(candidates)
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def random_identity(locations: dict[str, list[str]], rng: random.Random) -> dict[str, Any]:
    last_name = rng.choice(FILIPINO_LAST_NAMES)
    first_name = rng.choice(FILIPINO_FIRST_NAMES)
    # ~5% have no middle name
    middle_name = "" if rng.random() < 0.05 else rng.choice(FILIPINO_MIDDLE_NAMES)

    month = rng.choice(MONTHS_EN)
    day = rng.randint(1, 28 if month == "FEBRUARY" else 30)
    year = rng.randint(1950, 2008)
    birthdate = f"{month} {day:02d}, {year}" if rng.random() < 0.35 else f"{month} {day}, {year}"

    pcn = "-".join("".join(str(rng.randint(0, 9)) for _ in range(4)) for _ in range(4))

    # Bias 30% toward Davao del Norte / Davao Region so Barangay Manay/New Visayas/Tagum/Panabo
    # patterns are richly represented, while keeping 70% nationwide across all PH provinces.
    if rng.random() < 0.30 and "Davao del Norte" in locations:
        province = "Davao del Norte"
    else:
        province = rng.choice(list(locations.keys()))
    cities = locations[province] or ["City of Panabo"]
    city = rng.choice(cities)

    # Format city like PhilSys cards often print (sometimes stripping "(Capital)")
    city_print = city.replace(" (Capital)", "").upper() if rng.random() < 0.75 else city.upper()
    province_print = province.upper()

    prefix = rng.choice(STREET_PREFIXES)
    if prefix in ("PRK.", "PUROK"):
        street_part = f"{prefix} {rng.choice(PUROK_NAMES)}"
    elif prefix in ("BLK", "LOT"):
        street_part = f"BLK {rng.randint(1, 40)} LOT {rng.randint(1, 50)}"
    elif prefix == "ST.":
        street_part = f"{rng.randint(10, 999)} {rng.choice(['RIZAL', 'MABINI', 'BONIFACIO', 'LUNA', 'MAGSAYSAY'])} ST."
    else:
        street_part = f"{prefix} {rng.randint(1, 12)} {rng.choice(PUROK_NAMES)}"

    if province == "Davao del Norte" and rng.random() < 0.45:
        brgy = rng.choice(["MANAY", "NEW VISAYAS", "MAGUGPO SOUTH", "MAGUGPO NORTH", "GREDU", "SAN FRANCISCO"])
    else:
        brgy = rng.choice(BARANGAY_SAMPLES)

    if rng.random() < 0.25:
        brgy_str = f"BRGY. {brgy}"
    else:
        brgy_str = brgy

    full_address = f"{street_part}, {brgy_str}, {city_print}, {province_print}"
    return {
        "pcn": pcn,
        "last_name": last_name,
        "first_name": first_name,
        "middle_name": middle_name,
        "birthdate": birthdate,
        "address": full_address,
        "province": province,
        "city": city,
    }


def _draw_guilloche_background(w: int, h: int, variant: str, rng: random.Random) -> Image.Image:
    """Create pastel PhilSys PVC or ePhilID background with guilloche wave security patterns."""
    # Base pastel canvas
    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    xn = x_grid / w
    yn = y_grid / h

    base = np.ones((h, w, 3), dtype=np.float32) * rng.uniform(244, 253)

    if variant == "pvc":
        # Top-right / right soft blue-cyan wave
        blue_mask = np.clip((xn * 1.15 - yn * 0.55 + 0.1 * np.sin(yn * 7.0 + rng.uniform(0, 3))) * 1.5, 0.0, 1.0)
        base[:, :, 0] -= blue_mask * rng.uniform(35, 72)
        base[:, :, 1] -= blue_mask * rng.uniform(10, 32)

        # Center-bottom soft pink/salmon ribbon
        pink_center = np.exp(-(((xn - 0.55 + 0.08 * np.sin(yn * 5.0)) / 0.28) ** 2 + ((yn - 0.62) / 0.35) ** 2))
        base[:, :, 1] -= pink_center * rng.uniform(34, 68)
        base[:, :, 2] -= pink_center * rng.uniform(22, 50)

        # Bottom-left / top-left soft warm gold/tan tint
        gold_mask = np.clip((1.0 - xn * 1.2) * (0.6 + 0.4 * yn), 0.0, 1.0)
        base[:, :, 1] -= gold_mask * rng.uniform(10, 26)
        base[:, :, 2] -= gold_mask * rng.uniform(28, 60)
    else:
        # ePhilID / Digital ID lighter tint
        tint = np.clip(xn * 0.5 + yn * 0.3, 0.0, 1.0)
        base[:, :, 0] -= tint * rng.uniform(10, 20)
        base[:, :, 1] -= tint * rng.uniform(4, 12)

    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    # Fine wavy guilloche lines across card
    num_waves = rng.randint(14, 24) if variant == "pvc" else rng.randint(6, 12)
    for _ in range(num_waves):
        amp = rng.uniform(8, 28)
        freq = rng.uniform(0.008, 0.022)
        phase = rng.uniform(0, math.tau)
        y0 = rng.uniform(0, h)
        color = rng.choice([
            (180, 205, 228, rng.randint(30, 65)),
            (225, 180, 185, rng.randint(30, 65)),
            (218, 205, 165, rng.randint(25, 55)),
        ])
        pts = [(x, y0 + amp * math.sin(x * freq + phase)) for x in range(0, w + 16, 16)]
        draw.line(pts, fill=color, width=rng.randint(1, 2))

    return img


def _draw_coat_of_arms(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, rng: random.Random) -> None:
    """Draw stylized Philippine Coat of Arms seal."""
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(145, 130, 110, 180), width=2)
    draw.ellipse((cx - r + 5, cy - r + 5, cx + r - 5, cy + r - 5), fill=(250, 245, 232, 220))
    # Sun + shield halves
    sr = int(r * 0.55)
    draw.pieslice((cx - sr, cy - sr, cx + sr, cy + sr), 180, 360, fill=(235, 205, 65, 220))
    draw.pieslice((cx - sr, cy - sr, cx + sr, cy + sr), 90, 180, fill=(40, 85, 180, 220))
    draw.pieslice((cx - sr, cy - sr, cx + sr, cy + sr), 0, 90, fill=(200, 48, 55, 220))
    draw.ellipse((cx - int(r * 0.2), cy - int(r * 0.2), cx + int(r * 0.2), cy + int(r * 0.2)), fill=(250, 215, 50, 240))


def _draw_portrait(img: Image.Image, box: tuple[int, int, int, int], rng: random.Random) -> None:
    """Render a synthetic face portrait (varying skin tone, hair, shirt, studio bg)."""
    x0, y0, x1, y1 = box
    pw, ph = x1 - x0, y1 - y0
    bg_tone = rng.randint(228, 250)
    portrait = Image.new("RGB", (pw, ph), (bg_tone, bg_tone, bg_tone))
    pdraw = ImageDraw.Draw(portrait)

    shirt_color = rng.choice([
        (35, 45, 70), (50, 50, 58), (120, 40, 45), (35, 85, 65),
        (210, 210, 220), (85, 105, 140), (65, 45, 40),
    ])
    skin_tone = rng.choice([
        (212, 168, 140), (195, 148, 118), (225, 186, 158), (175, 128, 98),
    ])
    hair_color = rng.choice([(28, 24, 24), (42, 34, 30), (20, 20, 22)])

    # Shoulders / shirt
    pdraw.pieslice((int(-0.1 * pw), int(0.66 * ph), int(1.1 * pw), int(1.35 * ph)), 180, 360, fill=shirt_color)
    # Neck
    pdraw.rectangle((int(0.38 * pw), int(0.55 * ph), int(0.62 * pw), int(0.75 * ph)), fill=skin_tone)
    # Hair back
    pdraw.ellipse((int(0.18 * pw), int(0.08 * ph), int(0.82 * pw), int(0.64 * ph)), fill=hair_color)
    # Face
    pdraw.ellipse((int(0.24 * pw), int(0.16 * ph), int(0.76 * pw), int(0.64 * ph)), fill=skin_tone)
    # Hair top bangs
    pdraw.pieslice((int(0.21 * pw), int(0.08 * ph), int(0.79 * pw), int(0.42 * ph)), 180, 360, fill=hair_color)
    # Facial features (eyes, nose, lips) so CNN sees realistic facial edge densities
    eye_y = int(0.36 * ph)
    pdraw.ellipse((int(0.34 * pw), eye_y, int(0.42 * pw), eye_y + 7), fill=(40, 32, 30))
    pdraw.ellipse((int(0.58 * pw), eye_y, int(0.66 * pw), eye_y + 7), fill=(40, 32, 30))
    pdraw.line((int(0.50 * pw), int(0.39 * ph), int(0.50 * pw), int(0.48 * ph)), fill=(160, 112, 88), width=3)
    pdraw.arc((int(0.41 * pw), int(0.50 * ph), int(0.59 * pw), int(0.57 * ph)), 10, 170, fill=(165, 92, 92), width=3)

    # Slight soft blur like real printed card photo
    portrait = portrait.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.4, 1.0)))
    img.paste(portrait, (x0, y0))


def _draw_hologram_seal(img: Image.Image, rng: random.Random) -> None:
    """Draw translucent circular embossed hologram / microtext seal overlapping left-center fields."""
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    cx = int(w * rng.uniform(0.26, 0.36))
    cy = int(h * rng.uniform(0.42, 0.62))
    max_r = int(w * rng.uniform(0.10, 0.16))
    tint = rng.choice([
        (215, 115, 130),
        (235, 190, 200),
        (175, 200, 225),
        (235, 235, 235),
    ])
    for r in range(18, max_r, rng.randint(8, 14)):
        alpha = rng.randint(24, 70)
        odraw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(*tint, alpha), width=rng.randint(1, 2))
    # Subtle faint starburst/glare patch
    if rng.random() < 0.65:
        gx = cx + rng.randint(-30, 50)
        gy = cy + rng.randint(-30, 50)
        gr = rng.randint(35, 95)
        odraw.ellipse((gx - gr, gy - gr, gx + gr, gy + gr), fill=(255, 255, 255, rng.randint(25, 75)))

    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"))


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_w: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for word in words:
        trial = f"{cur} {word}".strip()
        bbox = draw.textbbox((0, 0), trial, font=font)
        if bbox[2] - bbox[0] <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def _draw_text_and_bbox(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int],
    pad: int = 4,
) -> tuple[int, int, int, int]:
    draw.text(xy, text, font=font, fill=fill)
    bx0, by0, bx1, by1 = draw.textbbox(xy, text, font=font)
    return (bx0 - pad, by0 - pad, bx1 + pad, by1 + pad)


def render_synthetic_card(
    identity: dict[str, Any],
    rng: random.Random,
    variant: str | None = None,
) -> tuple[Image.Image, dict[str, tuple[int, int, int, int]], list[tuple[str, tuple[int, int, int, int]]]]:
    """
    Render one clean upright PhilSys National ID card (1000x630).
    Returns:
      - card_img (PIL.Image RGB)
      - boxes: dict mapping DETECTOR_CLASSES name -> (x0, y0, x1, y1)
      - line_crops: list of (ground_truth_text, (x0, y0, x1, y1)) for single-line CRNN training
    """
    w, h = 1000, 630
    if variant is None:
        variant = "pvc" if rng.random() < 0.80 else "ephilid"

    card = _draw_guilloche_background(w, h, variant, rng)
    draw = ImageDraw.Draw(card, "RGBA")

    text_dark = (
        rng.randint(25, 58),
        rng.randint(25, 58),
        rng.randint(28, 62),
    )
    label_color = (
        rng.randint(65, 105),
        rng.randint(65, 105),
        rng.randint(70, 110),
    )

    # Slight layout jitter so detector learns robustness
    jx = rng.randint(-12, 12)
    jy = rng.randint(-10, 10)

    # Coat of arms top-left
    _draw_coat_of_arms(draw, 115 + jx, 82 + jy, 52, rng)

    # Header top-right
    f_hdr_b1 = load_font(BOLD_FONTS, rng.randint(24, 28))
    f_hdr_r1 = load_font(REG_FONTS, rng.randint(19, 22))
    f_hdr_b2 = load_font(BOLD_FONTS, rng.randint(23, 27))
    f_hdr_r2 = load_font(REG_FONTS, rng.randint(19, 22))

    hx = 265 + jx
    hy = 24 + jy
    hb1 = _draw_text_and_bbox(draw, (hx + 100, hy), "REPUBLIKA NG PILIPINAS", f_hdr_b1, text_dark, pad=2)
    hb2 = _draw_text_and_bbox(draw, (hx + 140, hy + 28), "Republic of the Philippines", f_hdr_r1, label_color, pad=2)
    hb3 = _draw_text_and_bbox(draw, (hx + 35, hy + 54), "PAMBANSANG PAGKAKAKILANLAN", f_hdr_b2, text_dark, pad=2)
    hb4 = _draw_text_and_bbox(draw, (hx + 125, hy + 83), "Philippine Identification Card" if variant == "pvc" else "Philippine Identification System", f_hdr_r2, label_color, pad=2)

    header_box = (
        min(hb1[0], hb2[0], hb3[0], hb4[0]) - 4,
        min(hb1[1], hb2[1], hb3[1], hb4[1]) - 4,
        max(hb1[2], hb2[2], hb3[2], hb4[2]) + 4,
        max(hb1[3], hb2[3], hb3[3], hb4[3]) + 4,
    )

    boxes: dict[str, tuple[int, int, int, int]] = {
        "card": (0, 0, w, h),
        "header": header_box,
    }
    line_crops: list[tuple[str, tuple[int, int, int, int]]] = []

    # Portrait
    p_box = (36 + jx, 212 + jy, 265 + jx, 478 + jy)
    _draw_portrait(card, p_box, rng)
    draw = ImageDraw.Draw(card, "RGBA")

    # Small ghost portrait
    if variant == "pvc":
        gx0, gy0 = 282 + jx, 198 + jy
        ghost = card.crop(p_box).resize((72, 86), Image.Resampling.BILINEAR).convert("L").convert("RGB")
        ghost_arr = np.asarray(ghost, dtype=np.float32)
        bg_arr = np.asarray(card.crop((gx0, gy0, gx0 + 72, gy0 + 86)), dtype=np.float32)
        blended = np.clip(bg_arr * 0.72 + ghost_arr * 0.28, 0, 255).astype(np.uint8)
        card.paste(Image.fromarray(blended), (gx0, gy0))
        draw = ImageDraw.Draw(card, "RGBA")

    # PCN
    f_pcn = load_font(BOLD_FONTS, rng.randint(25, 30))
    pcn_xy = (40 + jx, 156 + jy)
    pcn_box = _draw_text_and_bbox(draw, pcn_xy, identity["pcn"], f_pcn, text_dark, pad=6)
    boxes["pcn"] = pcn_box
    line_crops.append((identity["pcn"], pcn_box))

    # Main biographical fields
    fx = 392 + jx
    fy = 188 + jy
    f_lbl = load_font(ITALIC_FONTS or REG_FONTS, rng.randint(17, 19))
    f_val = load_font(BOLD_FONTS, rng.randint(25, 30))
    val_step = rng.randint(68, 76)

    fields_spec = [
        ("last_name", "Apelyido/Last Name", identity["last_name"]),
        ("first_name", "Mga Pangalan/Given Names", identity["first_name"]),
        ("middle_name", "Gitnang Apelyido/Middle Name", identity["middle_name"]),
        ("birthdate", "Petsa ng Kapanganakan/Date of Birth", identity["birthdate"]),
    ]

    for idx_f, (cls_name, lbl_text, val_text) in enumerate(fields_spec):
        ly = fy + idx_f * val_step
        draw.text((fx, ly), lbl_text, font=f_lbl, fill=label_color)
        if val_text:
            vy = ly + rng.randint(22, 26)
            vbox = _draw_text_and_bbox(draw, (fx, vy), val_text, f_val, text_dark, pad=6)
            boxes[cls_name] = vbox
            line_crops.append((val_text, vbox))

    # Address field (bottom left -> center)
    ax = 40 + jx
    ay = 492 + jy
    f_addr_lbl = load_font(ITALIC_FONTS or REG_FONTS, rng.randint(17, 19))
    f_addr_val = load_font(REG_FONTS, rng.randint(22, 26))
    draw.text((ax, ay), "Tirahan/Address", font=f_addr_lbl, fill=label_color)

    max_addr_w = 760 if variant == "pvc" else 640
    addr_lines = _wrap_text(draw, identity["address"], f_addr_val, max_addr_w)[:3]
    addr_boxes: list[tuple[int, int, int, int]] = []
    cur_ay = ay + rng.randint(24, 28)
    for line in addr_lines:
        lbox = _draw_text_and_bbox(draw, (ax, cur_ay), line, f_addr_val, text_dark, pad=5)
        addr_boxes.append(lbox)
        line_crops.append((line, lbox))
        cur_ay = lbox[3] + rng.randint(1, 5)

    if addr_boxes:
        boxes["address"] = (
            min(b[0] for b in addr_boxes),
            min(b[1] for b in addr_boxes),
            max(b[2] for b in addr_boxes),
            max(b[3] for b in addr_boxes),
        )

    # Bottom-right PHL badge + fingerprint / QR graphic
    f_phl = load_font(BOLD_FONTS, 30)
    draw.text((802 + jx, 540 + jy), "PHL", font=f_phl, fill=(135, 138, 145))
    if variant == "ephilid":
        # Stylized QR block on right
        qx, qy, qs = 770 + jx, 220 + jy, 175
        draw.rectangle((qx, qy, qx + qs, qy + qs), fill=(255, 255, 255), outline=(90, 95, 105), width=2)
        cell = 11
        for r_i in range(1, qs // cell - 1):
            for c_i in range(1, qs // cell - 1):
                if rng.random() < 0.48:
                    draw.rectangle((qx + c_i * cell, qy + r_i * cell, qx + (c_i + 1) * cell - 2, qy + (r_i + 1) * cell - 2), fill=(35, 35, 40))
    else:
        # Fingerprint bracket motif bottom right
        fx0, fy0 = 815 + jx, 195 + jy
        for r_ring in range(10, 48, 8):
            draw.arc((fx0 + 55 - r_ring, fy0 + 55 - r_ring, fx0 + 55 + r_ring, fy0 + 55 + r_ring), 20, 320, fill=(100, 105, 115, 180), width=2)
        draw.line([(fx0 + 10, fy0 + 25), (fx0 + 10, fy0 + 5), (fx0 + 35, fy0 + 5)], fill=(215, 65, 75, 210), width=4)
        draw.line([(fx0 + 75, fy0 + 5), (fx0 + 100, fy0 + 5), (fx0 + 100, fy0 + 25)], fill=(65, 125, 210, 210), width=4)

    # Hologram/embossed seal overlay (drawn AFTER text just like real card!)
    if variant == "pvc" and rng.random() < 0.85:
        _draw_hologram_seal(card, rng)

    return card, boxes, line_crops


def _find_perspective_coeffs(src_pts: list[tuple[float, float]], dst_pts: list[tuple[float, float]]) -> list[float]:
    matrix = []
    for p1, p2 in zip(dst_pts, src_pts):
        matrix.append([p1[0], p1[1], 1, 0, 0, 0, -p2[0] * p1[0], -p2[0] * p1[1]])
        matrix.append([0, 0, 0, p1[0], p1[1], 1, -p2[1] * p1[0], -p2[1] * p1[1]])
    A = np.matrix(matrix, dtype=np.float64)
    B = np.array(src_pts).reshape(8)
    res = np.dot(np.linalg.inv(A.T * A) * A.T, B)
    return np.array(res).reshape(8).tolist()


def _random_table_bg(w: int, h: int, rng: random.Random) -> Image.Image:
    base_col = np.array([rng.randint(35, 225), rng.randint(35, 225), rng.randint(35, 225)], dtype=np.float32)
    noise = np.random.default_rng(rng.randint(0, 10**9)).normal(0, rng.uniform(6, 22), (h // 4, w // 4, 3))
    bg = np.clip(base_col + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(bg, "RGB").resize((w, h), Image.Resampling.BILINEAR)
    draw = ImageDraw.Draw(img)
    # Optional wood-grain / desk stripes
    if rng.random() < 0.5:
        for _ in range(rng.randint(4, 15)):
            y = rng.randint(0, h)
            c = tuple(int(np.clip(v + rng.randint(-25, 25), 0, 255)) for v in base_col)
            draw.line([(0, y), (w, y + rng.randint(-30, 30))], fill=c, width=rng.randint(2, 10))
    return img


def compose_camera_scene(
    card_img: Image.Image,
    boxes: dict[str, tuple[int, int, int, int]],
    rng: random.Random,
) -> tuple[Image.Image, dict[str, tuple[float, float, float, float]]]:
    """
    Place the synthetic card either tightly framed (simulating cropped upload) or on a
    desk/table background with slight tilt/perspective, lighting, glare, blur, and JPEG noise.
    Returns (scene_img, transformed_boxes).
    """
    cw, ch = card_img.size
    tight_crop = rng.random() < 0.55

    if tight_crop:
        # Tight frame around card (88% - 100% fill) with minor border
        pad_x = rng.randint(0, 45)
        pad_y = rng.randint(0, 45)
        sw, sh = cw + pad_x * 2, ch + pad_y * 2
        bg = _random_table_bg(sw, sh, rng)
        angle = rng.uniform(-5.5, 5.5)
        scale = rng.uniform(0.92, 1.03)
    else:
        # Card photographed on a table/hand
        sw = rng.randint(1150, 1500)
        sh = rng.randint(760, 1080)
        bg = _random_table_bg(sw, sh, rng)
        angle = rng.uniform(-11.0, 11.0)
        scale = rng.uniform(0.62, 0.92)

    cx_dst = sw / 2.0 + rng.uniform(-0.04 * sw, 0.04 * sw)
    cy_dst = sh / 2.0 + rng.uniform(-0.04 * sh, 0.04 * sh)

    rad = math.radians(angle)
    cos_a, sin_a = math.cos(rad) * scale, math.sin(rad) * scale

    # Perspective jitter on the 4 corners
    pj = rng.uniform(0.0, 18.0) if not tight_crop else rng.uniform(0.0, 7.0)

    def map_pt(px: float, py: float) -> tuple[float, float]:
        dx, dy = px - cw / 2.0, py - ch / 2.0
        nx = cx_dst + dx * cos_a - dy * sin_a
        ny = cy_dst + dx * sin_a + dy * cos_a
        return nx, ny

    src_corners = [(0.0, 0.0), (float(cw), 0.0), (float(cw), float(ch)), (0.0, float(ch))]
    dst_corners = [
        (map_pt(*pt)[0] + rng.uniform(-pj, pj), map_pt(*pt)[1] + rng.uniform(-pj, pj))
        for pt in src_corners
    ]

    coeffs = _find_perspective_coeffs(src_corners, dst_corners)
    warped_card = card_img.convert("RGBA").transform(
        (sw, sh), Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC
    )
    scene = bg.convert("RGBA")
    scene.alpha_composite(warped_card)
    scene_rgb = scene.convert("RGB")

    # Apply homography to bounding boxes
    # Inverse coeffs map dst -> src, so solve forward src -> dst for bbox projection
    fwd_coeffs = _find_perspective_coeffs(dst_corners, src_corners)
    a, b, c, d, e, f, g, h_c = fwd_coeffs

    def project_pt(x: float, y: float) -> tuple[float, float]:
        denom = g * x + h_c * y + 1.0
        if abs(denom) < 1e-6:
            denom = 1e-6
        return (a * x + b * y + c) / denom, (d * x + e * y + f) / denom

    out_boxes: dict[str, tuple[float, float, float, float]] = {}
    for cls_name, (x0, y0, x1, y1) in boxes.items():
        pts = [project_pt(x0, y0), project_pt(x1, y0), project_pt(x1, y1), project_pt(x0, y1)]
        px0 = max(0.0, min(p[0] for p in pts))
        py0 = max(0.0, min(p[1] for p in pts))
        px1 = min(float(sw), max(p[0] for p in pts))
        py1 = min(float(sh), max(p[1] for p in pts))
        if px1 - px0 > 6 and py1 - py0 > 6:
            out_boxes[cls_name] = (px0, py0, px1, py1)

    # Realistic camera degradation: lighting gradient + glare + blur + resolution downsample + JPEG
    arr = np.asarray(scene_rgb, dtype=np.float32)
    yy, xx = np.mgrid[0:sh, 0:sw].astype(np.float32)
    grad_x = rng.uniform(-0.14, 0.14) * ((xx / sw) - 0.5)
    grad_y = rng.uniform(-0.14, 0.14) * ((yy / sh) - 0.5)
    arr = arr * (1.0 + grad_x[:, :, None] + grad_y[:, :, None])

    if rng.random() < 0.55:
        gx = rng.uniform(0.15, 0.85) * sw
        gy = rng.uniform(0.15, 0.85) * sh
        gr = rng.uniform(0.10, 0.28) * min(sw, sh)
        glare = np.exp(-(((xx - gx) ** 2 + (yy - gy) ** 2) / (2 * gr ** 2))) * rng.uniform(18, 52)
        arr = arr + glare[:, :, None]

    # Sensor noise
    if rng.random() < 0.65:
        sigma = rng.uniform(2.0, 8.0)
        arr = arr + np.random.default_rng(rng.randint(0, 10**9)).normal(0, sigma, arr.shape)

    scene_rgb = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

    # Brightness / contrast / color jitter
    scene_rgb = ImageEnhance.Brightness(scene_rgb).enhance(rng.uniform(0.84, 1.18))
    scene_rgb = ImageEnhance.Contrast(scene_rgb).enhance(rng.uniform(0.85, 1.22))

    # Mild blur or lower resolution phone photo simulation
    if rng.random() < 0.45:
        scene_rgb = scene_rgb.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.3, 1.1)))
    if rng.random() < 0.45:
        down_scale = rng.uniform(0.60, 0.90)
        dw, dh = max(320, int(sw * down_scale)), max(200, int(sh * down_scale))
        scene_rgb = scene_rgb.resize((dw, dh), Image.Resampling.BILINEAR).resize((sw, sh), Image.Resampling.BICUBIC)

    # JPEG compression artifacts
    buf = io.BytesIO()
    scene_rgb.save(buf, format="JPEG", quality=rng.randint(52, 94))
    buf.seek(0)
    scene_rgb = Image.open(buf).convert("RGB")
    return scene_rgb, out_boxes


def _degrade_crop(crop: Image.Image, rng: random.Random) -> Image.Image:
    """Apply realistic camera blur, scale, contrast, noise, and JPEG artifacts to a line crop."""
    w, h = crop.size
    arr = np.asarray(crop, dtype=np.float32)
    if rng.random() < 0.6:
        arr = arr + np.random.default_rng(rng.randint(0, 10**9)).normal(0, rng.uniform(1.5, 7.5), arr.shape)
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    out = ImageEnhance.Brightness(out).enhance(rng.uniform(0.82, 1.18))
    out = ImageEnhance.Contrast(out).enhance(rng.uniform(0.82, 1.25))
    if rng.random() < 0.45:
        out = out.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.2, 0.95)))
    if rng.random() < 0.40 and h > 20:
        s = rng.uniform(0.55, 0.88)
        out = out.resize((max(16, int(w * s)), max(12, int(h * s))), Image.Resampling.BILINEAR)
        out = out.resize((w, h), Image.Resampling.BICUBIC)
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=rng.randint(50, 95))
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def _write_yolo_yaml(det_root: Path) -> None:
    yaml_lines = [
        f"path: {det_root.resolve().as_posix()}",
        "train: images/train",
        "val: images/val",
        f"nc: {len(DETECTOR_CLASSES)}",
        "names:",
    ]
    for idx, name in enumerate(DETECTOR_CLASSES):
        yaml_lines.append(f"  {idx}: {name}")
    (det_root / "data.yaml").write_text("\n".join(yaml_lines) + "\n", encoding="utf-8")


def generate_all(
    num_train: int = 1200,
    num_val: int = 200,
    seed: int = 42,
) -> None:
    rng = random.Random(seed)
    locations = load_ph_locations()

    ori_root = DATASET_DIR / "orientation_cls"
    det_root = DATASET_DIR / "field_det"
    rec_root = DATASET_DIR / "text_rec"

    for split in ("train", "val"):
        for cls_name in ORIENTATION_CLASSES:
            (ori_root / split / cls_name).mkdir(parents=True, exist_ok=True)
        (det_root / "images" / split).mkdir(parents=True, exist_ok=True)
        (det_root / "labels" / split).mkdir(parents=True, exist_ok=True)
        (rec_root / split / "crops").mkdir(parents=True, exist_ok=True)

    _write_yolo_yaml(det_root)

    rec_manifests: dict[str, list[str]] = {"train": [], "val": []}
    crop_counter = {"train": 0, "val": 0}

    total = num_train + num_val
    for idx in range(total):
        split = "train" if idx < num_train else "val"
        ident = random_identity(locations, rng)
        card_img, card_boxes, line_crops = render_synthetic_card(ident, rng)

        # Save single-line CRNN crops directly from the rendered card (with random crop jitter + degradation)
        cw, ch = card_img.size
        for gt_text, (bx0, by0, bx1, by1) in line_crops:
            if not gt_text:
                continue
            pad_l = rng.randint(-2, 6)
            pad_r = rng.randint(-2, 8)
            pad_t = rng.randint(-1, 5)
            pad_b = rng.randint(-1, 5)
            cx0 = max(0, bx0 - pad_l)
            cy0 = max(0, by0 - pad_t)
            cx1 = min(cw, bx1 + pad_r)
            cy1 = min(ch, by1 + pad_b)
            if cx1 - cx0 < 16 or cy1 - cy0 < 12:
                continue
            crop = _degrade_crop(card_img.crop((cx0, cy0, cx1, cy1)), rng)
            c_idx = crop_counter[split]
            crop_counter[split] += 1
            crop_name = f"crop_{c_idx:06d}.jpg"
            crop.save(rec_root / split / "crops" / crop_name, quality=92)
            rec_manifests[split].append(f"crops/{crop_name}\t{gt_text}")

        # Compose full camera scene (upright 0 deg with slight tilt & camera noise)
        scene_img, scene_boxes = compose_camera_scene(card_img, card_boxes, rng)
        sw, sh = scene_img.size

        # Save YOLO field detection sample
        img_name = f"id_{idx:05d}.jpg"
        scene_img.save(det_root / "images" / split / img_name, quality=92)

        yolo_lines: list[str] = []
        for cls_name, (x0, y0, x1, y1) in scene_boxes.items():
            cls_id = CLASS_TO_ID[cls_name]
            xc = ((x0 + x1) / 2.0) / sw
            yc = ((y0 + y1) / 2.0) / sh
            bw = (x1 - x0) / sw
            bh = (y1 - y0) / sh
            yolo_lines.append(f"{cls_id} {xc:.6f} {yc:.6f} {bw:.6f} {bh:.6f}")
        (det_root / "labels" / split / f"id_{idx:05d}.txt").write_text("\n".join(yolo_lines) + "\n", encoding="utf-8")

        # Save Orientation Classification sample (generate all 4 rotations on subset or 1-2 per card)
        rot_choices = ORIENTATION_CLASSES if (idx % 2 == 0) else [rng.choice(ORIENTATION_CLASSES)]
        ori_preview = scene_img.resize((320, int(320 * sh / sw)), Image.Resampling.BILINEAR)
        for cls_name in rot_choices:
            # cls_name means the CCW rotation needed to bring image upright!
            # So if image is stored rotated CW by `need_ccw`, rotating it CCW by `need_ccw` fixes it.
            # PIL rotate(angle): angle is CCW!
            # Wait: to generate an image that NEEDS 90 deg CCW to fix, we rotate the upright card by 270 deg CCW (90 deg CW)!
            need_ccw = int(cls_name.split("_")[1])
            gen_ccw = (360 - need_ccw) % 360
            rot_img = ori_preview if gen_ccw == 0 else ori_preview.rotate(gen_ccw, expand=True)
            rot_img.save(ori_root / split / cls_name / f"ori_{idx:05d}_{cls_name}.jpg", quality=90)

        if (idx + 1) % 250 == 0 or idx + 1 == total:
            print(f"[generate_dataset] {idx + 1}/{total} cards rendered...")

    for split in ("train", "val"):
        (rec_root / split / "labels.tsv").write_text("\n".join(rec_manifests[split]) + "\n", encoding="utf-8")
        print(f"[generate_dataset] {split}: {crop_counter[split]} text crops saved.")

    # Add ~5% negative non-PhilSys images to field_det so YOLO rejects Driver's Licenses / non-ID scenes
    neg_counts = {"train": max(10, num_train // 20), "val": max(4, num_val // 20)}
    for split, n_neg in neg_counts.items():
        for n_i in range(n_neg):
            sw, sh = rng.randint(800, 1200), rng.randint(520, 800)
            neg_img = _random_table_bg(sw, sh, rng)
            ndraw = ImageDraw.Draw(neg_img)
            # Draw random non-PhilSys card rectangle and unrelated text lines
            cx0, cy0 = rng.randint(60, 220), rng.randint(50, 140)
            cx1, cy1 = sw - rng.randint(60, 220), sh - rng.randint(50, 140)
            ndraw.rectangle((cx0, cy0, cx1, cy1), fill=(rng.randint(215, 245), rng.randint(220, 245), rng.randint(230, 250)), outline=(120, 120, 130), width=2)
            f_neg = load_font(BOLD_FONTS or REG_FONTS, 22)
            ndraw.text((cx0 + 30, cy0 + 30), rng.choice(["DRIVER'S LICENSE", "LAND TRANSPORTATION OFFICE", "REPUBLIC OF THE PHILIPPINES", "SAMPLE DOCUMENT"]), font=f_neg, fill=(40, 40, 50))
            neg_name = f"neg_{n_i:04d}.jpg"
            neg_img.save(det_root / "images" / split / neg_name, quality=88)
            (det_root / "labels" / split / f"neg_{n_i:04d}.txt").write_text("", encoding="utf-8")
    print("[generate_dataset] Negative non-PhilSys examples added.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic Philippine National ID datasets.")
    parser.add_argument("--train", type=int, default=1200, help="Number of training cards")
    parser.add_argument("--val", type=int, default=200, help="Number of validation cards")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()
    generate_all(num_train=args.train, num_val=args.val, seed=args.seed)


if __name__ == "__main__":
    main()
