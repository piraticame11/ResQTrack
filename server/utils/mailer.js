const https = require('https');
const nodemailer = require('nodemailer');

const mailPort = Number(process.env.MAIL_PORT) || 587;
const mailSecure = process.env.MAIL_SECURE === 'true' || mailPort === 465;

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp-relay.brevo.com',
  port: mailPort,
  secure: mailSecure,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

function getSender() {
  const name = process.env.MAIL_FROM_NAME || 'ResQTrack';
  const rawFrom = process.env.MAIL_FROM || process.env.MAIL_USER || 'system@resqtrack.online';
  const match = rawFrom.match(/<([^>]+)>/);
  const email = (match ? match[1] : rawFrom).trim();
  return { name, email };
}

function sendBrevoApiEmail({ to, subject, html, sender, apiKey }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      sender: { name: sender.name, email: sender.email },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    });

    const req = https.request('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body || '{}'));
          } catch {
            resolve({ raw: body });
          }
        } else {
          reject(new Error(`Brevo HTTP API error [${res.statusCode}]: ${body}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Brevo API request timed out (10s)'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function sendMail({ to, subject, html }) {
  const sender = getSender();
  const apiKey = (process.env.BREVO_API_KEY || process.env.MAIL_API_KEY || '').trim();

  if (apiKey) {
    return sendBrevoApiEmail({ to, subject, html, sender, apiKey });
  }

  return transporter.sendMail({
    from: `"${sender.name}" <${sender.email}>`,
    to,
    subject,
    html,
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

exports.sendMail = sendMail;

exports.sendVerificationEmail = async (toEmail, fullName) => {
  return sendMail({
    to: toEmail,
    subject: 'Your ResQTrack Account Has Been Verified',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;">
        <h2 style="color:#e53e3e;">ResQTrack</h2>
        <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
        <p>Great news — your ResQTrack account has been <strong>verified</strong> by an administrator and is now active.</p>
        <p>You can now log in and use the platform.</p>
        <br/>
        <p style="color:#718096;font-size:12px;">If you did not create an account, please ignore this email.</p>
      </div>
    `,
  });
};

exports.sendRejectionEmail = async (toEmail, fullName, reason) => {
  return sendMail({
    to: toEmail,
    subject: 'Your ResQTrack Registration Was Not Approved',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;">
        <h2 style="color:#e53e3e;">ResQTrack</h2>
        <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
        <p>Your ResQTrack registration was <strong>not approved</strong> by the barangay administrator.</p>
        ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
        <p>Please visit the barangay hall for assistance if you believe this was a mistake.</p>
        <br/>
        <p style="color:#718096;font-size:12px;">If you did not create an account, please ignore this email.</p>
      </div>
    `,
  });
};

exports.sendAccountCreatedEmail = async (toEmail, fullName, role, password) => {
  const roleLabel = {
    admin: 'Administrator',
    responder: 'Field Responder',
    resident: 'Resident',
  }[role] || role;

  return sendMail({
    to: toEmail,
    subject: 'Welcome to ResQTrack — Your Account Details',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="color:#e53e3e;margin-top:0;">ResQTrack</h2>
        <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
        <p>An administrator has created a <strong>${escapeHtml(roleLabel)}</strong> account for you on ResQTrack.</p>
        
        <div style="background:#f7fafc;border-radius:8px;padding:16px;margin:20px 0;border:1px solid #edf2f7;">
          <p style="margin:4px 0;"><strong>Role:</strong> ${escapeHtml(roleLabel)}</p>
          <p style="margin:4px 0;"><strong>Email / Username:</strong> ${escapeHtml(toEmail)}</p>
          <p style="margin:4px 0;"><strong>Temporary Password:</strong> <code style="background:#edf2f7;padding:2px 6px;border-radius:4px;font-size:14px;">${escapeHtml(password)}</code></p>
        </div>

        <p>You can now sign in at the ResQTrack login portal. We recommend changing your password after your first login via your Profile page.</p>
        <br/>
        <p style="color:#718096;font-size:12px;margin-bottom:0;">ResQTrack · Barangay Emergency Response System</p>
      </div>
    `,
  });
};

exports.sendBlotterStatusEmail = async (toEmail, complainantName, entryNo, nature, status, note) => {
  return sendMail({
    to: toEmail,
    subject: `Blotter Entry Update: ${entryNo} - ${status}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="color:#2b6cb0;margin-top:0;">Barangay Manay — Digital Blotter</h2>
        <p>Dear <strong>${escapeHtml(complainantName)}</strong>,</p>
        <p>This is an official update regarding your filed blotter entry with Barangay Manay.</p>
        
        <div style="background:#f7fafc;border-radius:8px;padding:16px;margin:20px 0;border:1px solid #edf2f7;">
          <p style="margin:4px 0;"><strong>Blotter Entry #:</strong> <span style="font-family:monospace;font-weight:bold;color:#2b6cb0;">${escapeHtml(entryNo)}</span></p>
          <p style="margin:4px 0;"><strong>Nature of Complaint:</strong> ${escapeHtml(nature)}</p>
          <p style="margin:4px 0;"><strong>Current Status:</strong> <span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#ebf8ff;color:#2b6cb0;font-weight:600;font-size:12px;">${escapeHtml(status)}</span></p>
          ${note ? `<p style="margin:10px 0 4px 0;"><strong>Remarks / Action Taken:</strong><br/><span style="color:#4a5568;">${escapeHtml(note)}</span></p>` : ''}
        </div>

        <p>For inquiries or further assistance, please visit the Barangay Hall during office hours or reply to this notice.</p>
        <br/>
        <p style="color:#718096;font-size:12px;margin-bottom:0;">ResQTrack · Office of Barangay Manay, Panabo City</p>
      </div>
    `,
  });
};
