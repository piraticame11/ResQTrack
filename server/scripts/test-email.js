#!/usr/bin/env node

/**
 * ResQTrack Email Test Utility
 *
 * Usage:
 *   node server/scripts/test-email.js [recipient-email]
 *   npm run test:email -- [recipient-email]
 *
 * Example:
 *   node server/scripts/test-email.js resident@example.com
 */

const path = require('path');
const dotenv = require('dotenv');

// Load .env from project root or server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { sendMail } = require('../utils/mailer');

async function run() {
  const recipient = process.argv[2] || process.env.TEST_EMAIL || process.env.MAIL_USER;

  console.log('\n=============================================');
  console.log('       ResQTrack Email Test Utility');
  console.log('=============================================\n');

  if (!recipient) {
    console.error('❌ Error: No recipient email specified.');
    console.log('\nUsage:');
    console.log('  node server/scripts/test-email.js <recipient@example.com>');
    console.log('  npm run test:email -- <recipient@example.com>\n');
    process.exit(1);
  }

  const isBrevoApi = Boolean(process.env.BREVO_API_KEY || process.env.MAIL_API_KEY);
  const senderName = process.env.MAIL_FROM_NAME || 'ResQTrack';
  const senderEmail = (process.env.MAIL_FROM || process.env.MAIL_USER || 'system@resqtrack.online')
    .replace(/.*<([^>]+)>/, '$1')
    .trim();

  console.log('Configuration Details:');
  console.log('----------------------');
  if (isBrevoApi) {
    const key = (process.env.BREVO_API_KEY || process.env.MAIL_API_KEY).trim();
    const maskedKey = key.slice(0, 8) + '...' + key.slice(-4);
    console.log(`• Mode:        Brevo HTTPS REST API (port 443)`);
    console.log(`• API Key:     ${maskedKey}`);
  } else {
    console.log(`• Mode:        Nodemailer SMTP Relay`);
    console.log(`• Host:        ${process.env.MAIL_HOST || 'smtp-relay.brevo.com'}`);
    console.log(`• Port:        ${process.env.MAIL_PORT || 587}`);
    console.log(`• Secure:      ${process.env.MAIL_SECURE || 'false'}`);
    console.log(`• User:        ${process.env.MAIL_USER || '(not set)'}`);
  }
  console.log(`• From:        "${senderName}" <${senderEmail}>`);
  console.log(`• To:          ${recipient}`);
  console.log('----------------------\n');

  console.log(`Sending test email to: ${recipient}...`);

  const startTime = Date.now();
  try {
    const result = await sendMail({
      to: recipient,
      subject: `ResQTrack Test Email — ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #e53e3e; margin-top: 0;">ResQTrack · Email Service Verified</h2>
          <p style="font-size: 15px; color: #2d3748;">Hello,</p>
          <p style="font-size: 14px; color: #4a5568; line-height: 1.6;">
            This is an automated test message sent from <strong>ResQTrack</strong> to confirm that your emailing service is configured properly.
          </p>

          <div style="background: #f7fafc; border: 1px solid #edf2f7; border-radius: 8px; padding: 14px; margin: 20px 0; font-size: 13px; color: #4a5568;">
            <p style="margin: 4px 0;"><strong>Sender:</strong> ${senderName} &lt;${senderEmail}&gt;</p>
            <p style="margin: 4px 0;"><strong>Recipient:</strong> ${recipient}</p>
            <p style="margin: 4px 0;"><strong>Transport:</strong> ${isBrevoApi ? 'Brevo HTTPS REST API' : 'SMTP Relay'}</p>
            <p style="margin: 4px 0;"><strong>Sent At:</strong> ${new Date().toISOString()}</p>
          </div>

          <p style="font-size: 13px; color: #718096; margin-bottom: 0;">
            If you received this message, verification emails, rejection notices, and blotter notifications are ready to deliver successfully.
          </p>
        </div>
      `,
    });

    const elapsed = Date.now() - startTime;
    console.log(`\n✅ Email sent successfully in ${elapsed}ms!`);
    console.log('Response details:', JSON.stringify(result, null, 2));
    console.log('\nPlease check the inbox (or spam folder) of:', recipient);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`\n❌ Failed to send email after ${elapsed}ms:`, err.message);
    if (err.response) {
      console.error('Response data:', err.response);
    }
    console.log('\nTroubleshooting Tips:');
    if (isBrevoApi) {
      console.log('• Ensure your BREVO_API_KEY is valid (starts with xkeysib-...).');
      console.log('• Ensure sender email "' + senderEmail + '" is verified in your Brevo account (Senders & IP).');
    } else {
      console.log('• Verify MAIL_HOST, MAIL_PORT, MAIL_USER, and MAIL_PASS in .env.');
      console.log('• For Brevo SMTP, the password is your SMTP key (starts with xsmtpsib-...).');
      console.log('• Ensure outbound SMTP ports (587 or 465) are not blocked by your hosting provider or network.');
      console.log('• Switch to BREVO_API_KEY in .env to send via HTTPS (port 443) which is never blocked.');
    }
    process.exit(1);
  }
}

run();
