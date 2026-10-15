const admin = require('firebase-admin');

let db = null;

function resolveProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID
    || process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GCLOUD_PROJECT
    || 'finances-overview'
  );
}

function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = resolveProjectId();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKeyRaw) {
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
    return admin.app();
  }

  admin.initializeApp({ projectId });
  return admin.app();
}

function getFirestore() {
  if (db) {
    return db;
  }
  initializeFirebaseAdmin();
  db = admin.firestore();
  return db;
}

module.exports = {
  admin,
  getFirestore,
};
