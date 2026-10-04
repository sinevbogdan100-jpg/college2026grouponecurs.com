const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineString, defineSecret } = require('firebase-functions/params');
const webpush = require('web-push');
const { subscriptionId, validSubscription, canReceiveStaff, supportDeliveries } = require('./push-routing');

initializeApp();
const db = getFirestore();
const publicKey = defineString('VAPID_PUBLIC_KEY');
const privateKey = defineSecret('VAPID_PRIVATE_KEY');
const subject = defineString('VAPID_SUBJECT');
const deviceCollection = 'toe_push_devices';
const region = 'us-central1';

function requireUser(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth;
}

exports.getPushConfiguration = onCall({ region }, request => {
  requireUser(request);
  return { vapidPublicKey: publicKey.value() };
});

exports.registerPushDevice = onCall({ region }, async request => {
  const user = requireUser(request), subscription = request.data?.subscription;
  if (!validSubscription(subscription)) throw new HttpsError('invalid-argument', 'Invalid push subscription');
  const id = subscriptionId(subscription.endpoint);
  const ref = db.collection(deviceCollection).doc(id);
  // A single browser subscription belongs to exactly one current account.
  await ref.set({ uid: user.uid, email: user.token.email || '', subscription: {
    endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }
  }, language: request.data.language === 'kz' ? 'kz' : 'ru', updatedAt: FieldValue.serverTimestamp() });
  return { registered: true };
});

exports.unregisterPushDevice = onCall({ region }, async request => {
  const user = requireUser(request), endpoint = request.data?.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 4096) throw new HttpsError('invalid-argument', 'Invalid endpoint');
  const ref = db.collection(deviceCollection).doc(subscriptionId(endpoint));
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists && snapshot.data().uid === user.uid) transaction.delete(ref);
  });
  return { removed: true };
});

function payloadFor(device, kind, key, threadId, staff = false) {
  const kz = device.language === 'kz';
  return {
    key, kind, threadId: staff ? threadId : '',
    title: kind === 'events' ? (kz ? 'Жаңа хабарландыру' : 'Новое объявление')
      : staff ? (kz ? 'Қолдауға жаңа өтініш' : 'Новое обращение в поддержку')
        : (kz ? 'Қолдаудың жаңа жауабы' : 'Новый ответ поддержки'),
    body: kind === 'events' ? (kz ? 'Оқиғалар орталығын ашыңыз' : 'Откройте центр событий')
      : (kz ? 'Хабарламаны оқу үшін қолдауды ашыңыз' : 'Откройте поддержку, чтобы прочитать сообщение')
  };
}

async function deliver(deviceSnapshots, payload) {
  webpush.setVapidDetails(subject.value(), publicKey.value(), privateKey.value());
  // Ten deliveries at a time; stale/removed subscriptions are cleaned up.
  for (let start = 0; start < deviceSnapshots.length; start += 10) {
    await Promise.all(deviceSnapshots.slice(start, start + 10).map(async snapshot => {
      const device = snapshot.data();
      const body = payload(device);
      const receipt = snapshot.ref.collection('deliveries').doc(subscriptionId(body.key));
      // Firestore events can be delivered more than once; reserve each delivery.
      const reserved = await db.runTransaction(async transaction => {
        const existing = await transaction.get(receipt);
        if (existing.exists && existing.data().state === 'delivered') return false;
        if (existing.exists && Date.now() - (existing.data().reservedAt || 0) < 60000) throw new Error('Delivery is still in progress; retry later');
        transaction.set(receipt, { state: 'pending', reservedAt: Date.now(), expiresAt: new Date(Date.now() + 30 * 86400000) });
        return true;
      });
      if (!reserved) return;
      try {
        await webpush.sendNotification(device.subscription, JSON.stringify(body), { TTL: 86400, timeout: 10000 });
        await receipt.update({ state: 'delivered', at: FieldValue.serverTimestamp() });
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) await snapshot.ref.delete();
        else { await receipt.delete(); throw error; }
      }
    }));
  }
}

const triggerOptions = { region, secrets: [privateKey], retry: true };
exports.pushAnnouncement = onDocumentCreated({ ...triggerOptions, document: 'toe_group/shared/notifications/{notificationId}' }, async event => {
  const announcement = event.data?.data();
  if (!announcement) return;
  const devices = await db.collection(deviceCollection).get();
  await deliver(devices.docs.filter(snapshot => snapshot.data().uid !== announcement.authorUid),
    device => payloadFor(device, 'events', `event:${event.params.notificationId}`, ''));
});

exports.pushSupport = onDocumentWritten({ ...triggerOptions, document: 'toe_group/shared/support/{threadId}' }, async event => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const deliveries = supportDeliveries(event.data.before.exists ? event.data.before.data() : {}, after.data(), event.params.threadId);
  if (!deliveries.length) return;
  const permissions = (await db.doc('toe_group/shared/access/admin_permissions').get()).data() || {};
  for (const incoming of deliveries) {
    const devices = incoming.role === 'staff'
      ? await db.collection(deviceCollection).where('uid', '==', incoming.recipientUid).get()
      : await db.collection(deviceCollection).get();
    const recipients = devices.docs.filter(snapshot => {
      const device = snapshot.data();
      if (device.uid === incoming.senderUid) return false;
      return incoming.role === 'staff' ? device.uid === incoming.recipientUid : canReceiveStaff(device.email, permissions);
    });
    await deliver(recipients, device => payloadFor(device, 'support', incoming.key, event.params.threadId, incoming.role === 'visitor'));
  }
});
