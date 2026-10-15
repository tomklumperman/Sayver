import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, getFirestoreDb } from '../firebase/config';

// The API key/secret only ever pass through this single call — never persisted locally.
export async function connectTrading212(apiKey, apiSecret) {
  const functions = getFirebaseFunctions();
  const callable = httpsCallable(functions, 'connectTrading212');
  try {
    console.info('[Trading212 connect] invoking callable', {
      projectId: functions.app.options.projectId,
      region: 'us-central1',
      function: 'connectTrading212',
    });
    const result = await callable({ apiKey, apiSecret });
    console.info('[Trading212 connect] callable succeeded');
    return result.data;
  } catch (error) {
    console.warn('[Trading212 connect] callable failed', {
      code: error?.code || 'unknown',
      message: error?.message || 'Unknown callable error',
    });
    throw error;
  }
}

export function subscribeToInvestmentAccounts(userId, onUpdate) {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const db = getFirestoreDb();
  const q = query(collection(db, 'investmentAccounts'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      onUpdate(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
    },
    (error) => {
      console.warn('Investment accounts listener error:', error);
    }
  );
}

export async function syncInvestmentAccounts() {
  const callable = httpsCallable(getFirebaseFunctions(), 'syncInvestmentBalancesOnDemand');
  const result = await callable();
  return result.data;
}
