import { getAuth } from 'firebase/auth';
import {
    addDoc,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from 'firebase/firestore';
import { getFirestoreDb } from './config';

const DEFAULT_ACCOUNT_COLORS = {
  Bank: '#dbeafe',
  Cash: '#dcfce7',
  Investment: '#dcfce7',
  Crypto: '#fde68a',
  Savings: '#e2e8f0',
};

export async function ensureUserDocument(user) {
  const db = getFirestoreDb();
  const userDocRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userDocRef);

  if (!userDoc.exists()) {
    await setDoc(userDocRef, {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      currencyPreference: 'EUR',
      createdAt: serverTimestamp(),
    });
  } else {
    const updates = {};
    if (!userDoc.data()?.currencyPreference) updates.currencyPreference = 'EUR';
    if (!userDoc.data()?.photoURL && user.photoURL) updates.photoURL = user.photoURL;
    if (Object.keys(updates).length > 0) {
      await updateDoc(userDocRef, updates);
    }
  }

  return userDocRef;
}

export async function createAccount(
  userId,
  name,
  balance,
  type = 'Savings',
  color,
  imageUrl = null,
  marketSymbol = null,
  marketType = null,
  livePriceSource = null,
  readOnlyConfig = null
) {
  const db = getFirestoreDb();
  const accountsCollection = collection(db, 'users', userId, 'accounts');
  const normalizedReadOnlyConfig = readOnlyConfig && readOnlyConfig.enabled
    ? {
      enabled: true,
      connectionType: readOnlyConfig.connectionType || type?.toLowerCase() || 'account',
      provider: readOnlyConfig.provider || livePriceSource || null,
      externalAccountRef: readOnlyConfig.externalAccountRef || null,
      quantity: typeof readOnlyConfig.quantity === 'number' ? readOnlyConfig.quantity : null,
      note: readOnlyConfig.note || null,
      lastSyncedAt: null,
      lastSyncStatus: null,
      lastSyncMessage: null,
    }
    : {
      enabled: false,
      connectionType: null,
      provider: null,
      externalAccountRef: null,
      quantity: null,
      note: null,
      lastSyncedAt: null,
      lastSyncStatus: null,
      lastSyncMessage: null,
    };

  return await addDoc(accountsCollection, {
    name,
    balance,
    type,
    color: color || DEFAULT_ACCOUNT_COLORS[type] || DEFAULT_ACCOUNT_COLORS.Savings,
    imageUrl: imageUrl || null,
    marketSymbol,
    marketType,
    livePriceSource,
    readOnlyConfig: normalizedReadOnlyConfig,
    order: Date.now(),
    archived: false,
    goal: null,
    createdAt: serverTimestamp(),
  });
}

export async function updateAccountMarketTag(userId, accountId, marketSymbol, marketType, livePriceSource) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  return await updateDoc(accountRef, {
    marketSymbol: marketSymbol || null,
    marketType: marketType || null,
    livePriceSource: livePriceSource || null,
  });
}

export async function adjustAccountBalance(userId, accountId, amount, type, label = null) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  const transactionsCollection = collection(db, 'users', userId, 'accounts', accountId, 'transactions');
  const transactionRef = doc(transactionsCollection);

  await runTransaction(db, async (transaction) => {
    const accountSnap = await transaction.get(accountRef);
    if (!accountSnap.exists()) {
      throw new Error('Account not found');
    }

    const accountData = accountSnap.data();
    if (accountData?.readOnlyConfig?.enabled) {
      throw new Error('This is a read-only linked account and cannot be changed manually.');
    }

    const currentBalance = accountData.balance || 0;
    const resultingBalance = currentBalance + amount;

    transaction.update(accountRef, { balance: resultingBalance });

    transaction.set(transactionRef, {
      amount: Math.abs(amount),
      type,
      label: label || null,
      timestamp: serverTimestamp(),
      resultingBalance,
      accountId,
      accountName: accountData.name || null,
      accountType: accountData.type || null,
      accountColor: accountData.color || null,
      userId,
    });
  });

  return { transactionId: transactionRef.id };
}

export function subscribeToAccounts(userId, onUpdate) {
  const db = getFirestoreDb();
  const accountsCollection = collection(db, 'users', userId, 'accounts');
  const q = query(accountsCollection, orderBy('order', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const accounts = snapshot.docs
      .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
      .filter((account) => account.archived !== true);
    onUpdate(accounts);
  });
}

export async function createFutureTransaction(userId, futureTransaction) {
  const db = getFirestoreDb();
  const transactionsCollection = collection(db, 'users', userId, 'futureTransactions');
  return await addDoc(transactionsCollection, {
    ...futureTransaction,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToFutureTransactions(userId, onUpdate, onError = null) {
  const db = getFirestoreDb();
  const transactionsCollection = collection(db, 'users', userId, 'futureTransactions');
  const q = query(transactionsCollection, orderBy('date', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
    },
    onError || ((error) => console.warn('Future transactions listener error:', error))
  );
}

export async function updateFutureTransaction(userId, transactionId, updates) {
  const db = getFirestoreDb();
  const transactionRef = doc(db, 'users', userId, 'futureTransactions', transactionId);
  return await updateDoc(transactionRef, updates);
}

export async function deleteFutureTransaction(userId, transactionId) {
  const db = getFirestoreDb();
  const transactionRef = doc(db, 'users', userId, 'futureTransactions', transactionId);
  return await deleteDoc(transactionRef);
}

export async function excludeFutureTransactionOccurrence(userId, transactionId, occurrenceDateKey) {
  const db = getFirestoreDb();
  const transactionRef = doc(db, 'users', userId, 'futureTransactions', transactionId);
  return await updateDoc(transactionRef, { excludedDates: arrayUnion(occurrenceDateKey) });
}

export async function createConnectedWallet(userId, walletData = {}) {
  const db = getFirestoreDb();
  const walletsCollection = collection(db, 'users', userId, 'connectedWallets');

  const nickname = walletData?.nickname?.trim() || 'Connected account';
  const provider = walletData?.provider || 'truelayer';

  return await addDoc(walletsCollection, {
    nickname,
    provider,
    bankName: walletData?.bankName || null,
    externalAccountId: walletData?.externalAccountId || null,
    accountDisplayName: walletData?.accountDisplayName || null,
    accountIdentifier: walletData?.accountIdentifier || null,
    walletAddress: walletData?.walletAddress?.trim() || null,
    currency: walletData?.currency || 'EUR',
    totalBalance: typeof walletData?.totalBalance === 'number' ? walletData.totalBalance : 0,
    readOnly: true,
    accessToken: walletData?.accessToken || null,
    refreshToken: walletData?.refreshToken || null,
    tokenExpiresAt: walletData?.tokenExpiresAt || null,
    sandboxMode: walletData?.sandboxMode === false ? false : true,
    lastSyncedAt: null,
    syncStatus: walletData?.syncStatus || 'never',
    syncMessage: typeof walletData?.syncMessage !== 'undefined' ? walletData.syncMessage : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function upsertConnectedWallet(userId, walletData = {}) {
  const db = getFirestoreDb();
  const walletsCollection = collection(db, 'users', userId, 'connectedWallets');
  const provider = walletData?.provider || 'truelayer';
  const externalAccountId = walletData?.externalAccountId || null;

  if (!externalAccountId) {
    return createConnectedWallet(userId, walletData);
  }

  const existingQuery = query(
    walletsCollection,
    where('provider', '==', provider),
    where('externalAccountId', '==', externalAccountId),
    limit(1)
  );
  const existingSnapshot = await getDocs(existingQuery);

  if (existingSnapshot.empty) {
    return createConnectedWallet(userId, walletData);
  }

  const existingDoc = existingSnapshot.docs[0];
  const walletRef = doc(db, 'users', userId, 'connectedWallets', existingDoc.id);
  await updateDoc(walletRef, {
    nickname: walletData?.nickname?.trim() || existingDoc.data()?.nickname || 'Connected account',
    bankName: walletData?.bankName || existingDoc.data()?.bankName || null,
    accountDisplayName: walletData?.accountDisplayName || existingDoc.data()?.accountDisplayName || null,
    accountIdentifier: walletData?.accountIdentifier || existingDoc.data()?.accountIdentifier || null,
    currency: walletData?.currency || existingDoc.data()?.currency || 'EUR',
    totalBalance: typeof walletData?.totalBalance === 'number' ? walletData.totalBalance : existingDoc.data()?.totalBalance || 0,
    readOnly: true,
    accessToken: walletData?.accessToken || existingDoc.data()?.accessToken || null,
    refreshToken: walletData?.refreshToken || existingDoc.data()?.refreshToken || null,
    tokenExpiresAt: walletData?.tokenExpiresAt || existingDoc.data()?.tokenExpiresAt || null,
    sandboxMode: walletData?.sandboxMode === false ? false : true,
    syncStatus: walletData?.syncStatus || existingDoc.data()?.syncStatus || 'ok',
    syncMessage: typeof walletData?.syncMessage !== 'undefined'
      ? walletData.syncMessage
      : typeof existingDoc.data()?.syncMessage !== 'undefined'
        ? existingDoc.data()?.syncMessage
        : null,
    lastSyncedAt: walletData?.lastSyncedAt || existingDoc.data()?.lastSyncedAt || null,
    updatedAt: serverTimestamp(),
  });

  return { id: existingDoc.id };
}

export function subscribeToConnectedWallets(userId, onUpdate) {
  const db = getFirestoreDb();
  const walletsCollection = collection(db, 'users', userId, 'connectedWallets');
  const q = query(walletsCollection, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const wallets = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
    onUpdate(wallets);
  });
}

export async function updateConnectedWalletSync(userId, walletId, syncData = {}) {
  const db = getFirestoreDb();
  const walletRef = doc(db, 'users', userId, 'connectedWallets', walletId);
  const updates = {
    updatedAt: serverTimestamp(),
  };

  if (typeof syncData.totalBalance === 'number' && !Number.isNaN(syncData.totalBalance)) {
    updates.totalBalance = syncData.totalBalance;
  }
  if (typeof syncData.totalValueUsd === 'number' && !Number.isNaN(syncData.totalValueUsd)) {
    updates.totalBalance = syncData.totalValueUsd;
  }
  if (syncData.currency) {
    updates.currency = syncData.currency;
  }
  if (syncData.bankName) {
    updates.bankName = syncData.bankName;
  }
  if (syncData.accountDisplayName) {
    updates.accountDisplayName = syncData.accountDisplayName;
  }
  if (typeof syncData.accountIdentifier !== 'undefined') {
    updates.accountIdentifier = syncData.accountIdentifier;
  }
  if (typeof syncData.accessToken !== 'undefined') {
    updates.accessToken = syncData.accessToken;
  }
  if (typeof syncData.refreshToken !== 'undefined') {
    updates.refreshToken = syncData.refreshToken;
  }
  if (typeof syncData.tokenExpiresAt !== 'undefined') {
    updates.tokenExpiresAt = syncData.tokenExpiresAt;
  }
  if (syncData.syncStatus) {
    updates.syncStatus = syncData.syncStatus;
  }
  if (typeof syncData.syncMessage !== 'undefined') {
    updates.syncMessage = syncData.syncMessage;
  }
  if (syncData.lastSyncedAt === null) {
    updates.lastSyncedAt = null;
  } else if (syncData.lastSyncedAt) {
    updates.lastSyncedAt = syncData.lastSyncedAt;
  }

  return await updateDoc(walletRef, updates);
}

export async function refreshConnectedWallet(userId, walletId, syncData = {}) {
  return updateConnectedWalletSync(userId, walletId, syncData);
}

export function subscribeToRecentTransactions(userId, onUpdate, maxItems = 20) {
  const db = getFirestoreDb();
  const accountListeners = new Map();
  const accountTransactions = new Map();

  const emitLatest = () => {
    const merged = [];
    accountTransactions.forEach((items) => {
      merged.push(...items);
    });

    merged.sort((a, b) => {
      const aMillis = a?.timestamp?.toMillis?.() || 0;
      const bMillis = b?.timestamp?.toMillis?.() || 0;
      return bMillis - aMillis;
    });

    onUpdate(merged.slice(0, maxItems));
  };

  const accountsCollection = collection(db, 'users', userId, 'accounts');
  const accountsQuery = query(accountsCollection, orderBy('order', 'asc'));

  const unsubscribeAccounts = onSnapshot(accountsQuery, (snapshot) => {
    const activeAccountIds = snapshot.docs
      .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
      .filter((account) => account.archived !== true)
      .map((account) => account.id);

    const activeIdSet = new Set(activeAccountIds);

    accountListeners.forEach((unsubscribe, accountId) => {
      if (!activeIdSet.has(accountId)) {
        unsubscribe();
        accountListeners.delete(accountId);
        accountTransactions.delete(accountId);
      }
    });

    activeAccountIds.forEach((accountId) => {
      if (accountListeners.has(accountId)) {
        return;
      }

      const txCollection = collection(db, 'users', userId, 'accounts', accountId, 'transactions');
      const txQuery = query(txCollection, orderBy('timestamp', 'desc'), limit(maxItems));
      const unsubscribeTx = onSnapshot(
        txQuery,
        (txSnapshot) => {
          accountTransactions.set(
            accountId,
            txSnapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }))
          );
          emitLatest();
        },
        (error) => {
          console.warn('Recent transactions listener error:', error);
        }
      );

      accountListeners.set(accountId, unsubscribeTx);
    });

    emitLatest();
  });

  return () => {
    unsubscribeAccounts();
    accountListeners.forEach((unsubscribe) => unsubscribe());
    accountListeners.clear();
    accountTransactions.clear();
  };
}

export async function getAccountsOnce(userId) {
  const db = getFirestoreDb();
  const accountsCollection = collection(db, 'users', userId, 'accounts');
  const snapshot = await getDocs(query(accountsCollection, orderBy('order', 'asc')));
  return snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })).filter((account) => account.archived !== true);
}

export async function getRecentTransactionsOnce(userId, maxItems = 20) {
  const db = getFirestoreDb();
  const accountsCollection = collection(db, 'users', userId, 'accounts');
  const accountsSnapshot = await getDocs(query(accountsCollection, orderBy('order', 'asc')));
  const activeAccounts = accountsSnapshot.docs
    .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
    .filter((account) => account.archived !== true);

  const transactionSnapshots = await Promise.all(
    activeAccounts.map((account) => {
      const txCollection = collection(db, 'users', userId, 'accounts', account.id, 'transactions');
      const txQuery = query(txCollection, orderBy('timestamp', 'desc'), limit(maxItems));
      return getDocs(txQuery);
    })
  );

  const merged = transactionSnapshots.flatMap((snapshot) => snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
  merged.sort((a, b) => {
    const aMillis = a?.timestamp?.toMillis?.() || 0;
    const bMillis = b?.timestamp?.toMillis?.() || 0;
    return bMillis - aMillis;
  });

  return merged.slice(0, maxItems);
}

export function subscribeToUserDocument(userId, onUpdate) {
  const db = getFirestoreDb();
  const userDocRef = doc(db, 'users', userId);
  return onSnapshot(userDocRef, onUpdate);
}

export async function updateUserCurrency(userId, currency) {
  const db = getFirestoreDb();
  const userDocRef = doc(db, 'users', userId);
  return await updateDoc(userDocRef, { currencyPreference: currency });
}

export function subscribeToAccountTransactions(userId, accountId, onUpdate) {
  const db = getFirestoreDb();
  const transactionsCollection = collection(db, 'users', userId, 'accounts', accountId, 'transactions');
  const q = query(transactionsCollection, orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const transactions = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
    onUpdate(transactions);
  });
}

export async function updateAccountColor(userId, accountId, color) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  return await updateDoc(accountRef, { color });
}

export async function updateAccountImage(userId, accountId, imageUrl) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  return await updateDoc(accountRef, { imageUrl: imageUrl || null });
}

export async function updateTransactionLabel(userId, accountId, transactionId, label) {
  const db = getFirestoreDb();
  const txRef = doc(db, 'users', userId, 'accounts', accountId, 'transactions', transactionId);
  return await updateDoc(txRef, { label });
}

export async function deleteAccountTransaction(userId, accountId, transactionId, previousBalance) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  const txRef = doc(db, 'users', userId, 'accounts', accountId, 'transactions', transactionId);

  return await runTransaction(db, async (transaction) => {
    const accountSnap = await transaction.get(accountRef);
    if (!accountSnap.exists()) {
      throw new Error('Account not found');
    }
    transaction.update(accountRef, { balance: previousBalance });
    transaction.delete(txRef);
  });
}

export async function recreateAccountTransaction(userId, accountId, transactionData, resultingBalance) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  const transactionsCollection = collection(db, 'users', userId, 'accounts', accountId, 'transactions');
  const txRef = doc(transactionsCollection);

  await runTransaction(db, async (transaction) => {
    const accountSnap = await transaction.get(accountRef);
    if (!accountSnap.exists()) {
      throw new Error('Account not found');
    }
    transaction.update(accountRef, { balance: resultingBalance });
    transaction.set(txRef, {
      amount: transactionData.amount,
      type: transactionData.type,
      label: transactionData.label || null,
      timestamp: serverTimestamp(),
      resultingBalance,
      accountId,
      accountName: transactionData.accountName || null,
      accountType: transactionData.accountType || null,
      accountColor: transactionData.accountColor || null,
      userId: transactionData.userId,
    });
  });

  return { transactionId: txRef.id };
}

export async function renameAccount(userId, accountId, name) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  return await updateDoc(accountRef, { name });
}

export async function archiveAccount(userId, accountId) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  return await updateDoc(accountRef, { archived: true });
}

export async function setAccountGoal(userId, accountId, goal) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  return await updateDoc(accountRef, { goal });
}

export async function deleteAccount(userId, accountId) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  const transactionsCollection = collection(db, 'users', userId, 'accounts', accountId, 'transactions');
  const recurringCollection = collection(db, 'users', userId, 'accounts', accountId, 'recurringTransactions');

  const [transactionsSnapshot, recurringSnapshot] = await Promise.all([
    getDocs(transactionsCollection),
    getDocs(recurringCollection),
  ]);

  await Promise.all([
    ...transactionsSnapshot.docs.map((docItem) => deleteDoc(docItem.ref)),
    ...recurringSnapshot.docs.map((docItem) => deleteDoc(docItem.ref)),
  ]);

  return await deleteDoc(accountRef);
}

export async function updateAccountOrder(userId, accountId, order) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  return await updateDoc(accountRef, { order });
}

export async function createRecurringTransaction(userId, accountId, amount, type, frequency, startDate, endDate, label) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);
  const accountSnap = await getDoc(accountRef);
  if (accountSnap.exists() && accountSnap.data()?.readOnlyConfig?.enabled) {
    throw new Error('Recurring transactions are disabled for read-only linked accounts.');
  }

  const recurringCollection = collection(db, 'users', userId, 'accounts', accountId, 'recurringTransactions');
  return await addDoc(recurringCollection, {
    amount,
    type,
    frequency,
    startDate: startDate || null,
    endDate: endDate || null,
    label: label || null,
    lastProcessedAt: null,
    createdAt: serverTimestamp(),
  });
}

export async function updateReadOnlyAccountBalance(userId, accountId, resultingBalance, syncMeta = {}) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'users', userId, 'accounts', accountId);

  await runTransaction(db, async (transaction) => {
    const accountSnap = await transaction.get(accountRef);
    if (!accountSnap.exists()) {
      throw new Error('Account not found');
    }

    const accountData = accountSnap.data();
    if (!accountData?.readOnlyConfig?.enabled) {
      throw new Error('Account is not configured for read-only syncing.');
    }

    const safeBalance = Number(resultingBalance);
    if (Number.isNaN(safeBalance)) {
      throw new Error('Invalid balance from read-only sync.');
    }

    const transactionsCollection = collection(db, 'users', userId, 'accounts', accountId, 'transactions');
    const syncTxRef = doc(transactionsCollection);
    const previousBalance = Number(accountData.balance) || 0;
    const delta = safeBalance - previousBalance;

    transaction.update(accountRef, {
      balance: safeBalance,
      readOnlyConfig: {
        ...accountData.readOnlyConfig,
        lastSyncedAt: serverTimestamp(),
        lastSyncStatus: 'ok',
        lastSyncMessage: syncMeta?.message || null,
      },
    });

    transaction.set(syncTxRef, {
      amount: Math.abs(delta),
      type: delta < 0 ? 'withdraw' : 'deposit',
      label: syncMeta?.label || 'Read-only sync',
      timestamp: serverTimestamp(),
      resultingBalance: safeBalance,
      accountId,
      accountName: accountData.name || null,
      accountType: accountData.type || null,
      accountColor: accountData.color || null,
      userId,
      source: 'read-only-sync',
    });
  });
}

export function subscribeToRecurringTransactions(userId, accountId, onUpdate) {
  const db = getFirestoreDb();
  const recurringCollection = collection(db, 'users', userId, 'accounts', accountId, 'recurringTransactions');
  const q = query(recurringCollection, orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
    onUpdate(items);
  });
}

export async function processDueRecurringTransactions(userId) {
  const db = getFirestoreDb();
  const accountsCollection = collection(db, 'users', userId, 'accounts');
  const accountsSnapshot = await getDocs(accountsCollection);
  const now = new Date();

  for (const accountDoc of accountsSnapshot.docs) {
    const accountId = accountDoc.id;
    const recurringCollection = collection(db, 'users', userId, 'accounts', accountId, 'recurringTransactions');
    const recurringSnapshot = await getDocs(recurringCollection);

    for (const recurringDoc of recurringSnapshot.docs) {
      const recurring = recurringDoc.data();
      const startDate = recurring.startDate?.toDate ? recurring.startDate.toDate() : recurring.startDate ? new Date(recurring.startDate) : now;
      const endDate = recurring.endDate?.toDate ? recurring.endDate.toDate() : recurring.endDate ? new Date(recurring.endDate) : null;
      const lastProcessedAt = recurring.lastProcessedAt?.toDate ? recurring.lastProcessedAt.toDate() : recurring.lastProcessedAt ? new Date(recurring.lastProcessedAt) : startDate;
      let nextRun = lastProcessedAt || startDate;
      if (nextRun < startDate) {
        nextRun = startDate;
      }

      while (nextRun <= now && (!endDate || nextRun <= endDate)) {
        const shouldProcess = !recurring.lastProcessedAt || nextRun > lastProcessedAt;
        if (!shouldProcess) break;

        const amount = recurring.type === 'withdraw' ? -Math.abs(recurring.amount) : Math.abs(recurring.amount);
        await adjustAccountBalance(userId, accountId, amount, recurring.type, `${recurring.label || 'Recurring'} (${recurring.frequency})`);
        await updateDoc(doc(db, 'users', userId, 'accounts', accountId, 'recurringTransactions', recurringDoc.id), {
          lastProcessedAt: serverTimestamp(),
        });

        if (recurring.frequency === 'daily') {
          nextRun = new Date(nextRun.setDate(nextRun.getDate() + 1));
        } else if (recurring.frequency === 'weekly') {
          nextRun = new Date(nextRun.setDate(nextRun.getDate() + 7));
        } else {
          nextRun = new Date(nextRun.setMonth(nextRun.getMonth() + 1));
        }
      }
    }
  }
}

export async function getUserByEmail(email) {
  const db = getFirestoreDb();
  const usersCollection = collection(db, 'users');
  const normalizedEmail = email.trim().toLowerCase();

  const normalizedQuery = query(usersCollection, where('email', '==', normalizedEmail));
  const normalizedSnapshot = await getDocs(normalizedQuery);
  if (normalizedSnapshot.docs.length > 0) {
    return { id: normalizedSnapshot.docs[0].id, ...normalizedSnapshot.docs[0].data() };
  }

  const exactEmail = email.trim();
  if (exactEmail && exactEmail !== normalizedEmail) {
    const exactQuery = query(usersCollection, where('email', '==', exactEmail));
    const exactSnapshot = await getDocs(exactQuery);
    if (exactSnapshot.docs.length > 0) {
      return { id: exactSnapshot.docs[0].id, ...exactSnapshot.docs[0].data() };
    }
  }

  return null;
}

function normalizeInviteEmails(inviteEmails) {
  const rawList = Array.isArray(inviteEmails)
    ? inviteEmails
    : String(inviteEmails || '').split(/[\n,;]+/);

  return Array.from(
    new Set(
      rawList
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function getSharedAccountNotificationRecipients(sharedAccount = {}, actorUid = null) {
  const collaboratorIds = Array.isArray(sharedAccount?.collaboratorIds) ? sharedAccount.collaboratorIds : [];
  const collaborators = Array.isArray(sharedAccount?.collaborators) ? sharedAccount.collaborators : [];

  return Array.from(
    new Set([
      ...collaboratorIds,
      ...collaborators.map((collaborator) => collaborator?.uid).filter(Boolean),
    ])
  ).filter((uid) => uid && uid !== actorUid);
}

async function notifySharedAccountChange(sharedAccountId, sharedAccount = {}, payload = {}, recipientIds = null) {
  const db = getFirestoreDb();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const actorUid = payload.actorUid || currentUser?.uid || null;
  const actorDisplayName = payload.actorDisplayName || currentUser?.displayName || currentUser?.email || 'Someone';
  const recipients = Array.isArray(recipientIds) && recipientIds.length > 0
    ? Array.from(new Set(recipientIds.filter(Boolean))).filter((uid) => uid !== actorUid)
    : getSharedAccountNotificationRecipients(sharedAccount, actorUid);

  if (recipients.length === 0) {
    return;
  }

  const notificationPayload = {
    source: 'shared-account',
    type: payload.type || 'update',
    sharedAccountId,
    sharedAccountName: sharedAccount?.name || payload.sharedAccountName || 'Shared savings account',
    actorUid,
    actorDisplayName,
    message: payload.message || `${actorDisplayName} updated the shared savings account.`,
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await Promise.all(
    recipients.map(async (recipientUid) => {
      const notificationRef = doc(collection(db, 'users', recipientUid, 'notifications'));
      await setDoc(notificationRef, {
        ...notificationPayload,
        recipientUid,
      });
    })
  );
}

export async function createSharedAccount(name, inviteEmails, color, currency = 'EUR', imageUrl = null) {
  const db = getFirestoreDb();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not signed in');

  const emails = normalizeInviteEmails(inviteEmails);
  if (emails.length === 0) {
    throw new Error('Add at least one collaborator email.');
  }

  const invitees = await Promise.all(
    emails.map(async (email) => {
      const user = await getUserByEmail(email);
      if (!user) {
        throw new Error(`${email} must already have a Sayver account.`);
      }

      const inviteeUid = user.uid || user.id;
      if (!inviteeUid) {
        throw new Error(`Invited user for ${email} is missing a valid account ID.`);
      }
      if (inviteeUid === currentUser.uid) {
        throw new Error('You cannot invite yourself to a shared savings account.');
      }

      return {
        uid: inviteeUid,
        email: user.email || email,
      };
    })
  );

  const uniqueInvitees = Array.from(new Map(invitees.map((invitee) => [invitee.uid, invitee])).values());

  const sharedAccountRef = await addDoc(collection(db, 'sharedAccounts'), {
    name,
    balance: 0,
    color,
    imageUrl: imageUrl || null,
    currency,
    ownerUid: currentUser.uid,
    collaborators: [
      { uid: currentUser.uid, email: currentUser.email, displayName: currentUser.displayName || currentUser.email },
    ],
    collaboratorIds: [currentUser.uid],
    pendingInviteIds: uniqueInvitees.map((invitee) => invitee.uid),
    collaboratorTargetCount: uniqueInvitees.length + 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await Promise.all(
    uniqueInvitees.map(async (invitee) => {
      const inviteRef = doc(collection(db, 'sharedAccountInvites'));
      const invitePayload = {
        sharedAccountId: sharedAccountRef.id,
        inviteId: inviteRef.id,
        sharedAccountName: name,
        sharedAccountColor: color,
        currency,
        inviterUid: currentUser.uid,
        inviterEmail: currentUser.email || null,
        inviterDisplayName: currentUser.displayName || currentUser.email || 'Someone',
        inviteeUid: invitee.uid,
        inviteeEmail: invitee.email,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(inviteRef, invitePayload);
      await setDoc(doc(db, 'users', invitee.uid, 'sharedInviteInbox', inviteRef.id), invitePayload);
    })
  );

  return sharedAccountRef;
}

function getSharedOwnerUid(sharedAccount = {}) {
  if (typeof sharedAccount?.ownerUid === 'string' && sharedAccount.ownerUid) {
    return sharedAccount.ownerUid;
  }

  const firstCollaborator = Array.isArray(sharedAccount?.collaborators)
    ? sharedAccount.collaborators[0]
    : null;
  return firstCollaborator?.uid || null;
}

export function subscribeToSharedAccounts(userId, onUpdate) {
  const db = getFirestoreDb();
  const sharedQuery = query(
    collection(db, 'sharedAccounts'),
    where('collaboratorIds', 'array-contains', userId)
  );
  return onSnapshot(sharedQuery, (snapshot) => {
    const accounts = snapshot.docs
      .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
      .sort((a, b) => {
        const aMs = a?.updatedAt?.toMillis?.() || 0;
        const bMs = b?.updatedAt?.toMillis?.() || 0;
        return bMs - aMs;
      });
    onUpdate(accounts);
  }, (error) => {
    console.warn('Shared accounts subscription failed:', error);
    onUpdate([]);
  });
}

export function subscribeToSharedAccountTransactions(sharedAccountId, onUpdate) {
  const db = getFirestoreDb();
  const transactionsCollection = collection(db, 'sharedAccounts', sharedAccountId, 'transactions');
  const q = query(transactionsCollection, orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const transactions = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
    onUpdate(transactions);
  });
}

export async function updateSharedAccountColor(sharedAccountId, color) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'sharedAccounts', sharedAccountId);
  await updateDoc(accountRef, { color, updatedAt: serverTimestamp() });
  await notifySharedAccountChange(sharedAccountId, { id: sharedAccountId }, {
    type: 'color',
    message: 'Someone changed the shared savings card color.',
  });
}

export async function updateSharedAccountImage(sharedAccountId, imageUrl) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'sharedAccounts', sharedAccountId);
  await updateDoc(accountRef, { imageUrl: imageUrl || null, updatedAt: serverTimestamp() });
  await notifySharedAccountChange(sharedAccountId, { id: sharedAccountId }, {
    type: 'image',
    message: 'Someone updated the shared savings card image.',
  });
}

export async function updateSharedAccountAvatar(sharedAccountId, avatarUrl) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'sharedAccounts', sharedAccountId);
  await updateDoc(accountRef, { avatarUrl: avatarUrl || null, updatedAt: serverTimestamp() });
  await notifySharedAccountChange(sharedAccountId, { id: sharedAccountId }, {
    type: 'avatar',
    message: 'Someone updated the shared savings avatar.',
  });
}

export async function updateSharedAccountGoals(sharedAccountId, savingsGoals = []) {
  const db = getFirestoreDb();
  const accountRef = doc(db, 'sharedAccounts', sharedAccountId);
  await updateDoc(accountRef, {
    savingsGoals: Array.isArray(savingsGoals) ? savingsGoals : [],
    updatedAt: serverTimestamp(),
  });
  await notifySharedAccountChange(sharedAccountId, { id: sharedAccountId }, {
    type: 'goals',
    message: 'Someone updated the shared savings goals.',
  });
}

export async function syncSharedAccountsDisplayName(userId, displayName) {
  const db = getFirestoreDb();
  const sharedAccountsQuery = query(
    collection(db, 'sharedAccounts'),
    where('collaboratorIds', 'array-contains', userId)
  );
  const snapshot = await getDocs(sharedAccountsQuery);

  await Promise.all(snapshot.docs.map((docItem) => {
    const collaborators = Array.isArray(docItem.data()?.collaborators) ? docItem.data().collaborators : [];
    if (!collaborators.some((collaborator) => collaborator?.uid === userId && collaborator?.displayName !== displayName)) {
      return null;
    }
    const nextCollaborators = collaborators.map((collaborator) => (
      collaborator?.uid === userId ? { ...collaborator, displayName } : collaborator
    ));
    return updateDoc(docItem.ref, { collaborators: nextCollaborators });
  }));
}

export async function renameSharedAccount(sharedAccountId, name) {
  const db = getFirestoreDb();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not signed in');

  const accountRef = doc(db, 'sharedAccounts', sharedAccountId);
  const nextName = String(name || '').trim();
  if (!nextName) {
    throw new Error('Shared account name is required.');
  }

  await runTransaction(db, async (transaction) => {
    const accountSnap = await transaction.get(accountRef);
    if (!accountSnap.exists()) {
      throw new Error('Shared account not found');
    }

    const accountData = accountSnap.data();
    if (!(accountData?.collaboratorIds || []).includes(currentUser.uid)) {
      throw new Error('You are not a collaborator on this shared account.');
    }

    transaction.update(accountRef, {
      name: nextName,
      updatedAt: serverTimestamp(),
    });
  });

  await notifySharedAccountChange(sharedAccountId, { name: nextName }, {
    type: 'rename',
    message: `Someone renamed the shared savings account to ${nextName}.`,
  });
}

export async function inviteCollaboratorsToSharedAccount(sharedAccountId, inviteEmails) {
  const db = getFirestoreDb();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not signed in');

  const emails = normalizeInviteEmails(inviteEmails);
  if (emails.length === 0) {
    throw new Error('Add at least one collaborator email.');
  }

  const sharedAccountRef = doc(db, 'sharedAccounts', sharedAccountId);
  const sharedAccountSnap = await getDoc(sharedAccountRef);
  if (!sharedAccountSnap.exists()) {
    throw new Error('Shared account not found');
  }

  const accountData = sharedAccountSnap.data() || {};
  const collaboratorIds = Array.isArray(accountData.collaboratorIds) ? accountData.collaboratorIds : [];
  if (!collaboratorIds.includes(currentUser.uid)) {
    throw new Error('You are not a collaborator on this shared account.');
  }

  const pendingInviteIds = Array.isArray(accountData.pendingInviteIds) ? accountData.pendingInviteIds : [];

  const invitees = await Promise.all(
    emails.map(async (email) => {
      const user = await getUserByEmail(email);
      if (!user) {
        throw new Error(`${email} must already have a Sayver account.`);
      }

      const inviteeUid = user.uid || user.id;
      if (!inviteeUid) {
        throw new Error(`Invited user for ${email} is missing a valid account ID.`);
      }
      if (inviteeUid === currentUser.uid) {
        throw new Error('You cannot invite yourself to this shared savings account.');
      }

      return {
        uid: inviteeUid,
        email: user.email || email,
      };
    })
  );

  const uniqueInvitees = Array.from(new Map(invitees.map((invitee) => [invitee.uid, invitee])).values());
  const nextInvitees = uniqueInvitees.filter(
    (invitee) => !collaboratorIds.includes(invitee.uid) && !pendingInviteIds.includes(invitee.uid)
  );

  if (nextInvitees.length === 0) {
    throw new Error('All entered users are already collaborators or already invited.');
  }

  await Promise.all(
    nextInvitees.map(async (invitee) => {
      const inviteRef = doc(collection(db, 'sharedAccountInvites'));
      const invitePayload = {
        sharedAccountId,
        inviteId: inviteRef.id,
        sharedAccountName: accountData.name || 'Shared savings account',
        sharedAccountColor: accountData.color || '#f97316',
        currency: accountData.currency || 'EUR',
        inviterUid: currentUser.uid,
        inviterEmail: currentUser.email || null,
        inviterDisplayName: currentUser.displayName || currentUser.email || 'Someone',
        inviteeUid: invitee.uid,
        inviteeEmail: invitee.email,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(inviteRef, invitePayload);
      await setDoc(doc(db, 'users', invitee.uid, 'sharedInviteInbox', inviteRef.id), invitePayload);
    })
  );

  const nextPendingInviteIds = Array.from(new Set([...pendingInviteIds, ...nextInvitees.map((invitee) => invitee.uid)]));
  const nextTargetCount = Math.max(
    Number(accountData.collaboratorTargetCount) || collaboratorIds.length,
    collaboratorIds.length + nextPendingInviteIds.length
  );

  await updateDoc(sharedAccountRef, {
    pendingInviteIds: nextPendingInviteIds,
    collaboratorTargetCount: nextTargetCount,
    updatedAt: serverTimestamp(),
  });

  await notifySharedAccountChange(sharedAccountId, accountData, {
    type: 'invite',
    message: `${currentUser.displayName || currentUser.email || 'Someone'} invited new collaborators to the shared savings account.`,
  }, collaboratorIds);

  return { invitedCount: nextInvitees.length };
}

export async function leaveSharedAccount(sharedAccountId) {
  const db = getFirestoreDb();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not signed in');

  const sharedAccountRef = doc(db, 'sharedAccounts', sharedAccountId);
  let accountData = null;
  let remainingCollaborators = [];
  let remainingCollaboratorIds = [];

  await runTransaction(db, async (transaction) => {
    const accountSnap = await transaction.get(sharedAccountRef);
    if (!accountSnap.exists()) {
      throw new Error('Shared account not found');
    }

    accountData = accountSnap.data();
    const collaboratorIds = Array.isArray(accountData?.collaboratorIds) ? accountData.collaboratorIds : [];
    if (!collaboratorIds.includes(currentUser.uid)) {
      throw new Error('You are not a collaborator on this shared account.');
    }

    const collaborators = Array.isArray(accountData?.collaborators) ? accountData.collaborators : [];
    remainingCollaborators = collaborators.filter((item) => item?.uid !== currentUser.uid);
    remainingCollaboratorIds = collaboratorIds.filter((uid) => uid !== currentUser.uid);

    if (remainingCollaboratorIds.length === 0) {
      transaction.delete(sharedAccountRef);
      return;
    }

    const ownerUid = getSharedOwnerUid(accountData);
    const nextOwnerUid = ownerUid === currentUser.uid
      ? (remainingCollaborators[0]?.uid || remainingCollaboratorIds[0])
      : ownerUid;

    transaction.update(sharedAccountRef, {
      collaborators: remainingCollaborators,
      collaboratorIds: remainingCollaboratorIds,
      ownerUid: nextOwnerUid || null,
      updatedAt: serverTimestamp(),
    });
  });

  await notifySharedAccountChange(sharedAccountId, {
    ...accountData,
    collaborators: remainingCollaborators,
    collaboratorIds: remainingCollaboratorIds,
  }, {
    type: 'leave',
    message: `${currentUser.displayName || currentUser.email || 'Someone'} left the shared savings account.`,
  }, remainingCollaboratorIds);
}

export async function deleteSharedAccount(sharedAccountId) {
  const db = getFirestoreDb();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not signed in');

  const sharedAccountRef = doc(db, 'sharedAccounts', sharedAccountId);

  const accountSnap = await getDoc(sharedAccountRef);
  if (!accountSnap.exists()) {
    throw new Error('Shared account not found');
  }

  const accountData = accountSnap.data();
  const ownerUid = getSharedOwnerUid(accountData);
  if (ownerUid !== currentUser.uid) {
    throw new Error('Only the owner can delete this shared account.');
  }

  await notifySharedAccountChange(sharedAccountId, accountData, {
    type: 'delete',
    message: `${currentUser.displayName || currentUser.email || 'Someone'} deleted the shared savings account.`,
  }, (accountData.collaboratorIds || []).filter((uid) => uid !== currentUser.uid));

  const transactionsCollection = collection(db, 'sharedAccounts', sharedAccountId, 'transactions');
  const transactionsSnapshot = await getDocs(transactionsCollection);
  await Promise.all(transactionsSnapshot.docs.map((docItem) => deleteDoc(docItem.ref)));
  await deleteDoc(sharedAccountRef);
}

export async function addSharedAccountTransaction(sharedAccountId, amount, type, label = null) {
  const db = getFirestoreDb();
  const sharedAccountRef = doc(db, 'sharedAccounts', sharedAccountId);
  const transactionsCollection = collection(db, 'sharedAccounts', sharedAccountId, 'transactions');
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not signed in');

  let sharedAccountData = null;
  let actorDisplayName = currentUser.displayName || currentUser.email || 'Someone';

  return await runTransaction(db, async (transaction) => {
    const accountSnap = await transaction.get(sharedAccountRef);
    if (!accountSnap.exists()) {
      throw new Error('Shared account not found');
    }

    const accountData = accountSnap.data();
    sharedAccountData = accountData;
    const collaboratorIds = accountData?.collaboratorIds || [];
    if (!collaboratorIds.includes(currentUser.uid)) {
      throw new Error('You are not a collaborator on this shared account.');
    }

    const currentBalance = accountData.balance || 0;
    const newBalance = type === 'withdraw' ? currentBalance - amount : currentBalance + amount;

    transaction.update(sharedAccountRef, {
      balance: newBalance,
      updatedAt: serverTimestamp(),
    });

    const userDoc = await getDoc(doc(getFirestoreDb(), 'users', currentUser.uid));
    const userDisplayName = userDoc.exists() ? userDoc.data()?.displayName || currentUser.email : currentUser.email;
    actorDisplayName = userDisplayName;

    const txRef = doc(transactionsCollection);
    const normalizedLabel = String(label || '').trim();
    transaction.set(txRef, {
      amount,
      type,
      label: normalizedLabel || null,
      timestamp: serverTimestamp(),
      resultingBalance: newBalance,
      sharedAccountId,
      userId: currentUser.uid,
      userEmail: currentUser.email,
      userDisplayName,
    });
  });

}

export function subscribeToSharedAccountInvites(userId, _userEmail, onUpdate) {
  const db = getFirestoreDb();
  const invitesQuery = query(collection(db, 'users', userId, 'sharedInviteInbox'));

  return onSnapshot(invitesQuery, (snapshot) => {
    const invites = snapshot.docs
      .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
      .filter((invite) => invite.status === 'pending')
      .sort((a, b) => {
        const aMs = a?.createdAt?.toMillis?.() || 0;
        const bMs = b?.createdAt?.toMillis?.() || 0;
        return bMs - aMs;
      });
    onUpdate(invites);
  }, (error) => {
    console.warn('Shared invite inbox subscription failed:', error);
    onUpdate([]);
  });
}

export async function acceptSharedAccountInvite(inviteId) {
  const db = getFirestoreDb();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not signed in');

  const inviteRef = doc(db, 'sharedAccountInvites', inviteId);
  const inboxInviteRef = doc(db, 'users', currentUser.uid, 'sharedInviteInbox', inviteId);

  await runTransaction(db, async (transaction) => {
    const inboxInviteSnap = await transaction.get(inboxInviteRef);
    if (!inboxInviteSnap.exists()) {
      throw new Error('Invite not found');
    }

    const inviteData = inboxInviteSnap.data();
    if (inviteData.inviteeUid !== currentUser.uid) {
      throw new Error('This invite is not for you.');
    }
    if (inviteData.status !== 'pending') {
      throw new Error('This invite is no longer pending.');
    }

    const inviteSnap = await transaction.get(inviteRef);
    if (!inviteSnap.exists()) {
      throw new Error('Invite source not found');
    }

    const sharedAccountRef = doc(db, 'sharedAccounts', inviteData.sharedAccountId);
    const sharedAccountSnap = await transaction.get(sharedAccountRef);
    if (!sharedAccountSnap.exists()) {
      throw new Error('Shared account not found.');
    }

    const accountData = sharedAccountSnap.data();
    const nextCollaboratorIds = Array.from(new Set([...(accountData.collaboratorIds || []), currentUser.uid]));
    const nextCollaborators = [...(accountData.collaborators || [])];
    if (!nextCollaborators.some((collaborator) => collaborator.uid === currentUser.uid)) {
      nextCollaborators.push({
        uid: currentUser.uid,
        email: currentUser.email || inviteData.inviteeEmail || null,
        displayName: currentUser.displayName || currentUser.email || inviteData.inviteeEmail || 'Collaborator',
      });
    }
    const nextPendingInviteIds = (accountData.pendingInviteIds || []).filter((uid) => uid !== currentUser.uid);

    transaction.update(sharedAccountRef, {
      collaboratorIds: nextCollaboratorIds,
      collaborators: nextCollaborators,
      pendingInviteIds: nextPendingInviteIds,
      updatedAt: serverTimestamp(),
    });

    const inviteUpdate = {
      status: 'accepted',
      respondedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    transaction.update(inviteRef, inviteUpdate);
    transaction.update(inboxInviteRef, inviteUpdate);
  });

  await notifySharedAccountChange(sharedAccountSnap.id, accountData, {
    type: 'join',
    message: `${currentUser.displayName || currentUser.email || 'Someone'} joined the shared savings account.`,
  });
}

export async function declineSharedAccountInvite(inviteId) {
  const db = getFirestoreDb();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User not signed in');

  const inviteRef = doc(db, 'sharedAccountInvites', inviteId);
  const inboxInviteRef = doc(db, 'users', currentUser.uid, 'sharedInviteInbox', inviteId);

  await runTransaction(db, async (transaction) => {
    const inboxInviteSnap = await transaction.get(inboxInviteRef);
    if (!inboxInviteSnap.exists()) {
      throw new Error('Invite not found');
    }

    const inviteData = inboxInviteSnap.data();
    if (inviteData.inviteeUid !== currentUser.uid) {
      throw new Error('This invite is not for you.');
    }
    if (inviteData.status !== 'pending') {
      throw new Error('This invite is no longer pending.');
    }

    const inviteSnap = await transaction.get(inviteRef);
    if (!inviteSnap.exists()) {
      throw new Error('Invite source not found');
    }

    const sharedAccountRef = doc(db, 'sharedAccounts', inviteData.sharedAccountId);
    const sharedAccountSnap = await transaction.get(sharedAccountRef);
    if (sharedAccountSnap.exists()) {
      const accountData = sharedAccountSnap.data();
      const nextPendingInviteIds = (accountData.pendingInviteIds || []).filter((uid) => uid !== currentUser.uid);
      transaction.update(sharedAccountRef, {
        pendingInviteIds: nextPendingInviteIds,
        updatedAt: serverTimestamp(),
      });
    }

    const inviteUpdate = {
      status: 'declined',
      respondedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    transaction.update(inviteRef, inviteUpdate);
    transaction.update(inboxInviteRef, inviteUpdate);
  });
}
