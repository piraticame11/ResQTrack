// Outbound SMS via PhilSMS (https://philsms.com). Safe no-op if
// PHILSMS_API_TOKEN isn't set — callers never need to check whether SMS is
// configured before calling sendSMS().
//
// Docs: https://app.philsms.com/developers/documentation

// Resident phone numbers are stored as 09XXXXXXXXX (see the registration
// validator in auth.controller.js); PhilSMS expects 63XXXXXXXXXX.
function toPhilSmsRecipient(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('63')) return digits;
  if (digits.startsWith('0'))  return `63${digits.slice(1)}`;
  return `63${digits}`;
}

async function sendSMS(to, message) {
  const token = process.env.PHILSMS_API_TOKEN;
  if (!token) {
    console.log(`[SMS] Not configured — would have sent to ${to}: "${message}"`);
    return { sent: false, reason: 'not_configured' };
  }

  const baseUrl   = (process.env.PHILSMS_BASE_URL || 'https://app.philsms.com/api/v3').replace(/\/+$/, '');
  const senderId  = process.env.PHILSMS_SENDER_ID || 'PhilSMS';
  const recipient = toPhilSmsRecipient(to);

  try {
    const res = await fetch(`${baseUrl}/sms/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        recipient,
        sender_id: senderId,
        type: 'plain',
        message,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.status === 'error') {
      console.error(`[SMS] PhilSMS error sending to ${to}:`, data?.message || res.status);
      return { sent: false, reason: 'provider_error', detail: data?.message };
    }

    console.log(`[SMS] Sent to ${to}`);
    return { sent: true, data: data?.data };
  } catch (err) {
    console.error('[SMS] Send failed:', err.message);
    return { sent: false, reason: 'network_error' };
  }
}

module.exports = { sendSMS };
