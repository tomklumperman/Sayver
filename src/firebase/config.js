import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

let app = null;
let db = null;
let auth = null;
let storage = null;
let functionsInstance = null;

export function initFirebase() {
  if (app) return app;

  const firebaseConfig = {
    apiKey: "AIzaSyDABz5_fdCPyRB3rc75cK_K8b9_R9Ma7SA",
    authDomain: "finances-overview.firebaseapp.com",
    projectId: "finances-overview",
    storageBucket: "finances-overview.firebasestorage.app",
    messagingSenderId: "899872668677",
    appId: "1:899872668677:web:801a54261c63323909f06c",
    measurementId: "G-FR6GF27FQL",
  };

  app = initializeApp(firebaseConfig);
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    auth = getAuth(app);
  }
  db = getFirestore(app);
  storage = getStorage(app);
  return app;
}

export function getFirebaseAuth() {
  if (!auth) {
    initFirebase();
  }
  return auth;
}

export function getFirestoreDb() {
  if (!db) {
    initFirebase();
  }
  return db;
}

export function getFirebaseStorage() {
  if (!storage) {
    initFirebase();
  }
  return storage;
}

export function getFirebaseFunctions() {
  if (!functionsInstance) {
    functionsInstance = getFunctions(initFirebase(), 'us-central1');
  }
  return functionsInstance;
}
