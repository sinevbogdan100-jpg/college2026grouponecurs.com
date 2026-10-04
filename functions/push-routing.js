const crypto = require('node:crypto');

function subscriptionId(endpoint) { return crypto.createHash('sha256').update(endpoint).digest('hex'); }

function validSubscription(subscription) {
  try {
    const endpoint = new URL(subscription?.endpoint);
    const host = endpoint.hostname;
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com'
      || host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com'
      || host.endsWith('.notify.windows.com');
    return endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.port && allowed
      && subscription.endpoint.length < 4096
      && /^[A-Za-z0-9_-]{80,100}$/.test(subscription.keys?.p256dh || '')
      && /^[A-Za-z0-9_-]{20,30}$/.test(subscription.keys?.auth || '');
  } catch (_) { return false; }
}

function canReceiveStaff(email, permissions) {
  if (email === 'owner.toe2691@example.com') return true;
  const login = email === 'admin1.toe2691@example.com' ? 'admin1' : email === 'admin2.toe2691@example.com' ? 'admin2' : '';
  return !!login && permissions?.[login]?.support === true;
}

function supportDeliveries(before, after, threadId) {
  const oldMessages = Array.isArray(before?.messages) ? before.messages : [];
  const messages = Array.isArray(after?.messages) ? after.messages : [];
  const deliveries = [];
  for (const role of ['staff', 'visitor']) {
    const oldCount = oldMessages.filter(message => message.role === role).length;
    const count = messages.filter(message => message.role === role).length;
    if (count > oldCount) deliveries.push({
      role, key: `support:${threadId}:${role}:${count}`,
      // The thread ID is the authenticated visitor UID, enforced by rules.
      // Ignore writable ownerUid metadata when choosing a private recipient.
      recipientUid: threadId,
      // Skip the sender's own device even if they have staff access.
      senderUid: messages.filter(message => message.role === role).at(-1)?.senderUid || ''
    });
  }
  return deliveries;
}

module.exports = { subscriptionId, validSubscription, canReceiveStaff, supportDeliveries };
