import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform,
  Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text,
  TextInput, View, Alert
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

const C = { navy:'#071A37', navy2:'#102B50', blue:'#0A7CFF', blueSoft:'#EAF3FF', green:'#00A859', ink:'#14243A', muted:'#718096', line:'#E5EAF1', bg:'#F4F7FB', white:'#FFFFFF', amber:'#F2A900', red:'#D94A52' };
const TOKEN_KEY = 'carwash_washer_token';
const FIRST_KEY = 'carwash_washer_seen';
const DEMO = process.env.EXPO_PUBLIC_DEMO_MODE !== 'false';
const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
const seedJobs = [
  { id:'CW-2048', registration:'KDA 123A', vehicle:'Toyota Axio', customer:'Mary Njeri', service:'Basic Wash + Interior', status:'ASSIGNED', commission:110, due:'Due now', color:'#DCEAFF' },
  { id:'CW-2051', registration:'KCB 902Q', vehicle:'Mazda CX-5', customer:'Peter Mwangi', service:'Premium Wash', status:'IN PROGRESS', commission:100, due:'Started 10:24', color:'#E9F5EF' },
  { id:'CW-2053', registration:'KDD 551M', vehicle:'Nissan Note', customer:'Amina Hassan', service:'Full Detail', status:'ASSIGNED', commission:300, due:'Next up', color:'#FFF2DE' },
  { id:'CW-2037', registration:'KCU 448D', vehicle:'Honda Fit', customer:'James Kariuki', service:'Basic Wash', status:'COMPLETED', commission:50, due:'Completed 09:12', color:'#E9F5EF' }
];
const demoJobs = seedJobs.map((job) => ({ ...job }));
const demoEarnings = { today:510, week:2840, month:9460, completed:32 };
const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;

async function request(path, method='GET', body, token) {
  if (DEMO) {
    await new Promise((resolve) => setTimeout(resolve, 260));
    if (path === '/api/washer/auth/login') return { token:'washer-demo-session', worker:{ name:'Kevin Otieno' } };
    if (path === '/api/washer/jobs') return { jobs: demoJobs.map((job) => ({ ...job })) };
    if (path === '/api/washer/earnings') return { earnings:{ ...demoEarnings } };
    const match = path.match(/^\/api\/washer\/jobs\/([^/]+)\/(start|complete)$/);
    if (match) {
      const job = demoJobs.find((item) => item.id === decodeURIComponent(match[1]));
      if (job && match[2] === 'start') job.status = 'IN PROGRESS';
      if (job && match[2] === 'complete' && job.status !== 'COMPLETED') {
        job.status = 'COMPLETED';
        demoEarnings.today += Number(job.commission || 0);
        demoEarnings.week += Number(job.commission || 0);
        demoEarnings.month += Number(job.commission || 0);
        demoEarnings.completed += 1;
      }
      return { success:true, job };
    }
    return { success:true };
  }
  const response = await fetch(`${API_URL}${path}`, {
    method, headers:{ Accept:'application/json', 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) },
    ...(body ? { body:JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Unable to connect. Check your connection and try again.');
  return data;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [screen, setScreen] = useState('jobs');
  const [drawer, setDrawer] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [worker, setWorker] = useState({ name:'Washer' });
  const [jobs, setJobs] = useState([]);
  const [earnings, setEarnings] = useState({ today:0, week:0, month:0, completed:0 });
  const [refreshing, setRefreshing] = useState(false);
  const [welcome, setWelcome] = useState('');
  const tokenRef = useRef('');
  const wash = useRef(new Animated.Value(0)).current;
  const drawerOffset = useRef(new Animated.Value(-330)).current;

  useEffect(() => {
    Animated.loop(Animated.timing(wash, { toValue:1, duration:2200, easing:Easing.inOut(Easing.ease), useNativeDriver:true })).start();
    (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) { tokenRef.current = token; try { await openWorkspace(token, false); } catch { await SecureStore.deleteItemAsync(TOKEN_KEY); } }
      setTimeout(() => setBooting(false), 1500);
    })();
  }, []);
  useEffect(() => {
    if (drawer) Animated.spring(drawerOffset, { toValue:0, useNativeDriver:true, damping:22, stiffness:190 }).start();
  }, [drawer]);

  async function openWorkspace(token, showWelcome=true) {
    const [jobData, earnedData] = await Promise.all([
      request('/api/washer/jobs', 'GET', null, token), request('/api/washer/earnings', 'GET', null, token)
    ]);
    setJobs(jobData.jobs || []); setEarnings(earnedData.earnings || {}); setSignedIn(true); setScreen('jobs');
    const who = jobData.worker || earnedData.worker;
    if (who?.name) setWorker(who);
    if (showWelcome) {
      const seen = await SecureStore.getItemAsync(FIRST_KEY);
      setWelcome(seen ? 'returning' : 'first');
      await SecureStore.setItemAsync(FIRST_KEY, 'yes');
    }
  }
  async function signIn() {
    if (!email.trim() || !password) return Alert.alert('Sign in', 'Enter your email and password to continue.');
    setAuthLoading(true);
    try {
      const result = await request('/api/washer/auth/login', 'POST', { email:email.trim(), password });
      tokenRef.current = result.token;
      await SecureStore.setItemAsync(TOKEN_KEY, result.token);
      if (result.worker || result.user) setWorker({ name:(result.worker || result.user).name || (result.worker || result.user).fullName || 'Washer' });
      setBooting(true);
      await openWorkspace(result.token);
    } catch (error) { Alert.alert('Could not sign in', error.message); }
    finally { setAuthLoading(false); setBooting(false); }
  }
  async function refresh() {
    setRefreshing(true);
    try { await openWorkspace(tokenRef.current, false); } catch (error) { Alert.alert('Sync unavailable', error.message); }
    finally { setRefreshing(false); }
  }
  async function updateJob(job) {
    const starting = job.status === 'ASSIGNED';
    const endpoint = `/api/washer/jobs/${encodeURIComponent(job.id)}/${starting ? 'start' : 'complete'}`;
    try {
      await request(endpoint, 'POST', {}, tokenRef.current);
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status:starting ? 'IN PROGRESS' : 'COMPLETED' } : item));
      if (!starting) setEarnings((current) => ({ ...current, today:Number(current.today || 0)+Number(job.commission || 0), week:Number(current.week || 0)+Number(job.commission || 0), month:Number(current.month || 0)+Number(job.commission || 0), completed:Number(current.completed || 0)+1 }));
    } catch (error) { Alert.alert('Job not updated', error.message); }
  }
  async function signOut() {
    await SecureStore.deleteItemAsync(TOKEN_KEY); tokenRef.current=''; setSignedIn(false); setDrawer(false); setScreen('jobs');
  }

  if (booting) return <WashScreen message={signedIn ? 'Connected securely. Let’s get washing.' : 'Please wait, connecting to your secure wash floor…'} wash={wash} />;
  if (!signedIn) return <Login email={email} setEmail={setEmail} password={password} setPassword={setPassword} busy={authLoading} onSubmit={signIn} wash={wash} />;
  const activeJobs = jobs.filter((job) => ['ASSIGNED','IN PROGRESS'].includes(job.status));
  return <SafeAreaView style={s.app}>
    <StatusBar barStyle="light-content" backgroundColor={C.navy} />
    <View style={s.topbar}>
      <Pressable accessibilityLabel="Open menu" onPress={() => setDrawer(true)} style={s.menuButton}><Text style={s.menuGlyph}>☰</Text></Pressable>
      <View style={{flex:1}}><Text style={s.brand}>CARWASH <Text style={{color:C.blue}}>OS</Text></Text><Text style={s.topCaption}>WASHER WORKSPACE</Text></View>
      <View style={s.online}><View style={s.onlineDot}/><Text style={s.onlineText}>ONLINE</Text></View>
    </View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {welcome && <View style={s.welcome}><View style={s.welcomeMark}><Text style={{color:C.green,fontSize:22,fontWeight:'900'}}>✓</Text></View><View style={{flex:1}}><Text style={s.welcomeTitle}>{welcome === 'first' ? 'Welcome' : 'Welcome back'}, {worker.name.split(' ')[0]}</Text><Text style={s.welcomeCopy}>Your wash floor is ready. Let’s make every car shine.</Text></View><Pressable onPress={() => setWelcome('')}><Text style={s.dismiss}>×</Text></Pressable></View>}
      <Text style={s.eyebrow}>TUESDAY · NAIROBI</Text>
      <Text style={s.heading}>{screen === 'jobs' ? 'My jobs' : screen === 'earnings' ? 'My earnings' : screen === 'history' ? 'Job history' : 'My profile'}</Text>
      <Text style={s.subheading}>{screen === 'jobs' ? 'Your assigned work for today.' : screen === 'earnings' ? 'Your completed work, counted clearly.' : screen === 'history' ? 'A record of the cars you have completed.' : 'Your washer account and workspace.'}</Text>
      {screen === 'jobs' && <>
        <View style={s.summaryCard}><View style={s.summaryTop}><View><Text style={s.summaryLabel}>TODAY’S COMMISSION</Text><Text style={s.summaryAmount}>{money(earnings.today)}</Text></View><View style={s.summaryIcon}><Text style={{fontSize:22}}>✦</Text></View></View><View style={s.summaryDivider}/><View style={s.summaryBottom}><Text style={s.summaryMeta}><Text style={{color:'#fff',fontWeight:'900'}}>{activeJobs.length} jobs</Text> in your queue</Text><Text style={s.summaryMeta}>{Number(earnings.completed || 0)} completed this month</Text></View></View>
        <View style={s.sectionRow}><Text style={s.sectionTitle}>Assigned to me</Text><View style={s.countPill}><Text style={s.countText}>{activeJobs.length} ACTIVE</Text></View></View>
        {refreshing && <ActivityIndicator color={C.blue} style={{margin:8}}/>}
        {activeJobs.length ? activeJobs.map((job) => <JobCard key={job.id} job={job} onAction={() => updateJob(job)} />) : <EmptyState title="You’re all caught up" copy="New wash assignments will appear here."/>}
        <Pressable style={s.syncButton} onPress={refresh}><Text style={s.syncText}>↻  Sync jobs</Text></Pressable>
      </>}
      {screen === 'earnings' && <><View style={s.earnHero}><Text style={s.summaryLabel}>TOTAL EARNED THIS MONTH</Text><Text style={s.earnAmount}>{money(earnings.month)}</Text><Text style={s.earnCaption}>Across {earnings.completed || 0} completed washes</Text></View><Text style={s.sectionTitle}>Earnings overview</Text><View style={s.earnGrid}><Metric label="Today" amount={earnings.today}/><Metric label="This week" amount={earnings.week}/><Metric label="This month" amount={earnings.month}/><Metric label="Cars completed" amount={earnings.completed} plain/></View><View style={s.tip}><Text style={s.tipIcon}>✦</Text><Text style={s.tipCopy}>Commission is added when a wash is marked complete.</Text></View></>}
      {screen === 'history' && <>{jobs.filter((job) => job.status === 'COMPLETED').length ? jobs.filter((job) => job.status === 'COMPLETED').map((job) => <JobCard key={job.id} job={job} history/>) : <EmptyState title="No completed washes yet" copy="Once you finish a wash, it will appear here."/>}<Pressable style={s.syncButton} onPress={refresh}><Text style={s.syncText}>↻  Refresh history</Text></Pressable></>}
      {screen === 'profile' && <View style={s.profileCard}><View style={s.profileAvatar}><Text style={s.profileInitial}>{worker.name?.[0] || 'W'}</Text></View><Text style={s.profileName}>{worker.name}</Text><Text style={s.profileRole}>Washer · Field team</Text><View style={s.profileDivider}/><View style={s.profileLine}><Text style={s.profileKey}>Workspace</Text><Text style={s.profileValue}>{worker.businessName || 'Carwash OS'}</Text></View><View style={s.profileLine}><Text style={s.profileKey}>Status</Text><Text style={[s.profileValue,{color:C.green}]}>Active</Text></View><Pressable onPress={signOut} style={s.signout}><Text style={s.signoutText}>Sign out</Text></Pressable></View>}
      <Text style={s.footer}>CARWASH OS  ·  WASH WITH CARE</Text>
    </ScrollView>
    {drawer && <View style={s.drawerLayer}><Pressable style={s.scrim} onPress={() => setDrawer(false)}/><Animated.View style={[s.drawer,{transform:[{translateX:drawerOffset}]}]}><View style={s.drawerHeader}><View style={s.drawerLogo}><Text style={{fontSize:24}}>✦</Text></View><View><Text style={s.drawerBrand}>CARWASH OS</Text><Text style={s.drawerCaption}>WASHER APP</Text></View><Pressable onPress={() => setDrawer(false)} style={s.drawerClose}><Text style={{color:'#fff',fontSize:22}}>×</Text></Pressable></View><View style={s.drawerProfile}><View style={s.drawerAvatar}><Text style={{color:'#fff',fontSize:18,fontWeight:'900'}}>{worker.name?.[0] || 'W'}</Text></View><View><Text style={s.drawerName}>{worker.name}</Text><Text style={s.drawerRole}>Washer · Active</Text></View></View><Text style={s.drawerSection}>YOUR WORK</Text>{[['jobs','▣','My jobs'],['earnings','↗','My earnings'],['history','◷','Job history'],['profile','◉','My profile']].map(([key,icon,label])=><Pressable key={key} onPress={()=>{setScreen(key);setDrawer(false);}} style={[s.drawerItem,screen===key&&s.drawerItemActive]}><Text style={[s.drawerIcon,screen===key&&{color:C.blue}]}>{icon}</Text><Text style={[s.drawerLabel,screen===key&&{color:'#fff'}]}>{label}</Text>{screen===key&&<View style={s.drawerActiveBar}/>}</Pressable>)}<View style={{flex:1}}/><Text style={s.drawerFoot}>Secure washer workspace</Text><Text style={s.drawerVersion}>CARWASH OS  ·  VERSION 1.0</Text></Animated.View></View>}
  </SafeAreaView>;
}

function WashScreen({ message, wash }) {
  const translate = wash.interpolate({inputRange:[0,1],outputRange:[-105,105]});
  const opacity = wash.interpolate({inputRange:[0,.5,1],outputRange:[.2,1,.2]});
  return <View style={s.washScreen}><StatusBar barStyle="light-content" backgroundColor={C.navy}/><View style={s.splashBrand}><Text style={s.splashMark}>✦</Text><Text style={s.splashName}>CARWASH <Text style={{color:C.blue}}>OS</Text></Text></View><View style={s.washArt}><View style={s.washHalo}/><CarIllustration/><Animated.View style={[s.waterBeam,{transform:[{translateX:translate}],opacity}]}/>{[0,1,2,3,4,5].map((n)=><Animated.View key={n} style={[s.bubble,{left:`${9+n*15}%`,top:15+(n%3)*63,opacity:opacity,transform:[{translateY:wash.interpolate({inputRange:[0,1],outputRange:[8+n*2,-22-n*2]})}]}]}/>)}</View><Text style={s.washTitle}>A little shine goes a long way.</Text><Text style={s.washMessage}>{message}</Text><View style={s.loaderTrack}><Animated.View style={[s.loaderFill,{transform:[{translateX:wash.interpolate({inputRange:[0,1],outputRange:[-100,100]})}]}]}/></View><Text style={s.secureLine}>◉  SECURE WASHER CONNECTION</Text></View>;
}
function CarIllustration(){return <View style={s.carWrap}><View style={s.carRoof}/><View style={s.carWindow}/><View style={s.carBody}><View style={s.carHeadlight}/><View style={s.carGrill}/><View style={s.carTail}/></View><View style={[s.wheel,{left:43}]}/><View style={[s.wheel,{right:43}]}/></View>}
function Login({email,setEmail,password,setPassword,busy,onSubmit,wash}){
  return <KeyboardAvoidingView style={s.loginRoot} behavior={Platform.OS==='ios'?'padding':undefined}><StatusBar barStyle="light-content" backgroundColor={C.navy}/><View style={s.loginTop}><View style={s.splashBrand}><Text style={s.splashMark}>✦</Text><Text style={s.splashName}>CARWASH <Text style={{color:C.blue}}>OS</Text></Text></View><Text style={s.securePill}>◉  SECURE WASHER APP</Text><Text style={s.loginTitle}>Your next great{ '\n' }wash starts here.</Text><Text style={s.loginCopy}>Sign in to see your assigned cars and get to work.</Text><View style={s.miniWash}><CarIllustration/><Animated.View style={[s.miniBeam,{transform:[{translateX:wash.interpolate({inputRange:[0,1],outputRange:[-120,120]})}]}]}/></View></View><View style={s.loginSheet}><View style={s.sheetHandle}/><Text style={s.formTitle}>Welcome back</Text><Text style={s.formCopy}>Use your washer account to continue.</Text><Text style={s.inputLabel}>EMAIL ADDRESS</Text><TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor="#96A3B4" autoCapitalize="none" keyboardType="email-address" style={s.input} autoComplete="email"/><Text style={[s.inputLabel,{marginTop:16}]}>PASSWORD</Text><TextInput value={password} onChangeText={setPassword} placeholder="Enter your password" placeholderTextColor="#96A3B4" secureTextEntry style={s.input} autoComplete="password" onSubmitEditing={onSubmit}/><Pressable onPress={onSubmit} disabled={busy} style={({pressed})=>[s.loginButton,pressed&&{opacity:.88}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.loginButtonText}>Sign in securely  →</Text>}</Pressable><View style={s.loginNote}><Text style={s.noteShield}>◉</Text><Text style={s.noteText}>Your account and job details are protected.</Text></View></View></KeyboardAvoidingView>;
}
function JobCard({job,onAction,history=false}){
  const statusColor=job.status==='IN PROGRESS'?C.blue:job.status==='COMPLETED'?C.green:C.amber;
  return <View style={s.jobCard}><View style={s.jobTop}><View style={[s.carThumb,{backgroundColor:job.color||C.blueSoft}]}><CarMini/></View><View style={{flex:1}}><Text style={s.plate}>{job.registration}</Text><Text style={s.vehicle}>{job.vehicle}</Text></View><View style={[s.statusPill,{backgroundColor:`${statusColor}16`}]}><View style={[s.statusDot,{backgroundColor:statusColor}]}/><Text style={[s.statusText,{color:statusColor}]}>{job.status}</Text></View></View><View style={s.jobRule}/><View style={s.jobInfoRow}><Text style={s.infoLabel}>SERVICE</Text><Text style={s.infoLabel}>YOUR COMMISSION</Text></View><View style={s.jobInfoRow}><Text style={s.service}>{job.service}</Text><Text style={s.commission}>{money(job.commission)}</Text></View><View style={s.customerRow}><Text style={s.customerIcon}>◉</Text><Text style={s.customerName}>{job.customer}</Text><Text style={s.jobDue}>{job.due}</Text></View>{!history&&<Pressable onPress={onAction} style={[s.jobAction,job.status==='IN PROGRESS'&&s.completeAction]}><Text style={s.jobActionText}>{job.status==='IN PROGRESS'?'Complete wash  ✓':'Start wash  →'}</Text></Pressable>}{history&&<View style={s.completedNote}><Text style={{color:C.green,fontSize:12,fontWeight:'800'}}>✓  Wash completed</Text></View>}</View>
}
function CarMini(){return <View style={s.miniCar}><View style={s.miniRoof}/><View style={s.miniBody}/><View style={[s.miniWheel,{left:5}]}/><View style={[s.miniWheel,{right:5}]}/></View>}
function Metric({label,amount,plain}){return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricAmount}>{plain?Number(amount||0).toLocaleString():money(amount)}</Text></View>}
function EmptyState({title,copy}){return <View style={s.empty}><Text style={s.emptyGlyph}>✦</Text><Text style={s.emptyTitle}>{title}</Text><Text style={s.emptyCopy}>{copy}</Text></View>}

const s=StyleSheet.create({
  app:{flex:1,backgroundColor:C.bg}, topbar:{height:76,paddingHorizontal:19,backgroundColor:C.navy,flexDirection:'row',alignItems:'center',gap:13}, menuButton:{width:42,height:42,borderRadius:14,backgroundColor:'rgba(255,255,255,.1)',alignItems:'center',justifyContent:'center'},menuGlyph:{fontSize:20,color:'#fff'},brand:{color:'#fff',fontSize:15,fontWeight:'900',letterSpacing:1.4},topCaption:{color:'#90A5C1',fontSize:8,fontWeight:'800',letterSpacing:1.7,marginTop:3},online:{paddingHorizontal:10,paddingVertical:7,borderRadius:20,backgroundColor:'rgba(0,168,89,.16)',flexDirection:'row',alignItems:'center',gap:6},onlineDot:{width:6,height:6,borderRadius:4,backgroundColor:'#23D782'},onlineText:{fontSize:8,color:'#75E8B1',fontWeight:'900',letterSpacing:1},content:{padding:20,paddingBottom:35},welcome:{padding:13,backgroundColor:'#E9F8F0',borderColor:'#CDEEDD',borderWidth:1,borderRadius:16,flexDirection:'row',alignItems:'center',gap:11,marginBottom:21},welcomeMark:{width:37,height:37,borderRadius:12,backgroundColor:'#D5F2E2',alignItems:'center',justifyContent:'center'},welcomeTitle:{color:C.ink,fontSize:13,fontWeight:'900'},welcomeCopy:{color:C.muted,fontSize:10,marginTop:3},dismiss:{fontSize:23,color:'#6A8D7A',paddingHorizontal:3},eyebrow:{color:C.blue,fontSize:9,fontWeight:'900',letterSpacing:1.8},heading:{fontSize:30,fontWeight:'900',color:C.ink,letterSpacing:-.7,marginTop:5},subheading:{color:C.muted,fontSize:12,marginTop:5,marginBottom:20},summaryCard:{backgroundColor:C.navy,borderRadius:21,padding:19,marginBottom:23,overflow:'hidden'},summaryTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},summaryLabel:{color:'#9BB1CB',fontWeight:'900',fontSize:9,letterSpacing:1.5},summaryAmount:{color:'#fff',fontSize:29,fontWeight:'900',marginTop:7},summaryIcon:{width:46,height:46,borderRadius:16,backgroundColor:'rgba(10,124,255,.25)',alignItems:'center',justifyContent:'center'},summaryDivider:{height:1,backgroundColor:'rgba(255,255,255,.13)',marginVertical:15},summaryBottom:{flexDirection:'row',justifyContent:'space-between',gap:8},summaryMeta:{color:'#9BB1CB',fontSize:9},sectionRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},sectionTitle:{color:C.ink,fontSize:16,fontWeight:'900'},countPill:{paddingHorizontal:9,paddingVertical:6,borderRadius:20,backgroundColor:C.blueSoft},countText:{fontSize:8,color:C.blue,fontWeight:'900',letterSpacing:.7},jobCard:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:19,padding:15,marginBottom:12,shadowColor:C.navy,shadowOpacity:.035,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:1},jobTop:{flexDirection:'row',alignItems:'center',gap:11},carThumb:{width:54,height:48,borderRadius:14,alignItems:'center',justifyContent:'center'},plate:{fontSize:15,color:C.ink,fontWeight:'900',letterSpacing:.3},vehicle:{color:C.muted,fontSize:10,marginTop:3},statusPill:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:8,paddingVertical:6,borderRadius:12},statusDot:{width:6,height:6,borderRadius:4},statusText:{fontSize:7,fontWeight:'900',letterSpacing:.4},jobRule:{height:1,backgroundColor:C.line,marginVertical:13},jobInfoRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},infoLabel:{fontSize:7,color:'#9AA7B7',fontWeight:'900',letterSpacing:1},service:{fontSize:10,color:C.ink,fontWeight:'700',marginTop:5,flex:1},commission:{fontSize:11,color:C.green,fontWeight:'900',marginTop:5},customerRow:{borderTopWidth:1,borderColor:'#F0F2F6',marginTop:12,paddingTop:11,flexDirection:'row',alignItems:'center',gap:6},customerIcon:{fontSize:12,color:'#93A0AF'},customerName:{color:C.muted,fontSize:9,flex:1},jobDue:{color:'#9AA7B7',fontSize:8},jobAction:{height:45,marginTop:13,borderRadius:13,backgroundColor:C.blue,alignItems:'center',justifyContent:'center'},completeAction:{backgroundColor:C.green},jobActionText:{color:'#fff',fontSize:11,fontWeight:'900'},syncButton:{height:44,alignItems:'center',justifyContent:'center',marginTop:2},syncText:{color:C.blue,fontSize:10,fontWeight:'800'},footer:{textAlign:'center',color:'#A8B2BF',fontSize:8,fontWeight:'800',letterSpacing:1.4,marginTop:28},empty:{backgroundColor:'#fff',borderRadius:18,padding:29,alignItems:'center',borderWidth:1,borderColor:C.line},emptyGlyph:{color:C.blue,fontSize:28},emptyTitle:{color:C.ink,fontSize:14,fontWeight:'900',marginTop:9},emptyCopy:{color:C.muted,fontSize:10,marginTop:5,textAlign:'center'},earnHero:{backgroundColor:C.navy,borderRadius:21,padding:21,marginBottom:20},earnAmount:{color:'#fff',fontSize:31,fontWeight:'900',marginTop:9},earnCaption:{color:'#9BB1CB',fontSize:10,marginTop:5},earnGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:11},metric:{width:'48%',flexGrow:1,backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:C.line,padding:15},metricLabel:{color:C.muted,fontSize:9},metricAmount:{color:C.ink,fontSize:15,fontWeight:'900',marginTop:8},tip:{backgroundColor:C.blueSoft,padding:13,borderRadius:14,marginTop:15,flexDirection:'row',gap:9,alignItems:'center'},tipIcon:{color:C.blue},tipCopy:{fontSize:10,color:'#426384',flex:1},profileCard:{backgroundColor:'#fff',borderRadius:20,padding:20,alignItems:'center',borderColor:C.line,borderWidth:1},profileAvatar:{width:72,height:72,borderRadius:25,backgroundColor:C.navy,alignItems:'center',justifyContent:'center'},profileInitial:{color:'#fff',fontSize:28,fontWeight:'900'},profileName:{fontSize:18,color:C.ink,fontWeight:'900',marginTop:12},profileRole:{fontSize:10,color:C.muted,marginTop:4},profileDivider:{height:1,backgroundColor:C.line,alignSelf:'stretch',marginVertical:17},profileLine:{alignSelf:'stretch',flexDirection:'row',justifyContent:'space-between',marginBottom:12},profileKey:{fontSize:10,color:C.muted},profileValue:{fontSize:10,color:C.ink,fontWeight:'800'},signout:{height:44,borderRadius:13,borderWidth:1,borderColor:'#F1D4D5',alignSelf:'stretch',alignItems:'center',justifyContent:'center',marginTop:10},signoutText:{color:C.red,fontSize:11,fontWeight:'900'},
  drawerLayer:{...StyleSheet.absoluteFillObject,zIndex:10,flexDirection:'row'},scrim:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(2,11,26,.58)'},drawer:{width:'82%',maxWidth:330,height:'100%',backgroundColor:C.navy,paddingTop:18,paddingHorizontal:18,paddingBottom:24,elevation:16},drawerHeader:{height:60,flexDirection:'row',alignItems:'center',gap:11},drawerLogo:{width:41,height:41,borderRadius:14,backgroundColor:'rgba(10,124,255,.24)',alignItems:'center',justifyContent:'center'},drawerBrand:{color:'#fff',fontSize:13,fontWeight:'900',letterSpacing:1.3},drawerCaption:{color:'#89A0BD',fontSize:8,letterSpacing:1.5,marginTop:3},drawerClose:{marginLeft:'auto',paddingHorizontal:8},drawerProfile:{marginTop:24,marginBottom:27,padding:14,borderRadius:16,backgroundColor:'rgba(255,255,255,.07)',flexDirection:'row',alignItems:'center',gap:11},drawerAvatar:{width:41,height:41,borderRadius:14,backgroundColor:C.blue,alignItems:'center',justifyContent:'center'},drawerName:{color:'#fff',fontSize:12,fontWeight:'900'},drawerRole:{color:'#96AAC3',fontSize:9,marginTop:4},drawerSection:{color:'#778DA9',fontSize:8,fontWeight:'900',letterSpacing:1.5,marginBottom:9},drawerItem:{height:49,borderRadius:13,flexDirection:'row',alignItems:'center',paddingHorizontal:13,gap:13,position:'relative'},drawerItemActive:{backgroundColor:'rgba(10,124,255,.16)'},drawerIcon:{color:'#91A6C0',fontSize:16,width:18,textAlign:'center'},drawerLabel:{color:'#B6C5D7',fontSize:11,fontWeight:'700'},drawerActiveBar:{position:'absolute',right:0,top:13,height:23,width:3,borderRadius:3,backgroundColor:C.blue},drawerFoot:{color:'#94A8C0',fontSize:10,marginBottom:6},drawerVersion:{color:'#586F8A',fontSize:8,letterSpacing:1},
  washScreen:{flex:1,backgroundColor:C.navy,alignItems:'center',justifyContent:'center',padding:25,overflow:'hidden'},splashBrand:{flexDirection:'row',alignItems:'center',gap:9},splashMark:{color:C.blue,fontSize:25},splashName:{color:'#fff',fontSize:16,fontWeight:'900',letterSpacing:2},washArt:{width:290,height:220,marginTop:60,marginBottom:30,alignItems:'center',justifyContent:'center'},washHalo:{position:'absolute',width:220,height:220,borderRadius:120,borderWidth:1,borderColor:'rgba(255,255,255,.11)',backgroundColor:'rgba(10,124,255,.06)'},carWrap:{width:240,height:106,alignItems:'center',justifyContent:'flex-end'},carRoof:{position:'absolute',top:1,width:130,height:63,borderTopLeftRadius:67,borderTopRightRadius:67,borderWidth:4,borderBottomWidth:0,borderColor:'#EAF4FF',backgroundColor:'#143B69'},carWindow:{position:'absolute',top:23,width:103,height:35,borderTopLeftRadius:45,borderTopRightRadius:45,backgroundColor:'#80BDFF',opacity:.74},carBody:{height:48,width:240,borderRadius:23,backgroundColor:'#F4F8FF',borderBottomWidth:8,borderBottomColor:'#B3C7E0',flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:12},carHeadlight:{width:17,height:10,borderRadius:5,backgroundColor:'#A6D6FF'},carGrill:{width:39,height:14,borderBottomLeftRadius:11,borderBottomRightRadius:11,borderWidth:2,borderColor:'#587B9F',backgroundColor:'#27486B'},carTail:{width:12,height:11,borderRadius:5,backgroundColor:'#FF8E89'},wheel:{position:'absolute',bottom:-9,width:30,height:30,borderRadius:16,backgroundColor:'#101B2A',borderWidth:5,borderColor:'#9FB4CC'},waterBeam:{position:'absolute',height:178,width:5,backgroundColor:'#50A9FF',borderRadius:6,shadowColor:C.blue,shadowOpacity:1,shadowRadius:15},bubble:{position:'absolute',width:8,height:8,borderRadius:5,borderWidth:1,borderColor:'#73BEFF',backgroundColor:'rgba(10,124,255,.2)'},washTitle:{color:'#fff',fontSize:18,fontWeight:'900',textAlign:'center'},washMessage:{color:'#A7BAD2',fontSize:11,marginTop:8,textAlign:'center'},loaderTrack:{width:140,height:3,backgroundColor:'rgba(255,255,255,.13)',marginTop:26,borderRadius:3,overflow:'hidden'},loaderFill:{width:60,height:3,backgroundColor:C.blue,borderRadius:3},secureLine:{color:'#65809E',fontSize:8,fontWeight:'800',letterSpacing:1.4,marginTop:22},
  loginRoot:{flex:1,backgroundColor:C.navy},loginTop:{paddingHorizontal:25,paddingTop:30,paddingBottom:14,flex:1},securePill:{alignSelf:'flex-start',marginTop:35,color:'#91BFF1',fontSize:8,fontWeight:'900',letterSpacing:1.2,backgroundColor:'rgba(10,124,255,.13)',paddingHorizontal:10,paddingVertical:7,borderRadius:14},loginTitle:{color:'#fff',fontSize:32,fontWeight:'900',lineHeight:37,letterSpacing:-.5,marginTop:18},loginCopy:{color:'#A8BAD0',fontSize:11,lineHeight:17,marginTop:9,maxWidth:270},miniWash:{height:115,justifyContent:'center',alignItems:'center',marginTop:6,overflow:'hidden'},miniCar:{width:110,height:44,alignItems:'center',justifyContent:'flex-end'},miniRoof:{position:'absolute',top:0,width:57,height:25,borderTopLeftRadius:30,borderTopRightRadius:30,borderWidth:3,borderBottomWidth:0,borderColor:'#B9DCFF',backgroundColor:'#194777'},miniBody:{width:110,height:22,borderRadius:13,backgroundColor:'#ECF5FF'},miniWheel:{position:'absolute',bottom:-5,width:17,height:17,borderRadius:9,backgroundColor:'#07101E',borderWidth:3,borderColor:'#9AB5D3'},miniBeam:{position:'absolute',width:4,height:83,borderRadius:5,backgroundColor:'#43A0FF',shadowColor:C.blue,shadowOpacity:1,shadowRadius:12},loginSheet:{backgroundColor:'#fff',borderTopLeftRadius:27,borderTopRightRadius:27,paddingHorizontal:25,paddingTop:12,paddingBottom:26},sheetHandle:{width:37,height:4,backgroundColor:'#DAE0E8',borderRadius:4,alignSelf:'center',marginBottom:18},formTitle:{fontSize:20,color:C.ink,fontWeight:'900'},formCopy:{color:C.muted,fontSize:10,marginTop:5,marginBottom:20},inputLabel:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:'#68798D',marginBottom:7},input:{height:48,borderWidth:1,borderColor:'#DDE4EC',borderRadius:12,paddingHorizontal:13,color:C.ink,fontSize:12,backgroundColor:'#FBFCFE'},loginButton:{height:50,borderRadius:13,backgroundColor:C.blue,alignItems:'center',justifyContent:'center',marginTop:20},loginButtonText:{color:'#fff',fontSize:12,fontWeight:'900'},loginNote:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,marginTop:15},noteShield:{color:C.green,fontSize:12},noteText:{fontSize:9,color:'#8290A0'}
});
