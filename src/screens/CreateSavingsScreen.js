import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { IOSKeyboardDoneAccessory } from '../components/ModalKeyboardSupport';
import PrimaryButton from '../components/PrimaryButton';
import { ACCOUNT_COLOR_PALETTE, DEFAULT_ACCOUNT_COLORS } from '../constants/colors';
import { createAccount, subscribeToUserDocument } from '../firebase/firestore';
import { uploadCardImage } from '../firebase/storage';
import { connectAndStoreTrueLayerAccounts, getTrueLayerAuthUrl } from '../services/connectedWallets';

const accountTypes = ['Bank', 'Cash', 'Investment', 'Crypto', 'Savings'];
const ACTION_GREEN_GRADIENT = ['#84cc16', '#84cc16', '#84cc16'];
const CREATE_ACCESSORY_ID = 'create-savings-input-accessory';
const CREATE_TRANSLATIONS = {
  en: {
    title: 'Create account', accountType: 'Account type', accountTypes: { Bank: 'Bank', Cash: 'Cash', Investment: 'Investment', Crypto: 'Crypto', Savings: 'Savings' },
    bankTitle: 'Connect your bank with TrueLayer', bankHint: 'Read-only balances sync automatically after you sign in with your bank in the secure TrueLayer flow.',
    connecting: 'Opening...', connectBank: 'Connect Bank Account', accountName: 'Account name', initialBalance: 'Initial balance',
    accountColor: 'Account color', cardImage: 'Card image (optional)', changeImage: 'Change image', chooseImage: 'Choose image from gallery', removeImage: 'Remove image',
    readOnlyTitle: 'Read-only live balance', readOnlyHint: 'Enabled accounts can only sync balances. No deposits, withdrawals, or transfers are allowed by this app.', on: 'On', off: 'Off',
    ticker: 'Ticker symbol (e.g. AAPL)', quantity: 'Quantity / units',
    create: 'Create', creating: 'Creating...', validation: 'Validation error', required: 'Name and balance are required.', balanceNumber: 'Balance must be a number.',
    liveSyncTypes: 'Read-only live sync is currently available for Crypto and Investment accounts only.', pasteWallet: 'Please paste a wallet address.',
    assetIdentifier: 'Please enter the asset identifier / symbol.', bankConnected: 'Bank connected', bankConnectedOne: '1 bank account connected via TrueLayer.', bankConnectedMany: '{count} bank accounts connected via TrueLayer.', unableToConnect: 'Unable to connect bank', tryAgain: 'Please try again.',
    trueLayerMissing: 'TrueLayer config missing', verifyTrueLayer: 'Please verify TrueLayer backend and app config.', createFailed: 'Could not create account',
    permission: 'Permission needed', photoPermission: 'Please allow photo access to choose a card image.',
  },
  nl: {
    title: 'Rekening aanmaken', accountType: 'Rekeningtype', accountTypes: { Bank: 'Bank', Cash: 'Contant', Investment: 'Beleggingen', Crypto: 'Crypto', Savings: 'Spaargeld' },
    bankTitle: 'Koppel je bank via TrueLayer', bankHint: 'Alleen-lezensaldi worden automatisch gesynchroniseerd nadat je veilig via TrueLayer bent ingelogd bij je bank.',
    connecting: 'Wordt geopend...', connectBank: 'Bankrekening koppelen', accountName: 'Rekeningnaam', initialBalance: 'Beginsaldo',
    accountColor: 'Kleur van rekening', cardImage: 'Afbeelding (optioneel)', changeImage: 'Afbeelding wijzigen', chooseImage: 'Afbeelding uit galerij kiezen', removeImage: 'Afbeelding verwijderen',
    readOnlyTitle: 'Live saldo, alleen-lezen', readOnlyHint: 'Ingeschakelde rekeningen synchroniseren alleen saldi. Storten, opnemen en overboeken is niet mogelijk in deze app.', on: 'Aan', off: 'Uit',
    ticker: 'Beurscode (bijv. AAPL)', quantity: 'Hoeveelheid / eenheden',
    create: 'Aanmaken', creating: 'Bezig met aanmaken...', validation: 'Invoerfout', required: 'Naam en saldo zijn verplicht.', balanceNumber: 'Het saldo moet een getal zijn.',
    liveSyncTypes: 'Live synchronisatie is alleen beschikbaar voor crypto- en beleggingsrekeningen.', pasteWallet: 'Plak een walletadres.',
    assetIdentifier: 'Vul de activum-ID of ticker in.', bankConnected: 'Bank gekoppeld', bankConnectedOne: '1 bankrekening gekoppeld via TrueLayer.', bankConnectedMany: '{count} bankrekeningen gekoppeld via TrueLayer.', unableToConnect: 'Bank koppelen mislukt', tryAgain: 'Probeer het opnieuw.',
    trueLayerMissing: 'TrueLayer-configuratie ontbreekt', verifyTrueLayer: 'Controleer de TrueLayer-backend en app-configuratie.', createFailed: 'Rekening aanmaken mislukt',
    permission: 'Toestemming nodig', photoPermission: 'Geef toegang tot foto’s om een kaartafbeelding te kiezen.',
  },
};

export default function CreateSavingsScreen({ navigation, route }) {
  const { userId } = route.params;
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [type, setType] = useState('Savings');
  const [color, setColor] = useState(DEFAULT_ACCOUNT_COLORS.Savings);
  const [enableReadOnlyLiveSync, setEnableReadOnlyLiveSync] = useState(false);
  const [externalSymbol, setExternalSymbol] = useState('');
  const [externalQuantity, setExternalQuantity] = useState('1');
  const [cardImageUri, setCardImageUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [language, setLanguage] = useState('en');
  const handledCodesRef = useRef(new Set());

  const strings = CREATE_TRANSLATIONS[language] || CREATE_TRANSLATIONS.en;
  const readOnlyProvider = type === 'Investment' ? 'yahoo' : null;

  useEffect(() => subscribeToUserDocument(userId, (snapshot) => {
    setLanguage(snapshot.data()?.languagePreference === 'nl' ? 'nl' : 'en');
  }), [userId]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      if (!userId) {
        return;
      }

      const parsed = Linking.parse(url);
      const code = typeof parsed?.queryParams?.code === 'string' ? parsed.queryParams.code : null;
      if (!code) {
        return;
      }

      if (handledCodesRef.current.has(code)) {
        return;
      }
      handledCodesRef.current.add(code);

      setConnecting(true);
      try {
        const syncedCount = await connectAndStoreTrueLayerAccounts(userId, code);
        const message = syncedCount === 1 ? strings.bankConnectedOne : strings.bankConnectedMany.replace('{count}', String(syncedCount));
        Alert.alert(strings.bankConnected, message);
        navigation.goBack();
      } catch (error) {
        Alert.alert(strings.unableToConnect, error?.message || strings.tryAgain);
      } finally {
        setConnecting(false);
      }
    });

    return () => subscription.remove();
  }, [navigation, userId]);

  const handleOpenTrueLayerLink = async () => {
    setConnecting(true);
    try {
      const url = await getTrueLayerAuthUrl(userId);
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(strings.trueLayerMissing, error?.message || strings.verifyTrueLayer);
    } finally {
      setConnecting(false);
    }
  };

  const handleCreate = async () => {
    if (type === 'Bank') {
      handleOpenTrueLayerLink();
      return;
    }

    if (!name.trim() || !balance.trim()) {
      Alert.alert(strings.validation, strings.required);
      return;
    }

    const parsedBalance = parseFloat(balance.replace(',', '.'));
    if (Number.isNaN(parsedBalance)) {
      Alert.alert(strings.validation, strings.balanceNumber);
      return;
    }

    let readOnlyConfig = { enabled: false };
    let marketSymbol = null;
    let marketType = null;
    let livePriceSource = null;

    if (enableReadOnlyLiveSync) {
      if (type !== 'Investment') {
        Alert.alert(strings.validation, strings.liveSyncTypes);
        return;
      }

      const parsedQuantity = parseFloat((externalQuantity || '1').replace(',', '.'));
      const quantity = Number.isNaN(parsedQuantity) ? 1 : parsedQuantity;
      marketType = 'investment';
      livePriceSource = readOnlyProvider;

      if (!externalSymbol.trim()) {
        Alert.alert(strings.validation, strings.assetIdentifier);
        return;
      }

      readOnlyConfig = {
        enabled: true,
        connectionType: 'investment',
        provider: readOnlyProvider,
        integrationMode: 'market-symbol',
        externalAccountRef: null,
        quantity,
        note: 'Read-only market quote. No write permissions.',
      };
      marketSymbol = externalSymbol.trim();
    }

    setLoading(true);
    try {
      let imageUrl = null;
      if (cardImageUri) {
        imageUrl = await uploadCardImage(userId, cardImageUri, 'account-cards');
      }

      await createAccount(
        userId,
        name.trim(),
        parsedBalance,
        type,
        color,
        imageUrl,
        marketSymbol,
        marketType,
        livePriceSource,
        readOnlyConfig
      );
      navigation.goBack();
    } catch (error) {
      Alert.alert(strings.createFailed, error.message || strings.tryAgain);
    } finally {
      setLoading(false);
    }
  };

  const handlePickCardImage = async () => {
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

    setCardImageUri(result.assets[0].uri);
  };

  const showBankConnectOnly = type === 'Bank';

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{strings.title}</Text>

        <Text style={styles.label}>{strings.accountType}</Text>
        <View style={styles.typeRow}>
          {accountTypes.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.typeOption, type === option && styles.typeOptionActive]}
              onPress={() => {
                setType(option);
                if (option !== 'Investment') setEnableReadOnlyLiveSync(false);
                setColor(DEFAULT_ACCOUNT_COLORS[option] || DEFAULT_ACCOUNT_COLORS.Savings);
              }}
            >
              <Text style={[styles.typeText, type === option && styles.typeTextActive]}>{strings.accountTypes[option]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {showBankConnectOnly ? (
          <View style={styles.bankConnectCard}>
            <Text style={styles.bankConnectTitle}>{strings.bankTitle}</Text>
            <Text style={styles.bankConnectHint}>
              {strings.bankHint}
            </Text>
            <TouchableOpacity
              style={[styles.bankConnectButton, connecting && styles.bankConnectButtonDisabled]}
              onPress={handleOpenTrueLayerLink}
              disabled={connecting}
            >
              <Text style={styles.bankConnectButtonText}>{connecting ? strings.connecting : strings.connectBank}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={strings.accountName}
              inputAccessoryViewID={CREATE_ACCESSORY_ID}
              style={styles.input}
            />
            <TextInput
              value={balance}
              onChangeText={setBalance}
              placeholder={strings.initialBalance}
              keyboardType="numeric"
              inputAccessoryViewID={CREATE_ACCESSORY_ID}
              style={styles.input}
            />

            <Text style={styles.label}>{strings.accountColor}</Text>
            <View style={styles.colorRow}>
              {ACCOUNT_COLOR_PALETTE.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.colorOption, { backgroundColor: option }, option === color && styles.colorOptionSelected]}
                  onPress={() => setColor(option)}
                />
              ))}
            </View>

            <Text style={styles.label}>{strings.cardImage}</Text>
            <TouchableOpacity style={styles.imagePickerButton} onPress={handlePickCardImage}>
              <Text style={styles.imagePickerButtonText}>{cardImageUri ? strings.changeImage : strings.chooseImage}</Text>
            </TouchableOpacity>
            {cardImageUri ? (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: cardImageUri }} style={styles.imagePreview} />
                <TouchableOpacity style={styles.removeImageButton} onPress={() => setCardImageUri('')}>
                  <Text style={styles.removeImageButtonText}>{strings.removeImage}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {type === 'Investment' ? (
              <View style={styles.readOnlyCard}>
                <View style={styles.readOnlyRow}>
                  <View style={styles.readOnlyCopyWrap}>
                    <Text style={styles.readOnlyTitle}>{strings.readOnlyTitle}</Text>
                    <Text style={styles.readOnlyHint}>{strings.readOnlyHint}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.readOnlyToggle, enableReadOnlyLiveSync && styles.readOnlyToggleActive]}
                    onPress={() => setEnableReadOnlyLiveSync((current) => !current)}
                  >
                    <Text style={[styles.readOnlyToggleText, enableReadOnlyLiveSync && styles.readOnlyToggleTextActive]}>
                      {enableReadOnlyLiveSync ? strings.on : strings.off}
                    </Text>
                  </TouchableOpacity>
                </View>
                {enableReadOnlyLiveSync ? (
                  <>
                    <TextInput
                      value={externalSymbol}
                      onChangeText={setExternalSymbol}
                      placeholder={strings.ticker}
                      autoCapitalize="characters"
                      inputAccessoryViewID={CREATE_ACCESSORY_ID}
                      style={styles.input}
                    />
                    <TextInput
                      value={externalQuantity}
                      onChangeText={setExternalQuantity}
                      placeholder={strings.quantity}
                      keyboardType="numeric"
                      inputAccessoryViewID={CREATE_ACCESSORY_ID}
                      style={styles.input}
                    />
                  </>
                ) : null}
              </View>
            ) : null}

            <PrimaryButton
              title={loading ? strings.creating : strings.create}
              onPress={handleCreate}
              disabled={loading}
              style={styles.submitButton}
              gradientColors={ACTION_GREEN_GRADIENT}
              disableShine
            />
          </>
        )}
      </ScrollView>
      <IOSKeyboardDoneAccessory nativeID={CREATE_ACCESSORY_ID} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f7f9fc' },
  submitButton: { marginTop: 10 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24, color: '#0f172a' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, marginBottom: 16, backgroundColor: '#fff' },
  label: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 10 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  typeOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    marginRight: 10,
    marginBottom: 10,
  },
  typeOptionActive: {
    backgroundColor: '#1e3a8a',
  },
  typeText: { color: '#0f172a' },
  typeTextActive: { color: '#fff' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 24 },
  colorOption: {
    width: 38,
    height: 38,
    borderRadius: 12,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#1e3a8a',
  },
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
    marginBottom: 14,
  },
  imagePreview: {
    width: '100%',
    height: 130,
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
  readOnlyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#f8fbff',
    padding: 12,
    marginBottom: 12,
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  readOnlyCopyWrap: {
    flex: 1,
    paddingRight: 12,
  },
  readOnlyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  readOnlyHint: {
    fontSize: 12,
    color: '#475569',
  },
  readOnlyToggle: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  readOnlyToggleActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  readOnlyToggleText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12,
  },
  readOnlyToggleTextActive: {
    color: '#166534',
  },
  bankConnectCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    backgroundColor: '#f0fdf4',
    padding: 16,
    marginTop: 4,
  },
  bankConnectTitle: {
    color: '#0f5132',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  bankConnectHint: {
    color: '#2f5e4f',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  bankConnectButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#84cc16',
    backgroundColor: '#84cc16',
    paddingVertical: 13,
    alignItems: 'center',
  },
  bankConnectButtonDisabled: {
    opacity: 0.6,
  },
  bankConnectButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});