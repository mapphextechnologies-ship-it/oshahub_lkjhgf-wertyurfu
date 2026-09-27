import React, { useEffect, useRef, useState } from 'react';
import { Bell, Download, LogOut, Menu } from 'lucide-react';
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { colors } from '../../theme/colors.js';
import { Button } from '../ui/Button.jsx';
import { Text } from '../ui/Text.jsx';
import { navGroups, navItems } from './navigation.js';
import { SalamaLockLogo } from '@/assets/index.js';

export function AppShell({
  activeScreen,
  onNavigate,
  onLogout,
  unreadCount,
  profilePhoto,
  appLayout,
  canInstall,
  onInstall,
  profileSettings,
  financeScope,
  onFinanceScopeChange,
  children
}) {
  const { width } = useWindowDimensions();
  const isMobile = width < 860;
  const compact = appLayout === 'Compact view';
  const SettingsIcon = navItems.find((item) => item.key === 'settings').icon;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const sidebarScrollRef = useRef(null);

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  useEffect(() => {
    if (sidebarOpen) {
      sidebarScrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [sidebarOpen]);

  return (
    <View style={styles.root}>
      <View style={styles.topbar}>
        <View style={styles.topBrand}>
          <Pressable
            onPress={() => setSidebarOpen((open) => !open)}
            style={styles.menuButton}
          >
            <Menu size={21} color="#ffffff" />
          </Pressable>
          <View style={styles.brandMarkSmall}>
            <Image source={SalamaLockLogo} style={styles.brandLogoSmall} />
          </View>
          <View>
            <Text style={styles.mobileTitle}>SALAMA LOCK Finance</Text>
          </View>
        </View>
        <View style={styles.topActions}>
          <View style={styles.scopeSwitcher}>
            {['all', 'bike', 'phone'].map((scope) => (
              <Pressable
                key={scope}
                onPress={() => onFinanceScopeChange?.(scope)}
                style={[styles.scopeButton, financeScope === scope && styles.scopeButtonActive]}
              >
                <Text style={[styles.scopeText, financeScope === scope && styles.scopeTextActive]}>
                  {scope === 'all' ? 'All' : scope === 'bike' ? 'Bikes' : 'Phones'}
                </Text>
              </Pressable>
            ))}
          </View>
          {canInstall && !isMobile && (
            <Button icon={Download} variant="secondary" onPress={onInstall}>
              Install app
            </Button>
          )}
          <Pressable style={styles.bell} onPress={() => onNavigate('notifications')}>
            <Bell size={20} color="#ffffff" />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </Pressable>
          <View style={styles.profileWrap}>
            <View style={styles.profile}>
              <Text style={styles.profileName}>{profileSettings?.name || 'Account'}</Text>
            </View>
            <View style={styles.avatar}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{profileInitials(profileSettings?.name)}</Text>
              )}
            </View>
          </View>
          {isMobile && (
            <Pressable style={styles.mobileLogout} onPress={onLogout}>
              <LogOut size={18} color={colors.danger} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.appBody}>
        {isMobile && sidebarOpen && (
          <Pressable
            aria-label="Close menu"
            onPress={() => setSidebarOpen(false)}
            style={styles.mobileMenuBackdrop}
          />
        )}
        {(sidebarOpen || !isMobile) && (
          <View style={[styles.sidebar, !sidebarOpen && !isMobile && styles.compactSidebar, isMobile && styles.mobileSidebar]}>
            <ScrollView
              ref={sidebarScrollRef}
              style={styles.sidebarScroll}
              contentContainerStyle={[styles.sidebarInner, !sidebarOpen && styles.compactSidebarInner]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.nav}>
                {navGroups.map((group) => (
                  <View key={group} style={styles.navGroup}>
                  {sidebarOpen && <Text style={styles.groupLabel}>{group}</Text>}
                    {navItems
                      .filter((item) => item.group === group)
                      .map((item) => (
                        <NavButton
                          key={item.key}
                          item={item}
                  active={activeScreen === item.key}
                          collapsed={!sidebarOpen}
                          onPress={() => {
                            onNavigate(item.key);
                            if (isMobile) setSidebarOpen(false);
                          }}
                          unreadCount={item.key === 'notifications' ? unreadCount : 0}
                        />
                      ))}
                  </View>
                ))}
              </View>

              <View style={styles.sidebarFooter}>
                <Pressable onPress={onLogout} style={styles.logoutButton}>
                  <LogOut size={19} color="#b42318" />
                  {sidebarOpen && <Text style={styles.logoutText}>Logout</Text>}
              </Pressable>
              </View>
            </ScrollView>
          </View>
        )}

        <View
          style={styles.main}
          onPointerDown={() => {
            if (sidebarOpen) setSidebarOpen(false);
          }}
        >
          <ScrollView
            style={styles.content}
            contentContainerStyle={[styles.contentInner, compact && styles.contentInnerCompact]}
            showsVerticalScrollIndicator
          >
            {children}
          </ScrollView>
        </View>
      </View>

      {isMobile && <View style={styles.mobileTabs}>
        {navItems.slice(0, 4).map((item) => (
          <Pressable
            key={item.key}
            onPress={() => onNavigate(item.key)}
            style={styles.mobileTab}
          >
            <item.icon size={19} color={activeScreen === item.key ? colors.primary : colors.muted} />
            <Text
              numberOfLines={1}
              style={[
                styles.mobileTabText,
                activeScreen === item.key && { color: colors.primary, fontWeight: '500' }
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
        <Pressable onPress={() => onNavigate('settings')} style={styles.mobileTab}>
          <SettingsIcon size={19} color={activeScreen === 'settings' ? colors.primary : colors.muted} />
          <Text
            numberOfLines={1}
            style={[
              styles.mobileTabText,
              activeScreen === 'settings' && { color: colors.primary, fontWeight: '500' }
            ]}
          >
            Settings
          </Text>
        </Pressable>
        {canInstall && (
          <Pressable onPress={onInstall} style={styles.mobileTab}>
            <Download size={19} color={colors.primary} />
            <Text numberOfLines={1} style={[styles.mobileTabText, { color: colors.primary, fontWeight: '500' }]}>
              Install
            </Text>
          </Pressable>
        )}
      </View>}
    </View>
  );
}

function profileInitials(name) {
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || '--';
}

function NavButton({ item, active, onPress, unreadCount, collapsed = false }) {
  return (
    <Pressable onPress={onPress} style={[styles.navButton, active && styles.navButtonActive]}>
      <item.icon size={21} color={active ? '#2ee578' : '#35423b'} />
      {!collapsed && <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>}
      {unreadCount > 0 && (
        <View style={styles.navBadge}>
          <Text style={styles.navBadgeText}>{unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 'var(--app-vh)',
    width: '100vw',
    flexDirection: 'column',
    backgroundColor: 'var(--app-bg)',
    overflow: 'hidden'
  },
  appBody: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    overflow: 'hidden'
  },
  sidebar: {
    width: 262,
    height: 'calc(var(--app-vh) - 66px)',
    backgroundColor: '#f5f7f6',
    borderRightWidth: 1,
    borderRightColor: '#dce3de',
    overflow: 'hidden'
  },
  compactSidebar: {
    width: 116
  },
  sidebarScroll: {
    flex: 1,
    height: '100%',
    overflowY: 'auto'
  },
  sidebarInner: {
    minHeight: '100%',
    padding: 18,
    paddingBottom: 104
  },
  mobileSidebar: {
    position: 'fixed',
    left: 0,
    top: 66,
    bottom: 0,
    zIndex: 20,
    width: 286,
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.16)'
  },
  mobileMenuBackdrop: {
    position: 'fixed',
    left: 0,
    right: 0,
    top: 66,
    bottom: 0,
    zIndex: 19,
    backgroundColor: 'transparent'
  },
  brand: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 26
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandMarkText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '500'
  },
  brandName: {
    fontSize: 17,
    fontWeight: '500'
  },
  brandSub: {
    fontSize: 12,
    color: 'var(--app-muted)',
    marginTop: 2
  },
  nav: {
    gap: 16,
    flexGrow: 1
  },
  navGroup: {
    gap: 6
  },
  groupLabel: {
    color: '#69736c',
    fontSize: 11,
    fontWeight: '500',
    paddingHorizontal: 12,
    marginBottom: 2
  },
  navButton: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  navButtonActive: {
    backgroundColor: '#032216',
    borderLeftWidth: 6,
    borderLeftColor: '#2ee578'
  },
  navText: {
    flex: 1,
    fontSize: 14,
    color: '#25312b',
    fontWeight: '500'
  },
  navTextActive: {
    color: '#ffffff'
  },
  navTextDark: {
    color: '#ffffff'
  },
  navBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5
  },
  navBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '500'
  },
  sidebarFooter: {
    gap: 10,
    marginTop: 46
  },
  logoutButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  logoutText: {
    color: '#b42318',
    fontWeight: '500'
  },
  main: {
    flex: 1,
    minWidth: 0,
    height: 'calc(var(--app-vh) - 66px)',
    overflow: 'hidden'
  },
  topbar: {
    minHeight: 66,
    backgroundColor: colors.primary,
    backgroundImage: `linear-gradient(to right, ${colors.primary} 0%, #086c8f 58%, ${colors.teal} 100%)`,
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  topBrand: {
    width: 262,
    minHeight: 66,
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)'
  },
  brandMarkSmall: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  brandLogoSmall: {
    width: 31,
    height: 31,
    borderRadius: 5
  },
  brandMarkSmallText: {
    color: '#ffffff',
    fontWeight: '500',
    fontSize: 16
  },
  mobileTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff'
  },
  headerSub: {
    color: 'var(--app-muted)',
    fontSize: 11,
    marginTop: 1
  },
  topActions: {
    paddingRight: 24,
    paddingLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'flex-end'
  },
  compactSidebarInner: {
    paddingHorizontal: 0
  },
  scopeSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)'
  },
  scopeButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999
  },
  scopeButtonActive: {
    backgroundColor: '#ffffff'
  },
  scopeText: {
    color: '#dbeafe',
    fontSize: 12,
    fontWeight: '700'
  },
  scopeTextActive: {
    color: colors.primary
  },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  badge: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 19,
    height: 19,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '500'
  },
  profile: {
    alignItems: 'flex-end'
  },
  profileWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  profileName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#ffffff'
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '500',
    fontSize: 13
  },
  mobileLogout: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f1b6b6',
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    flex: 1,
    height: '100%',
    overflowY: 'auto'
  },
  contentInner: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 104,
    maxWidth: 1440,
    width: '100%',
    alignSelf: 'center'
  },
  contentInnerCompact: {
    padding: 14,
    paddingBottom: 84,
    maxWidth: 1180
  },
  mobileTabs: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 68,
    backgroundColor: 'var(--app-surface)',
    borderTopWidth: 1,
    borderTopColor: 'var(--app-border)',
    flexDirection: 'row',
    paddingHorizontal: 6,
    zIndex: 10
  },
  mobileTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 0
  },
  mobileTabText: {
    color: 'var(--app-muted)',
    fontSize: 10,
    maxWidth: '100%'
  }
});
