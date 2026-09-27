import React from 'react';
import { ArrowRight, Building2, ShieldCheck } from 'lucide-react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text.jsx';
import { colors } from '@/theme/colors.js';
import { SalamaLockLogo } from '@/assets/index.js';

const portals = [
  {
    key: 'finance',
    title: 'Finance',
    label: 'Collections, reconciliation, reports',
    path: '/finance-salama-lock',
    icon: Building2,
    tone: colors.primary
  },
  {
    key: 'admin',
    title: 'Admin',
    label: 'Screening, users, approvals',
    path: '/admin-salama-lock',
    icon: ShieldCheck,
    tone: '#0f766e'
  },
  {
    key: 'backoffice',
    title: 'Back Office',
    label: 'Screening workspace login',
    path: '/backoffice/login',
    icon: ShieldCheck,
    tone: '#1667d8'
  }
];

export function PortalEntryScreen() {
  function openPortal(path) {
    window.location.assign(path);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator>
      <View style={styles.shell}>
        <View style={styles.brandRow}>
          <Image source={SalamaLockLogo} style={styles.logo} />
          <View style={{ minWidth: 0 }}>
            <Text style={styles.brand}>SALAMA LOCK Paygo</Text>
            <Text style={styles.subBrand}>Portal login</Text>
          </View>
        </View>

        <Text style={styles.title}>Choose a portal</Text>
        <View style={styles.grid}>
          {portals.map((portal) => {
            const Icon = portal.icon;

            return (
              <Pressable
                key={portal.key}
                onPress={() => openPortal(portal.path)}
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.cardPressed
                ]}
              >
                <View style={[styles.cardIcon, { backgroundColor: `${portal.tone}14` }]}>
                  <Icon size={20} color={portal.tone} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{portal.title}</Text>
                  <Text style={styles.cardLabel}>{portal.label}</Text>
                </View>
                <ArrowRight size={18} color={portal.tone} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    minHeight: 'var(--app-vh)',
    backgroundColor: '#f4f8fb'
  },
  content: {
    minHeight: 'var(--app-vh)',
    padding: 16
  },
  shell: {
    width: '100%',
    maxWidth: 900,
    marginHorizontal: 'auto',
    gap: 18
  },
  brandRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 8
  },
  brand: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600'
  },
  subBrand: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  title: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 12
  },
  card: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: '#d7e2ef',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 12,
    alignItems: 'center',
    flexDirection: 'row'
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.96
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardText: {
    flex: 1,
    minWidth: 0
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600'
  },
  cardLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  }
});

