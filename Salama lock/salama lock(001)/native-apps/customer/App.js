import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { api, clearMerchant, clearSession, getMerchant, hasSession, resolveMerchantCode, saveMerchant, saveSession } from './src/api';

const BRAND = '#0B4F3C';
const ACCENT = '#F6B73C';
const tabs = [
  ['home', '⌂', 'Home'],
  ['pay', '●', 'Pay'],
  ['history', '↻', 'History'],
  ['alerts', '♢', 'Alerts'],
  ['profile', '○', 'Account']
];

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const text = (value, fallback = 'Not set') => String(value || fallback);

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [booting, setBooting] = useState(true);
  const [portal, setPortal] = useState(null);
  const [tab, setTab] = useState('home');
  const [refreshing, setRefreshing] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState('');
  const [merchant, setMerchant] = useState(undefined);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setBooting(true);
    try {
      const result = await api.get('/api/customer/portal');
      setPortal(result.portal);
      setSignedIn(true);
    } catch (error) {
      if (error.status === 401) {
        await clearSession();
        setSignedIn(false);
      } else if (!quiet) {
        Alert.alert('Unable to load account', error.message);
      }
    } finally {
      setBooting(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    hasSession().then((active) => active ? load() : setBooting(false));
    getMerchant().then(setMerchant);
    SecureStore.getItemAsync('salama_customer_profile_photo').then((uri) => setProfilePhoto(uri || ''));
  }, [load]);
  useEffect(() => {
    if (!signedIn || tab === 'home') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setTab('home');
      return true;
    });
    return () => subscription.remove();
  }, [signedIn, tab]);

  if (booting) return <LoadingScreen />;
  if (merchant === undefined) return <LoadingScreen />;
  if (!merchant) return <MerchantCodeScreen onConfirmed={async (selectedMerchant) => {
    await saveMerchant(selectedMerchant);
    setMerchant(selectedMerchant);
  }} />;
  if (!signedIn) return <AuthScreen merchant={merchant} onChangeShop={async () => {
    await clearMerchant();
    setMerchant(null);
  }} onLogin={async (token) => {
    await saveSession(token);
    await load();
  }} />;

  const customer = portal?.customer || portal?.profile || {};
  async function chooseProfilePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo permission needed', 'Allow photo access to choose an optional profile picture.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .7 });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    await SecureStore.setItemAsync('salama_customer_profile_photo', uri);
    setProfilePhoto(uri);
  }
  return (
    <SafeAreaView style={styles.app}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND} />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>SALAMA LOCK</Text>
          <Text style={styles.merchantName}>{merchant.appName || merchant.username}</Text>
          <Text style={styles.greeting}>Hi, {text(customer.fullName || customer.full_name, 'Customer').split(' ')[0]}</Text>
        </View>
        <Pressable style={styles.avatar} onPress={() => setTab('profile')}>
          {profilePhoto ? <Image source={{ uri: profilePhoto }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{text(customer.fullName || customer.full_name, 'C').charAt(0)}</Text>}
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={BRAND} onRefresh={() => {
            setRefreshing(true);
            load(true);
          }} />}
        >
          {tab === 'home' && <Home portal={portal} navigate={setTab} />}
          {tab === 'pay' && <Pay portal={portal} onPaid={() => load(true)} />}
          {tab === 'history' && <History portal={portal} />}
          {tab === 'alerts' && <Alerts portal={portal} />}
          {tab === 'profile' && <Profile portal={portal} profilePhoto={profilePhoto} onChoosePhoto={chooseProfilePhoto} onRemovePhoto={async () => {
            await SecureStore.deleteItemAsync('salama_customer_profile_photo');
            setProfilePhoto('');
          }} onLogout={async () => {
            await clearSession();
            setPortal(null);
            setSignedIn(false);
          }} />}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.tabBar}>
        {tabs.map(([key, icon, label]) => (
          <Pressable key={key} style={styles.tab} onPress={() => setTab(key)}>
            <Text style={[styles.tabIcon, tab === key && styles.tabActive]}>{icon}</Text>
            <Text style={[styles.tabLabel, tab === key && styles.tabActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <LogoMark light />
      <ActivityIndicator color={ACCENT} size="large" />
      <Text style={styles.loadingText}>Securing your account…</Text>
    </View>
  );
}

function MerchantCodeScreen({ onConfirmed }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const selected = await resolveMerchantCode(code);
      await onConfirmed(selected);
    } catch (error) {
      Alert.alert('Shop code not recognised', error.message);
    } finally {
      setBusy(false);
    }
  };
  return <SafeAreaView style={styles.enrollment}>
    <StatusBar barStyle="light-content" backgroundColor={BRAND} />
    <View style={styles.enrollmentHero}><LogoMark light /><Text style={styles.enrollmentTitle}>Connect to your shop.</Text><Text style={styles.enrollmentCopy}>Enter the code your agent gave you during onboarding. You only need to do this once.</Text></View>
    <View style={styles.enrollmentCard}>
      <Text style={styles.sheetTitle}>Shop onboarding code</Text>
      <Field label="Merchant code" value={code} onChangeText={(value) => setCode(value.toUpperCase().replace(/\s/g, ''))} autoCapitalize="characters" placeholder="SL-MERCHANT-0000" />
      <PrimaryButton label={busy ? 'Checking code…' : 'Continue to sign in'} onPress={submit} disabled={busy || !code.trim()} />
      <Text style={styles.enrollmentHelp}>Ask the agent onboarding you if you do not have this code.</Text>
    </View>
  </SafeAreaView>;
}

function AuthScreen({ merchant, onChangeShop, onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (mode === 'login') {
        const result = await api.post('/api/customer/auth/login', { email: email.trim(), password });
        await onLogin(result.token);
      } else if (mode === 'activate') {
        if (!otp) {
          await api.post('/api/customer/auth/activation-otp', { phone });
          Alert.alert('Code sent', 'Enter the SMS activation code to continue.');
        } else {
          const result = await api.post('/api/customer/auth/activate', { otp, email: email.trim(), password });
          if (result.token) await onLogin(result.token);
          else Alert.alert('Account activated', 'You can now sign in.');
        }
      } else {
        await api.post('/api/customer/password-reset-requests', { email: email.trim(), sourcePortal: 'customer' });
        Alert.alert('Reset code sent', 'Check your phone or email for reset instructions.');
        setMode('login');
      }
    } catch (error) {
      Alert.alert('Please check your details', error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.auth} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND} />
      <ScrollView
        style={styles.authScroll}
        contentContainerStyle={styles.authScrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.authHero}>
          <LogoMark light />
          <Text style={styles.authTitle}>Your device.{'\n'}Your payments.{'\n'}Your control.</Text>
          <Text style={styles.authCopy}>Secure access to your Salama Lock PAYGO account.</Text>
        </View>
        <View style={styles.authSheet}>
          <View style={styles.connectedMerchant}><View><Text style={styles.connectedLabel}>CONNECTED SHOP</Text><Text style={styles.connectedName}>{merchant?.appName || merchant?.username}</Text></View><Pressable onPress={onChangeShop}><Text style={styles.changeShop}>Change</Text></Pressable></View>
          <Text style={styles.sheetTitle}>{mode === 'login' ? 'Welcome back' : mode === 'activate' ? 'Activate account' : 'Reset password'}</Text>
          <Text style={styles.sheetCopy}>{mode === 'login' ? 'Sign in to manage your device.' : 'We will verify your registered details.'}</Text>
          {mode === 'login' && <View style={styles.demoBox}><Text style={styles.demoTitle}>DEMO LOGIN</Text><Text style={styles.demoText}>customer@salama.demo</Text><Text style={styles.demoText}>Password: Demo123!</Text></View>}
          {mode === 'activate' && <Field label="Registered phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XX XXX XXX" />}
          <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
          {mode !== 'reset' && <PasswordField label="Password" value={password} onChangeText={setPassword} visible={showPassword} onToggle={() => setShowPassword((current) => !current)} placeholder="Your secure password" />}
          {mode === 'activate' && <Field label="SMS code" value={otp} onChangeText={setOtp} keyboardType="number-pad" placeholder="6-digit code" />}
          <PrimaryButton label={busy ? 'Please wait…' : mode === 'login' ? 'Sign in securely' : mode === 'activate' ? (otp ? 'Activate my account' : 'Send activation code') : 'Send reset code'} onPress={submit} disabled={busy} />
          <View style={styles.authLinks}>
            <Pressable onPress={() => setMode(mode === 'login' ? 'activate' : 'login')}><Text style={styles.link}>{mode === 'login' ? 'Activate account' : 'Back to sign in'}</Text></Pressable>
            {mode === 'login' && <Pressable onPress={() => setMode('reset')}><Text style={styles.link}>Forgot password?</Text></Pressable>}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Home({ portal, navigate }) {
  const account = portal?.account || {};
  const device = portal?.device || portal?.product || {};
  const progress = Math.max(0, Math.min(100, Number(account.paymentProgress || account.payment_progress || 0)));
  return (
    <>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>REMAINING BALANCE</Text>
        <Text style={styles.balance}>{money(account.balance || account.remainingBalance)}</Text>
        <View style={styles.progressTrack}><View style={[styles.progress, { width: `${progress}%` }]} /></View>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceMeta}>{progress.toFixed(0)}% paid</Text>
          <Text style={styles.balanceMeta}>Daily {money(account.dailyInstallment || account.daily_installment)}</Text>
        </View>
        <PrimaryButton label="Make a payment" onPress={() => navigate('pay')} light />
      </View>
      <Text style={styles.sectionTitle}>Today</Text>
      <View style={styles.quickGrid}>
        <QuickCard icon="▣" label="Next payment" value={text(account.nextPaymentDate || account.next_payment_date, 'View plan')} />
        <QuickCard icon="✓" label="Account status" value={text(account.status, 'Active')} />
      </View>
      <Text style={styles.sectionTitle}>My device</Text>
      <View style={styles.deviceCard}>
        <View style={styles.deviceIcon}><Text style={styles.deviceIconText}>▯</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.deviceName}>{text(device.model || device.productModel, 'Salama Lock device')}</Text>
          <Text style={styles.muted}>IMEI / Serial {text(device.imei || device.serialNumber, 'Pending')}</Text>
        </View>
        <View style={styles.activePill}><Text style={styles.activeText}>{text(device.status, 'ACTIVE').toUpperCase()}</Text></View>
      </View>
      <View style={styles.notice}><Text style={styles.noticeIcon}>♢</Text><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>Keep your device active</Text><Text style={styles.noticeText}>Pay on time to enjoy uninterrupted access and build your payment history.</Text></View></View>
    </>
  );
}

function Pay({ portal, onPaid }) {
  const account = portal?.account || {};
  const customer = portal?.customer || portal?.profile || {};
  const [amount, setAmount] = useState(String(account.dailyInstallment || account.daily_installment || ''));
  const [phone, setPhone] = useState(String(customer.phone || ''));
  const [busy, setBusy] = useState(false);
  async function pay() {
    setBusy(true);
    try {
      await api.post('/api/customer/payment-requests', {
        amount: Number(amount),
        phone,
        accountReference: customer.nationalId || customer.national_id
      });
      Alert.alert('Check your phone', 'Enter your M-PESA PIN to complete the payment.');
      onPaid();
    } catch (error) {
      Alert.alert('Payment not started', error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ScreenHeading title="Make payment" subtitle="Pay securely through M-PESA" />
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Quick amount</Text>
        <View style={styles.chips}>
          {[account.dailyInstallment, 500, 1000].filter(Boolean).map((value) => <Pressable key={value} style={styles.chip} onPress={() => setAmount(String(value))}><Text style={styles.chipText}>{money(value)}</Text></Pressable>)}
        </View>
        <Field label="Amount (KES)" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="For example, 500" />
        <Field label="M-PESA phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XX XXX XXX" />
        <PrimaryButton label={busy ? 'Starting payment…' : 'Pay with M-PESA'} onPress={pay} disabled={busy || !amount || !phone} />
        <Text style={styles.secureNote}>🔒 Payment is authorized on your phone. We never see your M-PESA PIN.</Text>
      </View>
      <View style={styles.paybillCard}><Text style={styles.paybillTitle}>Prefer Paybill?</Text><Text style={styles.paybillText}>Business No. 4050421</Text><Text style={styles.paybillText}>Account: {text(customer.nationalId || customer.national_id)}</Text></View>
    </>
  );
}

function History({ portal }) {
  const payments = portal?.payments || [];
  return (
    <>
      <ScreenHeading title="Payment history" subtitle={`${payments.length} account transactions`} />
      {payments.length ? payments.map((payment, index) => (
        <View style={styles.listRow} key={payment.id || index}>
          <View style={styles.successIcon}><Text style={styles.successIconText}>✓</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{text(payment.provider || payment.method, 'M-PESA payment')}</Text><Text style={styles.muted}>{text(payment.paidAt || payment.createdAt || payment.date)}</Text></View>
          <View style={{ alignItems: 'flex-end' }}><Text style={styles.rowAmount}>+{money(payment.amount)}</Text><Text style={styles.successText}>{text(payment.status, 'Paid')}</Text></View>
        </View>
      )) : <Empty icon="↻" title="No payments yet" copy="Your completed payments will appear here." />}
    </>
  );
}

function Alerts({ portal }) {
  const alerts = portal?.notifications || portal?.alerts || [];
  return (
    <>
      <ScreenHeading title="Notifications" subtitle="Important account updates" />
      {alerts.length ? alerts.map((item, index) => (
        <View style={styles.alertRow} key={item.id || index}><View style={styles.alertDot} /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{text(item.title, 'Account update')}</Text><Text style={styles.noticeText}>{text(item.message || item.body)}</Text><Text style={styles.muted}>{text(item.createdAt || item.date, '')}</Text></View></View>
      )) : <Empty icon="♢" title="You’re all caught up" copy="New payment and account updates will appear here." />}
    </>
  );
}

function Profile({ portal, onLogout, profilePhoto, onChoosePhoto, onRemovePhoto }) {
  const customer = portal?.customer || portal?.profile || {};
  return (
    <>
      <ScreenHeading title="My account" subtitle="Personal and account information" />
      <View style={styles.profileHero}>
        <Pressable style={styles.largeAvatar} onPress={onChoosePhoto}>{profilePhoto ? <Image source={{ uri: profilePhoto }} style={styles.largeAvatarImage} /> : <Text style={styles.largeAvatarText}>{text(customer.fullName || customer.full_name, 'C').charAt(0)}</Text>}<View style={styles.photoBadge}><Text style={styles.photoBadgeText}>+</Text></View></Pressable>
        <Text style={styles.profileName}>{text(customer.fullName || customer.full_name, 'Customer')}</Text><Text style={styles.muted}>{text(customer.phone)}</Text>
        <View style={styles.photoActions}><Pressable onPress={onChoosePhoto}><Text style={styles.photoActionText}>{profilePhoto ? 'Change photo' : 'Add profile photo'}</Text></Pressable>{profilePhoto ? <Pressable onPress={onRemovePhoto}><Text style={styles.removePhotoText}>Remove</Text></Pressable> : null}</View>
      </View>
      <View style={styles.card}>
        <Detail label="Email" value={customer.email} />
        <Detail label="National ID" value={customer.nationalId || customer.national_id} />
        <Detail label="Account number" value={customer.accountReference || customer.nationalId || customer.national_id} />
        <Detail label="Region" value={customer.region} last />
      </View>
      <Pressable style={styles.logout} onPress={onLogout}><Text style={styles.logoutText}>Sign out of this device</Text></Pressable>
      <Text style={styles.version}>Salama Lock Customer • Version 1.0.0</Text>
    </>
  );
}

function Field(props) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{props.label}</Text><TextInput style={styles.input} placeholderTextColor="#84928D" {...props} /></View>;
}
function PasswordField({ label, visible, onToggle, ...props }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.passwordWrap}><TextInput style={styles.passwordInput} placeholderTextColor="#84928D" secureTextEntry={!visible} autoCapitalize="none" {...props} /><Pressable onPress={onToggle} hitSlop={10} style={styles.eyeButton}><Text style={styles.eyeText}>{visible ? 'HIDE' : 'SHOW'}</Text></Pressable></View></View>;
}
function PrimaryButton({ label, onPress, disabled, light }) {
  return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, light && styles.buttonLight, (pressed || disabled) && { opacity: .72 }]}><Text style={[styles.buttonText, light && { color: BRAND }]}>{label}</Text></Pressable>;
}
function ScreenHeading({ title, subtitle }) {
  return <View style={styles.heading}><Text style={styles.pageTitle}>{title}</Text><Text style={styles.pageSubtitle}>{subtitle}</Text></View>;
}
function QuickCard({ icon, label, value }) {
  return <View style={styles.quickCard}><Text style={styles.quickIcon}>{icon}</Text><Text style={styles.muted}>{label}</Text><Text style={styles.quickValue}>{value}</Text></View>;
}
function Detail({ label, value, last }) {
  return <View style={[styles.detail, last && { borderBottomWidth: 0 }]}><Text style={styles.muted}>{label}</Text><Text style={styles.detailValue}>{text(value)}</Text></View>;
}
function Empty({ icon, title, copy }) {
  return <View style={styles.empty}><Text style={styles.emptyIcon}>{icon}</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyCopy}>{copy}</Text></View>;
}
function LogoMark({ light }) {
  return <View style={styles.logoWrap}><View style={[styles.logoShield, light && styles.logoShieldLight]}><Text style={[styles.logoLock, light && styles.logoLockLight]}>▣</Text></View><View><Text style={[styles.logoName, light && styles.logoNameLight]}><Text style={styles.logoGreen}>SALAMA</Text>LOCK</Text><Text style={[styles.logoTagline, light && styles.logoTaglineLight]}>SECURE • PAYGO • MOBILE</Text></View></View>;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#F4F7F5', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  loading: { flex: 1, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', gap: 22 },
  loadingText: { color: '#D8E8E2', fontSize: 14 },
  topBar: { backgroundColor: BRAND, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#B9D6CB', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  merchantName: { color: '#7EE3B2', fontSize: 11, fontWeight: '900', marginTop: 3 },
  greeting: { color: 'white', fontSize: 22, fontWeight: '800', marginTop: 3 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#1E6A56', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#4A8A79' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 21 },
  avatarText: { color: 'white', fontWeight: '800', fontSize: 17 },
  content: { flex: 1 },
  keyboardArea: { flex: 1 },
  contentInner: { padding: 18, paddingBottom: 35 },
  tabBar: { height: 70, backgroundColor: 'white', flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E3EAE6', paddingHorizontal: 4, elevation: 14 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabIcon: { fontSize: 22, color: '#83918C' },
  tabLabel: { fontSize: 10, color: '#83918C', fontWeight: '700' },
  tabActive: { color: BRAND },
  balanceCard: { backgroundColor: BRAND, borderRadius: 24, padding: 22, elevation: 8, shadowColor: BRAND, shadowOpacity: .2, shadowRadius: 12 },
  balanceLabel: { color: '#B9D6CB', fontSize: 11, letterSpacing: 1.4, fontWeight: '800' },
  balance: { color: 'white', fontSize: 31, fontWeight: '900', marginTop: 7, marginBottom: 18 },
  progressTrack: { height: 7, backgroundColor: '#286D5B', borderRadius: 5, overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: ACCENT, borderRadius: 5 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 18 },
  balanceMeta: { color: '#D8E8E2', fontSize: 11, fontWeight: '600' },
  sectionTitle: { color: '#132A22', fontSize: 17, fontWeight: '800', marginTop: 24, marginBottom: 11 },
  quickGrid: { flexDirection: 'row', gap: 11 },
  quickCard: { flex: 1, backgroundColor: 'white', borderRadius: 17, padding: 16, minHeight: 125, elevation: 2 },
  quickIcon: { color: BRAND, fontSize: 24, marginBottom: 12 },
  quickValue: { color: '#132A22', fontSize: 14, fontWeight: '800', marginTop: 5 },
  deviceCard: { backgroundColor: 'white', borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceIcon: { width: 47, height: 47, borderRadius: 14, backgroundColor: '#E7F1ED', alignItems: 'center', justifyContent: 'center' },
  deviceIconText: { fontSize: 26, color: BRAND },
  deviceName: { color: '#132A22', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  activePill: { backgroundColor: '#E5F6EE', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12 },
  activeText: { color: '#118251', fontSize: 9, fontWeight: '900' },
  notice: { flexDirection: 'row', gap: 12, backgroundColor: '#FFF7E7', padding: 16, borderRadius: 17, marginTop: 14 },
  noticeIcon: { fontSize: 24, color: '#B97800' },
  noticeTitle: { color: '#5E4109', fontWeight: '800', marginBottom: 3 },
  noticeText: { color: '#617069', fontSize: 12, lineHeight: 18 },
  auth: { flex: 1, backgroundColor: BRAND },
  enrollment: { flex: 1, backgroundColor: BRAND, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  enrollmentHero: { flex: 1, paddingHorizontal: 28, paddingTop: 52, justifyContent: 'center' },
  enrollmentTitle: { color: 'white', fontSize: 36, lineHeight: 42, fontWeight: '900', letterSpacing: -.8 },
  enrollmentCopy: { color: '#C7DED6', fontSize: 15, lineHeight: 22, marginTop: 13, maxWidth: 360 },
  enrollmentCard: { backgroundColor: '#F9FBFA', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 27, paddingBottom: 38 },
  enrollmentHelp: { color: '#697771', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 15 },
  authScroll: { flex: 1 },
  authScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  authHero: { flex: .72, paddingHorizontal: 28, paddingTop: Platform.OS === 'android' ? 60 : 42, justifyContent: 'center' },
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 24 },
  logoShield: { width: 48, height: 54, borderWidth: 3, borderColor: '#172119', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, alignItems: 'center', justifyContent: 'center' },
  logoShieldLight: { borderColor: 'white' },
  logoLock: { color: '#5FBF45', fontSize: 25 },
  logoLockLight: { color: ACCENT },
  logoName: { color: '#172119', fontSize: 19, fontWeight: '900', letterSpacing: 1 },
  logoNameLight: { color: 'white' },
  logoGreen: { color: '#5FBF45' },
  logoTagline: { color: '#66746E', fontSize: 7, fontWeight: '800', letterSpacing: 1.2, marginTop: 2 },
  logoTaglineLight: { color: '#C7DED6' },
  authTitle: { color: 'white', fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -.7 },
  authCopy: { color: '#C7DED6', fontSize: 14, marginTop: 13, lineHeight: 21 },
  authSheet: { backgroundColor: '#F9FBFA', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 27, paddingBottom: 35 },
  connectedMerchant: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#E7F4ED', borderLeftWidth: 4, borderLeftColor: '#2EDB75', borderRadius: 10, padding: 11, marginBottom: 16 },
  connectedLabel: { color: '#527066', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  connectedName: { color: BRAND, fontSize: 14, fontWeight: '900', marginTop: 3 },
  changeShop: { color: BRAND, fontSize: 11, fontWeight: '900' },
  sheetTitle: { color: '#132A22', fontSize: 24, fontWeight: '900' },
  sheetCopy: { color: '#697771', marginTop: 5, marginBottom: 17 },
  field: { marginBottom: 14 },
  fieldLabel: { color: '#344A42', fontWeight: '700', fontSize: 12, marginBottom: 7 },
  input: { height: 52, borderRadius: 14, backgroundColor: 'white', borderWidth: 1, borderColor: '#DCE5E1', paddingHorizontal: 15, color: '#132A22', fontSize: 15 },
  passwordWrap: { height: 52, borderRadius: 14, backgroundColor: 'white', borderWidth: 1, borderColor: '#DCE5E1', flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, height: '100%', paddingLeft: 15, color: '#132A22', fontSize: 15 },
  eyeButton: { height: '100%', justifyContent: 'center', paddingHorizontal: 13 },
  eyeText: { color: BRAND, fontSize: 9, fontWeight: '900', letterSpacing: .5 },
  demoBox: { backgroundColor: '#E8F2EE', borderRadius: 12, padding: 11, marginBottom: 14 },
  demoTitle: { color: BRAND, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginBottom: 4 },
  demoText: { color: '#355A4C', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  button: { height: 54, backgroundColor: BRAND, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  buttonLight: { backgroundColor: 'white' },
  buttonText: { color: 'white', fontWeight: '900', fontSize: 15 },
  authLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 19 },
  link: { color: BRAND, fontSize: 12, fontWeight: '800' },
  heading: { marginBottom: 18 },
  pageTitle: { color: '#132A22', fontSize: 26, fontWeight: '900' },
  pageSubtitle: { color: '#718079', marginTop: 4 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 18, marginBottom: 14 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  chip: { backgroundColor: '#E8F2EE', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  chipText: { color: BRAND, fontWeight: '800', fontSize: 11 },
  secureNote: { color: '#718079', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 14 },
  paybillCard: { borderRadius: 18, padding: 18, backgroundColor: '#FFF7E7' },
  paybillTitle: { color: '#513807', fontWeight: '900', marginBottom: 7 },
  paybillText: { color: '#76591F', marginTop: 2 },
  listRow: { backgroundColor: 'white', borderRadius: 17, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  successIcon: { width: 39, height: 39, borderRadius: 20, backgroundColor: '#E5F6EE', alignItems: 'center', justifyContent: 'center' },
  successIconText: { color: '#118251', fontWeight: '900' },
  rowTitle: { color: '#1A3028', fontWeight: '800', marginBottom: 4 },
  rowAmount: { color: '#132A22', fontWeight: '900' },
  successText: { color: '#118251', fontSize: 10, fontWeight: '800', marginTop: 3 },
  muted: { color: '#78867F', fontSize: 11 },
  alertRow: { backgroundColor: 'white', borderRadius: 17, padding: 16, flexDirection: 'row', gap: 12, marginBottom: 10 },
  alertDot: { width: 9, height: 9, backgroundColor: ACCENT, borderRadius: 5, marginTop: 5 },
  empty: { paddingVertical: 70, alignItems: 'center' },
  emptyIcon: { fontSize: 46, color: '#9AABA4' },
  emptyTitle: { color: '#1A3028', fontWeight: '900', fontSize: 18, marginTop: 15 },
  emptyCopy: { color: '#77857F', fontSize: 13, marginTop: 7, textAlign: 'center' },
  profileHero: { alignItems: 'center', marginBottom: 22 },
  largeAvatar: { width: 82, height: 82, backgroundColor: BRAND, borderRadius: 41, alignItems: 'center', justifyContent: 'center' },
  largeAvatarImage: { width: '100%', height: '100%', borderRadius: 41 },
  largeAvatarText: { color: 'white', fontSize: 30, fontWeight: '900' },
  photoBadge: { position: 'absolute', right: -2, bottom: 1, width: 25, height: 25, borderRadius: 13, backgroundColor: ACCENT, borderWidth: 3, borderColor: '#F4F7F5', alignItems: 'center', justifyContent: 'center' },
  photoBadgeText: { color: BRAND, fontSize: 16, lineHeight: 18, fontWeight: '900' },
  photoActions: { flexDirection: 'row', gap: 18, marginTop: 9 },
  photoActionText: { color: BRAND, fontSize: 11, fontWeight: '900' },
  removePhotoText: { color: '#A42E2E', fontSize: 11, fontWeight: '800' },
  profileName: { color: '#132A22', fontSize: 20, fontWeight: '900', marginTop: 10, marginBottom: 3 },
  detail: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EDF1EF', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  detailValue: { flex: 1, textAlign: 'right', color: '#263B33', fontWeight: '700', fontSize: 12 },
  logout: { height: 52, borderWidth: 1, borderColor: '#E4B5B5', borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: '#A42E2E', fontWeight: '800' },
  version: { textAlign: 'center', color: '#95A29D', fontSize: 10, marginTop: 20 }
});
