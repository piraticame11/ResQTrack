"""
Production Philippine National ID (PhilSys) OCR Inference Engine for ResQTrack.

Pipeline:
  1. EXIF transpose + Stage 1 Orientation Classification (YOLOv8n-cls: 0/90/180/270)
  2. Stage 2 Field & Card Detection (YOLOv8n: card, header, pcn, last_name, first_name, middle_name, birthdate, address)
     - Automatic card-crop zoom refinement if card is small in frame
     - Fallback rotation search if orientation confidence is low or header/fields are missing
  3. Stage 3 Hybrid Text Recognition:
     - Custom-trained PhilSys CRNN (ResNet-CNN + BiLSTM + CTC)
     - RapidOCR (PP-OCRv4 ONNX) on upscaled/contrast-enhanced crops + DBNet multi-line slicing for address
  4. Stage 4 PhilSys domain post-processing & Philippine location mapping (ph-locations.json)

Supports:
  - Single image CLI:   python infer.py --image path/to/id.jpg
  - Persistent worker:  python infer.py --serve   (reads JSON lines on stdin, writes JSON lines on stdout)
"""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# Suppress noisy ultralytics/onnxruntime logs on stdout
os.environ.setdefault("YOLO_VERBOSE", "False")

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageOps
import torch
try:
    from rapidocr import RapidOCR
except ImportError:
    from rapidocr_onnxruntime import RapidOCR
from ultralytics import YOLO

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from crnn_model import PhilSysCRNN, decode_ctc_greedy, preprocess_crop_for_crnn
from philsys_config import (
    CRNN_IMG_HEIGHT,
    CRNN_MAX_WIDTH,
    DETECTOR_CLASSES,
    MONTHS_EN,
    NUM_CRNN_CLASSES,
    WEIGHTS_DIR,
    load_ph_locations,
)


def _norm_token(s: str) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", s.upper()).strip()


def _norm_nospace(s: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", s.upper())


def _canonical_city_variants(city_name: str) -> list[str]:
    """Generate matching variants for entries like 'City of Tagum (Capital)' or 'Davao City'."""
    base = re.sub(r"\s*\([^)]*\)", "", city_name).strip().upper()
    variants = {_norm_token(base)}
    m_city_of = re.match(r"^CITY OF (.+)$", base)
    m_x_city = re.match(r"^(.+) CITY$", base)
    if m_city_of:
        core = _norm_token(m_city_of.group(1))
        variants.add(core)
        variants.add(f"{core} CITY")
        variants.add(f"CITY OF {core}")
    elif m_x_city:
        core = _norm_token(m_x_city.group(1))
        variants.add(core)
        variants.add(f"{core} CITY")
        variants.add(f"CITY OF {core}")
    return [v for v in variants if v]


class PhilSysOcrEngine:
    def __init__(
        self,
        orientation_weights: Path | None = None,
        detector_weights: Path | None = None,
        crnn_weights: Path | None = None,
    ) -> None:
        ori_path = orientation_weights or (WEIGHTS_DIR / "orientation_best.pt")
        det_path = detector_weights or (WEIGHTS_DIR / "detector_best.pt")
        crnn_path = crnn_weights or (WEIGHTS_DIR / "crnn_best.pt")

        for p in (ori_path, det_path, crnn_path):
            if not p.exists():
                raise FileNotFoundError(f"Trained weight file missing: {p}")

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.ori_model = YOLO(str(ori_path))
        self.det_model = YOLO(str(det_path))

        ckpt = torch.load(crnn_path, map_location=self.device, weights_only=True)
        self.crnn = PhilSysCRNN(num_classes=NUM_CRNN_CLASSES).to(self.device)
        self.crnn.load_state_dict(ckpt["model_state"])
        self.crnn.eval()

        self.rapid_ocr = RapidOCR()
        self.locations = load_ph_locations()
        self._build_location_index()

    def _build_location_index(self) -> None:
        self.province_lookup: dict[str, str] = {}
        for prov in self.locations:
            norm = _norm_token(re.sub(r"\s*\([^)]*\)", "", prov))
            self.province_lookup[norm] = prov
            self.province_lookup[_norm_token(prov)] = prov
        # Common aliases
        if "Metro Manila" in self.locations:
            self.province_lookup["NCR"] = "Metro Manila"
            self.province_lookup["NATIONAL CAPITAL REGION"] = "Metro Manila"
        if "Cotabato (North Cotabato)" in self.locations:
            self.province_lookup["NORTH COTABATO"] = "Cotabato (North Cotabato)"
            self.province_lookup["COTABATO"] = "Cotabato (North Cotabato)"

        self.city_lookup_by_prov: dict[str, dict[str, str]] = {}
        self.global_city_lookup: dict[str, tuple[str, str]] = {}
        self.province_nospace: dict[str, str] = {}
        self.city_nospace_by_prov: dict[str, dict[str, str]] = {}
        self.global_city_nospace: dict[str, tuple[str, str]] = {}

        for p_norm, p_canon in self.province_lookup.items():
            p_ns = _norm_nospace(p_norm)
            if len(p_ns) >= 4:
                self.province_nospace[p_ns] = p_canon

        for prov, cities in self.locations.items():
            cmap: dict[str, str] = {}
            cmap_ns: dict[str, str] = {}
            for city in cities:
                for var in _canonical_city_variants(city):
                    cmap[var] = city
                    self.global_city_lookup.setdefault(var, (prov, city))
                    var_ns = _norm_nospace(var)
                    if len(var_ns) >= 5:
                        cmap_ns[var_ns] = city
                        self.global_city_nospace.setdefault(var_ns, (prov, city))
            self.city_lookup_by_prov[prov] = cmap
            self.city_nospace_by_prov[prov] = cmap_ns

    def _predict_orientations(self, img: Image.Image) -> list[tuple[int, float]]:
        """Return candidate CCW rotation angles sorted by predicted probability."""
        res = self.ori_model.predict(img, imgsz=224, verbose=False)[0]
        probs = res.probs.data.cpu().numpy()
        names = res.names
        candidates: list[tuple[int, float]] = []
        for idx, prob in enumerate(probs):
            cls_name = names[idx]  # e.g. 'rot_90'
            angle = int(cls_name.split("_")[1])
            candidates.append((angle, float(prob)))
        candidates.sort(key=lambda x: x[1], reverse=True)
        return candidates

    def _detect_fields(self, img: Image.Image, conf: float = 0.22) -> dict[str, dict[str, Any]]:
        """Run YOLOv8 field detector and return best box per class."""
        res = self.det_model.predict(img, imgsz=640, conf=conf, verbose=False)[0]
        best: dict[str, dict[str, Any]] = {}
        if res.boxes is None or len(res.boxes) == 0:
            return best

        for box in res.boxes:
            cls_id = int(box.cls.item())
            cls_name = DETECTOR_CLASSES[cls_id]
            score = float(box.conf.item())
            x0, y0, x1, y1 = [float(v) for v in box.xyxy[0].tolist()]
            if cls_name not in best or score > best[cls_name]["conf"]:
                best[cls_name] = {"bbox": (x0, y0, x1, y1), "conf": score}
        return best

    def _orient_and_detect(self, raw_img: Image.Image) -> tuple[Image.Image, dict[str, dict[str, Any]], int]:
        candidates = self._predict_orientations(raw_img)
        best_angle = candidates[0][0]
        best_img = raw_img if best_angle == 0 else raw_img.rotate(best_angle, expand=True)
        best_dets = self._detect_fields(best_img)

        def score_dets(dets: dict[str, dict[str, Any]]) -> tuple[int, float]:
            field_keys = ("header", "pcn", "last_name", "first_name", "middle_name", "birthdate", "address", "phl_seal")
            count = sum(1 for k in field_keys if k in dets)
            avg_c = sum(dets[k]["conf"] for k in field_keys if k in dets)
            return (count, avg_c)

        # If top orientation looks weak (< 3 fields or missing header), check other top orientations
        if score_dets(best_dets)[0] < 3 or ("header" not in best_dets and candidates[0][1] < 0.85):
            for angle, _prob in candidates[1:]:
                trial_img = raw_img if angle == 0 else raw_img.rotate(angle, expand=True)
                trial_dets = self._detect_fields(trial_img)
                if score_dets(trial_dets) > score_dets(best_dets):
                    best_img, best_dets, best_angle = trial_img, trial_dets, angle
                if score_dets(best_dets)[0] >= 5 and "header" in best_dets:
                    break

        # Card-crop zoom refinement: if card occupies < 75% of image area, crop tightly & re-detect
        if "card" in best_dets:
            iw, ih = best_img.size
            cx0, cy0, cx1, cy1 = best_dets["card"]["bbox"]
            area_ratio = ((cx1 - cx0) * (cy1 - cy0)) / max(1.0, iw * ih)
            if 0.10 < area_ratio < 0.78:
                pad_x = (cx1 - cx0) * 0.03
                pad_y = (cy1 - cy0) * 0.03
                crop_box = (
                    max(0, int(cx0 - pad_x)),
                    max(0, int(cy0 - pad_y)),
                    min(iw, int(cx1 + pad_x)),
                    min(ih, int(cy1 + pad_y)),
                )
                zoom_img = best_img.crop(crop_box)
                zoom_dets = self._detect_fields(zoom_img)
                if score_dets(zoom_dets) >= score_dets(best_dets):
                    best_img, best_dets = zoom_img, zoom_dets

        return best_img, best_dets, best_angle

    def _run_crnn(self, crop: Image.Image) -> tuple[str, float]:
        t1, _ = preprocess_crop_for_crnn(crop, CRNN_IMG_HEIGHT, CRNN_MAX_WIDTH)
        enhanced = ImageEnhance.Contrast(crop).enhance(1.35)
        t2, _ = preprocess_crop_for_crnn(enhanced, CRNN_IMG_HEIGHT, CRNN_MAX_WIDTH)
        max_w = max(t1.shape[2], t2.shape[2])
        batch = torch.ones((2, 3, CRNN_IMG_HEIGHT, max_w), dtype=torch.float32) * 0.9
        batch[0, :, :, : t1.shape[2]] = t1
        batch[1, :, :, : t2.shape[2]] = t2
        with torch.no_grad():
            log_probs = self.crnn(batch.to(self.device))
        preds = decode_ctc_greedy(log_probs.cpu())
        return max(preds, key=lambda x: (len(x[0]) > 0, x[1]))

    _LABEL_KEYS = (
        "TIRAHAN", "KAPANGANAKAN", "PETSA", "ETSANG", "DATEOFBIRTH", "DATEOF", "DATEOJ",
        "APELYIDO", "LASTNAME", "PANGALAN", "GIVENNAME", "GITNANG", "MIDDLENAME",
    )

    @classmethod
    def _is_philsys_label(cls, text: str) -> bool:
        ns = _norm_nospace(text)
        if not ns:
            return False
        return any(k in ns for k in cls._LABEL_KEYS) or ns in ("ADDRESS", "BIRTH", "SEX", "NAME")

    @staticmethod
    def _extract_rapid_items(result: list[Any]) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for box, txt, score in result:
            text_u = str(txt).strip().upper()
            if not text_u:
                continue
            xs = [pt[0] for pt in box]
            ys = [pt[1] for pt in box]
            items.append({
                "x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys),
                "yc": (min(ys) + max(ys)) / 2.0,
                "h": max(1.0, max(ys) - min(ys)),
                "text": text_u,
                "conf": float(score),
            })
        return items

    @staticmethod
    def _group_items_into_lines(items: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
        sorted_items = sorted(items, key=lambda it: it["yc"])
        lines: list[list[dict[str, Any]]] = []
        for it in sorted_items:
            if not lines:
                lines.append([it])
                continue
            prev_yc = sum(p["yc"] for p in lines[-1]) / len(lines[-1])
            prev_h = max(p["h"] for p in lines[-1])
            if abs(it["yc"] - prev_yc) < prev_h * 0.65:
                lines[-1].append(it)
            else:
                lines.append([it])
        for line_items in lines:
            line_items.sort(key=lambda it: it["x0"])
        return lines

    def _run_rapid_single(self, crop: Image.Image) -> tuple[str, float]:
        # Upscale small crops for crisp RapidOCR recognition
        w, h = crop.size
        scale = 2.0 if h < 60 else 1.5
        up = crop.resize((max(32, int(w * scale)), max(32, int(h * scale))), Image.Resampling.BICUBIC)
        bgr = cv2.cvtColor(np.asarray(up), cv2.COLOR_RGB2BGR)
        result, _ = self.rapid_ocr(bgr)
        if not result:
            return "", 0.0
        raw_items = self._extract_rapid_items(result)
        items = [it for it in raw_items if not self._is_philsys_label(it["text"])] or raw_items
        lines = self._group_items_into_lines(items)
        ordered = [it for line in lines for it in line]
        if not ordered:
            return "", 0.0
        return " ".join(it["text"] for it in ordered), sum(it["conf"] for it in ordered) / len(ordered)

    @classmethod
    def _filter_address_items(
        cls,
        items: list[dict[str, Any]],
        birthdate_local_box: tuple[float, float, float, float] | None,
        scale: float,
    ) -> list[dict[str, Any]]:
        """Drop field labels (e.g. Tirahan/Address, Petsa ng Kapanganakan) and overlapping birthdate spans."""
        anchor_cutoff_y: float | None = None
        for it in items:
            ns = _norm_nospace(it["text"])
            if "TIRAHAN" in ns or difflib.SequenceMatcher(None, ns, "TIRAHANADDRESS").ratio() >= 0.72:
                anchor_cutoff_y = max(anchor_cutoff_y or 0.0, it["yc"] + it["h"] * 0.25)

        b_scaled = None
        if birthdate_local_box is not None:
            bx0, by0, bx1, by1 = birthdate_local_box
            b_scaled = (bx0 * scale - 10, by0 * scale - 10, bx1 * scale + 10, by1 * scale + 10)

        month_pat = "|".join(MONTHS_EN)
        kept: list[dict[str, Any]] = []
        for it in items:
            if anchor_cutoff_y is not None and it["yc"] <= anchor_cutoff_y:
                continue
            ns = _norm_nospace(it["text"])
            if cls._is_philsys_label(it["text"]) or re.fullmatch(rf"(?:{month_pat})\d{{1,4}}", ns):
                continue
            if b_scaled is not None and anchor_cutoff_y is None:
                xc = (it["x0"] + it["x1"]) / 2.0
                if b_scaled[0] <= xc <= b_scaled[2] and b_scaled[1] <= it["yc"] <= b_scaled[3]:
                    continue
            kept.append(it)
        return kept

    def _recognize_multiline_address(
        self,
        crop: Image.Image,
        birthdate_local_box: tuple[float, float, float, float] | None = None,
    ) -> tuple[str, float]:
        """Use RapidOCR's line detector to slice multi-line address crops, then fuse RapidOCR + CRNN per line."""
        w, h = crop.size
        scale = 2.0 if w < 650 else 1.5
        up = crop.resize((max(64, int(w * scale)), max(32, int(h * scale))), Image.Resampling.BICUBIC)
        bgr = cv2.cvtColor(np.asarray(up), cv2.COLOR_RGB2BGR)
        result, _ = self.rapid_ocr(bgr)

        if not result:
            return self._run_crnn(crop)

        items = self._extract_rapid_items(result)
        items = self._filter_address_items(items, birthdate_local_box, scale)
        if not items:
            return self._run_crnn(crop)
        lines = self._group_items_into_lines(items)

        merged_lines: list[str] = []
        line_confs: list[float] = []
        uw, uh = up.size
        for line_items in lines:
            line_items.sort(key=lambda it: it["x0"])
            rapid_line = " ".join(it["text"] for it in line_items if it["text"]).strip()
            rapid_conf = sum(it["conf"] for it in line_items) / max(1, len(line_items))

            lx0 = max(0, int(min(it["x0"] for it in line_items) - 6))
            ly0 = max(0, int(min(it["y0"] for it in line_items) - 4))
            lx1 = min(uw, int(max(it["x1"] for it in line_items) + 6))
            ly1 = min(uh, int(max(it["y1"] for it in line_items) + 4))
            crnn_line, crnn_conf = self._run_crnn(up.crop((lx0, ly0, lx1, ly1)))

            # Unpack concatenated address prefixes & words that RapidOCR sometimes merges
            rapid_line = re.sub(r"(?<=\.)(?=[A-Z])", " ", rapid_line)
            rapid_line = re.sub(r"\b(PRK|PUROK)(?=[A-Z0-9])", r"\1. ", rapid_line)
            rapid_line = re.sub(r"\b(VILLA)(?=[A-Z])", r"\1 ", rapid_line)
            rapid_line = re.sub(r"\b(ROSAL)(?=[A-Z])", r"\1 ", rapid_line)
            rapid_line = re.sub(r"\b(MAGUGPO)(?=[A-Z])", r"\1 ", rapid_line)
            rapid_line = re.sub(r"(?<=[A-Z])(SOUT[AH]?)\b", r" SOUTH", rapid_line)
            rapid_line = re.sub(r"(?<=[A-Z])(SOUTH|NORTH|EAST|WEST|POBLACION|CENTRAL)\b", r" \1", rapid_line)
            rapid_line = re.sub(r"\bCITYOF(?=[A-Z])", "CITY OF ", rapid_line)
            rapid_line = re.sub(r"\bDEL(?=[A-Z])", "DEL ", rapid_line)
            rapid_line = re.sub(r"\bDAVAO(?=[A-Z])", "DAVAO ", rapid_line)
            rapid_line = re.sub(r"\s+", " ", rapid_line).strip()

            chosen = self._choose_address_line(crnn_line, crnn_conf, rapid_line, rapid_conf)
            if chosen:
                merged_lines.append(chosen)
                line_confs.append(max(crnn_conf, rapid_conf))

        return " ".join(merged_lines).strip(), (sum(line_confs) / len(line_confs) if line_confs else 0.0)

    @staticmethod
    def _choose_address_line(crnn_txt: str, crnn_conf: float, rapid_txt: str, rapid_conf: float) -> str:
        if not rapid_txt:
            return crnn_txt
        if not crnn_txt:
            return rapid_txt

        def score(txt: str, conf: float) -> float:
            blobs = sum(1 for tok in re.split(r"[\s,./\-]+", txt) if len(tok) > 13)
            stray = len(re.findall(r"[^A-Z0-9.,\-\sÑ/']", txt))
            digits_in_word = sum(1 for tok in txt.split() if re.search(r"[A-Z]\d|\d[A-Z]", tok))
            space_bonus = 0.04 if (len(txt) >= 12 and " " in txt) else 0.0
            return conf + (0.08 if "," in txt else 0.0) + space_bonus - 0.25 * stray - 0.20 * digits_in_word - 0.09 * blobs

        return crnn_txt if score(crnn_txt, crnn_conf) >= score(rapid_txt, rapid_conf) else rapid_txt

    @staticmethod
    def _clean_pcn(raw: str) -> str | None:
        if not raw:
            return None
        trans = str.maketrans({"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "|": "1", "Z": "2", "S": "5", "G": "6", "B": "8"})
        digits = re.sub(r"\D", "", raw.upper().translate(trans))
        if len(digits) == 16:
            return f"{digits[0:4]}-{digits[4:8]}-{digits[8:12]}-{digits[12:16]}"
        # Also look for dashed groups if noise crept at edges
        m = re.search(r"(\d{4})\D*(\d{4})\D*(\d{4})\D*(\d{4})", raw.upper().translate(trans))
        if m:
            return f"{m.group(1)}-{m.group(2)}-{m.group(3)}-{m.group(4)}"
        return None

    @staticmethod
    def _clean_name(raw: str) -> str | None:
        if not raw:
            return None
        s = raw.upper()
        # Strip stray non-letter noise at edges (e.g. from seal/hair/frame artifacts)
        s = re.sub(r"[^A-ZÑ\s.\-']", " ", s)
        s = re.sub(r"\bGLE\s+EN\b", "GLEN", s)
        s = re.sub(r"\s+", " ", s).strip(" .-")

        # Strip field label tokens that might leak into the name crop (e.g. "APELYIDO", "GITNANG", "PANGALAN", "MGA")
        label_tokens = {
            "APELYIDO", "APELYID", "APELY", "APEL",
            "GITNANG", "GITNAN", "GITNA",
            "MGA", "PANGALAN", "PANGAL",
            "LAST", "LASTNAME", "GIVEN", "GIVENNAMES", "MIDDLE", "MIDDLENAME", "NAME", "NAMES",
        }
        tokens = [tok for tok in s.split() if tok not in label_tokens]

        # Drop single stray digit/1-char artifact tokens at start/end unless valid initial like 'J.'
        while tokens and len(tokens[0]) == 1 and tokens[0] not in ("J", "A", "E", "O"):
            tokens.pop(0)
        while tokens and len(tokens[-1]) == 1 and tokens[-1] not in ("A", "I"):
            tokens.pop()
        cleaned = " ".join(tokens).strip()
        return cleaned if len(cleaned) >= 2 else None

    @staticmethod
    def _parse_birthdate(raw: str) -> str | None:
        if not raw:
            return None
        up = raw.upper()
        # Match "<MONTH_WORD> <DAY>, <YEAR>" even if month has 1-2 OCR typos or label noise slips in between
        m = re.search(r"([A-Z0-9]{3,11})\s+(\d{1,2})\s*,?\s*(\d{4})", up)
        if not m:
            month_pat = "|".join(MONTHS_EN)
            m = re.search(rf"({month_pat})\s+(\d{{1,2}})\D{{0,45}}?(\d{{4}})\b", up)
        if not m:
            m_num = re.search(r"(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})", up)
            if m_num:
                mo, dy, yr = int(m_num.group(1)), int(m_num.group(2)), int(m_num.group(3))
                try:
                    d_obj = dt.date(yr, mo, dy)
                    if 1900 < yr < dt.date.today().year:
                        return d_obj.isoformat()
                except ValueError:
                    return None
            return None

        month_tok, day_str, year_str = m.group(1), m.group(2), m.group(3)
        month_tok = month_tok.translate(str.maketrans({"0": "O", "1": "I", "3": "E", "4": "A", "5": "S", "8": "B"}))
        month_idx = None
        if month_tok in MONTHS_EN:
            month_idx = MONTHS_EN.index(month_tok) + 1
        else:
            matches = difflib.get_close_matches(month_tok, MONTHS_EN, n=1, cutoff=0.60)
            if matches:
                month_idx = MONTHS_EN.index(matches[0]) + 1

        if not month_idx:
            return None
        try:
            day = int(day_str)
            year = int(year_str)
            if not (1900 < year < dt.date.today().year):
                return None
            return dt.date(year, month_idx, day).isoformat()
        except ValueError:
            return None

    def _parse_address(self, raw_address: str) -> dict[str, str | None]:
        if not raw_address:
            return {
                "raw_address": None,
                "address_line": None,
                "province": None,
                "city": None,
                "barangay": None,
                "purok": None,
            }

        cleaned = re.sub(r"\s+", " ", raw_address.upper()).strip(" ,.-")
        cleaned = re.sub(r"(?<=[A-Z])0(?=[A-Z])", "O", cleaned)

        # Unpack commonly concatenated address words & prefixes
        cleaned = re.sub(r"\bPRK\.?(?=[A-Z])", "PRK. ", cleaned)
        cleaned = re.sub(r"\bPUROK(?=[A-Z0-9])", "PUROK ", cleaned)
        cleaned = re.sub(r"\bVILLAROSAL\b", "VILLA ROSAL", cleaned)
        cleaned = re.sub(r"\bMAGUGPOSOUTH?\b", "MAGUGPO SOUTH", cleaned)
        cleaned = re.sub(r"\bMAGUGPO\s+SOUT[AH]?\b", "MAGUGPO SOUTH", cleaned)
        cleaned = re.sub(r"\bSOUTA\b", "SOUTH", cleaned)
        cleaned = re.sub(r"\bCITYOFTAGUM\b", "CITY OF TAGUM", cleaned)
        cleaned = re.sub(r"\bCITYOF([A-Z]+)\b", r"CITY OF \1", cleaned)
        cleaned = re.sub(r"\bDAVAODELNORTE\b", "DAVAO DEL NORTE", cleaned)
        cleaned = re.sub(r"\bDELNORTE\b", "DEL NORTE", cleaned)
        norm_full = _norm_token(cleaned)

        # 1. Match Province (exact word boundary -> comma-segment fuzzy -> compact spaceless)
        matched_prov: str | None = None
        matched_prov_key: str | None = None
        for p_norm, p_canon in sorted(self.province_lookup.items(), key=lambda kv: len(kv[0]), reverse=True):
            if p_norm and re.search(rf"\b{re.escape(p_norm)}\b", norm_full):
                matched_prov = p_canon
                matched_prov_key = p_norm
                break

        if not matched_prov:
            segs = [_norm_token(s) for s in cleaned.split(",") if s.strip()]
            for seg in reversed(segs[-2:]):
                hits = difflib.get_close_matches(seg, list(self.province_lookup.keys()), n=1, cutoff=0.78)
                if hits:
                    matched_prov = self.province_lookup[hits[0]]
                    matched_prov_key = seg
                    break

        compact_full = _norm_nospace(cleaned)
        if not matched_prov and compact_full:
            for p_ns, p_canon in sorted(self.province_nospace.items(), key=lambda kv: len(kv[0]), reverse=True):
                if p_ns in compact_full:
                    matched_prov = p_canon
                    matched_prov_key = _norm_token(re.sub(r"\s*\([^)]*\)", "", p_canon))
                    break

        # 2. Match City within matched_prov (or globally only when province wasn't matched)
        matched_city: str | None = None
        matched_city_key: str | None = None
        if matched_prov:
            cmap = self.city_lookup_by_prov.get(matched_prov, {})
            for c_norm, c_canon in sorted(cmap.items(), key=lambda kv: len(kv[0]), reverse=True):
                if c_norm and re.search(rf"\b{re.escape(c_norm)}\b", norm_full):
                    matched_city = c_canon
                    matched_city_key = c_norm
                    break
            if not matched_city and cmap:
                for seg in reversed([s.strip() for s in cleaned.split(",") if s.strip()]):
                    hits = difflib.get_close_matches(_norm_token(seg), list(cmap.keys()), n=1, cutoff=0.78)
                    if hits:
                        matched_city = cmap[hits[0]]
                        matched_city_key = _norm_token(seg)
                        break
            if not matched_city and compact_full:
                cmap_ns = self.city_nospace_by_prov.get(matched_prov, {})
                for c_ns, c_canon in sorted(cmap_ns.items(), key=lambda kv: len(kv[0]), reverse=True):
                    if c_ns in compact_full:
                        matched_city = c_canon
                        matched_city_key = _norm_token(re.sub(r"\s*\([^)]*\)", "", c_canon))
                        break
        else:
            for c_norm, (p_canon, c_canon) in sorted(self.global_city_lookup.items(), key=lambda kv: len(kv[0]), reverse=True):
                if len(c_norm) >= 5 and re.search(rf"\b{re.escape(c_norm)}\b", norm_full):
                    matched_prov = p_canon
                    matched_city = c_canon
                    matched_city_key = c_norm
                    break
            if not matched_city and compact_full:
                for c_ns, (p_canon, c_canon) in sorted(self.global_city_nospace.items(), key=lambda kv: len(kv[0]), reverse=True):
                    if len(c_ns) >= 7 and c_ns in compact_full:
                        matched_prov = p_canon
                        matched_city = c_canon
                        matched_city_key = _norm_token(re.sub(r"\s*\([^)]*\)", "", c_canon))
                        break

        # 3. Extract Purok number if present (e.g. 'PUROK 5', 'PRK. 12')
        purok_match = re.search(r"\b(?:PUROK|PRK\.?)\s+(\d{1,2})\b", cleaned)
        purok_str = f"Purok {purok_match.group(1)}" if purok_match else None

        # 4. Detect tenant barangays (Manay / New Visayas)
        barangay_str: str | None = None
        if re.search(r"\bNEW\s*VISAYAS\b", norm_full) or "NEWVISAYAS" in compact_full:
            barangay_str = "New Visayas"
        elif re.search(r"\bMANAY\b", norm_full):
            barangay_str = "Manay"

        # 5. Build clean street/subdivision/barangay address_line (removing matched city & province tail)
        parts = [p.strip() for p in cleaned.split(",") if p.strip()]
        filtered_parts: list[str] = []
        for p in parts:
            pn = _norm_token(p)
            p_ns = _norm_nospace(p)
            if matched_prov_key and (
                pn == matched_prov_key
                or p_ns == _norm_nospace(matched_prov_key)
                or difflib.SequenceMatcher(None, pn, matched_prov_key).ratio() > 0.85
            ):
                continue
            if matched_city_key and (
                pn == matched_city_key
                or p_ns == _norm_nospace(matched_city_key)
                or difflib.SequenceMatcher(None, pn, matched_city_key).ratio() > 0.85
            ):
                continue
            if barangay_str and pn in (_norm_token(barangay_str), f"BRGY {_norm_token(barangay_str)}", f"BARANGAY {_norm_token(barangay_str)}"):
                continue
            filtered_parts.append(p)

        address_line = ", ".join(filtered_parts) if filtered_parts else cleaned
        # Strip inline city/province tail when OCR dropped commas (e.g. '..., CITY OF TAGUM. DAVAO DEL NORTE')
        for key_str in (matched_prov_key, matched_city_key):
            if key_str:
                flex_pat = r"[\s.,]*".join(re.escape(tok) for tok in key_str.split())
                address_line = re.sub(rf"(?:^|[\s.,]+){flex_pat}[\s.,]*$", "", address_line, flags=re.IGNORECASE).strip(" ,.-")
                if not matched_prov_key or key_str == matched_city_key:
                    address_line = re.sub(rf"[\s.,]+{flex_pat}\b", "", address_line, flags=re.IGNORECASE).strip(" ,.-")
        return {
            "raw_address": cleaned,
            "address_line": address_line,
            "province": matched_prov,
            "city": matched_city,
            "barangay": barangay_str,
            "purok": purok_str,
        }

    def _verify_philsys_seal(self, upright_img: Image.Image, dets: dict[str, dict[str, Any]]) -> tuple[bool, float]:
        """
        Verify the PhilSys security identifier (Maroon icon in bottom-right with 'PHL' + globe emblem).
        Returns (is_verified, confidence).
        Rule: If that icon is not seen then don't read the ID.
        """
        if "phl_seal" in dets and dets["phl_seal"]["conf"] >= 0.22:
            return True, float(dets["phl_seal"]["conf"])

        # Backup verification on bottom-right quadrant (x: 60%..100%, y: 50%..100%)
        uw, uh = upright_img.size
        br_crop = upright_img.crop((int(uw * 0.60), int(uh * 0.50), uw, uh))
        br_bgr = cv2.cvtColor(np.asarray(br_crop), cv2.COLOR_RGB2BGR)
        res, _ = self.rapid_ocr(br_bgr)
        if res:
            for item in res:
                txt = re.sub(r"[^A-Z]", "", item[1].upper())
                c = float(item[2])
                if ("PHL" in txt or txt == "PH" or "PHIL" in txt) and c >= 0.65:
                    return True, c

        return False, 0.0

    def recognize_image(self, image_path: str | Path) -> dict[str, Any]:
        raw_img = ImageOps.exif_transpose(Image.open(image_path)).convert("RGB")
        upright_img, dets, applied_rot = self._orient_and_detect(raw_img)
        uw, uh = upright_img.size

        # Rule: Maroon icon is the identifier if the ID is a PhilSys National ID.
        # "if that icon is not seen then dont read the id."
        seal_verified, seal_conf = self._verify_philsys_seal(upright_img, dets)
        field_keys = ("pcn", "last_name", "first_name", "middle_name", "birthdate", "address")
        detected_count = sum(1 for k in field_keys if k in dets)
        is_philsys = seal_verified and (("header" in dets and detected_count >= 1) or detected_count >= 2)

        if not is_philsys:
            err_msg = (
                "PhilSys security identifier (PHL seal) was not detected. Please upload a clear photo of a valid Philippine National ID."
                if not seal_verified
                else "Card fields could not be clearly identified. Please ensure the ID is well-lit and not blurry."
            )
            return {
                "is_philsys": False,
                "error": err_msg,
                "rotation_applied": applied_rot,
                "extracted": {
                    "id_type": None,
                    "id_number": None,
                    "last_name": None,
                    "first_name": None,
                    "middle_name": None,
                    "birthdate": None,
                    "address_line": None,
                    "province": None,
                    "city": None,
                    "barangay": None,
                    "purok": None,
                    "raw_address": None,
                },
                "raw_fields": {},
                "detections": {k: round(v["conf"], 4) for k, v in dets.items()},
            }

        raw_fields: dict[str, dict[str, Any]] = {}

        def crop_field(key: str, pad_x: int = 8, pad_y: int = 5) -> Image.Image | None:
            if key not in dets:
                return None
            x0, y0, x1, y1 = dets[key]["bbox"]
            return upright_img.crop((
                max(0, int(x0 - pad_x)),
                max(0, int(y0 - pad_y)),
                min(uw, int(x1 + pad_x)),
                min(uh, int(y1 + pad_y)),
            ))

        # 1. PCN
        pcn_val = None
        if (c := crop_field("pcn", pad_x=10, pad_y=6)) is not None:
            crnn_t, crnn_c = self._run_crnn(c)
            rapid_t, rapid_c = self._run_rapid_single(c)
            p_crnn = self._clean_pcn(crnn_t)
            p_rapid = self._clean_pcn(rapid_t)
            pcn_val = p_rapid if (p_rapid and (not p_crnn or rapid_c >= crnn_c)) else (p_crnn or p_rapid)
            raw_fields["pcn"] = {"crnn": crnn_t, "crnn_conf": crnn_c, "rapid": rapid_t, "rapid_conf": rapid_c}

        # 2. Names (Last, First, Middle)
        def read_name_field(key: str) -> str | None:
            c = crop_field(key, pad_x=10, pad_y=5)
            if c is None:
                return None
            crnn_t, crnn_c = self._run_crnn(c)
            rapid_t, rapid_c = self._run_rapid_single(c)
            n_crnn = self._clean_name(crnn_t)
            n_rapid = self._clean_name(rapid_t)
            raw_fields[key] = {"crnn": crnn_t, "crnn_conf": crnn_c, "rapid": rapid_t, "rapid_conf": rapid_c}
            if n_crnn and n_rapid:
                if n_crnn == n_rapid:
                    return n_crnn
                # Prefer RapidOCR if its confidence is strong, else compare normalized scores
                r_score = rapid_c - 0.08 * len(re.findall(r"\d", rapid_t))
                c_score = crnn_c - 0.08 * len(re.findall(r"\d", crnn_t))
                return n_rapid if r_score >= c_score else n_crnn
            return n_rapid or n_crnn

        last_name = read_name_field("last_name")
        first_name = read_name_field("first_name")
        middle_name = read_name_field("middle_name")

        # 3. Birthdate
        birthdate_val = None
        if (c := crop_field("birthdate", pad_x=10, pad_y=5)) is not None:
            crnn_t, crnn_c = self._run_crnn(c)
            rapid_t, rapid_c = self._run_rapid_single(c)
            b_crnn = self._parse_birthdate(crnn_t)
            b_rapid = self._parse_birthdate(rapid_t)
            raw_fields["birthdate"] = {"crnn": crnn_t, "crnn_conf": crnn_c, "rapid": rapid_t, "rapid_conf": rapid_c}
            birthdate_val = b_rapid if (b_rapid and (not b_crnn or rapid_c >= crnn_c)) else (b_crnn or b_rapid)

        # 4. Address
        addr_info: dict[str, str | None] = {
            "raw_address": None,
            "address_line": None,
            "province": None,
            "city": None,
            "barangay": None,
            "purok": None,
        }
        if (c := crop_field("address", pad_x=12, pad_y=8)) is not None:
            b_local = None
            if "birthdate" in dets:
                ax0 = max(0, int(dets["address"]["bbox"][0] - 12))
                ay0 = max(0, int(dets["address"]["bbox"][1] - 8))
                bx0, by0, bx1, by1 = dets["birthdate"]["bbox"]
                b_local = (bx0 - ax0, by0 - ay0, bx1 - ax0, by1 - ay0)
            addr_text, addr_conf = self._recognize_multiline_address(c, birthdate_local_box=b_local)
            raw_fields["address"] = {"merged": addr_text, "conf": addr_conf}
            addr_info = self._parse_address(addr_text)

        return {
            "is_philsys": True,
            "rotation_applied": applied_rot,
            "extracted": {
                "id_type": "PhilSys National ID",
                "id_number": pcn_val,
                "last_name": last_name.title() if last_name else None,
                "first_name": first_name.title() if first_name else None,
                "middle_name": middle_name.title() if middle_name else None,
                "birthdate": birthdate_val,
                "address_line": addr_info["address_line"],
                "province": addr_info["province"],
                "city": addr_info["city"],
                "barangay": addr_info["barangay"],
                "purok": addr_info["purok"],
                "raw_address": addr_info["raw_address"],
            },
            "raw_fields": raw_fields,
            "detections": {k: round(v["conf"], 4) for k, v in dets.items()},
        }


def serve_loop(engine: PhilSysOcrEngine) -> None:
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            image_path = req["image_path"]
            res = engine.recognize_image(image_path)
            print(json.dumps({"ok": True, **res}), flush=True)
        except Exception as exc:
            print(json.dumps({"ok": False, "error": str(exc)}), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="ResQTrack PhilSys OCR inference.")
    parser.add_argument("--image", type=str, help="Path to a single ID image.")
    parser.add_argument("--serve", action="store_true", help="Run persistent JSON-lines stdio worker.")
    args = parser.parse_args()

    engine = PhilSysOcrEngine()
    if args.serve:
        serve_loop(engine)
    elif args.image:
        out = engine.recognize_image(args.image)
        print(json.dumps(out, indent=2))
    else:
        parser.error("Provide either --image <path> or --serve")


if __name__ == "__main__":
    main()
