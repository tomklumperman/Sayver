const fs = require('fs');
const path = require('path');
const { admin, getFirestore } = require('./firestoreClient');

const LOCAL_DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
let localStoreEnabled = false;

function defaultLocalDb() {
  return {
    bank_connections: [],
    oauth_callbacks: [],
    financial_items: [],
  };
}

function readLocalDb() {
  try {
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      return defaultLocalDb();
    }

    const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return {
      bank_connections: Array.isArray(parsed.bank_connections) ? parsed.bank_connections : [],
      oauth_callbacks: Array.isArray(parsed.oauth_callbacks) ? parsed.oauth_callbacks : [],
      financial_items: Array.isArray(parsed.financial_items) ? parsed.financial_items : [],
    };
  } catch (_error) {
    return defaultLocalDb();
  }
}

function writeLocalDb(nextState) {
  fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_DB_PATH, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
}

function isFirestoreAuthError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('unable to detect a project id')
    || message.includes('could not load the default credentials')
    || message.includes('application default credentials')
    || message.includes('could not refresh access token')
    || message.includes('credential')
  );
}

function enableLocalStore(error) {
  if (localStoreEnabled) return;
  localStoreEnabled = true;
  console.warn('[sayver-backend] Firebase Admin unavailable, using local JSON store fallback:', error?.message || error);
}

async function withStorage(firestoreTask, localTask) {
  if (localStoreEnabled) {
    return localTask();
  }

  try {
    const db = getFirestore();
    return await firestoreTask(db);
  } catch (error) {
    if (!isFirestoreAuthError(error)) {
      throw error;
    }
    enableLocalStore(error);
    return localTask();
  }
}

function findConnectionIndex(dbState, userId, provider) {
  return dbState.bank_connections.findIndex((item) => item.userId === userId && item.provider === provider);
}

function nowDate() {
  return new Date();
}

function connectionDocId(userId, provider) {
  return `${provider}_${userId}`;
}

function sanitizeConnection(data = {}) {
  return {
    userId: data.userId || null,
    provider: data.provider || null,
    access_token: data.access_token || null,
    refresh_token: data.refresh_token || null,
    expires_at: data.expires_at || null,
    created_at: data.created_at || null,
    updated_at: data.updated_at || null,
    lastSyncedAt: data.lastSyncedAt || null,
    syncStatus: data.syncStatus || 'idle',
    accountsCache: Array.isArray(data.accountsCache) ? data.accountsCache : [],
    balanceCache: data.balanceCache && typeof data.balanceCache === 'object' ? data.balanceCache : {},
  };
}

function tsToDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function ensureDb() {
  return withStorage(
    async (db) => {
      await db.collection('__healthcheck').limit(1).get();
      return true;
    },
    async () => true
  );
}

async function upsertBankConnection({ userId, provider, access_token, refresh_token, expires_at }) {
  return withStorage(
    async (db) => {
      const ref = db.collection('bank_connections').doc(connectionDocId(userId, provider));
      const snapshot = await ref.get();
      const now = nowDate();

      const payload = {
        userId,
        provider,
        access_token,
        refresh_token,
        expires_at,
        updated_at: now,
      };

      if (!snapshot.exists) {
        payload.created_at = now;
        payload.lastSyncedAt = null;
        payload.syncStatus = 'idle';
        payload.accountsCache = [];
        payload.balanceCache = {};
      }

      await ref.set(payload, { merge: true });
      const updated = await ref.get();
      return sanitizeConnection(updated.data());
    },
    async () => {
      const state = readLocalDb();
      const now = nowDate().toISOString();
      const index = findConnectionIndex(state, userId, provider);

      const existing = index >= 0 ? state.bank_connections[index] : null;
      const next = {
        userId,
        provider,
        access_token,
        refresh_token,
        expires_at,
        created_at: existing?.created_at || now,
        updated_at: now,
        lastSyncedAt: existing?.lastSyncedAt || null,
        syncStatus: existing?.syncStatus || 'idle',
        accountsCache: Array.isArray(existing?.accountsCache) ? existing.accountsCache : [],
        balanceCache: existing?.balanceCache && typeof existing.balanceCache === 'object' ? existing.balanceCache : {},
      };

      if (index >= 0) {
        state.bank_connections[index] = next;
      } else {
        state.bank_connections.push(next);
      }
      writeLocalDb(state);
      return sanitizeConnection(next);
    }
  );
}

async function getBankConnection(userId, provider) {
  return withStorage(
    async (db) => {
      const snapshot = await db.collection('bank_connections').doc(connectionDocId(userId, provider)).get();
      if (!snapshot.exists) return null;
      return sanitizeConnection(snapshot.data());
    },
    async () => {
      const state = readLocalDb();
      const connection = state.bank_connections.find((item) => item.userId === userId && item.provider === provider);
      return connection ? sanitizeConnection(connection) : null;
    }
  );
}

async function deleteBankConnection(userId, provider) {
  return withStorage(
    async (db) => {
      await db.collection('bank_connections').doc(connectionDocId(userId, provider)).delete();
    },
    async () => {
      const state = readLocalDb();
      state.bank_connections = state.bank_connections.filter((item) => !(item.userId === userId && item.provider === provider));
      writeLocalDb(state);
    }
  );
}

async function setConnectionSyncStatus(userId, provider, syncStatus) {
  return withStorage(
    async (db) => {
      const ref = db.collection('bank_connections').doc(connectionDocId(userId, provider));
      await ref.set({
        userId,
        provider,
        syncStatus,
        updated_at: nowDate(),
      }, { merge: true });
    },
    async () => {
      const state = readLocalDb();
      const now = nowDate().toISOString();
      const index = findConnectionIndex(state, userId, provider);
      if (index >= 0) {
        state.bank_connections[index].syncStatus = syncStatus;
        state.bank_connections[index].updated_at = now;
      } else {
        state.bank_connections.push({
          userId,
          provider,
          syncStatus,
          updated_at: now,
          created_at: now,
          accountsCache: [],
          balanceCache: {},
          lastSyncedAt: null,
          access_token: null,
          refresh_token: null,
          expires_at: null,
        });
      }
      writeLocalDb(state);
    }
  );
}

async function markCallbackProcessed({ userId, provider, codeHash, payload }) {
  return withStorage(
    async (db) => {
      const callbackId = `${provider}:${userId}:${codeHash}`;
      const ref = db.collection('oauth_callbacks').doc(callbackId);
      const snapshot = await ref.get();
      if (snapshot.exists) return snapshot.data();

      const next = {
        id: callbackId,
        userId,
        provider,
        codeHash,
        payload,
        created_at: nowDate(),
      };
      await ref.set(next, { merge: true });
      return next;
    },
    async () => {
      const state = readLocalDb();
      const callbackId = `${provider}:${userId}:${codeHash}`;
      const existing = state.oauth_callbacks.find((item) => item.id === callbackId);
      if (existing) return existing;
      const next = {
        id: callbackId,
        userId,
        provider,
        codeHash,
        payload,
        created_at: nowDate().toISOString(),
      };
      state.oauth_callbacks.push(next);
      writeLocalDb(state);
      return next;
    }
  );
}

async function getProcessedCallback(userId, provider, codeHash) {
  return withStorage(
    async (db) => {
      const callbackId = `${provider}:${userId}:${codeHash}`;
      const snapshot = await db.collection('oauth_callbacks').doc(callbackId).get();
      if (!snapshot.exists) return null;
      return snapshot.data() || null;
    },
    async () => {
      const state = readLocalDb();
      const callbackId = `${provider}:${userId}:${codeHash}`;
      return state.oauth_callbacks.find((item) => item.id === callbackId) || null;
    }
  );
}

async function getCachedAccounts(userId, provider) {
  const connection = await getBankConnection(userId, provider);
  if (!connection) {
    return null;
  }

  return {
    userId,
    provider,
    accounts: connection.accountsCache || [],
    updated_at: connection.updated_at,
    lastSyncedAt: connection.lastSyncedAt,
    syncStatus: connection.syncStatus || 'idle',
  };
}

async function setCachedAccounts({ userId, provider, accounts, syncStatus = 'idle', lastSyncedAt = nowDate() }) {
  return withStorage(
    async (db) => {
      const ref = db.collection('bank_connections').doc(connectionDocId(userId, provider));
      await ref.set({
        userId,
        provider,
        accountsCache: Array.isArray(accounts) ? accounts : [],
        lastSyncedAt,
        syncStatus,
        updated_at: nowDate(),
      }, { merge: true });
      const snapshot = await ref.get();
      return sanitizeConnection(snapshot.data());
    },
    async () => {
      const state = readLocalDb();
      const now = nowDate().toISOString();
      const index = findConnectionIndex(state, userId, provider);
      const existing = index >= 0 ? state.bank_connections[index] : {};
      const next = {
        ...existing,
        userId,
        provider,
        accountsCache: Array.isArray(accounts) ? accounts : [],
        lastSyncedAt,
        syncStatus,
        updated_at: now,
        created_at: existing?.created_at || now,
        balanceCache: existing?.balanceCache && typeof existing.balanceCache === 'object' ? existing.balanceCache : {},
      };
      if (index >= 0) state.bank_connections[index] = next;
      else state.bank_connections.push(next);
      writeLocalDb(state);
      return sanitizeConnection(next);
    }
  );
}

async function getCachedBalance(userId, provider, accountId) {
  const connection = await getBankConnection(userId, provider);
  if (!connection) {
    return null;
  }

  const entry = connection.balanceCache?.[accountId];
  if (!entry) {
    return null;
  }

  return {
    payload: entry.payload || null,
    updatedAt: tsToDate(entry.updatedAt),
  };
}

async function setCachedBalance({ userId, provider, accountId, payload, lastSyncedAt = nowDate(), syncStatus = 'idle' }) {
  return withStorage(
    async (db) => {
      const ref = db.collection('bank_connections').doc(connectionDocId(userId, provider));
      await ref.set({
        userId,
        provider,
        [`balanceCache.${accountId}`]: {
          payload,
          updatedAt: nowDate(),
        },
        lastSyncedAt,
        syncStatus,
        updated_at: nowDate(),
      }, { merge: true });
    },
    async () => {
      const state = readLocalDb();
      const now = nowDate().toISOString();
      const index = findConnectionIndex(state, userId, provider);
      const existing = index >= 0 ? state.bank_connections[index] : {};
      const balanceCache = existing?.balanceCache && typeof existing.balanceCache === 'object' ? existing.balanceCache : {};
      balanceCache[accountId] = {
        payload,
        updatedAt: now,
      };

      const next = {
        ...existing,
        userId,
        provider,
        balanceCache,
        lastSyncedAt,
        syncStatus,
        updated_at: now,
        created_at: existing?.created_at || now,
        accountsCache: Array.isArray(existing?.accountsCache) ? existing.accountsCache : [],
      };

      if (index >= 0) state.bank_connections[index] = next;
      else state.bank_connections.push(next);
      writeLocalDb(state);
    }
  );
}

async function upsertFinancialItems(userId, items = []) {
  return withStorage(
    async (db) => {
      const collectionRef = db.collection('users').doc(userId).collection('financial_items');
      const existing = await collectionRef.get();

      const batch = db.batch();
      existing.docs.forEach((docItem) => batch.delete(docItem.ref));

      const now = nowDate();
      const normalized = items
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => ({
          id: item.id || `${userId}-${index}-${Date.now()}`,
          userId,
          name: item.name || 'Unnamed item',
          balance: Number(item.balance) || 0,
          currency: item.currency || 'EUR',
          type: item.type || 'savings',
          provider: item.provider || 'manual',
          created_at: item.created_at ? tsToDate(item.created_at) || now : now,
          updated_at: now,
        }));

      normalized.forEach((item) => {
        const docRef = collectionRef.doc(item.id);
        batch.set(docRef, item, { merge: true });
      });

      await batch.commit();
      return normalized;
    },
    async () => {
      const state = readLocalDb();
      state.financial_items = state.financial_items.filter((item) => item.userId !== userId);

      const now = nowDate().toISOString();
      const normalized = items
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => ({
          id: item.id || `${userId}-${index}-${Date.now()}`,
          userId,
          name: item.name || 'Unnamed item',
          balance: Number(item.balance) || 0,
          currency: item.currency || 'EUR',
          type: item.type || 'savings',
          provider: item.provider || 'manual',
          created_at: item.created_at ? (tsToDate(item.created_at) || nowDate()).toISOString() : now,
          updated_at: now,
        }));

      state.financial_items.push(...normalized);
      writeLocalDb(state);
      return normalized;
    }
  );
}

async function getFinancialItems(userId) {
  return withStorage(
    async (db) => {
      const snapshot = await db.collection('users').doc(userId).collection('financial_items').get();
      return snapshot.docs.map((docItem) => docItem.data());
    },
    async () => {
      const state = readLocalDb();
      return state.financial_items.filter((item) => item.userId === userId);
    }
  );
}

module.exports = {
  admin,
  ensureDb,
  upsertBankConnection,
  getBankConnection,
  deleteBankConnection,
  setConnectionSyncStatus,
  markCallbackProcessed,
  getProcessedCallback,
  getCachedAccounts,
  setCachedAccounts,
  getCachedBalance,
  setCachedBalance,
  upsertFinancialItems,
  getFinancialItems,
};
