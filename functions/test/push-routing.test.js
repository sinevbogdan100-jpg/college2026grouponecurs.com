const test = require('node:test');
const assert = require('node:assert/strict');
const { validSubscription, canReceiveStaff, supportDeliveries } = require('../push-routing');

const subscription = endpoint => ({ endpoint, keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) } });
test('subscription destinations accept browser push services and reject arbitrary servers', () => {
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/test', 'https://updates.push.services.mozilla.com/wpush/v2/test', 'https://web.push.apple.com/test']) assert.equal(validSubscription(subscription(endpoint)), true);
  for (const endpoint of ['http://fcm.googleapis.com/test', 'https://localhost/test', 'https://169.254.169.254/latest', 'https://fcm.googleapis.com.evil.example/test', 'https://evil.example/test', 'https://user:password@fcm.googleapis.com/test', 'https://fcm.googleapis.com:444/test']) assert.equal(validSubscription(subscription(endpoint)), false);
  assert.equal(validSubscription({ endpoint: 'https://fcm.googleapis.com/test', keys: {} }), false);
});
test('only owner and admins with current support permission receive new requests', () => {
  assert.equal(canReceiveStaff('owner.toe2691@example.com', {}), true);
  assert.equal(canReceiveStaff('admin1.toe2691@example.com', { admin1: { support: true } }), true);
  assert.equal(canReceiveStaff('admin1.toe2691@example.com', { admin1: { support: false } }), false);
  assert.equal(canReceiveStaff('admin2.toe2691@example.com', { admin1: { support: true } }), false);
  assert.equal(canReceiveStaff('visitor@example.com', { admin1: { support: true } }), false);
});
test('staff reply is routed to its thread UID and ignores forged ownerUid', () => {
  const question = { role: 'visitor', senderUid: 'visitor-a' };
  const reply = { role: 'staff', senderUid: 'owner' };
  const before = { messages: [question] }, after = { ownerUid: 'visitor-b', messages: [question, reply] };
  const deliveries = supportDeliveries(before, after, 'visitor-a');
  assert.deepEqual(deliveries, [{ role: 'staff', key: 'support:visitor-a:staff:1', recipientUid: 'visitor-a', senderUid: 'owner' }]);
  assert.deepEqual(supportDeliveries(after, after, 'visitor-a'), []);
  assert.deepEqual(supportDeliveries(after, before, 'visitor-a'), []);
});
test('new initial request and subsequent replies have distinct deduplication keys', () => {
  const initial = { messages: [{ role: 'visitor', senderUid: 'visitor-a' }] };
  assert.equal(supportDeliveries({}, initial, 'visitor-a')[0].key, 'support:visitor-a:visitor:1');
  const after = { messages: [...initial.messages, { role: 'staff' }, { role: 'staff' }] };
  assert.equal(supportDeliveries(initial, after, 'visitor-a')[0].key, 'support:visitor-a:staff:2');
});
