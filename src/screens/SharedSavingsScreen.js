import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import {
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
import AmountAllocationSlider from '../components/AmountAllocationSlider';
import CardActionMenu from '../components/CardActionMenu';
import CardMenuButton from '../components/CardMenuButton';
import { IOSKeyboardDoneAccessory, KeyboardAwareModalOverlay } from '../components/ModalKeyboardSupport';
import PrimaryButton from '../components/PrimaryButton';
import { ACCOUNT_COLOR_PALETTE, formatCurrency, getReadableTextColor } from '../constants/colors';
import {
    acceptSharedAccountInvite,
    createSharedAccount,
    declineSharedAccountInvite,
    deleteSharedAccount,
    ensureUserDocument,
    inviteCollaboratorsToSharedAccount,
    leaveSharedAccount,
    renameSharedAccount,
    subscribeToAccounts,
    subscribeToConnectedWallets,
    subscribeToSharedAccountInvites,
    subscribeToSharedAccounts,
    subscribeToUserDocument,
    updateSharedAccountAvatar,
    updateSharedAccountGoals,
} from '../firebase/firestore';
import { isLocalImageUri, uploadCardImage, uploadLocalImageIfNeeded } from '../firebase/storage';
import { convertCurrencyAmount } from '../services/currency';
import { subscribeToInvestmentAccounts } from '../services/investmentAccounts';
import { getAccountAvailabilityBreakdown } from '../utils/accountAvailability';

const SHARED_HERO_IMAGE = require('../../assets/dashboard-mountain-shared.jpg');
const HERO_SOURCE_START_Y = 1310;
const HERO_SOURCE_END_Y = 1600;
const HERO_SCENE_HEIGHT = HERO_SOURCE_END_Y - HERO_SOURCE_START_Y;
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);
const REFRESH_HOLD_OFFSET = 68;
const SHARED_BACKGROUND_GRADIENT = {
  light: ['#fff7ed', '#fecaca', '#fca5a5', '#7f1d1d'],
  dark: ['#4c1d0f', '#3f1412', '#34110f', '#210a09'],
  locations: [0, 0.35, 0.72, 1],
  start: [0, 0],
  end: [0, 1],
  solidLight: '#fff7ed',
  solidDark: '#4c1d0f',
};
const GOAL_ARC_SEGMENTS = 44;
const GOAL_ARC_START_DEG = 120;
const GOAL_ARC_SPAN_DEG = 300;
const GOAL_ARC_FILL_START = '#fde68a';
const GOAL_ARC_FILL_END = '#b45309';
const GOAL_ARC_EMPTY_DARK = 'rgba(203,213,225,0.5)';
const GOAL_ARC_EMPTY_LIGHT = 'rgba(15,81,50,0.2)';
const GOAL_ARC_SIZE = 96;
const GOAL_ARC_CENTER = GOAL_ARC_SIZE / 2;
const GOAL_ARC_RADIUS = 39;
const SHARED_GOAL_CARD_GAP = 10;
const GOAL_ACTION_GREEN = '#84cc16';
const SHARED_MODAL_ACCESSORY_ID = 'shared-savings-modal-input-accessory';
const SHARED_TRANSLATIONS = {
  en: {
    validation: 'Validation',
    enterSharedSavingsName: 'Enter a shared savings name.',
    addExactCollaboratorEmails: 'Add exactly',
    collaboratorEmail: 'collaborator email',
    collaboratorEmails: 'collaborator emails',
    invitesSent: 'Invites sent',
    collaboratorsReceivedInvites: 'Collaborators received invites in their shared inbox.',
    createFailed: 'Create failed',
    pleaseTryAgain: 'Please try again.',
    permissionNeeded: 'Permission needed',
    allowPhotoCardImage: 'Please allow photo access to choose a card image.',
    inviteFailed: 'Invite failed',
    couldNotAcceptInvite: 'Could not accept this invite.',
    couldNotDeclineInvite: 'Could not decline this invite.',
    sharedAccountActions: 'Shared account actions',
    openDetails: 'Open details',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    addCollaborator: 'Add collaborator',
    rename: 'Rename',
    deleteBox: 'Delete box',
    leaveBox: 'Leave box',
    deleteFailed: 'Delete failed',
    leaveFailed: 'Leave failed',
    renameFailed: 'Rename failed',
    allowPhotoGoalImage: 'Please allow photo access to choose a goal image.',
    saveFailed: 'Save failed',
    couldNotUpdateGoalImage: 'Could not update this goal image.',
    couldNotRemoveGoalImage: 'Could not remove this goal image.',
    goalActions: 'Goal actions',
    chooseRemoveAction: 'Choose what you want to remove.',
    cancel: 'Cancel',
    deleteImage: 'Delete image',
    deleteSavingGoal: 'Delete saving goal',
    enterValidGoalAmount: 'Enter a valid goal amount.',
    couldNotSaveSharedGoal: 'Could not save this shared savings goal.',
    enterValidReserveAmount: 'Enter a valid amount to reserve.',
    reserveForGoal: 'Reserve for goal',
    youCanReserveUpTo: 'You can reserve up to',
    couldNotUpdateSharedGoal: 'Could not update this shared savings goal.',
    deleteSavingGoalConfirm: 'Are you sure you want to delete this saving goal?',
    couldNotDeleteSharedGoal: 'Could not delete this shared savings goal.',
    addAtLeastOneCollaboratorEmail: 'Add at least one collaborator email.',
    collaboratorInvite: 'collaborator invite',
    collaboratorInvites: 'collaborator invites',
    sent: 'sent.',
    allowPhotoProfilePicture: 'Please allow photo access to choose a profile picture.',
    imageUploadFailed: 'Image upload failed',
    couldNotUpdateProfilePicture: 'Could not update shared profile picture.',
    removeImageFailed: 'Remove image failed',
    couldNotRemoveProfilePicture: 'Could not remove shared profile picture.',
    sharedImage: 'Shared image',
    sharedImagePrompt: 'What do you want to do with this image?',
    changeImage: 'Change image',
    removeImage: 'Remove image',
    deleteSharedBox: 'Delete shared box',
    leaveSharedBox: 'Leave shared box',
    deleteSharedBoxConfirm: 'This permanently deletes this shared box for everyone.',
    leaveSharedBoxConfirm: 'You will leave this shared box. Other collaborators stay.',
    owner: 'Owner',
    collaborator: 'Collaborator',
    togetherWith: 'Together with',
    add: 'Add',
    savingsGoals: 'Savings goals',
    addSavingsGoal: 'Add savings goal',
    addReserve: 'Add reserve',
    chooseGoalImage: 'Choose goal image',
    goalActionsLabel: 'Goal actions',
    savingsGoal: 'Savings goal',
    goalReached: 'Goal reached',
    reached: 'reached',
    inbox: 'Inbox',
    sharedSavings: 'Shared savings',
    buildGoalsTogether: 'Build goals together with your people',
    sharedBoxes: 'Shared boxes',
    total: 'Total',
    available: 'available',
    newBox: 'New shared savings',
    loadingSharedAccounts: 'Loading shared accounts...',
    noSharedAccounts: 'No shared accounts yet.',
    createSharedSavings: 'Create shared savings',
    sharedAccountName: 'Shared account name',
    numberOfCollaborators: 'Number of collaborators',
    inviteEmailsHint: 'Invite collaborator emails (comma or new line separated)',
    expected: 'Expected',
    added: 'Added',
    emailSingle: 'email',
    emailPlural: 'emails',
    color: 'Color',
    cardImageOptional: 'Card image (optional)',
    chooseImageFromGallery: 'Choose image from gallery',
    create: 'Create',
    sharedInbox: 'Shared inbox',
    noPendingInvites: 'No pending invites.',
    sharedSavingsAccount: 'Shared savings account',
    invitedBy: 'Invited by',
    decline: 'Decline',
    accept: 'Accept',
    close: 'Close',
    renameSharedBox: 'Rename shared box',
    newName: 'New name',
    save: 'Save',
    createSavingsGoal: 'Create savings goal',
    goalNameOptional: 'Goal name (optional)',
    goalAmount: 'Goal amount',
    changeGoalImage: 'Change goal image',
    chooseGoalImageOptional: 'Choose goal image (optional)',
    noImageSelected: 'No image selected',
    createGoal: 'Create goal',
    sharedSavingsBox: 'Shared savings box',
    reserveAmount: 'Reserve amount',
    sendInvite: 'Send invite',
    sending: 'Sending...',
    goalActivity: 'Goal activity',
    totalReserved: 'Total reserved',
    noGoalActivity: 'No deposits or withdrawals yet.',
    activityAdded: 'added',
    activityWithdrew: 'withdrew',
    fromSource: 'from',
    contributed: 'contributed',
  },
  nl: {
    validation: 'Validatie',
    enterSharedSavingsName: 'Vul een naam voor de gedeelde spaarrekening in.',
    addExactCollaboratorEmails: 'Voeg precies',
    collaboratorEmail: 'e-mailadres van samenwerker toe',
    collaboratorEmails: 'e-mailadressen van samenwerkers toe',
    invitesSent: 'Uitnodigingen verstuurd',
    collaboratorsReceivedInvites: 'Samenwerkers hebben uitnodigingen ontvangen in hun gedeelde inbox.',
    createFailed: 'Aanmaken mislukt',
    pleaseTryAgain: 'Probeer het opnieuw.',
    permissionNeeded: 'Toestemming nodig',
    allowPhotoCardImage: 'Geef toegang tot foto\'s om een kaartafbeelding te kiezen.',
    inviteFailed: 'Uitnodiging mislukt',
    couldNotAcceptInvite: 'Deze uitnodiging kon niet worden geaccepteerd.',
    couldNotDeclineInvite: 'Deze uitnodiging kon niet worden geweigerd.',
    sharedAccountActions: 'Acties gedeelde rekening',
    openDetails: 'Details openen',
    deposit: 'Storten',
    withdraw: 'Opnemen',
    addCollaborator: 'Samenwerker toevoegen',
    rename: 'Hernoemen',
    deleteBox: 'Potje verwijderen',
    leaveBox: 'Potje verlaten',
    deleteFailed: 'Verwijderen mislukt',
    leaveFailed: 'Verlaten mislukt',
    renameFailed: 'Hernoemen mislukt',
    allowPhotoGoalImage: 'Geef toegang tot foto\'s om een doelafbeelding te kiezen.',
    saveFailed: 'Opslaan mislukt',
    couldNotUpdateGoalImage: 'De doelafbeelding kon niet worden bijgewerkt.',
    couldNotRemoveGoalImage: 'De doelafbeelding kon niet worden verwijderd.',
    goalActions: 'Doelacties',
    chooseRemoveAction: 'Kies wat je wilt verwijderen.',
    cancel: 'Annuleren',
    deleteImage: 'Afbeelding verwijderen',
    deleteSavingGoal: 'Spaardoel verwijderen',
    enterValidGoalAmount: 'Voer een geldig doelbedrag in.',
    couldNotSaveSharedGoal: 'Dit gedeelde spaardoel kon niet worden opgeslagen.',
    enterValidReserveAmount: 'Voer een geldig reserveerbedrag in.',
    reserveForGoal: 'Reserveren voor doel',
    youCanReserveUpTo: 'Je kunt maximaal reserveren:',
    couldNotUpdateSharedGoal: 'Dit gedeelde spaardoel kon niet worden bijgewerkt.',
    deleteSavingGoalConfirm: 'Weet je zeker dat je dit spaardoel wilt verwijderen?',
    couldNotDeleteSharedGoal: 'Dit gedeelde spaardoel kon niet worden verwijderd.',
    addAtLeastOneCollaboratorEmail: 'Voeg minimaal één e-mailadres van een samenwerker toe.',
    collaboratorInvite: 'uitnodiging voor samenwerker',
    collaboratorInvites: 'uitnodigingen voor samenwerkers',
    sent: 'verstuurd.',
    allowPhotoProfilePicture: 'Geef toegang tot foto\'s om een profielfoto te kiezen.',
    imageUploadFailed: 'Afbeelding uploaden mislukt',
    couldNotUpdateProfilePicture: 'De gedeelde profielfoto kon niet worden bijgewerkt.',
    removeImageFailed: 'Afbeelding verwijderen mislukt',
    couldNotRemoveProfilePicture: 'De gedeelde profielfoto kon niet worden verwijderd.',
    sharedImage: 'Gedeelde afbeelding',
    sharedImagePrompt: 'Wat wil je met deze afbeelding doen?',
    changeImage: 'Afbeelding wijzigen',
    removeImage: 'Afbeelding verwijderen',
    deleteSharedBox: 'Gedeeld potje verwijderen',
    leaveSharedBox: 'Gedeeld potje verlaten',
    deleteSharedBoxConfirm: 'Dit verwijdert dit gedeelde potje permanent voor iedereen.',
    leaveSharedBoxConfirm: 'Je verlaat dit gedeelde potje. Andere samenwerkers blijven.',
    owner: 'Eigenaar',
    collaborator: 'Samenwerker',
    togetherWith: 'Samen met',
    add: 'Storten',
    savingsGoals: 'Spaardoelen',
    addSavingsGoal: 'Spaardoel toevoegen',
    addReserve: 'Reservering toevoegen',
    chooseGoalImage: 'Doelafbeelding kiezen',
    goalActionsLabel: 'Doelacties',
    savingsGoal: 'Spaardoel',
    goalReached: 'Doel behaald',
    reached: 'behaald',
    inbox: 'Inbox',
    sharedSavings: 'Gedeeld sparen',
    buildGoalsTogether: 'Bouw samen doelen op met je mensen',
    sharedBoxes: 'Gedeelde potjes',
    total: 'Totaal',
    available: 'beschikbaar',
    newBox: 'Nieuw potje',
    loadingSharedAccounts: 'Gedeelde rekeningen laden...',
    noSharedAccounts: 'Nog geen gedeelde rekeningen.',
    createSharedSavings: 'Gedeeld sparen aanmaken',
    sharedAccountName: 'Naam gedeelde rekening',
    numberOfCollaborators: 'Aantal samenwerkers',
    inviteEmailsHint: 'Nodig e-mailadressen uit (komma of nieuwe regel gescheiden)',
    expected: 'Verwacht',
    added: 'Toegevoegd',
    emailSingle: 'e-mailadres',
    emailPlural: 'e-mailadressen',
    color: 'Kleur',
    cardImageOptional: 'Kaartafbeelding (optioneel)',
    chooseImageFromGallery: 'Afbeelding kiezen uit galerij',
    create: 'Aanmaken',
    sharedInbox: 'Gedeelde inbox',
    noPendingInvites: 'Geen openstaande uitnodigingen.',
    sharedSavingsAccount: 'Gedeelde spaarrekening',
    invitedBy: 'Uitgenodigd door',
    decline: 'Weigeren',
    accept: 'Accepteren',
    close: 'Sluiten',
    renameSharedBox: 'Gedeeld potje hernoemen',
    newName: 'Nieuwe naam',
    save: 'Opslaan',
    createSavingsGoal: 'Spaardoel maken',
    goalNameOptional: 'Doelnaam (optioneel)',
    goalAmount: 'Doelbedrag',
    changeGoalImage: 'Doelafbeelding wijzigen',
    chooseGoalImageOptional: 'Doelafbeelding kiezen (optioneel)',
    noImageSelected: 'Geen afbeelding geselecteerd',
    createGoal: 'Doel maken',
    sharedSavingsBox: 'Gedeeld spaarpotje',
    reserveAmount: 'Reserveer bedrag',
    sendInvite: 'Uitnodiging versturen',
    sending: 'Versturen...',
    goalActivity: 'Doelactiviteit',
    totalReserved: 'Totaal gereserveerd',
    noGoalActivity: 'Nog geen stortingen of opnames.',
    activityAdded: 'stortte',
    activityWithdrew: 'nam op',
    fromSource: 'vanaf',
    contributed: 'bijgedragen',
  },
};

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

function roundToCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

function formatAmountInputValue(value) {
  const rounded = roundToCents(Number(value) || 0);
  if (rounded <= 0) return '';
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function normalizeSavingsGoalsFromSharedAccount(account = {}) {
  if (!Array.isArray(account?.savingsGoals)) {
    return [];
  }

  return account.savingsGoals
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

function normalizeSavingsGoalsFromUserData(data = {}) {
  if (Array.isArray(data?.savingsGoals)) {
    return data.savingsGoals
      .map((goal, index) => ({
        id: goal?.id || `goal-${goal?.createdAt || Date.now()}-${index}`,
        name: goal?.name || null,
        imageUri: goal?.imageUri || null,
        targetAmount: Number(goal?.targetAmount) || 0,
        reservations: goal?.reservations || {},
        createdAt: goal?.createdAt || Date.now(),
      }))
      .filter((goal) => goal.targetAmount > 0);
  }

  if (data?.savingsGoal) {
    return [{
      id: data.savingsGoal.id || `legacy-goal-${Date.now()}`,
      name: data.savingsGoal.name || null,
      imageUri: data.savingsGoal.imageUri || null,
      targetAmount: Number(data.savingsGoal.targetAmount) || 0,
      reservations: data.savingsGoal.reservations || {},
      createdAt: data.savingsGoal.createdAt || Date.now(),
    }].filter((goal) => goal.targetAmount > 0);
  }

  return [];
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
        const x = GOAL_ARC_CENTER + (GOAL_ARC_RADIUS * Math.cos(radians));
        const y = GOAL_ARC_CENTER + (GOAL_ARC_RADIUS * Math.sin(radians));
        const isFilled = index < filledSegments;
        return (
          <View
            key={`shared-goal-segment-${index}`}
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

export default function SharedSavingsScreen({ navigation, setPagerSwipeEnabled }) {
  const { width: windowWidth } = useWindowDimensions();
  const listRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const refreshHoldAnim = useRef(new Animated.Value(0)).current;
  const coinSpinAnim = useRef(new Animated.Value(0)).current;
  const coinOpacityAnim = useRef(new Animated.Value(0)).current;
  const coinSpinLoopRef = useRef(null);
  const [sharedAccounts, setSharedAccounts] = useState([]);
  const sharedAccountsRef = useRef([]);
  const migratedGoalImagesRef = useRef(new Set());
  const [accounts, setAccounts] = useState([]);
  const [individualSavingsGoals, setIndividualSavingsGoals] = useState([]);
  const [connectedWallets, setConnectedWallets] = useState([]);
  const [convertedWalletBalances, setConvertedWalletBalances] = useState({});
  const [investmentAccounts, setInvestmentAccounts] = useState([]);
  const [convertedInvestmentBalances, setConvertedInvestmentBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isRefreshSettling, setIsRefreshSettling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [collaboratorCount, setCollaboratorCount] = useState(1);
  const [inviteEmailsText, setInviteEmailsText] = useState('');
  const [selectedColor, setSelectedColor] = useState(ACCOUNT_COLOR_PALETTE[0]);
  const [cardImageUri, setCardImageUri] = useState('');
  const [inboxVisible, setInboxVisible] = useState(false);
  const [invites, setInvites] = useState([]);
  const [inviteActionId, setInviteActionId] = useState(null);
  const [actionMenuState, setActionMenuState] = useState(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameTargetAccount, setRenameTargetAccount] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [addCollaboratorModalVisible, setAddCollaboratorModalVisible] = useState(false);
  const [addCollaboratorTargetAccount, setAddCollaboratorTargetAccount] = useState(null);
  const [addCollaboratorEmails, setAddCollaboratorEmails] = useState('');
  const [addCollaboratorBusy, setAddCollaboratorBusy] = useState(false);
  const [avatarPreviewByAccountId, setAvatarPreviewByAccountId] = useState({});
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [goalReserveModalVisible, setGoalReserveModalVisible] = useState(false);
  const [goalTargetAccount, setGoalTargetAccount] = useState(null);
  const [goalReserveTargetAccount, setGoalReserveTargetAccount] = useState(null);
  const [goalReserveTargetGoalId, setGoalReserveTargetGoalId] = useState(null);
  const [goalReserveMode, setGoalReserveMode] = useState('add');
  const [goalReserveSelection, setGoalReserveSelection] = useState('');
  const [goalNameInput, setGoalNameInput] = useState('');
  const [goalAmountInput, setGoalAmountInput] = useState('');
  const [goalImageInputUri, setGoalImageInputUri] = useState('');
  const [goalReserveAmountInput, setGoalReserveAmountInput] = useState('');
  const [goalReserveKeyboardInset, setGoalReserveKeyboardInset] = useState(0);
  const [goalActivityModalVisible, setGoalActivityModalVisible] = useState(false);
  const [goalActivityTargetAccountId, setGoalActivityTargetAccountId] = useState(null);
  const [goalActivityTargetGoalId, setGoalActivityTargetGoalId] = useState(null);
  const [currency, setCurrency] = useState('EUR');
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState('');
  const [theme, setTheme] = useState('light');
  const [language, setLanguage] = useState('en');
  const strings = SHARED_TRANSLATIONS[language] || SHARED_TRANSLATIONS.en;

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;

    const handleKeyboardFrame = (event) => {
      const keyboardHeight = Math.max(0, Number(event?.endCoordinates?.height) || 0);
      setGoalReserveKeyboardInset(keyboardHeight);
    };

    const handleKeyboardHide = () => {
      setGoalReserveKeyboardInset(0);
    };

    const frameSubscription = Keyboard.addListener('keyboardWillChangeFrame', handleKeyboardFrame);
    const hideSubscription = Keyboard.addListener('keyboardWillHide', handleKeyboardHide);

    return () => {
      frameSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const auth = getAuth();
    let unsubscribeAccounts = null;
    let unsubscribePersonalAccounts = null;
    let unsubscribeWallets = null;
    let unsubscribeInvestmentAccounts = null;
    let unsubscribeInvites = null;
    let unsubscribeUser = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (unsubscribeAccounts) {
        unsubscribeAccounts();
        unsubscribeAccounts = null;
      }
      if (unsubscribePersonalAccounts) {
        unsubscribePersonalAccounts();
        unsubscribePersonalAccounts = null;
      }
      if (unsubscribeWallets) {
        unsubscribeWallets();
        unsubscribeWallets = null;
      }
      if (unsubscribeInvestmentAccounts) {
        unsubscribeInvestmentAccounts();
        unsubscribeInvestmentAccounts = null;
      }
      if (unsubscribeInvites) {
        unsubscribeInvites();
        unsubscribeInvites = null;
      }
      if (unsubscribeUser) {
        unsubscribeUser();
        unsubscribeUser = null;
      }

      if (!currentUser) {
        sharedAccountsRef.current = [];
        migratedGoalImagesRef.current.clear();
        setSharedAccounts([]);
        setAccounts([]);
        setIndividualSavingsGoals([]);
        setConnectedWallets([]);
        setConvertedWalletBalances({});
        setInvestmentAccounts([]);
        setConvertedInvestmentBalances({});
        setInvites([]);
        setCurrency('EUR');
        setTheme('light');
        setLanguage('en');
        setAvatarPreviewByAccountId({});
        setLoading(false);
        return;
      }

      setLoading(true);
      ensureUserDocument(currentUser)
        .then(() => {
          unsubscribeAccounts = subscribeToSharedAccounts(currentUser.uid, (accounts) => {
            sharedAccountsRef.current = accounts;
            setSharedAccounts(accounts);
            setLoading(false);

            accounts.forEach((account) => {
              const localImages = normalizeSavingsGoalsFromSharedAccount(account)
                .filter((goal) => isLocalImageUri(goal.imageUri));
              if (localImages.length === 0) return;
              const migrationKey = `${currentUser.uid}:${account.id}:${localImages.map((goal) => `${goal.id}:${goal.imageUri}`).join('|')}`;
              if (migratedGoalImagesRef.current.has(migrationKey)) return;
              migratedGoalImagesRef.current.add(migrationKey);
              Promise.all(localImages.map(async (goal) => [
                goal.id,
                goal.imageUri,
                await uploadLocalImageIfNeeded(currentUser.uid, goal.imageUri, 'shared-savings-goals'),
              ]))
                .then(async (migrations) => {
                  if (getAuth().currentUser?.uid !== currentUser.uid) return;
                  const latestAccount = sharedAccountsRef.current.find((item) => item.id === account.id);
                  if (!latestAccount) return;
                  const replacements = new Map(migrations.map(([goalId, oldUri, url]) => [goalId, { oldUri, url }]));
                  const latestGoals = normalizeSavingsGoalsFromSharedAccount(latestAccount);
                  let changed = false;
                  const nextGoals = latestGoals.map((goal) => {
                    const replacement = replacements.get(goal.id);
                    if (!replacement || goal.imageUri !== replacement.oldUri) return goal;
                    changed = true;
                    return { ...goal, imageUri: replacement.url };
                  });
                  if (changed) await updateSharedAccountGoals(account.id, nextGoals);
                })
                .catch(() => console.warn('Could not restore one or more shared goal images.'));
            });
          });

          unsubscribePersonalAccounts = subscribeToAccounts(currentUser.uid, (nextAccounts) => {
            setAccounts(nextAccounts || []);
          });

          unsubscribeWallets = subscribeToConnectedWallets(currentUser.uid, (wallets) => {
            setConnectedWallets(wallets || []);
          });

          unsubscribeInvestmentAccounts = subscribeToInvestmentAccounts(currentUser.uid, (nextAccounts) => {
            setInvestmentAccounts(nextAccounts || []);
          });

          unsubscribeInvites = subscribeToSharedAccountInvites(currentUser.uid, currentUser.email, (incomingInvites) => {
            setInvites(incomingInvites);
          });

          unsubscribeUser = subscribeToUserDocument(currentUser.uid, (docSnapshot) => {
            const userData = docSnapshot?.data?.() || {};
            setCurrency(userData.currencyPreference || 'EUR');
            setTheme(userData.themePreference || 'light');
            setLanguage(userData.languagePreference === 'nl' ? 'nl' : 'en');
            setCurrentUserDisplayName(userData.displayName || currentUser.displayName || currentUser.email || '');
            setIndividualSavingsGoals(normalizeSavingsGoalsFromUserData(userData));
          });
        })
        .catch((error) => {
          console.warn('Unable to initialize shared savings user document:', error);
          setLoading(false);
        });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeAccounts) unsubscribeAccounts();
      if (unsubscribePersonalAccounts) unsubscribePersonalAccounts();
      if (unsubscribeWallets) unsubscribeWallets();
      if (unsubscribeInvestmentAccounts) unsubscribeInvestmentAccounts();
      if (unsubscribeInvites) unsubscribeInvites();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

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

  useEffect(() => {
    setAvatarPreviewByAccountId((previous) => {
      const next = {};
      (sharedAccounts || []).forEach((account) => {
        const currentPreview = previous[account.id];
        if (typeof account?.avatarUrl === 'string' && account.avatarUrl) {
          next[account.id] = account.avatarUrl;
          return;
        }
        if (typeof currentPreview === 'string' && currentPreview.startsWith('file://')) {
          next[account.id] = currentPreview;
        }
      });
      return next;
    });
  }, [sharedAccounts]);

  const imageSource = Image.resolveAssetSource(SHARED_HERO_IMAGE);
  const sourceWidth = imageSource?.width || 650;
  const sourceHeight = imageSource?.height || 1650;
  const imageScale = sourceWidth > 0 ? windowWidth / sourceWidth : 1;
  const scaledImageHeight = sourceHeight * imageScale;
  const maxSourceStartY = Math.max(0, sourceHeight - (HERO_SCENE_HEIGHT / imageScale));
  const heroSourceStartY = Math.max(0, Math.min(HERO_SOURCE_START_Y, maxSourceStartY));
  const maxPullReveal = Math.max(0, heroSourceStartY * imageScale);
  const sharedImageLayerTop = -maxPullReveal;
  const sharedImageLayerHeight = maxPullReveal + HERO_SCENE_HEIGHT + 2;
  const heroScrollOffset = scrollY.interpolate({
    inputRange: [0, HERO_SCENE_HEIGHT + 240],
    outputRange: [0, -(HERO_SCENE_HEIGHT + 240)],
    extrapolate: 'clamp',
  });

  const sharedAccountsCount = sharedAccounts.length;
  const isDark = theme === 'dark';
  const sharedGradientColors = isDark ? SHARED_BACKGROUND_GRADIENT.dark : SHARED_BACKGROUND_GRADIENT.light;
  const totalSharedBalance = sharedAccounts.reduce((sum, account) => {
    const accountSharedGoalsTotal = normalizeSavingsGoalsFromSharedAccount(account).reduce((goalSum, goal) => {
      const goalReservedTotal = Object.values(goal.reservations || {}).reduce((reservationSum, amount) => reservationSum + (Number(amount) || 0), 0);
      return goalSum + goalReservedTotal;
    }, 0);
    return sum + accountSharedGoalsTotal;
  }, 0);
  const pullIndicatorTranslateY = refreshing
    ? 0
    : Math.max(0, 18 - (pullDistance * 0.35));
  const coinRotation = coinSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const coinSymbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€';
  const refreshTriggerDistance = 74;
  const selectedSharedGoal = goalReserveTargetAccount && goalReserveTargetGoalId
    ? normalizeSavingsGoalsFromSharedAccount(goalReserveTargetAccount).find((goal) => goal.id === goalReserveTargetGoalId) || null
    : null;
  const selectedSharedGoalTotalReserved = selectedSharedGoal
    ? Object.values(selectedSharedGoal.reservations || {}).reduce((sum, amount) => sum + (Number(amount) || 0), 0)
    : 0;
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
    ...investmentAccounts.map((account) => ({
      id: account.id,
      name: account.broker === 'trading212' ? 'Trading 212' : account.broker || 'Investment account',
      balance: Number(convertedInvestmentBalances[account.id]) || 0,
      sourceType: 'investment',
    })),
  ];
  const selectedReserveSourceAccount = goalReserveSelection
    ? reserveSourceItems.find((source) => source.id === goalReserveSelection) || null
    : null;
  const selectedReserveSourceAvailability = selectedReserveSourceAccount
    ? getAccountAvailabilityBreakdown(selectedReserveSourceAccount, individualSavingsGoals, sharedAccounts)
    : null;
  const selectedReserveSourceGoalAllocation = goalReserveMode === 'withdraw' && selectedSharedGoal && selectedReserveSourceAccount
    ? Number(selectedSharedGoal?.reservations?.[selectedReserveSourceAccount.id]) || 0
    : 0;
  const selectedReserveGoalRemaining = selectedSharedGoal
    ? Math.max(0, selectedSharedGoal.targetAmount - selectedSharedGoalTotalReserved)
    : 0;
  const sharedGoalWithdrawSources = selectedSharedGoal
    ? Object.entries(selectedSharedGoal.reservations || {})
        .filter(([, amount]) => (Number(amount) || 0) > 0)
        .map(([sourceId, amount]) => ({
          id: sourceId,
          name: reserveSourceItems.find((source) => source.id === sourceId)?.name || strings.sharedSavingsBox,
          reserved: Number(amount) || 0,
        }))
    : [];
  const goalReserveAmountAccessoryId = 'shared-goal-reserve-amount-accessory';
  const sharedReserveMaxAmount = goalReserveMode === 'withdraw'
    ? selectedReserveSourceGoalAllocation
    : selectedReserveSourceAvailability?.available || 0;
  const sharedReserveSliderValue = (() => {
    const parsedValue = parseFloat(String(goalReserveAmountInput || '').replace(',', '.'));
    if (Number.isNaN(parsedValue) || parsedValue <= 0) return 0;
    return Math.min(parsedValue, sharedReserveMaxAmount);
  })();
  const goalActivityAccount = goalActivityTargetAccountId
    ? sharedAccounts.find((account) => account.id === goalActivityTargetAccountId) || null
    : null;
  const goalActivityGoal = goalActivityAccount && goalActivityTargetGoalId
    ? normalizeSavingsGoalsFromSharedAccount(goalActivityAccount).find((goal) => goal.id === goalActivityTargetGoalId) || null
    : null;
  const goalActivityEntries = goalActivityGoal
    ? [...(goalActivityGoal.history || [])].sort((a, b) => (Number(b?.at) || 0) - (Number(a?.at) || 0))
    : [];
  const goalActivityTotal = goalActivityGoal
    ? Object.values(goalActivityGoal.reservations || {}).reduce((sum, amount) => sum + (Number(amount) || 0), 0)
    : 0;
  const resolveCollaboratorName = (uid, fallback) => {
    if (uid && uid === getAuth().currentUser?.uid && currentUserDisplayName) {
      return currentUserDisplayName;
    }
    return fallback || strings.collaborator;
  };

  const goalActivityColumns = (() => {
    if (!goalActivityGoal) return [];
    const columnsByKey = new Map();
    const collaboratorList = Array.isArray(goalActivityAccount?.collaborators) ? goalActivityAccount.collaborators : [];
    collaboratorList.forEach((collaborator) => {
      const key = collaborator?.uid || collaborator?.email || 'unknown';
      columnsByKey.set(key, {
        key,
        name: resolveCollaboratorName(collaborator?.uid, collaborator?.displayName || collaborator?.email),
        entries: [],
        total: 0,
      });
    });
    goalActivityEntries.forEach((entry) => {
      const key = entry?.userId || entry?.userName || 'unknown';
      if (!columnsByKey.has(key)) {
        columnsByKey.set(key, {
          key,
          name: resolveCollaboratorName(entry?.userId, entry?.userName),
          entries: [],
          total: 0,
        });
      }
      const column = columnsByKey.get(key);
      column.entries.push(entry);
      column.total += (entry?.type === 'withdraw' ? -1 : 1) * (Number(entry?.amount) || 0);
    });
    return Array.from(columnsByKey.values()).map((column) => ({ ...column, total: roundToCents(column.total) }));
  })();

  const renderGoalActivityColumn = (column, fixedWidth) => (
    <View
      key={column.key}
      style={[styles.goalActivityColumn, fixedWidth ? styles.goalActivityColumnFixed : styles.goalActivityColumnFlexible]}
    >
      <Text style={styles.goalActivityColumnName} numberOfLines={1}>{column.name}</Text>
      <Text style={styles.goalActivityColumnTotal}>
        {`${strings.contributed} ${formatCurrency(column.total, currency)}`}
      </Text>

      <ScrollView style={styles.goalActivityColumnList} nestedScrollEnabled showsVerticalScrollIndicator>
      {column.entries.length > 0 ? column.entries.map((entry) => {
        const isWithdrawEntry = entry?.type === 'withdraw';
        const entryDate = entry?.at ? new Date(Number(entry.at)) : null;
        return (
          <View key={entry.id} style={styles.goalActivityItem}>
            <Text style={[styles.goalActivityItemAmount, isWithdrawEntry ? styles.goalActivityItemAmountNegative : null]}>
              {`${isWithdrawEntry ? '-' : '+'}${formatCurrency(Number(entry?.amount) || 0, currency)}`}
            </Text>
            {entry?.sourceName ? (
              <Text style={styles.goalActivityItemSub}>{`${strings.fromSource} ${entry.sourceName}`}</Text>
            ) : null}
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
        );
      }) : (
        <Text style={styles.goalActivityItemSub}>{strings.noGoalActivity}</Text>
      )}
      </ScrollView>
    </View>
  );

  useEffect(() => {
    const shouldLockTabNavigation = !!actionMenuState || goalModalVisible || goalReserveModalVisible || goalActivityModalVisible;
    setSharedGoalsPagerSwipeEnabled(!shouldLockTabNavigation);
  }, [actionMenuState, goalModalVisible, goalReserveModalVisible, goalActivityModalVisible]);

  const parsedInviteEmails = inviteEmailsText
    .split(/[\n,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

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

  const refreshShared = async () => {
    if (refreshing || isRefreshSettling) return;
    setRefreshing(true);
    setIsRefreshSettling(false);

    Animated.timing(refreshHoldAnim, {
      toValue: REFRESH_HOLD_OFFSET,
      duration: 140,
      useNativeDriver: true,
    }).start();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    setRefreshing(false);
    setPullDistance(0);
    setIsRefreshSettling(true);

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

  const handleEndDragRefreshCheck = () => {
    if (!refreshing && pullDistance >= refreshTriggerDistance) {
      refreshShared();
    }
  };

  const handleCreateShared = async () => {
    if (!accountName.trim()) {
      Alert.alert(strings.validation, strings.enterSharedSavingsName);
      return;
    }

    if (parsedInviteEmails.length !== collaboratorCount) {
      Alert.alert(
        strings.validation,
        `${strings.addExactCollaboratorEmails} ${collaboratorCount} ${collaboratorCount > 1 ? strings.collaboratorEmails : strings.collaboratorEmail}.`
      );
      return;
    }

    try {
      let imageUrl = null;
      if (cardImageUri) {
        const authUid = getAuth().currentUser?.uid;
        if (authUid) {
          imageUrl = await uploadCardImage(authUid, cardImageUri, 'shared-account-cards');
        }
      }

      await createSharedAccount(accountName.trim(), parsedInviteEmails, selectedColor, currency, imageUrl);
      setAccountName('');
      setInviteEmailsText('');
      setCollaboratorCount(1);
      setCardImageUri('');
      setModalVisible(false);
      Alert.alert(strings.invitesSent, strings.collaboratorsReceivedInvites);
    } catch (error) {
      Alert.alert(strings.createFailed, error.message || strings.pleaseTryAgain);
    }
  };

  const handlePickCardImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(strings.permissionNeeded, strings.allowPhotoCardImage);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    setCardImageUri(result.assets[0].uri);
  };

  const handleAcceptInvite = async (invite) => {
    if (!invite?.id || inviteActionId) return;
    setInviteActionId(invite.id);
    try {
      await acceptSharedAccountInvite(invite.id);
    } catch (error) {
      Alert.alert(strings.inviteFailed, error?.message || strings.couldNotAcceptInvite);
    } finally {
      setInviteActionId(null);
    }
  };

  const handleDeclineInvite = async (invite) => {
    if (!invite?.id || inviteActionId) return;
    setInviteActionId(invite.id);
    try {
      await declineSharedAccountInvite(invite.id);
    } catch (error) {
      Alert.alert(strings.inviteFailed, error?.message || strings.couldNotDeclineInvite);
    } finally {
      setInviteActionId(null);
    }
  };

  const getOwnerUid = (account) => {
    if (typeof account?.ownerUid === 'string' && account.ownerUid) return account.ownerUid;
    if (Array.isArray(account?.collaborators) && account.collaborators[0]?.uid) return account.collaborators[0].uid;
    return null;
  };

  const openActionModal = (account) => {
    const isOwner = getOwnerUid(account) === getAuth().currentUser?.uid;
    setActionMenuState({
      account,
      title: account?.name || strings.sharedAccountActions,
      items: [
        { id: 'details', label: strings.openDetails },
        { id: 'deposit', label: strings.deposit },
        { id: 'withdraw', label: strings.withdraw },
        { id: 'add-collaborator', label: strings.addCollaborator },
        { id: 'rename', label: strings.rename },
        { id: 'remove', label: isOwner ? strings.deleteBox : strings.leaveBox, destructive: true },
      ],
    });
  };

  const closeActionModal = () => {
    setActionMenuState(null);
  };

  const handleLeaveOrDeleteShared = async (account) => {
    const auth = getAuth();
    const currentUid = auth.currentUser?.uid;
    if (!account?.id || !currentUid) return;

    const ownerUid = getOwnerUid(account);
    const isOwner = ownerUid === currentUid;

    try {
      if (isOwner) {
        await deleteSharedAccount(account.id);
      } else {
        await leaveSharedAccount(account.id);
      }
    } catch (error) {
      Alert.alert(isOwner ? strings.deleteFailed : strings.leaveFailed, error?.message || strings.pleaseTryAgain);
    }
  };

  const handleRenameShared = async () => {
    if (!renameTargetAccount?.id) return;
    const nextName = renameText.trim();
    if (!nextName) return;

    try {
      await renameSharedAccount(renameTargetAccount.id, nextName);
      setRenameModalVisible(false);
      setRenameTargetAccount(null);
      setRenameText('');
    } catch (error) {
      Alert.alert(strings.renameFailed, error?.message || strings.pleaseTryAgain);
    }
  };

  const setSharedGoalsPagerSwipeEnabled = (enabled) => {
    if (typeof setPagerSwipeEnabled === 'function') {
      setPagerSwipeEnabled(enabled);
    }
  };

  const persistSharedSavingsGoals = async (sharedAccountId, nextGoals) => {
    if (!sharedAccountId) {
      throw new Error('Shared account not found');
    }
    await updateSharedAccountGoals(sharedAccountId, nextGoals);
  };

  const openSharedGoalModal = (account) => {
    setGoalTargetAccount(account);
    setGoalNameInput('');
    setGoalAmountInput('');
    setGoalImageInputUri('');
    setGoalModalVisible(true);
  };

  const closeSharedGoalModal = () => {
    setGoalModalVisible(false);
    setGoalTargetAccount(null);
    setGoalNameInput('');
    setGoalAmountInput('');
    setGoalImageInputUri('');
  };

  const selectLocalImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(strings.permissionNeeded, strings.allowPhotoGoalImage);
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) {
      return null;
    }

    return result.assets[0].uri || null;
  };

  const handlePickGoalImageForCreate = async () => {
    const selectedUri = await selectLocalImage();
    if (selectedUri) {
      setGoalImageInputUri(selectedUri);
    }
  };

  const handlePickSharedGoalImage = async (account, goalId) => {
    if (!account?.id || !goalId) return;
    const selectedUri = await selectLocalImage();
    if (!selectedUri) return;
    const uploaderUid = getAuth().currentUser?.uid;
    if (!uploaderUid) return;

    try {
      const existingGoals = normalizeSavingsGoalsFromSharedAccount(account);
      const imageUrl = await uploadLocalImageIfNeeded(uploaderUid, selectedUri, 'shared-savings-goals');
      const nextGoals = existingGoals.map((goal) => {
        if (goal.id !== goalId) return goal;
        return {
          ...goal,
          imageUri: imageUrl,
        };
      });
      await persistSharedSavingsGoals(account.id, nextGoals);
    } catch (error) {
      Alert.alert(strings.saveFailed, error?.message || strings.couldNotUpdateGoalImage);
    }
  };

  const handleRemoveSharedGoalImage = async (account, goalId) => {
    if (!account?.id || !goalId) return;

    const existingGoals = normalizeSavingsGoalsFromSharedAccount(account);
    const nextGoals = existingGoals.map((goal) => {
      if (goal.id !== goalId) return goal;
      return {
        ...goal,
        imageUri: null,
      };
    });

    try {
      await persistSharedSavingsGoals(account.id, nextGoals);
    } catch (error) {
      Alert.alert(strings.deleteFailed, error?.message || strings.couldNotRemoveGoalImage);
    }
  };

  const handleSharedGoalDangerPress = (account, goal) => {
    if (!account?.id || !goal?.id) return;
    const hasImage = !!goal?.imageUri;

    Alert.alert(
      strings.goalActions,
      strings.chooseRemoveAction,
      [
        { text: strings.cancel, style: 'cancel' },
        hasImage
          ? {
            text: strings.deleteImage,
            style: 'destructive',
            onPress: () => {
              handleRemoveSharedGoalImage(account, goal.id);
            },
          }
          : null,
        {
          text: strings.withdraw,
          onPress: () => {
            openSharedGoalReserveModal(account, goal.id, 'withdraw');
          },
        },
        {
          text: strings.deleteSavingGoal,
          style: 'destructive',
          onPress: () => {
            handleRemoveSharedSavingsGoal(account, goal.id);
          },
        },
      ].filter(Boolean)
    );
  };

  const openSharedGoalReserveModal = (account, goalId, mode = 'add') => {
    setGoalReserveTargetAccount(account);
    setGoalReserveTargetGoalId(goalId);
    setGoalReserveMode(mode);
    setGoalReserveSelection('');
    setGoalReserveAmountInput('');
    setGoalReserveModalVisible(true);
  };

  const closeSharedGoalReserveModal = () => {
    setGoalReserveModalVisible(false);
    setGoalReserveTargetAccount(null);
    setGoalReserveTargetGoalId(null);
    setGoalReserveMode('add');
    setGoalReserveSelection('');
    setGoalReserveAmountInput('');
  };

  const openSharedGoalActivityModal = (account, goalId) => {
    if (!account?.id || !goalId) return;
    setGoalActivityTargetAccountId(account.id);
    setGoalActivityTargetGoalId(goalId);
    setGoalActivityModalVisible(true);
  };

  const closeSharedGoalActivityModal = () => {
    setGoalActivityModalVisible(false);
    setGoalActivityTargetAccountId(null);
    setGoalActivityTargetGoalId(null);
  };

  const handleCreateSharedSavingsGoal = async () => {
    const sharedAccountId = goalTargetAccount?.id;
    if (!sharedAccountId) return;
    const uploaderUid = getAuth().currentUser?.uid;

    const parsedTargetAmount = parseFloat(String(goalAmountInput || '').replace(',', '.'));
    if (Number.isNaN(parsedTargetAmount) || parsedTargetAmount <= 0) {
      Alert.alert(strings.validation, strings.enterValidGoalAmount);
      return;
    }

    try {
      const currentAccount = sharedAccounts.find((account) => account.id === sharedAccountId) || goalTargetAccount;
      const existingGoals = normalizeSavingsGoalsFromSharedAccount(currentAccount);
      const imageUrl = goalImageInputUri && uploaderUid
        ? await uploadLocalImageIfNeeded(uploaderUid, goalImageInputUri, 'shared-savings-goals')
        : null;
      const nextGoal = {
        id: `goal-${Date.now()}`,
        name: String(goalNameInput || '').trim() || null,
        imageUri: imageUrl,
        targetAmount: parsedTargetAmount,
        reservations: {},
        createdAt: Date.now(),
      };
      await persistSharedSavingsGoals(sharedAccountId, [...existingGoals, nextGoal]);
      closeSharedGoalModal();
    } catch (error) {
      Alert.alert(strings.saveFailed, error?.message || strings.couldNotSaveSharedGoal);
    }
  };

  const handleAddSharedGoalReservation = async () => {
    const account = goalReserveTargetAccount;
    const goalId = goalReserveTargetGoalId;
    if (!account?.id || !goalId) return;

    const parsedAmount = parseFloat(String(goalReserveAmountInput || '').replace(',', '.'));
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(strings.validation, strings.enterValidReserveAmount);
      return;
    }

    const goals = normalizeSavingsGoalsFromSharedAccount(account);
    const goalIndex = goals.findIndex((goal) => goal.id === goalId);
    if (goalIndex === -1) return;

    const isWithdraw = goalReserveMode === 'withdraw';
    const sourceKey = goalReserveSelection || '';

    const maxAllowed = isWithdraw
      ? selectedReserveSourceGoalAllocation
      : selectedReserveSourceAvailability?.available || 0;

    if (parsedAmount > maxAllowed) {
      Alert.alert(strings.reserveForGoal, `${strings.youCanReserveUpTo} ${formatCurrency(maxAllowed, currency)}`);
      return;
    }

    if (!sourceKey) {
      Alert.alert(strings.validation, 'Select a source account.');
      return;
    }

    const nextGoals = goals.map((goal, index) => {
      if (index !== goalIndex) return goal;

      const nextReservations = { ...(goal.reservations || {}) };
      const currentSourceReserved = Number(nextReservations[sourceKey]) || 0;
      let appliedAmount = parsedAmount;

      if (isWithdraw) {
        const nextValue = roundToCents(Math.max(0, currentSourceReserved - parsedAmount));
        appliedAmount = roundToCents(currentSourceReserved - nextValue);
        if (nextValue <= 0) {
          delete nextReservations[sourceKey];
        } else {
          nextReservations[sourceKey] = nextValue;
        }
      } else {
        nextReservations[sourceKey] = roundToCents(currentSourceReserved + parsedAmount);
      }

      const authUser = getAuth().currentUser;
      const sourceName = reserveSourceItems.find((source) => source.id === sourceKey)?.name
        || accounts.find((account) => account.id === sourceKey)?.name
        || null;
      const historyEntry = {
        id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: isWithdraw ? 'withdraw' : 'add',
        amount: appliedAmount,
        sourceId: sourceKey,
        sourceName,
        userId: authUser?.uid || null,
        userName: authUser?.displayName || authUser?.email || null,
        at: Date.now(),
      };

      return {
        ...goal,
        reservations: nextReservations,
        history: [...(Array.isArray(goal.history) ? goal.history : []), historyEntry],
      };
    });

    try {
      await persistSharedSavingsGoals(account.id, nextGoals);
      closeSharedGoalReserveModal();
    } catch (error) {
      Alert.alert(strings.saveFailed, error?.message || strings.couldNotUpdateSharedGoal);
    }
  };

  const handleRemoveSharedSavingsGoal = (account, goalId) => {
    if (!account?.id || !goalId) return;

    Alert.alert(
      strings.deleteSavingGoal,
      strings.deleteSavingGoalConfirm,
      [
        { text: strings.cancel, style: 'cancel' },
        {
          text: strings.deleteSavingGoal,
          style: 'destructive',
          onPress: async () => {
            const existingGoals = normalizeSavingsGoalsFromSharedAccount(account);
            const nextGoals = existingGoals.filter((goal) => goal.id !== goalId);
            try {
              await persistSharedSavingsGoals(account.id, nextGoals);
            } catch (error) {
              Alert.alert(strings.deleteFailed, error?.message || strings.couldNotDeleteSharedGoal);
            }
          },
        },
      ]
    );
  };

  const openAddCollaboratorModal = (account) => {
    setAddCollaboratorTargetAccount(account);
    setAddCollaboratorEmails('');
    setAddCollaboratorBusy(false);
    setAddCollaboratorModalVisible(true);
  };

  const closeAddCollaboratorModal = (force = false) => {
    if (addCollaboratorBusy && !force) return;
    setAddCollaboratorModalVisible(false);
    setAddCollaboratorTargetAccount(null);
    setAddCollaboratorEmails('');
  };

  const handleInviteCollaborators = async () => {
    if (!addCollaboratorTargetAccount?.id || addCollaboratorBusy) return;

    const parsedEmails = Array.from(
      new Set(
        String(addCollaboratorEmails || '')
          .split(/[\n,;]+/)
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      )
    );

    if (parsedEmails.length === 0) {
      Alert.alert(strings.validation, strings.addAtLeastOneCollaboratorEmail);
      return;
    }

    setAddCollaboratorBusy(true);
    try {
      const result = await inviteCollaboratorsToSharedAccount(addCollaboratorTargetAccount.id, parsedEmails);
      closeAddCollaboratorModal(true);
      const inviteCount = result?.invitedCount || parsedEmails.length;
      Alert.alert(strings.invitesSent, `${inviteCount} ${inviteCount > 1 ? strings.collaboratorInvites : strings.collaboratorInvite} ${strings.sent}`);
    } catch (error) {
      Alert.alert(strings.inviteFailed, error?.message || strings.pleaseTryAgain);
    } finally {
      setAddCollaboratorBusy(false);
    }
  };

  const handlePickSharedAvatar = async (account) => {
    if (!account?.id) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(strings.permissionNeeded, strings.allowPhotoProfilePicture);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const selectedUri = result.assets[0].uri;
    setAvatarPreviewByAccountId((previous) => ({
      ...previous,
      [account.id]: selectedUri,
    }));

    try {
      const uploaderUid = getAuth().currentUser?.uid || 'shared';
      const uploadedUrl = await uploadCardImage(uploaderUid, selectedUri, 'shared-account-avatars');
      await updateSharedAccountAvatar(account.id, uploadedUrl);
      setAvatarPreviewByAccountId((previous) => ({
        ...previous,
        [account.id]: uploadedUrl,
      }));
    } catch (error) {
      setAvatarPreviewByAccountId((previous) => {
        const next = { ...previous };
        delete next[account.id];
        return next;
      });
      Alert.alert(strings.imageUploadFailed, error?.message || strings.couldNotUpdateProfilePicture);
    }
  };

  const handleRemoveSharedAvatar = async (account) => {
    if (!account?.id) return;
    try {
      await updateSharedAccountAvatar(account.id, null);
      setAvatarPreviewByAccountId((previous) => {
        const next = { ...previous };
        delete next[account.id];
        return next;
      });
    } catch (error) {
      Alert.alert(strings.removeImageFailed, error?.message || strings.couldNotRemoveProfilePicture);
    }
  };

  const handleSharedAvatarPress = (account, avatarUri) => {
    if (!account?.id) return;
    if (!avatarUri) {
      handlePickSharedAvatar(account);
      return;
    }

    Alert.alert(
      strings.sharedImage,
      strings.sharedImagePrompt,
      [
        {
          text: strings.changeImage,
          onPress: () => handlePickSharedAvatar(account),
        },
        {
          text: strings.removeImage,
          style: 'destructive',
          onPress: () => handleRemoveSharedAvatar(account),
        },
        {
          text: strings.cancel,
          style: 'cancel',
        },
      ]
    );
  };

  const handleActionChoice = (choice, account) => {
    if (!account) {
      closeActionModal();
      return;
    }

    const ownerUid = getOwnerUid(account);
    const currentUid = getAuth().currentUser?.uid;
    const isOwner = ownerUid === currentUid;
    closeActionModal();

    switch (choice) {
      case 'details':
        navigation.navigate('SharedAccountDetails', { sharedAccount: account });
        break;
      case 'deposit':
        navigation.navigate('SharedAccountDetails', { sharedAccount: account, initialAction: 'deposit' });
        break;
      case 'withdraw':
        navigation.navigate('SharedAccountDetails', { sharedAccount: account, initialAction: 'withdraw' });
        break;
      case 'rename':
        setRenameTargetAccount(account);
        setRenameText(account.name || '');
        setRenameModalVisible(true);
        break;
      case 'add-collaborator':
        openAddCollaboratorModal(account);
        break;
      case 'remove':
        Alert.alert(
          isOwner ? strings.deleteSharedBox : strings.leaveSharedBox,
          isOwner
            ? strings.deleteSharedBoxConfirm
            : strings.leaveSharedBoxConfirm,
          [
            { text: strings.cancel, style: 'cancel' },
            {
              text: isOwner ? strings.deleteBox : strings.leaveBox,
              style: 'destructive',
              onPress: () => handleLeaveOrDeleteShared(account),
            },
          ]
        );
        break;
      default:
        break;
    }
  };

  const handleActionMenuSelect = (choice) => {
    const currentMenu = actionMenuState;
    if (!currentMenu?.account) {
      closeActionModal();
      return;
    }

    handleActionChoice(choice, currentMenu.account);
  };

  const renderAccount = ({ item }) => {
    const cardColor = item.color || '#f97316';
    const ownerUid = getOwnerUid(item);
    const isOwner = ownerUid === getAuth().currentUser?.uid;
    const sharedGoals = normalizeSavingsGoalsFromSharedAccount(item);
    const sharedGoalsTotal = sharedGoals.reduce((goalSum, goal) => {
      const goalReservedTotal = Object.values(goal.reservations || {}).reduce((reservationSum, amount) => reservationSum + (Number(amount) || 0), 0);
      return goalSum + goalReservedTotal;
    }, 0);
    const shouldScrollSharedGoals = sharedGoals.length >= 3;
    const sharedGoalVisibleColumns = Math.max(1, Math.min(2, sharedGoals.length || 1));
    const sharedGoalActionSpace = 42 + 10;
    const sharedGoalRowWidth = Math.max(0, windowWidth - 32 - 36 - sharedGoalActionSpace);
    const sharedGoalPeekSpace = shouldScrollSharedGoals ? 28 : 0;
    const sharedGoalCardWidth = Math.max(
      shouldScrollSharedGoals ? 80 : 110,
      Math.min(
        170,
        Math.floor((sharedGoalRowWidth - sharedGoalPeekSpace - (SHARED_GOAL_CARD_GAP * (sharedGoalVisibleColumns - 1))) / sharedGoalVisibleColumns)
      )
    );
    const darkCard = getReadableTextColor(cardColor) === '#ffffff';
    const primaryTextColor = darkCard ? '#f8fafc' : '#0f172a';
    const secondaryTextColor = darkCard ? 'rgba(248,250,252,0.82)' : 'rgba(15,23,42,0.78)';
    const borderColor = 'rgba(255,255,255,0.2)';
    return (
      <TouchableOpacity
        style={styles.cardWrapper}
        onPress={() => navigation.navigate('SharedAccountDetails', { sharedAccount: item })}
        onLongPress={() => openActionModal(item)}
        activeOpacity={0.9}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: hexToRgba(cardColor, 0.85),
              borderColor,
              shadowColor: cardColor,
            },
          ]}
        >
          <BlurView intensity={22} tint="light" style={styles.cardBlurLayer} pointerEvents="none" />
          {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.cardImageBottom} /> : null}
          {item.imageUrl ? (
            <LinearGradient
              pointerEvents="none"
              colors={[hexToRgba(cardColor, 0.88), hexToRgba(cardColor, 0.36), 'rgba(255,255,255,0)']}
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
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.sharedGoalsTitle, { color: primaryTextColor }]}>{isOwner ? strings.owner : strings.collaborator}</Text>
            <View style={styles.cardHeaderActions}>
              <TouchableOpacity
                style={styles.addCollaboratorButton}
                activeOpacity={0.85}
                onPress={(event) => {
                  event?.stopPropagation?.();
                  openAddCollaboratorModal(item);
                }}
              >
                <Text style={styles.addCollaboratorPlus}>+</Text>
              </TouchableOpacity>
              <CardMenuButton
                onPress={(event) => {
                  event?.stopPropagation?.();
                  openActionModal(item);
                }}
                iconColor={primaryTextColor}
                  accessibilityLabel={strings.sharedAccountActions}
              />
            </View>
          </View>
          <Text style={[styles.cardTitle, { color: primaryTextColor }]}>{item.name}</Text>
          <Text style={[styles.cardSubtitle, { color: secondaryTextColor }]}>{strings.togetherWith} {item.collaborators.map((c) => resolveCollaboratorName(c?.uid, c?.displayName || c?.email)).join(', ')}</Text>
          <Text style={[styles.cardBalance, { color: primaryTextColor }]}>{formatCurrency(sharedGoalsTotal, currency)}</Text>
          <View style={styles.sharedGoalsSection}>
            <View style={styles.sharedGoalsHeaderRow}>
              <Text style={[styles.sharedGoalsTitle, { color: secondaryTextColor }]}>{strings.savingsGoals}</Text>
            </View>
            <View style={styles.sharedGoalCarouselRow}>
              <View style={styles.sharedGoalCarouselListWrap}>
                {sharedGoals.length > 0 ? (
                  <FlatList
                    data={sharedGoals}
                    keyExtractor={(goal) => goal.id}
                    horizontal
                    scrollEnabled={shouldScrollSharedGoals}
                    nestedScrollEnabled
                    directionalLockEnabled
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.sharedGoalCarouselContent}
                    onTouchStart={() => {
                      if (shouldScrollSharedGoals) {
                        setSharedGoalsPagerSwipeEnabled(false);
                      }
                    }}
                    onTouchEnd={() => {
                      if (shouldScrollSharedGoals) {
                        setSharedGoalsPagerSwipeEnabled(true);
                      }
                    }}
                    onTouchCancel={() => {
                      if (shouldScrollSharedGoals) {
                        setSharedGoalsPagerSwipeEnabled(true);
                      }
                    }}
                    onScrollBeginDrag={() => {
                      if (shouldScrollSharedGoals) {
                        setSharedGoalsPagerSwipeEnabled(false);
                      }
                    }}
                    onScrollEndDrag={() => {
                      if (shouldScrollSharedGoals) {
                        setSharedGoalsPagerSwipeEnabled(true);
                      }
                    }}
                    onMomentumScrollBegin={() => {
                      if (shouldScrollSharedGoals) {
                        setSharedGoalsPagerSwipeEnabled(false);
                      }
                    }}
                    onMomentumScrollEnd={() => {
                      if (shouldScrollSharedGoals) {
                        setSharedGoalsPagerSwipeEnabled(true);
                      }
                    }}
                    renderItem={({ item: goal, index }) => {
                  const itemReservations = goal?.reservations || {};
                  const itemReservedTotal = Object.values(itemReservations).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
                  const itemTargetAmount = Number(goal?.targetAmount) || 0;
                  const itemProgress = itemTargetAmount > 0 ? Math.max(0, Math.min(1, itemReservedTotal / itemTargetAmount)) : 0;
                  const itemReached = itemTargetAmount > 0 && itemReservedTotal >= itemTargetAmount;
                  const itemSpacing = index < sharedGoals.length - 1 ? SHARED_GOAL_CARD_GAP : 0;
                  const goalImageUri = goal?.imageUri || '';

                  return (
                    <View key={goal.id} style={[styles.goalStackItem, !darkCard ? styles.goalStackItemLight : null, { width: sharedGoalCardWidth, marginRight: itemSpacing }] }>
                      <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={(event) => {
                          event?.stopPropagation?.();
                          openSharedGoalActivityModal(item, goal.id);
                        }}
                        style={styles.goalProgressContentTouchable}
                      >
                        <View style={styles.goalCardBody}>
                          <TouchableOpacity
                            activeOpacity={goalImageUri ? 0.88 : 1}
                            style={[styles.goalImageBackgroundTouchable, !goalImageUri && styles.goalImageBackgroundTouchableNoImage]}
                            onPress={(event) => {
                              if (!goalImageUri) return;
                              event?.stopPropagation?.();
                              handlePickSharedGoalImage(item, goal.id);
                            }}
                          >
                            {goalImageUri ? (
                              <Image source={{ uri: goalImageUri }} style={styles.goalImageBackgroundImage} />
                            ) : (
                              <View style={styles.goalImageBackgroundPlaceholder} />
                            )}
                            <View style={[styles.goalImageOverlay, !goalImageUri && styles.goalImageOverlayEmpty]}>
                              <View style={styles.goalArcActionWrap}>
                                <GoalProgressArc progress={itemProgress} isDark={isDark} />
                                <TouchableOpacity
                                  accessibilityLabel={strings.addReserve}
                                  activeOpacity={0.8}
                                  style={[styles.goalCardActionButton, styles.goalCardActionButtonAdd]}
                                  onPress={(event) => {
                                    event?.stopPropagation?.();
                                    openSharedGoalReserveModal(item, goal.id);
                                  }}
                                >
                                  <Ionicons name="add" size={20} color="#ffffff" />
                                </TouchableOpacity>
                              </View>
                            </View>
                            {!goalImageUri ? (
                              <TouchableOpacity
                                accessibilityLabel={strings.chooseGoalImage}
                                activeOpacity={0.85}
                                style={[styles.goalImageCornerButton, styles.goalImageCornerLeft]}
                                onPress={(event) => {
                                  event?.stopPropagation?.();
                                  handlePickSharedGoalImage(item, goal.id);
                                }}
                              >
                                <Ionicons name="image-outline" size={13} color="#f8fafc" />
                              </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                              accessibilityLabel={strings.goalActionsLabel}
                              activeOpacity={0.85}
                              style={styles.goalCardActionButtonDelete}
                              onPress={(event) => {
                                event?.stopPropagation?.();
                                handleSharedGoalDangerPress(item, goal);
                              }}
                            >
                              <Ionicons name="close" size={14} color="#dc2626" />
                            </TouchableOpacity>
                          </TouchableOpacity>
                          <Text style={[styles.goalNameText, !darkCard ? styles.goalNameTextLight : null]}>{goal.name || strings.savingsGoal}</Text>
                          <Text style={[styles.goalMetaText, !darkCard ? styles.goalMetaTextLight : null]}>
                            {`${formatCurrency(itemReservedTotal, currency)} / ${formatCurrency(itemTargetAmount, currency)}`}
                          </Text>
                          <Text style={[styles.goalMetaText, !darkCard ? styles.goalMetaTextLight : null]}>
                            {itemReached ? strings.goalReached : `${Math.round(itemProgress * 100)}% ${strings.reached}`}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                    }}
                  />
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.sharedGoalSideAddButton}
                activeOpacity={0.86}
                onPress={(event) => {
                  event?.stopPropagation?.();
                  openSharedGoalModal(item);
                }}
                accessibilityLabel={strings.addSavingsGoal}
              >
                <Text style={styles.sharedGoalSideAddButtonPlus}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, isDark ? styles.containerDark : null]}>
      <LinearGradient
        colors={sharedGradientColors}
        locations={SHARED_BACKGROUND_GRADIENT.locations}
        start={SHARED_BACKGROUND_GRADIENT.start}
        end={SHARED_BACKGROUND_GRADIENT.end}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sharedHeroImageLayer,
          {
            top: sharedImageLayerTop,
            height: sharedImageLayerHeight,
            transform: [{ translateY: heroScrollOffset }],
          },
        ]}
      >
        <Image
          source={SHARED_HERO_IMAGE}
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

      <Animated.View style={[styles.fixedHeroContainer, { transform: [{ translateY: heroScrollOffset }] }]}>
        <View style={styles.heroOverlay} />
        <View style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <TouchableOpacity style={styles.inboxButton} activeOpacity={0.9} onPress={() => setInboxVisible(true)}>
              <Text style={styles.inboxButtonIcon}>{strings.inbox}</Text>
              {invites.length > 0 ? (
                <View style={styles.inboxBadge}>
                  <Text style={styles.inboxBadgeText}>{invites.length > 9 ? '9+' : `${invites.length}`}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
          <Text style={styles.heading}>{strings.sharedSavings}</Text>
          <Text style={styles.heroSubtitle}>{strings.buildGoalsTogether}</Text>
          <View style={styles.summaryWidget}>
            <View>
              <Text style={styles.summaryLabel}>{strings.sharedBoxes}</Text>
              <Text style={styles.summaryValue}>{sharedAccountsCount}</Text>
              <Text style={styles.summaryNote}>{strings.total}: {formatCurrency(totalSharedBalance, currency)}</Text>
            </View>
            <TouchableOpacity style={styles.newButton} activeOpacity={0.86} onPress={() => setModalVisible(true)}>
              <Text style={styles.newButtonText}>{strings.newBox}</Text>
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

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>{strings.loadingSharedAccounts}</Text>
        </View>
      ) : (
        <AnimatedFlatList
          ref={listRef}
          data={sharedAccounts}
          keyExtractor={(item) => item.id}
          renderItem={renderAccount}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            {
              useNativeDriver: true,
              listener: (event) => {
                const offsetY = event.nativeEvent.contentOffset.y;
                const rawPullDistance = Math.max(0, -offsetY);
                const clampedPullDistance = Math.min(rawPullDistance, maxPullReveal);
                setPullDistance(clampedPullDistance);
                if (!refreshing && offsetY >= -0.5 && clampedPullDistance <= 0.5) {
                  setPullDistance(0);
                }
                if (rawPullDistance > maxPullReveal + 1 && listRef.current) {
                  listRef.current.scrollToOffset({ offset: -maxPullReveal, animated: false });
                }
              },
            }
          )}
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
          style={{ transform: [{ translateY: refreshHoldAnim }] }}
          ListEmptyComponent={<Text style={styles.emptyText}>{strings.noSharedAccounts}</Text>}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <KeyboardAwareModalOverlay style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{strings.createSharedSavings}</Text>
            <TextInput
              value={accountName}
              onChangeText={setAccountName}
              placeholder={strings.sharedAccountName}
              inputAccessoryViewID={`${SHARED_MODAL_ACCESSORY_ID}-create`}
              style={[styles.modalInput, styles.goalModalInput]}
            />
            <TextInput
              value={String(collaboratorCount)}
              onChangeText={(value) => {
                const parsed = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
                if (Number.isNaN(parsed)) {
                  setCollaboratorCount(1);
                  return;
                }
                setCollaboratorCount(Math.max(1, Math.min(12, parsed)));
              }}
              placeholder={strings.numberOfCollaborators}
              keyboardType="number-pad"
              inputAccessoryViewID={`${SHARED_MODAL_ACCESSORY_ID}-create`}
              style={[styles.modalInput, styles.labelInput, styles.goalModalInput]}
            />
            <TextInput
              value={inviteEmailsText}
              onChangeText={setInviteEmailsText}
              placeholder={strings.inviteEmailsHint}
              autoCapitalize="none"
              keyboardType="email-address"
              multiline
              numberOfLines={4}
              inputAccessoryViewID={`${SHARED_MODAL_ACCESSORY_ID}-create`}
              style={[styles.modalInput, styles.labelInput, styles.goalModalInput]}
            />
            <Text style={styles.helperText}>{strings.expected}: {collaboratorCount} {collaboratorCount > 1 ? strings.emailPlural : strings.emailSingle} · {strings.added}: {parsedInviteEmails.length}</Text>
            <Text style={styles.sectionLabel}>{strings.color}</Text>
            <View style={styles.colorRow}>
              {ACCOUNT_COLOR_PALETTE.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[styles.colorDot, { backgroundColor: color }, selectedColor === color && styles.colorDotSelected]}
                  onPress={() => setSelectedColor(color)}
                />
              ))}
            </View>
            <Text style={styles.sectionLabel}>{strings.cardImageOptional}</Text>
            <TouchableOpacity style={styles.imagePickerButton} onPress={handlePickCardImage}>
              <Text style={styles.imagePickerButtonText}>{cardImageUri ? strings.changeImage : strings.chooseImageFromGallery}</Text>
            </TouchableOpacity>
            {cardImageUri ? (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: cardImageUri }} style={styles.imagePreview} />
                <TouchableOpacity style={styles.removeImageButton} onPress={() => setCardImageUri('')}>
                  <Text style={styles.removeImageButtonText}>{strings.removeImage}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
              <TouchableOpacity style={[styles.modalButtonCancel, styles.goalModalButtonCancelCompact]} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalButtonText}>{strings.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButtonConfirm, styles.goalModalButtonConfirmCompact]} onPress={handleCreateShared}>
                <Text style={styles.goalModalButtonConfirmText}>{strings.create}</Text>
              </TouchableOpacity>
            </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAwareModalOverlay>
        </TouchableWithoutFeedback>

        <IOSKeyboardDoneAccessory nativeID={`${SHARED_MODAL_ACCESSORY_ID}-create`} label={language === 'nl' ? 'Gereed' : 'Done'} />
      </Modal>

      <Modal visible={inboxVisible} animationType="slide" transparent onRequestClose={() => setInboxVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setInboxVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{strings.sharedInbox}</Text>
            {invites.length === 0 ? (
              <Text style={styles.emptyText}>{strings.noPendingInvites}</Text>
            ) : (
              <FlatList
                data={invites}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const actionBusy = inviteActionId === item.id;
                  return (
                    <View style={styles.inviteItem}>
                      <Text style={styles.inviteItemTitle}>{item.sharedAccountName || strings.sharedSavingsAccount}</Text>
                      <Text style={styles.inviteItemMeta}>{`${strings.invitedBy} ${item.inviterDisplayName || item.inviterEmail || strings.collaborator}`}</Text>
                      <View style={styles.inviteActionsRow}>
                        <TouchableOpacity
                          style={[styles.inviteActionButton, styles.inviteDeclineButton, actionBusy && styles.inviteActionDisabled]}
                          onPress={() => handleDeclineInvite(item)}
                          disabled={actionBusy}
                        >
                          <Text style={styles.inviteDeclineText}>{strings.decline}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.inviteActionButton, styles.inviteAcceptButton, actionBusy && styles.inviteActionDisabled]}
                          onPress={() => handleAcceptInvite(item)}
                          disabled={actionBusy}
                        >
                          <Text style={styles.inviteAcceptText}>{actionBusy ? '...' : strings.accept}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }}
              />
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setInboxVisible(false)}>
                <Text style={styles.cancelButtonText}>{strings.close}</Text>
              </TouchableOpacity>
            </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <CardActionMenu
        visible={!!actionMenuState}
        title={actionMenuState?.title}
        items={actionMenuState?.items || []}
        cancelLabel={strings.cancel}
        onClose={closeActionModal}
        onSelect={handleActionMenuSelect}
      />

      <Modal visible={renameModalVisible} animationType="slide" transparent onRequestClose={() => setRenameModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setRenameModalVisible(false)}>
          <KeyboardAwareModalOverlay style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{strings.renameSharedBox}</Text>
                <TextInput
                  value={renameText}
                  onChangeText={setRenameText}
                  placeholder={strings.newName}
                  inputAccessoryViewID={`${SHARED_MODAL_ACCESSORY_ID}-rename`}
                  style={styles.input}
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setRenameModalVisible(false);
                      setRenameTargetAccount(null);
                      setRenameText('');
                    }}
                  >
                    <Text style={styles.cancelButtonText}>{strings.cancel}</Text>
                  </TouchableOpacity>
                  <PrimaryButton title={strings.save} onPress={handleRenameShared} style={styles.createButton} textStyle={styles.createButtonText} />
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAwareModalOverlay>
        </TouchableWithoutFeedback>

        <IOSKeyboardDoneAccessory nativeID={`${SHARED_MODAL_ACCESSORY_ID}-rename`} label={language === 'nl' ? 'Gereed' : 'Done'} />
      </Modal>

      <Modal visible={goalModalVisible} animationType="slide" transparent onRequestClose={closeSharedGoalModal}>
        <TouchableWithoutFeedback onPress={closeSharedGoalModal}>
          <KeyboardAwareModalOverlay style={styles.modalOverlay} keyboardDoneLabel={language === 'nl' ? 'Gereed' : 'Done'}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{strings.createSavingsGoal}</Text>
                <TextInput
                  value={goalNameInput}
                  onChangeText={setGoalNameInput}
                  placeholder={strings.goalNameOptional}
                  style={[styles.modalInput, styles.goalModalInput]}
                />
                <TextInput
                  value={goalAmountInput}
                  onChangeText={setGoalAmountInput}
                  keyboardType="numeric"
                  placeholder={strings.goalAmount}
                  style={[styles.modalInput, styles.labelInput, styles.goalModalInput]}
                />
                <TouchableOpacity style={styles.goalImagePickerButton} onPress={handlePickGoalImageForCreate}>
                  <Text style={styles.goalImagePickerText}>{goalImageInputUri ? strings.changeGoalImage : strings.chooseGoalImageOptional}</Text>
                </TouchableOpacity>
                <View style={styles.goalImagePreviewWrap}>
                  {goalImageInputUri ? (
                    <Image source={{ uri: goalImageInputUri }} style={styles.goalImagePreview} />
                  ) : (
                    <View style={styles.goalImagePreviewPlaceholder}>
                      <Ionicons name="image-outline" size={18} color="#94a3b8" />
                      <Text style={styles.goalImagePreviewPlaceholderText}>{strings.noImageSelected}</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
                  <TouchableOpacity style={[styles.modalButtonCancel, styles.goalModalButtonCancelCompact]} onPress={closeSharedGoalModal}>
                    <Text style={styles.modalButtonText}>{strings.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalButtonConfirm, styles.goalModalButtonConfirmCompact]} onPress={handleCreateSharedSavingsGoal}>
                    <Text style={styles.goalModalButtonConfirmText}>{strings.createGoal}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAwareModalOverlay>
        </TouchableWithoutFeedback>

      </Modal>

      <Modal visible={goalReserveModalVisible} animationType="slide" transparent onRequestClose={closeSharedGoalReserveModal}>
          <KeyboardAvoidingView
            style={[
              styles.modalOverlay,
              styles.goalReserveModalOverlay,
              Platform.OS === 'ios' && goalReserveKeyboardInset > 0 ? styles.goalReserveModalOverlayKeyboardOpen : null,
              Platform.OS === 'ios' && goalReserveKeyboardInset > 0
                ? { paddingBottom: goalReserveKeyboardInset }
                : null,
            ]}
          >
            <TouchableWithoutFeedback onPress={closeSharedGoalReserveModal}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
                <Text style={styles.modalTitle}>
                  {goalReserveMode === 'withdraw' ? strings.withdraw : strings.reserveForGoal}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {goalReserveMode === 'withdraw'
                    ? (goalReserveTargetAccount?.name || strings.sharedSavingsBox)
                    : 'Add from:'}
                </Text>

                <View style={styles.goalReserveAccountList}>
                  {goalReserveMode === 'withdraw' ? (
                    sharedGoalWithdrawSources.map((source) => {
                      const selected = goalReserveSelection === source.id;
                      return (
                        <TouchableOpacity
                          key={source.id}
                          style={[styles.goalReserveAccountItem, selected && styles.goalReserveAccountItemActive]}
                          activeOpacity={0.86}
                          onPress={() => {
                            setGoalReserveSelection(source.id);
                            const currentInputValue = parseAmountInput(goalReserveAmountInput);
                            if (!Number.isNaN(currentInputValue) && currentInputValue > source.reserved) {
                              setGoalReserveAmountInput(formatAmountInputValue(source.reserved));
                            }
                          }}
                        >
                          <View style={styles.goalReserveAccountMeta}>
                            <Text style={styles.goalReserveAccountName}>{source.name}</Text>
                            <Text style={styles.goalReserveAccountSub}>{formatCurrency(source.reserved, currency)}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <>
                      {reserveSourceItems.map((source) => {
                        const availability = getAccountAvailabilityBreakdown(source, individualSavingsGoals, sharedAccounts);
                        const selected = goalReserveSelection === source.id;
                        const disabled = availability.available <= 0;
                        return (
                          <TouchableOpacity
                            key={source.id}
                            style={[styles.goalReserveAccountItem, selected && styles.goalReserveAccountItemActive, disabled && styles.goalReserveAccountItemDisabled]}
                            activeOpacity={0.86}
                            disabled={disabled}
                            onPress={() => {
                              setGoalReserveSelection(source.id);
                              const currentInputValue = parseAmountInput(goalReserveAmountInput);
                              if (!Number.isNaN(currentInputValue) && currentInputValue > availability.available) {
                                setGoalReserveAmountInput(formatAmountInputValue(availability.available));
                              }
                            }}
                          >
                            <View style={styles.reserveAccountMeta}>
                              <Text style={styles.reserveAccountName}>{source.name}</Text>
                              <Text style={styles.reserveAccountSub}>{`${formatCurrency(availability.available, currency)} ${strings.available}`}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}
                </View>

                {goalReserveMode === 'withdraw' ? (
                  goalReserveSelection ? (
                    <>
                    <AmountAllocationSlider
                      value={sharedReserveSliderValue}
                      max={sharedReserveMaxAmount}
                      onChange={(nextValue) => setGoalReserveAmountInput(formatAmountInputValue(nextValue))}
                      accentColor="#D50000"
                      valueLabel={formatCurrency(sharedReserveSliderValue, currency)}
                      maxLabel={`${strings.reserveTooHigh} ${formatCurrency(sharedReserveMaxAmount, currency)}`}
                      disabled={sharedReserveMaxAmount <= 0}
                    />
                    <TextInput
                      value={goalReserveAmountInput}
                      onChangeText={(value) => {
                        if (!value) {
                          setGoalReserveAmountInput('');
                          return;
                        }
                        const parsedValue = parseFloat(String(value).replace(',', '.'));
                        if (Number.isNaN(parsedValue)) {
                          setGoalReserveAmountInput(value);
                          return;
                        }
                        setGoalReserveAmountInput(formatAmountInputValue(Math.min(parsedValue, sharedReserveMaxAmount)));
                      }}
                      keyboardType="numeric"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      placeholder={strings.reserveAmount}
                      placeholderTextColor="#6b7280"
                      inputAccessoryViewID={Platform.OS === 'ios' ? goalReserveAmountAccessoryId : undefined}
                      style={[styles.modalInput, styles.labelInput, styles.goalModalInput]}
                    />
                    </>
                  ) : (
                    <Text style={styles.helperText}>Select a source to continue.</Text>
                  )
                ) : (
                  <>
                    <AmountAllocationSlider
                      value={sharedReserveSliderValue}
                      max={sharedReserveMaxAmount}
                      onChange={(nextValue) => setGoalReserveAmountInput(formatAmountInputValue(nextValue))}
                      accentColor={GOAL_ACTION_GREEN}
                      valueLabel={formatCurrency(sharedReserveSliderValue, currency)}
                      maxLabel={`${strings.reserveTooHigh} ${formatCurrency(sharedReserveMaxAmount, currency)}`}
                      disabled={sharedReserveMaxAmount <= 0}
                    />
                    <TextInput
                      value={goalReserveAmountInput}
                      onChangeText={(value) => {
                        if (!value) {
                          setGoalReserveAmountInput('');
                          return;
                        }
                        const parsedValue = parseFloat(String(value).replace(',', '.'));
                        if (Number.isNaN(parsedValue)) {
                          setGoalReserveAmountInput(value);
                          return;
                        }
                        setGoalReserveAmountInput(formatAmountInputValue(Math.min(parsedValue, sharedReserveMaxAmount)));
                      }}
                      keyboardType="numeric"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      placeholder={strings.reserveAmount}
                      placeholderTextColor="#6b7280"
                      inputAccessoryViewID={Platform.OS === 'ios' ? goalReserveAmountAccessoryId : undefined}
                      style={[styles.modalInput, styles.labelInput, styles.goalModalInput]}
                    />
                  </>
                )}

                <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
                  <TouchableOpacity style={[styles.modalButtonCancel, styles.goalModalButtonCancelCompact]} onPress={closeSharedGoalReserveModal}>
                    <Text style={styles.modalButtonText}>{strings.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButtonConfirm,
                      styles.goalModalButtonConfirmCompact,
                      goalReserveMode === 'withdraw' ? styles.goalReserveWithdrawButton : null,
                    ]}
                    onPress={handleAddSharedGoalReservation}
                  >
                    <Text style={styles.goalModalButtonConfirmText}>{goalReserveMode === 'withdraw' ? strings.withdraw : strings.addReserve}</Text>
                  </TouchableOpacity>
                </View>
            </ScrollView>
          </KeyboardAvoidingView>

        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={goalReserveAmountAccessoryId}>
            <View style={styles.keyboardAccessoryBar}>
              <TouchableOpacity style={styles.keyboardAccessoryDoneButton} onPress={Keyboard.dismiss}>
                <Text style={styles.keyboardAccessoryDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        ) : null}
      </Modal>

      <Modal visible={goalActivityModalVisible} animationType="slide" transparent onRequestClose={closeSharedGoalActivityModal}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={closeSharedGoalActivityModal}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{goalActivityGoal?.name || strings.savingsGoal}</Text>
                <Text style={styles.modalSubtitle}>
                  {`${goalActivityAccount?.name || strings.sharedSavingsBox} · ${strings.goalActivity}`}
                </Text>

                <View style={styles.goalActivityTotalRow}>
                  <Text style={styles.goalActivityTotalLabel}>{strings.totalReserved}</Text>
                  <Text style={styles.goalActivityTotalValue}>
                    {`${formatCurrency(goalActivityTotal, currency)} / ${formatCurrency(goalActivityGoal?.targetAmount || 0, currency)}`}
                  </Text>
                </View>

                {goalActivityColumns.length > 0 ? (
                  goalActivityColumns.length > 2 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.goalActivityColumnsRow}
                      style={styles.goalActivityList}
                    >
                      {goalActivityColumns.map((column) => renderGoalActivityColumn(column, true))}
                    </ScrollView>
                  ) : (
                    <View style={[styles.goalActivityColumnsRow, styles.goalActivityList]}>
                      {goalActivityColumns.map((column) => renderGoalActivityColumn(column, false))}
                    </View>
                  )
                ) : (
                  <Text style={styles.helperText}>{strings.noGoalActivity}</Text>
                )}

                <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
                  <TouchableOpacity style={[styles.modalButtonCancel, styles.goalModalButtonCancelCompact, styles.goalActionCancelAligned]} onPress={closeSharedGoalActivityModal}>
                    <Text style={styles.modalButtonText}>{strings.close}</Text>
                  </TouchableOpacity>
                  <View style={styles.goalActionStack}>
                    <TouchableOpacity
                      style={[styles.modalButtonConfirm, styles.goalModalButtonConfirmCompact, styles.goalActionStackButton]}
                      onPress={() => {
                        const targetAccount = goalActivityAccount;
                        const targetGoalId = goalActivityTargetGoalId;
                        closeSharedGoalActivityModal();
                        openSharedGoalReserveModal(targetAccount, targetGoalId);
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
                        goalActivityTotal <= 0 ? styles.goalModalButtonDisabled : null,
                      ]}
                      disabled={goalActivityTotal <= 0}
                      onPress={() => {
                        const targetAccount = goalActivityAccount;
                        const targetGoalId = goalActivityTargetGoalId;
                        closeSharedGoalActivityModal();
                        openSharedGoalReserveModal(targetAccount, targetGoalId, 'withdraw');
                      }}
                    >
                      <Text style={styles.goalModalButtonConfirmText}>{strings.withdraw}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
          </View>
        </View>
      </Modal>

      <Modal visible={addCollaboratorModalVisible} animationType="slide" transparent onRequestClose={closeAddCollaboratorModal}>
        <TouchableWithoutFeedback onPress={closeAddCollaboratorModal}>
          <KeyboardAwareModalOverlay style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{strings.addCollaborator}</Text>
                <Text style={styles.helperText}>{addCollaboratorTargetAccount?.name || strings.sharedSavingsBox}</Text>
                <TextInput
                  value={addCollaboratorEmails}
                  onChangeText={setAddCollaboratorEmails}
                  placeholder={strings.inviteEmailsHint}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  multiline
                  numberOfLines={4}
                  inputAccessoryViewID={`${SHARED_MODAL_ACCESSORY_ID}-add-collaborator`}
                  style={[styles.modalInput, styles.labelInput, styles.goalModalInput]}
                />
                <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
                  <TouchableOpacity
                    style={[
                      styles.modalButtonCancel,
                      styles.goalModalButtonCancelCompact,
                      addCollaboratorBusy ? styles.goalModalButtonDisabled : null,
                    ]}
                    onPress={closeAddCollaboratorModal}
                    disabled={addCollaboratorBusy}
                  >
                    <Text style={styles.modalButtonText}>{strings.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButtonConfirm,
                      styles.goalModalButtonConfirmCompact,
                      addCollaboratorBusy ? styles.goalModalButtonDisabled : null,
                    ]}
                    onPress={handleInviteCollaborators}
                    disabled={addCollaboratorBusy}
                  >
                    <Text style={styles.goalModalButtonConfirmText}>{addCollaboratorBusy ? strings.sending : strings.sendInvite}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAwareModalOverlay>
        </TouchableWithoutFeedback>

        <IOSKeyboardDoneAccessory nativeID={`${SHARED_MODAL_ACCESSORY_ID}-add-collaborator`} label={language === 'nl' ? 'Gereed' : 'Done'} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SHARED_BACKGROUND_GRADIENT.solidLight },
  containerDark: { backgroundColor: SHARED_BACKGROUND_GRADIENT.solidDark },
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
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
    backgroundColor: 'rgba(35, 10, 6, 0.2)',
  },
  heroTopRow: {
    position: 'absolute',
    top: 70,
    left: 20,
    right: 20,
    zIndex: 3,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 0,
  },
  inboxButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    position: 'relative',
  },
  inboxButtonIcon: {
    color: '#ffedd5',
    fontWeight: '700',
    fontSize: 12,
  },
  inboxBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  heroContent: { flex: 1, paddingTop: 62, paddingHorizontal: 20, paddingBottom: 22 },
  heading: { fontSize: 32, fontWeight: '900', color: '#ffedd5', marginTop: 0 },
  heroSubtitle: { fontSize: 14, color: '#fed7aa', marginTop: 4, marginBottom: 18 },
  summaryWidget: {
    marginTop: 0,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  summaryLabel: { fontSize: 12, color: '#ffedd5', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  summaryValue: { fontSize: 30, fontWeight: '800', color: '#ffffff' },
  summaryNote: { fontSize: 13, color: '#ffe4c2', marginTop: 8 },
  newButton: {
    minWidth: 122,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(18, 18, 32, 0.62)',
    borderWidth: 1.5,
    borderColor: 'rgba(249, 168, 212, 0.7)',
  },
  newButtonText: {
    color: '#ffedd5',
    fontWeight: '700',
    fontSize: 13,
  },
  loadingWrap: { flex: 1, paddingTop: HERO_SCENE_HEIGHT + 24, paddingHorizontal: 20 },
  loadingText: { color: '#7c2d12', fontWeight: '600' },
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
  listContent: { paddingTop: HERO_SCENE_HEIGHT + 8, paddingBottom: 120 },
  emptyText: { color: '#9a3412', marginTop: 12 },
  cardWrapper: { width: '100%', marginBottom: 6, paddingHorizontal: 16 },
  card: {
    borderRadius: 12,
    minHeight: 120,
    padding: 18,
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addCollaboratorButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOAL_ACTION_GREEN,
    borderWidth: 1,
    borderColor: '#65a30d',
  },
  addCollaboratorPlus: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 20,
    lineHeight: 22,
  },
  sharedAvatarOverlayButton: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.44)',
    overflow: 'hidden',
  },
  sharedAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
  },
  sharedAvatarEmpty: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(248,250,252,0.9)',
    backgroundColor: 'transparent',
  },
  cardMenuButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cardMenuText: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardTitle: { fontSize: 18, fontWeight: '500', letterSpacing: 0.5, marginBottom: 6 },
  cardSubtitle: { fontSize: 13, marginBottom: 10 },
  cardBalance: { fontSize: 28, fontWeight: '700', color: '#ffffff', marginBottom: 16 },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
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
  sharedGoalsSection: {
    marginTop: 2,
    paddingTop: 8,
  },
  sharedGoalsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 8,
  },
  sharedGoalsTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  goalActionButtonCompact: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#65a30d',
    backgroundColor: GOAL_ACTION_GREEN,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  goalActionButtonText: { color: '#f8fafc', fontWeight: '700', fontSize: 14 },
  sharedGoalCarouselContent: {
    paddingBottom: 4,
    paddingRight: 6,
  },
  sharedGoalCarouselRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sharedGoalCarouselListWrap: {
    flex: 1,
  },
  sharedGoalSideAddButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#65a30d',
    backgroundColor: GOAL_ACTION_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sharedGoalSideAddButtonPlus: {
    color: '#f8fafc',
    fontWeight: '800',
    fontSize: 22,
    lineHeight: 22,
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
  goalProgressContentTouchable: {
    width: '100%',
    alignItems: 'center',
    flex: 1,
  },
  goalCardBody: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 4,
  },
  goalImageBackgroundTouchable: {
    width: '100%',
    height: 108,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: -4,
    marginBottom: 10,
    position: 'relative',
  },
  goalImageBackgroundTouchableNoImage: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  goalImageBackgroundImage: {
    width: '100%',
    height: '100%',
  },
  goalImageBackgroundPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalImageOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.18)',
  },
  goalImageOverlayEmpty: {
    backgroundColor: 'transparent',
  },
  goalArcActionWrap: {
    position: 'relative',
    width: 96,
    height: 96,
    marginTop: 8,
    marginBottom: 0,
    marginLeft: 0,
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
    left: '50%',
    top: '50%',
    marginLeft: -17,
    marginTop: -17,
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOAL_ACTION_GREEN,
    borderColor: 'rgba(220,252,231,0.45)',
  },
  goalImageCornerButton: {
    position: 'absolute',
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 3,
  },
  goalImageCornerLeft: {
    left: 6,
  },
  goalImageCornerRight: {
    right: 6,
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
  goalNameText: { color: '#ffffff', fontWeight: '700', fontSize: 13, textAlign: 'center', marginTop: 2 },
  goalNameTextLight: { color: '#0f172a' },
  goalMetaText: { color: 'rgba(226,232,240,0.92)', fontSize: 12, textAlign: 'center', marginTop: 2 },
  goalMetaTextLight: { color: '#334155' },
  goalImageThumb: {
    width: 58,
    height: 38,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 2,
    marginBottom: 4,
  },
  goalImageThumbImage: {
    width: '100%',
    height: '100%',
  },
  goalImageThumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  goalReserveModalOverlay: {
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  goalReserveModalOverlayKeyboardOpen: {
    justifyContent: 'flex-end',
  },
  goalReserveAccountList: {
    marginBottom: 12,
  },
  goalReserveAccountItem: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  goalReserveAccountItemActive: {
    borderColor: '#0f5132',
    backgroundColor: '#ecfdf5',
  },
  goalReserveAccountItemDisabled: {
    opacity: 0.45,
  },
  goalReserveAccountMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalReserveAccountName: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  goalReserveAccountSub: {
    color: '#2f5e4f',
    fontSize: 12,
    marginLeft: 10,
  },
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
  goalActivityTotalLabel: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  goalActivityTotalValue: {
    color: '#0f5132',
    fontSize: 13,
    fontWeight: '700',
  },
  goalActivityList: {
    maxHeight: 280,
    marginBottom: 12,
  },
  goalActivityListContent: {
    paddingBottom: 4,
  },
  goalActivityColumnsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  goalActivityColumnList: {
    maxHeight: 220,
  },
  goalActivityColumn: {
    marginRight: 8,
  },
  goalActivityColumnFlexible: {
    flex: 1,
  },
  goalActivityColumnFixed: {
    width: 150,
  },
  goalActivityColumnName: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  goalActivityColumnTotal: {
    color: '#0f5132',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  goalActivityItem: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  goalActivityItemMeta: {
    flex: 1,
    paddingRight: 10,
  },
  goalActivityItemName: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  goalActivityItemSub: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  goalActivityItemAmount: {
    color: '#0f5132',
    fontSize: 14,
    fontWeight: '700',
  },
  goalActivityItemAmountNegative: {
    color: '#dc2626',
  },
  goalWithdrawButton: {
    backgroundColor: '#D50000',
    borderColor: '#D50000',
    marginTop: 8,
    alignItems: 'center',
  },
  goalActionStack: {
    flex: 1,
    marginLeft: 8,
  },
  goalActionStackButton: {
    flex: 0,
    marginLeft: 0,
    width: '100%',
  },
  goalActionCancelAligned: {
    justifyContent: 'center',
  },
  goalReserveWithdrawButton: {
    backgroundColor: '#D50000',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    marginBottom: 18,
  },
  labelInput: {},
  goalModalInput: {
    color: '#334155',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButtonCancel: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalButtonConfirm: {
    flex: 1,
    marginLeft: 8,
    backgroundColor: GOAL_ACTION_GREEN,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalButtonConfirmText: {
    color: '#f8fafc',
  },
  modalButtonText: {
    fontWeight: '700',
    color: '#0f172a',
  },
  goalModalButtonsCompact: {
    marginTop: 2,
  },
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
  goalModalButtonConfirmText: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  goalModalButtonDisabled: {
    opacity: 0.6,
  },
  goalReserveExternalButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
  },
  goalReserveExternalButtonActive: {
    borderColor: GOAL_ACTION_GREEN,
    backgroundColor: '#f0fdf4',
  },
  goalReserveExternalText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13,
  },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalScroll: { width: '100%', flexGrow: 0 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 10 },
  modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  modalSubtitle: { fontSize: 14, color: '#334155', marginBottom: 18 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, marginBottom: 14, backgroundColor: '#fff' },
  helperText: {
    color: '#334155',
    fontSize: 12,
    marginTop: -4,
    marginBottom: 12,
  },
  sectionLabel: { fontSize: 14, color: '#334155', marginBottom: 10 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 18 },
  colorDot: { width: 36, height: 36, borderRadius: 12, marginRight: 10, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  colorDotSelected: { borderColor: '#0f5132' },
  imagePickerButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f8fafc',
    marginBottom: 10,
  },
  imagePickerButtonText: {
    color: '#334155',
    fontWeight: '600',
  },
  imagePreviewWrap: {
    marginBottom: 10,
  },
  imagePreview: {
    width: '100%',
    height: 130,
    borderRadius: 14,
  },
  goalImagePickerButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    marginBottom: 10,
  },
  goalImagePickerText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
  goalImagePreviewWrap: {
    marginBottom: 10,
  },
  goalImagePreview: {
    width: '100%',
    height: 86,
    borderRadius: 12,
  },
  goalImagePreviewPlaceholder: {
    width: '100%',
    height: 86,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalImagePreviewPlaceholderText: {
    marginTop: 6,
    color: '#334155',
    fontSize: 12,
  },
  removeImageButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
  },
  removeImageButtonText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 12,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  cancelButton: { paddingVertical: 14, paddingHorizontal: 18, marginRight: 10, borderRadius: 14, backgroundColor: '#f1f5f9' },
  cancelButtonText: { color: '#334155', fontWeight: '700' },
  createButton: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 14, backgroundColor: GOAL_ACTION_GREEN },
  createButtonText: { color: '#ffffff', fontWeight: '700' },
  inviteItem: {
    backgroundColor: '#fff7ed',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 12,
    marginBottom: 10,
  },
  inviteItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7c2d12',
  },
  inviteItemMeta: {
    marginTop: 4,
    color: '#9a3412',
    fontSize: 12,
  },
  inviteActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  inviteActionButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 8,
  },
  inviteAcceptButton: {
    backgroundColor: GOAL_ACTION_GREEN,
  },
  inviteDeclineButton: {
    backgroundColor: '#f1f5f9',
  },
  inviteAcceptText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  inviteDeclineText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12,
  },
  inviteActionDisabled: {
    opacity: 0.6,
  },
  actionModalContent: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 22,
  },
  actionItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  actionItemText: {
    fontSize: 16,
    color: '#1f2937',
    fontWeight: '600',
  },
  actionItemDanger: {
    borderBottomColor: '#fecaca',
  },
  actionItemDangerText: {
    color: '#b91c1c',
  },
  actionCancel: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  actionCancelText: {
    color: '#334155',
  },
});
