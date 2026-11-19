const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const TEMPLATES = {
  'manay': {
    templateFile: 'Barangay_Manay_Blotter_Form.pdf',
    coords: {
      header: {
        entryNo:   { x: 881, y: 225, w: 101, size: 14, bold: true },
        dateFiled: { x: 881, y: 247, w: 101, size: 14 },
        timeFiled: { x: 846, y: 267, w: 136, size: 14 },
      },
      complainant: {
        name:       { x: 131, y: 347, w: 446, size: 18, bold: true },
        age:        { x: 645, y: 347, w: 68,  size: 18 },
        sexMale:    { x: 795, y: 330 },
        sexFemale:  { x: 884, y: 330 },
        address:    { x: 125, y: 382, w: 452, size: 17 },
        contact:    { x: 701, y: 379, w: 276, size: 17 },
        occupation: { x: 140, y: 419, w: 289, size: 17 },
        civilSingle:    { x: 575, y: 402 },
        civilMarried:   { x: 666, y: 402 },
        civilWidowed:   { x: 769, y: 402 },
        civilSeparated: { x: 883, y: 402 },
      },
      respondent: {
        name:       { x: 132, y: 516, w: 445, size: 18, bold: true },
        age:        { x: 645, y: 516, w: 69,  size: 18 },
        sexMale:    { x: 795, y: 498 },
        sexFemale:  { x: 883, y: 498 },
        address:    { x: 126, y: 550, w: 451, size: 17 },
        contact:    { x: 701, y: 550, w: 277, size: 17 },
        occupation: { x: 140, y: 585, w: 289, size: 17 },
        civilSingle:    { x: 575, y: 571 },
        civilMarried:   { x: 666, y: 570 },
        civilWidowed:   { x: 769, y: 570 },
        civilSeparated: { x: 883, y: 570 },
      },
      incident: {
        date:        { x: 185, y: 685, w: 316, size: 18 },
        time:        { x: 186, y: 723, w: 315, size: 18 },
        placeLine1:  { x: 187, y: 762, w: 314, size: 17 },
        placeLine2:  { x: 55,  y: 797, w: 446, size: 17 },
        types: {
          theft:           { x: 554, y: 680 },
          physicalInjury:  { x: 554, y: 706 },
          vandalism:       { x: 554, y: 732 },
          domesticConcern: { x: 554, y: 758 },
          noise:           { x: 554, y: 783 },
          public:          { x: 554, y: 809 },
          traffic:         { x: 554, y: 836 },
          propertyDamage:  { x: 785, y: 680 },
          threat:          { x: 785, y: 706 },
          drugs:           { x: 785, y: 732 },
          familyDispute:   { x: 785, y: 758 },
          civilDispute:    { x: 785, y: 784 },
          others:          { x: 785, y: 810 },
        },
        othersText: { x: 879, y: 828, w: 100, size: 15 },
      },
      narrative: {
        lines: [
          { x: 55, y: 965,  w: 923 },
          { x: 55, y: 996,  w: 923 },
          { x: 55, y: 1027, w: 923 },
        ],
        size: 16,
      },
      remarks: {
        lines: [
          { x: 55, y: 1152, w: 923 },
          { x: 55, y: 1182, w: 923 },
          { x: 55, y: 1210, w: 923 },
        ],
        size: 16,
      },
      attachments: {
        photos:     { x: 54,  y: 1292 },
        videos:     { x: 188, y: 1292 },
        documents:  { x: 313, y: 1292 },
        others:     { x: 464, y: 1292 },
        othersText: { x: 560, y: 1311, w: 290, size: 16 },
      },
      signatures: {
        complainant: { centerX: 268, y: 1405, size: 17 },
        officer:     { centerX: 764, y: 1405, size: 17 },
      },
    },
  },
  'new-visayas': {
    templateFile: 'Barangay_New_Visayas_Blotter_Form.pdf',
    coords: {
      header: {
        entryNo:   { x: 879, y: 254, w: 106, size: 14, bold: true },
        dateFiled: { x: 877, y: 278, w: 108, size: 14 },
        timeFiled: { x: 843, y: 298, w: 142, size: 14 },
      },
      complainant: {
        name:       { x: 133, y: 378, w: 444, size: 18, bold: true },
        age:        { x: 645, y: 376, w: 66,  size: 18 },
        sexMale:    { x: 795, y: 359 },
        sexFemale:  { x: 885, y: 359 },
        address:    { x: 115, y: 412, w: 462, size: 17 },
        contact:    { x: 703, y: 406, w: 274, size: 17 },
        occupation: { x: 138, y: 448, w: 289, size: 17 },
        civilSingle:    { x: 578, y: 433 },
        civilMarried:   { x: 667, y: 432 },
        civilWidowed:   { x: 769, y: 433 },
        civilSeparated: { x: 882, y: 433 },
      },
      respondent: {
        name:       { x: 133, y: 547, w: 443, size: 18, bold: true },
        age:        { x: 645, y: 545, w: 66,  size: 18 },
        sexMale:    { x: 795, y: 528 },
        sexFemale:  { x: 885, y: 528 },
        address:    { x: 115, y: 583, w: 462, size: 17 },
        contact:    { x: 703, y: 579, w: 274, size: 17 },
        occupation: { x: 138, y: 619, w: 289, size: 17 },
        civilSingle:    { x: 578, y: 603 },
        civilMarried:   { x: 666, y: 603 },
        civilWidowed:   { x: 769, y: 603 },
        civilSeparated: { x: 882, y: 603 },
      },
      incident: {
        date:        { x: 183, y: 720, w: 318, size: 18 },
        time:        { x: 183, y: 757, w: 318, size: 18 },
        placeLine1:  { x: 187, y: 794, w: 314, size: 17 },
        placeLine2:  { x: 53,  y: 830, w: 447, size: 17 },
        types: {
          theft:           { x: 555, y: 717 },
          physicalInjury:  { x: 555, y: 742 },
          vandalism:       { x: 555, y: 768 },
          domesticConcern: { x: 555, y: 794 },
          noise:           { x: 555, y: 819 },
          public:          { x: 555, y: 845 },
          traffic:         { x: 555, y: 871 },
          propertyDamage:  { x: 783, y: 716 },
          threat:          { x: 783, y: 742 },
          drugs:           { x: 783, y: 768 },
          familyDispute:   { x: 784, y: 794 },
          civilDispute:    { x: 784, y: 820 },
          others:          { x: 784, y: 845 },
        },
        othersText: { x: 877, y: 861, w: 101, size: 15 },
      },
      narrative: {
        lines: [
          { x: 52, y: 998,  w: 924 },
          { x: 52, y: 1026, w: 924 },
          { x: 52, y: 1058, w: 924 },
        ],
        size: 16,
      },
      remarks: {
        lines: [
          { x: 52, y: 1185, w: 924 },
          { x: 52, y: 1215, w: 924 },
          { x: 52, y: 1247, w: 924 },
        ],
        size: 16,
      },
      attachments: {
        photos:     { x: 53,  y: 1332 },
        videos:     { x: 188, y: 1332 },
        documents:  { x: 316, y: 1332 },
        others:     { x: 467, y: 1332 },
        othersText: { x: 556, y: 1350, w: 294, size: 16 },
      },
      signatures: {
        complainant: { centerX: 266, y: 1440, size: 17 },
        officer:     { centerX: 763, y: 1440, size: 17 },
      },
    },
  },
};

function wrapText(text, maxPixelWidth, font, fontSize) {
  if (!text) return [];
  const words = String(text).replace(/\r\n/g, ' ').replace(/\n/g, ' ').split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth <= maxPixelWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function fitLines(text, maxPixelWidth, font, initialSize = 16, minSize = 10, maxLines = 3) {
  if (!text) return { lines: [], size: initialSize };
  let size = initialSize;
  while (size >= minSize) {
    const lines = wrapText(text, maxPixelWidth, font, size);
    if (lines.length <= maxLines) {
      return { lines, size };
    }
    size -= 0.5;
  }
  const lines = wrapText(text, maxPixelWidth, font, minSize);
  const result = lines.slice(0, maxLines);
  if (lines.length > maxLines && result.length > 0) {
    let last = result[result.length - 1];
    while (last.length > 3 && font.widthOfTextAtSize(last + '...', minSize) > maxPixelWidth) {
      last = last.slice(0, -1);
    }
    result[result.length - 1] = last.trim() + '...';
  }
  return { lines: result, size: minSize };
}

function formatDate(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(timeVal, filedAt = null) {
  if (timeVal && typeof timeVal === 'string' && timeVal.trim()) {
    const m = timeVal.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) {
      let h = parseInt(m[1], 10);
      const min = m[2];
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${String(h).padStart(2, '0')}:${min} ${ampm}`;
    }
    return timeVal.trim();
  }
  if (filedAt) {
    const d = new Date(filedAt);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
  }
  return '';
}

/**
 * Generate official filled Barangay Blotter PDF
 * @param {Object} entry - Blotter record from database
 * @param {string} [tenantVersion] - 'manay' or 'new-visayas'
 * @returns {Promise<Buffer>}
 */
async function generateBlotterPdf(entry, tenantVersion = null) {
  const version = tenantVersion || entry.version || 'manay';
  const cfg = TEMPLATES[version] || TEMPLATES['manay'];

  const templatePath = path.join(__dirname, '../templates', cfg.templateFile);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Blotter template file not found: ${templatePath}`);
  }

  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.getPages()[0];
  const { height } = page.getSize(); // 1536 pt

  const textColor = rgb(0.05, 0.1, 0.25);
  const sigColor  = rgb(0, 0, 0);

  // Helper to draw text sitting on a baseline
  function drawTextOnLine(text, x, lineY, maxW, fontSize = 17, bold = false) {
    if (!text && text !== 0) return;
    const str = String(text).trim();
    if (!str) return;

    const font = bold ? fontBold : fontRegular;
    let actualSize = fontSize;
    while (actualSize > 9 && font.widthOfTextAtSize(str, actualSize) > maxW) {
      actualSize -= 0.5;
    }

    const yPdf = height - (lineY - 4);
    const xPdf = x + 3;
    page.drawText(str, {
      x: xPdf,
      y: yPdf,
      size: actualSize,
      font,
      color: textColor,
    });
  }

  // Helper to draw checkmark inside box
  function drawCheck(boxCoords, w = 19, h = 19) {
    if (!boxCoords) return;
    const cx = boxCoords.x + w / 2;
    const cy = height - (boxCoords.y + h / 2);
    page.drawLine({
      start: { x: cx - 5.0, y: cy + 0.5 },
      end:   { x: cx - 1.0, y: cy - 4.5 },
      thickness: 2.8,
      color: textColor,
    });
    page.drawLine({
      start: { x: cx - 1.0, y: cy - 4.5 },
      end:   { x: cx + 7.0, y: cy + 6.0 },
      thickness: 2.8,
      color: textColor,
    });
  }

  const c = cfg.coords;

  // 1. Top Header Box
  const filedDateStr = formatDate(entry.filed_at);
  const filedTimeStr = formatTime(null, entry.filed_at);
  drawTextOnLine(entry.entry_no, c.header.entryNo.x, c.header.entryNo.y, c.header.entryNo.w, c.header.entryNo.size, true);
  drawTextOnLine(filedDateStr,   c.header.dateFiled.x, c.header.dateFiled.y, c.header.dateFiled.w, c.header.dateFiled.size);
  drawTextOnLine(filedTimeStr,   c.header.timeFiled.x, c.header.timeFiled.y, c.header.timeFiled.w, c.header.timeFiled.size);

  // 2. Complainant Information
  drawTextOnLine(entry.complainant_name,       c.complainant.name.x,       c.complainant.name.y,       c.complainant.name.w,       c.complainant.name.size, true);
  drawTextOnLine(entry.complainant_age,        c.complainant.age.x,        c.complainant.age.y,        c.complainant.age.w,        c.complainant.age.size);
  drawTextOnLine(entry.complainant_address,    c.complainant.address.x,    c.complainant.address.y,    c.complainant.address.w,    c.complainant.address.size);
  drawTextOnLine(entry.complainant_contact,    c.complainant.contact.x,    c.complainant.contact.y,    c.complainant.contact.w,    c.complainant.contact.size);
  drawTextOnLine(entry.complainant_occupation, c.complainant.occupation.x, c.complainant.occupation.y, c.complainant.occupation.w, c.complainant.occupation.size);

  const compSex = (entry.complainant_sex || '').toLowerCase();
  if (compSex.startsWith('m')) drawCheck(c.complainant.sexMale);
  else if (compSex.startsWith('f')) drawCheck(c.complainant.sexFemale);

  const compCivil = (entry.complainant_civil_status || '').toLowerCase();
  if (compCivil.includes('sing'))      drawCheck(c.complainant.civilSingle);
  else if (compCivil.includes('marr')) drawCheck(c.complainant.civilMarried);
  else if (compCivil.includes('wid'))  drawCheck(c.complainant.civilWidowed);
  else if (compCivil.includes('sep') || compCivil.includes('div')) drawCheck(c.complainant.civilSeparated);

  // 3. Respondent Information
  drawTextOnLine(entry.respondent_name,       c.respondent.name.x,       c.respondent.name.y,       c.respondent.name.w,       c.respondent.name.size, true);
  drawTextOnLine(entry.respondent_age,        c.respondent.age.x,        c.respondent.age.y,        c.respondent.age.w,        c.respondent.age.size);
  drawTextOnLine(entry.respondent_address,    c.respondent.address.x,    c.respondent.address.y,    c.respondent.address.w,    c.respondent.address.size);
  drawTextOnLine(entry.respondent_contact,    c.respondent.contact.x,    c.respondent.contact.y,    c.respondent.contact.w,    c.respondent.contact.size);
  drawTextOnLine(entry.respondent_occupation, c.respondent.occupation.x, c.respondent.occupation.y, c.respondent.occupation.w, c.respondent.occupation.size);

  const respSex = (entry.respondent_sex || '').toLowerCase();
  if (respSex.startsWith('m')) drawCheck(c.respondent.sexMale);
  else if (respSex.startsWith('f')) drawCheck(c.respondent.sexFemale);

  const respCivil = (entry.respondent_civil_status || '').toLowerCase();
  if (respCivil.includes('sing'))      drawCheck(c.respondent.civilSingle);
  else if (respCivil.includes('marr')) drawCheck(c.respondent.civilMarried);
  else if (respCivil.includes('wid'))  drawCheck(c.respondent.civilWidowed);
  else if (respCivil.includes('sep') || respCivil.includes('div')) drawCheck(c.respondent.civilSeparated);

  // 4. Incident Details
  const incDateStr = entry.incident_date ? formatDate(entry.incident_date) : filedDateStr;
  const incTimeStr = formatTime(entry.incident_time, entry.filed_at);
  drawTextOnLine(incDateStr, c.incident.date.x, c.incident.date.y, c.incident.date.w, c.incident.date.size);
  drawTextOnLine(incTimeStr, c.incident.time.x, c.incident.time.y, c.incident.time.w, c.incident.time.size);

  // Place of Incident (wrap to line 2 if long)
  const placeText = entry.incident_place || '';
  if (placeText) {
    const placeLines = wrapText(placeText, c.incident.placeLine1.w, fontRegular, c.incident.placeLine1.size);
    if (placeLines.length > 0) {
      drawTextOnLine(placeLines[0], c.incident.placeLine1.x, c.incident.placeLine1.y, c.incident.placeLine1.w, c.incident.placeLine1.size);
    }
    if (placeLines.length > 1) {
      const rest = placeLines.slice(1).join(' ');
      drawTextOnLine(rest, c.incident.placeLine2.x, c.incident.placeLine2.y, c.incident.placeLine2.w, c.incident.placeLine2.size);
    }
  }

  // Incident Type Checkboxes
  const incType = (entry.incident_type || entry.nature || '').toLowerCase();
  let matchedType = false;

  if (incType.includes('theft')) {
    drawCheck(c.incident.types.theft);
    matchedType = true;
  }
  if (incType.includes('physical') || incType.includes('injury')) {
    drawCheck(c.incident.types.physicalInjury);
    matchedType = true;
  }
  if (incType.includes('vandalism')) {
    drawCheck(c.incident.types.vandalism);
    matchedType = true;
  }
  if (incType.includes('domestic')) {
    drawCheck(c.incident.types.domesticConcern);
    matchedType = true;
  }
  if (incType.includes('noise')) {
    drawCheck(c.incident.types.noise);
    matchedType = true;
  }
  if (incType.includes('public') && incType.includes('disturb')) {
    drawCheck(c.incident.types.public);
    matchedType = true;
  }
  if (incType.includes('traffic') || incType.includes('vehic') || incType.includes('accident') || incType.includes('collision')) {
    drawCheck(c.incident.types.traffic);
    matchedType = true;
  }
  if (incType.includes('property') || incType.includes('damage')) {
    drawCheck(c.incident.types.propertyDamage);
    matchedType = true;
  }
  if (incType.includes('threat') || incType.includes('harass')) {
    drawCheck(c.incident.types.threat);
    matchedType = true;
  }
  if (incType.includes('illegal') || incType.includes('substance') || incType.includes('drug')) {
    drawCheck(c.incident.types.drugs);
    matchedType = true;
  }
  if (incType.includes('family')) {
    drawCheck(c.incident.types.familyDispute);
    matchedType = true;
  }
  if (incType.includes('civil')) {
    drawCheck(c.incident.types.civilDispute);
    matchedType = true;
  }
  if (!matchedType || incType.includes('other')) {
    drawCheck(c.incident.types.others);
    const spec = (entry.incident_type || entry.nature || '').replace(/others?/i, '').replace(/[:;-]/g, '').trim();
    if (spec) {
      drawTextOnLine(spec, c.incident.othersText.x, c.incident.othersText.y, c.incident.othersText.w, c.incident.othersText.size);
    }
  }

  // 5. Incident Narrative (Section 4)
  const narrText = entry.narrative || '';
  if (narrText) {
    const fitted = fitLines(narrText, c.narrative.lines[0].w, fontRegular, c.narrative.size, 10, 3);
    fitted.lines.forEach((lineStr, idx) => {
      if (idx < c.narrative.lines.length) {
        const lineCfg = c.narrative.lines[idx];
        drawTextOnLine(lineStr, lineCfg.x, lineCfg.y, lineCfg.w, fitted.size);
      }
    });
  }

  // 6. Action Taken / Remarks (Section 5)
  const remarksText = entry.action_taken || entry.remarks || '';
  if (remarksText) {
    const fitted = fitLines(remarksText, c.remarks.lines[0].w, fontRegular, c.remarks.size, 10, 3);
    fitted.lines.forEach((lineStr, idx) => {
      if (idx < c.remarks.lines.length) {
        const lineCfg = c.remarks.lines[idx];
        drawTextOnLine(lineStr, lineCfg.x, lineCfg.y, lineCfg.w, fitted.size);
      }
    });
  }

  // 7. Attachments (Section 6)
  const attText = (entry.attachments || '').toLowerCase();
  let matchedAtt = false;
  if (attText.includes('photo') || attText.includes('picture') || attText.includes('image') || attText.includes('jpg') || attText.includes('png')) {
    drawCheck(c.attachments.photos);
    matchedAtt = true;
  }
  if (attText.includes('video') || attText.includes('mp4') || attText.includes('cctv')) {
    drawCheck(c.attachments.videos);
    matchedAtt = true;
  }
  if (attText.includes('doc') || attText.includes('pdf') || attText.includes('letter') || attText.includes('affidavit') || attText.includes('statement')) {
    drawCheck(c.attachments.documents);
    matchedAtt = true;
  }
  if (attText.trim() && (!matchedAtt || attText.includes('other'))) {
    drawCheck(c.attachments.others);
    const otherAtt = entry.attachments.replace(/photos?|videos?|documents?|pictures?|images?/gi, '').replace(/[,;/]/g, ' ').trim();
    if (otherAtt) {
      drawTextOnLine(otherAtt, c.attachments.othersText.x, c.attachments.othersText.y, c.attachments.othersText.w, c.attachments.othersText.size);
    }
  }

  // 8. Signatures
  const compSign = (entry.complainant_name || '').toUpperCase().trim();
  if (compSign) {
    const w = fontBold.widthOfTextAtSize(compSign, c.signatures.complainant.size);
    const x = c.signatures.complainant.centerX - w / 2;
    const yPdf = height - (c.signatures.complainant.y - 4);
    page.drawText(compSign, {
      x,
      y: yPdf,
      size: c.signatures.complainant.size,
      font: fontBold,
      color: sigColor,
    });
  }

  const officerSign = (entry.filed_by_name || entry.noted_by || 'BARANGAY DESK OFFICER').toUpperCase().trim();
  if (officerSign) {
    const w = fontBold.widthOfTextAtSize(officerSign, c.signatures.officer.size);
    const x = c.signatures.officer.centerX - w / 2;
    const yPdf = height - (c.signatures.officer.y - 4);
    page.drawText(officerSign, {
      x,
      y: yPdf,
      size: c.signatures.officer.size,
      font: fontBold,
      color: sigColor,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = {
  generateBlotterPdf,
};
