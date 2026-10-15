import * as ImagePicker from 'expo-image-picker';
import { getAuth } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import AmountAllocationSlider from '../components/AmountAllocationSlider';
import { IOSKeyboardDoneAccessory, KeyboardAwareModalOverlay } from '../components/ModalKeyboardSupport';
import { ACCOUNT_COLOR_PALETTE, formatCurrency, getReadableTextColor } from '../constants/colors';
import {
    addSharedAccountTransaction,
    subscribeToAccounts,
    subscribeToSharedAccountTransactions,
    subscribeToUserDocument,
    updateSharedAccountColor,
    updateSharedAccountImage,
} from '../firebase/firestore';
import { uploadCardImage } from '../firebase/storage';

function roundToCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatAmountInputValue(value) {
  const rounded = roundToCents(Number(value) || 0);
  if (rounded <= 0) return '';
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function parseAmountInput(value) {
  if (typeof value !== 'string') return Number.NaN;
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

const SHARED_DETAILS_ACCESSORY_ID = 'shared-account-details-modal-input-accessory';
const SHARED_DETAILS_TRANSLATIONS = {
  en: {
    color: 'Color', image: 'Card image (optional)', changeImage: 'Change image', chooseImage: 'Choose image from gallery', removeImage: 'Remove image',
    history: 'Transaction history', noTransactions: 'No transactions yet.', deposit: 'Deposit', withdraw: 'Withdraw',
    permission: 'Permission needed', photoPermission: 'Please allow photo access to choose a card image.', uploadFailed: 'Image upload failed',
    updateImageFailed: 'Could not update shared card image.', removeFailed: 'Image removal failed', removeImageFailed: 'Could not remove shared card image.',
    error: 'Error', recordFailed: 'Could not record transaction.', addFunds: 'Add funds', withdrawFunds: 'Withdraw funds',
    canAddUpTo: 'You can add up to', amount: 'Amount', label: 'Label (optional, e.g. groceries)',
    youAdd: 'You add', othersAdd: 'Others add', cancel: 'Cancel', confirm: 'Confirm', done: 'Done',
  },
  nl: {
    color: 'Kleur', image: 'Kaartafbeelding (optioneel)', changeImage: 'Afbeelding wijzigen', chooseImage: 'Afbeelding uit galerij kiezen', removeImage: 'Afbeelding verwijderen',
    history: 'Transactiegeschiedenis', noTransactions: 'Nog geen transacties.', deposit: 'Storting', withdraw: 'Opname',
    permission: 'Toestemming nodig', photoPermission: 'Geef toegang tot foto’s om een kaartafbeelding te kiezen.', uploadFailed: 'Afbeelding uploaden mislukt',
    updateImageFailed: 'Gedeelde kaartafbeelding bijwerken mislukt.', removeFailed: 'Afbeelding verwijderen mislukt', removeImageFailed: 'Gedeelde kaartafbeelding verwijderen mislukt.',
    error: 'Fout', recordFailed: 'Transactie vastleggen mislukt.', addFunds: 'Geld toevoegen', withdrawFunds: 'Geld opnemen',
    canAddUpTo: 'Je kunt maximaal toevoegen:', amount: 'Bedrag', label: 'Label (optioneel, bijv. boodschappen)',
    youAdd: 'Jij voegt toe', othersAdd: 'Anderen voegen toe', cancel: 'Annuleren', confirm: 'Bevestigen', done: 'Gereed',
  },
};

export default function SharedAccountDetailsScreen({ route, navigation }) {
  const { sharedAccount } = route.params || {};
  const [transactions, setTransactions] = useState([]);
  const [selectedColor, setSelectedColor] = useState(sharedAccount?.color || '#ffffff');
  const [cardImageUrl, setCardImageUrl] = useState(sharedAccount?.imageUrl || '');
  const [modalVisible, setModalVisible] = useState(false);
  const [transactionType, setTransactionType] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [transactionLabel, setTransactionLabel] = useState('');
  const [myPartInput, setMyPartInput] = useState('');
  const [individualSavingsTotal, setIndividualSavingsTotal] = useState(0);
  const [language, setLanguage] = useState('en');
  const strings = SHARED_DETAILS_TRANSLATIONS[language] || SHARED_DETAILS_TRANSLATIONS.en;

  useEffect(() => {
    const uid = getAuth().currentUser?.uid;
    if (!uid) return undefined;
    return subscribeToUserDocument(uid, (snapshot) => {
      setLanguage(snapshot.data()?.languagePreference === 'nl' ? 'nl' : 'en');
    });
  }, []);

  useEffect(() => {
    if (!sharedAccount?.id) return;
    const unsubscribe = subscribeToSharedAccountTransactions(sharedAccount.id, (items) => {
      setTransactions(items);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [sharedAccount]);

  useEffect(() => {
    const uid = getAuth().currentUser?.uid;
    if (!uid) {
      setIndividualSavingsTotal(0);
      return undefined;
    }

    const unsubscribe = subscribeToAccounts(uid, (accountList) => {
      const total = (accountList || []).reduce((sum, account) => sum + (Number(account?.balance) || 0), 0);
      setIndividualSavingsTotal(Math.max(0, total));
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    const initialAction = route?.params?.initialAction;
    if (initialAction !== 'deposit' && initialAction !== 'withdraw') return;

    setTransactionType(initialAction);
    setModalVisible(true);
    navigation.setParams({ initialAction: null });
  }, [navigation, route?.params?.initialAction]);

  const handleColorChange = async (color) => {
    setSelectedColor(color);
    if (!sharedAccount?.id) return;
    try {
      await updateSharedAccountColor(sharedAccount.id, color);
    } catch (error) {
      console.warn('Unable to update shared account color:', error);
    }
  };

  const handleSubmit = async () => {
    const parsed = parseAmountInput(amount);
    if (!sharedAccount?.id || Number.isNaN(parsed) || parsed <= 0) {
      return;
    }

    try {
      await addSharedAccountTransaction(sharedAccount.id, parsed, transactionType, transactionLabel);
      setAmount('');
      setTransactionLabel('');
      setMyPartInput('');
      setModalVisible(false);
    } catch (error) {
      Alert.alert(strings.error, error.message || strings.recordFailed);
    }
  };

  const transactionsByUser = transactions.reduce((acc, item) => {
    const userId = item.userId || 'unknown';
    const userName = item.userDisplayName || item.userEmail || 'Unknown';
    if (!acc[userId]) {
      acc[userId] = { userId, userName, items: [] };
    }
    acc[userId].items.push(item);
    return acc;
  }, {});

  const collaboratorColumns = Array.isArray(sharedAccount?.collaborators)
    ? sharedAccount.collaborators.map((collaborator, index) => {
      const key = collaborator?.uid || collaborator?.email;
      const existing = transactionsByUser[key] || {
        userId: key || `collaborator-${index}`,
        userName: collaborator?.displayName || collaborator?.email || 'Collaborator',
        items: [],
      };
      return existing;
    })
    : Object.values(transactionsByUser);

  const handlePickCardImage = async () => {
    if (!sharedAccount?.id) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(strings.permission, strings.photoPermission);
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
      const authUid = sharedAccount?.ownerUid || sharedAccount?.collaboratorIds?.[0] || 'shared';
      const uploadedUrl = await uploadCardImage(authUid, result.assets[0].uri, 'shared-account-cards');
      await updateSharedAccountImage(sharedAccount.id, uploadedUrl);
      setCardImageUrl(uploadedUrl);
    } catch (error) {
      Alert.alert(strings.uploadFailed, error?.message || strings.updateImageFailed);
    }
  };

  const handleRemoveCardImage = async () => {
    if (!sharedAccount?.id) return;
    try {
      await updateSharedAccountImage(sharedAccount.id, null);
      setCardImageUrl('');
    } catch (error) {
      Alert.alert(strings.removeFailed, error?.message || strings.removeImageFailed);
    }
  };

  const textColor = getReadableTextColor(selectedColor);
  const currentUid = getAuth().currentUser?.uid || null;
  const currentEmail = (getAuth().currentUser?.email || '').toLowerCase();
  const myTotalBalance = Math.max(
    0,
    transactions.reduce((sum, item) => {
      const itemUserId = item?.userId || null;
      const itemUserEmail = (item?.userEmail || '').toLowerCase();
      const isMine = (currentUid && itemUserId === currentUid) || (!!currentEmail && itemUserEmail === currentEmail);
      if (!isMine) return sum;
      const itemAmount = Number(item?.amount) || 0;
      if (item?.type === 'withdraw') return sum - itemAmount;
      return sum + itemAmount;
    }, 0)
  );
  const amountSliderValue = (() => {
    const parsedValue = parseAmountInput(amount);
    if (Number.isNaN(parsedValue) || parsedValue <= 0) return 0;
    return Math.min(parsedValue, individualSavingsTotal);
  })();
  const myPartSliderValue = (() => {
    const parsedValue = parseAmountInput(myPartInput);
    if (Number.isNaN(parsedValue) || parsedValue <= 0) return 0;
    return Math.min(parsedValue, amountSliderValue);
  })();
  const othersPartAmount = Math.max(0, amountSliderValue - myPartSliderValue);
  const sharedGoalsTotal = (Array.isArray(sharedAccount?.savingsGoals) ? sharedAccount.savingsGoals : []).reduce((sum, goal) => {
    const reservedForGoal = Object.values(goal?.reservations || {}).reduce((goalSum, value) => goalSum + (Number(value) || 0), 0);
    return sum + reservedForGoal;
  }, 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.headerCard, { backgroundColor: selectedColor }]}> 
        <Text style={[styles.title, { color: textColor }]}>{sharedAccount?.name}</Text>
        <Text style={[styles.balance, { color: textColor }]}>{formatCurrency(sharedGoalsTotal, sharedAccount?.currency || 'EUR')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{strings.color}</Text>
        <View style={styles.colorRow}>
          {ACCOUNT_COLOR_PALETTE.map((color) => (
            <TouchableOpacity
              key={color}
              style={[styles.colorDot, { backgroundColor: color }, selectedColor === color && styles.colorDotSelected]}
              onPress={() => handleColorChange(color)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{strings.image}</Text>
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
        <Text style={styles.sectionLabel}>{strings.history}</Text>
        {transactions.length === 0 ? (
          <Text style={styles.emptyText}>{strings.noTransactions}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyColumnsWrap}>
            {collaboratorColumns.map((column, index) => (
              <View key={column.userId || `column-${index}`} style={styles.historyColumn}>
                <Text style={styles.historyColumnTitle}>{column.userName}</Text>
                {column.items.length === 0 ? (
                  <Text style={styles.emptyColumnText}>{strings.noTransactions}</Text>
                ) : (
                  column.items.map((item) => (
                    <View key={item.id} style={styles.transactionRow}>
                      <View>
                        <Text style={styles.txType}>{item.label || (item.type === 'withdraw' ? strings.withdraw : strings.deposit)}</Text>
                        <Text style={styles.txMeta}>{item.type === 'withdraw' ? strings.withdraw : strings.deposit}</Text>
                      </View>
                      <View style={styles.txAmountBlock}>
                        <Text style={styles.txAmount}>{(item.type === 'withdraw' ? '-' : '+') + formatCurrency(item.amount, sharedAccount?.currency || 'EUR')}</Text>
                        <Text style={styles.txTime}>{item.timestamp?.toDate?.()?.toLocaleString(language === 'nl' ? 'nl-NL' : 'en-GB') || '...'}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <KeyboardAwareModalOverlay style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{transactionType === 'deposit' ? strings.addFunds : strings.withdrawFunds}</Text>
                <Text style={styles.modalSubtitle}>{sharedAccount?.name}</Text>
                {transactionType === 'deposit' ? (
                  <AmountAllocationSlider
                    value={amountSliderValue}
                    max={individualSavingsTotal}
                    onChange={(nextValue) => {
                      setAmount(formatAmountInputValue(nextValue));
                      const currentMyPart = parseAmountInput(myPartInput);
                      if (!Number.isNaN(currentMyPart) && currentMyPart > nextValue) {
                        setMyPartInput(formatAmountInputValue(nextValue));
                      }
                    }}
                    accentColor="#84cc16"
                    valueLabel={formatCurrency(amountSliderValue, sharedAccount?.currency || 'EUR')}
                    maxLabel={`${strings.canAddUpTo} ${formatCurrency(individualSavingsTotal, sharedAccount?.currency || 'EUR')}`}
                    disabled={individualSavingsTotal <= 0}
                  />
                ) : null}
                <TextInput
                  value={amount}
                  onChangeText={(nextValue) => setAmount(nextValue)}
                  keyboardType="numeric"
                  placeholder={strings.amount}
                  inputAccessoryViewID={SHARED_DETAILS_ACCESSORY_ID}
                  style={styles.modalInput}
                />
                <TextInput
                  value={transactionLabel}
                  onChangeText={setTransactionLabel}
                  placeholder={strings.label}
                  inputAccessoryViewID={SHARED_DETAILS_ACCESSORY_ID}
                  style={styles.modalInput}
                />
                {transactionType === 'deposit' ? (
                  <AmountAllocationSlider
                    value={myPartSliderValue}
                    max={amountSliderValue}
                    onChange={(nextValue) => setMyPartInput(formatAmountInputValue(nextValue))}
                    accentColor="#84cc16"
                    valueLabel={`${strings.youAdd} ${formatCurrency(myPartSliderValue, sharedAccount?.currency || 'EUR')}`}
                    maxLabel={`${strings.othersAdd} ${formatCurrency(othersPartAmount, sharedAccount?.currency || 'EUR')}`}
                    disabled={amountSliderValue <= 0}
                  />
                ) : null}
                <View style={[styles.modalButtons, styles.goalModalButtonsCompact]}>
                  <TouchableOpacity style={[styles.modalButtonCancel, styles.goalModalButtonCancelCompact]} onPress={() => { setTransactionLabel(''); setMyPartInput(''); setModalVisible(false); }}>
                    <Text style={styles.modalButtonText}>{strings.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalButtonConfirm, styles.goalModalButtonConfirmCompact]} onPress={handleSubmit}>
                    <Text style={styles.goalModalButtonConfirmText}>{strings.confirm}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
            </KeyboardAwareModalOverlay>
        </TouchableWithoutFeedback>

        <IOSKeyboardDoneAccessory nativeID={SHARED_DETAILS_ACCESSORY_ID} label={strings.done} />
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f7f9fc', padding: 20 },
  confirmButton: { flex: 1, marginLeft: 8 },
  headerCard: { borderRadius: 12, padding: 22, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  balance: { fontSize: 36, fontWeight: '900' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  actionButton: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  depositButton: { backgroundColor: '#84cc16', marginRight: 8 },
  withdrawButton: { backgroundColor: '#D50000', marginLeft: 8 },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '700', marginBottom: 10, color: '#475569' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap' },
  colorDot: { width: 36, height: 36, borderRadius: 12, marginRight: 10, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  colorDotSelected: { borderColor: '#0f5132' },
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
  historyColumnsWrap: {
    paddingBottom: 8,
  },
  historyColumn: {
    width: 300,
    marginRight: 12,
  },
  historyColumnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  emptyColumnText: {
    color: '#94a3b8',
    fontSize: 12,
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
  transactionRow: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 2 },
  txType: { fontWeight: '700', fontSize: 15, color: '#0f172a' },
  txMeta: { color: '#64748b', marginTop: 4 },
  txAmountBlock: { alignItems: 'flex-end' },
  txAmount: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  txTime: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  emptyText: { color: '#64748b' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 10 },
  modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 18 },
  modalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, fontSize: 16, marginBottom: 18 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, marginBottom: 18 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalButtonCancel: { flex: 1, marginRight: 8, backgroundColor: '#f1f5f9', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  modalButtonConfirm: { flex: 1, marginLeft: 8, backgroundColor: '#84cc16', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  modalButtonConfirmText: { color: '#f8fafc' },
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
  goalModalButtonConfirmText: { color: '#f8fafc', fontWeight: '700' },
  cancelButton: { flex: 1, marginRight: 8, backgroundColor: '#f1f5f9', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  confirmButton: { flex: 1, marginLeft: 8, backgroundColor: '#84cc16', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: '#475569', fontWeight: '700' },
  confirmText: { color: '#ffffff', fontWeight: '700' },
});
