const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: process.env.MAIL_SECURE === 'true',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

exports.sendVerificationEmail = async (toEmail, fullName) => {
  await transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM}>`,
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
  await transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM}>`,
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
