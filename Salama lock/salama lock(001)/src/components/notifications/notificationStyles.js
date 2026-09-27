import { StyleSheet } from 'react-native';
import { colors } from '../../theme/colors.js';

export const notificationStyles = StyleSheet.create({
  page: { gap: 18 },
  activityShell: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: 12
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  centerToast: {
    position: 'fixed',
    left: '50%',
    bottom: 28,
    transform: [{ translateX: '-50%' }],
    zIndex: 90,
    maxWidth: '92vw',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  centerToastText: {
    color: colors.success,
    fontWeight: '500'
  },
  toastAction: {
    minHeight: 34
  },
  deleteAllButton: {
    borderColor: '#f1b6b6'
  },
  unreadBadge: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center'
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500'
  },
  activityGroup: {
    paddingTop: 8,
    paddingBottom: 7,
    paddingHorizontal: 12,
    gap: 7
  },
  groupTitle: {
    paddingHorizontal: 4,
    paddingBottom: 5,
    color: 'var(--app-muted)',
    fontSize: 12,
    textTransform: 'uppercase'
  },
  notificationItem: {
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 8,
    backgroundColor: 'var(--app-surface)',
    overflow: 'hidden'
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 13,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center'
  },
  unread: { backgroundColor: 'rgba(7, 87, 200, 0.06)' },
  pressed: { opacity: 0.78 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  body: { flex: 1 },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4
  },
  typePill: {
    minHeight: 19,
    paddingHorizontal: 7,
    borderRadius: 11,
    justifyContent: 'center'
  },
  typeText: { fontSize: 11, fontWeight: '500' },
  title: { fontWeight: '500' },
  unreadTitle: { color: colors.primary },
  message: { color: 'var(--app-muted)', marginTop: 3, lineHeight: 18 },
  dateTime: {
    color: 'var(--app-muted)',
    fontSize: 12,
    marginTop: 4
  },
  dot: { width: 9, height: 9, borderRadius: 999, backgroundColor: colors.danger },
  actionsPanel: {
    paddingLeft: 64,
    paddingRight: 14,
    paddingBottom: 12,
    gap: 10
  },
  detailBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'var(--app-subtle)',
    gap: 10
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  detailLabel: {
    color: 'var(--app-muted)',
    fontSize: 12
  },
  detailStatus: {
    fontSize: 12,
    fontWeight: '500'
  },
  detailMessage: {
    color: 'var(--app-text)',
    lineHeight: 20
  },
  detailSection: {
    gap: 7
  },
  detailSectionTitle: {
    color: 'var(--app-text)',
    fontSize: 13,
    fontWeight: '500'
  },
  detailTable: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 8,
    backgroundColor: 'var(--app-surface)',
    overflow: 'hidden'
  },
  tableHeaderRow: {
    minHeight: 34,
    paddingHorizontal: 12,
    backgroundColor: 'var(--app-bg)',
    borderBottomWidth: 1,
    borderBottomColor: 'var(--app-border)',
    justifyContent: 'center'
  },
  tableRow: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--app-border)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  tableLabel: {
    flex: 1,
    color: 'var(--app-muted)',
    fontSize: 12
  },
  tableValue: {
    flex: 1.3,
    color: 'var(--app-text)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right'
  },
  followUpBox: {
    paddingTop: 4,
    maxWidth: 560,
    alignSelf: 'center',
    width: '100%',
    alignItems: 'flex-start'
  },
  detailValue: {
    marginTop: 3,
    color: 'var(--app-text)',
    fontSize: 14,
    maxWidth: 360,
    textAlign: 'left'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center'
  },
  iconActionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'var(--app-subtle)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dismissButton: {
    backgroundColor: colors.dangerSoft
  },
  emptyState: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '500'
  },
  emptyText: {
    color: 'var(--app-muted)',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20
  }
});
