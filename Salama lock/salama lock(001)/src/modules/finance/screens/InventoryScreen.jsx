import React, { useEffect, useMemo, useState } from 'react';
import { Bike, RefreshCw, Smartphone } from 'lucide-react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button.jsx';
import { Section } from '@/components/ui/Section.jsx';
import { StatusPill } from '@/components/ui/StatusPill.jsx';
import { Text } from '@/components/ui/Text.jsx';
import { inventoryService } from '@/services/inventoryService.js';
import { colors } from '@/theme/colors.js';

function formatLabel(value) {
  return String(value || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function InventoryScreen({ productType = 'phone' }) {
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState('');
  const normalizedType = String(productType || '').toLowerCase();
  const isPhone = normalizedType === 'phone';

  function loadProducts() {
    setMessage('');
    inventoryService.listProducts({ productType: normalizedType })
      .then(setProducts)
      .catch((error) => setMessage(error.message || 'Unable to load inventory.'));
  }

  useEffect(() => {
    loadProducts();
    const timer = window.setInterval(loadProducts, 30000);
    const handleVisibilityChange = () => {
      if (window.document.visibilityState === 'visible') loadProducts();
    };
    window.document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [normalizedType]);

  const visibleProducts = useMemo(() => {
    return products.filter((product) => String(product.productType || '').toLowerCase() === normalizedType);
  }, [normalizedType, products]);

  const counts = useMemo(() => ({
    total: visibleProducts.length,
    available: visibleProducts.filter((product) => product.status === 'available').length,
    assigned: visibleProducts.filter((product) => ['assigned', 'reserved'].includes(product.status)).length
  }), [visibleProducts]);

  const Icon = isPhone ? Smartphone : Bike;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageInner} showsVerticalScrollIndicator>
      <View style={styles.header}>
        <View style={{ minWidth: 0 }}>
          <View style={styles.eyebrowRow}>
            <Icon size={16} color={colors.primary} />
            <Text style={styles.eyebrow}>{isPhone ? 'Phones' : 'Bikes'}</Text>
          </View>
          <Text style={styles.title}>{isPhone ? 'Phone inventory' : 'Bike inventory'}</Text>
          <Text style={styles.subtitle}>
            Live shared inventory records. This view refreshes automatically from the central database.
          </Text>
        </View>
        <Button icon={RefreshCw} variant="secondary" onPress={loadProducts}>Refresh</Button>
      </View>

      {message ? <Text style={styles.notice}>{message}</Text> : null}

      <View style={styles.stats}>
        <Stat label="Total" value={counts.total} />
        <Stat label="Available" value={counts.available} />
        <Stat label="Assigned" value={counts.assigned} />
      </View>

      <Section title={isPhone ? 'Phone records' : 'Bike records'}>
        <View style={styles.list}>
          {visibleProducts.map((product) => (
            <View key={product.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ minWidth: 0, flex: 1 }}>
                  <Text style={styles.cardTitle}>{product.productModel || 'Unnamed product'}</Text>
                  <Text style={styles.cardMeta}>
                    {isPhone
                      ? `IMEI ${product.imei1 || product.serialNumber || 'not set'}`
                      : `Serial ${product.serialNumber || 'not set'}`}
                  </Text>
                  <Text style={styles.cardMeta}>{formatLabel(product.branch || 'Unassigned branch')}</Text>
                </View>
                <StatusPill status={product.status || 'available'} />
              </View>
              <View style={styles.previewWrap}>
                {product.imageUrl ? (
                  <Image source={{ uri: product.imageUrl }} style={styles.previewImage} resizeMode="cover" />
                ) : (
                  <View style={styles.previewFallback}>
                    <Text style={styles.previewFallbackText}>{isPhone ? 'Phone' : 'Bike'}</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardBottom}>
                {isPhone ? (
                  <>
                    <Detail label="IMEI 1" value={product.imei1 || 'Not set'} />
                    <Detail label="IMEI 2" value={product.imei2 || 'Not set'} />
                    <Detail label="Storage" value={product.storageGb ? `${product.storageGb} GB` : 'Not set'} />
                    <Detail label="RAM" value={product.ramGb ? `${product.ramGb} GB` : 'Not set'} />
                    <Detail label="Device ID" value={product.imei1 || product.lockerId || 'Pending sync'} />
                    <Detail label="Sync" value={product.lockerSyncStatus || 'pending'} />
                  </>
                ) : (
                  <>
                    <Detail label="Serial" value={product.serialNumber || 'Not set'} />
                    <Detail label="Chassis" value={product.chassisNumber || 'Not set'} />
                    <Detail label="Engine" value={product.engineNumber || 'Not set'} />
                    <Detail label="Tracker" value={product.trackerId || 'Not set'} />
                    <Detail label="Odometer" value={product.odometerKm ? `${product.odometerKm} km` : '0 km'} />
                    <Detail label="Service due" value={product.serviceDueDate || 'Not set'} />
                  </>
                )}
                <Detail label="Agent" value={product.assignedAgentCode || 'Unassigned'} />
              </View>
            </View>
          ))}
          {!visibleProducts.length && <Text style={styles.empty}>No {isPhone ? 'phone' : 'bike'} records match this view.</Text>}
        </View>
      </Section>
    </ScrollView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Detail({ label, value }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', height: '100%', backgroundColor: 'transparent' },
  pageInner: { gap: 14, paddingBottom: 24 },
  header: { borderWidth: 1, borderColor: '#dbe5ef', borderRadius: 8, backgroundColor: '#ffffff', padding: 18, flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', color: colors.text, marginTop: 2 },
  subtitle: { color: colors.slate, lineHeight: 21, marginTop: 4, maxWidth: 720 },
  notice: { color: colors.success, fontWeight: '500' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: { flex: 1, minWidth: 160, borderWidth: 1, borderColor: '#dbe5ef', backgroundColor: '#ffffff', borderRadius: 8, padding: 15, gap: 8 },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  statValue: { color: colors.text, fontSize: 21, fontWeight: '600' },
  list: { gap: 10 },
  card: { borderWidth: 1, borderColor: '#e5edf6', borderRadius: 8, backgroundColor: '#ffffff', padding: 14, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  previewWrap: { borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e4ebf5', backgroundColor: '#f8fbff' },
  previewImage: { width: '100%', height: 180, backgroundColor: '#eef4fb' },
  previewFallback: { height: 180, alignItems: 'center', justifyContent: 'center' },
  previewFallbackText: { color: colors.muted, fontSize: 15, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  cardMeta: { color: colors.muted, lineHeight: 20 },
  cardBottom: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detail: { flexGrow: 1, minWidth: 140, borderWidth: 1, borderColor: '#edf2f8', borderRadius: 8, padding: 10, gap: 4, backgroundColor: '#f8fbff' },
  detailLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  detailValue: { color: colors.text, fontWeight: '500' },
  empty: { color: colors.muted, lineHeight: 20 }
});

