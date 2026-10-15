import { LinearGradient } from 'expo-linear-gradient';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, PanResponder, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, useWindowDimensions, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import CardActionMenu from '../components/CardActionMenu';
import { IOSKeyboardDoneAccessory, KeyboardAwareModalOverlay } from '../components/ModalKeyboardSupport';
import { APP_BACKGROUND_GRADIENT } from '../constants/backgroundGradient';
import { DEFAULT_ACCOUNT_COLORS, formatCurrency, getReadableTextColor } from '../constants/colors';
import {
    createFutureTransaction,
    deleteFutureTransaction,
    excludeFutureTransactionOccurrence,
    subscribeToAccounts,
    subscribeToConnectedWallets,
    subscribeToFutureTransactions,
    subscribeToUserDocument,
    updateFutureTransaction,
} from '../firebase/firestore';
import { convertCurrencyAmount } from '../services/currency';
import { subscribeToInvestmentAccounts } from '../services/investmentAccounts';

const INITIAL_TIMELINE_ROW_COUNT = 60;
const TIMELINE_ROW_BATCH_SIZE = 60;
const TIMELINE_LOAD_MORE_THRESHOLD = 300;

const FUTURE_ACCESSORY_ID = 'future-event-input-accessory';
const CALENDAR_DAY_CELL_HEIGHT = 34;
const CALENDAR_BASE_ROW_COUNT = 5;
const RECURRENCE_LOOKAHEAD_DAYS = 365;
const RECURRENCE_MAX_OCCURRENCES = 500;
const REFRESH_HOLD_OFFSET = 68;
const REFRESH_TRIGGER_DISTANCE = 74;
const FUTURE_GRAPH_RANGES = {
  '1W': 7,
  '1M': 30,
  '6M': 182,
  '1Y': 365,
};
const FUTURE_GRAPH_HISTORY_DAYS = {
  '1W': 1,
  '1M': 5,
  '6M': 30,
  '1Y': 60,
};
const FUTURE_GRAPH_DENSE_RANGES = ['6M', '1Y'];
const MAX_TREND_POINTS = 14;
const CURSOR_DAILY_MAX_DAYS = 31;
const FUTURE_TRANSLATIONS = {
  en: {
    income: 'Income', expense: 'Expense', screenTitle: 'Future finances', screenSubtitle: 'See your money ahead',
    timeline: 'Future timeline', noEvents: 'No future events yet.', today: 'Today', projectedAt: 'Projected at',
    addTransaction: 'Add transaction', insights: 'Future insights', close: 'Close', noBoxes: 'No boxes available.',
    editFuture: 'Edit future transaction', addFuture: 'Add future transaction', amount: 'Amount', selectDate: 'Select date',
    prev: 'Prev', next: 'Next', repeated: 'Repeated transaction', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
    description: 'Description', addToSource: 'Add to source', expenseFromSource: 'Expense from source',
    noSources: 'No boxes or connected accounts available.', cancel: 'Cancel', save: 'Save', done: 'Done',
    unableToSave: 'Unable to save future transaction', tryAgain: 'Please try again.',
    unableToDeleteOccurrence: 'Unable to delete this occurrence', unableToDelete: 'Unable to delete transaction',
    deleteTransaction: 'Delete transaction', confirmDelete: 'Are you sure you want to delete this transaction?',
    repeatingDelete: 'This is a repeating transaction. Do you want to delete all of these transactions?',
    onlyThis: 'Only this one', thisAndFuture: 'This and future', transactionActions: 'Transaction actions',
    editTransaction: 'Edit transaction', delete: 'Delete',
    box: 'Box', connectedAccount: 'Connected account',
  },
  nl: {
    income: 'Inkomsten', expense: 'Uitgaven', screenTitle: 'Toekomstige financiën', screenSubtitle: 'Zie wat je geld doet',
    timeline: 'Toekomstige transacties', noEvents: 'Nog geen toekomstige transacties.', today: 'Vandaag', projectedAt: 'Verwacht op',
    addTransaction: 'Transactie toevoegen', insights: 'Toekomstinzichten', close: 'Sluiten', noBoxes: 'Geen spaarpotten beschikbaar.',
    editFuture: 'Toekomstige transactie bewerken', addFuture: 'Toekomstige transactie toevoegen', amount: 'Bedrag', selectDate: 'Kies een datum',
    prev: 'Vorige', next: 'Volgende', repeated: 'Terugkerende transactie', daily: 'Dagelijks', weekly: 'Wekelijks', monthly: 'Maandelijks', yearly: 'Jaarlijks',
    description: 'Omschrijving', addToSource: 'Bijschrijven op', expenseFromSource: 'Afschrijven van',
    noSources: 'Geen spaarpotten of gekoppelde rekeningen beschikbaar.', cancel: 'Annuleren', save: 'Opslaan', done: 'Gereed',
    unableToSave: 'Toekomstige transactie opslaan mislukt', tryAgain: 'Probeer het opnieuw.',
    unableToDeleteOccurrence: 'Deze herhaling verwijderen is mislukt', unableToDelete: 'Transactie verwijderen mislukt',
    deleteTransaction: 'Transactie verwijderen', confirmDelete: 'Weet je zeker dat je deze transactie wilt verwijderen?',
    repeatingDelete: 'Dit is een terugkerende transactie. Wil je alle herhalingen verwijderen?',
    onlyThis: 'Alleen deze', thisAndFuture: 'Deze en toekomstige', transactionActions: 'Transactieopties',
    editTransaction: 'Transactie bewerken', delete: 'Verwijderen',
    box: 'Spaarpot', connectedAccount: 'Gekoppelde rekening',
  },
};

function parseNumberInput(value) {
  if (!value) return Number.NaN;
  const parsed = parseFloat(String(value).replace(',', '.'));
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function toDateKey(value) {
  return String(value || '').trim();
}

function formatDateKeyFromParts(year, monthIndex, day) {
  const yyyy = String(year);
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const candidate = new Date(year, month, day);
  if (
    candidate.getFullYear() !== year
    || candidate.getMonth() !== month
    || candidate.getDate() !== day
  ) {
    return null;
  }
  return candidate;
}

function shiftDateByFrequency(date, frequency) {
  const next = new Date(date);
  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
    return next;
  }
  if (frequency === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
    return next;
  }
  next.setMonth(next.getMonth() + 1);
  return next;
}

function getAccountColor(account) {
  if (account?.color) return account.color;
  return DEFAULT_ACCOUNT_COLORS[account?.type] || DEFAULT_ACCOUNT_COLORS.Savings;
}

const TimelineRow = memo(function TimelineRow({ event, currency, language, strings, isDark, onPress, onLongPress, onLayout }) {
  const parsedDate = parseDateKey(event.date);
  const formattedDate = parsedDate?.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB') || event.date;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(event)}
      onLongPress={() => onLongPress(event)}
      style={[styles.timelineRow, isDark ? styles.timelineRowDark : null]}
      onLayout={(layoutEvent) => onLayout(event.id, layoutEvent.nativeEvent)}
    >
      <View style={styles.timelineMeta}>
        <Text style={[styles.timelineDate, isDark ? styles.titleTextDark : null]}>{formattedDate}</Text>
        <Text style={styles.timelineType}>{event.type === 'income' ? strings.income : strings.expense}</Text>
        <Text style={[styles.timelineDescription, isDark ? styles.timelineDescriptionDark : null]}>{event.description || '-'}</Text>
      </View>
      <View style={styles.timelineAmounts}>
        <Text style={[styles.timelineAmount, event.type === 'income' ? styles.incomeText : styles.expenseText]}>
          {event.type === 'income' ? '+' : '-'}{formatCurrency(event.amount, currency)}
        </Text>
        <Text style={[styles.timelineBalance, isDark ? styles.titleTextDark : null]}>{formatCurrency(event.resultingBalance, currency)}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function FutureScreen({ setPagerSwipeEnabled }) {
  const { width } = useWindowDimensions();
  const [userId, setUserId] = useState(() => getAuth().currentUser?.uid || null);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [events, setEvents] = useState([]);
  const [theme, setTheme] = useState('light');
  const [currency, setCurrency] = useState('EUR');
  const [language, setLanguage] = useState('en');
  const [connectedWallets, setConnectedWallets] = useState([]);
  const [convertedWalletBalances, setConvertedWalletBalances] = useState({});
  const [investmentAccounts, setInvestmentAccounts] = useState([]);
  const [convertedInvestmentBalances, setConvertedInvestmentBalances] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [insightsVisible, setInsightsVisible] = useState(false);
  const [futureGraphRange, setFutureGraphRange] = useState('1Y');
  const [eventType, setEventType] = useState('income');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState('monthly');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [descriptionInput, setDescriptionInput] = useState('');
  const [editingTransactionId, setEditingTransactionId] = useState(null);
  const [transactionMenuEvent, setTransactionMenuEvent] = useState(null);
  const [visibleTimelineCount, setVisibleTimelineCount] = useState(INITIAL_TIMELINE_ROW_COUNT);
  const [timelineScrollY, setTimelineScrollY] = useState(0);
  const [timelineRowLayouts, setTimelineRowLayouts] = useState({});
  const [pullActive, setPullActive] = useState(false);
  const [graphCardHeight, setGraphCardHeight] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isRefreshSettling, setIsRefreshSettling] = useState(false);
  const [manualCursorPoint, setManualCursorPoint] = useState(null);
  const lastScrollYRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const refreshBusyRef = useRef(false);
  const timelineScrollRef = useRef(null);
  const timelineContentHeightRef = useRef(0);
  const timelineViewportHeightRef = useRef(0);
  const graphDragStartOffsetRef = useRef(0);
  const graphInteractionMovedRef = useRef(false);
  const manualCursorActiveRef = useRef(false);
  const manualCursorTimerRef = useRef(null);
  const lastCursorPointIdRef = useRef(null);
  const refreshHoldAnim = useRef(new Animated.Value(0)).current;
  const graphPullAnim = useRef(new Animated.Value(0)).current;
  const coinSpinAnim = useRef(new Animated.Value(0)).current;
  const coinOpacityAnim = useRef(new Animated.Value(0)).current;
  const coinSpinLoopRef = useRef(null);

  const applyPullDistance = (value) => {
    const next = Math.max(0, value);
    pullDistanceRef.current = next;
    if (!refreshBusyRef.current) {
      coinOpacityAnim.setValue(Math.max(0, Math.min(1, (next - 8) / 22)));
    }
    const nextActive = next > 8;
    setPullActive((previous) => (previous === nextActive ? previous : nextActive));
  };

  useEffect(() => onAuthStateChanged(getAuth(), (user) => {
    setUserId(user?.uid || null);
  }), []);

  useEffect(() => {
    if (!userId) {
      setAccounts([]);
      setCurrentBalance(0);
      return undefined;
    }

    const unsubscribe = subscribeToAccounts(userId, (accounts) => {
      const normalizedAccounts = accounts || [];
      setAccounts(normalizedAccounts);
      const total = normalizedAccounts.reduce((sum, account) => sum + (Number(account?.balance) || 0), 0);
      setCurrentBalance(total);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setEvents([]);
      return undefined;
    }

    return subscribeToFutureTransactions(userId, setEvents, (error) => {
      console.warn('Unable to load future transactions:', error);
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;

    const unsubscribe = subscribeToUserDocument(userId, (docSnapshot) => {
      const data = docSnapshot.data();
      setTheme(data?.themePreference || 'light');
      setCurrency(data?.currencyPreference || 'EUR');
      setLanguage(data?.languagePreference === 'nl' ? 'nl' : 'en');
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setConnectedWallets([]);
      return undefined;
    }

    const unsubscribe = subscribeToConnectedWallets(userId, (wallets) => {
      setConnectedWallets(wallets || []);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setInvestmentAccounts([]);
      setConvertedInvestmentBalances({});
      return undefined;
    }

    return subscribeToInvestmentAccounts(userId, (nextAccounts) => {
      setInvestmentAccounts(nextAccounts || []);
    });
  }, [userId]);

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
      if (investmentAccounts.length === 0) {
        if (!cancelled) setConvertedInvestmentBalances({});
        return;
      }

      const entries = await Promise.all(investmentAccounts.map(async (account) => {
        const amount = Number(account?.totalValue) || 0;
        const sourceCurrency = account?.currency || currency;
        try {
          return [account.id, await convertCurrencyAmount(amount, sourceCurrency, currency)];
        } catch (_error) {
          return [account.id, sourceCurrency === currency ? amount : 0];
        }
      }));

      if (!cancelled) setConvertedInvestmentBalances(Object.fromEntries(entries));
    };

    syncInvestmentConversions();
    return () => {
      cancelled = true;
    };
  }, [investmentAccounts, currency]);

  const sortedEvents = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const horizonEnd = new Date(now);
    horizonEnd.setDate(horizonEnd.getDate() + RECURRENCE_LOOKAHEAD_DAYS);
    const expanded = [];

    (events || []).forEach((event) => {
      const baseDate = parseDateKey(event.date);
      if (!baseDate) return;

      const excludedDates = Array.isArray(event.excludedDates) ? event.excludedDates : [];
      const recurrenceEndKey = event.recurrenceEndDate || null;

      const pushOccurrence = (dateValue, suffix) => {
        if (dateValue < now || dateValue > horizonEnd) return;
        const dateKey = formatDateKeyFromParts(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
        if (recurrenceEndKey && dateKey > recurrenceEndKey) return;
        if (excludedDates.includes(dateKey)) return;
        expanded.push({
          ...event,
          id: suffix ? `${event.id}-${suffix}` : event.id,
          baseId: event.id,
          originalDate: event.date,
          date: dateKey,
        });
      };

      pushOccurrence(baseDate, null);

      if (!event?.isRecurring) return;

      let nextDate = new Date(baseDate);
      for (let i = 1; i <= RECURRENCE_MAX_OCCURRENCES; i += 1) {
        nextDate = shiftDateByFrequency(nextDate, event.recurrenceFrequency || 'monthly');
        if (nextDate > horizonEnd) break;
        pushOccurrence(nextDate, `r${i}`);
      }
    });

    return expanded.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events]);

  const connectedWalletsTotal = useMemo(() => {
    return connectedWallets.reduce((sum, wallet) => sum + (convertedWalletBalances[wallet.id] || 0), 0);
  }, [connectedWallets, convertedWalletBalances]);

  const investmentAccountsTotal = useMemo(() => (
    investmentAccounts.reduce((sum, account) => sum + (convertedInvestmentBalances[account.id] || 0), 0)
  ), [investmentAccounts, convertedInvestmentBalances]);

  const sourceOptions = useMemo(() => {
    const accountOptions = (accounts || []).map((account) => ({
      id: `account:${account.id}`,
      sourceId: account.id,
      sourceType: 'account',
      label: account.name || FUTURE_TRANSLATIONS[language].box,
      color: getAccountColor(account),
    }));
    const walletOptions = (connectedWallets || []).map((wallet) => ({
      id: `wallet:${wallet.id}`,
      sourceId: wallet.id,
      sourceType: 'wallet',
      label: wallet.accountDisplayName || wallet.nickname || wallet.bankName || FUTURE_TRANSLATIONS[language].connectedAccount,
      color: '#e2e8f0',
    }));
    return [...accountOptions, ...walletOptions];
  }, [accounts, connectedWallets, language]);

  useEffect(() => {
    setSelectedSourceId((previous) => {
      if (previous && sourceOptions.some((source) => source.id === previous)) {
        return previous;
      }
      return '';
    });
  }, [sourceOptions]);

  const totalBalance = currentBalance + connectedWalletsTotal + investmentAccountsTotal;

  const boxInsights = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const projectionEnd = new Date(now);
    projectionEnd.setDate(projectionEnd.getDate() + RECURRENCE_LOOKAHEAD_DAYS);
    const chartWidth = Math.max(180, width - 96);
    const chartHeight = 82;
    const minX = 8;
    const maxX = chartWidth - 8;
    const minY = 8;
    const maxY = chartHeight - 8;
    const firstDate = now.getTime();
    const lastDate = projectionEnd.getTime();

    return accounts.map((account) => {
      let running = Number(account.balance) || 0;
      const points = [{ date: firstDate, balance: running }];

      sortedEvents.forEach((event) => {
        const appliesToAccount = event.sourceType === 'account' && event.sourceId === account.id;
        const isLegacyExpense = event.expenseAccountId === account.id;
        if (!appliesToAccount && !isLegacyExpense) return;
        running = event.type === 'income' ? running + event.amount : running - event.amount;
        points.push({ date: parseDateKey(event.date)?.getTime() || firstDate, balance: running });
      });

      points.push({ date: lastDate, balance: running });
      const balances = points.map((point) => point.balance);
      const minBalance = Math.min(...balances);
      const maxBalance = Math.max(...balances);
      const balanceRange = maxBalance - minBalance;
      const path = points.reduce((value, point, index) => {
        const x = minX + ((maxX - minX) * ((point.date - firstDate) / (lastDate - firstDate)));
        const y = balanceRange === 0
          ? (minY + maxY) / 2
          : maxY - (((point.balance - minBalance) / balanceRange) * (maxY - minY));
        return `${value}${index === 0 ? 'M' : ' L'} ${x} ${y}`;
      }, '');

      return {
        ...account,
        chartHeight,
        chartPath: path,
        chartWidth,
        color: getAccountColor(account),
        projectedBalance: running,
      };
    });
  }, [accounts, sortedEvents, width]);

  const projectedBalance = useMemo(() => {
    return sortedEvents.reduce((sum, event) => {
      return event.type === 'income' ? sum + event.amount : sum - event.amount;
    }, totalBalance);
  }, [totalBalance, sortedEvents]);

  const graphSeries = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const historyStart = new Date(now);
    historyStart.setDate(historyStart.getDate() - FUTURE_GRAPH_HISTORY_DAYS[futureGraphRange]);
    const projectionEnd = new Date(now);
    projectionEnd.setDate(projectionEnd.getDate() + FUTURE_GRAPH_RANGES[futureGraphRange]);
    const base = [
      { id: 'history-start', date: formatDateKeyFromParts(historyStart.getFullYear(), historyStart.getMonth(), historyStart.getDate()), balance: totalBalance, isFuture: false },
      { id: 'today', date: formatDateKeyFromParts(now.getFullYear(), now.getMonth(), now.getDate()), balance: totalBalance, isFuture: false },
    ];

    let running = totalBalance;
    const futurePoints = sortedEvents
      .filter((event) => {
        const eventDate = parseDateKey(event.date);
        return eventDate && eventDate <= projectionEnd;
      })
      .map((event) => {
        running = event.type === 'income' ? running + event.amount : running - event.amount;
        return { id: event.id, date: event.date, balance: running, isFuture: true };
      });

    return [
      ...base,
      ...futurePoints,
      { id: 'projection-end', date: formatDateKeyFromParts(projectionEnd.getFullYear(), projectionEnd.getMonth(), projectionEnd.getDate()), balance: running, isFuture: true },
    ];
  }, [futureGraphRange, sortedEvents, totalBalance]);

  const chart = useMemo(() => {
    // width minus card margins, card padding, graph wrap padding/border and the y-axis column
    const chartWidth = Math.max(180, width - 146);
    const chartHeight = 168;
    const isDenseRange = FUTURE_GRAPH_DENSE_RANGES.includes(futureGraphRange);
    const minX = 4;
    const maxX = chartWidth - 8;
    const minY = 12;
    const maxY = chartHeight - 20;

    if (graphSeries.length === 0) {
      return { chartWidth, chartHeight, futurePath: '', maxValue: 0, minValue: 0, startLabel: '', endLabel: '' };
    }

    const values = graphSeries.map((point) => point.balance);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const range = maxValue - minValue;
    const firstDate = parseDateKey(graphSeries[0]?.date)?.getTime() || Date.now();
    const lastDate = parseDateKey(graphSeries[graphSeries.length - 1]?.date)?.getTime() || firstDate;
    const timeRange = Math.max(1, lastDate - firstDate);

    const points = graphSeries.map((point) => {
      const pointDate = parseDateKey(point.date)?.getTime() || firstDate;
      const x = minX + ((maxX - minX) * ((pointDate - firstDate) / timeRange));
      const y = range === 0
        ? (minY + maxY) / 2
        : maxY - (((point.balance - minValue) / range) * (maxY - minY));
      return { ...point, x, y };
    });

    const buildStepPath = (pathPoints) => {
      if (!pathPoints.length) return '';
      return pathPoints.reduce((path, point, index) => {
        if (index === 0) return `M ${point.x} ${point.y}`;
        const previousPoint = pathPoints[index - 1];
        return `${path} L ${point.x} ${previousPoint.y} L ${point.x} ${point.y}`;
      }, '');
    };

    // Long ranges keep a readable trend line by sampling the balance at fixed dates.
    const simplifyPoints = (pathPoints) => {
      if (pathPoints.length <= MAX_TREND_POINTS) return pathPoints;
      const startTime = parseDateKey(pathPoints[0].date)?.getTime() || firstDate;
      const endTime = parseDateKey(pathPoints[pathPoints.length - 1].date)?.getTime() || lastDate;
      const bucketSize = Math.max(1, (endTime - startTime) / (MAX_TREND_POINTS - 1));
      const sampled = [pathPoints[0]];
      let pointIndex = 0;
      for (let bucket = 1; bucket < MAX_TREND_POINTS; bucket += 1) {
        const bucketEnd = startTime + (bucketSize * bucket);
        let lastInBucket = sampled[sampled.length - 1];
        while (
          pointIndex + 1 < pathPoints.length
          && (parseDateKey(pathPoints[pointIndex + 1].date)?.getTime() || startTime) <= bucketEnd
        ) {
          pointIndex += 1;
          lastInBucket = pathPoints[pointIndex];
        }
        if (lastInBucket !== sampled[sampled.length - 1]) {
          sampled.push(lastInBucket);
        }
      }
      const finalPoint = pathPoints[pathPoints.length - 1];
      if (sampled[sampled.length - 1] !== finalPoint) {
        sampled.push(finalPoint);
      }
      return sampled;
    };

    const buildTrendPath = (pathPoints) => {
      const cleanedPoints = pathPoints.filter(Boolean);
      if (!isDenseRange) return buildStepPath(cleanedPoints);
      return buildStepPath(simplifyPoints(cleanedPoints));
    };

    const cursorPoints = (() => {
      if (FUTURE_GRAPH_RANGES[futureGraphRange] > CURSOR_DAILY_MAX_DAYS) return points;
      const dailyPoints = [];
      const cursorDate = new Date(firstDate);
      const endDate = new Date(lastDate);
      let pointIndex = 0;
      let currentPoint = points[0];
      while (cursorDate.getTime() <= endDate.getTime()) {
        const cursorTime = cursorDate.getTime();
        while (
          pointIndex + 1 < points.length
          && (parseDateKey(points[pointIndex + 1].date)?.getTime() || firstDate) <= cursorTime
        ) {
          pointIndex += 1;
          currentPoint = points[pointIndex];
        }
        const dateKey = formatDateKeyFromParts(cursorDate.getFullYear(), cursorDate.getMonth(), cursorDate.getDate());
        dailyPoints.push({
          id: `day-${dateKey}`,
          date: dateKey,
          balance: currentPoint.balance,
          isFuture: currentPoint.isFuture,
          x: minX + ((maxX - minX) * ((cursorTime - firstDate) / timeRange)),
          y: range === 0
            ? (minY + maxY) / 2
            : maxY - (((currentPoint.balance - minValue) / range) * (maxY - minY)),
        });
        cursorDate.setDate(cursorDate.getDate() + 1);
      }
      return dailyPoints;
    })();

    return {
      chartWidth,
      chartHeight,
      historicalPath: buildTrendPath(points.filter((point) => !point.isFuture)),
      futurePath: buildTrendPath([points.find((point) => point.id === 'today'), ...points.filter((point) => point.isFuture)]),
      points,
      cursorPoints,
      maxValue,
      minValue,
      startLabel: new Date(firstDate).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short', day: 'numeric' }),
      endLabel: new Date(lastDate).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short', day: 'numeric' }),
    };
  }, [futureGraphRange, graphSeries, language, width]);

  const isDark = theme === 'dark';
  const strings = FUTURE_TRANSLATIONS[language] || FUTURE_TRANSLATIONS.en;
  const futureGradientColors = isDark ? APP_BACKGROUND_GRADIENT.dark : APP_BACKGROUND_GRADIENT.light;

  const timelineRows = useMemo(() => {
    let running = totalBalance;
    return sortedEvents.map((event) => {
      running = event.type === 'income' ? running + event.amount : running - event.amount;
      return {
        ...event,
        resultingBalance: running,
      };
    });
  }, [sortedEvents, totalBalance]);

  const timelineProgress = useMemo(() => {
    const visibleRows = timelineRows.slice(0, visibleTimelineCount);
    if (visibleRows.length === 0) return 0;

    const orderedLayouts = visibleRows
      .map((event) => timelineRowLayouts[event.id])
      .filter(Boolean);

    if (orderedLayouts.length !== visibleRows.length) return 0;

    let progress = 0;
    for (let index = 0; index < orderedLayouts.length; index += 1) {
      const current = orderedLayouts[index];
      const next = orderedLayouts[index + 1];
      const segmentStart = current.y;
      const segmentEnd = next ? next.y : current.y + Math.max(1, current.height);
      const segmentLength = Math.max(1, segmentEnd - segmentStart);

      if (timelineScrollY < segmentStart) break;

      const ratio = Math.max(0, Math.min(1, (timelineScrollY - segmentStart) / segmentLength));
      progress = Math.min(visibleRows.length, index + 1 + ratio);

      if (timelineScrollY < segmentEnd) break;
    }

    return progress;
  }, [timelineRowLayouts, timelineRows, timelineScrollY, visibleTimelineCount]);

  const scrollChartCursor = useMemo(() => {
    if (!chart.points?.length || timelineProgress <= 0) return null;
    const activeIndex = Math.min(sortedEvents.length - 1, Math.max(0, Math.floor(timelineProgress) - 1));
    const activeEventId = sortedEvents[activeIndex]?.id;
    return chart.points.find((point) => point.id === activeEventId) || chart.points[chart.points.length - 1];
  }, [chart.points, sortedEvents, timelineProgress]);
  const chartCursor = manualCursorPoint || scrollChartCursor;

  const activeTimelineDate = useMemo(() => {
    if (timelineRows.length === 0 || timelineProgress <= 0) {
      return FUTURE_TRANSLATIONS[language].today;
    }
    const activeIndex = Math.min(timelineRows.length - 1, Math.max(0, Math.floor(timelineProgress) - 1));
    const activeDate = parseDateKey(timelineRows[activeIndex]?.date);
    return activeDate?.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB') || FUTURE_TRANSLATIONS[language].today;
  }, [language, timelineProgress, timelineRows]);

  const dynamicProjectedBalance = useMemo(() => {
    if (timelineRows.length === 0 || timelineProgress <= 0) {
      return totalBalance;
    }
    const activeIndex = Math.min(timelineRows.length - 1, Math.max(0, Math.floor(timelineProgress) - 1));
    return timelineRows[activeIndex]?.resultingBalance ?? totalBalance;
  }, [timelineProgress, timelineRows, totalBalance]);

  const calendarMonthLabel = useMemo(() => {
    return calendarMonth.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'long', year: 'numeric' });
  }, [calendarMonth, language]);

  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const startOffset = (firstOfMonth.getDay() + (language === 'nl' ? 6 : 0)) % 7;
    const cells = [];

    for (let i = 0; i < startOffset; i += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(day);
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return cells;
  }, [calendarMonth, language]);

  const calendarWeekdays = useMemo(() => {
    const locale = language === 'nl' ? 'nl-NL' : 'en-GB';
    const firstDay = language === 'nl' ? 2 : 1;
    return Array.from({ length: 7 }, (_, index) => (
      new Date(2023, 0, firstDay + index).toLocaleDateString(locale, { weekday: 'short' })
    ));
  }, [language]);

  const openModal = () => {
    setEditingTransactionId(null);
    setEventType('income');
    setSelectedSourceId('');
    setAmountInput('');
    setDateInput('');
    setIsRecurring(false);
    setRecurrenceFrequency('monthly');
    setCalendarVisible(false);
    setDescriptionInput('');
    setModalVisible(true);
  };

  const openEditModal = (event) => {
    setEditingTransactionId(event.baseId || event.id);
    setEventType(event.type || 'income');
    setSelectedSourceId(event.sourceType && event.sourceId ? `${event.sourceType}:${event.sourceId}` : '');
    setAmountInput(event.amount != null ? String(event.amount) : '');
    setDateInput(event.originalDate || event.date || '');
    setIsRecurring(!!event.isRecurring);
    setRecurrenceFrequency(event.recurrenceFrequency || 'monthly');
    setCalendarVisible(false);
    setDescriptionInput(event.description || '');
    setModalVisible(true);
  };

  const closeModal = () => {
    setCalendarVisible(false);
    setModalVisible(false);
    setEditingTransactionId(null);
  };

  const openCalendar = () => {
    const parsed = parseDateKey(dateInput);
    const baseDate = parsed || new Date();
    setCalendarMonth(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
    setCalendarVisible(true);
  };

  const goCalendarMonth = (delta) => {
    setCalendarMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + delta, 1));
  };

  const handleSelectCalendarDate = (day) => {
    if (!day) return;
    const value = formatDateKeyFromParts(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    setDateInput(value);
    setCalendarVisible(false);
  };

  const handleTimelineScroll = (event) => {
    const rawOffsetY = event?.nativeEvent?.contentOffset?.y || 0;
    const nextY = Math.max(0, rawOffsetY);
    const nextPullDistance = Math.max(0, -rawOffsetY);
    applyPullDistance(nextPullDistance);
    if (Math.abs(nextY - lastScrollYRef.current) < 0.5) return;
    lastScrollYRef.current = nextY;
    setTimelineScrollY(nextY);

    const distanceToBottom = timelineContentHeightRef.current - (nextY + timelineViewportHeightRef.current);
    if (distanceToBottom < TIMELINE_LOAD_MORE_THRESHOLD) {
      setVisibleTimelineCount((previous) => (
        previous >= timelineRows.length ? previous : Math.min(timelineRows.length, previous + TIMELINE_ROW_BATCH_SIZE)
      ));
    }
  };

  const handleTimelineScrollEnd = () => {
    applyPullDistance(0);
  };

  const graphPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_event, gestureState) => (
      !manualCursorActiveRef.current
      && Math.abs(gestureState.dy) > 2
      && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
    ),
    onPanResponderGrant: () => {
      graphDragStartOffsetRef.current = lastScrollYRef.current;
      graphInteractionMovedRef.current = false;
    },
    onPanResponderMove: (_event, gestureState) => {
      graphInteractionMovedRef.current = true;
      const maxOffset = Math.max(0, timelineContentHeightRef.current - timelineViewportHeightRef.current);
      const rawOffset = graphDragStartOffsetRef.current - gestureState.dy;
      const offset = Math.max(0, Math.min(maxOffset, rawOffset));
      const overscroll = rawOffset < 0 ? Math.min(-rawOffset, REFRESH_TRIGGER_DISTANCE) : 0;
      graphPullAnim.setValue(overscroll);
      applyPullDistance(overscroll);
      timelineScrollRef.current?.scrollTo({ y: offset, animated: false });
    },
    onPanResponderRelease: (_event, gestureState) => {
      if (!graphInteractionMovedRef.current) return;
      const shouldRefresh = graphDragStartOffsetRef.current <= 0 && gestureState.dy >= REFRESH_TRIGGER_DISTANCE;
      graphPullAnim.setValue(0);
      if (shouldRefresh) {
        refreshFutureTimeline();
        return;
      }
      const maxOffset = Math.max(0, timelineContentHeightRef.current - timelineViewportHeightRef.current);
      const currentOffset = graphDragStartOffsetRef.current - gestureState.dy;
      const momentumOffset = currentOffset - (gestureState.vy * 220);
      timelineScrollRef.current?.scrollTo({
        y: Math.max(0, Math.min(maxOffset, momentumOffset)),
        animated: true,
      });
    },
  }), []);

  const releaseManualCursor = () => {
    if (manualCursorTimerRef.current) {
      clearTimeout(manualCursorTimerRef.current);
      manualCursorTimerRef.current = null;
    }
    if (manualCursorActiveRef.current) {
      manualCursorActiveRef.current = false;
      setPagerSwipeEnabled?.(true);
      setManualCursorPoint(null);
    }
  };

  const chartCursorPanResponder = useMemo(() => {
    const findPointForX = (touchX) => {
      const points = chart.cursorPoints || chart.points || [];
      if (points.length === 0) return null;
      return points.reduce((closest, point) => (
        Math.abs(point.x - touchX) < Math.abs(closest.x - touchX) ? point : closest
      ), points[0]);
    };

    const setCursorPoint = (point) => {
      const pointId = point?.id || null;
      if (pointId === lastCursorPointIdRef.current) return;
      lastCursorPointIdRef.current = pointId;
      setManualCursorPoint(point);
    };

    const clearManualCursor = () => {
      if (manualCursorTimerRef.current) {
        clearTimeout(manualCursorTimerRef.current);
        manualCursorTimerRef.current = null;
      }
      manualCursorActiveRef.current = false;
      lastCursorPointIdRef.current = null;
      setPagerSwipeEnabled?.(true);
      setManualCursorPoint(null);
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => manualCursorActiveRef.current,
      onMoveShouldSetPanResponderCapture: () => manualCursorActiveRef.current,
      onPanResponderTerminationRequest: () => !manualCursorActiveRef.current,
      onPanResponderGrant: (event) => {
        const startX = event.nativeEvent.locationX;
        manualCursorTimerRef.current = setTimeout(() => {
          manualCursorActiveRef.current = true;
          graphInteractionMovedRef.current = true;
          setPagerSwipeEnabled?.(false);
          setCursorPoint(findPointForX(startX));
        }, 300);
      },
      onPanResponderMove: (event, gestureState) => {
        if (!manualCursorActiveRef.current) {
          if (Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6) {
            clearManualCursor();
          }
          return;
        }
        setCursorPoint(findPointForX(event.nativeEvent.locationX));
      },
      onPanResponderRelease: clearManualCursor,
      onPanResponderTerminate: clearManualCursor,
    });
  }, [chart.points, setPagerSwipeEnabled]);

  const refreshFutureTimeline = async () => {
    if (refreshing || isRefreshSettling) return;

    refreshBusyRef.current = true;
    setRefreshing(true);
    Animated.timing(coinOpacityAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
    Animated.timing(refreshHoldAnim, {
      toValue: REFRESH_HOLD_OFFSET,
      duration: 140,
      useNativeDriver: true,
    }).start();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    setRefreshing(false);
    setIsRefreshSettling(true);

    await new Promise((resolve) => setTimeout(resolve, 400));

    Animated.parallel([
      Animated.timing(coinOpacityAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(refreshHoldAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsRefreshSettling(false);
      refreshBusyRef.current = false;
      applyPullDistance(0);
      if (coinSpinLoopRef.current) {
        coinSpinLoopRef.current.stop();
        coinSpinLoopRef.current = null;
      }
      coinSpinAnim.stopAnimation();
      coinSpinAnim.setValue(0);
    });
  };

  const handleTimelineScrollEndDrag = () => {
    if (!refreshing && pullDistanceRef.current >= REFRESH_TRIGGER_DISTANCE) {
      refreshFutureTimeline();
      return;
    }
    handleTimelineScrollEnd();
  };

  const handleTimelineRowLayout = useCallback((eventId, nativeEvent) => {
    const y = nativeEvent?.layout?.y ?? 0;
    const height = nativeEvent?.layout?.height ?? 0;
    setTimelineRowLayouts((previous) => {
      const existing = previous[eventId];
      if (existing && existing.y === y && existing.height === height) {
        return previous;
      }
      return {
        ...previous,
        [eventId]: { y, height },
      };
    });
  }, []);

  const handleAddEvent = async () => {
    const amount = parseNumberInput(amountInput);
    const date = toDateKey(dateInput);
    if (Number.isNaN(amount) || amount <= 0 || !date || !selectedSourceId) return;
    if (!userId) return;
    const selectedSource = sourceOptions.find((source) => source.id === selectedSourceId) || null;

    const event = {
      type: eventType,
      amount,
      date,
      description: descriptionInput.trim(),
      isRecurring,
      recurrenceFrequency: isRecurring ? recurrenceFrequency : null,
      sourceId: selectedSource?.sourceId || null,
      sourceType: selectedSource?.sourceType || null,
      sourceName: selectedSource?.label || null,
      expenseAccountId: eventType === 'expense' ? (selectedSource?.sourceType === 'account' ? selectedSource.sourceId : null) : null,
      expenseAccountName: eventType === 'expense' ? (selectedSource?.label || null) : null,
    };

    try {
      if (editingTransactionId) {
        await updateFutureTransaction(userId, editingTransactionId, event);
        setEvents((previous) => previous.map((item) => (
          item.id === editingTransactionId ? { ...item, ...event } : item
        )));
      } else {
        const createdTransaction = await createFutureTransaction(userId, event);
        setEvents((previous) => {
          if (previous.some((item) => item.id === createdTransaction.id)) return previous;
          return [...previous, { id: createdTransaction.id, ...event }];
        });
      }
      closeModal();
    } catch (error) {
      console.warn('Unable to save future transaction:', error);
      Alert.alert(strings.unableToSave, error?.message || strings.tryAgain);
    }
  };

  const openTransactionMenu = useCallback((event) => {
    setTransactionMenuEvent(event);
  }, []);

  const closeTransactionMenu = () => {
    setTransactionMenuEvent(null);
  };

  const handleExcludeOccurrence = async (event) => {
    if (!userId || !event?.baseId) return;
    try {
      await excludeFutureTransactionOccurrence(userId, event.baseId, event.date);
      setEvents((previous) => previous.map((item) => (
        item.id === event.baseId
          ? { ...item, excludedDates: [...(Array.isArray(item.excludedDates) ? item.excludedDates : []), event.date] }
          : item
      )));
    } catch (error) {
      console.warn('Unable to delete this occurrence:', error);
      Alert.alert(strings.unableToDelete, error?.message || strings.tryAgain);
    }
  };

  const handleDeleteFutureOnward = async (event) => {
    if (!userId || !event?.baseId) return;
    try {
      if (event.date === event.originalDate) {
        await deleteFutureTransaction(userId, event.baseId);
        setEvents((previous) => previous.filter((item) => item.id !== event.baseId));
        return;
      }
      const occurrenceDate = parseDateKey(event.date);
      const cutoffDate = new Date(occurrenceDate);
      cutoffDate.setDate(cutoffDate.getDate() - 1);
      const cutoffKey = formatDateKeyFromParts(cutoffDate.getFullYear(), cutoffDate.getMonth(), cutoffDate.getDate());
      await updateFutureTransaction(userId, event.baseId, { recurrenceEndDate: cutoffKey });
      setEvents((previous) => previous.map((item) => (
        item.id === event.baseId ? { ...item, recurrenceEndDate: cutoffKey } : item
      )));
    } catch (error) {
      console.warn('Unable to delete future transactions:', error);
      Alert.alert(strings.unableToDelete, error?.message || strings.tryAgain);
    }
  };

  const handleDeleteSingleTransaction = async (event) => {
    if (!userId || !event?.baseId) return;
    try {
      await deleteFutureTransaction(userId, event.baseId);
      setEvents((previous) => previous.filter((item) => item.id !== event.baseId));
    } catch (error) {
      console.warn('Unable to delete future transaction:', error);
      Alert.alert(strings.unableToDelete, error?.message || strings.tryAgain);
    }
  };

  const handleDeleteTransaction = (event) => {
    if (!event?.isRecurring) {
      Alert.alert(
        strings.deleteTransaction,
        strings.confirmDelete,
        [
          { text: strings.cancel, style: 'cancel' },
          { text: strings.delete, style: 'destructive', onPress: () => handleDeleteSingleTransaction(event) },
        ]
      );
      return;
    }

    Alert.alert(
      strings.deleteTransaction,
      strings.repeatingDelete,
      [
        { text: strings.cancel, style: 'cancel' },
        { text: strings.onlyThis, onPress: () => handleExcludeOccurrence(event) },
        { text: strings.thisAndFuture, style: 'destructive', onPress: () => handleDeleteFutureOnward(event) },
      ]
    );
  };

  const handleTransactionMenuSelect = (actionId) => {
    const event = transactionMenuEvent;
    closeTransactionMenu();
    if (!event) return;
    if (actionId === 'edit') {
      openEditModal(event);
      return;
    }
    if (actionId === 'delete') {
      handleDeleteTransaction(event);
    }
  };

  const canSaveEvent = useMemo(() => {
    const amount = parseNumberInput(amountInput);
    const date = toDateKey(dateInput);
    return !Number.isNaN(amount) && amount > 0 && !!date && !!selectedSourceId;
  }, [amountInput, dateInput, selectedSourceId]);

  const coinSymbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€';
  const coinRotation = coinSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    const shouldShowCoin = refreshing || isRefreshSettling || pullActive;

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
      return;
    }

    coinOpacityAnim.setValue(0);
    if (coinSpinLoopRef.current) {
      coinSpinLoopRef.current.stop();
      coinSpinLoopRef.current = null;
    }
    coinSpinAnim.stopAnimation();
    coinSpinAnim.setValue(0);
  }, [coinOpacityAnim, coinSpinAnim, isRefreshSettling, pullActive, refreshing]);

  return (
    <View style={[styles.container, isDark ? styles.containerDark : null]}>
      <LinearGradient
        colors={futureGradientColors}
        locations={APP_BACKGROUND_GRADIENT.locations}
        start={APP_BACKGROUND_GRADIENT.start}
        end={APP_BACKGROUND_GRADIENT.end}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.content}>
        <Text style={[styles.screenTitle, language === 'nl' ? styles.screenTitleDutch : null, { color: isDark ? '#f8fafc' : '#14532d' }]}>{strings.screenTitle}</Text>
        <Text style={[styles.screenSubtitle, { color: isDark ? '#cbd5e1' : '#166534' }]}>{strings.screenSubtitle}</Text>
        <Animated.View style={[styles.timelineScroll, { transform: [{ translateY: refreshHoldAnim }, { translateY: graphPullAnim }] }]}>
          <ScrollView
            ref={timelineScrollRef}
            contentContainerStyle={[styles.timelineScrollContent, { paddingTop: graphCardHeight + 12 }]}
            onScroll={handleTimelineScroll}
            onScrollEndDrag={handleTimelineScrollEndDrag}
            onMomentumScrollEnd={handleTimelineScrollEnd}
            onLayout={(event) => {
              timelineViewportHeightRef.current = event.nativeEvent.layout.height;
            }}
            onContentSizeChange={(_width, height) => {
              timelineContentHeightRef.current = height;
            }}
            scrollEventThrottle={16}
          >
            <View style={styles.timelineSection}>
          <View style={[styles.timelineCard, isDark ? styles.timelineCardDark : null]}>
            <View style={styles.timelineHeaderRow}>
              <Text style={[styles.sectionTitle, isDark ? styles.titleTextDark : null]}>{strings.timeline}</Text>
            </View>
            {timelineRows.length === 0 ? (
              <Text style={[styles.emptyText, isDark ? styles.emptyTextDark : null]}>{strings.noEvents}</Text>
            ) : (
              timelineRows.slice(0, visibleTimelineCount).map((event) => (
                <TimelineRow
                  key={event.id}
                  event={event}
                  currency={currency}
                  language={language}
                  strings={strings}
                  isDark={isDark}
                  onPress={openTransactionMenu}
                  onLongPress={openTransactionMenu}
                  onLayout={handleTimelineRowLayout}
                />
              ))
            )}
          </View>
            </View>
          </ScrollView>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.pullIndicatorContainer,
            {
              top: 139 + graphCardHeight + 18,
              opacity: coinOpacityAnim,
            },
          ]}
        >
          <Animated.View style={[styles.coinIndicator, { transform: [{ rotate: coinRotation }] }]}> 
            <Text style={styles.coinText}>{coinSymbol}</Text>
          </Animated.View>
        </Animated.View>

        <View pointerEvents="box-none" style={styles.graphCardOverlay}>
          <View
            style={[styles.graphCard, isDark ? styles.graphCardDark : null]}
            onLayout={(event) => setGraphCardHeight(event.nativeEvent.layout.height)}
          >
            <View style={styles.futureRangeSelector}>
              {Object.keys(FUTURE_GRAPH_RANGES).map((range) => {
                const selected = futureGraphRange === range;
                return (
                  <TouchableOpacity
                    key={range}
                    activeOpacity={0.85}
                    onPress={() => setFutureGraphRange(range)}
                    style={[styles.futureRangeChip, selected ? styles.futureRangeChipActive : null]}
                  >
                    <Text style={[styles.futureRangeChipText, selected ? styles.futureRangeChipTextActive : null]}>{range}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View
              onTouchStart={() => {
                graphInteractionMovedRef.current = false;
              }}
              onTouchMove={() => {
                graphInteractionMovedRef.current = true;
              }}
              onTouchEnd={() => {
                releaseManualCursor();
                if (!graphInteractionMovedRef.current) {
                  setInsightsVisible(true);
                }
              }}
              onTouchCancel={releaseManualCursor}
              {...graphPanResponder.panHandlers}
            >
              <View style={[styles.graphWrap, isDark ? styles.graphWrapDark : null]}>
                <View style={styles.graphChartRow}>
                  <View style={styles.graphYAxis}>
                    {!chartCursor ? (
                      <>
                        <Text style={[styles.graphAxisValue, isDark ? styles.graphAxisValueDark : null]}>{formatCurrency(chart.maxValue, currency)}</Text>
                        <Text style={[styles.graphAxisValue, isDark ? styles.graphAxisValueDark : null]}>{formatCurrency(chart.minValue, currency)}</Text>
                      </>
                    ) : (
                      <Text
                        style={[
                          styles.graphAxisValue,
                          styles.graphCursorAxisValue,
                          isDark ? styles.graphAxisValueDark : null,
                          { top: Math.max(0, chartCursor.y - 6) },
                        ]}
                      >
                        {formatCurrency(chartCursor.balance, currency)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.graphPlotArea} {...chartCursorPanResponder.panHandlers}>
                    <Svg width={chart.chartWidth} height={chart.chartHeight}>
                      <Line x1="4" y1={chart.chartHeight - 20} x2={chart.chartWidth - 8} y2={chart.chartHeight - 20} stroke={isDark ? 'rgba(148,163,184,0.32)' : 'rgba(148,163,184,0.45)'} strokeWidth="1" />
                      {chart.historicalPath ? <Path d={chart.historicalPath} stroke="#84cc16" strokeWidth="2.4" fill="none" /> : null}
                      {chart.futurePath ? <Path d={chart.futurePath} stroke="#84cc16" strokeDasharray="3 2" strokeWidth="2.4" fill="none" /> : null}
                      {chartCursor ? (
                        <>
                          <Line x1="4" y1={chartCursor.y} x2={chartCursor.x} y2={chartCursor.y} stroke={isDark ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.7)'} strokeWidth="1" />
                          <Line x1={chartCursor.x} y1={chartCursor.y} x2={chartCursor.x} y2={chart.chartHeight - 20} stroke={isDark ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.7)'} strokeWidth="1" />
                          <SvgText x={chartCursor.x} y={chart.chartHeight - 3} fill={isDark ? '#ffffff' : '#0f172a'} fontSize="10" fontWeight="700" textAnchor="middle">
                            {new Date(parseDateKey(chartCursor.date)?.getTime() || Date.now()).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short', day: 'numeric' })}
                          </SvgText>
                        </>
                      ) : null}
                    </Svg>
                    {!chartCursor ? (
                      <View style={styles.graphXAxis}>
                        <Text style={[styles.graphAxisValue, isDark ? styles.graphAxisValueDark : null]}>{chart.startLabel}</Text>
                        <Text style={[styles.graphAxisValue, isDark ? styles.graphAxisValueDark : null]}>{chart.endLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.graphCardFooterRow}>
              <View style={styles.graphCardFooterTexts}>
                <Text
                  style={[styles.projectedBalanceLarge, isDark ? styles.projectedBalanceLargeDark : null]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {formatCurrency(dynamicProjectedBalance, currency)}
                </Text>
                <Text style={[styles.predictedText, isDark ? styles.predictedTextDark : null]} numberOfLines={1}>
                  {timelineProgress <= 0 ? strings.today : `${strings.projectedAt} ${activeTimelineDate}`}
                </Text>
              </View>
              <TouchableOpacity style={styles.timelineActionButton} onPress={openModal}>
                <Text style={styles.timelineActionButtonText}>{strings.addTransaction}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <Modal visible={insightsVisible} animationType="slide" transparent onRequestClose={() => setInsightsVisible(false)}>
        <View style={styles.insightsOverlay}>
          <TouchableWithoutFeedback onPress={() => setInsightsVisible(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.insightsContent, isDark ? styles.insightsContentDark : null]}>
            <View style={styles.insightsHeader}>
              <Text style={[styles.insightsTitle, isDark ? styles.titleTextDark : null]}>{strings.insights}</Text>
              <TouchableOpacity onPress={() => setInsightsVisible(false)} style={styles.insightsCloseButton}>
                <Text style={styles.insightsCloseText}>{strings.close}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.insightsList}>
              {boxInsights.length === 0 ? (
                <Text style={[styles.emptyText, isDark ? styles.emptyTextDark : null]}>{strings.noBoxes}</Text>
              ) : boxInsights.map((box) => {
                const textColor = getReadableTextColor(box.color);
                return (
                  <View key={box.id} style={[styles.insightBoxCard, { backgroundColor: box.color }]}>
                    <Text style={[styles.insightBoxName, { color: textColor }]}>{box.name || 'Box'}</Text>
                    <Text style={[styles.insightBoxBalance, { color: textColor }]}>{formatCurrency(box.projectedBalance, currency)}</Text>
                    <Svg width={box.chartWidth} height={box.chartHeight}>
                      <Path d={box.chartPath} stroke={textColor} strokeDasharray="6 4" strokeWidth="2.4" fill="none" />
                    </Svg>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAwareModalOverlay style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={closeModal}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
                <Text style={styles.modalTitle}>{editingTransactionId ? strings.editFuture : strings.addFuture}</Text>
                <View style={styles.typeToggleRow}>
                  <TouchableOpacity
                    onPress={() => setEventType('income')}
                    style={[styles.typeToggleButton, eventType === 'income' ? styles.typeToggleButtonIncome : null]}
                  >
                    <Text style={[styles.typeToggleButtonText, eventType === 'income' ? styles.typeToggleButtonTextActive : null]}>{strings.income}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setEventType('expense')}
                    style={[styles.typeToggleButton, styles.typeToggleButtonGap, eventType === 'expense' ? styles.typeToggleButtonExpense : null]}
                  >
                    <Text style={[styles.typeToggleButtonText, eventType === 'expense' ? styles.typeToggleButtonTextActive : null]}>{strings.expense}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={amountInput}
                  onChangeText={setAmountInput}
                  keyboardType="numeric"
                  placeholder={strings.amount}
                  placeholderTextColor="#334155"
                  inputAccessoryViewID={FUTURE_ACCESSORY_ID}
                  style={styles.modalInput}
                />
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={openCalendar}
                  style={styles.modalDateInputButton}
                >
                  <Text style={[styles.modalDateInputText, !dateInput ? styles.modalDateInputPlaceholder : null]}>
                    {parseDateKey(dateInput)?.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB') || strings.selectDate}
                  </Text>
                </TouchableOpacity>
                {calendarVisible ? (
                  <View style={styles.calendarPanel}>
                    <View style={styles.calendarHeaderRow}>
                      <TouchableOpacity style={styles.calendarNavButton} onPress={() => goCalendarMonth(-1)}>
                        <Text style={styles.calendarNavButtonText}>{strings.prev}</Text>
                      </TouchableOpacity>
                      <Text style={styles.calendarMonthLabel}>{calendarMonthLabel}</Text>
                      <TouchableOpacity style={styles.calendarNavButton} onPress={() => goCalendarMonth(1)}>
                        <Text style={styles.calendarNavButtonText}>{strings.next}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.calendarWeekdayRow}>
                      {calendarWeekdays.map((label) => (
                        <Text key={label} style={styles.calendarWeekdayText}>{label}</Text>
                      ))}
                    </View>
                    <View style={styles.calendarDaysGrid}>
                      {calendarDays.map((dayValue, index) => {
                        if (!dayValue) {
                          return <View key={`blank-${index}`} style={styles.calendarDayCell} />;
                        }
                        const value = formatDateKeyFromParts(calendarMonth.getFullYear(), calendarMonth.getMonth(), dayValue);
                        const selected = value === dateInput;
                        return (
                          <TouchableOpacity
                            key={value}
                            onPress={() => handleSelectCalendarDate(dayValue)}
                            style={[styles.calendarDayCell, selected ? styles.calendarDayCellSelected : null]}
                          >
                            <Text style={[styles.calendarDayText, selected ? styles.calendarDayTextSelected : null]}>{dayValue}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setIsRecurring((previous) => !previous)}
                  style={styles.recurrenceToggleRow}
                >
                  <View style={[styles.recurrenceCheckbox, isRecurring ? styles.recurrenceCheckboxChecked : null]}>
                    {isRecurring ? <Text style={styles.recurrenceCheckboxMark}>✓</Text> : null}
                  </View>
                  <Text style={styles.recurrenceToggleText}>{strings.repeated}</Text>
                </TouchableOpacity>
                {isRecurring ? (
                  <View style={styles.recurrenceOptionsRow}>
                    {['daily', 'weekly', 'monthly', 'yearly'].map((frequency) => {
                      const selected = recurrenceFrequency === frequency;
                      return (
                        <TouchableOpacity
                          key={frequency}
                          onPress={() => setRecurrenceFrequency(frequency)}
                          style={[styles.recurrenceOptionButton, selected ? styles.recurrenceOptionButtonActive : null]}
                        >
                          <Text style={[styles.recurrenceOptionButtonText, selected ? styles.recurrenceOptionButtonTextActive : null]}>
                            {strings[frequency]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
                <TextInput
                  value={descriptionInput}
                  onChangeText={setDescriptionInput}
                  placeholder={strings.description}
                  placeholderTextColor="#334155"
                  inputAccessoryViewID={FUTURE_ACCESSORY_ID}
                  style={styles.modalInput}
                />
                <View style={styles.expenseSourceSection}>
                  <Text style={styles.expenseSourceLabel}>{eventType === 'income' ? strings.addToSource : strings.expenseFromSource}</Text>
                  {sourceOptions.length === 0 ? (
                    <Text style={styles.expenseSourceEmpty}>{strings.noSources}</Text>
                  ) : (
                    <View style={styles.expenseSourceOptionsRow}>
                      {sourceOptions.map((source) => {
                        const selected = selectedSourceId === source.id;
                        const chipBackground = source.color || '#f8fafc';
                        const chipTextColor = getReadableTextColor(chipBackground);
                        return (
                          <TouchableOpacity
                            key={source.id}
                            onPress={() => setSelectedSourceId(source.id)}
                            style={[
                              styles.expenseSourceOption,
                              {
                                backgroundColor: chipBackground,
                                borderColor: selected ? '#0f172a' : chipBackground,
                              },
                              selected ? styles.expenseSourceOptionActive : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.expenseSourceOptionText,
                                { color: chipTextColor },
                                selected ? styles.expenseSourceOptionTextActive : null,
                              ]}
                            >
                              {source.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
                <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
                  <TouchableOpacity style={[styles.modalButtonCancel, styles.goalModalButtonCancelCompact]} onPress={closeModal}>
                    <Text style={styles.modalButtonText}>{strings.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButtonConfirm,
                      styles.goalModalButtonConfirmCompact,
                      !canSaveEvent ? styles.modalButtonConfirmDisabled : null,
                    ]}
                    onPress={handleAddEvent}
                    disabled={!canSaveEvent}
                  >
                    <Text style={styles.goalModalButtonConfirmText}>{strings.save}</Text>
                  </TouchableOpacity>
                </View>
          </ScrollView>
        </KeyboardAwareModalOverlay>

        <IOSKeyboardDoneAccessory nativeID={FUTURE_ACCESSORY_ID} label={strings.done} />
      </Modal>

      <CardActionMenu
        visible={!!transactionMenuEvent}
        title={strings.transactionActions}
        items={[
          { id: 'edit', label: strings.editTransaction },
          { id: 'delete', label: strings.deleteTransaction, destructive: true },
        ]}
        onSelect={handleTransactionMenuSelect}
        onClose={closeTransactionMenu}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_BACKGROUND_GRADIENT.solidLight },
  containerDark: { backgroundColor: APP_BACKGROUND_GRADIENT.solidDark },
  content: { flex: 1, paddingTop: 62 },
  screenTitle: { fontSize: 32, fontWeight: '900', color: '#d1fae5', marginHorizontal: 20, marginTop: 0, marginBottom: 0 },
  screenTitleDutch: { fontSize: 26 },
  screenSubtitle: { fontSize: 14, color: '#bbf7d0', marginHorizontal: 20, marginTop: 4, marginBottom: 18 },
  graphCardOverlay: { position: 'absolute', top: 139, left: 20, right: 20, zIndex: 1 },
  graphCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  graphCardDark: { backgroundColor: '#49804a' },
  graphCardFooterRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 66 },
  graphCardFooterTexts: { flex: 1, paddingRight: 10 },
  projectedBalanceLarge: { fontSize: 34, lineHeight: 40, fontWeight: '900', color: '#0f172a', marginTop: 4 },
  projectedBalanceLargeDark: { color: '#ffffff' },
  balanceText: { color: '#0f172a', fontWeight: '700' },
  balanceTextDark: { color: '#ffffff' },
  predictedText: { color: '#0f172a', fontWeight: '700' },
  predictedTextDark: { color: '#ffffff' },
  graphWrap: {
    marginTop: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: '#f8fafc',
  },
  graphWrapDark: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.34)' },
  graphLegend: { color: '#0f172a', fontSize: 12, marginBottom: 10 },
  graphLegendDark: { color: '#ffffff' },
  futureRangeSelector: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  futureRangeChip: { minWidth: 36, marginRight: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(132,204,22,0.3)', backgroundColor: 'rgba(236,252,203,0.55)', paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center' },
  futureRangeChipActive: { backgroundColor: '#84cc16', borderColor: '#65a30d' },
  futureRangeChipText: { color: '#4d7c0f', fontSize: 11, fontWeight: '700' },
  futureRangeChipTextActive: { color: '#f7fee7' },
  graphChartRow: { flexDirection: 'row', alignItems: 'flex-start' },
  graphYAxis: { width: 60, height: 168, justifyContent: 'space-between', paddingBottom: 19, paddingTop: 4 },
  graphAxisTitle: { color: '#334155', fontSize: 10, fontWeight: '700', flexWrap: 'nowrap' },
  graphAxisTitleDark: { color: '#ffffff' },
  graphAxisValue: { color: '#334155', fontSize: 9, fontWeight: '600', flexWrap: 'nowrap' },
  graphAxisValueDark: { color: '#ffffff' },
  graphCursorAxisValue: { position: 'absolute', left: 0, right: 4 },
  graphPlotArea: { flex: 1, minWidth: 0 },
  graphXAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -14, overflow: 'hidden' },
  graphXAxisTitle: { textAlign: 'center', marginTop: 5 },
  insightsOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'flex-end' },
  insightsContent: { maxHeight: '82%', backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  insightsContentDark: { backgroundColor: '#0f172a' },
  insightsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  insightsTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800' },
  insightsCloseButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#e2e8f0' },
  insightsCloseText: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  insightsList: { paddingBottom: 24 },
  insightBoxCard: { borderRadius: 12, padding: 14, marginBottom: 12 },
  insightBoxName: { fontSize: 17, fontWeight: '800' },
  insightBoxBalance: { fontSize: 22, fontWeight: '900', marginTop: 3, marginBottom: 8 },
  timelineSection: { paddingHorizontal: 20 },
  pullIndicatorContainer: {
    position: 'absolute',
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
  timelineActionButton: {
    borderRadius: 12,
    backgroundColor: '#84cc16',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  timelineActionButtonText: { color: '#f8fafc', fontWeight: '700', fontSize: 12 },
  timelineScroll: { flex: 1 },
  timelineScrollContent: { paddingBottom: 100 },
  timelineCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  timelineCardDark: { backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  timelineHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  emptyText: { color: '#0f172a' },
  emptyTextDark: { color: '#cbd5e1' },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    padding: 12,
    marginBottom: 10,
  },
  timelineRowDark: { backgroundColor: 'rgba(15, 23, 42, 0.42)', borderColor: 'rgba(148, 163, 184, 0.25)' },
  timelineMeta: { flex: 1, marginRight: 10 },
  timelineDate: { color: '#0f172a', fontWeight: '700' },
  timelineType: { color: '#0f172a', marginTop: 2, fontSize: 12 },
  timelineDescription: { color: '#0f172a', marginTop: 4 },
  timelineDescriptionDark: { color: '#cbd5e1' },
  timelineAmounts: { alignItems: 'flex-end' },
  timelineAmount: { fontWeight: '800' },
  incomeText: { color: '#15803d' },
  expenseText: { color: '#b91c1c' },
  timelineBalance: { color: '#0f172a', marginTop: 4, fontSize: 12 },
  titleTextDark: { color: '#ffffff' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 92,
    paddingBottom: 20,
  },
  modalDismissArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  modalScroll: { width: '100%', flexGrow: 0 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 10 },
  modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  typeToggleRow: { flexDirection: 'row', marginBottom: 12 },
  typeToggleButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  typeToggleButtonGap: { marginLeft: 8 },
  typeToggleButtonIncome: { backgroundColor: '#84cc16', borderColor: '#84cc16' },
  typeToggleButtonExpense: { backgroundColor: '#D50000', borderColor: '#D50000' },
  typeToggleButtonText: { color: '#0f172a', fontWeight: '700' },
  typeToggleButtonTextActive: { color: '#f8fafc' },
  modalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, fontSize: 16, marginBottom: 18, color: '#334155' },
  expenseSourceSection: { marginBottom: 12 },
  expenseSourceLabel: { color: '#334155', fontWeight: '700', fontSize: 13, marginBottom: 8 },
  expenseSourceEmpty: { color: '#334155', fontSize: 13, marginBottom: 4 },
  expenseSourceOptionsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  expenseSourceOption: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  expenseSourceOptionActive: { borderWidth: 2 },
  expenseSourceOptionText: { fontWeight: '700', fontSize: 12 },
  expenseSourceOptionTextActive: { opacity: 1 },
  modalDateInputButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  modalDateInputText: { fontSize: 16, color: '#0f172a' },
  modalDateInputPlaceholder: { color: '#334155' },
  recurrenceToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  recurrenceCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    marginRight: 10,
  },
  recurrenceCheckboxChecked: {
    backgroundColor: '#84cc16',
    borderColor: '#84cc16',
  },
  recurrenceCheckboxMark: {
    color: '#f8fafc',
    fontWeight: '800',
    fontSize: 12,
  },
  recurrenceToggleText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 14,
  },
  recurrenceOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    marginTop: -4,
  },
  recurrenceOptionButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginRight: 8,
    marginTop: 8,
  },
  recurrenceOptionButtonActive: {
    backgroundColor: '#84cc16',
    borderColor: '#84cc16',
  },
  recurrenceOptionButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
  },
  recurrenceOptionButtonTextActive: {
    color: '#f8fafc',
  },
  calendarPanel: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    backgroundColor: '#f8fafc',
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarNavButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
  },
  calendarNavButtonText: { color: '#0f172a', fontWeight: '700', fontSize: 12 },
  calendarMonthLabel: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  calendarWeekdayRow: { flexDirection: 'row', marginBottom: 6 },
  calendarWeekdayText: { flex: 1, textAlign: 'center', color: '#0f172a', fontSize: 12, fontWeight: '700' },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    minHeight: CALENDAR_BASE_ROW_COUNT * CALENDAR_DAY_CELL_HEIGHT,
  },
  calendarDayCell: {
    width: '14.2857%',
    height: CALENDAR_DAY_CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  calendarDayCellSelected: { backgroundColor: '#84cc16' },
  calendarDayText: { color: '#0f172a', fontWeight: '600' },
  calendarDayTextSelected: { color: '#f8fafc', fontWeight: '800' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalButtonCancel: { flex: 1, marginRight: 8, backgroundColor: '#f1f5f9', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  modalButtonConfirm: { flex: 1, marginLeft: 8, backgroundColor: '#84cc16', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  modalButtonText: { fontWeight: '700', color: '#0f172a' },
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
  modalButtonConfirmDisabled: {
    opacity: 0.45,
  },
  goalModalButtonConfirmText: { color: '#f8fafc', fontWeight: '700' },
});
