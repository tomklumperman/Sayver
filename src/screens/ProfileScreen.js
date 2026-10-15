import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { getAuth, updateEmail, updatePassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Modal, StyleSheet, Switch, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, useWindowDimensions, View } from 'react-native';
import { IOSKeyboardDoneAccessory } from '../components/ModalKeyboardSupport';
import { APP_BACKGROUND_GRADIENT } from '../constants/backgroundGradient';
import { getFirestoreDb } from '../firebase/config';
import { syncSharedAccountsDisplayName } from '../firebase/firestore';
import { isLocalImageUri, uploadLocalImageIfNeeded } from '../firebase/storage';

const DASHBOARD_MOUNTAIN_IMAGE = require('../../assets/dashboard-mountain-2.jpg');
const HERO_SOURCE_START_Y = 1310;
const HERO_SOURCE_END_Y = 1600;
const HERO_SCENE_HEIGHT = HERO_SOURCE_END_Y - HERO_SOURCE_START_Y;
const PULL_REFRESH_TRIGGER = 74;
const SETTINGS_ACCESSORY_ID = 'settings-input-accessory';
const REFRESH_HOLD_OFFSET = 68;
const AnimatedScrollView = Animated.createAnimatedComponent(Animated.ScrollView);
const SETTINGS_TOP_COLOR = '#d1fae5';
const SETTINGS_MID_COLOR = '#88b59f';
const SETTINGS_BOTTOM_COLOR = '#3f6657';
const SETTINGS_DARK_TOP_COLOR = '#1b3b2e';
const SETTINGS_DARK_MID_COLOR = '#1f4a39';
const SETTINGS_DARK_BOTTOM_COLOR = '#10261d';
const TRANSLATIONS = {
  en: {
    loadingProfile: 'Loading profile...',
    settingsTitle: 'Settings',
    settingsSubtitle: 'Manage your profile and preferences',
    profile: 'Profile',
    displayName: 'Display name',
    tapPhoto: 'Tap the picture to choose a photo from your gallery.',
    saveProfile: 'Save profile',
    connectWallets: 'Connect wallets',
    currency: 'Currency',
    changeEmail: 'Change email',
    newEmail: 'New email',
    changePassword: 'Change password',
    newPassword: 'New password',
    updatePassword: 'Update password',
    darkMode: 'Dark mode',
    appLanguage: 'App language',
    languageHint: 'Choose the app language.',
    english: 'English',
    dutch: 'Dutch',
    signOut: 'Sign out',
    saved: 'Saved',
    profileSaved: 'Profile changes have been saved.',
    error: 'Error',
    updateProfileFailed: 'Unable to update profile.',
    permissionNeeded: 'Permission needed',
    photoPermission: 'Please allow photo access to choose a profile picture.',
    profilePictureFailed: 'Unable to choose profile picture.',
    validation: 'Validation',
    newPasswordRequired: 'Please enter a new password.',
    passwordUpdated: 'Your password was updated successfully.',
    updatePasswordFailed: 'Unable to update password.',
    newEmailRequired: 'Please enter a new email address.',
    emailUpdated: 'Your email was updated successfully.',
    reauthenticationNeeded: 'Please sign out and sign in again before changing your email.',
    updateEmailFailed: 'Unable to update email.',
    signOutFailed: 'Sign out failed.',
    signOutConfirm: 'Are you sure you want to sign out?',
    reauthenticationMessage: 'Please sign out and sign in again before changing your email.',
    discardChanges: 'Discard changes',
    externalAccount: 'External account',
    connectBank: 'Connect bank',
    connectInvestment: 'Connect investment account',
    connectCryptoWallet: 'Connect crypto wallet',
    cryptoUnavailable: 'Crypto wallet connections are coming soon.',
    createNewAccount: 'New account',
    chooseBroker: 'Choose a broker',
    comingSoon: 'Coming soon',
    degiro: 'DEGIRO',
    moreBrokers: 'More brokers',
  },
  nl: {
    loadingProfile: 'Profiel laden...',
    settingsTitle: 'Instellingen',
    settingsSubtitle: 'Beheer je profiel en voorkeuren',
    profile: 'Profiel',
    displayName: 'Weergavenaam',
    tapPhoto: 'Tik op de foto om een afbeelding uit je galerij te kiezen.',
    saveProfile: 'Profiel opslaan',
    connectWallets: 'Wallets koppelen',
    currency: 'Valuta',
    changeEmail: 'E-mailadres wijzigen',
    newEmail: 'Nieuw e-mailadres',
    changePassword: 'Wachtwoord wijzigen',
    newPassword: 'Nieuw wachtwoord',
    updatePassword: 'Wachtwoord bijwerken',
    darkMode: 'Donkere modus',
    appLanguage: 'App-taal',
    languageHint: 'Kies de taal van de app.',
    english: 'Engels',
    dutch: 'Nederlands',
    signOut: 'Uitloggen',
    saved: 'Opgeslagen',
    profileSaved: 'Je profielwijzigingen zijn opgeslagen.',
    error: 'Fout',
    updateProfileFailed: 'Profiel bijwerken mislukt.',
    permissionNeeded: 'Toestemming nodig',
    photoPermission: 'Geef toegang tot foto’s om een profielfoto te kiezen.',
    profilePictureFailed: 'Profielfoto kiezen mislukt.',
    validation: 'Invoerfout',
    newPasswordRequired: 'Vul een nieuw wachtwoord in.',
    passwordUpdated: 'Je wachtwoord is bijgewerkt.',
    updatePasswordFailed: 'Wachtwoord bijwerken mislukt.',
    newEmailRequired: 'Vul een nieuw e-mailadres in.',
    emailUpdated: 'Je e-mailadres is bijgewerkt.',
    reauthenticationNeeded: 'Log uit en opnieuw in voordat je je e-mailadres wijzigt.',
    updateEmailFailed: 'E-mailadres bijwerken mislukt.',
    signOutFailed: 'Uitloggen mislukt.',
    signOutConfirm: 'Weet je zeker dat je wilt uitloggen?',
    reauthenticationMessage: 'Log uit en opnieuw in voordat je je e-mailadres wijzigt.',
    discardChanges: 'Wijzigingen annuleren',
    externalAccount: 'Externe rekening',
    connectBank: 'Bank koppelen',
    connectInvestment: 'Beleggingsrekening koppelen',
    connectCryptoWallet: 'Cryptowallet koppelen',
    cryptoUnavailable: 'Cryptowallets koppelen is binnenkort mogelijk.',
    createNewAccount: 'Nieuwe rekening',
    chooseBroker: 'Kies een broker',
    comingSoon: 'Binnenkort beschikbaar',
    degiro: 'DEGIRO',
    moreBrokers: 'Meer brokers',
  },
};

export default function ProfileScreen({ navigation }) {
  const { width: windowWidth } = useWindowDimensions();
  const auth = getAuth();
  const user = auth.currentUser;
  const scrollY = useRef(new Animated.Value(0)).current;
  const gearSpinAnim = useRef(new Animated.Value(0)).current;
  const gearOpacityAnim = useRef(new Animated.Value(0)).current;
  const gearSpinLoopRef = useRef(null);
  const refreshHoldAnim = useRef(new Animated.Value(0)).current;
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [savedDisplayName, setSavedDisplayName] = useState(user?.displayName || '');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [savedPhotoURL, setSavedPhotoURL] = useState(user?.photoURL || '');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [theme, setTheme] = useState('light');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [externalAccountModalVisible, setExternalAccountModalVisible] = useState(false);
  const [brokerModalVisible, setBrokerModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isRefreshSettling, setIsRefreshSettling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const loadUser = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const data = userDoc.data() || {};
    const loadedDisplayName = data.displayName || user.displayName || '';
    let loadedPhotoURL = data.photoURL || user.photoURL || '';
    if (isLocalImageUri(loadedPhotoURL)) {
      try {
        loadedPhotoURL = await uploadLocalImageIfNeeded(user.uid, loadedPhotoURL, 'profile-photos');
        await updateProfile(user, { photoURL: loadedPhotoURL });
        await updateDoc(doc(db, 'users', user.uid), { photoURL: loadedPhotoURL });
      } catch (_error) {
        console.warn('Could not restore the saved profile photo.');
      }
    }
    setDisplayName(loadedDisplayName);
    setSavedDisplayName(loadedDisplayName);
    setPhotoURL(loadedPhotoURL);
    setSavedPhotoURL(loadedPhotoURL);
    setCurrency(data.currencyPreference || 'EUR');
    setTheme(data.themePreference || 'light');
    const savedLanguage = data.languagePreference === 'nl' ? 'nl' : 'en';
    setLanguage(savedLanguage);
    await AsyncStorage.setItem('appLanguagePreference', savedLanguage).catch(() => {});
    setNewEmail(user.email || '');
    setLoading(false);
  };

  useEffect(() => {
    loadUser();
  }, [user]);

  useEffect(() => {
    const shouldPreviewPull = pullDistance > 8 && !isRefreshSettling;
    const shouldShowGear = refreshing || shouldPreviewPull || isRefreshSettling;

    if (shouldShowGear) {
      if (!gearSpinLoopRef.current) {
        gearSpinLoopRef.current = Animated.loop(
          Animated.timing(gearSpinAnim, {
            toValue: 1,
            duration: 850,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        );
        gearSpinLoopRef.current.start();
      }

      if (isRefreshSettling) {
        return;
      }

      if (refreshing) {
        Animated.timing(gearOpacityAnim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }).start();
      } else {
        const revealOpacity = Math.max(0, Math.min(1, (pullDistance - 8) / 22));
        gearOpacityAnim.setValue(revealOpacity);
      }
      return;
    }

    gearOpacityAnim.setValue(0);
    if (gearSpinLoopRef.current) {
      gearSpinLoopRef.current.stop();
      gearSpinLoopRef.current = null;
    }
    gearSpinAnim.stopAnimation();
    gearSpinAnim.setValue(0);
  }, [gearOpacityAnim, gearSpinAnim, isRefreshSettling, pullDistance, refreshing]);

  useEffect(() => {
    return () => {
      if (gearSpinLoopRef.current) {
        gearSpinLoopRef.current.stop();
        gearSpinLoopRef.current = null;
      }
      gearSpinAnim.stopAnimation();
      gearOpacityAnim.stopAnimation();
    };
  }, [gearOpacityAnim, gearSpinAnim]);

  const handleSaveProfile = async () => {
    if (!hasProfileChanges || savingProfile) return;
    setSavingProfile(true);
    try {
      const updates = {};
      const nextDisplayName = displayName.trim();
      const nextPhotoURL = photoURL !== savedPhotoURL && isLocalImageUri(photoURL)
        ? await uploadLocalImageIfNeeded(user.uid, photoURL, 'profile-photos')
        : photoURL || null;
      if (nextDisplayName !== savedDisplayName) {
        updates.displayName = nextDisplayName || null;
      }
      if (nextPhotoURL !== savedPhotoURL) {
        updates.photoURL = nextPhotoURL;
      }

      if (Object.keys(updates).length > 0) {
        await updateProfile(user, {
          displayName: nextDisplayName || null,
          photoURL: nextPhotoURL,
        });
        const db = getFirestoreDb();
        await updateDoc(doc(db, 'users', user.uid), updates);
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'displayName') && nextDisplayName) {
        await syncSharedAccountsDisplayName(user.uid, nextDisplayName);
      }
      setDisplayName(nextDisplayName);
      setSavedDisplayName(nextDisplayName);
      setPhotoURL(nextPhotoURL);
      setSavedPhotoURL(nextPhotoURL);
      Alert.alert(strings.saved, strings.profileSaved);
    } catch (error) {
      Alert.alert(strings.error, error.message || strings.updateProfileFailed);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDiscardProfileChanges = () => {
    if (!hasProfileChanges || savingProfile) return;
    setDisplayName(savedDisplayName);
    setPhotoURL(savedPhotoURL);
  };

  const handlePickProfilePicture = async () => {
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

      const nextPhotoURL = result.assets[0].uri;
      setPhotoURL(nextPhotoURL);
    } catch (error) {
      Alert.alert(strings.error, error.message || strings.profilePictureFailed);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      Alert.alert(strings.validation, strings.newPasswordRequired);
      return;
    }
    try {
      await updatePassword(user, newPassword);
      setNewPassword('');
      Alert.alert(strings.saved, strings.passwordUpdated);
    } catch (error) {
      Alert.alert(strings.error, error.message || strings.updatePasswordFailed);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) {
      Alert.alert(strings.validation, strings.newEmailRequired);
      return;
    }

    try {
      await updateEmail(user, newEmail.trim());
      const db = getFirestoreDb();
      await updateDoc(doc(db, 'users', user.uid), { email: newEmail.trim() });
      Alert.alert(strings.saved, strings.emailUpdated);
    } catch (error) {
      if (error?.code === 'auth/requires-recent-login') {
        Alert.alert(strings.reauthenticationNeeded, strings.reauthenticationMessage);
      } else {
        Alert.alert(strings.error, error.message || strings.updateEmailFailed);
      }
    }
  };

  const handleThemeToggle = async (value) => {
    setTheme(value ? 'dark' : 'light');
    if (!user) return;
    const db = getFirestoreDb();
    await updateDoc(doc(db, 'users', user.uid), { themePreference: value ? 'dark' : 'light' });
  };

  const handleCurrencyChange = async (nextCurrency) => {
    setCurrency(nextCurrency);
    if (!user) return;
    try {
      const db = getFirestoreDb();
      await updateDoc(doc(db, 'users', user.uid), { currencyPreference: nextCurrency });
    } catch (error) {
      console.warn('Unable to update currency preference:', error);
    }
  };

  const handleLanguageChange = async (nextLanguage) => {
    const normalizedLanguage = nextLanguage === 'nl' ? 'nl' : 'en';
    setLanguage(normalizedLanguage);
    await AsyncStorage.setItem('appLanguagePreference', normalizedLanguage).catch(() => {});
    if (!user) return;
    try {
      const db = getFirestoreDb();
      await updateDoc(doc(db, 'users', user.uid), { languagePreference: normalizedLanguage });
    } catch (error) {
      console.warn('Unable to update language preference:', error);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      strings.signOut,
      strings.signOutConfirm,
      [
        { text: strings.cancel, style: 'cancel' },
        {
          text: strings.signOut,
          style: 'destructive',
          onPress: async () => {
            try {
              await auth.signOut();
            } catch (error) {
              Alert.alert(strings.error, strings.signOutFailed);
            }
          },
        },
      ]
    );
  };

  const handleRefreshSettings = async () => {
    if (refreshing || isRefreshSettling) return;
    setRefreshing(true);
    setIsRefreshSettling(false);
    Animated.timing(refreshHoldAnim, {
      toValue: REFRESH_HOLD_OFFSET,
      duration: 140,
      useNativeDriver: true,
    }).start();

    try {
      await Promise.all([
        loadUser(),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    } catch (error) {
      console.warn('Settings refresh failed:', error);
    } finally {
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
          Animated.timing(gearOpacityAnim, {
            toValue: 0,
            duration: 120,
            useNativeDriver: true,
          }),
        ]).start(() => resolve());
      });

      if (gearSpinLoopRef.current) {
        gearSpinLoopRef.current.stop();
        gearSpinLoopRef.current = null;
      }
      gearSpinAnim.stopAnimation();
      gearSpinAnim.setValue(0);
      gearOpacityAnim.setValue(0);
      setIsRefreshSettling(false);
    }
  };

  const strings = TRANSLATIONS[language] || TRANSLATIONS.en;
  const hasProfileChanges = displayName.trim() !== savedDisplayName || photoURL !== savedPhotoURL;
  const isDark = theme === 'dark';
  const profileGradientColors = isDark
    ? APP_BACKGROUND_GRADIENT.dark
    : [SETTINGS_TOP_COLOR, SETTINGS_TOP_COLOR, SETTINGS_MID_COLOR, SETTINGS_BOTTOM_COLOR];
  const settingsTextPrimary = isDark ? '#f8fafc' : '#0f2f26';
  const settingsTextSecondary = isDark ? '#d1d5db' : '#1f4d3f';
  const settingsTextMuted = isDark ? '#94a3b8' : '#2f5e4f';
  const settingsSurface = isDark ? 'rgba(2,6,23,0.52)' : 'rgba(255,255,255,0.2)';
  const settingsSurfaceBorder = isDark ? 'rgba(148,163,184,0.36)' : 'rgba(15,81,50,0.24)';
  const settingsInputBg = isDark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.38)';
  const settingsInputBorder = isDark ? 'rgba(148,163,184,0.5)' : 'rgba(15,81,50,0.28)';
  const settingsActionBg = isDark ? 'rgba(148,163,184,0.16)' : 'rgba(15,81,50,0.12)';
  const settingsActionBorder = isDark ? 'rgba(203,213,225,0.45)' : 'rgba(15,81,50,0.35)';
  const settingsChoiceBg = isDark ? 'rgba(15,23,42,0.58)' : 'rgba(255,255,255,0.26)';
  const settingsChoiceActiveBg = isDark ? 'rgba(248,250,252,0.22)' : 'rgba(15,81,50,0.2)';
  const settingsPlaceholder = isDark ? 'rgba(203,213,225,0.75)' : 'rgba(15,47,38,0.55)';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={profileGradientColors}
          locations={[0, 0.35, 0.72, 1]}
          start={[0, 0]}
          end={[0, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <Text style={styles.loadingText}>{strings.loadingProfile}</Text>
      </View>
    );
  }

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
  const pullIndicatorTranslateY = refreshing ? 0 : Math.max(0, 18 - (pullDistance * 0.35));
  const gearRotation = gearSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const sharedImageScrollOffset = scrollY.interpolate({
    inputRange: [0, HERO_SCENE_HEIGHT + 240],
    outputRange: [0, -(HERO_SCENE_HEIGHT + 240)],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.screen, isDark && styles.screenDark]}>
      <LinearGradient
        colors={profileGradientColors}
        locations={[0, 0.35, 0.72, 1]}
        start={[0, 0]}
        end={[0, 1]}
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

      <Animated.View style={[styles.fixedHeroContainer, { transform: [{ translateY: sharedImageScrollOffset }] }]}>
        <View style={styles.heroOverlay} />
        <View style={styles.heroContent}>
          <Text style={[styles.heroTitle, { color: isDark ? '#f8fafc' : SETTINGS_TOP_COLOR }]}>{strings.settingsTitle}</Text>
          <Text style={[styles.heroSubtitle, { color: isDark ? '#cbd5e1' : '#bbf7d0' }]}>{strings.settingsSubtitle}</Text>
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.pullIndicatorContainer,
          { opacity: gearOpacityAnim, transform: [{ translateY: pullIndicatorTranslateY }] },
        ]}
      >
        <Animated.View style={[styles.gearIndicator, { transform: [{ rotate: gearRotation }] }]}> 
          <MaterialCommunityIcons name="cog" size={28} color="#ffffff" />
        </Animated.View>
      </Animated.View>

      <AnimatedScrollView
        style={[styles.scroll, { transform: [{ translateY: refreshHoldAnim }] }]}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (event) => {
              const offsetY = event.nativeEvent.contentOffset.y;
              const rawPullDistance = Math.max(0, -offsetY);
              setPullDistance(rawPullDistance);
              if (!refreshing && offsetY >= -0.5 && rawPullDistance <= 0.5) {
                setPullDistance(0);
              }
            },
          }
        )}
        onScrollEndDrag={(event) => {
          if (!refreshing && pullDistance >= PULL_REFRESH_TRIGGER) {
            handleRefreshSettings();
          }
          if (!refreshing && event.nativeEvent.contentOffset.y >= -0.5) {
            setPullDistance(0);
          }
        }}
        onMomentumScrollEnd={(event) => {
          if (!refreshing && event.nativeEvent.contentOffset.y >= -0.5) {
            setPullDistance(0);
          }
        }}
      >
      <View style={styles.panel}>
        <View style={[styles.profileCard, { backgroundColor: settingsSurface, borderColor: settingsSurfaceBorder }]}>
          <View style={styles.profileCardInfo}>
            <Text style={[styles.profileCardTitle, { color: settingsTextPrimary }]}>{strings.profile}</Text>
            <Text style={[styles.profileCardLabel, { color: settingsTextSecondary }]}>{strings.displayName}</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              style={[styles.profileCardInput, { color: settingsTextPrimary, backgroundColor: settingsInputBg, borderColor: settingsInputBorder }]}
              placeholder={strings.displayName}
              placeholderTextColor={settingsPlaceholder}
              inputAccessoryViewID={SETTINGS_ACCESSORY_ID}
            />
          </View>
          <TouchableOpacity style={[styles.avatarPlaceholder, { backgroundColor: isDark ? 'rgba(148,163,184,0.2)' : 'rgba(15,81,50,0.16)', borderColor: settingsSurfaceBorder }]} onPress={handlePickProfilePicture} activeOpacity={0.85}>
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarText, { color: settingsTextPrimary }]}>{(displayName || 'S').charAt(0).toUpperCase()}</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={[styles.helperText, { color: settingsTextMuted }]}>{strings.tapPhoto}</Text>
        <View style={styles.profileActionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.profileActionButton, styles.profileSaveButton, !hasProfileChanges || savingProfile ? styles.profileActionDisabled : null]}
            onPress={handleSaveProfile}
            disabled={!hasProfileChanges || savingProfile}
            accessibilityState={{ disabled: !hasProfileChanges || savingProfile }}
          >
            <Text style={[styles.actionButtonText, styles.profileSaveButtonText]}>{strings.saveProfile}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.profileActionButton, styles.profileDiscardButton, !hasProfileChanges || savingProfile ? styles.profileActionDisabled : null]}
            onPress={handleDiscardProfileChanges}
            disabled={!hasProfileChanges || savingProfile}
            accessibilityState={{ disabled: !hasProfileChanges || savingProfile }}
          >
            <Text style={[styles.actionButtonText, styles.profileDiscardButtonText]}>{strings.discardChanges}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: settingsActionBg, borderColor: settingsActionBorder }]} onPress={() => setExternalAccountModalVisible(true)}>
          <Text style={[styles.actionButtonText, { color: settingsTextPrimary }]}>{strings.connectWallets}</Text>
        </TouchableOpacity>

        <View style={styles.currencyToggleRow}>
          <Text style={[styles.label, { color: settingsTextSecondary }]}>{strings.currency}</Text>
          <View style={styles.currencyOptionsRow}>
            {['EUR', 'USD', 'GBP'].map((option) => (
                 <TouchableOpacity
                key={option}
                style={[
                  styles.currencyOption,
                  { backgroundColor: settingsChoiceBg, borderColor: settingsInputBorder },
                  currency === option && [styles.currencyOptionActive, { backgroundColor: settingsChoiceActiveBg, borderColor: settingsActionBorder }],
                ]}
                onPress={() => handleCurrencyChange(option)}
              >
                 <Text style={[styles.currencyOptionText, { color: settingsTextSecondary }, currency === option && [styles.currencyOptionTextActive, { color: settingsTextPrimary }]]}>{option} {option === 'EUR' ? '€' : option === 'USD' ? '$' : '£'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: settingsTextSecondary }]}>{strings.changeEmail}</Text>
          <TextInput
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder={strings.newEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[styles.input, { color: settingsTextPrimary, backgroundColor: settingsInputBg, borderColor: settingsInputBorder }]}
            placeholderTextColor={settingsPlaceholder}
            inputAccessoryViewID={SETTINGS_ACCESSORY_ID}
          />
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: settingsActionBg, borderColor: settingsActionBorder }]} onPress={handleChangeEmail}>
            <Text style={[styles.actionButtonText, { color: settingsTextPrimary }]}>{strings.changeEmail}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.section}>
          <Text style={[styles.label, { color: settingsTextSecondary }]}>{strings.changePassword}</Text>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder={strings.newPassword}
            secureTextEntry
            style={[styles.input, { color: settingsTextPrimary, backgroundColor: settingsInputBg, borderColor: settingsInputBorder }]}
            placeholderTextColor={settingsPlaceholder}
            inputAccessoryViewID={SETTINGS_ACCESSORY_ID}
          />
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: settingsActionBg, borderColor: settingsActionBorder }, !newPassword.trim() ? styles.profileActionDisabled : null]}
            onPress={handleChangePassword}
            disabled={!newPassword.trim()}
            accessibilityState={{ disabled: !newPassword.trim() }}
          >
            <Text style={[styles.actionButtonText, { color: settingsTextPrimary }]}>{strings.updatePassword}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.section}>
          <View style={styles.themeToggleRow}>
            <Text style={[styles.label, { color: settingsTextSecondary }]}>{strings.darkMode}</Text>
            <Switch value={theme === 'dark'} onValueChange={handleThemeToggle} />
          </View>
        </View>
        <View style={styles.section}>
          <Text style={[styles.label, { color: settingsTextSecondary }]}>{strings.appLanguage}</Text>
          <View style={styles.languageRow}>
            <TouchableOpacity
              style={[
                styles.languageOption,
                { backgroundColor: settingsChoiceBg, borderColor: settingsInputBorder },
                language === 'en' && [styles.languageOptionActive, { backgroundColor: settingsChoiceActiveBg, borderColor: settingsActionBorder }],
              ]}
              onPress={() => handleLanguageChange('en')}
            >
              <Text style={[styles.languageOptionText, { color: settingsTextSecondary }, language === 'en' && [styles.languageOptionTextActive, { color: settingsTextPrimary }]]}>🇬🇧 {strings.english}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.languageOption,
                { backgroundColor: settingsChoiceBg, borderColor: settingsInputBorder },
                language === 'nl' && [styles.languageOptionActive, { backgroundColor: settingsChoiceActiveBg, borderColor: settingsActionBorder }],
              ]}
              onPress={() => handleLanguageChange('nl')}
            >
              <Text style={[styles.languageOptionText, { color: settingsTextSecondary }, language === 'nl' && [styles.languageOptionTextActive, { color: settingsTextPrimary }]]}>🇳🇱 {strings.dutch}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.helperText, { color: settingsTextMuted }]}>{strings.languageHint}</Text>
        </View>
        <View style={styles.signOutRow}>
          <TouchableOpacity style={[styles.actionButton, styles.signOutAction, styles.signOutButton]} onPress={handleSignOut}>
            <Text style={[styles.actionButtonText, styles.signOutButtonText]}>{strings.signOut}</Text>
          </TouchableOpacity>
        </View>
      </View>
      </AnimatedScrollView>
      <IOSKeyboardDoneAccessory nativeID={SETTINGS_ACCESSORY_ID} />

      <Modal visible={externalAccountModalVisible} animationType="slide" transparent onRequestClose={() => setExternalAccountModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setExternalAccountModalVisible(false)}>
          <View style={styles.settingsModalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.settingsModalContent}>
                <Text style={styles.settingsModalTitle}>{strings.externalAccount}</Text>
                <TouchableOpacity
                  style={styles.settingsOption}
                  onPress={() => {
                    setExternalAccountModalVisible(false);
                    navigation.navigate('ConnectedAccounts');
                  }}
                >
                  <Text style={styles.settingsOptionText}>{strings.connectBank}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.settingsOption}
                  onPress={() => {
                    setExternalAccountModalVisible(false);
                    setBrokerModalVisible(true);
                  }}
                >
                  <Text style={styles.settingsOptionText}>{strings.connectInvestment}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.settingsOption, styles.settingsOptionDisabled]}
                  onPress={() => Alert.alert(strings.connectCryptoWallet, strings.cryptoUnavailable)}
                >
                  <Text style={styles.settingsOptionDisabledText}>{strings.connectCryptoWallet}</Text>
                  <Text style={styles.settingsOptionBadge}>{strings.comingSoon}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.settingsOption}
                  onPress={() => {
                    setExternalAccountModalVisible(false);
                    navigation.navigate('CreateSavings', { userId: user?.uid });
                  }}
                >
                  <Text style={styles.settingsOptionText}>{strings.createNewAccount}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingsModalCancel} onPress={() => setExternalAccountModalVisible(false)}>
                  <Text style={styles.settingsModalCancelText}>{strings.cancel}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={brokerModalVisible} animationType="slide" transparent onRequestClose={() => setBrokerModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setBrokerModalVisible(false)}>
          <View style={styles.settingsModalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.settingsModalContent}>
                <Text style={styles.settingsModalTitle}>{strings.chooseBroker}</Text>
                <TouchableOpacity
                  style={styles.settingsOption}
                  onPress={() => {
                    setBrokerModalVisible(false);
                    navigation.navigate('ConnectTrading212');
                  }}
                >
                  <Text style={styles.settingsOptionText}>Trading 212</Text>
                </TouchableOpacity>
                <View style={[styles.settingsOption, styles.settingsOptionDisabled]}>
                  <Text style={styles.settingsOptionDisabledText}>{strings.degiro}</Text>
                  <Text style={styles.settingsOptionBadge}>{strings.comingSoon}</Text>
                </View>
                <View style={[styles.settingsOption, styles.settingsOptionDisabled]}>
                  <Text style={styles.settingsOptionDisabledText}>{strings.moreBrokers}</Text>
                  <Text style={styles.settingsOptionBadge}>{strings.comingSoon}</Text>
                </View>
                <TouchableOpacity style={styles.settingsModalCancel} onPress={() => setBrokerModalVisible(false)}>
                  <Text style={styles.settingsModalCancelText}>{strings.cancel}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SETTINGS_TOP_COLOR },
  screenDark: { backgroundColor: APP_BACKGROUND_GRADIENT.solidDark },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: HERO_SCENE_HEIGHT, paddingBottom: 24 },
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
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8, 15, 23, 0.18)' },
  heroContent: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: 20 },
  heroTitle: { fontSize: 34, fontWeight: '900', color: SETTINGS_TOP_COLOR },
  heroSubtitle: { fontSize: 14, color: '#bbf7d0', marginTop: 6 },
  pullIndicatorContainer: {
    position: 'absolute',
    top: HERO_SCENE_HEIGHT + 18,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  gearIndicator: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  gearText: { fontSize: 24, lineHeight: 24, color: '#ffffff', textAlign: 'center' },
  panel: {
    marginTop: 0,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 28,
  },
  signOutAction: { marginTop: 8 },
  profileCard: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,81,50,0.24)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  profileCardInfo: { flex: 1, paddingRight: 14 },
  profileCardTitle: { fontSize: 26, fontWeight: '700', color: '#0f5132', marginBottom: 8 },
  profileCardLabel: { color: '#1f4d3f', marginBottom: 6, fontSize: 14, fontWeight: '600' },
  profileCardInput: {
    borderWidth: 1,
    borderColor: 'rgba(15,81,50,0.28)',
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.38)',
    color: '#0f2f26',
  },
  avatarPlaceholder: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(15,81,50,0.16)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(15,81,50,0.35)' },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  avatarText: { fontSize: 36, fontWeight: '800', color: '#0f5132' },
  label: { color: '#1f4d3f', marginBottom: 8, fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: 'rgba(15,81,50,0.28)', borderRadius: 14, padding: 14, backgroundColor: 'rgba(255,255,255,0.34)', marginBottom: 16, color: '#0f2f26' },
  actionButton: {
    backgroundColor: 'rgba(15,81,50,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(15,81,50,0.35)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  profileActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  profileActionButton: { flex: 1, marginBottom: 0, paddingHorizontal: 8 },
  profileSaveButton: { backgroundColor: '#84cc16', borderColor: '#84cc16' },
  profileSaveButtonText: { color: '#ffffff' },
  profileDiscardButton: { backgroundColor: '#D50000', borderColor: '#D50000' },
  profileDiscardButtonText: { color: '#ffffff' },
  profileActionDisabled: { opacity: 0.55 },
  actionButtonText: { color: '#0f5132', fontWeight: '700', fontSize: 15 },
  settingsModalOverlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, backgroundColor: 'rgba(15,23,42,0.55)' },
  settingsModalContent: { width: '100%', backgroundColor: '#ffffff', borderRadius: 16, padding: 20 },
  settingsModalTitle: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginBottom: 12 },
  settingsOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  settingsOptionText: { color: '#0f172a', fontWeight: '700' },
  settingsOptionDisabled: { backgroundColor: '#f8fafc' },
  settingsOptionDisabledText: { color: '#64748b', fontWeight: '700' },
  settingsOptionBadge: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  settingsModalCancel: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  settingsModalCancelText: { color: '#334155', fontWeight: '700' },
  helperText: { color: '#2f5e4f', marginBottom: 16, fontSize: 13 },
  currencyToggleRow: { marginTop: 2, marginBottom: 8 },
  currencyOptionsRow: { flexDirection: 'row', gap: 8 },
  currencyOption: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(15,81,50,0.24)',
  },
  currencyOptionActive: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(15,81,50,0.5)',
  },
  currencyOptionText: {
    color: '#1f4d3f',
    fontWeight: '700',
  },
  currencyOptionTextActive: {
    color: '#0f5132',
  },
  section: { marginTop: 24 },
  themeToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  languageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  languageOption: {
    width: '48%',
    borderWidth: 1,
    borderColor: 'rgba(15,81,50,0.32)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  languageOptionActive: {
    backgroundColor: 'rgba(15,81,50,0.2)',
    borderColor: 'rgba(15,81,50,0.58)',
  },
  languageOptionText: { color: '#1f4d3f', fontWeight: '600' },
  languageOptionTextActive: { color: '#0f5132' },
  signOutRow: { marginTop: 32 },
  signOutButton: {
    backgroundColor: 'rgba(220,38,38,0.14)',
    borderColor: 'rgba(220,38,38,0.55)',
  },
  signOutButtonText: { color: '#b91c1c' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, textAlign: 'center', marginTop: 24, color: '#0f5132' },
});
