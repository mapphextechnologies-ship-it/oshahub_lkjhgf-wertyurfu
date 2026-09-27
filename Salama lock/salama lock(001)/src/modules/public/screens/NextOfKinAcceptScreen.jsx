import React, { useMemo, useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button.jsx';
import { Text } from '@/components/ui/Text.jsx';
import { buildApiUrl } from '@/services/apiUrl.js';
import { colors } from '@/theme/colors.js';

async function acceptNextOfKin({ customerId, otp }) {
  const response = await fetch(buildApiUrl('/api/next-of-kin/accept'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ customerId, otp })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Could not confirm next-of-kin acceptance.');
  }

  return data;
}

export function NextOfKinAcceptScreen() {
  const params = useMemo(() => {
    const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
    const searchQuery = window.location.search.replace(/^\?/, '');
    return new URLSearchParams(searchQuery || hashQuery);
  }, []);
  const customerId = params.get('customer') || '';
  const otp = params.get('otp') || '';
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    setMessage('');
    if (!customerId || !/^\d{6}$/.test(otp.trim())) {
      setMessage('This confirmation link is invalid or incomplete.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await acceptNextOfKin({ customerId, otp: otp.trim() });
      setAccepted(true);
      setMessage(result.alreadyVerified
        ? 'This next-of-kin acceptance was already confirmed.'
        : 'Accepted. SALAMA LOCK Paygo will now continue automatic screening and customer activation.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          {accepted ? <CheckCircle2 size={28} color={colors.success} /> : <ShieldCheck size={28} color={colors.primary} />}
        </View>
        <Text style={styles.title}>Next-of-kin confirmation</Text>
        <Text style={styles.text}>
          Confirm only if you agree to be recorded as the next-of-kin for this SALAMA LOCK Paygo customer application.
        </Text>
        <Text style={styles.smallText}>If the SMS app blocks replies, open the link in the message and tap Yes.</Text>
        {message ? <Text style={accepted ? styles.successText : styles.greenText}>{message}</Text> : null}
        <Button icon={CheckCircle2} onPress={submit} disabled={submitting || accepted} style={styles.fullButton}>
          {submitting ? 'Confirming...' : accepted ? 'Confirmed' : 'Yes, I accept'}
        </Button>
        <Pressable onPress={() => { window.location.hash = '#/'; }} style={styles.backLink}>
          <Text style={styles.linkText}>Back to SALAMA LOCK Paygo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 'var(--app-vh)', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#eef8f4' },
  card: { width: '100%', maxWidth: 430, borderWidth: 1, borderColor: '#d5e2ef', borderRadius: 10, padding: 18, gap: 12, backgroundColor: '#ffffff' },
  iconWrap: { width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff' },
  title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: '600' },
  text: { color: colors.muted, lineHeight: 21 },
  smallText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  field: { gap: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  input: { minHeight: 42, borderWidth: 1, borderColor: '#d5e2ef', borderRadius: 8, padding: '0 12px', color: colors.text, backgroundColor: '#ffffff', outlineStyle: 'none', fontSize: 16 },
  fullButton: { width: '100%' },
  greenText: { color: colors.success, fontWeight: '500', lineHeight: 20 },
  successText: { color: colors.success, fontWeight: '600', lineHeight: 20 },
  backLink: { alignSelf: 'center', minHeight: 32, justifyContent: 'center', cursor: 'pointer' },
  linkText: { color: colors.primary, fontWeight: '500' }
});

