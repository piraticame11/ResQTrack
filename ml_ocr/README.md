# ResQTrack Philippine National ID (PhilSys) OCR Pipeline

Custom-trained Python ML + OCR system for reading Philippine National IDs (PVC PhilID & ePhilID/Digital National ID) during resident registration.

## Architecture

1. **Stage 1 — Orientation Classifier (`ml_ocr/train_orientation.py`)**:
   - `YOLOv8n-cls` trained to classify `0°`, `90°`, `180°`, `270°` rotations (with or without EXIF metadata).
2. **Stage 2 — Card & Field Detector (`ml_ocr/train_detector.py`)**:
   - `YOLOv8n` trained to detect `card`, `header`, `pcn`, `last_name`, `first_name`, `middle_name`, `birthdate`, and `address`.
   - Includes automatic card-crop zoom refinement and multi-orientation fallback if header/fields are weak.
3. **Stage 3 — Hybrid Text Recognizer (`ml_ocr/train_crnn.py` + RapidOCR PP-OCRv4)**:
   - Custom PyTorch `PhilSysCRNN` (ResNet-style CNN + 2-layer BiLSTM + CTC loss) trained specifically on PhilSys fonts, guilloche waves, and hologram overlays.
   - Combined with RapidOCR (`rapidocr-onnxruntime`) for line-sliced multi-line address reading and cross-validation.
4. **Stage 4 — PhilSys Domain Parser (`ml_ocr/infer.py`)**:
   - Cleans PCN (`XXXX-XXXX-XXXX-XXXX`), fuzzy-parses `MONTH DD, YYYY` birthdates, and matches Philippine Provinces & Cities against `client/public/data/ph-locations.json`.

## Setup

```powershell
python -m venv ml_ocr\.venv
.\ml_ocr\.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
.\ml_ocr\.venv\Scripts\python.exe -m pip install -r ml_ocr\requirements.txt
```

## Training

Run the full pipeline (synthetic dataset generation + orientation + field detector + CRNN):

```powershell
.\ml_ocr\.venv\Scripts\python.exe ml_ocr\train_all.py
```

Or run individual steps:

```powershell
.\ml_ocr\.venv\Scripts\python.exe ml_ocr\generate_dataset.py --train 1200 --val 200
.\ml_ocr\.venv\Scripts\python.exe ml_ocr\train_orientation.py --epochs 10
.\ml_ocr\.venv\Scripts\python.exe ml_ocr\train_detector.py --epochs 30
.\ml_ocr\.venv\Scripts\python.exe ml_ocr\train_crnn.py --epochs 18
```

## Inference & Evaluation

```powershell
.\ml_ocr\.venv\Scripts\python.exe ml_ocr\evaluate.py --image path\to\national_id.jpg
.\ml_ocr\.venv\Scripts\python.exe ml_ocr\infer.py --image path\to\national_id.jpg
```

Node.js (`server/utils/ocr.js`) automatically launches `ml_ocr/infer.py --serve` as a persistent stdio worker when trained weights exist in `ml_ocr/weights/`, and falls back to `tesseract.js` for non-PhilSys IDs (such as Driver's Licenses) or when Python weights are not installed.
