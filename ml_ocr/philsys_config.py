"""
Shared configuration, class definitions, character vocabulary, and Philippine
location helpers for the ResQTrack PhilSys National ID OCR training & inference pipeline.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
REPO_DIR = ROOT_DIR.parent
DATASET_DIR = ROOT_DIR / "dataset"
WEIGHTS_DIR = ROOT_DIR / "weights"
RUNS_DIR = ROOT_DIR / "runs"
PH_LOCATIONS_PATH = REPO_DIR / "client" / "public" / "data" / "ph-locations.json"

# 4-way orientation classifier classes (CCW rotation degrees needed to make card upright)
ORIENTATION_CLASSES = ["rot_0", "rot_90", "rot_180", "rot_270"]
ORIENTATION_TO_CW_ROT = {
    "rot_0": 0,
    "rot_90": 90,   # PIL rotate(90) = 90 deg CCW
    "rot_180": 180,
    "rot_270": 270, # PIL rotate(270) = 90 deg CW
}

# YOLO PhilSys object/field detection classes
DETECTOR_CLASSES = [
    "card",        # 0: Whole ID card boundary
    "header",      # 1: REPUBLIKA NG PILIPINAS / PAMBANSANG PAGKAKAKILANLAN banner
    "pcn",         # 2: 16-digit PhilSys Card Number (XXXX-XXXX-XXXX-XXXX)
    "last_name",   # 3: Apelyido / Last Name value
    "first_name",  # 4: Mga Pangalan / Given Names value
    "middle_name", # 5: Gitnang Apelyido / Middle Name value
    "birthdate",   # 6: Petsa ng Kapanganakan / Date of Birth value
    "address",     # 7: Tirahan / Address value (may wrap 1-3 lines)
]

CLASS_TO_ID = {name: idx for idx, name in enumerate(DETECTOR_CLASSES)}

# CRNN text recognition character set (index 0 reserved for CTC blank)
# All PhilSys printed field values are uppercase + digits + standard address punctuation
CRNN_ALPHABET = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZÑ-.,/'()"
CTC_BLANK_IDX = 0
CHAR_TO_IDX = {ch: idx + 1 for idx, ch in enumerate(CRNN_ALPHABET)}
IDX_TO_CHAR = {idx + 1: ch for idx, ch in enumerate(CRNN_ALPHABET)}
NUM_CRNN_CLASSES = len(CRNN_ALPHABET) + 1  # +1 for CTC blank

CRNN_IMG_HEIGHT = 48
CRNN_MAX_WIDTH = 640

MONTHS_EN = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
]

# Diverse Filipino names (including short, multi-word, hyphenated, and Ñ names)
FILIPINO_LAST_NAMES = [
    "GLORIA", "DELA CRUZ", "SANTOS", "REYES", "BAUTISTA", "RAMOS", "MENDOZA",
    "GARCIA", "TORRES", "VILLANUEVA", "FLORES", "AQUINO", "CASTRO", "RIVERA",
    "GONZALES", "HERNANDEZ", "LOPEZ", "FERNANDEZ", "PEREZ", "CRUZ", "NAVARRO",
    "SALAZAR", "SORIANO", "PASCUAL", "VALDEZ", "MAGNO", "PANGILINAN", "ALVAREZ",
    "DELOS SANTOS", "SAN JOSE", "CASTAÑEDA", "PEÑA", "MUÑOZ", "NIÑO", "IBARRA",
    "DIZON", "OCAMPO", "MERCADO", "TOLENTINO", "SANTIAGO", "CORPUZ", "PADILLA",
    "LIM", "TAN", "ONG", "CHUA", "SY", "UY", "MACARAIG", "MAGSAYSAY",
    "ABLIITER", "CORTEL", "VALENCIA", "ESTEBAN", "DOMINGO", "ROSALES", "CABRERA",
    "MANALO", "DAVID", "PINEDA", "CARREON", "ALCANTARA", "RODRIGUEZ", "MARTINEZ",
]

FILIPINO_FIRST_NAMES = [
    "HOWARD GLEN", "JUAN", "MARIA", "JOSE", "ANA", "PEDRO", "ROSA", "CARLOS",
    "JUAN CARLOS", "MARIA LOURDES", "MARK ANTHONY", "JOHN PAUL", "JOHN LLOYD",
    "EDZEL KIM", "JESSICA", "CHRISTIAN", "ANGELA", "MICHAEL", "JHON MARK",
    "PRINCESS", "JOSHUA", "KRISTINE JOY", "MARY GRACE", "KEVIN", "NICOLE",
    "RAPHAEL", "DANILO", "ERNESTO", "LIGAYA", "CYNTHIA", "NELIA", "ROBERTO",
    "KATHERINE", "FRANCISCO", "ANTONIO", "MIGUEL", "SOFIA", "GABRIEL", "ELENA",
    "ANDRES", "EMILIO", "CLARISSE", "JASMINE", "PATRICK", "JEROME", "ALDRIN",
    "MARICEL", "RONALD", "DENNIS", "ANALYN", "MA. THERESA", "JOSEFINA",
]

FILIPINO_MIDDLE_NAMES = [
    "CORTEL", "SANTOS", "REYES", "CRUZ", "BAUTISTA", "RAMOS", "MENDOZA",
    "GARCIA", "TORRES", "FLORES", "AQUINO", "CASTRO", "RIVERA", "LOPEZ",
    "NAVARRO", "SALAZAR", "VALDEZ", "DIZON", "OCAMPO", "PADILLA", "ROSALES",
    "VILLANUEVA", "MAGNO", "TOLENTINO", "SANTIAGO", "CORPUZ", "PEÑA", "MUÑOZ",
    "ALVAREZ", "DOMINGO", "CABRERA", "ALCANTARA", "PINEDA", "MANALO", "TAN",
]

STREET_PREFIXES = [
    "PRK.", "PUROK", "BLK", "LOT", "SITIO", "ZONE", "PHASE", "ST.",
]

PUROK_NAMES = [
    "VILLA ROSAL", "SAN ISIDRO", "MABINI", "RIZAL", "PAG-ASA", "MALIGAYA",
    "MABUHAY", "BAGONG SILANG", "MASIGLA", "SAMPAGUITA", "ROSAS", "KALAYAAN",
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15",
]

BARANGAY_SAMPLES = [
    "MANAY", "NEW VISAYAS", "MAGUGPO SOUTH", "MAGUGPO NORTH", "MAGUGPO EAST",
    "MAGUGPO WEST", "MAGUGPO POBLACION", "SAN FRANCISCO", "GREDU", "NEW PANDAN",
    "SALVACION", "CAGANGOHAN", "SAN PEDRO", "POBLACION", "LA PAZ", "SANTA CRUZ",
    "SAN ROQUE", "SAN JOSE", "SAN ANTONIO", "SAN JUAN", "RIZAL", "STO. NIÑO",
    "MATINA CROSSING", "BUHANGIN", "TALOMO", "AGDAO", "TORIL", "MINTAL",
]


def load_ph_locations() -> dict[str, list[str]]:
    if PH_LOCATIONS_PATH.exists():
        with PH_LOCATIONS_PATH.open("r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "Davao del Norte": ["City of Panabo", "City of Tagum (Capital)", "Carmen", "Santo Tomas"],
        "Davao del Sur": ["Davao City", "City of Digos (Capital)"],
    }
