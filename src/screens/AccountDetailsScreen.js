import * as ImagePicker from 'expo-image-picker';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { IOSKeyboardDoneAccessory, KeyboardAwareModalOverlay } from '../components/ModalKeyboardSupport';
import PrimaryButton from '../components/PrimaryButton';
import { ACCOUNT_COLOR_PALETTE, formatCurrency, getReadableTextColor } from '../constants/colors';
import {
    adjustAccountBalance,
    createRecurringTransaction,
    subscribeToAccountTransactions,
    subscribeToRecurringTransactions,
    subscribeToUserDocument,
    updateAccountColor,
    updateAccountImage,
    updateTransactionLabel,
} from '../firebase/firestore';
import { uploadCardImage } from '../firebase/storage';

const ACCOUNT_DETAILS_TRANSLATIONS = {
  en: {
    accountDetails: 'Account details',
    currentBalance: 'Current balance',
    add: 'Add',
    withdraw: 'Withdraw',
    accountType: 'Account type',
    virtualAccount: 'Virtual account',
    accountId: 'Account ID',
    unknown: 'Unknown',
    customizeColor: 'Customize color',
    transactionHistory: 'Transaction history',
    noTransactions: 'No transactions yet.',
    recurringSchedule: 'Recurring schedule',
    createRepeatingDeposit: 'Create a repeating deposit',
    schedule: 'Schedule',
    recurringDefaultLabel: 'Recurring',
    noRecurringSchedules: 'No recurring schedules yet.',
    addFunds: 'Add funds',
    withdrawFunds: 'Withdraw funds',
    enterAmount: 'Enter amount',
    labelOptional: 'Label (optional)',
    cancel: 'Cancel',
    confirm: 'Confirm',
    editLabel: 'Edit label',
    transactionLabel: 'Transaction label',
    saveLabel: 'Save label',
    scheduleRecurringDeposit: 'Schedule recurring deposit',
    amount: 'Amount',
    createSchedule: 'Create schedule',
    deposit: 'Deposit',
    readOnlyLinked: 'Read-only linked account',
    readOnlyLinkedHint: 'This account syncs balances in read-only mode. Manual balance changes are disabled for security.',
    actionsDisabledReadOnly: 'Actions disabled for read-only linked accounts.',
    invalidAmount: 'Enter a valid amount greater than 0.',
    transactionFailed: 'Could not update this amount. Please try again.',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    reservedFor: 'reserved for',
    savingGoal: 'saving goal',
    cardImageOptional: 'Card image (optional)',
    changeImage: 'Change image',
    chooseImage: 'Choose image from gallery',
    removeImage: 'Remove image',
    permissionNeeded: 'Permission needed',
    photoPermission: 'Please allow photo access to choose a card image.',
    imageUploadFailed: 'Image upload failed',
    updateImageFailed: 'Could not update card image.',
    imageRemovalFailed: 'Image removal failed',
    removeImageFailed: 'Could not remove card image.',
    done: 'Done',
  },
  nl: {
    accountDetails: 'Rekeningdetails',
    currentBalance: 'Huidig saldo',
    add: 'Storten',
    withdraw: 'Opnemen',
    accountType: 'Rekeningtype',
    virtualAccount: 'Virtuele rekening',
    accountId: 'Rekening-ID',
    unknown: 'Onbekend',
    customizeColor: 'Kleur aanpassen',
    transactionHistory: 'Transactiegeschiedenis',
    noTransactions: 'Nog geen transacties.',
    recurringSchedule: 'Terugkerend schema',
    createRepeatingDeposit: 'Maak een terugkerende storting',
    schedule: 'Inplannen',
    recurringDefaultLabel: 'Terugkerend',
    noRecurringSchedules: 'Nog geen terugkerende schema\'s.',
    addFunds: 'Geld toevoegen',
    withdrawFunds: 'Geld opnemen',
    enterAmount: 'Voer bedrag in',
    labelOptional: 'Label (optioneel)',
    cancel: 'Annuleren',
    confirm: 'Bevestigen',
    editLabel: 'Label bewerken',
    transactionLabel: 'Transactielabel',
    saveLabel: 'Label opslaan',
    scheduleRecurringDeposit: 'Terugkerende storting plannen',
    amount: 'Bedrag',
    createSchedule: 'Schema maken',
    deposit: 'Storting',
    readOnlyLinked: 'Alleen-lezen gekoppelde rekening',
    readOnlyLinkedHint: 'Deze rekening synchroniseert saldo alleen-lezen. Handmatige saldo-aanpassingen zijn uitgeschakeld voor veiligheid.',
    actionsDisabledReadOnly: 'Acties uitgeschakeld voor alleen-lezen gekoppelde rekeningen.',
    invalidAmount: 'Voer een geldig bedrag groter dan 0 in.',
    transactionFailed: 'Kon dit bedrag niet aanpassen. Probeer opnieuw.',
    daily: 'Dagelijks',
    weekly: 'Wekelijks',
    monthly: 'Maandelijks',
    reservedFor: 'gereserveerd voor',
    savingGoal: 'spaardoel',
    cardImageOptional: 'Kaartafbeelding (optioneel)',
    changeImage: 'Afbeelding wijzigen',
    chooseImage: 'Afbeelding uit galerij kiezen',
    removeImage: 'Afbeelding verwijderen',
    permissionNeeded: 'Toestemming nodig',
    photoPermission: 'Geef toegang tot foto’s om een kaartafbeelding te kiezen.',
    imageUploadFailed: 'Afbeelding uploaden mislukt',
    updateImageFailed: 'Kaartafbeelding bijwerken mislukt.',
    imageRemovalFailed: 'Afbeelding verwijderen mislukt',
    removeImageFailed: 'Kaartafbeelding verwijderen mislukt.',
    done: 'Gereed',
  },
};

const ACTION_GREEN_GRADIENT = ['#84cc16', '#84cc16', '#84cc16'];
const ACCOUNT_MODAL_ACCESSORY_ID = 'account-details-modal-input-accessory';

function getFrequencyLabel(frequency, strings) {
  if (frequency === 'daily') return strings.daily;
  if (frequency === 'weekly') return strings.weekly;
  if (frequency === 'monthly') return strings.monthly;
  return frequency;
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

export default function AccountDetailsScreen({ route, navigation }) {
  const { account, userId, currency } = route.params || {};
  const [transactions, setTransactions] = useState([]);
  const [recurringSchedules, setRecurringSchedules] = useState([]);
  const [selectedColor, setSelectedColor] = useState(account?.color || '#e2e8f0');
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [transactionType, setTransactionType] = useState('deposit');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionLabel, setTransactionLabel] = useState('');
  const [labelEditModalVisible, setLabelEditModalVisible] = useState(false);
  const [labelEditText, setLabelEditText] = useState('');
  const [labelEditTransaction, setLabelEditTransaction] = useState(null);
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);
  const [recurringAmount, setRecurringAmount] = useState('');
  const [recurringFrequency, setRecurringFrequency] = useState('monthly');
  const [recurringLabel, setRecurringLabel] = useState('');
  const [language, setLanguage] = useState('en');
  const [savingsGoal, setSavingsGoal] = useState(null);
  const [cardImageUrl, setCardImageUrl] = useState(account?.imageUrl || '');

  useLayoutEffect(() => {
    const headerColor = selectedColor || '#0f5132';
    const headerTextColor = getReadableTextColor(headerColor);
    const headerStrings = ACCOUNT_DETAILS_TRANSLATIONS[language] || ACCOUNT_DETAILS_TRANSLATIONS.en;
    navigation.setOptions({
      title: account?.name || headerStrings.accountDetails,
      headerStyle: { backgroundColor: headerColor },
      headerTintColor: headerTextColor,
      headerTitleStyle: { fontWeight: '700', color: headerTextColor },
      headerBackTitleVisible: false,
    });
  }, [navigation, selectedColor, language, account?.name]);

  useEffect(() => {
    if (!userId || !account?.id) return;

    const unsubscribe = subscribeToAccountTransactions(userId, account.id, (history) => {
      setTransactions(history);
    });

    const unsubscribeRecurring = subscribeToRecurringTransactions(userId, account.id, (schedules) => {
      setRecurringSchedules(schedules);
    });

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeRecurring) unsubscribeRecurring();
    };
  }, [userId, account]);

  useEffect(() => {
    if (!userId) return;

    const unsubscribeUser = subscribeToUserDocument(userId, (docSnapshot) => {
      const userData = docSnapshot?.data?.() || {};
      setLanguage(userData.languagePreference === 'nl' ? 'nl' : 'en');
      setSavingsGoal(userData.savingsGoal || null);
    });

    return () => {
      if (unsubscribeUser) unsubscribeUser();
    };
  }, [userId]);

  const handleColorChange = async (newColor) => {
    if (!userId || !account?.id) return;

    setSelectedColor(newColor);
    try {
      await updateAccountColor(userId, account.id, newColor);
    } catch (error) {
      console.warn('Unable to update account color:', error);
    }
  };

  const handlePickCardImage = async () => {
    if (!userId || !account?.id) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(strings.permissionNeeded, strings.photoPermission);
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

    try {
      const uploadedUrl = await uploadCardImage(userId, result.assets[0].uri, 'account-cards');
      await updateAccountImage(userId, account.id, uploadedUrl);
      setCardImageUrl(uploadedUrl);
    } catch (error) {
      Alert.alert(strings.imageUploadFailed, error?.message || strings.updateImageFailed);
    }
  };

  const handleRemoveCardImage = async () => {
    if (!userId || !account?.id) return;
    try {
      await updateAccountImage(userId, account.id, null);
      setCardImageUrl('');
    } catch (error) {
      Alert.alert(strings.imageRemovalFailed, error?.message || strings.removeImageFailed);
    }
  };

  const openTransactionModal = (type) => {
    if (account?.readOnlyConfig?.enabled) {
      const activeStrings = ACCOUNT_DETAILS_TRANSLATIONS[language] || ACCOUNT_DETAILS_TRANSLATIONS.en;
      Alert.alert(activeStrings.readOnlyLinked, activeStrings.actionsDisabledReadOnly);
      return;
    }
    setTransactionType(type);
    setTransactionAmount('');
    setTransactionLabel('');
    setTransactionModalVisible(true);
  };

  const closeTransactionModal = () => {
    setTransactionModalVisible(false);
    setTransactionAmount('');
    setTransactionLabel('');
  };

  const openLabelEditModal = (transaction) => {
    setLabelEditTransaction(transaction);
    setLabelEditText(transaction?.label || '');
    setLabelEditModalVisible(true);
  };

  const closeLabelEditModal = () => {
    setLabelEditModalVisible(false);
    setLabelEditTransaction(null);
    setLabelEditText('');
  };

  const handleUpdateTransactionLabel = async () => {
    if (!labelEditTransaction || !userId || !account?.id) return;
    try {
      await updateTransactionLabel(userId, account.id, labelEditTransaction.id, labelEditText.trim() || null);
      closeLabelEditModal();
    } catch (error) {
      console.warn('Update transaction label failed:', error);
    }
  };

  const handleCreateRecurring = async () => {
    if (!userId || !account?.id) return;
    if (account?.readOnlyConfig?.enabled) {
      Alert.alert(strings.readOnlyLinked, strings.actionsDisabledReadOnly);
      return;
    }
    const parsedAmount = parseFloat(recurringAmount.replace(',', '.'));
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    try {
      await createRecurringTransaction(userId, account.id, parsedAmount, 'deposit', recurringFrequency, null, null, recurringLabel || null);
      setRecurringAmount('');
      setRecurringLabel('');
      setRecurringModalVisible(false);
    } catch (error) {
      console.warn('Create recurring transaction failed:', error);
    }
  };

  const handleConfirmTransaction = async () => {
    if (!userId || !account?.id) return;
    if (account?.readOnlyConfig?.enabled) {
      Alert.alert(strings.readOnlyLinked, strings.actionsDisabledReadOnly);
      closeTransactionModal();
      return;
    }

    const parsedValue = parseAmountInput(transactionAmount);
    if (Number.isNaN(parsedValue) || parsedValue <= 0) {
      Alert.alert(strings.addFunds, strings.invalidAmount);
      return;
    }

    const amount = transactionType === 'deposit' ? parsedValue : -parsedValue;
    try {
      await adjustAccountBalance(userId, account.id, amount, transactionType);
      closeTransactionModal();
    } catch (error) {
      console.warn('Transaction failed:', error);
      Alert.alert(strings.addFunds, error?.message || strings.transactionFailed);
    }
  };

  const renderTransaction = ({ item }) => {
    const sign = item.type === 'withdraw' ? '-' : '+';
    const transactionTypeLabel = item.type === 'withdraw' ? strings.withdraw : strings.deposit;
    const amount = `${sign}${formatCurrency(item.amount || 0, currency || 'EUR')}`;
    return (
      <TouchableOpacity style={styles.transactionItem} onLongPress={() => openLabelEditModal(item)}>
        <View style={styles.txDetails}>
          <Text style={styles.txAccountName}>{item.accountName}</Text>
          <Text style={styles.txType}>{transactionTypeLabel}</Text>
          {item.label ? <Text style={styles.txLabel}>{item.label}</Text> : null}
        </View>
        <View style={styles.txMeta}>
          <Text style={styles.txAmount}>{amount}</Text>
          <Text style={styles.txTime}>{item.timestamp?.toDate?.()?.toLocaleString(language === 'nl' ? 'nl-NL' : 'en-GB') || '...'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const borderColor = selectedColor || '#e2e8f0';
  const textColor = getReadableTextColor(borderColor);
  const strings = ACCOUNT_DETAILS_TRANSLATIONS[language] || ACCOUNT_DETAILS_TRANSLATIONS.en;
  const reservedAmount = Number(savingsGoal?.reservations?.[account?.id]) || 0;
  const reservedGoalName = savingsGoal?.name || strings.savingGoal;
  const isReadOnlyLinked = !!account?.readOnlyConfig?.enabled;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.headerCard, { backgroundColor: selectedColor, borderColor: borderColor }]}> 
        <Text style={[styles.title, { color: textColor }]}>{account?.name || strings.accountDetails}</Text>
        <Text style={[styles.subTitle, { color: textColor }]}>{strings.currentBalance}</Text>
        <Text style={[styles.balance, { color: textColor }]}>{formatCurrency(account?.balance || 0, currency || 'EUR')}</Text>
        {reservedAmount > 0 ? (
          <Text style={[styles.reservedText, { color: textColor }]}>
            {`${formatCurrency(reservedAmount, currency || 'EUR')} ${strings.reservedFor} ${reservedGoalName}`}
          </Text>
        ) : null}
        <View style={styles.detailActions}>
          <TouchableOpacity
            style={[styles.cardButton, styles.depositButton, isReadOnlyLinked && styles.cardButtonDisabled]}
            onPress={() => openTransactionModal('deposit')}
            disabled={isReadOnlyLinked}
          >
            <Text style={styles.cardButtonText}>{strings.add}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cardButton, styles.withdrawButton, isReadOnlyLinked && styles.cardButtonDisabled]}
            onPress={() => openTransactionModal('withdraw')}
            disabled={isReadOnlyLinked}
          >
            <Text style={styles.cardButtonText}>{strings.withdraw}</Text>
          </TouchableOpacity>
        </View>
        {isReadOnlyLinked ? <Text style={styles.readOnlyHint}>{strings.actionsDisabledReadOnly}</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{strings.accountType}</Text>
        <Text style={styles.sectionValue}>{account?.type || account?.label || strings.virtualAccount}</Text>
        {isReadOnlyLinked ? <Text style={styles.readOnlySectionText}>{strings.readOnlyLinkedHint}</Text> : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{strings.accountId}</Text>
        <Text style={styles.sectionValue}>{account?.id || strings.unknown}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{strings.customizeColor}</Text>
        <View style={styles.colorPreviewRow}>
          {ACCOUNT_COLOR_PALETTE.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.colorPreview, { backgroundColor: option }, option === selectedColor && styles.colorSelected]}
              onPress={() => handleColorChange(option)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{strings.cardImageOptional}</Text>
        <TouchableOpacity style={styles.imagePickerButton} onPress={handlePickCardImage}>
          <Text style={styles.imagePickerButtonText}>{cardImageUrl ? strings.changeImage : strings.chooseImage}</Text>
        </TouchableOpacity>
        {cardImageUrl ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: cardImageUrl }} style={styles.imagePreview} />
            <TouchableOpacity style={styles.removeImageButton} onPress={handleRemoveCardImage}>
              <Text style={styles.removeImageButtonText}>{strings.removeImage}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={styles.section}> 
        <Text style={styles.sectionTitle}>{strings.transactionHistory}</Text>
        {transactions.length === 0 ? (
          <Text style={styles.emptyText}>{strings.noTransactions}</Text>
        ) : (
          <FlatList
            data={transactions}
            keyExtractor={(item) => item.id}
            renderItem={renderTransaction}
            scrollEnabled={false}
          />
        )}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{strings.recurringSchedule}</Text>
        {!isReadOnlyLinked ? (
          <View style={styles.recurringRow}>
            <Text style={styles.recurringText}>{strings.createRepeatingDeposit}</Text>
            <PrimaryButton
              title={strings.schedule}
              onPress={() => setRecurringModalVisible(true)}
              style={styles.scheduleButton}
              textStyle={styles.scheduleButtonText}
              gradientColors={ACTION_GREEN_GRADIENT}
              disableShine
            />
          </View>
        ) : (
          <Text style={styles.emptyText}>{strings.actionsDisabledReadOnly}</Text>
        )}
        {recurringSchedules.length > 0 ? (
          recurringSchedules.map((schedule) => (
            <View key={schedule.id} style={styles.recurringItem}>
              <Text style={styles.recurringSummary}>{`${getFrequencyLabel(schedule.frequency, strings)} ${schedule.amount} - ${schedule.label || strings.recurringDefaultLabel}`}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>{strings.noRecurringSchedules}</Text>
        )}
      </View>
      <Modal visible={transactionModalVisible} animationType="slide" transparent onRequestClose={closeTransactionModal}>
        <KeyboardAwareModalOverlay style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{transactionType === 'deposit' ? strings.addFunds : strings.withdrawFunds}</Text>
            <Text style={styles.modalSubtitle}>{account?.name}</Text>
            <TextInput
              value={transactionAmount}
              onChangeText={setTransactionAmount}
              keyboardType="numeric"
              placeholder={strings.enterAmount}
              inputAccessoryViewID={`${ACCOUNT_MODAL_ACCESSORY_ID}-transaction`}
              style={styles.modalInput}
            />
            <TextInput
              value={transactionLabel}
              onChangeText={setTransactionLabel}
              placeholder={strings.labelOptional}
              inputAccessoryViewID={`${ACCOUNT_MODAL_ACCESSORY_ID}-transaction`}
              style={[styles.modalInput, styles.labelInput]}
            />
            <View style={[styles.modalButtons, styles.transactionModalButtonsCompact]}>
              <TouchableOpacity style={[styles.modalButtonCancel, styles.transactionModalButtonCancelCompact]} onPress={closeTransactionModal}>
                <Text style={styles.modalButtonText}>{strings.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButtonConfirm, styles.transactionModalButtonConfirmCompact]} onPress={handleConfirmTransaction}>
                <Text style={styles.transactionModalButtonConfirmText}>{strings.confirm}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareModalOverlay>
        <IOSKeyboardDoneAccessory nativeID={`${ACCOUNT_MODAL_ACCESSORY_ID}-transaction`} label={strings.done} />
      </Modal>
      <Modal visible={labelEditModalVisible} animationType="slide" transparent onRequestClose={closeLabelEditModal}>
        <KeyboardAwareModalOverlay style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{strings.editLabel}</Text>
            <TextInput
              value={labelEditText}
              onChangeText={setLabelEditText}
              placeholder={strings.transactionLabel}
              inputAccessoryViewID={`${ACCOUNT_MODAL_ACCESSORY_ID}-label-edit`}
              style={styles.modalInput}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={closeLabelEditModal}>
                <Text style={styles.modalButtonText}>{strings.cancel}</Text>
              </TouchableOpacity>
              <PrimaryButton
                title={strings.saveLabel}
                onPress={handleUpdateTransactionLabel}
                style={styles.modalButtonConfirm}
                textStyle={styles.modalButtonConfirmText}
                gradientColors={ACTION_GREEN_GRADIENT}
                disableShine
              />
            </View>
          </View>
        </KeyboardAwareModalOverlay>
        <IOSKeyboardDoneAccessory nativeID={`${ACCOUNT_MODAL_ACCESSORY_ID}-label-edit`} label={strings.done} />
      </Modal>
      <Modal visible={recurringModalVisible} animationType="slide" transparent onRequestClose={() => setRecurringModalVisible(false)}>
        <KeyboardAwareModalOverlay style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{strings.scheduleRecurringDeposit}</Text>
            <TextInput
              value={recurringAmount}
              onChangeText={setRecurringAmount}
              keyboardType="numeric"
              placeholder={strings.amount}
              inputAccessoryViewID={`${ACCOUNT_MODAL_ACCESSORY_ID}-recurring`}
              style={styles.modalInput}
            />
            <TextInput
              value={recurringLabel}
              onChangeText={setRecurringLabel}
              placeholder={strings.labelOptional}
              inputAccessoryViewID={`${ACCOUNT_MODAL_ACCESSORY_ID}-recurring`}
              style={[styles.modalInput, styles.labelInput]}
            />
            <View style={styles.frequencyRow}>
              {['daily', 'weekly', 'monthly'].map((frequency) => (
                <TouchableOpacity
                  key={frequency}
                  style={[styles.frequencyButton, recurringFrequency === frequency && styles.frequencyButtonActive]}
                  onPress={() => setRecurringFrequency(frequency)}
                >
                  <Text style={[styles.frequencyText, recurringFrequency === frequency && styles.frequencyTextActive]}>{getFrequencyLabel(frequency, strings)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setRecurringModalVisible(false)}>
                <Text style={styles.modalButtonText}>{strings.cancel}</Text>
              </TouchableOpacity>
              <PrimaryButton
                title={strings.createSchedule}
                onPress={handleCreateRecurring}
                style={styles.modalButtonConfirm}
                textStyle={styles.modalButtonConfirmText}
                gradientColors={ACTION_GREEN_GRADIENT}
                disableShine
              />
            </View>
          </View>
        </KeyboardAwareModalOverlay>
        <IOSKeyboardDoneAccessory nativeID={`${ACCOUNT_MODAL_ACCESSORY_ID}-recurring`} label={strings.done} />
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#f7f9fc' },
  headerCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  subTitle: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  balance: { fontSize: 32, fontWeight: '800' },
  reservedText: { fontSize: 13, fontWeight: '700', marginTop: 6, opacity: 0.9 },
  section: { marginBottom: 20 },
  sectionTitle: { color: '#94a3b8', marginBottom: 6, fontSize: 13 },
  sectionValue: { fontSize: 16, color: '#102a43' },
  colorPreviewRow: { flexDirection: 'row', flexWrap: 'wrap' },
  colorPreview: { width: 40, height: 40, borderRadius: 14, marginRight: 10, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  colorSelected: { borderColor: '#1e3a8a' },
  imagePickerButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f8fafc',
  },
  imagePickerButtonText: {
    color: '#334155',
    fontWeight: '600',
  },
  imagePreviewWrap: {
    marginTop: 10,
  },
  imagePreview: {
    width: '100%',
    height: 140,
    borderRadius: 14,
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
  detailActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  cardButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depositButton: { backgroundColor: '#84cc16', marginRight: 8 },
  withdrawButton: { backgroundColor: '#D50000' },
  cardButtonText: { fontWeight: '700', color: '#ffffff' },
  cardButtonDisabled: { opacity: 0.45 },
  readOnlyHint: { marginTop: 10, fontSize: 12, color: '#fef3c7', textAlign: 'center' },
  readOnlySectionText: { marginTop: 8, color: '#64748b', fontSize: 13 },
  transactionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: '#fff', padding: 14, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  txAccountName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  txType: { fontSize: 13, color: '#64748b', marginTop: 4 },
  txDetails: { marginRight: 12 },
  txMeta: { alignItems: 'flex-end' },
  txAmount: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  txTime: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  txLabel: { marginTop: 4, color: '#475569', fontSize: 13, fontStyle: 'italic' },
  emptyText: { color: '#64748b', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 10 },
  modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 18 },
  modalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, fontSize: 16, marginBottom: 18 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalButtonCancel: { flex: 1, marginRight: 8, backgroundColor: '#f1f5f9', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  recurringRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  recurringText: { color: '#334155', flex: 1, marginRight: 12 },
  scheduleButton: { paddingVertical: 10, paddingHorizontal: 14 },
  scheduleButtonText: { fontSize: 14 },
  recurringItem: { backgroundColor: '#ffffff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  recurringSummary: { color: '#0f172a', fontWeight: '700' },
  labelInput: { marginBottom: 18 },
  frequencyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  frequencyButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 12, marginRight: 8, alignItems: 'center' },
  frequencyButtonActive: { backgroundColor: '#84cc16', borderColor: '#84cc16' },
  frequencyText: { color: '#475569', fontWeight: '700' },
  frequencyTextActive: { color: '#064e3b' },
  modalButtonConfirm: { flex: 1, marginLeft: 8, backgroundColor: '#84cc16', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  modalButtonText: { fontWeight: '700', color: '#0f172a' },
  modalButtonConfirmText: { color: '#f8fafc' },
  transactionModalButtonsCompact: { marginTop: 2 },
  transactionModalButtonCancelCompact: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 0,
  },
  transactionModalButtonConfirmCompact: {
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
  transactionModalButtonConfirmText: { color: '#f8fafc', fontWeight: '700' },
});
