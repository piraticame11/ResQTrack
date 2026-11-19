const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { createWorker } = require('tesseract.js');

const ML_OCR_DIR = path.resolve(__dirname, '../../ml_ocr');
const INFER_SCRIPT = path.join(ML_OCR_DIR, 'infer.py');
const REQUIRED_WEIGHTS = [
  path.join(ML_OCR_DIR, 'weights', 'orientation_best.pt'),
  path.join(ML_OCR_DIR, 'weights', 'detector_best.pt'),
  path.join(ML_OCR_DIR, 'weights', 'crnn_best.pt'),
];

function resolvePythonBin() {
  if (process.env.OCR_PYTHON_BIN && fs.existsSync(process.env.OCR_PYTHON_BIN)) {
    return process.env.OCR_PYTHON_BIN;
  }
  const winVenv = path.join(ML_OCR_DIR, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(winVenv)) return winVenv;
  const unixVenv = path.join(ML_OCR_DIR, '.venv', 'bin', 'python');
  if (fs.existsSync(unixVenv)) return unixVenv;
  return null;
}

function isPythonOcrReady() {
  return Boolean(
    resolvePythonBin() &&
    fs.existsSync(INFER_SCRIPT) &&
    REQUIRED_WEIGHTS.every((p) => fs.existsSync(p))
  );
}

// Persistent stdio JSON-lines worker for Python ML OCR so PyTorch/YOLO/CRNN
// models stay warm in memory across registration requests.
let workerState = null;
let workerQueue = Promise.resolve();

function resetPythonWorker() {
  if (!workerState) return;
  try {
    workerState.rl.close();
  } catch { /* ignore */ }
  try {
    workerState.proc.kill();
  } catch { /* ignore */ }
  workerState = null;
}

function startPythonWorker() {
  if (workerState && !workerState.proc.killed) {
    return workerState.readyPromise;
  }

  const pythonBin = resolvePythonBin();
  if (!pythonBin) {
    return Promise.reject(new Error('Python OCR virtualenv not found'));
  }

  const proc = spawn(pythonBin, [INFER_SCRIPT, '--serve'], {
    cwd: ML_OCR_DIR,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
  const pendingWaiters = [];
  let stderrBuf = '';

  proc.stderr.on('data', (chunk) => {
    stderrBuf = (stderrBuf + chunk.toString()).slice(-2000);
  });

  let readyResolve;
  let readyReject;
  let isReady = false;
  const readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  const startupTimer = setTimeout(() => {
    if (!isReady) {
      resetPythonWorker();
      readyReject(new Error(`Python OCR startup timed out. ${stderrBuf}`));
    }
  }, 45000);
  startupTimer.unref?.();

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (!isReady && parsed.ready) {
      isReady = true;
      clearTimeout(startupTimer);
      readyResolve(workerState);
      return;
    }

    const waiter = pendingWaiters.shift();
    if (waiter) waiter.resolve(parsed);
  });

  const handleExit = (code, signal) => {
    clearTimeout(startupTimer);
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    const extra = stderrBuf.trim() ? `: ${stderrBuf.trim()}` : '';
    if (!isReady) {
      readyReject(new Error(`Python OCR worker exited before ready (${reason})${extra}`));
    }
    while (pendingWaiters.length) {
      const waiter = pendingWaiters.shift();
      waiter.reject(new Error(`Python OCR worker exited unexpectedly (${reason})${extra}`));
    }
    workerState = null;
  };

  proc.on('error', (err) => handleExit(null, err.message));
  proc.on('exit', (code, signal) => handleExit(code, signal));

  workerState = { proc, rl, pendingWaiters, readyPromise };
  return readyPromise;
}

function runPythonOcr(imagePath) {
  const task = workerQueue.then(async () => {
    const state = await startPythonWorker();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = state.pendingWaiters.findIndex((w) => w.reject === reject);
        if (idx !== -1) state.pendingWaiters.splice(idx, 1);
        resetPythonWorker();
        reject(new Error('Python OCR inference timed out (60s)'));
      }, 60000);
      timer.unref?.();

      state.pendingWaiters.push({
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      state.proc.stdin.write(`${JSON.stringify({ image_path: path.resolve(imagePath) })}\n`);
    });
  });

  // Keep queue alive even if a single request fails
  workerQueue = task.catch(() => {});
  return task;
}

function shutdownOcrWorker() {
  resetPythonWorker();
}

process.on('exit', shutdownOcrWorker);

// Free-text OCR fallback via Tesseract.js (runs fully on our own server, used for
// Driver's Licenses or when Python ML weights are not installed).
async function extractIdText(buffer) {
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(buffer, { rotateAuto: true });
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

const ID_TYPE_PATTERNS = [
  [/PHILIPPINE\s*IDENTIFICATION|PHILSYS|PhilID|PAMBANSANG\s*PAGKAKAKILANLAN/i, 'PhilSys National ID'],
  [/DRIVER'?S?\s*LICENSE/i, "Driver's License"],
];

const NAME_LABELS = {
  last_name:   ['last\\s*name', 'surname', 'apelyido'],
  first_name:  ['given\\s*name', 'first\\s*name', 'pangalan'],
  middle_name: ['middle\\s*name', 'gitnang\\s*apelyido'],
};

function grabAfterLabel(lines, labelPatterns) {
  for (let i = 0; i < lines.length; i++) {
    const isLabel = labelPatterns.some((p) => new RegExp(p, 'i').test(lines[i]));
    if (!isLabel) continue;

    const sameLine = lines[i].split(/[:\-]/).slice(1).join(' ').trim();
    if (sameLine && !labelPatterns.some((p) => new RegExp(p, 'i').test(sameLine))) return sameLine;

    const next = lines[i + 1]?.trim();
    if (next && !labelPatterns.some((p) => new RegExp(p, 'i').test(next))) return next;
  }
  return null;
}

function parseBirthdate(text) {
  const match =
    text.match(/\b(\d{1,2})[\/\-. ](\d{1,2}|[A-Za-z]{3,9})[\/\-. ](\d{2,4})\b/) ||
    text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (!match) return null;

  const parsed = new Date(match[0].replace(',', ''));
  const currentYear = new Date().getFullYear();
  if (isNaN(parsed.getTime()) || parsed.getFullYear() <= 1900 || parsed.getFullYear() >= currentYear) return null;

  // Build the date string from local getters, not toISOString() — that
  // converts to UTC first, which silently shifts the date back a day on
  // any server running ahead of UTC (e.g. Philippines, UTC+8).
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIdNumber(lines) {
  const pcnJoined = lines.join('\n').match(/\b(\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4})\b/);
  if (pcnJoined) return pcnJoined[1].replace(/\s+/g, '-');

  const labeled = lines.find((l) => /(?:ID\s*No\.?|License\s*No\.?|Passport\s*No\.?|PCN|Card\s*No\.?)[:\s]/i.test(l));
  if (labeled) {
    const m = labeled.match(/([0-9A-Z][0-9A-Z\- ]{5,20}[0-9])/i);
    if (m) return m[1].replace(/\s+/g, '').trim();
  }
  const bare = lines.find((l) => /^[0-9][0-9\- ]{5,20}[0-9]$/.test(l.trim()));
  return bare ? bare.replace(/\s+/g, '').trim() : null;
}

// Heuristic parser — PH ID layouts vary widely by issuer, so this only
// covers commonly labeled fields. The result is meant to pre-fill the
// registration form; the resident always reviews and can correct it before
// submitting, and the barangay admin still verifies the photo manually.
function parseIdFields(rawText) {
  const lines  = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const joined = rawText.replace(/\r/g, '');

  const idType = ID_TYPE_PATTERNS.find(([re]) => re.test(joined))?.[1] || null;

  const result = {
    id_type:     idType,
    id_number:   parseIdNumber(lines),
    last_name:   null,
    first_name:  null,
    middle_name: null,
    birthdate:   parseBirthdate(joined),
    address_line: null,
    province:    null,
    city:        null,
    barangay:    null,
    purok:       null,
  };

  if (idType === "Driver's License") {
    // Usually Name is right below "Last Name. First Name. Middle Name"
    const nameLabelIdx = lines.findIndex((l) => /Last Name\.?\s*First Name\.?\s*Middle Name/i.test(l));
    if (nameLabelIdx !== -1 && nameLabelIdx + 1 < lines.length) {
      const nameParts = lines[nameLabelIdx + 1].split(',').map((s) => s.trim());
      if (nameParts.length >= 2) {
        result.last_name = nameParts[0];
        const firstMiddle = nameParts.slice(1).join(' ').trim().split(/\s+/);
        if (firstMiddle.length >= 2) {
          result.middle_name = firstMiddle.pop();
          result.first_name = firstMiddle.join(' ');
        } else {
          result.first_name = firstMiddle.join(' ');
        }
      } else {
        result.last_name = grabAfterLabel(lines, NAME_LABELS.last_name);
        result.first_name = grabAfterLabel(lines, NAME_LABELS.first_name);
        result.middle_name = grabAfterLabel(lines, NAME_LABELS.middle_name);
      }
    } else {
      result.last_name = grabAfterLabel(lines, NAME_LABELS.last_name);
      result.first_name = grabAfterLabel(lines, NAME_LABELS.first_name);
      result.middle_name = grabAfterLabel(lines, NAME_LABELS.middle_name);
    }
  } else {
    result.last_name = grabAfterLabel(lines, NAME_LABELS.last_name);
    result.first_name = grabAfterLabel(lines, NAME_LABELS.first_name);
    result.middle_name = grabAfterLabel(lines, NAME_LABELS.middle_name);
  }

  return result;
}

/**
 * Primary ID OCR entry point used by /api/auth/ocr-id.
 * Runs the trained Python PhilSys ML pipeline first, falling back to Tesseract.js
 * when the card is not a PhilSys National ID (e.g., Driver's License) or if Python
 * weights are unavailable.
 */
async function scanIdImage(filePath) {
  if (isPythonOcrReady()) {
    try {
      const mlRes = await runPythonOcr(filePath);
      if (mlRes && mlRes.ok) {
        if (!mlRes.is_philsys) {
          return {
            is_philsys: false,
            error: mlRes.error || 'PhilSys security identifier (PHL seal) was not detected. Please upload a clear photo of a valid Philippine National ID.',
            engine: 'philsys-ml',
            rotation_applied: mlRes.rotation_applied ?? 0,
          };
        }
        if (mlRes.extracted) {
          return {
            is_philsys: true,
            ...mlRes.extracted,
            engine: 'philsys-ml',
            rotation_applied: mlRes.rotation_applied ?? 0,
          };
        }
      }
    } catch (err) {
      console.warn('[ocr] Python ML OCR failed, falling back to Tesseract.js:', err.message);
    }
  }

  const buffer = fs.readFileSync(filePath);
  const text = await extractIdText(buffer);
  const parsed = parseIdFields(text);
  return { ...parsed, engine: 'tesseract' };
}

module.exports = {
  extractIdText,
  parseIdFields,
  scanIdImage,
  shutdownOcrWorker,
  isPythonOcrReady,
};
