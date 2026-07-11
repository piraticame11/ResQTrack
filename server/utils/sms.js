// Pluggable outbound SMS notifier. Ships as a safe no-op until a real
// gateway is configured — this app has no SMS provider account, so this
// wires up the integration point without pretending to send real texts.
//
// To activate: sign up with a PH SMS gateway (e.g. Semaphore, Movider) and
// set SMS_API_KEY + SMS_SENDER_ID in .env. This function's shape (to, message)
// -> {sent, reason} is provider-agnostic; swap the fetch() call below for
// your provider's API.

async function sendSMS(to, message) {
  const apiKey = process.env.SMS_API_KEY;
  if (!apiKey) {
    console.log(`[SMS] Not configured — would have sent to ${to}: "${message}"`);
    return { sent: false, reason: 'not_configured' };
  }

  try {
    // Example shape for Semaphore-style gateways — adjust to your provider.
    const res = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: apiKey,
        number: to,
        message,
        sendername: process.env.SMS_SENDER_ID || 'ResQTrack',
      }),
    });
    if (!res.ok) {
      console.error(`[SMS] Provider error ${res.status} sending to ${to}`);
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true };
  } catch (err) {
    console.error('[SMS] Send failed:', err.message);
    return { sent: false, reason: 'network_error' };
  }
}

module.exports = { sendSMS };
