import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { getAuth, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { doc, runTransaction, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    FlatList,
    Image,
    InputAccessoryView,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    useWindowDimensions,
    View,
} from 'react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import Svg, { Circle, G, Path } from 'react-native-svg';
import AmountAllocationSlider from '../components/AmountAllocationSlider';
import CardActionMenu from '../components/CardActionMenu';
import CardMenuButton from '../components/CardMenuButton';
import CryptoBrandLogo, { CRYPTO_BRANDS, getCryptoBrandKey } from '../components/CryptoBrandLogo';
import { IOSKeyboardDoneAccessory, KeyboardAwareModalOverlay } from '../components/ModalKeyboardSupport';
import PrimaryButton from '../components/PrimaryButton';
import { APP_BACKGROUND_GRADIENT } from '../constants/backgroundGradient';
import { getBankBranding } from '../constants/bankBranding';
import { DEFAULT_ACCOUNT_COLORS, formatCurrency, getReadableTextColor } from '../constants/colors';
import { getFirestoreDb } from '../firebase/config';
import {
    adjustAccountBalance,
    archiveAccount,
    deleteAccount,
    deleteAccountTransaction,
    ensureUserDocument,
    getAccountsOnce,
    getRecentTransactionsOnce,
    processDueRecurringTransactions,
    recreateAccountTransaction,
    renameAccount,
    subscribeToAccounts,
    subscribeToConnectedWallets,
    subscribeToRecentTransactions,
    subscribeToSharedAccounts,
    subscribeToUserDocument,
    updateAccountOrder,
    updateTransactionLabel,
} from '../firebase/firestore';
import { isLocalImageUri, uploadLocalImageIfNeeded } from '../firebase/storage';
import { syncAllConnectedWallets, syncConnectedWalletBalance } from '../services/connectedWallets';
import { deleteConnectedAccount, purgeLegacyCryptoCredentials, subscribeToCryptoAccounts, syncCryptoWallets } from '../services/cryptoAccounts';
import { valueCryptoAccountUsd } from '../services/cryptoPrices';
import { convertCurrencyAmount } from '../services/currency';
import { subscribeToInvestmentAccounts, syncInvestmentAccounts } from '../services/investmentAccounts';
import { syncReadOnlyLinkedAccounts } from '../services/readOnlyBalances';
import { getAccountAvailabilityBreakdown } from '../utils/accountAvailability';

const DASHBOARD_MOUNTAIN_IMAGE = require('../../assets/dashboard-mountain-2.jpg');
const HERO_TOP_COLOR = '#3685AB';
const HERO_SOURCE_START_Y = 1310;
const HERO_SOURCE_END_Y = 1600;
const HERO_SCENE_HEIGHT = HERO_SOURCE_END_Y - HERO_SOURCE_START_Y;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);
const AnimatedDraggableFlatList = Animated.createAnimatedComponent(DraggableFlatList);
const REFRESH_HOLD_OFFSET = 68;

const GOAL_ARC_SEGMENTS = 44;
const GOAL_ARC_START_DEG = 120;
const GOAL_ARC_SPAN_DEG = 300;
const GOAL_ARC_FILL_START = '#fde68a';
const GOAL_ARC_FILL_END = '#b45309';
const GOAL_ARC_EMPTY_DARK = 'rgba(203,213,225,0.5)';
const GOAL_ARC_EMPTY_LIGHT = 'rgba(15,81,50,0.2)';
const GOAL_ACTION_GREEN = '#84cc16';
const SAYVER_PORTFOLIO_GREEN_STOPS = ['#F0FFF4', '#86EFAC', '#22C55E', '#064E3B'];
const HIDDEN_BALANCE_TEXT = '****,**';
const HOME_MODAL_ACCESSORY_ID = 'home-modal-input-accessory';
const TREND_RANGE_CONFIG = {
  '1D': { unit: 'hour', totalSlots: 24 },
  '1W': { unit: 'day', totalSlots: 7 },
  '1M': { unit: 'day', totalSlots: 30 },
  '1Y': { unit: 'month', totalSlots: 12 },
};
const TREND_RANGE_KEYS = ['1D', '1W', '1M', '1Y'];
const GOAL_CARD_GAP = 10;
const GOAL_SIDE_ADD_BUTTON_WIDTH = 42;
const GOAL_SIDE_ADD_BUTTON_GAP = 10;
const GOAL_INLINE_ADD_CARD_GAP = GOAL_CARD_GAP;
const GOAL_INLINE_ADD_PEEK_WIDTH = 24;
const SCREEN_CONTENT_HORIZONTAL_INSET = 20;
const HOME_TRANSLATIONS = {
  en: {
    brandSubtitle: 'Your savings dashboard',
    totalBalance: 'Total balance',
    acrossAllAccounts: 'Across all accounts',
    financialDashboard: 'Financial dashboard',
    newSavings: 'New savings',
    undo: 'Undo',
    redo: 'Redo',
    dragToReorder: 'Drag the cards to reorder them.',
    done: 'Done',
    noVirtualAccounts: 'No virtual accounts yet.',
    createAccountToBegin: 'Create an account to begin simulation.',
    recentActivity: 'Recent activity',
    noRecentActivity: 'No recent activity yet.',
    accountActions: 'Account actions',
    openDetails: 'Open details',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    rearrangeAccounts: 'Rearrange accounts',
    rename: 'Rename',
    archive: 'Archive',
    deleteBox: 'Delete box',
    cancel: 'Cancel',
    addFunds: 'Add funds',
    withdrawFunds: 'Withdraw funds',
    enterAmount: 'Enter amount',
    labelOptional: 'Label (optional)',
    confirm: 'Confirm',
    editTransactionName: 'Edit transaction name',
    transactionName: 'Transaction name',
    save: 'Save',
    renameAccount: 'Rename account',
    newAccountName: 'New account name',
    savings: 'Savings',
    account: 'Account',
    add: 'Add',
    numberOfAccounts: 'Number of accounts',
    createNewAccount: 'New account',
    newSavingsGoal: 'New savings goal',
    goalProgress: 'Goal progress',
    noGoalYet: 'No savings goal set yet.',
    goalReached: 'Goal reached',
    createGoalTitle: 'Create savings goal',
    goalNameOptional: 'Goal name (optional)',
    goalAmount: 'Goal amount',
    createGoal: 'Create goal',
    untitledGoal: 'Savings goal',
    reachedOfGoal: 'reached',
    reserveFromBoxes: 'Reserve from boxes',
    reserveForGoal: 'Reserve for goal',
    chooseBox: 'Choose a box',
    reserveAmount: 'Reserve amount',
    addReserve: 'Add reserve',
    noAccountsAvailable: 'Create an account first to reserve money for your goal.',
    noBoxSelected: 'Select a box first.',
    invalidReserveAmount: 'Enter a valid amount to reserve.',
    reserveTooHigh: 'You can reserve up to',
    removeSavingGoal: 'Delete saving goal',
    removeSavingGoalConfirm: 'Are you sure you want to delete this saving goal?',
    goalActivity: 'Goal activity',
    totalReserved: 'Total reserved',
    noGoalActivity: 'No deposits or withdrawals yet.',
    fromSource: 'from',
    withdrawFromGoal: 'Withdraw from goal',
    withdrawAmount: 'Withdraw amount',
    withdrawTooHigh: 'You can withdraw up to',
    noReservedAmounts: 'Nothing reserved for this goal yet.',
    savingsTrend: 'Trend',
    tapToExpand: 'Tap to expand',
    savingsTrendTitle: 'Savings trend',
    trendRange1D: '1D',
    trendRange1W: '1W',
    trendRange1M: '1M',
    trendRange1Y: '1Y',
    trendSubtitle1D: 'Total balance in the past 24 hours',
    trendSubtitle1W: 'Daily total balance over the past 7 days',
    trendSubtitle1M: 'Daily total balance over the past 30 days',
    trendSubtitle1Y: 'Monthly total balance over the past 12 months',
    close: 'Close',
    connect: 'Connect account',
    connectedWallets: 'Connected bank accounts',
    manualAccounts: 'Manually added accounts',
    readOnly: 'Read Only',
    lastSynced: 'Last synced',
    lastSyncFailed: 'Last sync failed',
    refresh: 'Refresh',
    noConnectedWallets: 'No connected bank accounts yet.',
    walletSyncFailed: 'Could not sync bank account. Please try again.',
    invalidTransactionAmount: 'Enter a valid amount greater than 0.',
    transactionFailed: 'Could not save this transaction. Please try again.',
    deleteBoxTitle: 'Delete box',
    deleteBoxConfirm: 'This permanently deletes this box and its transactions. This cannot be undone.',
    deleteBoxFailed: 'Could not delete this box. Please try again.',
    deleteConnectedTitle: 'Delete connected account',
    deleteConnectedConfirm: 'Permanently remove this account and its saved balances and credentials from Sayver? Your funds at the provider will not be affected.',
    deleteConnectedFailed: 'Could not delete this connected account. Please try again.',
    connectInvestment: 'Connect investment account',
    externalAccount: 'External account',
    connectBank: 'Connect bank',
    connectCryptoWallet: 'Connect crypto wallet',
    cryptoUnavailable: 'Crypto wallet connections are coming soon.',
    investmentAccount: 'Investment account',
    investmentDetails: 'Investment account details',
    noPositions: 'No open positions.',
    investments: 'Investments',
    noInvestmentAccounts: 'No investment accounts connected yet.',
    chooseBroker: 'Choose a broker',
    comingSoon: 'Coming soon',
    cash: 'Cash',
    invested: 'Invested',
    investmentInvalid: 'Reconnect required — credentials expired or revoked.',
    readOnlyAccountTitle: 'Read-only account',
    readOnlyAccountMessage: 'This linked account is read-only and cannot be changed from this app.',
    permissionNeeded: 'Permission needed',
    photoPermission: 'Please allow photo access to choose a profile picture.',
    profilePictureError: 'Unable to choose profile picture.',
    error: 'Error',
    todo: 'TODO',
    renameWalletUnavailable: 'Rename connected bank accounts is not available yet.',
    rearrangeWalletUnavailable: 'Rearranging connected bank accounts is not available yet.',
    deleteWalletUnavailable: 'Deleting connected bank accounts is not available yet.',
    bankAccount: 'Bank account',
    cryptoAccounts: 'Crypto accounts',
    noCryptoAccounts: 'No crypto wallets connected yet.',
    cryptoWallet: 'wallet',
    cryptoExchangeAccount: 'Coinbase account',
    cryptoSelfCustody: 'Self-custody wallet',
    cryptoTokens: (count) => `${count} ${count === 1 ? 'token' : 'tokens'}`,
    cryptoUnpriced: (count) => `${count} without price`,
    cryptoValueUnavailable: 'Value unavailable',
    copyAddress: 'Copy address',
    cryptoSyncFailed: 'Last sync failed',
    connectCryptoWallet: 'Connect crypto wallet',
    cryptoUnavailable: 'Crypto wallet connections are coming soon.',
    chooseGoalImage: 'Choose goal image',
    chooseGoalImageOptional: 'Choose goal image (optional)',
    changeGoalImage: 'Change goal image',
    goalImagePermission: 'Please allow photo access to choose a goal image.',
    goalImageFailed: 'Could not update this goal image. Please try again.',
    deleteGoalImage: 'Delete image',
  },
  nl: {
    brandSubtitle: 'Jouw spaardashboard',
    totalBalance: 'Totaal saldo',
    acrossAllAccounts: 'Over alle rekeningen',
    financialDashboard: 'Financieel dashboard',
    newSavings: 'Nieuwe spaarpot',
    undo: 'Ongedaan maken',
    redo: 'Opnieuw uitvoeren',
    dragToReorder: 'Sleep de kaarten om ze te ordenen.',
    done: 'Klaar',
    noVirtualAccounts: 'Nog geen virtuele rekeningen.',
    createAccountToBegin: 'Maak een rekening om te beginnen met simuleren.',
    recentActivity: 'Recente activiteit',
    noRecentActivity: 'Nog geen recente activiteit.',
    accountActions: 'Rekeningacties',
    openDetails: 'Details openen',
    deposit: 'Storten',
    withdraw: 'Opnemen',
    rearrangeAccounts: 'Rekeningen herordenen',
    rename: 'Hernoemen',
    archive: 'Archiveren',
    deleteBox: 'Potje verwijderen',
    cancel: 'Annuleren',
    addFunds: 'Geld toevoegen',
    withdrawFunds: 'Geld opnemen',
    enterAmount: 'Voer bedrag in',
    labelOptional: 'Label (optioneel)',
    confirm: 'Bevestigen',
    editTransactionName: 'Transactienaam bewerken',
    transactionName: 'Transactienaam',
    save: 'Opslaan',
    renameAccount: 'Rekening hernoemen',
    newAccountName: 'Nieuwe rekeningnaam',
    savings: 'Sparen',
    account: 'Rekening',
    add: 'Storten',
    numberOfAccounts: 'Aantal rekeningen',
    createNewAccount: 'Nieuwe rekening',
    newSavingsGoal: 'Nieuw spaardoel',
    goalProgress: 'Voortgang spaardoel',
    noGoalYet: 'Nog geen spaardoel ingesteld.',
    goalReached: 'Doel behaald',
    createGoalTitle: 'Spaardoel maken',
    goalNameOptional: 'Doelnaam (optioneel)',
    goalAmount: 'Doelbedrag',
    createGoal: 'Doel maken',
    untitledGoal: 'Spaardoel',
    reachedOfGoal: 'behaald',
    reserveFromBoxes: 'Reserveren uit potjes',
    reserveForGoal: 'Reserveren voor doel',
    chooseBox: 'Kies een potje',
    reserveAmount: 'Reserveer bedrag',
    addReserve: 'Reservering toevoegen',
    noAccountsAvailable: 'Maak eerst een rekening om geld te reserveren voor je doel.',
    noBoxSelected: 'Kies eerst een potje.',
    invalidReserveAmount: 'Voer een geldig bedrag in om te reserveren.',
    reserveTooHigh: 'Je kunt maximaal reserveren:',
    removeSavingGoal: 'Spaardoel verwijderen',
    removeSavingGoalConfirm: 'Weet je zeker dat je dit spaardoel wilt verwijderen?',
    goalActivity: 'Doelactiviteit',
    totalReserved: 'Totaal gereserveerd',
    noGoalActivity: 'Nog geen stortingen of opnames.',
    fromSource: 'vanaf',
    withdrawFromGoal: 'Opnemen van doel',
    withdrawAmount: 'Op te nemen bedrag',
    withdrawTooHigh: 'Je kunt maximaal opnemen:',
    noReservedAmounts: 'Nog niets gereserveerd voor dit doel.',
    savingsTrend: 'Trend',
    tapToExpand: 'Tik om te vergroten',
    savingsTrendTitle: 'Spaartrend',
    trendRange1D: '1D',
    trendRange1W: '1W',
    trendRange1M: '1M',
    trendRange1Y: '1Y',
    trendSubtitle1D: 'Totaalsaldo van de afgelopen 24 uur',
    trendSubtitle1W: 'Dagelijks totaalsaldo van de afgelopen 7 dagen',
    trendSubtitle1M: 'Dagelijks totaalsaldo van de afgelopen 30 dagen',
    trendSubtitle1Y: 'Maandelijks totaalsaldo van de afgelopen 12 maanden',
    close: 'Sluiten',
    connect: 'Rekening koppelen',
    connectedWallets: 'Gekoppelde bankrekeningen',
    manualAccounts: 'Handmatig toegevoegde accounts',
    readOnly: 'Alleen-lezen',
    lastSynced: 'Laatst gesynchroniseerd',
    lastSyncFailed: 'Laatste synchronisatie mislukt',
    refresh: 'Vernieuwen',
    noConnectedWallets: 'Nog geen gekoppelde bankrekeningen.',
    walletSyncFailed: 'Bankrekening synchroniseren is mislukt. Probeer opnieuw.',
    invalidTransactionAmount: 'Voer een geldig bedrag groter dan 0 in.',
    transactionFailed: 'Kon deze transactie niet opslaan. Probeer opnieuw.',
    deleteBoxTitle: 'Potje verwijderen',
    deleteBoxConfirm: 'Dit verwijdert dit potje en alle transacties permanent. Dit kan niet ongedaan worden gemaakt.',
    deleteBoxFailed: 'Kon dit potje niet verwijderen. Probeer opnieuw.',
    deleteConnectedTitle: 'Gekoppelde rekening verwijderen',
    deleteConnectedConfirm: 'Deze rekening, opgeslagen saldi en inloggegevens permanent uit Sayver verwijderen? Je tegoed bij de aanbieder blijft ongewijzigd.',
    deleteConnectedFailed: 'Kon deze gekoppelde rekening niet verwijderen. Probeer opnieuw.',
    connectInvestment: 'Beleggingsrekening koppelen',
    externalAccount: 'Externe rekening',
    connectBank: 'Bank koppelen',
    connectCryptoWallet: 'Crypto wallet koppelen',
    cryptoUnavailable: 'Crypto wallet koppelingen komen binnenkort.',
    investmentAccount: 'Beleggingsrekening',
    investmentDetails: 'Details beleggingsrekening',
    noPositions: 'Geen open posities.',
    investments: 'Beleggingen',
    noInvestmentAccounts: 'Nog geen beleggingsrekeningen gekoppeld.',
    chooseBroker: 'Kies een broker',
    comingSoon: 'Binnenkort beschikbaar',
    cash: 'Cash',
    invested: 'Belegd',
    investmentInvalid: 'Opnieuw koppelen vereist \u2014 gegevens verlopen of ingetrokken.',
    readOnlyAccountTitle: 'Alleen-lezenrekening',
    readOnlyAccountMessage: 'Deze gekoppelde rekening is alleen-lezen en kan niet worden gewijzigd in deze app.',
    permissionNeeded: 'Toestemming nodig',
    photoPermission: 'Geef toegang tot foto’s om een profielfoto te kiezen.',
    profilePictureError: 'Profielfoto kiezen is mislukt.',
    error: 'Fout',
    todo: 'Nog niet beschikbaar',
    renameWalletUnavailable: 'Gekoppelde bankrekeningen hernoemen is nog niet beschikbaar.',
    rearrangeWalletUnavailable: 'Gekoppelde bankrekeningen ordenen is nog niet beschikbaar.',
    deleteWalletUnavailable: 'Gekoppelde bankrekeningen verwijderen is nog niet beschikbaar.',
    bankAccount: 'Bankrekening',
    cryptoAccounts: 'Crypto-accounts',
    noCryptoAccounts: 'Nog geen cryptowallets gekoppeld.',
    cryptoWallet: 'wallet',
    cryptoExchangeAccount: 'Coinbase-account',
    cryptoSelfCustody: 'Eigen wallet',
    cryptoTokens: (count) => `${count} ${count === 1 ? 'token' : 'tokens'}`,
    cryptoUnpriced: (count) => `${count} zonder prijs`,
    cryptoValueUnavailable: 'Waarde niet beschikbaar',
    copyAddress: 'Adres kopiëren',
    cryptoSyncFailed: 'Laatste synchronisatie mislukt',
    connectCryptoWallet: 'Cryptowallet koppelen',
    cryptoUnavailable: 'Cryptowallets koppelen is binnenkort mogelijk.',
    chooseGoalImage: 'Doelafbeelding kiezen',
    chooseGoalImageOptional: 'Doelafbeelding kiezen (optioneel)',
    changeGoalImage: 'Doelafbeelding wijzigen',
    goalImagePermission: 'Geef toegang tot foto\'s om een doelafbeelding te kiezen.',
    goalImageFailed: 'De doelafbeelding kon niet worden bijgewerkt. Probeer het opnieuw.',
    deleteGoalImage: 'Afbeelding verwijderen',
  },
};

function roundToCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getPortfolioHoldingColor(index, holdingCount) {
  const stops = SAYVER_PORTFOLIO_GREEN_STOPS;
  const progress = holdingCount <= 1 ? 0.55 : index / (holdingCount - 1);
  const scaledProgress = progress * (stops.length - 1);
  const startIndex = Math.min(stops.length - 2, Math.floor(scaledProgress));
  const localProgress = scaledProgress - startIndex;
  const start = stops[startIndex].slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16));
  const end = stops[startIndex + 1].slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16));
  const channels = start.map((channel, channelIndex) => (
    Math.round(channel + ((end[channelIndex] - channel) * localProgress))
  ));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function formatAmountInputValue(value) {
  const rounded = roundToCents(Number(value) || 0);
  if (rounded <= 0) return '';
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function parseAmountInput(value) {
  if (typeof value !== 'string') return Number.NaN;
  const cleaned = value.replace(/\s+/g, '');
  if (!cleaned) return Number.NaN;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    return parseFloat(cleaned.replace(/,/g, ''));
  }

  if (hasComma) {
    return parseFloat(cleaned.replace(',', '.'));
  }

  return parseFloat(cleaned);
}

function normalizeDateToUnit(date, unit) {
  const normalized = new Date(date);
  if (unit === 'hour') {
    normalized.setMinutes(0, 0, 0);
    return normalized;
  }
  if (unit === 'month') {
    normalized.setDate(1);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function addUnits(date, unit, amount) {
  const result = new Date(date);
  if (unit === 'hour') {
    result.setHours(result.getHours() + amount);
    return result;
  }
  if (unit === 'month') {
    result.setMonth(result.getMonth() + amount);
    return result;
  }
  result.setDate(result.getDate() + amount);
  return result;
}

function formatTrendBucketKey(date, unit) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  if (unit === 'hour') return `${year}-${month}-${day}T${hour}`;
  if (unit === 'month') return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

function formatTrendLabel(date, rangeKey, language = 'en') {
  if (rangeKey === '1D') {
    const hours = `${date.getHours()}`.padStart(2, '0');
    return `${hours}:00`;
  }

  if (rangeKey === '1Y') {
    return date.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-US', { month: 'short' });
  }

  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function buildSavingsTrendSeries(recentTransactions, totalBalance, options = {}) {
  const rangeKey = options.rangeKey || '1W';
  const config = TREND_RANGE_CONFIG[rangeKey] || TREND_RANGE_CONFIG['1W'];
  const totalSlots = Math.max(1, config.totalSlots);
  const safeVisibleSlots = Math.max(1, Math.min(totalSlots, options.visibleUnits || totalSlots));
  const language = options.language || 'en';
  const anchor = normalizeDateToUnit(new Date(), config.unit);

  const buckets = [];
  for (let index = safeVisibleSlots - 1; index >= 0; index -= 1) {
    const bucketDate = addUnits(anchor, config.unit, -index);
    buckets.push({
      key: formatTrendBucketKey(bucketDate, config.unit),
      label: formatTrendLabel(bucketDate, rangeKey, language),
    });
  }

  const deltasByDay = {};
  (recentTransactions || []).forEach((transaction) => {
    const stamp = transaction?.timestamp?.toDate?.();
    if (!stamp) return;

    const key = formatTrendBucketKey(normalizeDateToUnit(stamp, config.unit), config.unit);
    const absoluteAmount = Number(transaction.amount) || 0;
    const signedAmount = transaction.type === 'withdraw' ? -absoluteAmount : absoluteAmount;
    deltasByDay[key] = (deltasByDay[key] || 0) + signedAmount;
  });

  const totalsByDay = {};
  let runningTotal = Number(totalBalance) || 0;

  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    const { key } = buckets[index];
    if (index === buckets.length - 1) {
      totalsByDay[key] = runningTotal;
      continue;
    }

    const nextDayKey = buckets[index + 1].key;
    runningTotal -= deltasByDay[nextDayKey] || 0;
    totalsByDay[key] = runningTotal;
  }

  const presentSeries = buckets.map((day) => ({
    key: day.key,
    label: day.label,
    total: roundToCents(totalsByDay[day.key] || 0),
  }));

  const paddedSeries = [];
  for (let slot = 0; slot < totalSlots - presentSeries.length; slot += 1) {
    paddedSeries.push({
      label: '',
      total: null,
    });
  }
  paddedSeries.push(...presentSeries);

  return paddedSeries;
}

function normalizeSavingsGoalsFromUserData(data = {}) {
  if (Array.isArray(data?.savingsGoals)) {
    return data.savingsGoals
      .map((goal, index) => ({
        id: goal?.id || `goal-${goal?.createdAt || Date.now()}-${index}`,
        name: goal?.name || null,
        imageUri: goal?.imageUri || null,
        targetAmount: Number(goal?.targetAmount) || 0,
        reservations: goal?.reservations || {},
        history: Array.isArray(goal?.history) ? goal.history : [],
        createdAt: goal?.createdAt || Date.now(),
      }))
      .filter((goal) => goal.targetAmount > 0);
  }

  if (data?.savingsGoal?.targetAmount) {
    return [{
      id: data.savingsGoal.id || `goal-${data.savingsGoal.createdAt || Date.now()}-0`,
      name: data.savingsGoal.name || null,
      imageUri: data.savingsGoal.imageUri || null,
      targetAmount: Number(data.savingsGoal.targetAmount) || 0,
      reservations: data.savingsGoal.reservations || {},
      createdAt: data.savingsGoal.createdAt || Date.now(),
    }];
  }

  return [];
}

function getLegacySavingsGoalFromList(goals = []) {
  if (!Array.isArray(goals) || goals.length === 0) return null;
  return goals[0] || null;
}

function SavingsTrendChart({
  series,
  width,
  height = 58,
  expanded = false,
  currency = 'EUR',
  isDark = false,
  balancesHidden = false,
  selectedRange = '1W',
  onSelectRange,
  rangeLabels = {},
  drawToken = 0,
  onHoldStateChange,
}) {
  const [activePointIndex, setActivePointIndex] = useState(null);
  const [isDrawing, setIsDrawing] = useState(true);
  const [isHoldActive, setIsHoldActive] = useState(false);
  const revealProgress = useRef(new Animated.Value(0)).current;
  const holdTimerRef = useRef(null);
  const holdStateChangeRef = useRef(onHoldStateChange);
  const touchStartRef = useRef(null);
  const presentSeries = series.filter((point) => point.total !== null && point.total !== undefined);
  if (presentSeries.length === 0) {
    return null;
  }
  const values = presentSeries.map((point) => point.total);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(1, maxValue - minValue);
  const chartWidth = Math.max(40, width || 40);
  const chartHeight = Math.max(30, height);
  const yAxisWidth = expanded ? 78 : 60;
  const plotWidth = Math.max(40, chartWidth - yAxisWidth);
  const innerPaddingX = expanded ? 12 : 8;
  const innerPaddingY = expanded ? 10 : 8;
  const innerWidth = Math.max(10, plotWidth - innerPaddingX * 2);
  const innerHeight = Math.max(10, chartHeight - innerPaddingY * 2);

  const points = series.map((point, index) => {
    if (point.total === null || point.total === undefined) {
      return null;
    }
    const xRatio = series.length <= 1 ? 0 : index / (series.length - 1);
    const yRatio = (point.total - minValue) / range;
    return {
      key: point.key,
      label: point.label,
      total: point.total,
      x: innerPaddingX + xRatio * innerWidth,
      y: innerPaddingY + (1 - yRatio) * innerHeight,
    };
  });

  const drawablePoints = points.filter(Boolean);
  const buildSmoothPath = (inputPoints) => {
    if (!inputPoints.length) return '';
    if (inputPoints.length === 1) {
      return `M ${inputPoints[0].x} ${inputPoints[0].y}`;
    }

    let d = `M ${inputPoints[0].x} ${inputPoints[0].y}`;
    for (let index = 0; index < inputPoints.length - 1; index += 1) {
      const nextPoint = inputPoints[index + 1];
      d += ` L ${nextPoint.x} ${nextPoint.y}`;
    }

    return d;
  };

  const trendPath = buildSmoothPath(drawablePoints);
  const activePoint = activePointIndex !== null ? drawablePoints[activePointIndex] : null;

  const updateActivePointFromX = (xPosition) => {
    if (!drawablePoints.length) return;
    const clampedX = Math.max(innerPaddingX, Math.min(plotWidth - innerPaddingX, Number(xPosition) || 0));
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    drawablePoints.forEach((point, index) => {
      const distance = Math.abs(point.x - clampedX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActivePointIndex(nearestIndex);
  };

  const clearActivePoint = () => {
    setActivePointIndex(null);
  };

  const tooltipWidth = expanded ? 184 : 154;
  const tooltipLeft = activePoint
    ? Math.max(4, Math.min(plotWidth - tooltipWidth - 4, activePoint.x - (tooltipWidth / 2)))
    : 0;
  const firstLabel = drawablePoints[0]?.label || '';
  const lastLabel = drawablePoints[drawablePoints.length - 1]?.label || '';
  const middleLabel = drawablePoints[Math.floor(drawablePoints.length / 2)]?.label || '';
  const yAxisTicks = [maxValue, minValue + (range * 0.5), minValue];
  const guideRatios = [0, 0.5, 1];
  const trendPathLength = useMemo(() => {
    if (drawablePoints.length < 2) {
      return 0;
    }

    let totalLength = 0;
    for (let index = 1; index < drawablePoints.length; index += 1) {
      const previousPoint = drawablePoints[index - 1];
      const currentPoint = drawablePoints[index];
      const dx = currentPoint.x - previousPoint.x;
      const dy = currentPoint.y - previousPoint.y;
      totalLength += Math.hypot(dx, dy);
    }

    return totalLength;
  }, [drawablePoints]);

  const strokeDashoffset = revealProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [trendPathLength, 0],
  });

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  useEffect(() => {
    holdStateChangeRef.current = onHoldStateChange;
  }, [onHoldStateChange]);

  const releaseHold = () => {
    clearHoldTimer();
    touchStartRef.current = null;
    if (isHoldActive) {
      setIsHoldActive(false);
      holdStateChangeRef.current?.(false);
    }
    clearActivePoint();
  };

  useEffect(() => {
    setIsDrawing(true);
    setIsHoldActive(false);
    setActivePointIndex(null);
    clearHoldTimer();
    touchStartRef.current = null;
    holdStateChangeRef.current?.(false);
    revealProgress.stopAnimation();
    revealProgress.setValue(0);
    Animated.timing(revealProgress, {
      toValue: 1,
      duration: 1080,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      setIsDrawing(false);
    });
    return () => {
      clearHoldTimer();
      holdStateChangeRef.current?.(false);
    };
  }, [drawToken, revealProgress]);

  return (
    <View>
      <View style={[styles.trendRangeSelector, expanded && styles.trendRangeSelectorExpanded]}>
        {TREND_RANGE_KEYS.map((rangeKey) => (
          <TouchableOpacity
            key={`range-${rangeKey}`}
            style={[
              styles.trendRangeChip,
              selectedRange === rangeKey && styles.trendRangeChipActive,
            ]}
            onPress={() => onSelectRange?.(rangeKey)}
            activeOpacity={0.85}
          >
            <Text style={[
              styles.trendRangeChipText,
              selectedRange === rangeKey && styles.trendRangeChipTextActive,
            ]}>
              {rangeLabels[rangeKey] || rangeKey}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.trendChartRow}>
        <View style={[styles.trendYAxisContainer, { width: yAxisWidth, height: chartHeight }]}> 
          {!balancesHidden ? yAxisTicks.map((tickValue, index) => {
            const ratio = (tickValue - minValue) / range;
            const y = innerPaddingY + (1 - ratio) * innerHeight;
            return (
              <Text key={`tick-${index}`} style={[styles.trendYAxisLabel, { top: y - 8 }]}> 
                {formatCurrency(tickValue, currency)}
              </Text>
            );
          }) : null}
        </View>
        <View
          style={[styles.trendChartTrack, { width: plotWidth, height: chartHeight }, expanded && styles.trendChartTrackExpanded]}
          onTouchStart={(event) => {
            if (isDrawing) {
              return;
            }

            const { locationX, locationY } = event.nativeEvent;
            touchStartRef.current = { x: locationX, y: locationY };
            clearHoldTimer();
            holdTimerRef.current = setTimeout(() => {
              holdTimerRef.current = null;
              setIsHoldActive(true);
              holdStateChangeRef.current?.(true);
              updateActivePointFromX(locationX);
            }, 500);
          }}
          onTouchMove={(event) => {
            if (isHoldActive) {
              updateActivePointFromX(event.nativeEvent.locationX);
              return;
            }

            const origin = touchStartRef.current;
            if (!origin) {
              return;
            }

            const deltaX = event.nativeEvent.locationX - origin.x;
            const deltaY = event.nativeEvent.locationY - origin.y;
            if (Math.hypot(deltaX, deltaY) > 10) {
              clearHoldTimer();
              touchStartRef.current = null;
            }
          }}
          onTouchEnd={releaseHold}
          onTouchCancel={releaseHold}
          onStartShouldSetResponderCapture={() => isHoldActive && !isDrawing}
          onMoveShouldSetResponderCapture={() => isHoldActive && !isDrawing}
          onStartShouldSetResponder={() => isHoldActive && !isDrawing}
          onMoveShouldSetResponder={() => isHoldActive && !isDrawing}
          onResponderGrant={(event) => {
            updateActivePointFromX(event.nativeEvent.locationX);
          }}
          onResponderMove={(event) => {
            updateActivePointFromX(event.nativeEvent.locationX);
          }}
          onResponderRelease={releaseHold}
          onResponderTerminate={releaseHold}
          onResponderTerminationRequest={() => false}
        >
        {guideRatios.map((ratio, index) => {
          const y = innerPaddingY + ratio * innerHeight;
          return <View key={`guide-${index}`} style={[styles.trendGuideLine, { top: y }]} />;
        })}
        <Svg pointerEvents="none" width={plotWidth} height={chartHeight} style={styles.trendSvgOverlay}>
          {trendPath ? (
            <AnimatedPath
              d={trendPath}
              stroke="#65a30d"
              strokeWidth={3.1}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={trendPathLength > 0 ? `${trendPathLength} ${trendPathLength}` : undefined}
              strokeDashoffset={strokeDashoffset}
            />
          ) : null}
        </Svg>
        {activePoint ? (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.trendCursorLine,
                {
                  left: activePoint.x,
                  top: innerPaddingY,
                  height: innerHeight,
                },
              ]}
            />
            <View pointerEvents="none" style={[styles.trendDot, { left: activePoint.x, top: activePoint.y }]} />
            <View
              pointerEvents="none"
              style={[
                styles.trendCurrentValueBadge,
                {
                  width: tooltipWidth,
                  left: tooltipLeft,
                  top: Math.max(4, activePoint.y - 34),
                  backgroundColor: isDark ? 'rgba(15,23,42,0.9)' : 'rgba(240,253,244,0.95)',
                  borderColor: isDark ? 'rgba(148,163,184,0.5)' : 'rgba(101,163,13,0.28)',
                },
              ]}
            >
              <Text style={[styles.trendCurrentValueText, { color: isDark ? '#e2e8f0' : '#3f6212' }]} numberOfLines={1}>
                {balancesHidden
                  ? (activePoint.label || '')
                  : `${activePoint.label ? `${activePoint.label} • ` : ''}${formatCurrency(activePoint.total, currency)}`}
              </Text>
            </View>
          </>
        ) : null}
        </View>
      </View>
      <View style={[styles.trendAxisFooter, { paddingLeft: yAxisWidth }]}> 
        <View style={styles.trendXAxisLabelsRow}>
          <Text style={styles.trendChartMetaLabel}>{firstLabel}</Text>
          <Text style={styles.trendChartMetaLabel}>{middleLabel}</Text>
          <Text style={styles.trendChartMetaLabel}>{lastLabel}</Text>
        </View>
      </View>
    </View>
  );
}

function GoalProgressArc({ progress, isDark = false }) {
  const normalizedProgress = Math.max(0, Math.min(1, progress || 0));
  const filledSegments = Math.round(normalizedProgress * GOAL_ARC_SEGMENTS);
  const emptySegmentColor = isDark ? GOAL_ARC_EMPTY_DARK : GOAL_ARC_EMPTY_LIGHT;

  const getFilledColor = (segmentIndex) => {
    const progressRatio = GOAL_ARC_SEGMENTS <= 1 ? 0 : segmentIndex / (GOAL_ARC_SEGMENTS - 1);
    const startR = parseInt(GOAL_ARC_FILL_START.slice(1, 3), 16);
    const startG = parseInt(GOAL_ARC_FILL_START.slice(3, 5), 16);
    const startB = parseInt(GOAL_ARC_FILL_START.slice(5, 7), 16);
    const endR = parseInt(GOAL_ARC_FILL_END.slice(1, 3), 16);
    const endG = parseInt(GOAL_ARC_FILL_END.slice(3, 5), 16);
    const endB = parseInt(GOAL_ARC_FILL_END.slice(5, 7), 16);
    const red = Math.round(startR + ((endR - startR) * progressRatio));
    const green = Math.round(startG + ((endG - startG) * progressRatio));
    const blue = Math.round(startB + ((endB - startB) * progressRatio));
    return `rgb(${red}, ${green}, ${blue})`;
  };

  return (
    <View style={styles.goalArcWrap}>
      {Array.from({ length: GOAL_ARC_SEGMENTS }).map((_, index) => {
        const angle = GOAL_ARC_START_DEG + ((GOAL_ARC_SPAN_DEG / (GOAL_ARC_SEGMENTS - 1)) * index);
        const radians = (angle * Math.PI) / 180;
        const radius = 39;
        const x = 44 + (radius * Math.cos(radians));
        const y = 44 + (radius * Math.sin(radians));
        const isFilled = index < filledSegments;
        return (
          <View
            key={`goal-segment-${index}`}
            style={[
              styles.goalArcSegment,
              {
                left: x,
                top: y,
                backgroundColor: isFilled ? getFilledColor(index) : emptySegmentColor,
                transform: [{ rotate: `${angle + 90}deg` }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function getAccountColor(account) {
  if (account?.color) return account.color;
  return DEFAULT_ACCOUNT_COLORS[account?.type] || DEFAULT_ACCOUNT_COLORS.Savings;
}

function fadeHexColor(hex, amount = 0.25) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return hex;
  const normalized = hex.length === 4
    ? hex.slice(1).split('').map((ch) => ch + ch).join('')
    : hex.slice(1);
  const num = parseInt(normalized, 16);
  const r = Math.round(((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * amount);
  const g = Math.round(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * amount);
  const b = Math.round((num & 0xff) + (255 - (num & 0xff)) * amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hexToRgba(hex, alpha = 1) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) {
    return `rgba(255,255,255,${alpha})`;
  }
  const normalized = hex.length === 4
    ? hex.slice(1).split('').map((ch) => ch + ch).join('')
    : hex.slice(1);
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function HomeScreen({ navigation, setPagerSwipeEnabled }) {
  const { width: windowWidth } = useWindowDimensions();
  const listRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const refreshHoldAnim = useRef(new Animated.Value(0)).current;
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('EUR');
  const [theme, setTheme] = useState('light');
  const [language, setLanguage] = useState('en');
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [activeGoalId, setActiveGoalId] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [transactionType, setTransactionType] = useState('deposit');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionLabel, setTransactionLabel] = useState('');
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [transactionEditModalVisible, setTransactionEditModalVisible] = useState(false);
  const [transactionEdit, setTransactionEdit] = useState(null);
  const [transactionEditLabel, setTransactionEditLabel] = useState('');
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [renameTargetAccount, setRenameTargetAccount] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isRefreshSettling, setIsRefreshSettling] = useState(false);
  const [actionMenuState, setActionMenuState] = useState(null);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [reserveModalVisible, setReserveModalVisible] = useState(false);
  const [goalNameInput, setGoalNameInput] = useState('');
  const [goalAmountInput, setGoalAmountInput] = useState('');
  const [goalImageInputUri, setGoalImageInputUri] = useState('');
  const [reserveAccountId, setReserveAccountId] = useState('');
  const [reserveAmountInput, setReserveAmountInput] = useState('');
  const [goalActivityModalVisible, setGoalActivityModalVisible] = useState(false);
  const [goalWithdrawModalVisible, setGoalWithdrawModalVisible] = useState(false);
  const [goalActivityGoalId, setGoalActivityGoalId] = useState(null);
  const [goalWithdrawAccountId, setGoalWithdrawAccountId] = useState('');
  const [goalWithdrawAmountInput, setGoalWithdrawAmountInput] = useState('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [rearrangeMode, setRearrangeMode] = useState(false);
  const [isListDragging, setIsListDragging] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [trendDrawToken, setTrendDrawToken] = useState(0);
  const [isTrendGraphLocked, setIsTrendGraphLocked] = useState(false);
  const [balancesHidden, setBalancesHidden] = useState(false);
  const [trendChartCardWidth, setTrendChartCardWidth] = useState(0);
  const [trendRange, setTrendRange] = useState('1W');
  const [transactionSubmitting, setTransactionSubmitting] = useState(false);
  const [connectedWallets, setConnectedWallets] = useState([]);
  const [convertedWalletBalances, setConvertedWalletBalances] = useState({});
  const [investmentAccounts, setInvestmentAccounts] = useState([]);
  const [cryptoAccounts, setCryptoAccounts] = useState([]);
  const [convertedInvestmentBalances, setConvertedInvestmentBalances] = useState({});
  const [cryptoAccountValues, setCryptoAccountValues] = useState({});
  const migratedImageUrisRef = useRef(new Set());
  const [brokerModalVisible, setBrokerModalVisible] = useState(false);
  const [externalAccountModalVisible, setExternalAccountModalVisible] = useState(false);
  const [investmentDetailsAccount, setInvestmentDetailsAccount] = useState(null);
  const [syncingWalletId, setSyncingWalletId] = useState(null);
  const [sharedAccounts, setSharedAccounts] = useState([]);
  const wiggleAnim = useRef(new Animated.Value(0)).current;
  const coinSpinAnim = useRef(new Animated.Value(0)).current;
  const coinOpacityAnim = useRef(new Animated.Value(0)).current;
  const coinSpinLoopRef = useRef(null);
  const accountsRef = useRef([]);
  const syncInFlightRef = useRef(false);
  const walletsRef = useRef([]);
  const walletSyncInFlightRef = useRef(false);
  const dragTargetIndexRef = useRef(-1);

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  useEffect(() => {
    walletsRef.current = connectedWallets;
  }, [connectedWallets]);

  useEffect(() => {
    if (!user?.uid) {
      setSharedAccounts([]);
      return undefined;
    }

    const unsubscribeSharedAccounts = subscribeToSharedAccounts(user.uid, (nextSharedAccounts) => {
      setSharedAccounts(nextSharedAccounts || []);
    });

    return () => {
      if (unsubscribeSharedAccounts) unsubscribeSharedAccounts();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setInvestmentAccounts([]);
      return undefined;
    }

    const unsubscribeInvestmentAccounts = subscribeToInvestmentAccounts(user.uid, (accounts) => {
      setInvestmentAccounts(accounts || []);
    });

    return () => {
      if (unsubscribeInvestmentAccounts) unsubscribeInvestmentAccounts();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setCryptoAccounts([]);
      return undefined;
    }
    const unsubscribe = subscribeToCryptoAccounts(user.uid, (accounts) => {
      setCryptoAccounts(accounts || []);
    });
    return () => unsubscribe?.();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let cancelled = false;
    syncCryptoWallets().catch(() => {
      if (!cancelled) console.warn('Crypto wallet sync on app open failed.');
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;

    const syncWalletConversions = async () => {
      if (!Array.isArray(connectedWallets) || connectedWallets.length === 0) {
        if (!cancelled) {
          setConvertedWalletBalances({});
        }
        return;
      }

      const entries = await Promise.all(
        connectedWallets.map(async (wallet) => {
          const nativeAmount = Number(wallet?.totalBalance) || 0;
          const nativeCurrency = wallet?.currency || currency;

          try {
            const convertedAmount = await convertCurrencyAmount(nativeAmount, nativeCurrency, currency);
            return [wallet.id, convertedAmount];
          } catch (error) {
            console.warn(`Unable to convert wallet ${wallet?.id || 'unknown'} to ${currency}:`, error?.message || error);
            return [wallet.id, nativeCurrency === currency ? nativeAmount : 0];
          }
        })
      );

      if (!cancelled) {
        setConvertedWalletBalances(Object.fromEntries(entries));
      }
    };

    syncWalletConversions();

    return () => {
      cancelled = true;
    };
  }, [connectedWallets, currency]);

  useEffect(() => {
    let cancelled = false;

    const syncInvestmentConversions = async () => {
      if (!Array.isArray(investmentAccounts) || investmentAccounts.length === 0) {
        if (!cancelled) {
          setConvertedInvestmentBalances({});
        }
        return;
      }

      const entries = await Promise.all(
        investmentAccounts.map(async (account) => {
          const nativeAmount = Number(account?.totalValue) || 0;
          const nativeCurrency = account?.currency || currency;

          try {
            const convertedAmount = await convertCurrencyAmount(nativeAmount, nativeCurrency, currency);
            return [account.id, convertedAmount];
          } catch (error) {
            console.warn(`Unable to convert investment account ${account?.id || 'unknown'} to ${currency}:`, error?.message || error);
            return [account.id, nativeCurrency === currency ? nativeAmount : 0];
          }
        })
      );

      if (!cancelled) {
        setConvertedInvestmentBalances(Object.fromEntries(entries));
      }
    };

    syncInvestmentConversions();

    return () => {
      cancelled = true;
    };
  }, [investmentAccounts, currency]);

  useEffect(() => {
    let cancelled = false;

    const valueCryptoAccounts = async () => {
      if (!Array.isArray(cryptoAccounts) || cryptoAccounts.length === 0) {
        if (!cancelled) setCryptoAccountValues({});
        return;
      }

      const entries = await Promise.all(cryptoAccounts.map(async (account) => {
        try {
          const valuation = await valueCryptoAccountUsd(account);
          // formatCurrency expects EUR-based amounts, so normalize USD values to EUR first.
          const totalEur = valuation.pricedCount > 0
            ? await convertCurrencyAmount(valuation.totalUsd, 'USD', 'EUR')
            : null;
          return [account.id, { ...valuation, totalEur }];
        } catch (error) {
          console.warn(`Unable to value crypto account ${account?.id || 'unknown'}:`, error?.message || error);
          return [account.id, null];
        }
      }));

      if (!cancelled) setCryptoAccountValues(Object.fromEntries(entries));
    };

    valueCryptoAccounts();

    return () => {
      cancelled = true;
    };
  }, [cryptoAccounts]);

  useEffect(() => {
    if (!rearrangeMode) {
      wiggleAnim.stopAnimation();
      wiggleAnim.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [rearrangeMode, wiggleAnim]);

  useEffect(() => {
    let unsubscribeAccounts = null;
    let unsubscribeUser = null;
    let unsubscribeRecent = null;
    let unsubscribeWallets = null;
    const auth = getAuth();

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setAccounts([]);
        setRecentTransactions([]);
        setConnectedWallets([]);
        setSharedAccounts([]);
        setSavingsGoals([]);
        setActiveGoalId(null);
        setLoading(false);
        return;
      }

      ensureUserDocument(currentUser)
        .then(async () => {
          purgeLegacyCryptoCredentials().catch(() => {
            console.warn('Could not migrate legacy crypto account security settings.');
          });
          await processDueRecurringTransactions(currentUser.uid).catch((error) => {
            console.warn('Could not process recurring transactions:', error);
          });

          unsubscribeUser = subscribeToUserDocument(currentUser.uid, (docSnapshot) => {
            const data = docSnapshot.data();
            setCurrency(data?.currencyPreference || 'EUR');
            setTheme(data?.themePreference || 'light');
            setLanguage(data?.languagePreference === 'nl' ? 'nl' : 'en');
            const normalizedGoals = normalizeSavingsGoalsFromUserData(data || {});
            setSavingsGoals(normalizedGoals);
            setActiveGoalId((previousGoalId) => {
              if (previousGoalId && normalizedGoals.some((goal) => goal.id === previousGoalId)) {
                return previousGoalId;
              }
              return normalizedGoals[0]?.id || null;
            });
            const storedPhotoUrl = data?.photoURL || currentUser.photoURL || '';
            setProfilePhotoUrl(storedPhotoUrl);
            if (isLocalImageUri(storedPhotoUrl)) {
              const migrationKey = `profile:${currentUser.uid}:${storedPhotoUrl}`;
              if (!migratedImageUrisRef.current.has(migrationKey)) {
                migratedImageUrisRef.current.add(migrationKey);
                uploadLocalImageIfNeeded(currentUser.uid, storedPhotoUrl, 'profile-photos')
                  .then(async (downloadUrl) => {
                    if (getAuth().currentUser?.uid !== currentUser.uid) return;
                    await updateProfile(currentUser, { photoURL: downloadUrl });
                    await updateDoc(doc(getFirestoreDb(), 'users', currentUser.uid), { photoURL: downloadUrl });
                    setProfilePhotoUrl((current) => current === storedPhotoUrl ? downloadUrl : current);
                  })
                  .catch(() => console.warn('Could not restore the saved profile photo.'));
              }
            }

            const localGoalImages = normalizedGoals.filter((goal) => isLocalImageUri(goal.imageUri));
            if (localGoalImages.length > 0) {
              const migrationKey = `goals:${currentUser.uid}:${localGoalImages.map((goal) => `${goal.id}:${goal.imageUri}`).join('|')}`;
              if (!migratedImageUrisRef.current.has(migrationKey)) {
                migratedImageUrisRef.current.add(migrationKey);
                Promise.all(localGoalImages.map(async (goal) => [
                  goal.id,
                  goal.imageUri,
                  await uploadLocalImageIfNeeded(currentUser.uid, goal.imageUri, 'savings-goals'),
                ]))
                  .then(async (migrations) => {
                    if (getAuth().currentUser?.uid !== currentUser.uid) return;
                    const replacements = new Map(migrations.map(([id, oldUri, url]) => [id, { oldUri, url }]));
                    const userRef = doc(getFirestoreDb(), 'users', currentUser.uid);
                    await runTransaction(getFirestoreDb(), async (transaction) => {
                      const latestSnapshot = await transaction.get(userRef);
                      if (!latestSnapshot.exists()) return;
                      const latestGoals = normalizeSavingsGoalsFromUserData(latestSnapshot.data() || {});
                      let changed = false;
                      const migratedGoals = latestGoals.map((goal) => {
                        const replacement = replacements.get(goal.id);
                        if (!replacement || goal.imageUri !== replacement.oldUri) return goal;
                        changed = true;
                        return { ...goal, imageUri: replacement.url };
                      });
                      if (changed) {
                        transaction.update(userRef, {
                          savingsGoals: migratedGoals,
                          savingsGoal: getLegacySavingsGoalFromList(migratedGoals),
                        });
                      }
                    });
                  })
                  .catch(() => console.warn('Could not restore one or more saved goal images.'));
              }
            }
          });

          unsubscribeAccounts = subscribeToAccounts(currentUser.uid, (accountList) => {
            setAccounts(accountList);
            setLoading(false);
          });

          unsubscribeRecent = subscribeToRecentTransactions(currentUser.uid, (transactions) => {
            setRecentTransactions(transactions);
          });

          unsubscribeWallets = subscribeToConnectedWallets(currentUser.uid, (wallets) => {
            setConnectedWallets(wallets);
          });
        })
        .catch((error) => {
          console.warn('Unable to initialize user document:', error);
          setLoading(false);
        });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeAccounts) unsubscribeAccounts();
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeRecent) unsubscribeRecent();
      if (unsubscribeWallets) unsubscribeWallets();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setRefreshing(false);
      setIsRefreshSettling(false);
      setPullDistance(0);
      refreshHoldAnim.stopAnimation();
      refreshHoldAnim.setValue(0);
      coinSpinAnim.stopAnimation();
      coinSpinAnim.setValue(0);
      coinOpacityAnim.stopAnimation();
      coinOpacityAnim.setValue(0);
      if (coinSpinLoopRef.current) {
        coinSpinLoopRef.current.stop();
        coinSpinLoopRef.current = null;
      }

      return () => {
        coinSpinAnim.stopAnimation();
      };
    }, [coinOpacityAnim, coinSpinAnim, refreshHoldAnim])
  );

  const refreshHome = async () => {
    if (!user || refreshing || isRefreshSettling) return;
    setRefreshing(true);
    setIsRefreshSettling(false);
    Animated.timing(refreshHoldAnim, {
      toValue: REFRESH_HOLD_OFFSET,
      duration: 140,
      useNativeDriver: true,
    }).start();

    const minHoldPromise = new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      const [accountsResult, recentResult, investmentResult, cryptoResult] = await Promise.allSettled([
        getAccountsOnce(user.uid),
        getRecentTransactionsOnce(user.uid),
        syncInvestmentAccounts(),
        syncCryptoWallets(),
      ]);
      const latestAccounts = accountsResult.status === 'fulfilled' ? accountsResult.value : accountsRef.current || [];
      if (accountsResult.status === 'rejected') {
        console.warn('Account refresh failed:', accountsResult.reason?.message || accountsResult.reason);
      }
      if (recentResult.status === 'rejected') {
        console.warn('Recent activity refresh failed:', recentResult.reason?.message || recentResult.reason);
      }
      if (investmentResult.status === 'rejected') {
        console.warn('Investment sync failed:', investmentResult.reason?.message || investmentResult.reason);
      } else if (investmentResult.value?.success === false || investmentResult.value?.failedCount > 0) {
        console.warn('Investment sync reported failed accounts:', investmentResult.value?.failedCount || 0);
      }
      if (cryptoResult.status === 'rejected') {
        console.warn('Crypto wallet sync failed.');
      } else if (cryptoResult.value?.success === false || cryptoResult.value?.failedCount > 0) {
        console.warn('Crypto wallet sync reported failed accounts:', cryptoResult.value?.failedCount || 0);
      }
      await syncReadOnlyLinkedAccounts(user.uid, latestAccounts.filter((account) => (
        String(account?.type || '').toLowerCase() !== 'crypto'
      )));
      await syncAllConnectedWallets(user.uid, walletsRef.current || []);
      if (accountsResult.status === 'fulfilled') setAccounts(latestAccounts);
      if (recentResult.status === 'fulfilled') setRecentTransactions(recentResult.value);
    } catch (error) {
      console.warn('Refresh failed:', error);
    }

    await minHoldPromise;
    setRefreshing(false);
    setPullDistance(0);
    setIsRefreshSettling(true);
    setTrendDrawToken((token) => token + 1);

    await new Promise((resolve) => {
      Animated.parallel([
        Animated.timing(refreshHoldAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(coinOpacityAnim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start(() => resolve());
    });

    if (coinSpinLoopRef.current) {
      coinSpinLoopRef.current.stop();
      coinSpinLoopRef.current = null;
    }
    coinSpinAnim.stopAnimation();
    coinSpinAnim.setValue(0);
    coinOpacityAnim.setValue(0);
    setIsRefreshSettling(false);
  };

  const handleUndoPress = () => {
    if (undoStack.length === 0 || !user) return;
    Alert.alert(
      'Undo transaction',
      'Are you sure you want to undo the last transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Undo', style: 'destructive', onPress: handleUndo },
      ]
    );
  };

  const persistAccountOrder = async (nextAccounts) => {
    if (!user) return;
    console.log('[reorder][debug] persist start', {
      accountOrder: nextAccounts.map((account, index) => ({ id: account.id, order: index })),
    });
    await Promise.all(nextAccounts.map((account, index) => updateAccountOrder(user.uid, account.id, index)));
    console.log('[reorder][debug] persist complete', {
      accountOrder: nextAccounts.map((account, index) => ({ id: account.id, order: index })),
    });
  };

  const enterRearrangeMode = () => {
    console.log('[reorder][debug] entering rearrange mode');
    setRearrangeMode(true);
  };

  const exitRearrangeMode = () => {
    console.log('[reorder][debug] exiting rearrange mode');
    setRearrangeMode(false);
    setIsListDragging(false);
    dragTargetIndexRef.current = -1;
  };

  const manualAccountsTotal = accounts.reduce((sum, account) => sum + (account.balance || 0), 0);
  const connectedWalletsTotal = connectedWallets.reduce(
    (sum, wallet) => sum + (convertedWalletBalances[wallet.id] || 0),
    0
  );
  const investmentAccountsTotal = investmentAccounts.reduce(
    (sum, account) => sum + (convertedInvestmentBalances[account.id] || 0),
    0
  );
  const totalBalance = manualAccountsTotal + connectedWalletsTotal + investmentAccountsTotal;
  const isDark = theme === 'dark';
  const visibleGoalColumns = Math.max(1, Math.min(2, savingsGoals.length || 1));
  const shouldScrollGoalCarousel = savingsGoals.length >= 3;
  const showInlineAddGoalButton = savingsGoals.length >= 3;
  const showFixedAddGoalButton = !showInlineAddGoalButton;
  const setHomePagerSwipeEnabled = useCallback((enabled) => {
    if (typeof setPagerSwipeEnabled === 'function') {
      setPagerSwipeEnabled(enabled);
    }
  }, [setPagerSwipeEnabled]);
  const fixedGoalActionSpace = showFixedAddGoalButton
    ? GOAL_SIDE_ADD_BUTTON_WIDTH + GOAL_SIDE_ADD_BUTTON_GAP
    : 0;
  const inlineAddPeekSpace = showInlineAddGoalButton ? GOAL_INLINE_ADD_PEEK_WIDTH : 0;
  const inlineAddCardGapSpace = showInlineAddGoalButton ? GOAL_INLINE_ADD_CARD_GAP : 0;
  const goalRowInset = showInlineAddGoalButton
    ? SCREEN_CONTENT_HORIZONTAL_INSET
    : SCREEN_CONTENT_HORIZONTAL_INSET * 2;
  const goalRowWidth = Math.max(200, windowWidth - goalRowInset - fixedGoalActionSpace - inlineAddPeekSpace - inlineAddCardGapSpace);
  const goalCarouselData = showInlineAddGoalButton
    ? [...savingsGoals, { id: 'add-goal-action', isAddGoalAction: true }]
    : savingsGoals;
  const goalCardWidth = Math.max(
    108,
    Math.floor(((shouldScrollGoalCarousel
      ? Math.max(200, windowWidth - (SCREEN_CONTENT_HORIZONTAL_INSET * 2) - GOAL_SIDE_ADD_BUTTON_WIDTH - GOAL_SIDE_ADD_BUTTON_GAP)
      : goalRowWidth) - (GOAL_CARD_GAP * (visibleGoalColumns - 1))) / visibleGoalColumns)
  );
  const homeGradientColors = isDark
    ? APP_BACKGROUND_GRADIENT.dark
    : APP_BACKGROUND_GRADIENT.light;
  const strings = HOME_TRANSLATIONS[language] || HOME_TRANSLATIONS.en;
  const userName = user?.displayName || user?.email?.split('@')[0] || 'Sayver';
  const overlayGradient = ['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)'];
  const dashboardCardOpacity = 1;
  const imageSource = Image.resolveAssetSource(DASHBOARD_MOUNTAIN_IMAGE);
  const sourceWidth = imageSource?.width || 650;
  const sourceHeight = imageSource?.height || 1650;
  const imageScale = sourceWidth > 0 ? windowWidth / sourceWidth : 1;
  const scaledImageHeight = sourceHeight * imageScale;
  const maxSourceStartY = Math.max(0, sourceHeight - (HERO_SCENE_HEIGHT / imageScale));
  const heroSourceStartY = Math.max(0, Math.min(HERO_SOURCE_START_Y, maxSourceStartY));
  const maxPullReveal = Math.max(0, heroSourceStartY * imageScale);
  const sharedImageLayerTop = -maxPullReveal;
  const sharedImageLayerHeight = maxPullReveal + HERO_SCENE_HEIGHT + 2;
  const pullIndicatorTranslateY = refreshing
    ? 0
    : Math.max(0, 18 - (pullDistance * 0.35));
  const coinSymbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€';
  const coinRotation = coinSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    return () => {
      setHomePagerSwipeEnabled(true);
    };
  }, [setHomePagerSwipeEnabled]);
  const refreshTriggerDistance = 74;
  const accountCount = accounts.length;
  const activeSavingsGoal = useMemo(() => {
    if (savingsGoals.length === 0) return null;
    return savingsGoals.find((goal) => goal.id === activeGoalId) || savingsGoals[0];
  }, [activeGoalId, savingsGoals]);
  const goalReservations = activeSavingsGoal?.reservations || {};
  const reservedTotal = Object.values(goalReservations).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
  const goalTargetAmount = activeSavingsGoal?.targetAmount || 0;
  const goalProgress = goalTargetAmount > 0 ? Math.max(0, Math.min(1, reservedTotal / goalTargetAmount)) : 0;
  const goalReached = goalTargetAmount > 0 && reservedTotal >= goalTargetAmount;
  const currencySymbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€';
  const reserveSourceItems = [
    ...accounts.map((account) => ({
      id: account.id,
      name: account.name,
      balance: Number(account.balance) || 0,
      sourceType: 'account',
    })),
    ...connectedWallets.map((wallet) => ({
      id: wallet.id,
      name: wallet.accountDisplayName || wallet.nickname || 'Bank account',
      balance: Number(convertedWalletBalances[wallet.id]) || Number(wallet.totalBalance) || 0,
      sourceType: 'wallet',
      bankName: wallet.bankName || null,
    })),
  ];
  const selectedReserveAccount = reserveSourceItems.find((account) => account.id === reserveAccountId) || null;
  const selectedReserveAccountAvailability = selectedReserveAccount
    ? getAccountAvailabilityBreakdown(selectedReserveAccount, savingsGoals, sharedAccounts)
    : null;
  const reserveMaxAmount = selectedReserveAccountAvailability?.available || 0;
  const reserveAmountAccessoryId = 'home-reserve-amount-accessory';
  const reserveSliderValue = (() => {
    const parsedValue = parseAmountInput(reserveAmountInput);
    if (Number.isNaN(parsedValue) || parsedValue <= 0) return 0;
    return Math.min(parsedValue, reserveMaxAmount);
  })();
  const goalActivityGoal = goalActivityGoalId
    ? savingsGoals.find((goal) => goal.id === goalActivityGoalId) || null
    : null;
  const goalActivityEntries = goalActivityGoal
    ? [...(goalActivityGoal.history || [])].sort((a, b) => (Number(b?.at) || 0) - (Number(a?.at) || 0))
    : [];
  const goalActivityReservedTotal = goalActivityGoal
    ? Object.values(goalActivityGoal.reservations || {}).reduce((sum, amount) => sum + (Number(amount) || 0), 0)
    : 0;
  const goalWithdrawSources = goalActivityGoal
    ? Object.entries(goalActivityGoal.reservations || {})
        .filter(([, amount]) => (Number(amount) || 0) > 0)
        .map(([sourceId, amount]) => ({
          id: sourceId,
          name: reserveSourceItems.find((source) => source.id === sourceId)?.name || strings.account,
          reserved: Number(amount) || 0,
        }))
    : [];
  const goalWithdrawMaxAmount = Number(goalWithdrawSources.find((source) => source.id === goalWithdrawAccountId)?.reserved) || 0;
  const goalWithdrawAmountAccessoryId = 'home-goal-withdraw-amount-accessory';
  const goalWithdrawSliderValue = (() => {
    const parsedValue = parseAmountInput(goalWithdrawAmountInput);
    if (Number.isNaN(parsedValue) || parsedValue <= 0) return 0;
    return Math.min(parsedValue, goalWithdrawMaxAmount);
  })();

  useEffect(() => {
    const shouldLockTabNavigation = !!actionMenuState || goalModalVisible || reserveModalVisible || goalActivityModalVisible || goalWithdrawModalVisible;
    setHomePagerSwipeEnabled(!shouldLockTabNavigation);
  }, [actionMenuState, goalModalVisible, reserveModalVisible, goalActivityModalVisible, goalWithdrawModalVisible, setHomePagerSwipeEnabled]);

  const persistSavingsGoals = async (nextGoals) => {
    if (!user) return;
    const db = getFirestoreDb();
    await updateDoc(doc(db, 'users', user.uid), {
      savingsGoals: nextGoals,
      savingsGoal: getLegacySavingsGoalFromList(nextGoals),
    });
  };

  const firstAccountCreatedAt = useMemo(() => {
    const accountTimestamps = (accounts || [])
      .map((account) => account?.createdAt?.toDate?.())
      .filter(Boolean)
      .map((date) => {
        const normalized = new Date(date);
        normalized.setHours(0, 0, 0, 0);
        return normalized;
      });

    if (accountTimestamps.length === 0) {
      return null;
    }

    return accountTimestamps.reduce((earliest, current) => (current < earliest ? current : earliest));
  }, [accounts]);

  const trendRangeConfig = TREND_RANGE_CONFIG[trendRange] || TREND_RANGE_CONFIG['1W'];
  const trendRangeLabels = useMemo(() => ({
    '1D': strings.trendRange1D || '1D',
    '1W': strings.trendRange1W || '1W',
    '1M': strings.trendRange1M || '1M',
    '1Y': strings.trendRange1Y || '1Y',
  }), [strings]);

  const trendSubtitleByRange = useMemo(() => ({
    '1D': strings.trendSubtitle1D,
    '1W': strings.trendSubtitle1W,
    '1M': strings.trendSubtitle1M,
    '1Y': strings.trendSubtitle1Y,
  }), [strings]);

  const visibleTrendUnits = useMemo(() => {
    if (!firstAccountCreatedAt) {
      return trendRangeConfig.totalSlots;
    }

    const now = normalizeDateToUnit(new Date(), trendRangeConfig.unit);
    const first = normalizeDateToUnit(firstAccountCreatedAt, trendRangeConfig.unit);
    let diffUnits = 0;

    if (trendRangeConfig.unit === 'hour') {
      diffUnits = Math.floor(Math.max(0, now.getTime() - first.getTime()) / (1000 * 60 * 60));
    } else if (trendRangeConfig.unit === 'month') {
      diffUnits = ((now.getFullYear() - first.getFullYear()) * 12) + (now.getMonth() - first.getMonth());
    } else {
      diffUnits = Math.floor(Math.max(0, now.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
    }

    return Math.max(1, Math.min(trendRangeConfig.totalSlots, diffUnits + 1));
  }, [firstAccountCreatedAt, trendRangeConfig.totalSlots, trendRangeConfig.unit]);

  const savingsTrendSeries = useMemo(
    () => buildSavingsTrendSeries(recentTransactions, totalBalance, {
      rangeKey: trendRange,
      visibleUnits: visibleTrendUnits,
      language,
    }),
    [recentTransactions, totalBalance, trendRange, visibleTrendUnits, language]
  );

  useEffect(() => {
    const shouldPreviewPull = pullDistance > 8 && !isRefreshSettling;
    const shouldShowCoin = refreshing || shouldPreviewPull || isRefreshSettling;

    if (shouldShowCoin) {
      if (!coinSpinLoopRef.current) {
        coinSpinLoopRef.current = Animated.loop(
          Animated.timing(coinSpinAnim, {
            toValue: 1,
            duration: 850,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        );
        coinSpinLoopRef.current.start();
      }

      if (isRefreshSettling) {
        return;
      }

      if (refreshing) {
        Animated.timing(coinOpacityAnim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }).start();
      } else {
        const revealOpacity = Math.max(0, Math.min(1, (pullDistance - 8) / 22));
        coinOpacityAnim.setValue(revealOpacity);
      }

      return;
    }

    coinOpacityAnim.setValue(0);
    if (coinSpinLoopRef.current) {
      coinSpinLoopRef.current.stop();
      coinSpinLoopRef.current = null;
    }
    coinSpinAnim.stopAnimation();
    coinSpinAnim.setValue(0);
  }, [coinOpacityAnim, coinSpinAnim, isRefreshSettling, pullDistance, refreshing]);
  const sharedImageScrollOffset = scrollY.interpolate({
    inputRange: [0, HERO_SCENE_HEIGHT + 240],
    outputRange: [0, -(HERO_SCENE_HEIGHT + 240)],
    extrapolate: 'clamp',
  });

  const handleEndDragRefreshCheck = () => {
    if (!refreshing && pullDistance >= refreshTriggerDistance) {
      refreshHome();
    }
  };

  const openGoalModal = () => {
    setGoalNameInput('');
    setGoalAmountInput('');
    setGoalImageInputUri('');
    setGoalModalVisible(true);
  };

  const closeGoalModal = () => {
    setGoalModalVisible(false);
    setGoalNameInput('');
    setGoalAmountInput('');
    setGoalImageInputUri('');
  };

  const selectGoalImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(strings.permissionNeeded, strings.goalImagePermission);
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    return result.canceled ? null : result.assets?.[0]?.uri || null;
  };

  const handlePickGoalImageForCreate = async () => {
    try {
      const selectedUri = await selectGoalImage();
      if (selectedUri) setGoalImageInputUri(selectedUri);
    } catch (error) {
      console.warn('Unable to upload savings goal image:', error?.code || error?.message || error);
      Alert.alert(strings.error, error?.message || strings.goalImageFailed);
    }
  };

  const handlePickGoalImage = async (goalId) => {
    if (!user || !goalId) return;
    try {
      const selectedUri = await selectGoalImage();
      if (!selectedUri) return;
      const imageUrl = await uploadLocalImageIfNeeded(user.uid, selectedUri, 'savings-goals');
      const nextGoals = savingsGoals.map((goal) => (
        goal.id === goalId ? { ...goal, imageUri: imageUrl } : goal
      ));
      await persistSavingsGoals(nextGoals);
      setSavingsGoals(nextGoals);
    } catch (error) {
      console.warn('Savings goal image upload failed:', error?.code || error?.message || error);
      Alert.alert(strings.error, error?.message || strings.goalImageFailed);
    }
  };

  const openReserveModal = (goalId) => {
    const selectedGoal = savingsGoals.find((goal) => goal.id === goalId) || activeSavingsGoal;
    if (!selectedGoal?.targetAmount) return;
    if (reserveSourceItems.length === 0) {
      Alert.alert(strings.reserveForGoal, strings.noAccountsAvailable);
      return;
    }
    setActiveGoalId(selectedGoal.id);
    setReserveAccountId(reserveSourceItems[0]?.id || '');
    setReserveAmountInput('');
    setReserveModalVisible(true);
  };

  const closeReserveModal = () => {
    setReserveModalVisible(false);
    setReserveAmountInput('');
  };

  const openGoalActivityModal = (goalId) => {
    const selectedGoal = savingsGoals.find((goal) => goal.id === goalId);
    if (!selectedGoal) return;
    setActiveGoalId(selectedGoal.id);
    setGoalActivityGoalId(selectedGoal.id);
    const firstReservedSource = Object.entries(selectedGoal.reservations || {})
      .find(([, amount]) => (Number(amount) || 0) > 0);
    setGoalWithdrawAccountId(firstReservedSource?.[0] || '');
    setGoalWithdrawAmountInput('');
    setGoalActivityModalVisible(true);
  };

  const closeGoalActivityModal = () => {
    setGoalActivityModalVisible(false);
    setGoalActivityGoalId(null);
    setGoalWithdrawAccountId('');
    setGoalWithdrawAmountInput('');
  };

  const openGoalWithdrawModal = () => {
    if (!goalActivityGoal) return;
    const firstReservedSource = Object.entries(goalActivityGoal.reservations || {})
      .find(([, amount]) => (Number(amount) || 0) > 0);
    if (!firstReservedSource) {
      Alert.alert(strings.withdrawFromGoal, strings.noReservedAmounts);
      return;
    }
    setGoalWithdrawAccountId(firstReservedSource[0]);
    setGoalWithdrawAmountInput('');
    setGoalActivityModalVisible(false);
    setGoalWithdrawModalVisible(true);
  };

  const closeGoalWithdrawModal = () => {
    setGoalWithdrawModalVisible(false);
    setGoalActivityGoalId(null);
    setGoalWithdrawAccountId('');
    setGoalWithdrawAmountInput('');
  };

  const handleWithdrawGoalReservation = async () => {
    if (!user || !goalActivityGoal) return;
    if (!goalWithdrawAccountId) {
      Alert.alert(strings.withdrawFromGoal, strings.noBoxSelected);
      return;
    }

    const parsedAmount = parseAmountInput(goalWithdrawAmountInput);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(strings.withdrawFromGoal, strings.invalidReserveAmount);
      return;
    }

    if (parsedAmount > goalWithdrawMaxAmount) {
      Alert.alert(strings.withdrawFromGoal, `${strings.withdrawTooHigh} ${formatCurrency(goalWithdrawMaxAmount, currency)}`);
      return;
    }

    const nextReservations = { ...(goalActivityGoal.reservations || {}) };
    const nextValue = roundToCents(goalWithdrawMaxAmount - parsedAmount);
    if (nextValue <= 0) {
      delete nextReservations[goalWithdrawAccountId];
    } else {
      nextReservations[goalWithdrawAccountId] = nextValue;
    }

    const historyEntry = {
      id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'withdraw',
      amount: roundToCents(goalWithdrawMaxAmount - nextValue),
      sourceId: goalWithdrawAccountId,
      sourceName: reserveSourceItems.find((source) => source.id === goalWithdrawAccountId)?.name || null,
      userId: user?.uid || null,
      userName: user?.displayName || user?.email || null,
      at: Date.now(),
    };

    const nextGoals = savingsGoals.map((goal) => {
      if (goal.id !== goalActivityGoal.id) return goal;
      return {
        ...goal,
        reservations: nextReservations,
        history: [...(Array.isArray(goal.history) ? goal.history : []), historyEntry],
      };
    });

    setSavingsGoals(nextGoals);
    setGoalWithdrawAmountInput('');
    try {
      await persistSavingsGoals(nextGoals);
      closeGoalWithdrawModal();
    } catch (error) {
      console.warn('Unable to withdraw from goal:', error);
    }
  };

  const handleCreateSavingsGoal = async () => {
    if (!user) return;
    const parsedTargetAmount = parseFloat(goalAmountInput.replace(',', '.'));
    if (Number.isNaN(parsedTargetAmount) || parsedTargetAmount <= 0) {
      return;
    }

    const trimmedName = goalNameInput.trim();
    try {
      const imageUrl = await uploadLocalImageIfNeeded(user.uid, goalImageInputUri, 'savings-goals');
      const nextGoal = {
        id: `goal-${Date.now()}`,
        name: trimmedName || null,
        imageUri: imageUrl,
        targetAmount: parsedTargetAmount,
        reservations: {},
        createdAt: Date.now(),
      };
      const nextGoals = [...savingsGoals, nextGoal];
      setSavingsGoals(nextGoals);
      setActiveGoalId(nextGoal.id);
      await persistSavingsGoals(nextGoals);
      closeGoalModal();
    } catch (error) {
      console.warn('Savings goal image upload failed:', error?.code || error?.message || error);
      Alert.alert(strings.error, error?.message || strings.goalImageFailed);
    }
  };

  const handleAddGoalReservation = async () => {
    if (!user || !activeSavingsGoal?.targetAmount) return;
    if (!reserveAccountId) {
      Alert.alert(strings.reserveForGoal, strings.noBoxSelected);
      return;
    }

    const parsedReserveAmount = parseFloat(reserveAmountInput.replace(',', '.'));
    if (Number.isNaN(parsedReserveAmount) || parsedReserveAmount <= 0) {
      Alert.alert(strings.reserveForGoal, strings.invalidReserveAmount);
      return;
    }

    const selectedReserveAccount = reserveSourceItems.find((source) => source.id === reserveAccountId);
    if (!selectedReserveAccount) return;

    const alreadyReservedForAccount = Number(goalReservations[reserveAccountId]) || 0;
    const maxReservable = getAccountAvailabilityBreakdown(selectedReserveAccount, savingsGoals, sharedAccounts).available;
    if (roundToCents(parsedReserveAmount) > roundToCents(maxReservable)) {
      Alert.alert(strings.reserveForGoal, `${strings.reserveTooHigh} ${formatCurrency(maxReservable, currency)}`);
      return;
    }

    const nextReservations = {
      ...goalReservations,
      [reserveAccountId]: roundToCents(alreadyReservedForAccount + parsedReserveAmount),
    };
    const historyEntry = {
      id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'add',
      amount: roundToCents(parsedReserveAmount),
      sourceId: reserveAccountId,
      sourceName: selectedReserveAccount?.name || null,
      userId: user?.uid || null,
      userName: user?.displayName || user?.email || null,
      at: Date.now(),
    };
    const nextGoals = savingsGoals.map((goal) => {
      if (goal.id !== activeSavingsGoal.id) return goal;
      return {
        ...goal,
        reservations: nextReservations,
        history: [...(Array.isArray(goal.history) ? goal.history : []), historyEntry],
      };
    });

    setSavingsGoals(nextGoals);
    try {
      await persistSavingsGoals(nextGoals);
      closeReserveModal();
    } catch (error) {
      console.warn('Unable to reserve money for goal:', error);
    }
  };

  const handleRemoveSavingsGoal = async (goalId) => {
    if (!user || !goalId) return;
    Alert.alert(
      strings.removeSavingGoal,
      strings.removeSavingGoalConfirm,
      [
        { text: strings.cancel, style: 'cancel' },
        {
          text: strings.removeSavingGoal,
          style: 'destructive',
          onPress: async () => {
            try {
              const nextGoals = savingsGoals.filter((goal) => goal.id !== goalId);
              setSavingsGoals(nextGoals);
              if (activeGoalId === goalId) {
                setActiveGoalId(nextGoals[0]?.id || null);
              }
              await persistSavingsGoals(nextGoals);
              closeReserveModal();
            } catch (error) {
              console.warn('Unable to remove savings goal:', error);
            }
          },
        },
      ]
    );
  };

  const handleGoalDangerPress = (goal) => {
    if (!goal.imageUri) {
      handleRemoveSavingsGoal(goal.id);
      return;
    }
    Alert.alert(strings.untitledGoal, undefined, [
      { text: strings.cancel, style: 'cancel' },
      {
        text: strings.deleteGoalImage,
        style: 'destructive',
        onPress: async () => {
          try {
            const nextGoals = savingsGoals.map((item) => (
              item.id === goal.id ? { ...item, imageUri: null } : item
            ));
            await persistSavingsGoals(nextGoals);
            setSavingsGoals(nextGoals);
          } catch (error) {
            Alert.alert(strings.error, strings.goalImageFailed);
          }
        },
      },
      { text: strings.removeSavingGoal, style: 'destructive', onPress: () => handleRemoveSavingsGoal(goal.id) },
    ]);
  };

  const openTransactionModal = (account, type) => {
    if (account?.readOnlyConfig?.enabled) {
      Alert.alert(strings.readOnlyAccountTitle, strings.readOnlyAccountMessage);
      return;
    }

    setSelectedAccount(account);
    setTransactionType(type);
    setTransactionAmount('');
    setTransactionLabel('');
    setModalVisible(true);
  };

  const closeModal = () => {
    setTransactionSubmitting(false);
    setModalVisible(false);
    setSelectedAccount(null);
    setTransactionAmount('');
    setTransactionLabel('');
  };

  const openTransactionEditModal = (transaction) => {
    setTransactionEdit(transaction);
    setTransactionEditLabel(transaction.label || transaction.type || '');
    setTransactionEditModalVisible(true);
  };

  const closeTransactionEditModal = () => {
    setTransactionEditModalVisible(false);
    setTransactionEdit(null);
    setTransactionEditLabel('');
  };

  const handleSaveTransactionLabel = async () => {
    if (!transactionEdit || !user) return;
    try {
      await updateTransactionLabel(user.uid, transactionEdit.accountId, transactionEdit.id, transactionEditLabel.trim() || null);
      closeTransactionEditModal();
    } catch (error) {
      console.warn('Unable to update transaction name:', error);
    }
  };

  const handleReorderAccount = async (account, direction) => {
    if (!user || !account) return;
    const currentIndex = accounts.findIndex((item) => item.id === account.id);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= accounts.length) return;

    const targetAccount = accounts[targetIndex];
    const currentOrder = account.order || Date.now();
    const targetOrder = targetAccount.order || Date.now();

    try {
      await updateAccountOrder(user.uid, account.id, targetOrder);
      await updateAccountOrder(user.uid, targetAccount.id, currentOrder);
    } catch (error) {
      console.warn('Unable to reorder account:', error);
    }
  };

  const handleConfirmTransaction = async () => {
    if (transactionSubmitting) return;
    if (!selectedAccount || !user) return;
    if (selectedAccount?.readOnlyConfig?.enabled) {
      Alert.alert(strings.readOnlyAccountTitle, strings.readOnlyAccountMessage);
      closeModal();
      return;
    }

    const parsedValue = parseAmountInput(transactionAmount);
    if (Number.isNaN(parsedValue) || parsedValue <= 0) {
      Alert.alert(strings.addFunds, strings.invalidTransactionAmount);
      return;
    }

    const amount = transactionType === 'deposit' ? parsedValue : -parsedValue;
    const previousBalance = selectedAccount.balance || 0;

    try {
      setTransactionSubmitting(true);
      const result = await adjustAccountBalance(
        user.uid,
        selectedAccount.id,
        amount,
        transactionType,
        transactionLabel || null
      );

      const newUndoEntry = {
        transactionId: result.transactionId,
        accountId: selectedAccount.id,
        previousBalance,
        transactionData: {
          amount: Math.abs(amount),
          type: transactionType,
          label: transactionLabel || null,
          accountName: selectedAccount.name || null,
          accountType: selectedAccount.type || null,
          accountColor: selectedAccount.color || null,
          userId: user.uid,
        },
        resultingBalance: previousBalance + amount,
      };
      setUndoStack((stack) => [newUndoEntry, ...stack].slice(0, 5));
      setRedoStack([]);
      closeModal();
    } catch (error) {
      console.warn('Transaction failed:', error);
      Alert.alert(strings.addFunds, error?.message || strings.transactionFailed);
      setTransactionSubmitting(false);
    }
  };

  const handleDeleteAccount = async (account) => {
    if (!user || !account?.id) return;

    try {
      await deleteAccount(user.uid, account.id);

      if (savingsGoals.length > 0) {
        const nextGoals = savingsGoals.map((goal) => {
          const nextReservations = { ...(goal.reservations || {}) };
          if (Object.prototype.hasOwnProperty.call(nextReservations, account.id)) {
            delete nextReservations[account.id];
          }
          return { ...goal, reservations: nextReservations };
        });
        setSavingsGoals(nextGoals);
        await persistSavingsGoals(nextGoals);
      }

      setUndoStack((stack) => stack.filter((entry) => entry.accountId !== account.id));
      setRedoStack((stack) => stack.filter((entry) => entry.accountId !== account.id));
    } catch (error) {
      console.warn('Delete account failed:', error);
      Alert.alert(strings.deleteBoxTitle, strings.deleteBoxFailed);
    }
  };

  const openActionModal = (account) => {
    setActionMenuState({
      type: 'manual',
      account,
      title: account?.name || strings.accountActions,
      items: [
        { id: 'details', label: strings.openDetails },
        { id: 'deposit', label: strings.deposit },
        { id: 'withdraw', label: strings.withdraw },
        { id: 'rearrange', label: strings.rearrangeAccounts },
        { id: 'rename', label: strings.rename },
        { id: 'archive', label: strings.archive },
        { id: 'delete', label: strings.deleteBox, destructive: true },
      ],
    });
  };

  const closeActionModal = () => {
    setActionMenuState(null);
  };

  const handleActionChoice = async (choice, account) => {
    if (!account || !user) {
      closeActionModal();
      return;
    }

    const isReadOnlyLinked = !!account?.readOnlyConfig?.enabled;
    closeActionModal();

    switch (choice) {
      case 'details':
        navigation.navigate('AccountDetails', { account, userId: user?.uid, currency });
        break;
      case 'deposit':
        if (isReadOnlyLinked) {
          Alert.alert(strings.readOnlyAccountTitle, strings.readOnlyAccountMessage);
          break;
        }
        openTransactionModal(account, 'deposit');
        break;
      case 'withdraw':
        if (isReadOnlyLinked) {
          Alert.alert(strings.readOnlyAccountTitle, strings.readOnlyAccountMessage);
          break;
        }
        openTransactionModal(account, 'withdraw');
        break;
      case 'rearrange':
        enterRearrangeMode();
        break;
      case 'rename':
        setRenameTargetAccount(account);
        setRenameText(account.name || '');
        setRenameModalVisible(true);
        break;
      case 'archive':
        await archiveAccount(user.uid, account.id).catch((error) => console.warn('Archive failed:', error));
        break;
      case 'delete':
        Alert.alert(
          strings.deleteBoxTitle,
          strings.deleteBoxConfirm,
          [
            { text: strings.cancel, style: 'cancel' },
            {
              text: strings.deleteBox,
              style: 'destructive',
              onPress: () => {
                handleDeleteAccount(account);
              },
            },
          ]
        );
        break;
      default:
        break;
    }
  };

  const handleAccountLongPress = (account) => {
    if (!account || rearrangeMode) return;
    openActionModal(account);
  };

  const handleRenameAccount = async () => {
    if (!renameTargetAccount || !user) return;
    if (!renameText.trim()) return;

    try {
      await renameAccount(user.uid, renameTargetAccount.id, renameText.trim());
      setRenameModalVisible(false);
      setRenameTargetAccount(null);
      setRenameText('');
    } catch (error) {
      console.warn('Rename failed:', error);
    }
  };

  const handleUndo = async () => {
    if (undoStack.length === 0 || !user) return;

    const [latestAction, ...remaining] = undoStack;
    try {
      await deleteAccountTransaction(
        user.uid,
        latestAction.accountId,
        latestAction.transactionId,
        latestAction.previousBalance
      );
      setUndoStack(remaining);
      setRedoStack((stack) => [latestAction, ...stack].slice(0, 5));
    } catch (error) {
      console.warn('Undo failed:', error);
    }
  };

  const handleRedo = async () => {
    if (redoStack.length === 0 || !user) return;

    const [latestAction, ...remaining] = redoStack;
    try {
      const signedAmount = latestAction.transactionData.type === 'withdraw'
        ? -latestAction.transactionData.amount
        : latestAction.transactionData.amount;
      const redoPreviousBalance = latestAction.resultingBalance - signedAmount;
      const result = await recreateAccountTransaction(
        user.uid,
        latestAction.accountId,
        latestAction.transactionData,
        latestAction.resultingBalance
      );

      setUndoStack((stack) => [
        {
          ...latestAction,
          transactionId: result.transactionId,
          previousBalance: redoPreviousBalance,
        },
        ...stack,
      ].slice(0, 5));
      setRedoStack(remaining);
    } catch (error) {
      console.warn('Redo failed:', error);
    }
  };

  const handlePickProfilePicture = async () => {
    if (!user) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(strings.permissionNeeded, strings.photoPermission);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.length) return;

      const nextPhotoURL = await uploadLocalImageIfNeeded(user.uid, result.assets[0].uri, 'profile-photos');
      setProfilePhotoUrl(nextPhotoURL);

      await updateProfile(user, {
        displayName: user.displayName || null,
        photoURL: nextPhotoURL,
      });
      const db = getFirestoreDb();
      await updateDoc(doc(db, 'users', user.uid), { photoURL: nextPhotoURL });
    } catch (error) {
      Alert.alert(strings.error, error.message || strings.profilePictureError);
    }
  };

  const formatLastSynced = (value) => {
    if (!value?.toDate) {
      return language === 'nl' ? 'Nooit' : 'Never';
    }
    return value.toDate().toLocaleString(language === 'nl' ? 'nl-NL' : 'en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatConnectedAccountSubtitle = (wallet) => {
    const bankName = (wallet?.bankName || '').trim();
    const identifier = (wallet?.accountIdentifier || '').trim();
    if (bankName && identifier) {
      return `${bankName} • ${identifier}`;
    }
    if (bankName) {
      return bankName;
    }
    if (identifier) {
      return identifier;
    }
    return strings.bankAccount;
  };

  const handleRefreshConnectedWallet = async (wallet) => {
    if (!user?.uid || !wallet?.id) {
      return;
    }

    setSyncingWalletId(wallet.id);
    try {
      await syncConnectedWalletBalance(user.uid, wallet);
    } catch (error) {
      Alert.alert(strings.connectedWallets, strings.walletSyncFailed);
    } finally {
      setSyncingWalletId(null);
    }
  };

  const handleConnectedWalletMenuAction = (action, wallet) => {
    switch (action) {
      case 'details':
        navigation.navigate('ConnectedAccounts');
        break;
      case 'rename':
        Alert.alert(strings.todo, strings.renameWalletUnavailable);
        break;
      case 'rearrange':
        Alert.alert(strings.todo, strings.rearrangeWalletUnavailable);
        break;
      case 'delete':
        Alert.alert(strings.todo, strings.deleteWalletUnavailable);
        break;
      default:
        break;
    }
  };

  const showConnectedWalletMenu = (wallet, type = 'wallet') => {
    setActionMenuState({
      type,
      wallet,
      title: strings.accountActions,
      items: [
        { id: 'details', label: 'Open details' },
        { id: 'rename', label: 'Rename account' },
        { id: 'rearrange', label: 'Rearrange accounts' },
        { id: 'delete', label: 'Delete account', destructive: true },
      ],
    });
  };

  const handleActionMenuSelect = async (choice) => {
    const currentMenu = actionMenuState;
    if (!currentMenu) {
      closeActionModal();
      return;
    }

    closeActionModal();

    if (currentMenu.type === 'manual') {
      await handleActionChoice(choice, currentMenu.account);
      return;
    }

    if (choice === 'details' && currentMenu.type === 'investment') {
      setInvestmentDetailsAccount(currentMenu.wallet);
      return;
    }
    if (choice === 'details' && currentMenu.type === 'crypto') {
      navigation.navigate('CryptoAccountDetails', { accountId: currentMenu.wallet.id, language });
      return;
    }

    if (choice === 'delete' && ['investment', 'crypto'].includes(currentMenu.type)) {
      const account = currentMenu.wallet;
      if (!user?.uid || !account?.id) return;
      Alert.alert(strings.deleteConnectedTitle, strings.deleteConnectedConfirm, [
        { text: strings.cancel, style: 'cancel' },
        {
          text: strings.deleteBox,
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteConnectedAccount(currentMenu.type, account.id);
              if (currentMenu.type === 'investment') setInvestmentDetailsAccount(null);
            } catch (_error) {
              Alert.alert(strings.deleteConnectedTitle, strings.deleteConnectedFailed);
            }
          },
        },
      ]);
      return;
    }

    handleConnectedWalletMenuAction(choice, currentMenu.wallet);
  };

  const BROKER_LABELS = { trading212: 'Trading 212' };

  const renderInvestmentAccountCard = (account) => {
    const convertedTotal = convertedInvestmentBalances[account.id];
    const brokerLabel = BROKER_LABELS[account.broker] || account.broker;
    const isInvalid = account.status === 'invalid';
    const lastSyncFailed = account.lastSyncFailed === true
      || isInvalid
      || (typeof account.lastSyncError === 'string'
        && !account.lastSyncError.startsWith('Portfolio permissions unavailable; balance '));

    return (
      <Animated.View key={account.id} style={styles.cardWrapper}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => setInvestmentDetailsAccount(account)}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: '#080d12',
                borderColor: 'rgba(0,167,225,0.38)',
                shadowColor: '#00A7E1',
                shadowOpacity: 0.13,
                shadowOffset: { width: 0, height: 8 },
                shadowRadius: 18,
                elevation: 4,
              },
            ]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0.02)', 'rgba(0,167,225,0.19)']}
              start={[0, 0]}
              end={[1, 1]}
              style={styles.investmentCardBrandTint}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,167,225,0.25)', '#00A7E1', 'rgba(0,167,225,0.35)']}
              start={[0, 0]}
              end={[1, 0]}
              style={styles.investmentCardBlueEdge}
            />
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel, styles.investmentCardAccentText, { flex: 1, paddingRight: 12, fontSize: 16, fontWeight: '800', textTransform: 'none', letterSpacing: 0 }]} numberOfLines={1}>{brokerLabel}</Text>
              <CardMenuButton
                onPress={() => showConnectedWalletMenu(account, 'investment')}
                iconColor="#62ccef"
                accessibilityLabel={strings.accountActions}
              />
            </View>
            <Text style={[styles.cardName, styles.investmentCardMutedText, { fontSize: 12, fontWeight: '600', letterSpacing: 0 }]}>{strings.investmentAccount}</Text>
            <View style={styles.investmentBalanceRow}>
              <Text
                style={[styles.cardBalance, styles.investmentCardText, styles.investmentBalanceValue]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {balancesHidden
                  ? HIDDEN_BALANCE_TEXT
                  : formatCurrency(typeof convertedTotal === 'number' ? convertedTotal : account.totalValue || 0, currency)}
              </Text>
            </View>
            <Text style={[styles.investmentBreakdownText, styles.investmentCardMutedText]}>
              {strings.cash}: {balancesHidden ? HIDDEN_BALANCE_TEXT : formatCurrency(account.cashBalance || 0, account.currency || currency)} · {strings.invested}: {balancesHidden ? HIDDEN_BALANCE_TEXT : formatCurrency(account.investedValue || 0, account.currency || currency)}
            </Text>
            <Text style={[styles.investmentLastSyncedText, styles.investmentCardAccentText]}>
              {strings.lastSynced}: {formatLastSynced(account.lastSyncedAt)} · {strings.readOnly}
            </Text>
            {isInvalid ? <Text style={styles.investmentInvalidText}>{strings.investmentInvalid}</Text> : null}
            {lastSyncFailed ? (
              <Text style={styles.investmentSyncFailedText}>{strings.lastSyncFailed}</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderCryptoAccountCard = (account) => {
    const address = account.publicAddress || '';
    const abbreviatedAddress = address.length > 15 ? `${address.slice(0, 7)}…${address.slice(-5)}` : address;
    const brandKey = getCryptoBrandKey(account);
    const isCoinbase = brandKey === 'coinbase';
    const isEthereum = brandKey === 'ethereum';
    const isSolana = brandKey === 'solana';
    const isBase = brandKey === 'base';
    const brand = CRYPTO_BRANDS[brandKey];
    const hasCardGradient = isSolana || isBase;
    const CryptoCardSurface = hasCardGradient ? LinearGradient : View;
    const gradientColors = isSolana
      ? ['#9a45fe', '#7376e2', '#49acc1', '#1ee49f']
      : ['#1964fe', '#377aff', '#6093ff', '#c6dafe'];
    const accountTitle = isCoinbase
      ? (account.networkName || brand?.name || account.provider)
      : `${account.networkName || brand?.name || account.network} ${strings.cryptoWallet}`;
    const tokenCount = Array.isArray(account.balances) ? account.balances.length : 0;
    const valuation = cryptoAccountValues[account.id];
    const hasValue = typeof valuation?.totalEur === 'number';
    const unpricedCount = valuation?.unpricedCount || 0;
    const valueText = balancesHidden
      ? HIDDEN_BALANCE_TEXT
      : hasValue
        ? formatCurrency(valuation.totalEur, currency)
        : valuation === undefined
          ? '…'
          : strings.cryptoValueUnavailable;
    const leftText = isCoinbase || isEthereum || isSolana
      ? styles.cryptoCardTextOnBlue
      : isBase ? styles.cryptoCardBaseText : styles.cryptoCardText;
    const leftMuted = isCoinbase || isEthereum || isSolana
      ? styles.cryptoCardMutedOnBlue
      : isBase ? styles.cryptoCardBaseMuted : styles.cryptoCardMuted;
    const valueTextStyle = isCoinbase ? styles.cryptoCardText : leftText;
    const footerMutedStyle = isCoinbase ? styles.cryptoCardMuted : leftMuted;
    const accent = brand?.accent || '#0f5132';
    const openDetails = () => navigation.navigate('CryptoAccountDetails', { accountId: account.id, language });
    const valueRow = (
      <View style={styles.investmentBalanceRow}>
        <Text
          style={[
            styles.cardBalance,
            styles.investmentBalanceValue,
            valueTextStyle,
            !hasValue && !balancesHidden ? styles.cryptoCardValueUnavailable : null,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {valueText}
        </Text>
      </View>
    );
    const footer = (
      <>
        <Text style={[styles.investmentBreakdownText, footerMutedStyle]} numberOfLines={1}>
          {strings.cryptoTokens(tokenCount)}
          {unpricedCount > 0 ? ` · ${strings.cryptoUnpriced(unpricedCount)}` : ''}
        </Text>
        <Text style={[styles.investmentLastSyncedText, footerMutedStyle]} numberOfLines={1}>
          {strings.lastSynced}: {formatLastSynced(account.lastSyncedAt)} · {strings.readOnly}
        </Text>
      </>
    );

    if (isCoinbase) {
      return (
        <Animated.View key={account.id} style={styles.cardWrapper}>
          <TouchableOpacity activeOpacity={0.9} onPress={openDetails}>
            <View style={[styles.card, styles.cryptoCard, styles.coinbaseCard]}>
              <View style={[styles.coinbaseCardHalf, styles.coinbaseCardBlueHalf]}>
                <View style={styles.cryptoCardControls}>
                  <CryptoBrandLogo brand="coinbase" size={30} inverted />
                  <CardMenuButton
                    onPress={() => showConnectedWalletMenu(account, 'crypto')}
                    iconColor="#ffffff"
                    accessibilityLabel={strings.accountActions}
                  />
                </View>
                <Text style={[styles.cardLabel, leftText, styles.cryptoCardTitle, styles.cryptoCardHeader]} numberOfLines={1}>{accountTitle}</Text>
                <Text style={[leftMuted, styles.cryptoCardSubtitle]} numberOfLines={1}>{strings.cryptoExchangeAccount}</Text>
                {account.lastSyncFailed ? <Text style={styles.coinbaseSyncFailedText}>{strings.cryptoSyncFailed}</Text> : null}
              </View>
              <View style={[styles.coinbaseCardHalf, styles.coinbaseCardWhiteHalf]}>
                {valueRow}
                {footer}
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    return (
      <Animated.View key={account.id} style={styles.cardWrapper}>
        <TouchableOpacity activeOpacity={0.9} onPress={openDetails}>
          <CryptoCardSurface
            {...(hasCardGradient ? {
              colors: gradientColors,
              start: [0, 0.5],
              end: [1, 0.5],
            } : {})}
            style={[
              styles.card,
              styles.cryptoCard,
              { backgroundColor: isEthereum ? '#4e8ee9' : hasCardGradient ? 'transparent' : '#ffffff', borderColor: isEthereum || isSolana || isBase ? accent : 'rgba(15,23,42,0.1)', shadowColor: accent },
            ]}
          >
            <View pointerEvents="none" style={[styles.investmentCardBlueEdge, { backgroundColor: accent }]} />
            <View style={styles.cryptoCardControls}>
              <View style={styles.cryptoBrandBadge}>
                <CryptoBrandLogo brand={brandKey} size={30} inverted={isEthereum} />
              </View>
              <CardMenuButton
                onPress={() => showConnectedWalletMenu(account, 'crypto')}
                iconColor={isEthereum || isSolana ? '#ffffff' : '#334155'}
                accessibilityLabel={strings.accountActions}
              />
            </View>
            <View style={[styles.cardHeader, styles.cryptoCardHeader]}>
              <Text style={[styles.cardLabel, leftText, styles.cryptoCardTitle]} numberOfLines={1}>{accountTitle}</Text>
            </View>
            <Text style={[styles.cardName, leftMuted, styles.cryptoCardSubtitle]} numberOfLines={1}>
              {abbreviatedAddress || strings.cryptoSelfCustody}
            </Text>
            {valueRow}
            {footer}
            {account.lastSyncFailed ? <Text style={styles.investmentSyncFailedText}>{strings.cryptoSyncFailed}</Text> : null}
          </CryptoCardSurface>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderConnectedWalletCard = (wallet) => {
    const branding = getBankBranding(wallet.bankName || wallet.accountDisplayName || wallet.nickname || 'Bank');
    const convertedBalance = convertedWalletBalances[wallet.id];
    return (
      <Animated.View key={wallet.id} style={styles.cardWrapper}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => navigation.navigate('ConnectedAccounts')}
          onLongPress={() => showConnectedWalletMenu(wallet)}
          activeOpacity={0.9}
          delayLongPress={250}
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.62)',
                borderColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.16)',
                shadowColor: branding.primaryColor,
                shadowOpacity: 0.08,
                shadowOffset: { width: 0, height: 8 },
                shadowRadius: 18,
                elevation: 4,
              },
            ]}
          >
            <BlurView intensity={22} tint="light" style={styles.cardBlurLayer} pointerEvents="none" />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
              locations={[0, 1]}
              start={[0, 0]}
              end={[0, 1]}
              style={styles.cardGloss}
            />
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel, { color: isDark ? '#f8fafc' : '#0f172a', fontSize: 16, fontWeight: '800', textTransform: 'none', letterSpacing: 0 }]}>{branding.displayName}</Text>
              <CardMenuButton
                onPress={() => handleAccountLongPress(wallet)}
                disabled={false}
                iconColor={isDark ? '#e2e8f0' : '#334155'}
                accessibilityLabel={strings.accountActions}
              />
            </View>
            <Text style={[styles.cardName, { color: isDark ? '#cbd5e1' : '#475569', fontSize: 12, fontWeight: '600', letterSpacing: 0 }]}>{wallet.accountDisplayName || wallet.nickname || 'Bank account'}</Text>
            <Text style={[styles.cardBalance, { color: isDark ? '#f8fafc' : '#0f172a', fontSize: 24, fontWeight: '900', marginBottom: 12 }]}>
              {balancesHidden ? HIDDEN_BALANCE_TEXT : formatCurrency(typeof convertedBalance === 'number' ? convertedBalance : wallet.totalBalance || 0, currency)}
            </Text>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={[styles.cardButton, styles.depositButton]}
                onPress={() => navigation.navigate('ConnectedAccounts')}
              >
                <Text style={styles.cardButtonText}>{strings.details}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    let cancelled = false;
    const runSync = async () => {
      if (cancelled || syncInFlightRef.current || walletSyncInFlightRef.current) {
        return;
      }

      const currentAccounts = accountsRef.current || [];
      const currentWallets = walletsRef.current || [];
      const readOnlyAccounts = currentAccounts.filter((account) => (
        String(account?.type || '').toLowerCase() !== 'crypto'
      ));

      syncInFlightRef.current = true;
      walletSyncInFlightRef.current = true;
      try {
        if (readOnlyAccounts.length > 0) {
          await syncReadOnlyLinkedAccounts(user.uid, readOnlyAccounts);
        }
        if (currentWallets.length > 0) {
          await syncAllConnectedWallets(user.uid, currentWallets);
        }
      } finally {
        syncInFlightRef.current = false;
        walletSyncInFlightRef.current = false;
      }
    };

    runSync();
    const intervalId = setInterval(runSync, 60000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [user]);

  const handleDragBegin = (index) => {
    const draggedAccount = (accountsRef.current || [])[index];
    console.log('[reorder][debug] drag start', {
      accountId: draggedAccount?.id || null,
      startIndex: index,
    });
    setIsListDragging(true);
    dragTargetIndexRef.current = index;
  };

  const handlePlaceholderIndexChange = (index) => {
    if (dragTargetIndexRef.current !== index) {
      console.log('[reorder][debug] target index change', {
        previousTargetIndex: dragTargetIndexRef.current,
        nextTargetIndex: index,
      });
      dragTargetIndexRef.current = index;
    }
  };

  const handleDragEnd = async ({ data, from, to }) => {
    console.log('[reorder][debug] drag end', { from, to });
    setAccounts(data);
    accountsRef.current = data;
    setIsListDragging(false);
    dragTargetIndexRef.current = -1;

    if (from !== to) {
      try {
        await persistAccountOrder(data);
      } catch (error) {
        console.warn('Unable to save new account order:', error);
      }
    }

    setRearrangeMode(false);
  };

  const renderAccount = ({ item, index, drag, isActive }) => {
    const backgroundColor = getAccountColor(item);
    const darkCard = getReadableTextColor(backgroundColor) === '#ffffff';
    const primaryTextColor = darkCard ? '#f8fafc' : '#0f172a';
    const secondaryTextColor = darkCard ? 'rgba(248,250,252,0.82)' : 'rgba(15,23,42,0.78)';
    const accountType = item.type || strings.savings;
    const wiggleRotation = wiggleAnim.interpolate({ inputRange: [0, 1], outputRange: ['-1.2deg', '1.2deg'] });
    const isReadOnlyLinked = !!item?.readOnlyConfig?.enabled;

    return (
      <Animated.View
        style={[
          styles.cardWrapper,
          rearrangeMode && styles.rearrangeItem,
          {
            transform: [
              { rotate: rearrangeMode && !isActive ? wiggleRotation : '0deg' },
              { scale: isActive ? 1.03 : 1 },
            ],
            zIndex: isActive ? 10 : 1,
          },
        ]}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => !rearrangeMode && navigation.navigate('AccountDetails', { account: item, userId: user?.uid, currency })}
          onLongPress={() => {
            if (rearrangeMode) {
              drag();
            } else {
              handleAccountLongPress(item);
            }
          }}
          activeOpacity={0.9}
          delayLongPress={rearrangeMode ? 120 : 250}
          disabled={false}
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: hexToRgba(backgroundColor, 0.85),
                borderColor: 'rgba(255,255,255,0.2)',
                shadowColor: backgroundColor,
              },
            ]}
          >
            <BlurView intensity={22} tint="light" style={styles.cardBlurLayer} pointerEvents="none" />
            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.cardImageBottom} /> : null}
            {item.imageUrl ? (
              <LinearGradient
                pointerEvents="none"
                colors={[hexToRgba(backgroundColor, 0.88), hexToRgba(backgroundColor, 0.36), 'rgba(255,255,255,0)']}
                locations={[0, 0.48, 1]}
                start={[0, 0]}
                end={[0, 1]}
                style={styles.cardImageFade}
              />
            ) : null}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
              locations={[0, 1]}
              start={[0, 0]}
              end={[0, 1]}
              style={styles.cardGloss}
            />
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel, { color: secondaryTextColor }]}>{accountType}</Text>
              <CardMenuButton
                onPress={() => handleAccountLongPress(item)}
                disabled={rearrangeMode}
                iconColor={primaryTextColor}
                accessibilityLabel={strings.accountActions}
              />
            </View>
            <Text style={[styles.cardName, { color: primaryTextColor }]}>{item.name}</Text>
            {balancesHidden ? (
              <Text style={[styles.cardBalance, { color: primaryTextColor }]}>{HIDDEN_BALANCE_TEXT}</Text>
            ) : (
              <Text style={[styles.cardBalance, { color: primaryTextColor }]}>{formatCurrency(item.balance, currency)}</Text>
            )}
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={[styles.cardButton, styles.depositButton, isReadOnlyLinked && styles.cardButtonDisabled]}
                onPress={() => openTransactionModal(item, 'deposit')}
                disabled={isReadOnlyLinked || rearrangeMode}
              >
                <Text style={styles.cardButtonText}>{strings.add}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cardButton, styles.withdrawButton, isReadOnlyLinked && styles.cardButtonDisabled]}
                onPress={() => openTransactionModal(item, 'withdraw')}
                disabled={isReadOnlyLinked || rearrangeMode}
              >
                <Text style={styles.cardButtonText}>{strings.withdraw}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRecentItem = ({ item }) => {
    const accountColor = item.accountColor || getAccountColor({ type: item.accountType, color: item.accountColor });
    const rowBackground = fadeHexColor(accountColor, 0.84);
    const activityTypeLabel = item.type === 'withdraw' ? strings.withdraw : strings.deposit;
    const amountText = item.type === 'withdraw'
      ? `-${formatCurrency(item.amount, currency)}`
      : `+${formatCurrency(item.amount, currency)}`;
    return (
      <TouchableOpacity
        style={[styles.activityRow, { backgroundColor: rowBackground, borderColor: fadeHexColor(accountColor, 0.18) }]}
        onPress={() => openTransactionEditModal(item)}
        activeOpacity={0.85}
      >
        <View style={styles.activityMeta}>
          <Text style={styles.activityAccount}>{item.accountName || strings.account}</Text>
          <Text style={styles.activityType}>{activityTypeLabel}</Text>
          {item.label ? <Text style={styles.activityLabel}>{item.label}</Text> : null}
        </View>
        <View style={styles.activityRight}>
          <Text style={[styles.activityAmount, item.type === 'withdraw' ? styles.activityAmountWithdraw : styles.activityAmountDeposit]}>{amountText}</Text>
          <Text style={styles.activityTime}>{item.timestamp?.toDate?.()?.toLocaleString(language === 'nl' ? 'nl-NL' : 'en-GB') || '...'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const updateListScrollState = useCallback((offsetY) => {
    const rawPullDistance = Math.max(0, -offsetY);
    const clampedPullDistance = Math.min(rawPullDistance, maxPullReveal);
    setPullDistance(clampedPullDistance);
    if (!refreshing && offsetY >= -0.5 && clampedPullDistance <= 0.5) {
      setPullDistance(0);
    }
    if (rawPullDistance > maxPullReveal + 1 && listRef.current) {
      listRef.current.scrollToOffset({ offset: -maxPullReveal, animated: false });
    }
  }, [maxPullReveal, refreshing]);

  const animatedHomeListOnScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (event) => {
        updateListScrollState(event.nativeEvent.contentOffset.y);
      },
    }
  ), [scrollY, updateListScrollState]);

  const handleDraggableListScroll = useCallback((event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    scrollY.setValue(offsetY);
    updateListScrollState(offsetY);
  }, [scrollY, updateListScrollState]);

  const homeListHeader = useMemo(() => (
      <>
        <View style={styles.contentInset}>

          <View style={styles.dashboardInsightCardFullWidth}>
            <View style={styles.insightTopSection}>
              <View style={styles.insightTopRow}>
                <Text style={styles.goalProgressTitle}>{strings.savingsTrend}</Text>
              </View>
              <View
                style={styles.insightTrendCardFull}
                onLayout={(event) => {
                  const cardInnerWidth = event.nativeEvent.layout.width;
                  if (cardInnerWidth > 0 && Math.abs(cardInnerWidth - trendChartCardWidth) > 1) {
                    setTrendChartCardWidth(cardInnerWidth);
                  }
                }}
              >
                <SavingsTrendChart
                  series={savingsTrendSeries}
                  width={Math.max(180, trendChartCardWidth || 180)}
                  height={78}
                  isDark={isDark}
                  currency={currency}
                  balancesHidden={balancesHidden}
                  selectedRange={trendRange}
                  onSelectRange={setTrendRange}
                  rangeLabels={trendRangeLabels}
                  drawToken={trendDrawToken}
                  onHoldStateChange={(active) => {
                    setIsTrendGraphLocked(active);
                    setHomePagerSwipeEnabled(!active);
                  }}
                />
              </View>
            </View>

            <View style={styles.goalsSection}>
              <View style={styles.goalsHeaderRow}>
                <Text style={styles.goalProgressTitle}>{strings.goalProgress}</Text>
              </View>
              <View style={[styles.goalCarouselRow, showInlineAddGoalButton && styles.goalCarouselRowInlineAdd]}>
                <View style={[styles.goalCarouselListWrap, !showFixedAddGoalButton && styles.goalCarouselListWrapFullWidth]}>
                  {savingsGoals.length > 0 ? (
                    <FlatList
                      data={goalCarouselData}
                      keyExtractor={(goal) => goal.id}
                      horizontal
                      scrollEnabled={shouldScrollGoalCarousel}
                      onTouchStart={() => {
                        if (shouldScrollGoalCarousel) {
                          setHomePagerSwipeEnabled(false);
                        }
                      }}
                      onScrollBeginDrag={() => {
                        if (shouldScrollGoalCarousel) {
                          setHomePagerSwipeEnabled(false);
                        }
                      }}
                      onScrollEndDrag={() => {
                        setHomePagerSwipeEnabled(true);
                      }}
                      onMomentumScrollEnd={() => {
                        setHomePagerSwipeEnabled(true);
                      }}
                      onTouchEnd={() => {
                        setHomePagerSwipeEnabled(true);
                      }}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={[
                        styles.goalCarouselContent,
                        !shouldScrollGoalCarousel && styles.goalCarouselContentNoScroll,
                      ]}
                      renderItem={({ item: goal, index }) => {
                        if (goal?.isAddGoalAction) {
                          return (
                            <View style={styles.goalInlineAddItem}>
                              <TouchableOpacity
                                style={styles.goalSideAddButton}
                                onPress={openGoalModal}
                                activeOpacity={0.85}
                                accessibilityLabel={strings.newSavingsGoal}
                              >
                                <Text style={styles.goalSideAddButtonPlus}>+</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        }

                        const itemReservations = goal?.reservations || {};
                        const itemReservedTotal = Object.values(itemReservations).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
                        const itemTargetAmount = Number(goal?.targetAmount) || 0;
                        const itemProgress = itemTargetAmount > 0 ? Math.max(0, Math.min(1, itemReservedTotal / itemTargetAmount)) : 0;
                        const itemReached = itemTargetAmount > 0 && itemReservedTotal >= itemTargetAmount;
                        const isLastGoalCard = index === savingsGoals.length - 1;
                        const itemSpacing = showInlineAddGoalButton
                          ? (isLastGoalCard ? GOAL_INLINE_ADD_CARD_GAP : GOAL_CARD_GAP)
                          : ((shouldScrollGoalCarousel || index < savingsGoals.length - 1) ? GOAL_CARD_GAP : 0);

                        return (
                          <View key={goal.id} style={[styles.goalStackItem, !isDark ? styles.goalStackItemLight : null, { width: goalCardWidth, marginRight: itemSpacing }] }>
                            <TouchableOpacity
                              activeOpacity={0.88}
                              onPress={() => openGoalActivityModal(goal.id)}
                              style={styles.goalProgressContentTouchable}
                            >
                              <TouchableOpacity
                                accessibilityLabel={strings.removeSavingGoal}
                                activeOpacity={0.8}
                                style={styles.goalCardActionButtonDelete}
                                onPress={(event) => {
                                  event?.stopPropagation?.();
                                  handleGoalDangerPress(goal);
                                }}
                              >
                                <Ionicons name="close" size={14} color="#dc2626" />
                              </TouchableOpacity>
                              <View style={styles.goalCardBody}>
                                <View style={styles.goalImageArea}>
                                  {goal.imageUri ? (
                                    <Image pointerEvents="none" source={{ uri: goal.imageUri }} style={styles.goalImageBackground} />
                                  ) : null}
                                  <View style={[styles.goalImageContent, goal.imageUri ? styles.goalImageShade : null]}>
                                    <View style={styles.goalArcActionWrap}>
                                      <GoalProgressArc progress={itemProgress} isDark={goal.imageUri ? true : isDark} />
                                      <TouchableOpacity
                                        accessibilityLabel={strings.addReserve}
                                        activeOpacity={0.8}
                                        style={[styles.goalCardActionButton, styles.goalCardActionButtonAdd]}
                                        onPress={(event) => {
                                          event?.stopPropagation?.();
                                          openReserveModal(goal.id);
                                        }}
                                      >
                                        <Ionicons name="add" size={20} color="#ffffff" />
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                  <TouchableOpacity
                                    accessibilityLabel={goal.imageUri ? strings.changeGoalImage : strings.chooseGoalImage}
                                    style={styles.goalImageCornerButton}
                                    activeOpacity={0.85}
                                    onPress={(event) => {
                                      event?.stopPropagation?.();
                                      handlePickGoalImage(goal.id);
                                    }}
                                  >
                                    <Ionicons name="image-outline" size={13} color="#f8fafc" />
                                  </TouchableOpacity>
                                </View>
                                <Text style={[styles.goalNameText, !isDark ? styles.goalNameTextLight : null]}>{goal.name || strings.untitledGoal}</Text>
                                <Text style={[styles.goalMetaText, !isDark ? styles.goalMetaTextLight : null]}>
                                  {balancesHidden
                                    ? `${HIDDEN_BALANCE_TEXT} / ${HIDDEN_BALANCE_TEXT}`
                                    : `${formatCurrency(itemReservedTotal, currency)} / ${formatCurrency(itemTargetAmount, currency)}`}
                                </Text>
                                <Text style={[styles.goalMetaText, !isDark ? styles.goalMetaTextLight : null]}>
                                  {itemReached
                                    ? strings.goalReached
                                    : `${Math.round(itemProgress * 100)}% ${strings.reachedOfGoal}`}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                        );
                      }}
                    />
                  ) : (
                    <Text style={styles.goalEmptyText}>{strings.noGoalYet}</Text>
                  )}
                </View>
                {showFixedAddGoalButton ? (
                  <TouchableOpacity
                    style={styles.goalSideAddButton}
                    onPress={openGoalModal}
                    activeOpacity={0.85}
                    accessibilityLabel={strings.newSavingsGoal}
                  >
                    <Text style={styles.goalSideAddButtonPlus}>+</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

        </View>

        <View style={styles.primaryActionsRow}>
          <Text style={styles.connectedWalletsActionTitle}>{strings.connectedWallets}</Text>
        </View>

        <View style={styles.connectedWalletsSection}>
          <View style={styles.connectedWalletsActionRow}>
            <TouchableOpacity
              style={[styles.goalActionButtonCompact, styles.connectedWalletsActionButton]}
              onPress={() => setExternalAccountModalVisible(true)}
              activeOpacity={0.85}
              accessibilityLabel={strings.externalAccount}
            >
              <View style={styles.goalActionButtonInline}>
                <Text style={styles.goalActionButtonPlus}>+</Text>
                <Text style={styles.goalActionButtonText}>{strings.externalAccount}</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.historyActionsRow}>
              <TouchableOpacity
                style={[
                  styles.historyIconButton,
                  isDark && styles.historyIconButtonDark,
                  undoStack.length === 0 && styles.toolbarButtonDisabled,
                ]}
                onPress={handleUndoPress}
                disabled={undoStack.length === 0}
                accessibilityLabel={strings.undo}
              >
                <Ionicons
                  name="arrow-undo-outline"
                  size={22}
                  style={styles.historyIconArrow}
                  color={isDark ? '#e2e8f0' : '#334155'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.historyIconButton,
                  isDark && styles.historyIconButtonDark,
                  redoStack.length === 0 && styles.toolbarButtonDisabled,
                ]}
                onPress={handleRedo}
                disabled={redoStack.length === 0}
                accessibilityLabel={strings.redo}
              >
                <Ionicons
                  name="arrow-redo-outline"
                  size={22}
                  style={styles.historyIconArrow}
                  color={isDark ? '#e2e8f0' : '#334155'}
                />
              </TouchableOpacity>
            </View>
          </View>
          {connectedWallets.length > 0 ? (
            connectedWallets.map((wallet) => renderConnectedWalletCard(wallet))
          ) : (
            <Text style={styles.connectedWalletsEmptyText}>{strings.noConnectedWallets}</Text>
          )}
        </View>

        <View style={styles.primaryActionsRow}>
          <Text style={styles.connectedWalletsActionTitle}>{strings.investments}</Text>
        </View>

        <View style={styles.connectedWalletsSection}>
          {investmentAccounts.length > 0 ? (
            investmentAccounts.map((account) => renderInvestmentAccountCard(account))
          ) : (
            <Text style={styles.connectedWalletsEmptyText}>{strings.noInvestmentAccounts}</Text>
          )}
        </View>

        <View style={styles.primaryActionsRow}>
          <Text style={styles.connectedWalletsActionTitle}>{strings.cryptoAccounts}</Text>
        </View>

        <View style={styles.connectedWalletsSection}>
          {cryptoAccounts.length > 0 ? (
            cryptoAccounts.map((account) => renderCryptoAccountCard(account))
          ) : (
            <Text style={styles.connectedWalletsEmptyText}>{strings.noCryptoAccounts}</Text>
          )}
        </View>

        <View style={styles.manualAccountsHeaderWrap}>
          <View style={styles.manualAccountsHeaderDivider} />
          <Text style={styles.goalProgressTitle}>{strings.manualAccounts}</Text>
        </View>

        {rearrangeMode ? (
          <View style={styles.rearrangeBanner}>
            <Text style={styles.rearrangeText}>{strings.dragToReorder}</Text>
            <TouchableOpacity style={styles.rearrangeDoneButton} onPress={exitRearrangeMode}>
              <Text style={styles.rearrangeDoneText}>{strings.done}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </>
    ), [
      balancesHidden,
      connectedWallets,
      cryptoAccounts,
      cryptoAccountValues,
      convertedInvestmentBalances,
      currency,
      goalCarouselData,
      goalCardWidth,
      isDark,
      investmentAccounts,
      recentTransactions,
      rearrangeMode,
      savingsGoals,
      shouldScrollGoalCarousel,
      showFixedAddGoalButton,
      showInlineAddGoalButton,
      strings,
      trendChartCardWidth,
      trendDrawToken,
      trendRange,
      trendRangeLabels,
    ]);

  const homeListFooter = useMemo(() => (
      <View style={styles.activitySection}>
        <Text style={styles.sectionHeading}>{strings.recentActivity}</Text>
        {recentTransactions.length === 0 ? (
          <Text style={styles.emptyText}>{strings.noRecentActivity}</Text>
        ) : (
          <FlatList
            data={recentTransactions}
            keyExtractor={(item) => item.id}
            renderItem={renderRecentItem}
            scrollEnabled={false}
          />
        )}
      </View>
    ), [recentTransactions, strings]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const investmentPositionSegments = (Array.isArray(investmentDetailsAccount?.positions) ? investmentDetailsAccount.positions : [])
    .map((position, index) => ({
      ...position,
      value: Number(position?.currentValue) || 0,
    }))
    .filter((position) => position.value > 0)
    .sort((left, right) => right.value - left.value)
    .map((position, index, positions) => ({
      ...position,
      color: getPortfolioHoldingColor(positions.length - index - 1, positions.length),
    }));
  const investmentPositionsTotal = investmentPositionSegments.reduce((sum, position) => sum + position.value, 0);
  let investmentSegmentOffset = 0;
  const investmentSegments = investmentPositionSegments.map((position) => {
    const segment = {
      ...position,
      percentage: investmentPositionsTotal > 0 ? position.value / investmentPositionsTotal : 0,
      offset: investmentSegmentOffset,
    };
    investmentSegmentOffset += segment.percentage * 2 * Math.PI * 52;
    return segment;
  });

  return (
    <View style={[styles.container, isDark ? styles.containerDark : null]}>
      <LinearGradient
        colors={homeGradientColors}
        locations={APP_BACKGROUND_GRADIENT.locations}
        start={APP_BACKGROUND_GRADIENT.start}
        end={APP_BACKGROUND_GRADIENT.end}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sharedHeroImageLayer,
          {
            top: sharedImageLayerTop,
            height: sharedImageLayerHeight,
            transform: [{ translateY: sharedImageScrollOffset }],
          },
        ]}
      >
        <Image
          source={DASHBOARD_MOUNTAIN_IMAGE}
          resizeMode="stretch"
          style={[
            styles.sharedHeroImage,
            {
              width: windowWidth,
              height: scaledImageHeight,
            },
          ]}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.fixedHeroContainer,
          {
            transform: [{ translateY: sharedImageScrollOffset }],
          },
        ]}
      >
        <LinearGradient pointerEvents="none" colors={overlayGradient} start={[0, 0]} end={[0.75, 1]} style={[styles.heroOverlay, { opacity: dashboardCardOpacity }]} />
        <View pointerEvents="box-none" style={styles.heroContent}>
          <View pointerEvents="box-none" style={styles.heroTopRow}>
            <View pointerEvents="none">
              <Text style={styles.brandTitle}>{userName}</Text>
              <Text style={styles.brandSubtitle}>{strings.brandSubtitle}</Text>
            </View>
            <TouchableOpacity style={styles.connectWalletButton} onPress={() => setExternalAccountModalVisible(true)}>
              <Text style={styles.connectWalletButtonText}>{strings.connect}</Text>
            </TouchableOpacity>
          </View>
          <View pointerEvents="none" style={styles.summaryWidget}>
            <View style={styles.summaryInfo}>
              <Text style={styles.widgetLabel}>{strings.totalBalance}</Text>
              <TouchableOpacity activeOpacity={0.8} onPress={() => setBalancesHidden((current) => !current)}>
                {balancesHidden ? (
                  <Text style={styles.widgetValue}>{HIDDEN_BALANCE_TEXT}</Text>
                ) : (
                  <Text style={styles.widgetValue}>{formatCurrency(totalBalance, currency)}</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.widgetNote}>{strings.acrossAllAccounts}</Text>
            </View>
            <TouchableOpacity style={styles.profileButtonLarge} onPress={handlePickProfilePicture}>
              {profilePhotoUrl ? (
                <Image source={{ uri: profilePhotoUrl }} style={styles.profileImageLarge} />
              ) : (
                <Text style={styles.profileIconLarge}>{(userName || 'S').charAt(0).toUpperCase()}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pullIndicatorContainer,
          {
            opacity: coinOpacityAnim,
            transform: [{ translateY: pullIndicatorTranslateY }],
          },
        ]}
      >
        <Animated.View style={[styles.coinIndicator, { transform: [{ rotate: coinRotation }] }]}>
          <Text style={styles.coinText}>{coinSymbol}</Text>
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.listShell, { transform: [{ translateY: refreshHoldAnim }] }] }>
        {rearrangeMode ? (
          <AnimatedDraggableFlatList
            ref={listRef}
            data={accounts}
            keyExtractor={(item) => item.id}
            renderItem={renderAccount}
            numColumns={1}
            scrollEnabled={!isTrendGraphLocked && !isListDragging}
            activationDistance={2}
            autoscrollThreshold={80}
            autoscrollSpeed={120}
            dragItemOverflow={false}
            onDragBegin={handleDragBegin}
            onPlaceholderIndexChange={handlePlaceholderIndexChange}
            onDragEnd={handleDragEnd}
            onRelease={() => {
              console.log('[reorder][debug] drag release');
            }}
            contentInset={{ top: 0, left: 0, bottom: 0, right: 0 }}
            contentOffset={{ x: 0, y: 0 }}
            onScroll={handleDraggableListScroll}
            onScrollEndDrag={(event) => {
              handleEndDragRefreshCheck();
              if (!refreshing && event.nativeEvent.contentOffset.y >= -0.5) {
                setPullDistance(0);
              }
            }}
            onMomentumScrollEnd={(event) => {
              if (!refreshing && event.nativeEvent.contentOffset.y >= -0.5) {
                setPullDistance(0);
              }
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            style={styles.list}
            ListHeaderComponent={homeListHeader}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>{strings.noVirtualAccounts}</Text>
                <Text style={styles.emptySubtext}>{strings.createAccountToBegin}</Text>
              </View>
            }
            ListFooterComponent={homeListFooter}
          />
        ) : (
          <AnimatedFlatList
            ref={listRef}
            data={accounts}
            keyExtractor={(item) => item.id}
            renderItem={renderAccount}
            numColumns={1}
            scrollEnabled={!isTrendGraphLocked && !isListDragging}
            contentInset={{ top: 0, left: 0, bottom: 0, right: 0 }}
            contentOffset={{ x: 0, y: 0 }}
            onScroll={animatedHomeListOnScroll}
            onScrollEndDrag={(event) => {
              handleEndDragRefreshCheck();
              if (!refreshing && event.nativeEvent.contentOffset.y >= -0.5) {
                setPullDistance(0);
              }
            }}
            onMomentumScrollEnd={(event) => {
              if (!refreshing && event.nativeEvent.contentOffset.y >= -0.5) {
                setPullDistance(0);
              }
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            style={styles.list}
            ListHeaderComponent={homeListHeader}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>{strings.noVirtualAccounts}</Text>
                <Text style={styles.emptySubtext}>{strings.createAccountToBegin}</Text>
              </View>
            }
            ListFooterComponent={homeListFooter}
          />
        )}
      </Animated.View>

      <CardActionMenu
        visible={!!actionMenuState}
        title={actionMenuState?.title}
        items={actionMenuState?.items || []}
        cancelLabel={strings.cancel}
        onClose={closeActionModal}
        onSelect={handleActionMenuSelect}
      />

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <KeyboardAwareModalOverlay style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{transactionType === 'deposit' ? strings.addFunds : strings.withdrawFunds}</Text>
            <Text style={styles.modalSubtitle}>{selectedAccount?.name}</Text>
            <TextInput
              value={transactionAmount}
              onChangeText={setTransactionAmount}
              keyboardType="numeric"
              placeholder={strings.enterAmount}
              inputAccessoryViewID={`${HOME_MODAL_ACCESSORY_ID}-transaction`}
              style={styles.modalInput}
            />
            <TextInput
              value={transactionLabel}
              onChangeText={setTransactionLabel}
              placeholder={strings.labelOptional}
              inputAccessoryViewID={`${HOME_MODAL_ACCESSORY_ID}-transaction`}
              style={[styles.modalInput, styles.labelInput]}
            />
            <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
              <TouchableOpacity style={[styles.modalButtonCancel, styles.goalModalButtonCancelCompact]} onPress={closeModal}>
                <Text style={styles.modalButtonText}>{strings.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButtonConfirm,
                  styles.goalModalButtonConfirmCompact,
                  transactionSubmitting ? styles.goalModalButtonDisabled : null,
                ]}
                onPress={handleConfirmTransaction}
                disabled={transactionSubmitting}
              >
                <Text style={styles.goalModalButtonConfirmText}>{transactionSubmitting ? '...' : strings.confirm}</Text>
              </TouchableOpacity>
            </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAwareModalOverlay>
        </TouchableWithoutFeedback>

        <IOSKeyboardDoneAccessory nativeID={`${HOME_MODAL_ACCESSORY_ID}-transaction`} label={strings.done} />
      </Modal>
      <Modal visible={transactionEditModalVisible} animationType="slide" transparent onRequestClose={closeTransactionEditModal}>
        <TouchableWithoutFeedback onPress={closeTransactionEditModal}>
          <KeyboardAwareModalOverlay style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{strings.editTransactionName}</Text>
            <TextInput
              value={transactionEditLabel}
              onChangeText={setTransactionEditLabel}
              placeholder={strings.transactionName}
              inputAccessoryViewID={`${HOME_MODAL_ACCESSORY_ID}-transaction-edit`}
              style={styles.modalInput}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={closeTransactionEditModal}>
                <Text style={styles.modalButtonText}>{strings.cancel}</Text>
              </TouchableOpacity>
              <PrimaryButton title={strings.save} onPress={handleSaveTransactionLabel} style={styles.modalButtonConfirm} textStyle={styles.modalButtonConfirmText} />
            </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAwareModalOverlay>
        </TouchableWithoutFeedback>

        <IOSKeyboardDoneAccessory nativeID={`${HOME_MODAL_ACCESSORY_ID}-transaction-edit`} label={strings.done} />
      </Modal>
      <Modal visible={renameModalVisible} animationType="slide" transparent onRequestClose={() => setRenameModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setRenameModalVisible(false)}>
          <KeyboardAwareModalOverlay style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{strings.renameAccount}</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              placeholder={strings.newAccountName}
              inputAccessoryViewID={`${HOME_MODAL_ACCESSORY_ID}-rename`}
              style={styles.modalInput}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setRenameModalVisible(false)}>
                <Text style={styles.modalButtonText}>{strings.cancel}</Text>
              </TouchableOpacity>
              <PrimaryButton title={strings.rename} onPress={handleRenameAccount} style={styles.modalButtonConfirm} textStyle={styles.modalButtonConfirmText} />
            </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAwareModalOverlay>
        </TouchableWithoutFeedback>

        <IOSKeyboardDoneAccessory nativeID={`${HOME_MODAL_ACCESSORY_ID}-rename`} label={strings.done} />
      </Modal>

      <Modal visible={goalModalVisible} animationType="fade" transparent onRequestClose={closeGoalModal}>
        <TouchableWithoutFeedback onPress={closeGoalModal}>
          <KeyboardAwareModalOverlay style={styles.modalOverlay} keyboardDoneLabel={strings.done}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{strings.createGoalTitle}</Text>
            <TextInput
              value={goalNameInput}
              onChangeText={setGoalNameInput}
              placeholder={strings.goalNameOptional}
              placeholderTextColor="#6b7280"
              style={[styles.modalInput, styles.goalModalInput]}
            />
            <TextInput
              value={goalAmountInput}
              onChangeText={setGoalAmountInput}
              keyboardType="numeric"
              placeholder={strings.goalAmount}
              placeholderTextColor="#6b7280"
              style={[styles.modalInput, styles.labelInput, styles.goalModalInput]}
            />
            <TouchableOpacity style={styles.goalImagePickerButton} onPress={handlePickGoalImageForCreate}>
              <Ionicons name="image-outline" size={18} color="#334155" />
              <Text style={styles.goalImagePickerText}>{goalImageInputUri ? strings.changeGoalImage : strings.chooseGoalImageOptional}</Text>
            </TouchableOpacity>
            {goalImageInputUri ? (
              <Image source={{ uri: goalImageInputUri }} style={styles.goalImagePreview} />
            ) : null}
            <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
              <TouchableOpacity style={[styles.modalButtonCancel, styles.goalModalButtonCancelCompact]} onPress={closeGoalModal}>
                <Text style={styles.modalButtonText}>{strings.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButtonConfirm, styles.goalModalButtonConfirmCompact]}
                onPress={handleCreateSavingsGoal}
              >
                <Text style={styles.goalModalButtonConfirmText}>{strings.createGoal}</Text>
              </TouchableOpacity>
            </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAwareModalOverlay>
        </TouchableWithoutFeedback>
        <IOSKeyboardDoneAccessory nativeID={`${HOME_MODAL_ACCESSORY_ID}-goal`} label={strings.done} />
      </Modal>

      <Modal visible={reserveModalVisible} animationType="fade" transparent onRequestClose={closeReserveModal}>
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
          >
            <TouchableWithoutFeedback onPress={closeReserveModal}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <Text style={styles.modalTitle}>{strings.reserveForGoal}</Text>
            <Text style={styles.modalSubtitle}>{strings.chooseBox}</Text>
            <View style={styles.reserveAccountList}>
              {reserveSourceItems.map((account) => {
                const currentReserved = Number(goalReservations[account.id]) || 0;
                const availableToReserve = getAccountAvailabilityBreakdown(account, savingsGoals, sharedAccounts).available;
                const selected = reserveAccountId === account.id;
                return (
                  <TouchableOpacity
                    key={account.id}
                    style={[styles.reserveAccountItem, selected && styles.reserveAccountItemActive]}
                    onPress={() => {
                      setReserveAccountId(account.id);
                      const currentInputValue = parseAmountInput(reserveAmountInput);
                      if (!Number.isNaN(currentInputValue) && currentInputValue > nextMax) {
                        setReserveAmountInput(formatAmountInputValue(nextMax));
                      }
                    }}
                  >
                    <View style={styles.reserveAccountMeta}>
                      <Text style={styles.reserveAccountName}>{account.name}</Text>
                      <Text style={styles.reserveAccountSub}>{`${formatCurrency(availableToReserve, currency)} ${strings.reserveAmount.toLowerCase()}`}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <AmountAllocationSlider
              value={reserveSliderValue}
              max={reserveMaxAmount}
              onChange={(nextValue) => setReserveAmountInput(formatAmountInputValue(nextValue))}
              accentColor="#84cc16"
              valueLabel={formatCurrency(reserveSliderValue, currency)}
              maxLabel={`${strings.reserveTooHigh} ${formatCurrency(reserveMaxAmount, currency)}`}
              disabled={reserveMaxAmount <= 0}
            />
            <TextInput
              value={reserveAmountInput}
              onChangeText={(value) => {
                if (!value) {
                  setReserveAmountInput('');
                  return;
                }
                const parsedValue = parseAmountInput(value);
                if (Number.isNaN(parsedValue)) {
                  setReserveAmountInput(value);
                  return;
                }
                setReserveAmountInput(formatAmountInputValue(Math.min(parsedValue, reserveMaxAmount)));
              }}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              placeholder={strings.reserveAmount}
              placeholderTextColor="#6b7280"
              inputAccessoryViewID={Platform.OS === 'ios' ? reserveAmountAccessoryId : undefined}
              style={[styles.modalInput, styles.labelInput, styles.goalModalInput]}
            />
            <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
              <TouchableOpacity style={[styles.modalButtonCancel, styles.goalModalButtonCancelCompact]} onPress={closeReserveModal}>
                <Text style={styles.modalButtonText}>{strings.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButtonConfirm,
                  styles.goalModalButtonConfirmCompact,
                  styles.goalActionStackButton,
                  styles.goalWithdrawButton,
                  styles.goalWithdrawStackedButton,
                  goalWithdrawSources.length === 0 ? styles.goalModalButtonDisabled : null,
                ]}
                disabled={goalWithdrawSources.length === 0}
                onPress={openGoalWithdrawModal}
              >
                <Text style={styles.goalModalButtonConfirmText}>{strings.withdraw}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.removeGoalButton}
              onPress={() => {
                if (!activeSavingsGoal?.id) return;
                handleRemoveSavingsGoal(activeSavingsGoal.id);
              }}
            >
              <Text style={styles.removeGoalButtonText}>{strings.removeSavingGoal}</Text>
            </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>

        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={reserveAmountAccessoryId}>
            <View style={styles.keyboardAccessoryBar}>
              <TouchableOpacity style={styles.keyboardAccessoryDoneButton} onPress={Keyboard.dismiss}>
                <Text style={styles.keyboardAccessoryDoneText}>{strings.done}</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        ) : null}
      </Modal>

      <Modal visible={goalActivityModalVisible} animationType="fade" transparent onRequestClose={closeGoalActivityModal}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={closeGoalActivityModal}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{goalActivityGoal?.name || strings.untitledGoal}</Text>
                <Text style={styles.modalSubtitle}>{strings.goalActivity}</Text>

                <View style={styles.goalActivityTotalRow}>
                  <Text style={styles.goalActivityTotalLabel}>{strings.totalReserved}</Text>
                  <Text style={styles.goalActivityTotalValue}>
                    {`${formatCurrency(goalActivityReservedTotal, currency)} / ${formatCurrency(goalActivityGoal?.targetAmount || 0, currency)}`}
                  </Text>
                </View>

                <Text style={styles.goalActivitySectionTitle}>{strings.recentActivity}</Text>
                {goalActivityEntries.length > 0 ? (
                  <ScrollView style={styles.goalActivityList} nestedScrollEnabled>
                    {goalActivityEntries.map((entry) => {
                      const isWithdrawEntry = entry?.type === 'withdraw';
                      const entryDate = entry?.at ? new Date(Number(entry.at)) : null;
                      return (
                        <View key={entry.id} style={styles.goalActivityItem}>
                          <View style={styles.goalActivityItemMeta}>
                            <Text style={styles.goalActivityItemName}>
                              {entry?.sourceName ? `${strings.fromSource} ${entry.sourceName}` : strings.account}
                            </Text>
                            {entryDate ? (
                              <Text style={styles.goalActivityItemSub}>
                                {entryDate.toLocaleString(language === 'nl' ? 'nl-NL' : 'en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={[styles.goalActivityItemAmount, isWithdrawEntry ? styles.goalActivityItemAmountNegative : null]}>
                            {`${isWithdrawEntry ? '-' : '+'}${formatCurrency(Number(entry?.amount) || 0, currency)}`}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.goalActivityItemSub}>{strings.noGoalActivity}</Text>
                )}

                <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
                  <TouchableOpacity style={[styles.modalButtonCancel, styles.goalModalButtonCancelCompact, styles.goalActionCancelAligned]} onPress={closeGoalActivityModal}>
                    <Text style={styles.modalButtonText}>{strings.close}</Text>
                  </TouchableOpacity>
                  <View style={styles.goalActionStack}>
                    <TouchableOpacity
                      style={[styles.modalButtonConfirm, styles.goalModalButtonConfirmCompact, styles.goalActionStackButton]}
                      onPress={() => {
                        const targetGoalId = goalActivityGoalId;
                        closeGoalActivityModal();
                        openReserveModal(targetGoalId);
                      }}
                    >
                      <Text style={styles.goalModalButtonConfirmText}>{strings.addReserve}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalButtonConfirm,
                        styles.goalModalButtonConfirmCompact,
                        styles.goalActionStackButton,
                        styles.goalWithdrawButton,
                        styles.goalWithdrawStackedButton,
                        goalWithdrawSources.length === 0 ? styles.goalModalButtonDisabled : null,
                      ]}
                      disabled={goalWithdrawSources.length === 0}
                      onPress={openGoalWithdrawModal}
                    >
                      <Text style={styles.goalModalButtonConfirmText}>{strings.withdraw}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
          </View>
        </View>
      </Modal>

      <Modal visible={goalWithdrawModalVisible} animationType="fade" transparent onRequestClose={closeGoalWithdrawModal}>
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
          >
            <TouchableWithoutFeedback onPress={closeGoalWithdrawModal}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
                <Text style={styles.modalTitle}>{strings.withdrawFromGoal}</Text>
                <Text style={styles.modalSubtitle}>{goalActivityGoal?.name || strings.untitledGoal}</Text>

                {goalWithdrawSources.length > 0 ? (
                  <>
                    <View style={styles.reserveAccountList}>
                      {goalWithdrawSources.map((source) => {
                        const selected = goalWithdrawAccountId === source.id;
                        return (
                          <TouchableOpacity
                            key={source.id}
                            style={[styles.reserveAccountItem, selected && styles.reserveAccountItemActive]}
                            onPress={() => {
                              setGoalWithdrawAccountId(source.id);
                              const currentInputValue = parseAmountInput(goalWithdrawAmountInput);
                              if (!Number.isNaN(currentInputValue) && currentInputValue > source.reserved) {
                                setGoalWithdrawAmountInput(formatAmountInputValue(source.reserved));
                              }
                            }}
                          >
                            <View style={styles.reserveAccountMeta}>
                              <Text style={styles.reserveAccountName}>{source.name}</Text>
                              <Text style={styles.reserveAccountSub}>{formatCurrency(source.reserved, currency)}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <AmountAllocationSlider
                      value={goalWithdrawSliderValue}
                      max={goalWithdrawMaxAmount}
                      onChange={(nextValue) => setGoalWithdrawAmountInput(formatAmountInputValue(nextValue))}
                      accentColor="#D50000"
                      valueLabel={formatCurrency(goalWithdrawSliderValue, currency)}
                      maxLabel={`${strings.withdrawTooHigh} ${formatCurrency(goalWithdrawMaxAmount, currency)}`}
                      disabled={goalWithdrawMaxAmount <= 0}
                    />
                    <TextInput
                      value={goalWithdrawAmountInput}
                      onChangeText={(value) => {
                        if (!value) {
                          setGoalWithdrawAmountInput('');
                          return;
                        }
                        const parsedValue = parseAmountInput(value);
                        if (Number.isNaN(parsedValue)) {
                          setGoalWithdrawAmountInput(value);
                          return;
                        }
                        setGoalWithdrawAmountInput(formatAmountInputValue(Math.min(parsedValue, goalWithdrawMaxAmount)));
                      }}
                      keyboardType="numeric"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      placeholder={strings.withdrawAmount}
                      placeholderTextColor="#6b7280"
                      inputAccessoryViewID={Platform.OS === 'ios' ? goalWithdrawAmountAccessoryId : undefined}
                      style={[styles.modalInput, styles.labelInput, styles.goalModalInput]}
                    />
                  </>
                ) : (
                  <Text style={styles.goalActivityItemSub}>{strings.noReservedAmounts}</Text>
                )}

                <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
                  <TouchableOpacity style={[styles.modalButtonCancel, styles.goalModalButtonCancelCompact]} onPress={closeGoalWithdrawModal}>
                    <Text style={styles.modalButtonText}>{strings.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButtonConfirm,
                      styles.goalModalButtonConfirmCompact,
                      styles.goalWithdrawButton,
                      goalWithdrawMaxAmount <= 0 ? styles.goalModalButtonDisabled : null,
                    ]}
                    disabled={goalWithdrawMaxAmount <= 0}
                    onPress={handleWithdrawGoalReservation}
                  >
                    <Text style={styles.goalModalButtonConfirmText}>{strings.withdraw}</Text>
                  </TouchableOpacity>
                </View>
            </ScrollView>
          </KeyboardAvoidingView>

        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={goalWithdrawAmountAccessoryId}>
            <View style={styles.keyboardAccessoryBar}>
              <TouchableOpacity style={styles.keyboardAccessoryDoneButton} onPress={Keyboard.dismiss}>
                <Text style={styles.keyboardAccessoryDoneText}>{strings.done}</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        ) : null}
      </Modal>

      <Modal visible={externalAccountModalVisible} animationType="slide" transparent onRequestClose={() => setExternalAccountModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setExternalAccountModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{strings.externalAccount}</Text>
                <TouchableOpacity
                  style={styles.brokerOption}
                  onPress={() => {
                    setExternalAccountModalVisible(false);
                    navigation.navigate('ConnectedAccounts');
                  }}
                >
                  <Text style={styles.brokerOptionText}>{strings.connectBank}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.brokerOption}
                  onPress={() => {
                    setExternalAccountModalVisible(false);
                    setBrokerModalVisible(true);
                  }}
                >
                  <Text style={styles.brokerOptionText}>{strings.connectInvestment}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.brokerOption}
                  onPress={() => {
                    setExternalAccountModalVisible(false);
                    navigation.navigate('CryptoWalletConnect');
                  }}
                >
                  <Text style={styles.brokerOptionText}>{strings.connectCryptoWallet}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.brokerOption}
                  onPress={() => {
                    setExternalAccountModalVisible(false);
                    navigation.navigate('CreateSavings', { userId: user?.uid });
                  }}
                >
                  <Text style={styles.brokerOptionText}>{strings.createNewAccount}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setExternalAccountModalVisible(false)}>
                  <Text style={styles.modalButtonText}>{strings.cancel}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={brokerModalVisible} animationType="slide" transparent onRequestClose={() => setBrokerModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setBrokerModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{strings.chooseBroker}</Text>
                <TouchableOpacity
                  style={styles.brokerOption}
                  onPress={() => {
                    setBrokerModalVisible(false);
                    navigation.navigate('ConnectTrading212');
                  }}
                >
                  <Text style={styles.brokerOptionText}>Trading212</Text>
                </TouchableOpacity>
                <View style={[styles.brokerOption, styles.brokerOptionDisabled]}>
                  <Text style={styles.brokerOptionTextDisabled}>DEGIRO</Text>
                  <Text style={styles.brokerOptionBadge}>{strings.comingSoon}</Text>
                </View>
                <View style={[styles.brokerOption, styles.brokerOptionDisabled]}>
                  <Text style={styles.brokerOptionTextDisabled}>More brokers</Text>
                  <Text style={styles.brokerOptionBadge}>{strings.comingSoon}</Text>
                </View>
                <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setBrokerModalVisible(false)}>
                  <Text style={styles.modalButtonText}>{strings.cancel}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={!!investmentDetailsAccount} animationType="slide" transparent onRequestClose={() => setInvestmentDetailsAccount(null)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setInvestmentDetailsAccount(null)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <ScrollView style={styles.modalScroll} contentContainerStyle={[styles.modalContent, styles.trading212ModalContent]} keyboardShouldPersistTaps="handled">
                <Text style={[styles.modalTitle, styles.trading212ModalTitle]}>{strings.investmentDetails}</Text>
                <Text style={[styles.modalSubtitle, styles.trading212ModalSubtitle]}>{BROKER_LABELS[investmentDetailsAccount?.broker] || investmentDetailsAccount?.broker || 'Trading 212'}</Text>
                <View style={[styles.goalActivityTotalRow, styles.trading212TotalRow]}>
                  <Text style={[styles.goalActivityTotalLabel, styles.trading212Text]}>{strings.totalBalance}</Text>
                  <Text style={[styles.goalActivityTotalValue, styles.trading212TotalValue]}>
                    {formatCurrency(
                      typeof convertedInvestmentBalances[investmentDetailsAccount?.id] === 'number'
                        ? convertedInvestmentBalances[investmentDetailsAccount.id]
                        : investmentDetailsAccount?.totalValue || 0,
                      currency
                    )}
                  </Text>
                </View>
                <Text style={[styles.investmentDetailsSectionTitle, styles.trading212SectionTitle]}>{strings.invested}</Text>
                {investmentSegments.length > 0 ? (
                  <>
                    <View style={styles.investmentDonutWrap}>
                      <Svg width={152} height={152} viewBox="0 0 152 152">
                        <G rotation={-90} originX={76} originY={76}>
                          {investmentSegments.map((segment, index) => {
                            const circumference = 2 * Math.PI * 52;
                            const arcLength = segment.percentage * circumference;
                            return (
                              <Circle
                                key={`${segment.ticker || segment.name}-${index}`}
                                cx={76}
                                cy={76}
                                r={52}
                                fill="none"
                                stroke={segment.color}
                                strokeWidth={24}
                                strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                                strokeDashoffset={-segment.offset}
                              />
                            );
                          })}
                        </G>
                      </Svg>
                    </View>
                    {investmentSegments.map((position, index) => (
                      <View key={`${position.ticker || position.name}-${index}`} style={styles.investmentPositionRow}>
                        <View style={styles.investmentPositionLegend}>
                          <View style={[styles.investmentPositionSwatch, { backgroundColor: position.color }]} />
                          <View style={styles.investmentPositionMeta}>
                            <Text style={[styles.investmentPositionName, styles.trading212Text]}>{position.name || position.ticker || strings.investmentAccount}</Text>
                            {position.ticker ? <Text style={[styles.investmentPositionSub, styles.trading212Muted]}>{position.ticker}</Text> : null}
                            <Text style={[styles.investmentPositionSub, styles.trading212Muted]}>
                              {`${Number(position.quantity || 0)} × ${formatCurrency(position.currentPrice || 0, position.currency || investmentDetailsAccount?.currency || currency)}`}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.investmentPositionRight}>
                          <Text style={[styles.investmentPositionValue, styles.trading212Text]}>
                            {formatCurrency(position.currentValue, position.valueCurrency || investmentDetailsAccount?.currency || currency)}
                          </Text>
                          <Text style={[styles.investmentPositionSub, styles.trading212Muted]}>{`${(position.percentage * 100).toFixed(1)}%`}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={[styles.helperText, styles.trading212Muted]}>{strings.noPositions}</Text>
                )}
                <Text style={[styles.investmentLastSyncedText, styles.trading212Muted]}>
                  {strings.lastSynced}: {formatLastSynced(investmentDetailsAccount?.lastSyncedAt)} · {strings.readOnly}
                </Text>
                <TouchableOpacity style={[styles.modalButtonCancel, styles.investmentDetailsClose, styles.trading212CloseButton]} onPress={() => setInvestmentDetailsAccount(null)}>
                  <Text style={styles.modalButtonText}>{strings.close}</Text>
                </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_BACKGROUND_GRADIENT.solidLight },
  containerDark: { backgroundColor: APP_BACKGROUND_GRADIENT.solidDark },
  heroSection: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  heroSectionDark: { backgroundColor: 'transparent' },
  heroSceneShell: { width: '100%' },
  heroScene: {
    width: '100%',
    height: HERO_SCENE_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  heroContent: { flex: 1, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 22 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  connectWalletButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5,
    borderColor: '#84cc16',
  },
  connectWalletButtonText: {
    color: '#ecfdf5',
    fontWeight: '700',
    fontSize: 13,
  },
  brandTitle: { fontSize: 32, fontWeight: '900', color: '#d1fae5', marginTop: 6 },
  brandSubtitle: { fontSize: 14, color: '#bbf7d0', marginTop: 4 },
  headerSpacer: { height: 12 },
  summaryWidget: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  summaryInfo: { flex: 1, paddingRight: 12 },
  trendChartTrack: {
    position: 'relative',
    backgroundColor: 'transparent',
    borderRadius: 0,
    overflow: 'visible',
    borderWidth: 0,
  },
  trendChartTrackExpanded: {
    borderRadius: 16,
    backgroundColor: '#f8fff1',
  },
  trendGuideLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  trendChartFill: {
    ...StyleSheet.absoluteFillObject,
  },
  trendSvgOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  trendChartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  trendYAxisContainer: {
    position: 'relative',
    marginRight: 10,
  },
  trendYAxisLabel: {
    position: 'absolute',
    right: 0,
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  trendLineSegment: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#65a30d',
    shadowColor: '#84cc16',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  trendCursorLine: {
    position: 'absolute',
    width: 1,
    marginLeft: -0.5,
    backgroundColor: 'rgba(132,204,22,0.95)',
  },
  trendDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    marginTop: -6,
    backgroundColor: '#84cc16',
    borderWidth: 2,
    borderColor: '#ecfccb',
    shadowColor: '#65a30d',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  trendCurrentValueBadge: {
    position: 'absolute',
    backgroundColor: 'rgba(101,163,13,0.12)',
    borderColor: 'rgba(101,163,13,0.28)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trendCurrentValueText: {
    color: '#3f6212',
    fontSize: 11,
    fontWeight: '700',
  },
  trendRangeSelector: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  trendRangeSelectorExpanded: {
    marginBottom: 10,
  },
  trendRangeChip: {
    minWidth: 36,
    marginHorizontal: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(132,204,22,0.3)',
    backgroundColor: 'rgba(236,252,203,0.55)',
    paddingVertical: 5,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendRangeChipActive: {
    backgroundColor: '#84cc16',
    borderColor: '#65a30d',
  },
  trendRangeChipText: {
    color: '#4d7c0f',
    fontSize: 11,
    fontWeight: '700',
  },
  trendRangeChipTextActive: {
    color: '#f7fee7',
  },
  trendChartMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trendChartMetaLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  trendAxisFooter: {
    marginTop: 6,
    paddingLeft: 2,
  },
  trendAxisLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  trendXAxisLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trendModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  trendModalCard: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
  },
  trendModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  trendModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  trendModalCloseButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
  },
  trendModalCloseText: {
    color: '#065f46',
    fontSize: 13,
    fontWeight: '700',
  },
  trendModalSubtitle: {
    marginTop: 10,
    color: '#6b7280',
    fontSize: 13,
  },
  widgetLabel: { fontSize: 12, color: '#bbf7d0', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  widgetValue: { fontSize: 30, fontWeight: '800', color: '#ffffff' },
  widgetNote: { fontSize: 13, color: '#d1fae5', marginTop: 8 },
  profileButtonLarge: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
  },
  profileImageLarge: { width: 70, height: 70, borderRadius: 35 },
  profileIconLarge: { fontSize: 26, color: '#ffffff', fontWeight: '800' },
  dashboardHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  dashboardTitleBox: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  dashboardInsightCard: {
    backgroundColor: 'rgba(0,0,0,0.34)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 18,
    marginBottom: 18,
    flexDirection: 'column',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  dashboardInsightCardFullWidth: {
    marginHorizontal: -20,
    borderRadius: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    marginTop: 18,
    marginBottom: 18,
  },
  dashboardInsightShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '64%',
  },
  insightTopSection: {
    width: '100%',
  },
  insightTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 2,
  },
  insightTrendTotal: {
    color: '#f8fafc',
    fontSize: 42,
    fontWeight: '800',
  },
  insightLeftColumn: { flex: 1, paddingRight: 10 },
  insightTrendCardFull: {
    marginTop: 4,
    paddingVertical: 0,
    paddingHorizontal: 0,
    width: '100%',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    alignItems: 'stretch',
  },
  insightTrendCard: {
    marginTop: 6,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: '96%',
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'stretch',
  },
  insightTrendHint: {
    marginTop: 6,
    color: 'rgba(236,253,245,0.9)',
    fontSize: 11,
    textAlign: 'center',
  },
  insightAccountsText: {
    color: 'rgba(226,232,240,0.95)',
    fontSize: 12,
    marginBottom: 0,
  },
  goalsSection: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 0,
    borderTopColor: 'transparent',
  },
  goalsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 8,
  },
  goalCarouselRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    overflow: 'visible',
  },
  goalCarouselRowInlineAdd: {
    marginRight: -SCREEN_CONTENT_HORIZONTAL_INSET,
  },
  goalCarouselListWrap: {
    flex: 1,
    marginRight: GOAL_SIDE_ADD_BUTTON_GAP,
    overflow: 'visible',
  },
  goalCarouselListWrapFullWidth: {
    marginRight: 0,
  },
  insightRightColumn: {
    width: 150,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.2)',
    paddingLeft: 10,
    alignItems: 'center',
  },
  goalProgressContentTouchable: {
    width: '100%',
    alignItems: 'center',
  },
  goalStackList: {
    width: '100%',
    marginTop: 2,
  },
  goalStackItem: {
    width: 228,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 0,
  },
  goalStackItemLight: { backgroundColor: 'rgba(255,255,255,0.88)', borderColor: 'rgba(15,23,42,0.14)' },
  goalImageArea: { position: 'relative', width: '100%', height: 108, marginBottom: 2 },
  goalImageBackground: { position: 'absolute', top: 0, left: 0, width: '100%', height: 108, borderRadius: 10, zIndex: 0 },
  goalImageContent: { position: 'absolute', top: 6, left: 0, right: 0, height: 96, zIndex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  goalImageShade: { backgroundColor: 'rgba(15,23,42,0.18)' },
  goalImageCornerButton: { position: 'absolute', top: 6, left: 6, zIndex: 2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.42)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  goalImagePickerButton: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, marginBottom: 12 },
  goalImagePickerText: { color: '#334155', fontWeight: '600', flex: 1 },
  goalImagePreview: { width: '100%', height: 100, borderRadius: 10, marginBottom: 12 },
  goalCardBody: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 6,
  },
  goalProgressContentTouchable: {
    width: '100%',
    alignItems: 'center',
    flex: 1,
    paddingTop: 0,
    paddingBottom: 0,
  },
  goalArcActionWrap: {
    position: 'relative',
    width: 96,
    height: 96,
    marginBottom: 2,
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalCardActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  goalCardActionButtonAdd: {
    position: 'absolute',
    left: 28,
    top: 27,
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#84cc16',
    borderColor: 'rgba(220,252,231,0.45)',
  },
  goalCardActionButtonDelete: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightLabel: { color: 'rgba(236,253,245,0.92)', fontSize: 13, fontWeight: '600' },
  insightValue: { color: '#ffffff', fontSize: 30, fontWeight: '800', marginTop: 4, marginBottom: 8 },
  createAccountButton: { marginBottom: 8 },
  createAccountButtonOutside: { marginBottom: 14 },
  createAccountButtonText: { fontSize: 14, color: '#effcf4' },
  createAccountButtonCompact: {
    marginBottom: 0,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    minHeight: 38,
  },
  createAccountButtonCompactText: {
    fontSize: 13,
    color: '#effcf4',
  },
  createAccountHeroButtonOuter: {
    marginBottom: 0,
    borderRadius: 999,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 6,
  },
  createAccountHeroButtonInner: {
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  createAccountHeroShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '52%',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  createAccountHeroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createAccountHeroText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  primaryActionsRow: {
    marginBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyIconButton: {
    width: 64,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(241,245,249,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    marginLeft: 8,
  },
  historyIconArrow: {
    transform: [{ scaleX: 1.22 }],
  },
  historyIconButtonDark: {
    backgroundColor: 'rgba(15,23,42,0.58)',
    borderColor: 'rgba(148,163,184,0.35)',
  },
  connectedWalletsSection: {
    marginBottom: 14,
  },
  connectedWalletsSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
    marginLeft: 0,
    letterSpacing: 0.2,
  },
  connectedWalletsSectionTitleDark: {
    color: '#e2e8f0',
  },
  connectedWalletsSectionTitleInset: {
    marginLeft: 16,
  },
  connectedWalletsActionTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  connectedWalletsActionButton: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  connectedWalletsActionRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalActionButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 9,
    alignItems: 'center',
  },
  manualAccountsHeaderWrap: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  manualAccountsHeaderDivider: {
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.25)',
    marginBottom: 10,
  },
  goalActionButtonRight: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 10,
  },
  goalActionButtonCompact: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#65a30d',
    backgroundColor: '#84cc16',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  goalActionButtonInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalActionButtonTransparent: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(148,163,184,0.55)',
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  goalActionButtonText: { color: '#f8fafc', fontWeight: '700', fontSize: 14 },
  goalActionButtonPlus: { color: '#f8fafc', fontWeight: '800', fontSize: 18, lineHeight: 18, marginRight: 6 },
  goalActionButtonTextGreen: { color: '#84cc16', fontWeight: '700', fontSize: 14 },
  goalSideAddButton: {
    width: GOAL_SIDE_ADD_BUTTON_WIDTH,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#65a30d',
    backgroundColor: '#84cc16',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  goalInlineAddItem: {
    marginRight: 0,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  goalSideAddButtonPlus: {
    color: '#f8fafc',
    fontWeight: '800',
    fontSize: 22,
    lineHeight: 22,
  },
  goalProgressTitle: { color: '#f8fafc', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  goalEmptyText: { color: 'rgba(226,232,240,0.92)', fontSize: 13, textAlign: 'center', marginTop: 18 },
  goalNameText: { color: '#ffffff', fontWeight: '700', fontSize: 13, textAlign: 'center', marginTop: 2 },
  goalNameTextLight: { color: '#0f172a' },
  goalMetaText: { color: 'rgba(226,232,240,0.92)', fontSize: 12, textAlign: 'center', marginTop: 2 },
  goalMetaTextLight: { color: '#334155' },
  goalHintText: { color: '#f8fafc', fontSize: 11, textAlign: 'center', marginTop: 6, fontWeight: '600' },
  goalArcWrap: {
    width: 96,
    height: 96,
    position: 'relative',
    marginBottom: 2,
  },
  goalArcSegment: {
    position: 'absolute',
    width: 4,
    height: 12,
    borderRadius: 3,
    marginLeft: -2,
    marginTop: -6,
  },
  hiddenBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  hiddenBalanceSymbol: {
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffff',
    marginRight: 8,
  },
  balanceBlurCapsule: {
    width: 176,
    height: 34,
    borderRadius: 8,
    overflow: 'hidden',
  },
  balanceBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  balanceBlurTint: {
    ...StyleSheet.absoluteFillObject,
  },
  contentInset: { paddingHorizontal: 20, paddingTop: 0 },
  dashboardTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  sectionHeader: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  listShell: { flex: 1, zIndex: 1 },
  list: { flex: 1, backgroundColor: 'transparent', zIndex: 1 },
  listContent: { paddingTop: HERO_SCENE_HEIGHT, paddingBottom: 24 },
  card: {
    borderRadius: 12,
    padding: 18,
    width: '100%',
    minHeight: 120,
    marginBottom: 18,
    borderWidth: 0.5,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  cardBlurLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  cardImageBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '56%',
  },
  cardImageFade: {
    ...StyleSheet.absoluteFillObject,
  },
  cardGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '35%',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  investmentCardBrandTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
  },
  investmentCardBlueEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  cryptoCard: {
    backgroundColor: '#ffffff',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },
  cryptoCardControls: { position: 'absolute', top: 14, right: 16, zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cryptoBrandBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)' },
  cryptoCardHeader: { paddingRight: 92 },
  cryptoCardTitle: { fontSize: 16, fontWeight: '800', textTransform: 'none', letterSpacing: 0 },
  cryptoCardSubtitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0, paddingRight: 92, fontVariant: ['tabular-nums'] },
  cryptoCardText: { color: '#0f172a' },
  cryptoCardMuted: { color: '#64748b' },
  cryptoCardBaseText: { color: '#000000' },
  cryptoCardBaseMuted: { color: '#1e293b' },
  cryptoCardTextOnBlue: { color: '#ffffff' },
  cryptoCardMutedOnBlue: { color: 'rgba(255,255,255,0.82)' },
  cryptoCardValueUnavailable: { fontSize: 17, fontWeight: '700', color: '#64748b' },
  coinbaseCard: { padding: 0, borderColor: 'rgba(0,82,255,0.45)', shadowColor: '#0052FF' },
  coinbaseCardHalf: { flex: 1, paddingHorizontal: 18 },
  coinbaseCardBlueHalf: { backgroundColor: '#0052FF', paddingTop: 14, paddingBottom: 10 },
  coinbaseCardWhiteHalf: { backgroundColor: '#ffffff', paddingTop: 10, paddingBottom: 14 },
  coinbaseSyncFailedText: { color: '#ffffff', fontSize: 10, fontWeight: '800', marginTop: 4 },
  investmentBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  investmentBalanceValue: { flex: 1, flexShrink: 1, minWidth: 0, fontSize: 24, fontWeight: '900', marginBottom: 0 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardMenuButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cardMenuIcon: { fontSize: 15, fontWeight: '700' },
  rearrangeHint: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginLeft: 10 },
  cardName: { fontSize: 18, fontWeight: '500', letterSpacing: 0.5, marginBottom: 10 },
  cardBalance: { fontSize: 28, fontWeight: '700', marginBottom: 20, color: '#ffffff' },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between' },
  cardButton: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depositButton: { backgroundColor: GOAL_ACTION_GREEN, marginRight: 8 },
  withdrawButton: { backgroundColor: '#D50000' },
  cardButtonText: { fontWeight: '700', color: '#ffffff', fontSize: 15 },
  cardButtonDisabled: { opacity: 0.5 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#334155', marginBottom: 8 },
  emptySubtext: { color: '#334155', textAlign: 'center' },
  activitySection: { marginTop: 20, paddingHorizontal: 20 },
  sectionHeading: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  activityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  activityMeta: { flex: 1, paddingRight: 10 },
  activityAccount: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  activityType: { fontSize: 13, color: '#334155', marginTop: 4 },
  activityLabel: { fontSize: 13, color: '#334155', marginTop: 2 },
  activityRight: { alignItems: 'flex-end' },
  activityAmount: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  activityAmountDeposit: { color: '#16a34a' },
  activityAmountWithdraw: { color: '#dc2626' },
  activityTime: { fontSize: 12, color: '#475569', marginTop: 4 },
  signOutButton: { marginTop: 12 },
  toolbarButton: { flex: 1, borderRadius: 14, paddingVertical: 12, marginHorizontal: 4, alignItems: 'center', backgroundColor: '#d1fae5' },
  toolbarButtonDisabled: { opacity: 0.45 },
  toolbarButtonText: { fontWeight: '700', color: '#0f5132' },
  toolbarDisabledText: { color: '#334155' },
  transactionToolbar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
    backgroundColor: 'rgba(8, 15, 23, 0.14)',
  },
  sharedHeroImageLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 0,
  },
  fixedHeroContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_SCENE_HEIGHT,
    zIndex: 2,
    overflow: 'hidden',
  },
  sharedHeroImage: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  pullIndicatorContainer: {
    position: 'absolute',
    top: HERO_SCENE_HEIGHT + 18,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  coinIndicator: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 214, 102, 0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 102, 0.5)',
  },
  coinText: {
    fontSize: 20,
    fontWeight: '800',
    color: 'rgba(138, 83, 12, 0.85)',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalScroll: { width: '100%', flexGrow: 0, maxHeight: '85%' },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 10 },
  modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  modalSubtitle: { fontSize: 14, color: '#334155', marginBottom: 18 },
  modalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, fontSize: 16, marginBottom: 18 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalButtonCancel: { flex: 1, marginRight: 8, backgroundColor: '#f1f5f9', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  modalButtonConfirm: { flex: 1, marginLeft: 8, backgroundColor: GOAL_ACTION_GREEN, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  modalButtonConfirmText: { color: '#f8fafc' },
  modalButtonText: { fontWeight: '700', color: '#0f172a' },
  goalModalInput: { color: '#334155' },
  goalModalButtonsCompact: { marginTop: 2 },
  goalModalButtonCancelCompact: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 0,
  },
  goalModalButtonConfirmCompact: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#84cc16',
    borderWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  goalModalButtonConfirmText: { color: '#f8fafc', fontWeight: '700' },
  goalModalButtonDisabled: { opacity: 0.6 },
  cardWrapper: { width: '100%', marginBottom: 6, paddingHorizontal: 16 },
  rearrangeItem: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  rearrangeBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#e0f2fe', padding: 12, borderRadius: 12, marginBottom: 12 },
  rearrangeText: { fontSize: 14, fontWeight: '700', color: '#075985' },
  rearrangeDoneButton: { backgroundColor: '#075985', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  rearrangeDoneText: { color: '#ffffff', fontWeight: '700' },
  rearrangeActionButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#d1fae5' },
  rearrangeActionText: { fontSize: 14, fontWeight: '700', color: '#065f46' },
  actionModalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 10 },
  actionItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  actionItemText: { fontSize: 16, color: '#0f172a' },
  actionItemDanger: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  actionItemDangerText: { color: '#b91c1c' },
  actionCancel: { borderBottomWidth: 0, marginTop: 12 },
  actionCancelText: { color: '#ef4444' },
  reserveAccountList: { marginBottom: 14 },
  reserveAccountItem: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  reserveAccountItemActive: {
    borderColor: '#0f5132',
    backgroundColor: '#ecfdf5',
  },
  reserveAccountMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reserveAccountName: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  reserveAccountSub: { color: '#2f5e4f', fontSize: 12, marginLeft: 10 },
  goalActivityTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    backgroundColor: '#ecfdf5',
  },
  goalActivityTotalLabel: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  goalActivityTotalValue: { color: '#0f5132', fontSize: 13, fontWeight: '700' },
  goalActivitySectionTitle: { color: '#0f172a', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  goalActivityList: { maxHeight: 200, marginBottom: 12 },
  goalActivityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  goalActivityItemMeta: { flex: 1, paddingRight: 10 },
  goalActivityItemName: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  goalActivityItemSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  goalActivityItemAmount: { color: '#0f5132', fontSize: 14, fontWeight: '700' },
  goalActivityItemAmountNegative: { color: '#dc2626' },
  goalWithdrawButton: { backgroundColor: '#D50000', borderColor: '#D50000' },
  goalWithdrawStackedButton: { marginTop: 8 },
  goalActionStack: { flex: 1, marginLeft: 8 },
  goalActionStackButton: { flex: 0, marginLeft: 0, width: '100%' },
  goalActionCancelAligned: { justifyContent: 'center' },
  investmentBreakdownText: { color: '#475569', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  investmentBreakdownTextDark: { color: '#cbd5e1' },
  investmentCardText: { color: '#ffffff' },
  investmentCardMutedText: { color: '#b9cbd3' },
  investmentCardAccentText: { color: '#62ccef' },
  investmentLastSyncedText: { color: '#94a3b8', fontSize: 11 },
  investmentLastSyncedTextDark: { color: '#64748b' },
  investmentSyncFailedText: { alignSelf: 'flex-end', color: '#ef4444', fontSize: 10, fontWeight: '700', textAlign: 'right' },
  investmentDetailsSectionTitle: { color: '#0f172a', fontSize: 14, fontWeight: '800', marginBottom: 8 },
  trading212ModalContent: {
    backgroundColor: '#080d12',
    borderWidth: 1,
    borderColor: 'rgba(0,167,225,0.55)',
  },
  trading212ModalTitle: { color: '#ffffff' },
  trading212ModalSubtitle: { color: '#74d9f6' },
  trading212Text: { color: '#ffffff' },
  trading212Muted: { color: '#a9c3cf' },
  trading212TotalRow: {
    backgroundColor: 'rgba(0,167,225,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,167,225,0.38)',
  },
  trading212TotalValue: { color: '#ffffff', fontSize: 21, fontWeight: '900' },
  trading212SectionTitle: { color: '#ffffff' },
  investmentDonutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  investmentPositionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,167,225,0.22)',
    paddingVertical: 10,
  },
  investmentPositionLegend: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 10 },
  investmentPositionSwatch: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  investmentPositionMeta: { flex: 1, paddingRight: 12 },
  investmentPositionName: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  investmentPositionSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  investmentPositionValue: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  investmentPositionRight: { alignItems: 'flex-end' },
  investmentDetailsClose: { marginTop: 12 },
  trading212CloseButton: { backgroundColor: '#00A7E1' },
  investmentInvalidText: { color: '#dc2626', fontSize: 12, fontWeight: '700', marginTop: 6 },
  brokerOption: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  brokerOptionDisabled: { backgroundColor: '#f1f5f9', opacity: 0.7 },
  brokerOptionText: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  brokerOptionTextDisabled: { color: '#94a3b8', fontSize: 15, fontWeight: '700' },
  brokerOptionBadge: { color: '#94a3b8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  keyboardAccessoryBar: {
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  keyboardAccessoryDoneButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  keyboardAccessoryDoneText: {
    color: '#0f5132',
    fontSize: 16,
    fontWeight: '700',
  },
  removeGoalButton: {
    marginTop: 14,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeGoalButtonText: { color: '#b91c1c', fontWeight: '700', fontSize: 14 },
});
