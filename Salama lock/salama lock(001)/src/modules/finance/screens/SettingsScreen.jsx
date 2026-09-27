import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Camera,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Headphones,
  KeyRound,
  LockKeyhole,
  Moon,
  Palette,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  UserRound
} from 'lucide-react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button.jsx';
import { Text } from '@/components/ui/Text.jsx';
import { authService } from '@/services/authService.js';
import { colors } from '@/theme/colors.js';

export function SettingsScreen({
  profilePhoto,
  onProfilePhotoChange,
  profileSettings,
  onProfileSettingsChange,
  onStatusMessage,
  themeMode,
  onThemeModeChange,
  appLayout,
  onAppLayoutChange,
  canInstall,
  onInstall
}) {
  const fileInputRef = useRef(null);
  const [name, setName] = useState(() => profileSettings?.name || '');
  const [role, setRole] = useState(() => profileSettings?.role || '');
  const [phone, setPhone] = useState(() => profileSettings?.phone || '');
  const [branch, setBranch] = useState(() => profileSettings?.branch || '');
  const [paymentAlerts, setPaymentAlerts] = useState(true);
  const [overdueAlerts, setOverdueAlerts] = useState(false);
  const [commissionAlerts, setCommissionAlerts] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState('30 minutes');
  const [deviceLock, setDeviceLock] = useState(false);
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [passwordEmail, setPasswordEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [auditOpen, setAuditOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');

  useEffect(() => {
    setHelpOpen(false);
  }, []);

  useEffect(() => {
    setName(profileSettings?.name || '');
    setRole(profileSettings?.role || '');
    setPhone(profileSettings?.phone || '');
    setBranch(profileSettings?.branch || '');
  }, [profileSettings]);

  const identifierValid = passwordEmail.trim().includes('@') && !/\s/.test(passwordEmail.trim());
  const otpValid = /^\d{6}$/.test(otpCode.trim());
  const passwordChecks = {
    length: newPassword.length >= 10,
    unique: new Set(newPassword).size >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword)
  };
  const passwordValid = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = newPassword && newPassword === confirmPassword;

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      onProfilePhotoChange(reader.result);
      showMessage('Profile picture updated.');
    };
    reader.readAsDataURL(file);
  }

  function showMessage(message) {
    setSettingsNotice(message);
  }

  async function saveProfile() {
    try {
      const updated = await authService.updateProfile({ name, phone, branch });
      const nextProfile = {
        name: updated.name || updated.fullName || name,
        role: updated.role || role,
        phone: updated.phone || '',
        branch: updated.branch || ''
      };
      onProfileSettingsChange?.(nextProfile);
      onStatusMessage?.('Profile details saved.');
      showMessage('Profile saved successfully.');
    } catch (error) {
      showMessage(error.message);
    }
  }

  function deleteProfile() {
    window.sessionStorage.removeItem('SALAMA LOCK-profile-photo');
    const nextProfile = {
      name: profileSettings?.name || '',
      role: profileSettings?.role || '',
      phone: '',
      branch: ''
    };
    setName(nextProfile.name);
    setRole(nextProfile.role);
    setPhone('');
    setBranch('');
    authService.updateProfile(nextProfile).then((updated) => {
      onProfileSettingsChange?.({
        name: updated.name || updated.fullName || nextProfile.name,
        role: updated.role || nextProfile.role,
        phone: updated.phone || '',
        branch: updated.branch || ''
      });
    }).catch((error) => showMessage(error.message));
    onProfilePhotoChange('');
    showMessage('Profile details cleared.');
  }

  async function sendOtp() {
    if (!identifierValid) {
      setPasswordNotice('Enter your email address before sending OTP.');
      return;
    }

    try {
      const submittedEmail = passwordEmail.trim();
      const result = await authService.requestPasswordReset({
        email: submittedEmail
      });
      const smsAccepted = Boolean(result.providerAccepted ?? result.sent);
      if (!smsAccepted) {
        setOtpSent(false);
        setResetEmail('');
        setResetToken('');
        setPasswordNotice(result.message || result.error || 'OTP delivery failed. Confirm the email linked to your account and try again.');
        return;
      }
      setResetEmail(submittedEmail);
      setResetToken('');
      setOtpSent(true);
      setPasswordNotice(result.linkedPhoneMasked
        ? `OTP sent to the phone number linked to your account (${result.linkedPhoneMasked}).`
        : result.message || 'OTP sent to the phone number linked to your account.');
    } catch (error) {
      setResetEmail('');
      setResetToken('');
      setPasswordNotice(error.message);
    }
  }

  async function changePassword() {
    if (!identifierValid || !otpValid || !passwordValid || !passwordsMatch) {
      setPasswordNotice('Complete all security checks before changing password.');
      return;
    }

    try {
      const result = await authService.verifyPasswordResetOtp({
        email: resetEmail || passwordEmail.trim(),
        otp: otpCode.trim()
      });
      if (!result.resetToken && !result.token) {
        throw new Error('Could not create a reset token. Please resend the OTP.');
      }
      setResetToken(result.resetToken || result.token || '');
      await authService.resetPassword({
        email: resetEmail || passwordEmail.trim(),
        resetToken: result.resetToken || result.token || resetToken,
        password: newPassword
      });
      setOtpCode('');
      setResetToken('');
      setResetEmail('');
      setNewPassword('');
      setConfirmPassword('');
      setOtpSent(false);
      setPasswordNotice('Password changed successfully.');
    } catch (error) {
      setResetToken('');
      setPasswordNotice(error.message);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.activityLine}>
          <View style={styles.activityDot} />
          <Text style={styles.eyebrow}>Me activity</Text>
        </View>
        <Text style={styles.title}>Settings</Text>
        {settingsNotice ? <Text style={styles.settingsNotice}>{settingsNotice}</Text> : null}
      </View>

      <View style={styles.profilePanel}>
        <View style={styles.photoPreview}>
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.photoImage} />
          ) : (
            <Text style={styles.photoInitials}>{initialsFor(name)}</Text>
          )}
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{name}</Text>
        </View>
        <Button variant="secondary" icon={Camera} onPress={() => fileInputRef.current?.click()}>
          {profilePhoto ? 'Update profile picture' : 'Add profile picture'}
        </Button>
        <Pressable onPress={deleteProfile} style={styles.deleteProfileButton}>
          <Trash2 size={17} color={colors.danger} />
          <Text style={styles.deleteProfileText}>Delete profile</Text>
        </Pressable>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          style={{ display: 'none' }}
        />
      </View>

      <SettingsGroup title="Appearance">
        <View style={styles.themeRow}>
          <View style={[styles.icon, { backgroundColor: colors.violetSoft }]}>
            <Palette size={18} color={colors.violet} />
          </View>
          <Text style={styles.label}>Theme</Text>
          <View style={styles.segmented}>
            <ThemeButton
              label="Light"
              icon={Sun}
              active={themeMode === 'light'}
              onPress={() => onThemeModeChange('light')}
            />
            <ThemeButton
              label="Dark"
              icon={Moon}
              active={themeMode === 'dark'}
              onPress={() => onThemeModeChange('dark')}
            />
          </View>
        </View>
        <View style={styles.themeRow}>
          <View style={[styles.icon, { backgroundColor: colors.tealSoft }]}>
            <Smartphone size={18} color={colors.teal} />
          </View>
          <Text style={styles.label}>App layout</Text>
          <View style={styles.segmented}>
            <ChoiceButton
              label="App view"
              active={appLayout === 'App view'}
              onPress={() => onAppLayoutChange('App view')}
            />
            <ChoiceButton
              label="Compact"
              active={appLayout === 'Compact view'}
              onPress={() => onAppLayoutChange('Compact view')}
            />
          </View>
        </View>
        <SettingRow
          icon={Download}
          label="Install app"
          value="Install app"
          tone="orange"
          onPress={onInstall}
        />
      </SettingsGroup>

      <SettingsGroup title="Profile">
        <EditableSettingRow
          icon={UserRound}
          label="Name"
          value={name}
          onChangeText={setName}
          tone="teal"
        />
        <EditableSettingRow icon={UserRound} label="Role" value={role} onChangeText={setRole} tone="violet" editable={false} />
        <EditableSettingRow icon={Smartphone} label="Phone" value={phone} onChangeText={setPhone} tone="green" />
        <EditableSettingRow icon={FileText} label="Branch" value={branch} onChangeText={setBranch} tone="blue" />
        <View style={styles.saveRow}>
          <Pressable onPress={saveProfile} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
        </View>
      </SettingsGroup>

      <SettingsGroup title="Notifications">
        <SwitchSettingRow icon={Bell} label="Payment alerts" value={paymentAlerts} tone="green" onChange={setPaymentAlerts} />
        <SwitchSettingRow icon={Bell} label="Overdue alerts" value={overdueAlerts} tone="red" onChange={setOverdueAlerts} />
        <SwitchSettingRow icon={Bell} label="Commission alerts" value={commissionAlerts} tone="amber" onChange={setCommissionAlerts} />
      </SettingsGroup>

      <SettingsGroup title="Security">
        <SettingRow icon={ShieldCheck} label="App access" value="Finance team only" tone="green" onPress={() => showMessage('Only finance users can access this app.')} />
        <LockedOnSettingRow icon={KeyRound} label="OTP sign-in" tone="amber" />
        <DropdownSettingRow
          icon={Clock3}
          label="Session timeout"
          value={sessionTimeout}
          onChange={setSessionTimeout}
          tone="red"
          options={['15 minutes', '30 minutes', '1 hour']}
        />
        <SwitchSettingRow icon={LockKeyhole} label="Device lock" value={deviceLock} tone="violet" onChange={setDeviceLock} />
      </SettingsGroup>

      <SettingsGroup title="Account">
        <SettingRow
          icon={KeyRound}
          label="Password and OTP"
          value="Change password"
          tone="blue"
          action
          open={passwordFormOpen}
          onPress={() => setPasswordFormOpen(!passwordFormOpen)}
        />
        {passwordFormOpen && (
          <View style={styles.passwordForm}>
            {!otpSent ? (
              <>
                <TextInput
                  value={passwordEmail}
                  onChangeText={setPasswordEmail}
                  style={styles.formInput}
                  placeholder="Enter email address"
                  placeholderTextColor="var(--app-muted)"
                />
                <View style={styles.validationRow}>
                  <Text style={[styles.validationText, identifierValid && styles.validationOk]}>
                    {identifierValid ? 'Email ready' : 'Enter your email address to receive OTP'}
                  </Text>
                  <Pressable onPress={sendOtp} style={[styles.smallAction, !identifierValid && styles.smallActionDisabled]}>
                    <Text style={styles.smallActionText}>Send OTP</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={styles.validationRow}>
                  <Pressable
                  onPress={() => {
                    setOtpSent(false);
                    setResetEmail('');
                    setResetToken('');
                    setPasswordNotice('No OTP received? Confirm the email linked to your account and resend the code.');
                  }}
                  style={styles.backButton}
                >
                  <Text style={styles.backButtonText}>Back to resend OTP</Text>
                </Pressable>
                  <Text style={styles.validationText}>Enter the OTP sent to the phone number linked to your account.</Text>
                </View>

                <TextInput
                  value={otpCode}
                  onChangeText={(value) => {
                    setOtpCode(value);
                    setResetToken('');
                  }}
                  style={styles.formInput}
                  placeholder="Enter 6-digit OTP"
                  placeholderTextColor="var(--app-muted)"
                  maxLength={6}
                />
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  style={styles.formInput}
                  placeholder="New password"
                  placeholderTextColor="var(--app-muted)"
                  secureTextEntry
                />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={styles.formInput}
                  placeholder="Confirm password"
                  placeholderTextColor="var(--app-muted)"
                  secureTextEntry
                />

                <View style={styles.checkList}>
                  <Text style={[styles.validationText, otpValid && styles.validationOk]}>
                    {otpValid ? 'OTP code ready' : 'OTP must be 6 digits'}
                  </Text>
                  <Text style={[styles.validationText, passwordChecks.length && styles.validationOk]}>
                    {passwordChecks.length ? '10 characters minimum' : 'Use at least 10 characters'}
                </Text>
                <Text style={[styles.validationText, passwordChecks.unique && styles.validationOk]}>
                  {passwordChecks.unique ? '8 different characters included' : 'Use at least 8 different characters'}
                </Text>
                <Text style={[styles.validationText, passwordChecks.upper && styles.validationOk]}>
                  {passwordChecks.upper ? 'Uppercase letter included' : 'Add one uppercase letter'}
                </Text>
                <Text style={[styles.validationText, passwordChecks.lower && styles.validationOk]}>
                  {passwordChecks.lower ? 'Lowercase letter included' : 'Add one lowercase letter'}
                </Text>
                <Text style={[styles.validationText, passwordChecks.number && styles.validationOk]}>
                  {passwordChecks.number ? 'Number included' : 'Add one number'}
                </Text>
                <Text style={[styles.validationText, passwordChecks.special && styles.validationOk]}>
                  {passwordChecks.special ? 'Special character included' : 'Add one special character'}
                </Text>
                  <Text style={[styles.validationText, passwordsMatch && styles.validationOk]}>
                    {passwordsMatch ? 'Passwords match' : 'Passwords must match'}
                  </Text>
                </View>

                <Pressable
                  onPress={changePassword}
                  style={[
                    styles.changePasswordButton,
                    (!identifierValid || !otpValid || !passwordValid || !passwordsMatch) && styles.changePasswordButtonDisabled
                  ]}
                >
                  <Text style={styles.changePasswordText}>Update password</Text>
                </Pressable>
              </>
            )}

            {passwordNotice ? <Text style={styles.passwordNotice}>{passwordNotice}</Text> : null}
          </View>
        )}
        <SettingRow
          icon={FileText}
          label="Audit trail"
          value="View activity"
          tone="orange"
          action
          open={auditOpen}
          onPress={() => setAuditOpen(!auditOpen)}
        />
        {auditOpen && (
          <View style={styles.auditPanel}>
            <Text style={styles.formTitle}>Activity trail</Text>
            <Text style={styles.helpText}>No audit records loaded yet.</Text>
          </View>
        )}
        <SettingRow
          icon={Headphones}
          label="Help"
          value="Contact support"
          tone="teal"
          action
          open={helpOpen}
          onPress={() => setHelpOpen(!helpOpen)}
        />
        {helpOpen && (
          <View style={styles.helpPanel}>
            <Text style={styles.formTitle}>Support</Text>
            <Text style={styles.helpText}>Support contact details will be shown here when added by the admin.</Text>
          </View>
        )}
      </SettingsGroup>
    </View>
  );
}

function ThemeButton({ label, icon: Icon, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.themeButton, active && styles.themeButtonActive]}>
      <Icon size={15} color={active ? '#ffffff' : colors.slate} />
      <Text style={[styles.themeButtonText, active && styles.themeButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ChoiceButton({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.themeButton, active && styles.themeButtonActive]}>
      <Text style={[styles.themeButtonText, active && styles.themeButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function initialsFor(name) {
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || '--';
}

function SettingsGroup({ title, children }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

function SettingRow({ icon: Icon, label, value, tone, action, open = false, onPress }) {
  const color = toneColors[tone] ?? toneColors.blue;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={[styles.icon, { backgroundColor: color.soft }]}>
        <Icon size={18} color={color.main} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text numberOfLines={1} style={[styles.value, action && { color: colors.primary }]}>
        {value}
      </Text>
      {open ? (
        <ChevronDown size={18} color={colors.muted} />
      ) : (
        <ChevronRight size={18} color={colors.muted} />
      )}
    </Pressable>
  );
}

function SwitchSettingRow({ icon: Icon, label, value, tone, onChange }) {
  const color = toneColors[tone] ?? toneColors.blue;

  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.row,
        value && styles.switchRowOn,
        pressed && styles.rowPressed
      ]}
    >
      <View style={[styles.icon, { backgroundColor: value ? colors.primarySoft : color.soft }]}>
        <Icon size={18} color={value ? colors.primary : color.main} />
      </View>
      <Text style={[styles.label, value && styles.switchLabelOn]}>{label}</Text>
      <View style={styles.switchWrap}>
        <Text style={[styles.switchText, value && { color: colors.primary }]}>{value ? 'On' : 'Off'}</Text>
        <View style={[styles.switchTrack, value && styles.switchTrackOn]}>
          <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
        </View>
      </View>
    </Pressable>
  );
}

function LockedOnSettingRow({ icon: Icon, label, tone }) {
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <Icon size={18} color={colors.primary} />
      </View>
      <Text style={[styles.label, styles.switchLabelOn]}>{label}</Text>
      <View style={styles.switchWrap}>
        <Text style={[styles.switchText, { color: colors.primary }]}>On</Text>
        <View style={[styles.switchTrack, styles.switchTrackOn]}>
          <View style={[styles.switchThumb, styles.switchThumbOn]} />
        </View>
      </View>
    </View>
  );
}

function EditableSettingRow({ icon: Icon, label, value, onChangeText, tone, editable = true }) {
  const color = toneColors[tone] ?? toneColors.blue;

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: color.soft }]}>
        <Icon size={18} color={color.main} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.editInput}
        placeholder={label}
        placeholderTextColor={colors.muted}
        editable={editable}
      />
    </View>
  );
}

function DropdownSettingRow({ icon: Icon, label, value, onChange, tone, options }) {
  const color = toneColors[tone] ?? toneColors.blue;

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: color.soft }]}>
        <Icon size={18} color={color.main} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dropdownWrap}>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={styles.select}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <Text style={styles.appliedText}>Applied</Text>
      </View>
    </View>
  );
}

const toneColors = {
  blue: { main: colors.primary, soft: colors.primarySoft },
  green: { main: colors.success, soft: colors.successSoft },
  amber: { main: colors.warning, soft: colors.warningSoft },
  red: { main: colors.danger, soft: colors.dangerSoft },
  teal: { main: colors.teal, soft: colors.tealSoft },
  violet: { main: colors.violet, soft: colors.violetSoft },
  orange: { main: colors.orange, soft: colors.orangeSoft }
};

const styles = StyleSheet.create({
  page: {
    gap: 18,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center'
  },
  header: {
    paddingTop: 2
  },
  title: {
    fontSize: 24,
    fontWeight: '500'
  },
  activityLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 5
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.success
  },
  eyebrow: {
    color: 'var(--app-muted)',
    fontSize: 12,
    fontWeight: '500'
  },
  settingsNotice: {
    color: colors.success,
    fontSize: 13,
    marginTop: 6,
    fontWeight: '500'
  },
  profilePanel: {
    backgroundColor: 'var(--app-surface)',
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap'
  },
  photoPreview: {
    width: 72,
    height: 72,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  photoImage: {
    width: '100%',
    height: '100%'
  },
  photoInitials: {
    color: colors.primary,
    fontWeight: '500',
    fontSize: 20
  },
  profileInfo: {
    flex: 1,
    minWidth: 180
  },
  profileName: {
    fontSize: 18,
    fontWeight: '500'
  },
  profileCode: {
    color: 'var(--app-muted)',
    marginTop: 4
  },
  deleteProfileButton: {
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  deleteProfileText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '500'
  },
  group: {
    gap: 8
  },
  groupTitle: {
    color: 'var(--app-muted)',
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 4
  },
  list: {
    backgroundColor: 'var(--app-surface)',
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 12,
    overflow: 'hidden'
  },
  row: {
    minHeight: 58,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--app-border)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  rowPressed: {
    backgroundColor: 'rgba(7, 87, 200, 0.06)'
  },
  switchRowOn: {
    backgroundColor: 'rgba(7, 87, 200, 0.08)'
  },
  switchLabelOn: {
    color: colors.primary
  },
  themeRow: {
    minHeight: 64,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--app-border)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500'
  },
  value: {
    maxWidth: '42%',
    color: 'var(--app-muted)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right'
  },
  editInput: {
    minHeight: 38,
    minWidth: 190,
    maxWidth: 260,
    flex: 1,
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 8,
    paddingHorizontal: 10,
    color: 'var(--app-text)',
    backgroundColor: 'var(--app-bg)',
    outlineStyle: 'none',
    fontSize: 14,
    fontWeight: '500'
  },
  dropdownWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end'
  },
  select: {
    minHeight: 36,
    minWidth: 140,
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 5,
    paddingInline: 10,
    color: 'var(--app-text)',
    backgroundColor: 'var(--app-surface)',
    outline: 'none',
    fontSize: 14,
    fontWeight: 500
  },
  passwordForm: {
    padding: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--app-border)',
    backgroundColor: 'var(--app-bg)'
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '500'
  },
  formHint: {
    color: 'var(--app-muted)',
    fontSize: 12
  },
  formInput: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 5,
    paddingHorizontal: 10,
    color: 'var(--app-text)',
    backgroundColor: 'var(--app-surface)',
    outlineStyle: 'none',
    fontSize: 14
  },
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap'
  },
  validationText: {
    color: 'var(--app-muted)',
    fontSize: 12,
    fontWeight: '500'
  },
  validationOk: {
    color: colors.success
  },
  smallAction: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  smallActionDisabled: {
    opacity: 0.5
  },
  smallActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500'
  },
  backButton: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    backgroundColor: 'var(--app-surface)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '500'
  },
  checkList: {
    gap: 4
  },
  passwordNotice: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '500'
  },
  auditPanel: {
    padding: 14,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--app-border)',
    backgroundColor: 'var(--app-bg)'
  },
  auditRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--app-border)'
  },
  auditDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.orange
  },
  auditTitle: {
    fontSize: 13,
    fontWeight: '500'
  },
  auditMeta: {
    color: 'var(--app-muted)',
    fontSize: 11,
    marginTop: 2
  },
  auditStatus: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '500'
  },
  helpPanel: {
    padding: 14,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--app-border)',
    backgroundColor: 'var(--app-bg)'
  },
  helpText: {
    color: 'var(--app-muted)',
    fontSize: 13
  },
  contactButton: {
    alignSelf: 'flex-start',
    minHeight: 32,
    paddingHorizontal: 14,
    borderRadius: 5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4
  },
  contactButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500'
  },
  changePasswordButton: {
    alignSelf: 'flex-end',
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  changePasswordButtonDisabled: {
    opacity: 0.45
  },
  changePasswordText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500'
  },
  appliedText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '500'
  },
  saveRow: {
    minHeight: 48,
    paddingHorizontal: 14,
    alignItems: 'flex-end',
    justifyContent: 'center'
  },
  saveButton: {
    minHeight: 32,
    minWidth: 72,
    paddingHorizontal: 14,
    borderRadius: 5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500'
  },
  switchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  switchText: {
    color: 'var(--app-muted)',
    fontSize: 13,
    fontWeight: '500',
    minWidth: 24
  },
  switchTrack: {
    width: 40,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
    padding: 2,
    justifyContent: 'center'
  },
  switchTrackOn: {
    backgroundColor: colors.primary
  },
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: '#ffffff'
  },
  switchThumbOn: {
    transform: [{ translateX: 18 }]
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'var(--app-bg)',
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 10,
    padding: 3,
    gap: 3
  },
  themeButton: {
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  themeButtonActive: {
    backgroundColor: colors.primary
  },
  themeButtonText: {
    color: colors.slate,
    fontSize: 12,
    fontWeight: '500'
  },
  themeButtonTextActive: {
    color: '#ffffff'
  }
});

