import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, LogIn, Mail, UserPlus } from 'lucide-react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button.jsx';
import { Text } from '@/components/ui/Text.jsx';
import { authService } from '@/services/authService.js';
import { colors } from '@/theme/colors.js';
import { SalamaLockLogoDark } from '@/assets/index.js';

const pages = {
  login: '#/login',
  register: '#/register',
  forgot: '#/forgot-password'
};

function pageFromHash() {
  if (window.location.hash === pages.register) return 'register';
  if (window.location.hash === pages.forgot) return 'forgot';
  return 'login';
}

function goToPage(page) {
  window.history.pushState(null, '', pages[page]);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function LoginScreen({ onLogin }) {
  const returnToDashboard = new URLSearchParams(window.location.search).get('returnTo')
    || import.meta.env.VITE_MERCHANT_DASHBOARD_URL
    || 'http://localhost:5173/#/merchant';
  const [page, setPage] = useState(pageFromHash);

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', pages.login);
    }

    function handleHashChange() {
      setPage(pageFromHash());
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.rootContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      <View style={styles.authFrame}>
        <View style={styles.brandPanel}>
          <Image source={SalamaLockLogoDark} style={styles.heroLogo} resizeMode="contain" />
          <View style={styles.brandMessage}>
            <Text style={styles.brandKicker}>SECURE FINANCE ACCESS</Text>
            <Text style={styles.brandTitle}>Control every device. Protect every sale.</Text>
            <Text style={styles.brandCopy}>
              This finance identity is used only for your Salama Lock business profile and finance workspace.
            </Text>
          </View>
          <Text style={styles.brandFoot}>SECURE • CONNECTED • BUILT FOR AFRICA</Text>
        </View>
        <View style={styles.formPanel}>
          <View style={styles.shell}>
            <View style={styles.formTopLinks}>
              <Text style={styles.portalLabel}>{page === 'register' ? 'CREATE FINANCE ACCOUNT' : 'FINANCE SIGN IN'}</Text>
              <Pressable style={styles.backToDashboard} onPress={() => { window.location.href = returnToDashboard; }}>
                <Text style={styles.backArrow}>←</Text><Text style={styles.backText}>Back to dashboard</Text>
              </Pressable>
            </View>
            <AuthHeader page={page} />
            {page === 'login' && <LoginPage onLogin={onLogin} />}
            {page === 'register' && <RegisterPage />}
            {page === 'forgot' && <ForgotPasswordPage />}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function AuthHeader({ page }) {
  const title = {
    login: 'Sign in to your finance portal.',
    register: 'Register your finance profile.',
    forgot: 'Reset password'
  }[page];
  const subtitle = {
    login: 'Use your username or email and password to continue.',
    register: 'Create your profile, then wait for administrator approval.',
    forgot: 'Enter your personal email. The OTP will be sent to the phone number linked to your account, then you can change your password.'
  }[page];

  return (
    <View style={styles.header}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function LoginPage({ onLogin }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    try {
      setError('');
      const user = await authService.login(identifier, password);
      if (user.role !== 'finance') {
        setError('This sign-in is only for the finance team.');
        return;
      }
      onLogin(user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <View style={styles.form}>
      <View style={styles.socialRow}>
        <Pressable style={styles.socialButton}><GoogleBrandIcon/><Text style={styles.socialText}>Continue with Google</Text></Pressable>
        <Pressable style={styles.socialButton}><MicrosoftBrandIcon/><Text style={styles.socialText}>Continue with Microsoft</Text></Pressable>
      </View>
      <View style={styles.dividerRow}><View style={styles.dividerLine}/><Text style={styles.dividerText}>OR CONTINUE WITH CREDENTIALS</Text><View style={styles.dividerLine}/></View>
      <Field
        label="Personal email"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="Enter personal email"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry={!showPassword}
        rightAccessory={
          <Pressable onPress={() => setShowPassword((current) => !current)} style={styles.passwordToggle}>
            {showPassword ? <EyeOff size={16} color={colors.primary} /> : <Eye size={16} color={colors.primary} />}
            <Text style={styles.passwordToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </Pressable>
        }
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button icon={LogIn} onPress={handleLogin} style={styles.fullButton}>Sign in</Button>
      <View style={styles.linkRow}>
        <AuthLink label="Create account" onPress={() => goToPage('register')} />
        <AuthLink label="Forgot password?" onPress={() => goToPage('forgot')} />
      </View>
    </View>
  );
}

function GoogleBrandIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.63.39 3.17 1.04 4.55l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>;
}

function MicrosoftBrandIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>;
}

function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordChecks = usePasswordChecks(password, confirmPassword);
  const canSubmit = fullName.trim() && email.trim() && passwordChecks.allValid;

  async function handleRegister() {
    if (!canSubmit) {
      setError('Complete the account details and password checks.');
      return;
    }

    try {
      setError('');
      await authService.register({ fullName, email, phone, password });
      authService.logout();
      setError('Finance account submitted. Admin must approve it before sign-in. You will receive an SMS after approval.');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <View style={styles.form}>
      <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your full name" />
      <Field label="Personal email" value={email} onChangeText={setEmail} placeholder="Enter your email" />
      <Field label="Phone number" value={phone} onChangeText={setPhone} placeholder="Enter phone number" />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 10 characters"
        secureTextEntry={!showPassword}
        rightAccessory={
          <Pressable onPress={() => setShowPassword((current) => !current)} style={styles.passwordToggle}>
            {showPassword ? <EyeOff size={16} color={colors.primary} /> : <Eye size={16} color={colors.primary} />}
            <Text style={styles.passwordToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </Pressable>
        }
      />
      <Field
        label="Confirm password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Repeat password"
        secureTextEntry={!showConfirmPassword}
        rightAccessory={
          <Pressable onPress={() => setShowConfirmPassword((current) => !current)} style={styles.passwordToggle}>
            {showConfirmPassword ? <EyeOff size={16} color={colors.primary} /> : <Eye size={16} color={colors.primary} />}
            <Text style={styles.passwordToggleText}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
          </Pressable>
        }
      />
      {(password || confirmPassword) ? (
        <Text style={styles.passwordHint}>
          Password must be at least 10 characters and include uppercase, lowercase, number, special character, and match confirmation.
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button icon={UserPlus} onPress={handleRegister} style={[styles.fullButton, styles.submitButtonSpacing]}>Create account</Button>
      <View style={styles.singleLinkRow}>
        <AuthLink label="Back to sign in" onPress={() => goToPage('login')} />
      </View>
    </View>
  );
}

function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [linkedPhoneMasked, setLinkedPhoneMasked] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordChecks = usePasswordChecks(password, confirmPassword);
  const otpComplete = /^\d{6}$/.test(otp.trim());
  const otpRemainingMs = Math.max(otpExpiresAt - now, 0);
  const otpExpired = otpSent && otpRemainingMs === 0;
  const otpRemainingText = formatCountdown(otpRemainingMs);
  const resendRemainingMs = Math.max(resendAvailableAt - now, 0);
  const resendRemainingText = formatCountdown(resendRemainingMs);

  useEffect(() => {
    if (otpVerified) return;
    setPassword('');
    setConfirmPassword('');
  }, [otpVerified]);

  useEffect(() => {
    if (!otpSent || otpVerified) return undefined;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [otpSent, otpVerified]);

  useEffect(() => {
    if (!otpExpired) return;
    setOtpVerified(false);
    setResetToken('');
    setOtp('');
  }, [otpExpired]);

  async function sendOtp() {
    try {
      setError('');
      const submittedEmail = identifier.trim();
      const result = await authService.requestPasswordReset({ email: submittedEmail });
      const smsAccepted = Boolean(result.providerAccepted ?? result.sent);
      if (!smsAccepted) {
        setOtpSent(false);
        setResetEmail('');
        setLinkedPhoneMasked('');
        setResetToken('');
        setNotice('');
        setError(result.message || result.error || 'OTP delivery failed. Confirm the email linked to your account and try again.');
        return;
      }

      setResetEmail(submittedEmail);
      setLinkedPhoneMasked(result.linkedPhoneMasked || '');
      setResetToken('');
      setOtpSent(true);
      setOtpExpiresAt(Date.now() + 10 * 60 * 1000);
      setResendAvailableAt(result.resendAvailableAt ? new Date(result.resendAvailableAt).getTime() : Date.now() + 60 * 1000);
      setNow(Date.now());
      setNotice('');
    } catch (err) {
      const retryMs = err.resendAvailableAt
        ? new Date(err.resendAvailableAt).getTime()
        : err.retryAfterSeconds
          ? Date.now() + Number(err.retryAfterSeconds) * 1000
          : 0;
      if (retryMs) {
        setResendAvailableAt(retryMs);
        setNow(Date.now());
      }
      setLinkedPhoneMasked('');
      setError(err.message);
    }
  }

  async function resetPassword() {
    if (!otpVerified || !resetToken || !passwordChecks.allValid) {
      setError('Verify the OTP and complete the password checks.');
      return;
    }

    try {
      setError('');
      await authService.resetPassword({ email: resetEmail || identifier, resetToken, password });
      setNotice('Password updated. You can sign in now.');
      window.setTimeout(() => goToPage('login'), 900);
    } catch (err) {
      setError(err.message);
    }
  }

  function backToResendOtp() {
    setOtpSent(false);
    setOtpVerified(false);
    setOtpExpiresAt(0);
    setOtp('');
    setResetEmail('');
    setLinkedPhoneMasked('');
    setResetToken('');
    setPassword('');
    setConfirmPassword('');
    setNotice('');
    setError('');
  }

  async function verifyOtp() {
    setError('');

    if (otpExpired) {
      setOtpVerified(false);
      setError('OTP expired. Go back and resend OTP.');
      return;
    }

    if (!otpComplete) {
      setOtpVerified(false);
      setError('Enter the 6-digit OTP.');
      return;
    }

    try {
      const result = await authService.verifyPasswordResetOtp({ email: resetEmail || identifier, otp });
      if (!result.resetToken && !result.token) {
        throw new Error('Could not create a reset token. Please resend the OTP.');
      }
      setResetToken(result.resetToken || result.token || '');
      setOtpVerified(true);
    } catch (err) {
      setOtpVerified(false);
      setResetToken('');
      setError(err.message);
    }
  }

  function updateOtp(value) {
    setOtp(value);
    setOtpVerified(false);
    setResetToken('');
  }

  return (
    <View style={styles.form}>
      {!otpSent ? (
        <>
          <View style={styles.formGroup}>
            <Text style={styles.formGroupTitle}>Account</Text>
            <Text style={styles.formGroupHelp}>Enter your personal email. The OTP will be sent to the phone number linked to your account.</Text>
          </View>
          <Field
            label="Personal email"
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="Enter personal email"
          />
          <Button icon={Mail} onPress={sendOtp} style={styles.fullButton}>Send OTP</Button>
        </>
      ) : (
        <>
          <View style={styles.formGroup}>
            <Text style={styles.formGroupTitle}>Password and OTP</Text>
            {!otpVerified && (
              <>
                <Text style={styles.formGroupHelp}>Enter the 6-digit OTP.</Text>
                {linkedPhoneMasked ? (
                  <Text style={styles.formGroupHelp}>
                    OTP sent to the phone number linked to your account ({linkedPhoneMasked}).
                  </Text>
                ) : null}
                <Text style={otpExpired ? styles.countdownExpired : styles.countdownText}>
                  {otpExpired ? 'OTP expired' : `OTP expires in ${otpRemainingText}`}
                </Text>
              </>
            )}
          </View>
          {!otpVerified && (
            <>
              <View style={styles.compactActionRow}>
                <Pressable
                  onPress={backToResendOtp}
                  disabled={resendRemainingMs > 0}
                  style={[styles.compactLinkButton, resendRemainingMs > 0 ? styles.compactLinkDisabled : null]}
                >
                  <Text style={styles.compactLinkText}>
                    {resendRemainingMs > 0
                      ? `No OTP received? Resend available in ${resendRemainingText}.`
                      : 'No OTP received? Confirm your personal email, then resend the code.'}
                  </Text>
                </Pressable>
              </View>
              <View>
                <View style={styles.otpLabelRow}>
                  <Text style={styles.otpLabel}>OTP</Text>
                  <Text style={styles.otpInlineHint}>Enter the 6-digit OTP.</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholderTextColor={colors.muted}
                  value={otp}
                  onChangeText={updateOtp}
                  placeholder="Enter OTP"
                  maxLength={6}
                />
              </View>
              <Button icon={KeyRound} onPress={verifyOtp} style={styles.fullButton}>Verify OTP</Button>
            </>
          )}
          {otpVerified && (
            <>
              <View style={styles.formGroup}>
                <Text style={styles.formGroupHelp}>OTP verified. Set your new password.</Text>
              </View>
              <Field
                label="New password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 10 characters"
                secureTextEntry={!showPassword}
                rightAccessory={
                  <Pressable onPress={() => setShowPassword((current) => !current)} style={styles.passwordToggle}>
                    {showPassword ? <EyeOff size={16} color={colors.primary} /> : <Eye size={16} color={colors.primary} />}
                    <Text style={styles.passwordToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                }
              />
              <Field
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat password"
                secureTextEntry={!showConfirmPassword}
                rightAccessory={
                  <Pressable onPress={() => setShowConfirmPassword((current) => !current)} style={styles.passwordToggle}>
                    {showConfirmPassword ? <EyeOff size={16} color={colors.primary} /> : <Eye size={16} color={colors.primary} />}
                    <Text style={styles.passwordToggleText}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                }
              />
              <Button icon={KeyRound} onPress={resetPassword} style={styles.fullButton}>Change password</Button>
            </>
          )}
        </>
      )}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.singleLinkRow}>
        <AuthLink label="Back to sign in" onPress={() => goToPage('login')} />
      </View>
    </View>
  );
}

function maskAccount(value) {
  const account = String(value || '').trim();

  if (account.includes('@')) {
    const [name, domain] = account.split('@');
    const visible = name.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(name.length - 2, 3))}@${domain}`;
  }

  const digits = account.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `${account.slice(0, 3)}****${account.slice(-2)}`;
  }

  return 'your account';
}

function formatCountdown(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function Field({ label, rightAccessory, ...props }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordFieldRow}>
        <TextInput
          style={[styles.input, rightAccessory && styles.passwordFieldInput]}
          placeholderTextColor={colors.muted}
          {...props}
        />
        {rightAccessory ? <View style={styles.passwordAccessory}>{rightAccessory}</View> : null}
      </View>
    </View>
  );
}

function AuthLink({ label, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.linkButton}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

function usePasswordChecks(password, confirmPassword) {
  return useMemo(() => {
    const checks = {
      length: password.length >= 10,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
      match: Boolean(password) && password === confirmPassword
    };

    return {
      ...checks,
      allValid: Object.values(checks).every(Boolean)
    };
  }, [password, confirmPassword]);
}

const styles = StyleSheet.create({
  root: {
    height: 'var(--app-vh)',
    backgroundColor: 'var(--app-bg)',
    width: '100%',
    overflowY: 'auto'
  },
  rootContent: {
    minHeight: 'var(--app-vh)',
    backgroundColor: '#ffffff'
  },
  authFrame: {
    width: '100%',
    minHeight: 'var(--app-vh)',
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  brandPanel: {
    flexGrow: 1,
    flexBasis: 430,
    minHeight: 430,
    padding: 48,
    justifyContent: 'flex-start',
    backgroundColor: '#06170e',
    backgroundImage: 'radial-gradient(circle at 25% 30%, rgba(53,225,116,.15), transparent 32%)'
  },
  heroLogo: {
    width: 245,
    height: 78,
    backgroundColor: 'transparent'
  },
  brandMessage: {
    maxWidth: 560,
    gap: 18,
    marginTop: 105
  },
  brandKicker: {
    color: '#35e174',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '700'
  },
  brandCopy: {
    color: '#aab3ac',
    fontSize: 16,
    lineHeight: 27
  },
  brandFoot: {
    color: '#657068',
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 'auto'
  },
  formPanel: {
    position: 'relative',
    flexGrow: 1,
    flexBasis: 430,
    minHeight: 600,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#ffffff'
  },
  backToDashboard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  portalLabel: {
    color: '#159447',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2
  },
  backArrow: {
    color: '#69736c',
    fontSize: 20
  },
  backText: {
    color: '#69736c',
    fontSize: 12,
    fontWeight: '700'
  },
  shell: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: 'var(--app-surface)',
    padding: 0
  },
  formTopLinks: {
    gap: 12,
    marginBottom: 42
  },
  header: {
    gap: 10,
    marginBottom: 28
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  mark: {
    width: 70,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  markLogo: {
    width: 68,
    height: 46,
    borderRadius: 0
  },
  markText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '500'
  },
  brand: {
    fontSize: 18,
    fontWeight: '800'
  },
  subBrand: {
    color: 'var(--app-muted)',
    marginTop: 1
  },
  titleBlock: {
    gap: 14
  },
  formKicker: {
    color: '#23d96b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2
  },
  lockRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: '#cfe0fb',
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 28
  },
  lockText: {
    color: colors.primary,
    fontWeight: '500',
    fontSize: 13
  },
  title: {
    fontSize: 48,
    lineHeight: 54,
    fontWeight: '700'
  },
  subtitle: {
    color: 'var(--app-muted)',
    lineHeight: 18
  },
  form: {
    gap: 16
  },
  socialRow: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap'
  },
  socialButton: {
    flexGrow: 1,
    flexBasis: 180,
    minHeight: 62,
    borderWidth: 1,
    borderColor: '#dce3de',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12
  },
  socialText: {
    color: '#151a16',
    fontWeight: '700'
  },
  googleMark: {
    color: '#4285f4',
    fontWeight: '800',
    fontSize: 20
  },
  microsoftMark: {
    color: '#00a4ef',
    fontSize: 21
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 6
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#dce3de'
  },
  dividerText: {
    color: '#929a94',
    fontSize: 9,
    letterSpacing: 0.6
  },
  formGroup: {
    gap: 5,
    marginBottom: 3
  },
  formGroupTitle: {
    fontSize: 16,
    fontWeight: '600'
  },
  formGroupHelp: {
    color: 'var(--app-muted)',
    fontSize: 13,
    lineHeight: 18
  },
  countdownText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right'
  },
  countdownExpired: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right'
  },
  label: {
    fontSize: 12,
    color: 'var(--app-muted)',
    fontWeight: '500',
    marginBottom: 6
  },
  input: {
    minHeight: 41,
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 8,
    paddingHorizontal: 12,
    outlineStyle: 'none',
    color: 'var(--app-text)',
    backgroundColor: 'var(--app-surface)'
  },
  passwordFieldRow: {
    position: 'relative',
    width: '100%'
  },
  passwordFieldInput: {
    paddingRight: 86
  },
  passwordAccessory: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center'
  },
  passwordToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  passwordToggleText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700'
  },
  fullButton: {
    width: '100%',
    minHeight: 54,
    backgroundColor: '#151a16',
    borderColor: '#151a16'
  },
  submitButtonSpacing: {
    marginTop: 4
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap'
  },
  singleLinkRow: {
    alignItems: 'center'
  },
  compactActionRow: {
    alignItems: 'flex-start',
    marginTop: -6,
    marginBottom: -2
  },
  compactLinkButton: {
    minHeight: 18,
    justifyContent: 'center'
  },
  compactLinkDisabled: {
    opacity: 0.6
  },
  compactLinkText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '500'
  },
  otpLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
    marginBottom: 8
  },
  otpLabel: {
    fontSize: 12,
    color: 'var(--app-muted)',
    fontWeight: '500'
  },
  otpInlineHint: {
    color: colors.success,
    fontSize: 12
  },
  otpInlineHintSuccess: {
    color: colors.success,
    fontSize: 12
  },
  linkButton: {
    minHeight: 32,
    justifyContent: 'center'
  },
  linkText: {
    color: '#69736c',
    fontWeight: '500'
  },
  help: {
    textAlign: 'center',
    color: 'var(--app-muted)',
    fontSize: 12
  },
  error: {
    color: colors.danger,
    fontWeight: '500'
  },
  successText: {
    color: colors.success,
    fontWeight: '500'
  },
  passwordHint: {
    color: colors.success,
    fontSize: 11,
    lineHeight: 16,
    marginTop: -3
  },
  notice: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '500'
  }
});

