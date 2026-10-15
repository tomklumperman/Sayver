import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, PanResponder, Pressable, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { subscribeToUserDocument } from '../firebase/firestore';
import AccountDetailsScreen from '../screens/AccountDetailsScreen';
import ConnectedAccountsScreen from '../screens/ConnectedAccountsScreen';
import ConnectTrading212Screen from '../screens/ConnectTrading212Screen';
import CreateSavingsScreen from '../screens/CreateSavingsScreen';
import CryptoAccountDetailsScreen from '../screens/CryptoAccountDetailsScreen';
import CryptoWalletConnectScreen from '../screens/CryptoWalletConnectScreen';
import FutureScreen from '../screens/FutureScreen';
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SavingsScreen from '../screens/SavingsScreen';
import SharedAccountDetailsScreen from '../screens/SharedAccountDetailsScreen';
import SharedSavingsScreen from '../screens/SharedSavingsScreen';
import SignUpScreen from '../screens/SignUpScreen';

const Stack = createStackNavigator();
const TAB_ORDER = ['Future', 'Home', 'Shared', 'Settings'];
const TAB_BAR_HEIGHT = 58;

function getIconName(routeName, focused) {
  if (routeName === 'Future') {
    return focused ? 'trending-up' : 'trending-up-outline';
  }
  if (routeName === 'Home') {
    return focused ? 'home' : 'home-outline';
  }
  if (routeName === 'Shared') {
    return focused ? 'people' : 'people-outline';
  }
  return focused ? 'settings' : 'settings-outline';
}

function getIconSize(routeName) {
  if (routeName === 'Home' || routeName === 'Shared') return 30;
  return 20;
}

function FloatingTabBar({ activeIndex, onTabPress, interactionEnabled = true, translateX, pageWidth }) {
  const scaleAnims = useRef(TAB_ORDER.map(() => new Animated.Value(1))).current;
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const bubbleCenterX = useRef(new Animated.Value(0)).current;
  const bubbleDragAnim = useRef(new Animated.Value(0)).current;
  const isBarDraggingRef = useRef(false);
  const hoveredIndexRef = useRef(activeIndex);
  const translateXValueRef = useRef(0);
  const tabBarInnerRef = useRef(null);
  const barPageXRef = useRef(0);

  const animateScale = (index, value) => {
    Animated.spring(scaleAnims[index], {
      toValue: value,
      useNativeDriver: true,
      speed: 28,
      bounciness: 6,
    }).start();
  };

  const tabWidth = tabBarWidth / TAB_ORDER.length;
  const bubbleSize = Math.min(48, tabWidth - 10);
  const bubbleDiameter = bubbleDragAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [bubbleSize, TAB_BAR_HEIGHT],
  });
  const bubbleRadius = Animated.divide(bubbleDiameter, 2);

  const syncBubbleFromTranslateX = (value) => {
    if (!pageWidth || !tabWidth) return;
    const progress = -value / pageWidth;
    bubbleCenterX.setValue((progress * tabWidth) + (tabWidth / 2));
  };

  useEffect(() => {
    const listenerId = translateX.addListener(({ value }) => {
      translateXValueRef.current = value;
      if (!isBarDraggingRef.current) {
        syncBubbleFromTranslateX(value);
      }
    });
    return () => translateX.removeListener(listenerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translateX, pageWidth, tabWidth, bubbleSize]);

  useEffect(() => {
    if (tabBarWidth > 0) {
      syncBubbleFromTranslateX(translateXValueRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabBarWidth, tabWidth, bubbleSize, pageWidth]);

  const measureBarPosition = () => {
    requestAnimationFrame(() => {
      tabBarInnerRef.current?.measure((_x, _y, _w, _h, pageX) => {
        barPageXRef.current = pageX;
      });
    });
  };

  const updateFromTouch = (locationX) => {
    if (!tabBarWidth || !tabWidth) return;
    const clampedTouchX = Math.max(0, Math.min(tabBarWidth, locationX));
    const dragRadius = TAB_BAR_HEIGHT / 2;
    const clampedCenterX = Math.max(dragRadius, Math.min(tabBarWidth - dragRadius, clampedTouchX));
    bubbleCenterX.setValue(clampedCenterX);

    const hoverIndex = Math.max(0, Math.min(TAB_ORDER.length - 1, Math.floor(clampedTouchX / tabWidth)));
    if (hoverIndex !== hoveredIndexRef.current) {
      hoveredIndexRef.current = hoverIndex;
      onTabPress(hoverIndex, true);
    }
  };

  const barPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => interactionEnabled && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
    onMoveShouldSetPanResponderCapture: (_, gestureState) => interactionEnabled && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
    onPanResponderGrant: (evt, gestureState) => {
      isBarDraggingRef.current = true;
      hoveredIndexRef.current = activeIndex;
      Animated.timing(bubbleDragAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
      updateFromTouch(gestureState.moveX - barPageXRef.current);
    },
    onPanResponderMove: (evt, gestureState) => {
      updateFromTouch(gestureState.moveX - barPageXRef.current);
    },
    onPanResponderRelease: (evt, gestureState) => {
      updateFromTouch(gestureState.moveX - barPageXRef.current);
      isBarDraggingRef.current = false;
      Animated.timing(bubbleDragAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
      syncBubbleFromTranslateX(translateXValueRef.current);
    },
    onPanResponderTerminate: () => {
      isBarDraggingRef.current = false;
      Animated.timing(bubbleDragAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
      syncBubbleFromTranslateX(translateXValueRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [interactionEnabled, tabBarWidth, tabWidth, bubbleSize, activeIndex, onTabPress, pageWidth]);

  return (
    <View pointerEvents="box-none" style={styles.tabBarOuter}>
      <View
        style={styles.tabBarInner}
        ref={tabBarInnerRef}
        onLayout={(event) => {
          setTabBarWidth(event.nativeEvent.layout.width);
          measureBarPosition();
        }}
        {...barPanResponder.panHandlers}
      >
        {tabBarWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabBarBubble,
              {
                width: bubbleDiameter,
                height: bubbleDiameter,
                borderRadius: bubbleRadius,
                transform: [
                  { translateX: Animated.subtract(bubbleCenterX, bubbleRadius) },
                  { translateY: Animated.subtract(TAB_BAR_HEIGHT / 2, bubbleRadius) },
                ],
              },
            ]}
          />
        ) : null}
        {TAB_ORDER.map((routeName, index) => {
          const focused = activeIndex === index;

          return (
            <Pressable
              key={routeName}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              disabled={!interactionEnabled}
              onPress={() => onTabPress(index, true)}
              onPressIn={() => animateScale(index, 1.1)}
              onPressOut={() => animateScale(index, 1)}
              style={styles.tabBarItem}
            >
              <Animated.View style={{ transform: [{ scale: scaleAnims[index] }] }}>
                <Ionicons
                  name={getIconName(routeName, focused)}
                  size={getIconSize(routeName)}
                  color={focused ? '#ffffff' : 'rgba(255,255,255,0.68)'}
                />
              </Animated.View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MainTabs({ navigation }) {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(1);
  const [tabNavigationEnabled, setTabNavigationEnabled] = useState(true);
  const activeIndexRef = useRef(1);
  const pagerSwipeEnabledRef = useRef(true);
  const translateX = useRef(new Animated.Value(0)).current;

  const setPagerSwipeEnabled = useCallback((enabled) => {
    const nextEnabled = enabled !== false;
    pagerSwipeEnabledRef.current = nextEnabled;
    setTabNavigationEnabled(nextEnabled);
  }, []);

  const goToIndex = (targetIndex, animated = true) => {
    const clampedIndex = Math.max(0, Math.min(TAB_ORDER.length - 1, targetIndex));
    const destination = -clampedIndex * width;
    activeIndexRef.current = clampedIndex;
    setActiveIndex(clampedIndex);

    if (!animated) {
      translateX.setValue(destination);
      return;
    }

    Animated.timing(translateX, {
      toValue: destination,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    goToIndex(activeIndexRef.current, false);
  }, [width]);

  const pagerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (!pagerSwipeEnabledRef.current) return false;
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.15;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        if (!pagerSwipeEnabledRef.current) return false;
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.15;
      },
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        const base = -activeIndexRef.current * width;
        const minTranslate = -(TAB_ORDER.length - 1) * width;
        const maxTranslate = 0;
        const nextTranslate = Math.max(minTranslate, Math.min(maxTranslate, base + gestureState.dx));
        translateX.setValue(nextTranslate);
      },
      onPanResponderRelease: (_, gestureState) => {
        const swipeForward = gestureState.dx < -(width * 0.18) || gestureState.vx < -0.45;
        const swipeBackward = gestureState.dx > width * 0.18 || gestureState.vx > 0.45;
        const current = activeIndexRef.current;
        const next = swipeForward
          ? Math.min(TAB_ORDER.length - 1, current + 1)
          : swipeBackward
            ? Math.max(0, current - 1)
            : current;
        goToIndex(next, true);
      },
      onPanResponderTerminate: () => {
        goToIndex(activeIndexRef.current, true);
      },
    })
  ).current;

  const handleTabPress = (index, animated) => {
    if (!tabNavigationEnabled) {
      return;
    }
    goToIndex(index, animated);
  };

  return (
    <View style={styles.mainTabsContainer}>
      <View style={styles.pagerViewport} {...pagerPanResponder.panHandlers}>
        <Animated.View style={[styles.pagerTrack, { width: width * TAB_ORDER.length, transform: [{ translateX }] }]}>
          <View style={[styles.pagerPage, { width }]}> 
            <FutureScreen navigation={navigation} setPagerSwipeEnabled={setPagerSwipeEnabled} />
          </View>
          <View style={[styles.pagerPage, { width }]}> 
            <HomeScreen navigation={navigation} setPagerSwipeEnabled={setPagerSwipeEnabled} />
          </View>
          <View style={[styles.pagerPage, { width }]}> 
            <SharedSavingsScreen navigation={navigation} setPagerSwipeEnabled={setPagerSwipeEnabled} />
          </View>
          <View style={[styles.pagerPage, { width }]}> 
            <ProfileScreen navigation={navigation} />
          </View>
        </Animated.View>
      </View>
      <FloatingTabBar
        activeIndex={activeIndex}
        onTabPress={handleTabPress}
        interactionEnabled={tabNavigationEnabled}
        translateX={translateX}
        pageWidth={width}
      />
    </View>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  );
}

function AppStack({ language }) {
  const titles = language === 'nl'
    ? { account: 'Spaarpotdetails', shared: 'Gedeelde spaarpot', create: 'Nieuwe rekening', savings: 'Spaargeld', connected: 'Gekoppelde banken', trading: 'Trading 212 koppelen', cryptoConnect: 'Cryptowallet koppelen', cryptoDetails: 'Cryptowallet' }
    : { account: 'Box details', shared: 'Shared box', create: 'New account', savings: 'Savings', connected: 'Connected banks', trading: 'Connect Trading212', cryptoConnect: 'Connect crypto wallet', cryptoDetails: 'Crypto wallet' };
  return (
    <Stack.Navigator
      initialRouteName="MainTabs"
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#0f5132' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="AccountDetails" component={AccountDetailsScreen} options={{ title: titles.account }} />
      <Stack.Screen name="SharedAccountDetails" component={SharedAccountDetailsScreen} options={{ title: titles.shared }} />
      <Stack.Screen name="CreateSavings" component={CreateSavingsScreen} options={{ title: titles.create }} />
      <Stack.Screen name="Savings" component={SavingsScreen} options={{ title: titles.savings }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ConnectedAccounts" component={ConnectedAccountsScreen} options={{ title: titles.connected }} />
      <Stack.Screen name="ConnectTrading212" component={ConnectTrading212Screen} options={{ title: titles.trading }} />
      <Stack.Screen name="CryptoWalletConnect" component={CryptoWalletConnectScreen} options={{ title: titles.cryptoConnect }} />
      <Stack.Screen name="CryptoAccountDetails" component={CryptoAccountDetailsScreen} options={{ title: titles.cryptoDetails }} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (initializing) {
        setInitializing(false);
      }
    });

    return unsubscribe;
  }, [initializing]);

  useEffect(() => {
    if (!user?.uid) {
      setLanguage('en');
      return undefined;
    }
    return subscribeToUserDocument(user.uid, (snapshot) => {
      setLanguage(snapshot.data()?.languagePreference === 'nl' ? 'nl' : 'en');
    });
  }, [user?.uid]);

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0f5132" />
        <View style={styles.loadingLogoContainer}>
          <Image source={require('../../assets/icon.png')} style={styles.loadingLogo} resizeMode="contain" accessibilityLabel="Sayver" />
          <ActivityIndicator size="large" color="#84cc16" style={styles.loadingSpinner} />
        </View>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <AppStack language={language} /> : <AuthStack />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f5132' },
  loadingLogoContainer: { width: 240, height: 240, maxWidth: '80%' },
  loadingLogo: { width: '100%', height: '100%' },
  loadingSpinner: { position: 'absolute', top: 272, alignSelf: 'center' },
  tabBarOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: 'center',
  },
  tabBarInner: {
    width: '74%',
    height: TAB_BAR_HEIGHT,
    borderRadius: 30,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  tabBarItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBarBubble: {
    position: 'absolute',
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tabScreenGestureLayer: {
    flex: 1,
  },
  mainTabsContainer: {
    flex: 1,
  },
  pagerViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  pagerTrack: {
    flex: 1,
    flexDirection: 'row',
  },
  pagerPage: {
    flex: 1,
  },
});
