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

exports.sendVerificationEmail = async (toEmail, fullName) => {
  await transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM}>`,
    to: toEmail,
    subject: 'Your ResQTrack Account Has Been Verified',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;">
        <h2 style="color:#e53e3e;">ResQTrack</h2>
        <p>Hi <strong>${fullName}</strong>,</p>
        <p>Great news — your ResQTrack account has been <strong>verified</strong> by an administrator and is now active.</p>
        <p>You can now log in and use the platform.</p>
        <br/>
        <p style="color:#718096;font-size:12px;">If you did not create an account, please ignore this email.</p>
      </div>
    `,
  });
};
