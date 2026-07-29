const { createWorker } = require('tesseract.js');

// Free-text OCR on an uploaded ID photo. Runs fully on our own server (no
// external API calls), so accuracy on real-world phone photos of Philippine
// IDs is best-effort — callers must treat the result as a pre-fill
// suggestion, never as verified data.
async function extractIdText(buffer) {
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(buffer);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

const ID_TYPE_PATTERNS = [
  [/PHILIPPINE\s*IDENTIFICATION|PHILSYS|PhilID/i, 'PhilSys National ID'],
  [/UNIFIED\s*MULTI-?\s*PURPOSE|\bUMID\b/i,        'UMID'],
  [/DRIVER'?S?\s*LICENSE/i,                        "Driver's License"],
  [/PASSPORT/i,                                    'Passport'],
  [/VOTER'?S?\s*(ID|CERTIFICATION)|COMELEC/i,      "Voter's ID"],
  [/PERSON\s*WITH\s*DISABILITY|\bPWD\b/i,          'PWD ID'],
  [/SENIOR\s*CITIZEN/i,                            'Senior Citizen ID'],
  [/POSTAL\s*ID/i,                                 'Postal ID'],
  [/TAX\s*IDENTIFICATION|\bTIN\b/i,                'TIN ID'],
  [/\bSSS\b/i,                                     'SSS ID'],
  [/PHILHEALTH/i,                                  'PhilHealth ID'],
];

const NAME_LABELS = {
  last_name:   ['last\\s*name', 'surname', 'apelyido'],
  first_name:  ['given\\s*name', 'first\\s*name', 'pangalan'],
  middle_name: ['middle\\s*name', 'gitnang\\s*apelyido'],
};

function grabAfterLabel(lines, labelPatterns) {
  for (let i = 0; i < lines.length; i++) {
    const isLabel = labelPatterns.some(p => new RegExp(p, 'i').test(lines[i]));
    if (!isLabel) continue;

    const sameLine = lines[i].split(/[:\-]/).slice(1).join(' ').trim();
    if (sameLine && !labelPatterns.some(p => new RegExp(p, 'i').test(sameLine))) return sameLine;

    const next = lines[i + 1]?.trim();
    if (next && !labelPatterns.some(p => new RegExp(p, 'i').test(next))) return next;
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
  const labeled = lines.find(l => /(?:ID\s*No\.?|License\s*No\.?|Passport\s*No\.?|PCN|Card\s*No\.?)[:\s]/i.test(l));
  if (labeled) {
    const m = labeled.match(/([0-9][0-9\- ]{5,20}[0-9])/);
    if (m) return m[1].replace(/\s+/g, '').trim();
  }
  const bare = lines.find(l => /^[0-9][0-9\- ]{5,20}[0-9]$/.test(l.trim()));
  return bare ? bare.replace(/\s+/g, '').trim() : null;
}

// Heuristic parser — PH ID layouts vary widely by issuer, so this only
// covers commonly labeled fields. The result is meant to pre-fill the
// registration form; the resident always reviews and can correct it before
// submitting, and the barangay admin still verifies the photo manually.
function parseIdFields(rawText) {
  const lines  = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const joined = rawText.replace(/\r/g, '');

  const idType = ID_TYPE_PATTERNS.find(([re]) => re.test(joined))?.[1] || null;

  return {
    id_type:     idType,
    id_number:   parseIdNumber(lines),
    last_name:   grabAfterLabel(lines, NAME_LABELS.last_name),
    first_name:  grabAfterLabel(lines, NAME_LABELS.first_name),
    middle_name: grabAfterLabel(lines, NAME_LABELS.middle_name),
    birthdate:   parseBirthdate(joined),
  };
}

module.exports = { extractIdText, parseIdFields };
