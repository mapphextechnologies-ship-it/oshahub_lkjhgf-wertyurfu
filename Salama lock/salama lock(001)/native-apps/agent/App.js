import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, Image, KeyboardAvoidingView, Platform, Pressable,
  RefreshControl, SafeAreaView, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, View
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { api, clearSession, hasSession, saveSession } from './src/api';

const NAVY = '#102A43';
const BLUE = '#1565D8';
const GOLD = '#F6B73C';
const tabs = [
  ['home', '⌂', 'Home'], ['stock', '▦', 'Stock'], ['add', '+', 'Register'],
  ['customers', '◎', 'Customers'], ['more', '•••', 'More']
];
const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const value = (input, fallback = 'Not set') => String(input || fallback);
const isOverdue = (customer) => {
  const status = String(customer?.status || '').toLowerCase();
  return status === 'overdue' || Number(customer?.daysOverdue || customer?.days_overdue || 0) > 0;
};
const overdueCustomersFor = (portal) => (portal?.customers || []).filter(isOverdue);
const notificationsFor = (portal) => [
  ...overdueCustomersFor(portal).map((customer) => ({
    id: `overdue-${customer.id}`,
    type: 'overdue',
    customer,
    title: `${value(customer.fullName || customer.full_name, 'Customer')} is overdue`,
    message: `${Number(customer.daysOverdue || customer.days_overdue || 1)} day(s) late • ${money(customer.overdueAmount || customer.overdue_amount || customer.dailyInstallment)} due`
  })),
  ...(portal?.notifications || [])
];

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portal, setPortal] = useState(null);
  const [tabHistory, setTabHistory] = useState(['home']);
  const [profilePhoto, setProfilePhoto] = useState('');
  const tab = tabHistory[tabHistory.length - 1];

  const navigateTo = useCallback((nextTab) => {
    setTabHistory((history) => history[history.length - 1] === nextTab ? history : [...history, nextTab]);
  }, []);
  const goBack = useCallback(() => {
    setTabHistory((history) => history.length > 1 ? history.slice(0, -1) : history);
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await api.get('/api/agent/portal');
      setPortal(result.portal);
      setSignedIn(true);
    } catch (error) {
      if (error.status === 401) {
        await clearSession();
        setSignedIn(false);
      } else if (!quiet) Alert.alert('Workspace unavailable', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    hasSession().then((active) => active ? load() : setLoading(false));
    SecureStore.getItemAsync('salama_agent_profile_photo').then((uri) => setProfilePhoto(uri || ''));
  }, [load]);
  useEffect(() => {
    if (!signedIn || tab === 'home' || tab === 'add' || tab === 'more') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [signedIn, tab, goBack]);
  if (loading) return <Loading />;
  if (!signedIn) return <Login onLogin={async (token) => { await saveSession(token); await load(); }} />;

  const agent = portal?.agent || portal?.profile || {};
  async function chooseProfilePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo permission needed', 'Allow photo access to choose an optional profile picture.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .7 });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    await SecureStore.setItemAsync('salama_agent_profile_photo', uri);
    setProfilePhoto(uri);
  }
  return (
    <SafeAreaView style={styles.app}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View style={styles.header}>
        <View><Text style={styles.brand}>SALAMA LOCK FIELD</Text><Text style={styles.hello}>Hello, {value(agent.fullName || agent.full_name, 'Agent').split(' ')[0]}</Text></View>
        <Pressable style={styles.avatar} onPress={() => navigateTo('more')}>{profilePhoto ? <Image source={{ uri: profilePhoto }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{value(agent.fullName || agent.full_name, 'A')[0]}</Text>}</Pressable>
      </View>
      <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollBody}
          scrollEnabled
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          refreshControl={<RefreshControl refreshing={refreshing} colors={[BLUE]} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          {tab === 'home' && <Dashboard portal={portal} navigate={navigateTo} />}
          {tab === 'stock' && <Inventory portal={portal} />}
          {tab === 'add' && <Register portal={portal} onBack={goBack} done={() => { load(true); navigateTo('customers'); }} />}
          {tab === 'customers' && <Customers portal={portal} reload={() => load(true)} />}
          {tab === 'more' && <More portal={portal} onBack={goBack} profilePhoto={profilePhoto} onChoosePhoto={chooseProfilePhoto} onRemovePhoto={async () => {
            await SecureStore.deleteItemAsync('salama_agent_profile_photo');
            setProfilePhoto('');
          }} reload={() => load(true)} logout={async () => { await clearSession(); setTabHistory(['home']); setSignedIn(false); setPortal(null); }} />}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.tabBar}>
        {tabs.map(([key, icon, label]) => (
          <Pressable key={key} onPress={() => navigateTo(key)} android_ripple={{ color: '#DCE9F8', borderless: true }} style={[styles.tab, key === 'add' && styles.addTab]}>
            <Text style={[styles.tabIcon, tab === key && styles.active, key === 'add' && styles.addIcon]}>{icon}</Text>
            <Text style={[styles.tabLabel, tab === key && styles.active]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function Loading() {
  return <View style={styles.loading}><LogoMark light /><ActivityIndicator size="large" color={GOLD} /><Text style={styles.loadingCopy}>Preparing your field workspace…</Text></View>;
}

function Login({ onLogin }) {
  const [registering, setRegistering] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', fullName: '', phone: '', nationalId: '', region: '' });
  const update = (key) => (text) => setForm((current) => ({ ...current, [key]: text }));
  async function submit() {
    setBusy(true);
    try {
      if (resetting) {
        await api.post('/api/agent/password-reset-requests', { email: form.email.trim(), sourcePortal: 'agent' });
        Alert.alert('Reset instructions sent', 'Check your registered phone or email for the password reset code.');
        setResetting(false);
      } else if (registering) {
        await api.post('/api/agent/auth/register', form);
        Alert.alert('Application received', 'Your agent account is awaiting approval. Sign in after approval.');
        setRegistering(false);
      } else {
        const result = await api.post('/api/agent/auth/login', { email: form.email.trim(), password: form.password });
        await onLogin(result.token);
      }
    } catch (error) { Alert.alert('Unable to continue', error.message); } finally { setBusy(false); }
  }
  return (
    <KeyboardAvoidingView style={styles.auth} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <ScrollView
        style={styles.authScroll}
        contentContainerStyle={styles.authBody}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <LogoMark light />
        <Text style={styles.authKicker}>SALAMA LOCK AGENT</Text>
        <Text style={styles.authTitle}>Your field office,{'\n'}in your pocket.</Text>
        <Text style={styles.authSub}>Register customers, manage stock and track earnings wherever you work.</Text>
        <View style={styles.loginCard}>
          <Text style={styles.cardTitle}>{resetting ? 'Reset password' : registering ? 'Become an agent' : 'Sign in to workspace'}</Text>
          {!registering && !resetting && <View style={styles.demoBox}><Text style={styles.demoTitle}>DEMO LOGIN</Text><Text style={styles.demoText}>agent@salama.demo</Text><Text style={styles.demoText}>Password: Demo123!</Text></View>}
          {registering && <>
            <Field label="Full name" value={form.fullName} onChangeText={update('fullName')} placeholder="For example, Jane Wanjiku" />
            <View style={styles.two}><Field compact label="Phone" value={form.phone} onChangeText={update('phone')} keyboardType="phone-pad" placeholder="07XX XXX XXX" /><Field compact label="National ID" value={form.nationalId} onChangeText={update('nationalId')} keyboardType="number-pad" placeholder="ID number" /></View>
            <Field label="Region / territory" value={form.region} onChangeText={update('region')} placeholder="For example, Nairobi East" />
          </>}
          <Field label="Email address" value={form.email} onChangeText={update('email')} keyboardType="email-address" autoCapitalize="none" placeholder="agent@example.com" />
          {!resetting && <PasswordField label="Password" value={form.password} onChangeText={update('password')} visible={showPassword} onToggle={() => setShowPassword((current) => !current)} placeholder="Enter your secure password" />}
          <Button label={busy ? 'Please wait…' : resetting ? 'Send reset instructions' : registering ? 'Submit agent application' : 'Sign in securely'} onPress={submit} disabled={busy} />
          {!resetting && <Pressable onPress={() => { setRegistering(!registering); setResetting(false); }}><Text style={styles.switchText}>{registering ? 'Already approved? Sign in' : 'New field agent? Apply here'}</Text></Pressable>}
          {!registering && <Pressable onPress={() => setResetting(!resetting)}><Text style={styles.forgotText}>{resetting ? 'Back to sign in' : 'Forgot password?'}</Text></Pressable>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Dashboard({ portal, navigate }) {
  const inventory = portal?.inventory || [];
  const customers = portal?.customers || [];
  const tasks = portal?.tasks || [];
  const commissions = portal?.commissions || [];
  const overdue = overdueCustomersFor(portal);
  const earned = commissions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return (
    <>
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>THIS MONTH’S EARNINGS</Text><Text style={styles.heroMoney}>{money(earned)}</Text>
        <View style={styles.heroStats}><View><Text style={styles.heroStat}>{customers.length}</Text><Text style={styles.heroMeta}>Customers</Text></View><View style={styles.heroDivider} /><View><Text style={styles.heroStat}>{inventory.length}</Text><Text style={styles.heroMeta}>Devices</Text></View><View style={styles.heroDivider} /><View><Text style={styles.heroStat}>{tasks.filter((task) => !task.completed).length}</Text><Text style={styles.heroMeta}>Tasks</Text></View></View>
      </View>
      {overdue.length > 0 && <Pressable style={({ pressed }) => [styles.overdueSummary, pressed && styles.pressedCard]} onPress={() => navigate('customers')}>
        <View style={styles.overdueSummaryIcon}><Text style={styles.overdueSummaryGlyph}>!</Text></View>
        <View style={{ flex: 1 }}><Text style={styles.overdueSummaryTitle}>{overdue.length} overdue customer{overdue.length === 1 ? '' : 's'}</Text><Text style={styles.overdueSummaryCopy}>Payment follow-up required. Tap to view accounts.</Text></View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>}
      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.actionGrid}>
        <Action icon="+" title="New customer" copy="Start onboarding" onPress={() => navigate('add')} primary />
        <Action icon="▦" title="Check stock" copy={`${inventory.length} assigned`} onPress={() => navigate('stock')} />
        <Action icon="◎" title="Customers" copy="Follow up accounts" onPress={() => navigate('customers')} />
        <Action icon="✓" title="My tasks" copy={`${tasks.length} total`} onPress={() => navigate('more')} />
      </View>
      <Text style={styles.sectionTitle}>Today’s focus</Text>
      {(tasks.filter((task) => !task.completed).slice(0, 3)).map((task, index) => <View key={task.id || index} style={styles.focusRow}><View style={styles.focusLine} /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{value(task.title, 'Follow-up task')}</Text><Text style={styles.muted}>{value(task.note, 'Tap More to manage tasks')}</Text></View><Text style={styles.chevron}>›</Text></View>)}
      {!tasks.length && <Empty title="No tasks for today" copy="Your follow-ups will show here." />}
    </>
  );
}

function Inventory({ portal }) {
  const [query, setQuery] = useState('');
  const stock = (portal?.inventory || []).filter((item) => `${item.productModel || ''} ${item.imei || ''} ${item.serialNumber || ''}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <Heading title="My stock" subtitle={`${stock.length} devices in your custody`} />
      <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Search model, IMEI or serial" placeholderTextColor="#8190A0" />
      {stock.map((item, index) => (
        <Pressable
          style={({ pressed }) => [styles.stockCard, pressed && styles.pressedCard]}
          key={item.id || index}
          android_ripple={{ color: '#E4EFFB' }}
          onPress={() => Alert.alert(
            value(item.productModel || item.model, 'PAYGO device'),
            `IMEI: ${value(item.imei || item.serialNumber)}\nPrice: ${money(item.totalPayable || item.price)}\nStatus: ${item.customerId ? 'Assigned' : 'Ready for customer'}`
          )}
        >
          <View style={styles.phoneIcon}><Text style={styles.phoneIconText}>▯</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{value(item.productModel || item.model, 'PAYGO device')}</Text><Text style={styles.muted}>IMEI {value(item.imei || item.serialNumber, 'Pending')}</Text><Text style={styles.stockPrice}>{money(item.totalPayable || item.price)}</Text></View>
          <View style={[styles.pill, item.customerId && styles.pillAssigned]}><Text style={[styles.pillText, item.customerId && styles.pillAssignedText]}>{item.customerId ? 'ASSIGNED' : 'READY'}</Text></View>
        </Pressable>
      ))}
      {!stock.length && <Empty title="No matching stock" copy="Pull down to sync inventory from the office." />}
    </>
  );
}

function Register({ portal, done, onBack }) {
  const available = (portal?.inventory || []).filter((item) => !item.customerId);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [customerAccess, setCustomerAccess] = useState(null);
  const [form, setForm] = useState({
    fullName: '', nationalId: '', phone: '', email: '', region: '', productId: '',
    nextOfKinName: '', nextOfKinPhone: '', depositAmount: '', idFront: ''
  });
  const update = (key) => (text) => setForm((current) => ({ ...current, [key]: text }));
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (customerAccess) done();
      else if (step > 1) setStep((current) => current - 1);
      else onBack();
      return true;
    });
    return () => subscription.remove();
  }, [customerAccess, done, step, onBack]);
  async function capture() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('Camera permission needed', 'Allow camera access to capture customer ID documents.');
    const result = await ImagePicker.launchCameraAsync({ quality: .55, base64: true, allowsEditing: true });
    if (!result.canceled) setForm((current) => ({ ...current, idFront: `data:${result.assets[0].mimeType || 'image/jpeg'};base64,${result.assets[0].base64}` }));
  }
  async function submit() {
    setBusy(true);
    try {
      const result = await api.post('/api/agent/customers', form);
      if (form.idFront && result.customer?.id) {
        await api.post('/api/agent/customer-media', { customerId: result.customer.id, field: 'idFront', dataUrl: form.idFront });
      }
      const merchantIdentity = value(
        portal?.merchant?.username ||
        portal?.merchant?.code ||
        portal?.business?.username ||
        portal?.agent?.merchantCode ||
        portal?.agent?.code,
        'SHOP'
      ).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8);
      const code = `SL-${merchantIdentity}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
      setCustomerAccess({
        code,
        customerName: result.customer?.fullName || result.customer?.full_name || form.fullName,
        customerPhone: result.customer?.phone || form.phone,
        expiresAt: Date.now() + (15 * 60 * 1000)
      });
    } catch (error) { Alert.alert('Registration not submitted', error.message); } finally { setBusy(false); }
  }
  if (customerAccess) {
    return <>
      <View style={styles.registrationHeading}>
        <Pressable style={styles.screenBack} onPress={done}><Text style={styles.screenBackText}>‹</Text></Pressable>
        <Heading title="Customer app code" subtitle="Registration submitted successfully" />
      </View>
      <View style={styles.codeSuccessCard}>
        <View style={styles.codeSuccessMark}><Text style={styles.codeSuccessMarkText}>✓</Text></View>
        <Text style={styles.codeSuccessTitle}>Give this code to the customer</Text>
        <Text style={styles.codeSuccessCopy}>The customer installs the Salama Lock Customer app from Google Play and enters this code before signing in.</Text>
        <View style={styles.codeCustomerIdentity}>
          <Text style={styles.codeLabel}>CUSTOMER</Text>
          <Text style={styles.codeCustomerName}>{customerAccess.customerName}</Text>
          <Text style={styles.muted}>{customerAccess.customerPhone}</Text>
        </View>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabelLight}>ONE-TIME ONBOARDING CODE</Text>
          <Text selectable style={styles.codeValue}>{customerAccess.code}</Text>
          <Text style={styles.codeExpiry}>Expires at {new Date(customerAccess.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · One customer · One use</Text>
        </View>
        <Button label="Share code" onPress={() => Share.share({ message: `Your Salama Lock customer onboarding code is ${customerAccess.code}. It expires in 15 minutes and can only be used once.` })} />
        <Pressable style={styles.finishCodeButton} onPress={done}><Text style={styles.finishCodeText}>Finish and view customers</Text></Pressable>
      </View>
    </>;
  }
  return (
    <>
      <View style={styles.registrationHeading}>
        <Pressable style={styles.screenBack} onPress={() => step > 1 ? setStep(step - 1) : onBack()}><Text style={styles.screenBackText}>‹</Text></Pressable>
        <Heading title="Register customer" subtitle={`Step ${step} of 3`} />
      </View>
      <View style={styles.stepTrack}><View style={[styles.stepFill, { width: `${step * 33.33}%` }]} /></View>
      <View style={styles.formCard}>
        {step === 1 && <>
          <Text style={styles.formTitle}>Customer details</Text><Text style={styles.formCopy}>Enter details exactly as they appear on the national ID.</Text>
          <Field label="Full legal name" value={form.fullName} onChangeText={update('fullName')} placeholder="As shown on the national ID" />
          <Field label="National ID" value={form.nationalId} onChangeText={update('nationalId')} keyboardType="number-pad" placeholder="Enter ID number" />
          <Field label="Phone number" value={form.phone} onChangeText={update('phone')} keyboardType="phone-pad" placeholder="07XX XXX XXX" />
          <Field label="Email (optional)" value={form.email} onChangeText={update('email')} keyboardType="email-address" autoCapitalize="none" placeholder="customer@example.com" />
          <Field label="Region" value={form.region} onChangeText={update('region')} placeholder="Customer location" />
          <Pressable style={styles.camera} onPress={capture}><Text style={styles.cameraIcon}>{form.idFront ? '✓' : '▣'}</Text><View><Text style={styles.cameraTitle}>{form.idFront ? 'ID captured' : 'Capture national ID'}</Text><Text style={styles.muted}>Use phone camera • front side</Text></View></Pressable>
        </>}
        {step === 2 && <>
          <Text style={styles.formTitle}>Device & deposit</Text><Text style={styles.formCopy}>Choose one available device for this customer.</Text>
          {available.map((item) => <Pressable key={item.id} onPress={() => update('productId')(item.id)} style={[styles.selectCard, form.productId === item.id && styles.selected]}><View style={styles.radio}>{form.productId === item.id && <View style={styles.radioDot} />}</View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{value(item.productModel || item.model, 'PAYGO device')}</Text><Text style={styles.muted}>{value(item.imei || item.serialNumber)}</Text></View><Text style={styles.stockPrice}>{money(item.totalPayable || item.price)}</Text></Pressable>)}
          {!available.length && <Empty title="No available devices" copy="Ask admin to assign inventory to your account." />}
          <Field label="Deposit amount (KES)" value={form.depositAmount} onChangeText={update('depositAmount')} keyboardType="numeric" placeholder="For example, 2,000" />
        </>}
        {step === 3 && <>
          <Text style={styles.formTitle}>Next of kin</Text><Text style={styles.formCopy}>They will receive an SMS to confirm their relationship.</Text>
          <Field label="Next-of-kin full name" value={form.nextOfKinName} onChangeText={update('nextOfKinName')} placeholder="Full legal name" />
          <Field label="Next-of-kin phone" value={form.nextOfKinPhone} onChangeText={update('nextOfKinPhone')} keyboardType="phone-pad" placeholder="07XX XXX XXX" />
          <View style={styles.review}><Text style={styles.reviewTitle}>Ready to submit</Text><Text style={styles.reviewText}>{value(form.fullName)} • {value(available.find((item) => item.id === form.productId)?.productModel, 'No device selected')}</Text><Text style={styles.reviewText}>Deposit {money(form.depositAmount)}</Text></View>
        </>}
        <View style={styles.formActions}>
          {step > 1 && <Pressable style={styles.backButton} onPress={() => setStep(step - 1)}><Text style={styles.backText}>Back</Text></Pressable>}
          <View style={{ flex: 1 }}><Button label={step < 3 ? 'Continue' : busy ? 'Submitting…' : 'Submit application'} onPress={() => step < 3 ? setStep(step + 1) : submit()} disabled={busy} /></View>
        </View>
      </View>
    </>
  );
}

function Customers({ portal, reload }) {
  const [query, setQuery] = useState('');
  const customers = (portal?.customers || []).filter((item) => `${item.fullName || item.full_name || ''} ${item.phone || ''}`.toLowerCase().includes(query.toLowerCase()));
  async function deposit(customer) {
    try {
      await api.post(`/api/agent/customers/${encodeURIComponent(customer.id)}/deposit-request`, { amount: customer.depositAmount || 0, phone: customer.phone });
      Alert.alert('Prompt sent', 'The customer should check their phone for the M-PESA prompt.');
      reload();
    } catch (error) { Alert.alert('Unable to send prompt', error.message); }
  }
  return (
    <>
      <Heading title="Customers" subtitle={`${customers.length} assigned accounts`} />
      <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Search name or phone" placeholderTextColor="#8190A0" />
      {customers.map((customer, index) => <View style={styles.customerCard} key={customer.id || index}>
        <View style={styles.customerTop}><View style={styles.customerAvatar}><Text style={styles.customerAvatarText}>{value(customer.fullName || customer.full_name, 'C')[0]}</Text></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{value(customer.fullName || customer.full_name, 'Customer')}</Text><Text style={styles.muted}>{value(customer.phone)}</Text></View><View style={styles.pill}><Text style={styles.pillText}>{value(customer.status, 'PENDING').toUpperCase()}</Text></View></View>
        <View style={styles.customerMeta}><Text style={styles.muted}>Balance</Text><Text style={styles.customerBalance}>{money(customer.balance || customer.remainingBalance)}</Text></View>
        {isOverdue(customer) && <View style={styles.overdueBanner}><Text style={styles.overdueBannerTitle}>PAYMENT OVERDUE</Text><Text style={styles.overdueBannerText}>{Number(customer.daysOverdue || customer.days_overdue || 1)} days late • {money(customer.overdueAmount || customer.overdue_amount || customer.dailyInstallment)} due</Text><Text style={styles.overdueBannerText}>Last payment: {value(customer.lastPaymentDate || customer.last_payment_date, 'Not recorded')}</Text></View>}
        <View style={styles.customerActions}><Pressable style={({ pressed }) => [styles.smallAction, isOverdue(customer) && styles.overdueAction, pressed && styles.pressedButton]} onPress={() => deposit(customer)}><Text style={styles.smallActionText}>{isOverdue(customer) ? 'Request payment' : 'Request deposit'}</Text></Pressable><Pressable style={({ pressed }) => [styles.smallActionSecondary, pressed && styles.pressedButton]} onPress={() => Alert.alert(value(customer.fullName || customer.full_name, 'Customer'), `Phone: ${value(customer.phone)}\nStatus: ${value(customer.status)}\nBalance: ${money(customer.balance || customer.remainingBalance)}${isOverdue(customer) ? `\nOverdue: ${money(customer.overdueAmount || customer.dailyInstallment)}` : ''}`)}><Text style={styles.smallActionSecondaryText}>View details</Text></Pressable></View>
      </View>)}
      {!customers.length && <Empty title="No customers found" copy="Register a new customer from the centre button." />}
    </>
  );
}

function More({ portal, reload, logout, profilePhoto, onChoosePhoto, onRemovePhoto, onBack }) {
  const [section, setSection] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const tasks = portal?.tasks || [];
  const commissions = portal?.commissions || [];
  const notifications = notificationsFor(portal);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (section) setSection('');
      else onBack();
      return true;
    });
    return () => subscription.remove();
  }, [section, onBack]);
  if (section === 'tasks') return <><SubHeading title="My tasks" subtitle="Tap a checkbox again to reopen a task" onBack={() => setSection('')} /><View style={styles.formCard}><Field label="Task title" value={title} onChangeText={setTitle} placeholder="For example, Follow up deposit" /><Field label="Note" value={note} onChangeText={setNote} placeholder="Add useful details" /><Button label="Add task" onPress={async () => { try { await api.post('/api/agent/tasks', { title, note }); setTitle(''); setNote(''); reload(); } catch (error) { Alert.alert('Task not added', error.message); } }} /></View>{tasks.map((task, index) => <Pressable key={task.id || index} style={({ pressed }) => [styles.task, pressed && styles.pressedCard]} onPress={async () => { try { await api.post(`/api/agent/tasks/${encodeURIComponent(task.id)}/complete`, { completed: !task.completed }); reload(); } catch (error) { Alert.alert('Task not updated', error.message); } }}><View style={[styles.checkbox, task.completed && styles.checked]}><Text style={styles.checkText}>{task.completed ? '✓' : ''}</Text></View><View style={{ flex: 1 }}><Text style={[styles.rowTitle, task.completed && styles.done]}>{value(task.title)}</Text><Text style={styles.muted}>{value(task.note, '')}</Text></View><Text style={styles.taskState}>{task.completed ? 'REOPEN' : 'DONE'}</Text></Pressable>)}</>;
  if (section === 'earnings') return <><SubHeading title="Commissions" subtitle="Your sales and payout history" onBack={() => setSection('')} />{commissions.map((item, index) => <View style={styles.listRow} key={item.id || index}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{value(item.description || item.customerName, 'Sales commission')}</Text><Text style={styles.muted}>{value(item.createdAt || item.date)}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={styles.commission}>+{money(item.amount)}</Text><Text style={styles.muted}>{value(item.status, 'Pending')}</Text></View></View>)}{!commissions.length && <Empty title="No commissions yet" copy="Completed sales earnings will appear here." />}</>;
  if (section === 'alerts') return <><SubHeading title="Alerts" subtitle="Overdue payments and operations updates" onBack={() => setSection('')} />{notifications.map((item, index) => <Pressable key={item.id || index} style={({ pressed }) => [styles.listRow, item.type === 'overdue' && styles.overdueAlert, pressed && styles.pressedCard]} onPress={() => item.type === 'overdue' ? Alert.alert(item.title, `${item.message}\n\nPhone: ${value(item.customer?.phone)}\nBalance: ${money(item.customer?.balance)}`, [{ text: 'Close', style: 'cancel' }, { text: 'Request payment', onPress: async () => { try { await api.post(`/api/agent/customers/${encodeURIComponent(item.customer.id)}/deposit-request`, { amount: item.customer.overdueAmount || item.customer.dailyInstallment, phone: item.customer.phone }); Alert.alert('Payment request sent', `${value(item.customer.fullName)} should check their phone.`); } catch (error) { Alert.alert('Request failed', error.message); } } }]) : Alert.alert(value(item.title, 'Agent update'), value(item.message))}><View style={[styles.alertDot, item.type === 'overdue' && styles.overdueDot]} /><View style={{ flex: 1 }}><Text style={[styles.rowTitle, item.type === 'overdue' && styles.overdueAlertTitle]}>{value(item.title, 'Agent update')}</Text><Text style={styles.muted}>{value(item.message)}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}{!notifications.length && <Empty title="No new alerts" copy="Operational updates will appear here." />}</>;
  return (
    <>
      <Heading title="More" subtitle="Your work tools and account" />
      <View style={styles.agentProfileCard}>
        <Pressable style={styles.agentProfileAvatar} onPress={onChoosePhoto}>{profilePhoto ? <Image source={{ uri: profilePhoto }} style={styles.agentProfileImage} /> : <Text style={styles.agentProfileInitial}>{value(portal?.agent?.fullName || portal?.profile?.fullName, 'A')[0]}</Text>}<View style={styles.agentPhotoBadge}><Text style={styles.agentPhotoBadgeText}>+</Text></View></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.agentProfileName}>{value(portal?.agent?.fullName || portal?.profile?.fullName, 'Agent')}</Text><Text style={styles.muted}>{value(portal?.agent?.region || portal?.profile?.region, 'Field agent')}</Text><View style={styles.agentPhotoActions}><Pressable onPress={onChoosePhoto}><Text style={styles.agentPhotoAction}>{profilePhoto ? 'Change photo' : 'Add profile photo'}</Text></Pressable>{profilePhoto ? <Pressable onPress={onRemovePhoto}><Text style={styles.agentRemovePhoto}>Remove</Text></Pressable> : null}</View></View>
      </View>
      <Menu icon="✓" title="Tasks" subtitle={`${tasks.length} field tasks`} onPress={() => setSection('tasks')} />
      <Menu icon="◆" title="Commissions" subtitle={`${commissions.length} earning records`} onPress={() => setSection('earnings')} />
      <Menu icon="♢" title="Alerts" subtitle={`${notifications.length} notifications`} onPress={() => setSection('alerts')} />
      <Menu icon="?" title="Help & support" subtitle="Contact operations support" onPress={() => Alert.alert('Salama Lock support', 'Call 0700 000 000 or email support@salamalockpay.com for assistance.')} />
      <Pressable style={styles.logout} onPress={logout}><Text style={styles.logoutText}>Sign out of this device</Text></Pressable>
      <Text style={styles.version}>Salama Lock Agent • Version 1.0.0</Text>
    </>
  );
}

function Field({ compact, ...props }) { return <View style={[styles.field, compact && styles.compactField]}><Text style={styles.fieldLabel}>{props.label}</Text><TextInput style={styles.input} placeholderTextColor="#8794A1" {...props} /></View>; }
function PasswordField({ label, visible, onToggle, ...props }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.passwordWrap}><TextInput style={styles.passwordInput} placeholderTextColor="#8794A1" secureTextEntry={!visible} autoCapitalize="none" {...props} /><Pressable onPress={onToggle} hitSlop={10} style={styles.eyeButton}><Text style={styles.eyeText}>{visible ? 'HIDE' : 'SHOW'}</Text></Pressable></View></View>; }
function Button({ label, onPress, disabled }) { return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, (pressed || disabled) && { opacity: .7 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>; }
function Heading({ title, subtitle }) { return <View style={styles.heading}><Text style={styles.pageTitle}>{title}</Text><Text style={styles.pageSub}>{subtitle}</Text></View>; }
function SubHeading({ title, subtitle, onBack }) { return <View style={styles.registrationHeading}><Pressable style={styles.screenBack} onPress={onBack}><Text style={styles.screenBackText}>‹</Text></Pressable><Heading title={title} subtitle={subtitle} /></View>; }
function Action({ icon, title, copy, onPress, primary }) { return <Pressable style={[styles.action, primary && styles.actionPrimary]} onPress={onPress}><View style={[styles.actionIcon, primary && styles.actionIconPrimary]}><Text style={[styles.actionGlyph, primary && { color: 'white' }]}>{icon}</Text></View><Text style={[styles.actionTitle, primary && { color: 'white' }]}>{title}</Text><Text style={[styles.muted, primary && { color: '#C9DCF2' }]}>{copy}</Text></Pressable>; }
function Menu({ icon, title, subtitle, onPress }) { return <Pressable onPress={onPress} style={styles.menu}><View style={styles.menuIcon}><Text style={styles.menuGlyph}>{icon}</Text></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.muted}>{subtitle}</Text></View><Text style={styles.chevron}>›</Text></Pressable>; }
function Empty({ title, copy }) { return <View style={styles.empty}><Text style={styles.emptyIcon}>◇</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.muted}>{copy}</Text></View>; }
function LogoMark({ light }) { return <View style={styles.logoWrap}><View style={[styles.logoShield, light && styles.logoShieldLight]}><Text style={[styles.logoLock, light && styles.logoLockLight]}>▣</Text></View><View><Text style={[styles.logoName, light && styles.logoNameLight]}><Text style={styles.logoGreen}>SALAMA</Text>LOCK</Text><Text style={[styles.logoTagline, light && styles.logoTaglineLight]}>FIELD OPERATIONS</Text></View></View>; }

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#F3F6F9', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  loading: { flex: 1, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', gap: 22 },
  loadingCopy: { color: '#C8D5E2' },
  header: { backgroundColor: NAVY, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#91A9BF', fontSize: 10, letterSpacing: 1.8, fontWeight: '900' }, hello: { color: 'white', fontSize: 22, fontWeight: '900', marginTop: 3 },
  avatar: { width: 42, height: 42, backgroundColor: BLUE, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: 'white', fontSize: 17, fontWeight: '900' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 14 },
  scroll: { flex: 1 }, scrollBody: { padding: 14, paddingBottom: 44 },
  keyboardArea: { flex: 1 },
  tabBar: { minHeight: 68, paddingBottom: Platform.OS === 'android' ? 4 : 0, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#DDE5EC', elevation: 16 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, tabIcon: { color: '#82909E', fontSize: 21 }, tabLabel: { color: '#82909E', fontSize: 9, fontWeight: '800' }, active: { color: BLUE },
  addTab: { marginTop: -22 }, addIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: BLUE, color: 'white', textAlign: 'center', lineHeight: 46, fontSize: 29, elevation: 7 },
  auth: { flex: 1, backgroundColor: NAVY }, authBody: { paddingHorizontal: 18, paddingTop: Platform.OS === 'android' ? 38 : 34, paddingBottom: 46 },
  authScroll: { flex: 1 },
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 18 },
  logoShield: { width: 48, height: 54, borderWidth: 3, borderColor: '#172119', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, alignItems: 'center', justifyContent: 'center' },
  logoShieldLight: { borderColor: 'white' }, logoLock: { color: '#5FBF45', fontSize: 25 }, logoLockLight: { color: GOLD },
  logoName: { color: '#172119', fontSize: 19, fontWeight: '900', letterSpacing: 1 }, logoNameLight: { color: 'white' }, logoGreen: { color: '#5FBF45' },
  logoTagline: { color: '#66798A', fontSize: 7, fontWeight: '800', letterSpacing: 1.4, marginTop: 2 }, logoTaglineLight: { color: '#B9CADA' },
  authKicker: { color: '#8FB1CE', fontWeight: '900', letterSpacing: 1.8, fontSize: 10, marginTop: 8 },
  authTitle: { color: 'white', fontSize: 33, lineHeight: 39, fontWeight: '900', marginTop: 8 }, authSub: { color: '#B9CADA', lineHeight: 20, marginTop: 10, marginBottom: 25 },
  loginCard: { backgroundColor: '#F9FBFD', borderRadius: 24, padding: 21 }, cardTitle: { color: NAVY, fontSize: 21, fontWeight: '900', marginBottom: 18 },
  field: { marginBottom: 13 }, fieldLabel: { color: '#3E5265', fontSize: 11, fontWeight: '800', marginBottom: 6 },
  input: { height: 50, backgroundColor: 'white', borderWidth: 1, borderColor: '#D9E2EA', borderRadius: 13, paddingHorizontal: 14, color: NAVY }, two: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, compactField: { flexGrow: 1, flexBasis: 140, minWidth: 0 },
  passwordWrap: { height: 50, backgroundColor: 'white', borderWidth: 1, borderColor: '#D9E2EA', borderRadius: 13, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, height: '100%', paddingLeft: 14, color: NAVY },
  eyeButton: { height: '100%', justifyContent: 'center', paddingHorizontal: 13 },
  eyeText: { color: BLUE, fontSize: 9, fontWeight: '900', letterSpacing: .5 },
  button: { height: 52, backgroundColor: BLUE, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, buttonText: { color: 'white', fontWeight: '900' },
  switchText: { color: BLUE, textAlign: 'center', fontWeight: '800', fontSize: 12, marginTop: 18 },
  forgotText: { color: '#63788B', textAlign: 'center', fontWeight: '800', fontSize: 11, marginTop: 13 },
  demoBox: { backgroundColor: '#EAF2FC', borderRadius: 12, padding: 11, marginBottom: 14 },
  demoTitle: { color: BLUE, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginBottom: 4 },
  demoText: { color: '#385B7C', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  heroCard: { backgroundColor: NAVY, borderRadius: 22, padding: 21, elevation: 7 }, heroLabel: { color: '#9EB2C5', fontSize: 10, letterSpacing: 1.3, fontWeight: '900' },
  heroMoney: { color: 'white', fontSize: 30, fontWeight: '900', marginTop: 6, marginBottom: 20 }, heroStats: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  heroStat: { color: 'white', fontSize: 18, fontWeight: '900', textAlign: 'center' }, heroMeta: { color: '#AFC0CF', fontSize: 10, marginTop: 3 }, heroDivider: { height: 29, width: 1, backgroundColor: '#375069' },
  overdueSummary: { marginTop: 12, backgroundColor: '#FFF1ED', borderWidth: 1, borderColor: '#F4C2B5', borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  overdueSummaryIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: '#D94829', alignItems: 'center', justifyContent: 'center' },
  overdueSummaryGlyph: { color: 'white', fontSize: 20, fontWeight: '900' },
  overdueSummaryTitle: { color: '#8E2F1B', fontWeight: '900', marginBottom: 3 },
  overdueSummaryCopy: { color: '#986052', fontSize: 11 },
  sectionTitle: { color: NAVY, fontSize: 17, fontWeight: '900', marginTop: 23, marginBottom: 11 }, actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { width: '100%', backgroundColor: 'white', borderRadius: 17, padding: 15, minHeight: 112 }, actionPrimary: { backgroundColor: BLUE },
  actionIcon: { width: 37, height: 37, borderRadius: 11, backgroundColor: '#E8F1FC', alignItems: 'center', justifyContent: 'center', marginBottom: 11 }, actionIconPrimary: { backgroundColor: '#4181D9' },
  actionGlyph: { color: BLUE, fontSize: 21, fontWeight: '600' }, actionTitle: { color: NAVY, fontWeight: '900', marginBottom: 4 },
  focusRow: { backgroundColor: 'white', borderRadius: 15, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'center', marginBottom: 9 }, focusLine: { height: 37, width: 4, borderRadius: 3, backgroundColor: GOLD },
  rowTitle: { color: NAVY, fontWeight: '900', marginBottom: 3 }, muted: { color: '#778796', fontSize: 11, lineHeight: 16 }, chevron: { color: '#8A98A5', fontSize: 28 },
  heading: { marginBottom: 16 }, pageTitle: { color: NAVY, fontSize: 26, fontWeight: '900' }, pageSub: { color: '#758595', marginTop: 4 },
  registrationHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  screenBack: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  screenBackText: { color: NAVY, fontSize: 30, lineHeight: 32, fontWeight: '500' },
  search: { height: 49, borderRadius: 15, backgroundColor: 'white', paddingHorizontal: 16, color: NAVY, marginBottom: 14, borderWidth: 1, borderColor: '#E0E7ED' },
  stockCard: { backgroundColor: 'white', borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  pressedCard: { opacity: .72, transform: [{ scale: .995 }] },
  pressedButton: { opacity: .72 },
  phoneIcon: { width: 47, height: 47, backgroundColor: '#E9F2FD', borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, phoneIconText: { color: BLUE, fontSize: 25 }, stockPrice: { color: BLUE, fontSize: 11, fontWeight: '900', marginTop: 5 },
  pill: { backgroundColor: '#E6F6EF', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 }, pillText: { color: '#188457', fontSize: 8, fontWeight: '900' }, pillAssigned: { backgroundColor: '#FFF3DA' }, pillAssignedText: { color: '#9B6B09' },
  stepTrack: { height: 5, backgroundColor: '#DDE5EB', borderRadius: 4, marginBottom: 16 }, stepFill: { height: '100%', backgroundColor: BLUE, borderRadius: 4 },
  formCard: { backgroundColor: 'white', borderRadius: 21, padding: 18, marginBottom: 13 }, formTitle: { color: NAVY, fontSize: 19, fontWeight: '900' }, formCopy: { color: '#788796', fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 17 },
  camera: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#94B8E5', backgroundColor: '#F4F8FD', borderRadius: 15, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  cameraIcon: { color: BLUE, fontSize: 23 }, cameraTitle: { color: NAVY, fontWeight: '900', marginBottom: 2 },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginTop: 15 }, backButton: { flexGrow: 1, minWidth: 105, height: 52, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: '#CCD7E0', alignItems: 'center', justifyContent: 'center' }, backText: { color: NAVY, fontWeight: '900' },
  selectCard: { borderWidth: 1, borderColor: '#DFE6EC', borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 }, selected: { borderColor: BLUE, backgroundColor: '#F2F7FE' },
  radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 2, borderColor: BLUE, alignItems: 'center', justifyContent: 'center' }, radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: BLUE },
  review: { backgroundColor: '#F2F7FD', padding: 15, borderRadius: 15, marginTop: 5 }, reviewTitle: { color: NAVY, fontWeight: '900', marginBottom: 6 }, reviewText: { color: '#5C7082', fontSize: 12, marginTop: 3 },
  codeSuccessCard: { backgroundColor: 'white', borderRadius: 21, padding: 19, alignItems: 'stretch', gap: 14 },
  codeSuccessMark: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#E3F7EC', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  codeSuccessMarkText: { color: '#14815B', fontSize: 28, fontWeight: '900' },
  codeSuccessTitle: { color: NAVY, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  codeSuccessCopy: { color: '#66798A', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  codeCustomerIdentity: { backgroundColor: '#F3F6F8', borderRadius: 13, padding: 14, borderLeftWidth: 4, borderLeftColor: '#2EDB75' },
  codeLabel: { color: '#577064', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  codeCustomerName: { color: NAVY, fontSize: 17, fontWeight: '900', marginTop: 4, marginBottom: 2 },
  codeBox: { backgroundColor: '#052B1D', borderRadius: 15, padding: 20, alignItems: 'center', gap: 8 },
  codeLabelLight: { color: '#BBD4C9', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  codeValue: { color: '#2EE578', fontSize: 27, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  codeExpiry: { color: '#C6DBD2', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  finishCodeButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#CBD7E1', alignItems: 'center', justifyContent: 'center' },
  finishCodeText: { color: NAVY, fontWeight: '900', fontSize: 12 },
  customerCard: { backgroundColor: 'white', borderRadius: 18, padding: 15, marginBottom: 11 }, customerTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  customerAvatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' }, customerAvatarText: { color: 'white', fontWeight: '900' },
  customerMeta: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, marginTop: 10, borderTopWidth: 1, borderTopColor: '#EDF1F4' }, customerBalance: { color: NAVY, fontWeight: '900' },
  overdueBanner: { backgroundColor: '#FFF1ED', borderRadius: 12, padding: 11, marginBottom: 11 },
  overdueBannerTitle: { color: '#B63D24', fontSize: 9, fontWeight: '900', letterSpacing: .8, marginBottom: 4 },
  overdueBannerText: { color: '#875548', fontSize: 11, lineHeight: 16 },
  customerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, smallAction: { flexGrow: 1, flexBasis: 125, backgroundColor: BLUE, borderRadius: 11, paddingVertical: 11, alignItems: 'center' }, smallActionText: { color: 'white', fontSize: 10, fontWeight: '900' },
  overdueAction: { backgroundColor: '#D94829' },
  smallActionSecondary: { flexGrow: 1, flexBasis: 125, backgroundColor: '#EAF1F8', borderRadius: 11, paddingVertical: 11, alignItems: 'center' }, smallActionSecondaryText: { color: NAVY, fontSize: 10, fontWeight: '900' },
  menu: { backgroundColor: 'white', borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 9 }, menuIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EAF2FC', alignItems: 'center', justifyContent: 'center' }, menuGlyph: { color: BLUE, fontSize: 18, fontWeight: '900' },
  agentProfileCard: { backgroundColor: 'white', borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  agentProfileAvatar: { width: 70, height: 70, borderRadius: 22, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  agentProfileImage: { width: '100%', height: '100%', borderRadius: 22 },
  agentProfileInitial: { color: 'white', fontSize: 25, fontWeight: '900' },
  agentPhotoBadge: { position: 'absolute', right: -3, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: GOLD, borderWidth: 3, borderColor: 'white', alignItems: 'center', justifyContent: 'center' },
  agentPhotoBadgeText: { color: NAVY, fontWeight: '900', lineHeight: 16 },
  agentProfileName: { color: NAVY, fontSize: 17, fontWeight: '900', marginBottom: 3 },
  agentPhotoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 7 },
  agentPhotoAction: { color: BLUE, fontSize: 10, fontWeight: '900' },
  agentRemovePhoto: { color: '#A13838', fontSize: 10, fontWeight: '800' },
  task: { backgroundColor: 'white', borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 9 }, checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#A8B5C0', alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: BLUE, borderColor: BLUE }, checkText: { color: 'white', fontWeight: '900' }, done: { textDecorationLine: 'line-through', color: '#82909D' },
  taskState: { color: BLUE, fontSize: 8, fontWeight: '900', letterSpacing: .5 },
  listRow: { backgroundColor: 'white', borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 9 }, commission: { color: '#14815B', fontWeight: '900' },
  alertDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: GOLD, marginRight: 12 },
  overdueAlert: { borderWidth: 1, borderColor: '#F1C4B9', backgroundColor: '#FFF8F6' },
  overdueDot: { backgroundColor: '#D94829' },
  overdueAlertTitle: { color: '#A93620' },
  empty: { alignItems: 'center', paddingVertical: 45 }, emptyIcon: { color: '#9CABB8', fontSize: 38 }, emptyTitle: { color: NAVY, fontWeight: '900', fontSize: 17, marginTop: 10, marginBottom: 5 },
  logout: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: '#E0B9B9', alignItems: 'center', justifyContent: 'center', marginTop: 20 }, logoutText: { color: '#A13838', fontWeight: '900' }, version: { textAlign: 'center', color: '#9AA7B2', fontSize: 10, marginTop: 18 }
});
