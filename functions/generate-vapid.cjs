// Run locally once; private material is written only to ignored files.
const fs = require('node:fs');
const path = require('node:path');
const webpush = require('web-push');
const envPath = path.join(__dirname, '.env.sbpgroup-toe-26-9-1');
const keyPath = path.join(__dirname, 'vapid-private.txt');
const subject = process.argv[2];
if (!subject || !/^(https:\/\/|mailto:)/.test(subject)) throw new Error('Pass your public HTTPS site URL or contact mailto: address');
if (fs.existsSync(envPath) || fs.existsSync(keyPath)) throw new Error('Keys already exist. Preserve the existing keys for registered devices.');
const keys = webpush.generateVAPIDKeys();
fs.writeFileSync(envPath, `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_SUBJECT=${subject}\n`, { mode: 0o600 });
fs.writeFileSync(keyPath, keys.privateKey, { mode: 0o600 });
console.log('VAPID keys saved locally. Import vapid-private.txt to Firebase Secret Manager; never commit it.');
