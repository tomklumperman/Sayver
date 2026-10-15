import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, getFirestoreDb } from '../firebase/config';

export async function deleteConnectedAccount(type, accountId) {
  const callable = httpsCallable(getFirebaseFunctions(), 'deleteConnectedAccount');
  const result = await callable({ type, accountId });
  return result.data;
}

export async function connectCryptoWallet(network, publicAddress) {
  const callable = httpsCallable(getFirebaseFunctions(), 'connectCryptoWallet');
  const result = await callable({ network, publicAddress });
  return result.data;
}

export async function beginCoinbaseOAuth(appRedirectUri) {
  const callable = httpsCallable(getFirebaseFunctions(), 'beginCoinbaseOAuth');
  const result = await callable({ appRedirectUri });
  return result.data;
}

export async function purgeLegacyCryptoCredentials() {
  const callable = httpsCallable(getFirebaseFunctions(), 'purgeLegacyCryptoCredentials');
  const result = await callable();
  return result.data;
}

export async function syncCryptoWallets() {
  const walletCallable = httpsCallable(getFirebaseFunctions(), 'syncCryptoWalletsOnDemand');
  const coinbaseCallable = httpsCallable(getFirebaseFunctions(), 'syncCoinbaseAccountsOnDemand');
  const results = await Promise.allSettled([walletCallable(), coinbaseCallable()]);
  const values = results.map((result) => (result.status === 'fulfilled' ? result.value.data : null)).filter(Boolean);
  const failedCount = results.reduce((total, result) => (
    total + (result.status === 'rejected' ? 1 : Number(result.value?.data?.failedCount) || 0)
  ), 0);
  return {
    success: results.every((result) => result.status === 'fulfilled' && result.value.data?.success !== false) && failedCount === 0,
    syncedCount: values.reduce((total, value) => total + (Number(value.syncedCount) || 0), 0),
    failedCount,
  };
}

export function subscribeToCryptoAccounts(userId, onUpdate, onError = null) {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const q = query(
    collection(getFirestoreDb(), 'cryptoAccounts'),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const accounts = snapshot.docs
        .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
        .sort((left, right) => (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0));
      onUpdate(accounts);
    },
    onError || ((error) => console.warn('Crypto account listener error:', error?.message || error))
  );
}

export function subscribeToCryptoAccount(userId, accountId, onUpdate, onError = null) {
  if (!userId || !accountId) {
    onUpdate(null);
    return () => {};
  }

  const accountRef = doc(getFirestoreDb(), 'cryptoAccounts', accountId);
  return onSnapshot(
    accountRef,
    (snapshot) => {
      const account = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
      onUpdate(account?.userId === userId ? account : null);
    },
    onError || ((error) => console.warn('Crypto account details listener error:', error?.message || error))
  );
}
