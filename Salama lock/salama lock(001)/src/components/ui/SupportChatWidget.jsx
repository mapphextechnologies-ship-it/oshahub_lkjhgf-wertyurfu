import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, Headphones, Mail, MessageCircle, Send, Sparkles, X, Trash2 } from 'lucide-react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Text.jsx';
import { colors } from '../../theme/colors.js';
import { supportAssistantService } from '../../services/supportAssistantService.js';

const starterMessage = {
  id: 'welcome',
  from: 'assistant',
  text: 'Hi, I’m SALAMA LOCK Assist. Tell me what you need help with and I’ll answer directly or connect you to support if needed.'
};

const quickPrompts = [
  'What is SALAMA LOCK?',
  'How do I pay?',
  'Why is my phone locked?',
  'Check my balance',
  'OTP not coming',
  'Live agent'
];

const supportPhone = String(import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER || '').replace(/\D/g, '');
const supportEmail = String(import.meta.env.VITE_SUPPORT_EMAIL || 'SALAMA LOCKpaygo@gmail.com').trim();

function normalizeMessageText(value) {
  return String(value ?? '').trim();
}

function messageFromAssistant(record = {}) {
  return normalizeMessageText(record.safe_content || record.content || record.text || '');
}

function systemMessage(text) {
  return {
    id: `system-${Date.now()}`,
    from: 'system',
    text
  };
}

function extractRequestedHandoffDetails(text) {
  const value = normalizeMessageText(text).toLowerCase();
  if (!value) {
    return {
      requestedAgentHint: '',
      requestedHandoffTeam: ''
    };
  }

  const teamPatterns = [
    { team: 'back_office', pattern: /\bback\s*-?\s*office\b/i },
    { team: 'admin', pattern: /\badmin\b/i }
  ];

  let requestedHandoffTeam = '';
  for (const entry of teamPatterns) {
    if (entry.pattern.test(value)) {
      requestedHandoffTeam = entry.team;
      break;
    }
  }

  const patterns = [
    /(?:agent|admin|staff|dealer|back office)\s+([a-z][a-z .'-]{1,60})$/i,
    /(?:connect me to|talk to|speak to|live agent|live chat with)\s+([a-z][a-z .'-]{1,60})$/i,
    /(?:agent|admin|staff|dealer|back office)\s+(?:named\s+)?([a-z][a-z .'-]{1,60})$/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return {
        requestedAgentHint: match[1].trim(),
        requestedHandoffTeam
      };
    }
  }

  return {
    requestedAgentHint: '',
    requestedHandoffTeam
  };
}

export function SupportChatWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([starterMessage]);
  const [handoffMode, setHandoffMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [conversationKey, setConversationKey] = useState(() => supportAssistantService.getConversationKey() || '');
  const [handoffContact, setHandoffContact] = useState({ phone: supportPhone, name: 'SALAMA LOCK support' });
  const loadedRef = useRef(false);

  const unread = useMemo(() => (!open && messages.length > 1 ? 1 : 0), [messages.length, open]);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);

    supportAssistantService.fetchConversation()
      .then((data) => {
        if (!data?.messages?.length) {
          setMessages([starterMessage]);
          return;
        }

        setConversationKey(data.conversationKey || '');
        supportAssistantService.setConversationKey(data.conversationKey || '');
        setMessages(
          data.messages.map((message) => ({
            id: message.id,
            from: message.sender_type === 'customer' ? 'user' : message.sender_type === 'assistant' ? 'assistant' : 'system',
            text: normalizeMessageText(message.safe_content || message.content),
            meta: message.metadata || {}
          }))
        );
      })
      .catch(() => {
        setMessages([starterMessage]);
      })
      .finally(() => {
        setLoading(false);
        setLoaded(true);
      });
  }, [open]);

  function resetChat({ preserveConversation = false } = {}) {
    setDraft('');
    setHandoffMode(false);
    setLoading(false);
    loadedRef.current = false;
    setHandoffContact({ phone: supportPhone, name: 'SALAMA LOCK support' });
    setMessages([starterMessage]);
    if (!preserveConversation) {
      setConversationKey('');
      supportAssistantService.clearConversationKey();
    }
  }

  function closeChat() {
    setOpen(false);
    setLoaded(false);
    loadedRef.current = false;
  }

  async function sendMessage(nextMessage = draft, { requestHumanAgent = false } = {}) {
    const text = normalizeMessageText(nextMessage);
    if (!text || loading) return;
    const effectiveRequestHumanAgent = requestHumanAgent || handoffMode;

    setDraft('');
    setLoading(true);
    setMessages((current) => [...current, { id: `user-${Date.now()}`, from: 'user', text }]);

    try {
      const { requestedAgentHint, requestedHandoffTeam } = extractRequestedHandoffDetails(text);
      const response = await supportAssistantService.sendMessage({
        message: text,
        requestHumanAgent: effectiveRequestHumanAgent,
        channel: 'web',
        metadata: {
          source: 'support_widget',
          ...(requestedAgentHint ? { requestedAgentHint } : {}),
          ...(requestedHandoffTeam ? { requestedHandoffTeam } : {})
        }
      });

      if (response?.conversationKey) {
        setConversationKey(response.conversationKey);
      }

      const assistantText = messageFromAssistant(response.reply) || 'I have received your message.';
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          from: 'assistant',
          text: assistantText
        }
      ]);

      if (response?.ticket?.referenceNumber) {
        setMessages((current) => [
          ...current,
          systemMessage(`Support ticket created: ${response.ticket.referenceNumber}`)
        ]);
      }

      if (response?.ticket?.assignedAgentPhone) {
        setHandoffContact({
          phone: String(response.ticket.assignedAgentPhone).replace(/\D/g, ''),
          name: response.ticket.assignedAgentName || response.ticket.assignedAgentCode || 'SALAMA LOCK support'
        });
      } else if (response?.ticket?.assignedAgentName) {
        setHandoffContact((current) => ({
          ...current,
          name: response.ticket.assignedAgentName
        }));
      } else if (effectiveRequestHumanAgent || requestedAgentHint || requestedHandoffTeam) {
        setHandoffContact({ phone: supportPhone, name: 'SALAMA LOCK support' });
      }

      if (response?.security?.promptInjection || response?.security?.secretRequest) {
        setMessages((current) => [
          ...current,
          systemMessage('Sensitive request blocked and logged safely.')
        ]);
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          from: 'assistant',
          text: error.message || 'The support assistant is unavailable right now.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function requestLiveAgent() {
    setHandoffMode(true);
    sendMessage('I need a live agent.', { requestHumanAgent: true });
  }

  function openWhatsappHandoff() {
    const transcript = messages
      .filter((message) => message.from !== 'system')
      .map((message) => `${message.from === 'user' ? 'User' : 'SALAMA LOCK Assist'}: ${message.text}`)
      .join('\n');
    const greeting = handoffContact.name && handoffContact.name !== 'SALAMA LOCK support'
      ? `Hello ${handoffContact.name}, I need help from a live agent.`
      : 'Hello SALAMA LOCK support, I need help from a live agent.';
    const body = encodeURIComponent(`${greeting}\n\nChat transcript:\n${transcript}`);
    const phone = String(handoffContact.phone || supportPhone || '').replace(/\D/g, '');
    if (!phone) return;
    window.open(`https://wa.me/${phone}?text=${body}`, '_blank', 'noopener,noreferrer');
  }

  function openEmailHandoff() {
    const transcript = messages
      .filter((message) => message.from !== 'system')
      .map((message) => `${message.from === 'user' ? 'User' : 'SALAMA LOCK Assist'}: ${message.text}`)
      .join('\n');
    const subject = encodeURIComponent('SALAMA LOCK Paygo support request');
    const body = encodeURIComponent(`Hello SALAMA LOCK support,\n\nI need help from a live agent.\n\nChat transcript:\n${transcript}`);
    window.open(`mailto:${supportEmail}?subject=${subject}&body=${body}`, '_blank', 'noopener,noreferrer');
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.fab}
        accessibilityRole="button"
        accessibilityLabel="Open help chat"
      >
        <MessageCircle size={22} color="#ffffff" />
        {unread ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.avatar}>
            {handoffMode ? <Headphones size={18} color="#ffffff" /> : <Bot size={18} color="#ffffff" />}
          </View>
          <View>
            <Text style={styles.title}>{handoffMode ? 'SALAMA LOCK support desk' : 'SALAMA LOCK Assist'}</Text>
            <View style={styles.statusLine}>
              <View style={styles.onlineDot} />
              <Text style={styles.subtitle}>
                {handoffMode ? 'Live agent handoff ready' : loading && !loaded ? 'Loading conversation...' : 'Secure support assistant'}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => resetChat()}
            style={styles.clearButton}
            accessibilityRole="button"
            accessibilityLabel="Clear help chat"
          >
            <Trash2 size={15} color={colors.primary} />
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
          <Pressable onPress={closeChat} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Close help chat">
            <X size={18} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.messages}>
        {messages.map((message) => {
          if (message.from === 'system') {
            return (
              <View key={message.id} style={styles.systemEvent}>
                <CheckCircle2 size={13} color="#22a06b" />
                <Text style={styles.systemEventText}>{message.text}</Text>
              </View>
            );
          }

          return (
            <View key={message.id} style={message.from === 'user' ? styles.userMessageWrap : styles.assistantMessageWrap}>
              {message.from === 'assistant' ? (
                <View style={styles.messageMeta}>
                  <Sparkles size={12} color={colors.primary} />
                  <Text style={styles.messageMetaText}>{handoffMode ? 'Support desk' : 'SALAMA LOCK Assist'}</Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.bubble,
                  message.from === 'user' ? styles.userBubble : styles.assistantBubble
                ]}
              >
                <Text style={message.from === 'user' ? styles.userText : styles.assistantText}>{message.text}</Text>
              </View>
            </View>
          );
        })}

        {loading ? (
          <View style={styles.assistantMessageWrap}>
            <View style={styles.messageMeta}>
              <Sparkles size={12} color={colors.primary} />
              <Text style={styles.messageMetaText}>SALAMA LOCK Assist</Text>
            </View>
            <View style={styles.bubble} pointerEvents="none">
              <Text style={styles.assistantText}>Typing...</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.quickRow}>
        {quickPrompts.map((item) => (
          <Pressable key={item} onPress={() => sendMessage(item)} style={styles.quickButton}>
            <Text style={styles.quickText}>{item}</Text>
          </Pressable>
        ))}
        <Pressable onPress={requestLiveAgent} style={[styles.quickButton, styles.liveButton]}>
          <Headphones size={14} color="#ffffff" />
          <Text style={styles.liveText}>Live agent</Text>
        </Pressable>
      </View>

      {handoffMode ? (
        <View style={styles.handoffRow}>
          {handoffContact.phone || supportPhone ? (
            <Pressable onPress={openWhatsappHandoff} style={styles.handoffButton}>
              <MessageCircle size={16} color="#ffffff" />
              <Text style={styles.handoffText}>WhatsApp {handoffContact.name || 'support'}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={openEmailHandoff} style={[styles.handoffButton, styles.emailButton]}>
            <Mail size={16} color={colors.primary} />
            <Text style={styles.emailText}>Email agent</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => sendMessage()}
          placeholder={handoffMode ? 'Add phone/email and issue summary...' : 'Ask for help...'}
          placeholderTextColor="#8ba0b8"
          style={styles.input}
        />
        <Pressable onPress={() => sendMessage()} style={styles.sendButton} accessibilityRole="button" accessibilityLabel="Send message">
          <Send size={17} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'fixed',
    right: 18,
    bottom: 18,
    width: 54,
    height: 54,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 16px 42px rgba(7, 87, 200, 0.28)',
    zIndex: 1000
  },
  badge: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff'
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  panel: {
    position: 'fixed',
    right: 18,
    bottom: 18,
    width: 'min(370px, calc(100vw - 28px))',
    maxHeight: 'min(620px, calc(100vh - 28px))',
    borderWidth: 1,
    borderColor: '#cfe0fb',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    boxShadow: '0 24px 70px rgba(15, 23, 42, 0.24)',
    zIndex: 1000
  },
  header: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5edf7',
    backgroundColor: '#f8fbff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    flex: 1
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#22a06b',
    boxShadow: '0 0 0 3px rgba(34, 160, 107, 0.12)'
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6
  },
  clearButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cfe0fb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    cursor: 'pointer'
  },
  clearText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700'
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cfe0fb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  messages: {
    padding: 12,
    gap: 9,
    maxHeight: 330,
    overflowY: 'auto',
    backgroundColor: '#ffffff'
  },
  assistantMessageWrap: {
    alignSelf: 'stretch',
    gap: 4
  },
  userMessageWrap: {
    alignSelf: 'stretch',
    alignItems: 'flex-end'
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 2
  },
  messageMetaText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700'
  },
  systemEvent: {
    alignSelf: 'center',
    minHeight: 24,
    borderRadius: 999,
    backgroundColor: '#edf9f2',
    borderWidth: 1,
    borderColor: '#ccefdc',
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  systemEventText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '700'
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef6ff',
    borderWidth: 1,
    borderColor: '#d5e6ff'
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary
  },
  assistantText: {
    color: colors.slate,
    lineHeight: 20,
    fontSize: 14
  },
  userText: {
    color: '#ffffff',
    lineHeight: 20,
    fontSize: 14
  },
  quickRow: {
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
    paddingHorizontal: 12,
    paddingTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  quickButton: {
    minHeight: 30,
    borderWidth: 1,
    borderColor: '#cfe0fb',
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    cursor: 'pointer'
  },
  quickText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600'
  },
  liveButton: {
    flexDirection: 'row',
    gap: 5,
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  liveText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  handoffRow: {
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
    paddingHorizontal: 12,
    paddingTop: 10,
    flexDirection: 'row',
    gap: 8
  },
  handoffButton: {
    minHeight: 38,
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#22a06b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    cursor: 'pointer'
  },
  handoffText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  emailButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cfe0fb'
  },
  emailText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700'
  },
  inputRow: {
    padding: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#cfddec',
    borderRadius: 8,
    paddingHorizontal: 11,
    color: colors.text,
    backgroundColor: '#ffffff',
    outlineStyle: 'none',
    fontSize: 14
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  }
});
