import { sendJson, sendOptions, readJson } from '../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';
import {
  appendMessage,
  buildTemplateReply,
  callLanguageModel,
  classifyIntent,
  createConversationRecord,
  createSupportTicket,
  detectLiveAgentRequest,
  detectPromptInjection,
  detectSecretRequest,
  fetchConversation,
  fetchConversationByKey,
  fetchConversationMessages,
  loadCustomerContext,
  loadKnowledgeSnippets,
  recordAudit,
  recordSecurityEvent,
  refusalMessage,
  resolveSupportSession
} from '../_lib/support-assistant.js';
import { resolvePaymentConfig } from '../_lib/payment-config.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeConversationKey(value) {
  return normalizeText(value).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

async function buildSafeReply({
  intent,
  message,
  conversation,
  session,
  paymentConfig,
  customerContext,
  knowledgeSnippets,
  requestHumanAgent,
  liveAgentRequested,
  requestedAgentHint,
  requestedHandoffTeam
}) {
  const verified = Boolean(session.customer);
  const templateReply = buildTemplateReply({
    intent,
    customerSummary: customerContext?.summary || null,
    paymentConfig,
    knowledgeSnippets,
    verified,
    message
  });
  const needsHandoffDetails = Boolean(liveAgentRequested && !requestedAgentHint && !requestedHandoffTeam);
  const directReply = needsHandoffDetails
    ? 'I can connect you to support. Which team do you need: admin, back office, or agent? Please share a short issue summary and I’ll route it.'
    : (requestHumanAgent || detectLiveAgentRequest(message))
    ? 'A human agent can help with that. I can create a support ticket or connect you to live chat.'
    : templateReply;
  const shouldUseModel = Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY) && intent === 'unknown_intent';
  const reply = shouldUseModel
    ? normalizeText(await callLanguageModel({
        reply: directReply,
        conversation,
        safeContext: {
          userRole: session.role,
          verifiedCustomer: verified,
          accountSpecific: customerContext?.summary || null,
          paymentConfig,
          conversationTopic: conversation.topic || null
        },
        knowledgeSnippets
      }) || directReply || refusalMessage())
    : normalizeText(directReply || refusalMessage());
  const shouldCreateTicket = Boolean((requestHumanAgent || detectLiveAgentRequest(message)) && !needsHandoffDetails);

  return {
    reply,
    needsTicket: shouldCreateTicket
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendOptions(res, 'GET,POST,OPTIONS');
    return;
  }

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET,POST,OPTIONS');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    await assertRateLimit(req, { scope: 'support-chat', limit: 24, windowMs: 60_000 });
    const conversationKeyParam = normalizeConversationKey(new URL(req.url, 'https://local.vercel.app').searchParams.get('conversationKey'));
    const body = req.method === 'POST' ? await readJson(req, { maxBytes: 32 * 1024 }) : {};
    const conversationKey = normalizeConversationKey(body.conversationKey || body.conversation_key || conversationKeyParam);
    const message = normalizeText(body.message || body.text || '');
    const requestHumanAgent = Boolean(body.requestHumanAgent || body.request_human_agent || body.handoff);
    const requestedAgentHint = normalizeText(
      body.requestedAgentHint ||
      body.requested_agent_hint ||
      body.requestedAgent ||
      body.requested_agent ||
      body.metadata?.requestedAgentHint ||
      body.metadata?.requested_agent_hint ||
      ''
    );
    const requestedHandoffTeam = normalizeText(
      body.requestedHandoffTeam ||
      body.requested_handoff_team ||
      body.metadata?.requestedHandoffTeam ||
      body.metadata?.requested_handoff_team ||
      ''
    );
    const channel = normalizeText(body.channel || 'web') || 'web';

    const session = await resolveSupportSession(req);
    const paymentConfig = await resolvePaymentConfig();

    const conversation =
      (conversationKey ? await fetchConversationByKey(conversationKey) : null) ||
      (conversationKey
        ? await createConversationRecord({
            conversationId: conversationKey,
            authUser: session.user,
            customer: session.customer,
            channel
          })
        : await createConversationRecord({
            authUser: session.user,
            customer: session.customer,
            channel
          }));

    if (req.method === 'GET') {
      const messages = await fetchConversationMessages(conversation.id);
      sendJson(res, 200, {
        ok: true,
        conversationKey: conversation.conversation_key,
        conversation,
        messages
      });
      return;
    }

    assertBodySize(req);

    if (!message && !requestHumanAgent) {
      sendJson(res, 400, { message: 'Enter a message or request a human agent.' });
      return;
    }

    const intent = classifyIntent(message || 'live agent');
    const promptInjection = detectPromptInjection(message);
    const secretRequest = detectSecretRequest(message);
    const liveAgentRequested = requestHumanAgent || detectLiveAgentRequest(message);
    const conversationContext = session.customer
      ? await loadCustomerContext(session.customer, paymentConfig)
      : null;
    const knowledgeSnippets = await loadKnowledgeSnippets({
      query: message,
      category: intent === 'payment_issue' ? 'payments' : null
    });

    await appendMessage({
      conversationId: conversation.id,
      senderType: 'customer',
      senderId: session.user?.id || session.customer?.id || null,
      channel,
      messageType: 'text',
      content: message || '[live agent request]',
      safeContent: message || '[live agent request]',
      deliveryStatus: 'stored',
      metadata: {
        intent,
        requestHumanAgent: liveAgentRequested,
        requestedAgentHint: requestedAgentHint || null,
        requestedHandoffTeam: requestedHandoffTeam || null
      }
    });

    let reply = refusalMessage();
    let ticket = null;
    let responseType = 'refusal';

    if (secretRequest || promptInjection) {
      await recordSecurityEvent({
        conversationId: conversation.id,
        authUser: session.user,
        channel,
        eventType: secretRequest ? 'secret_request' : 'prompt_injection',
        severity: 'high',
        input: message,
        details: {
          intent,
          requestHumanAgent: liveAgentRequested
        }
      });
    } else {
      const safeReply = await buildSafeReply({
        intent,
        message,
        conversation,
        session,
        paymentConfig,
        customerContext: conversationContext,
        knowledgeSnippets,
        requestHumanAgent: liveAgentRequested,
        liveAgentRequested,
        requestedAgentHint,
        requestedHandoffTeam
      });
      reply = safeReply.reply;
      responseType = 'assistant';

      if (safeReply.needsTicket) {
        ticket = await createSupportTicket({
          conversation,
          authUser: session.user,
          customer: session.customer,
          category: intent,
          priority: intent === 'refund_request' || intent === 'unlock_failed' ? 'high' : 'normal',
          subject: message.slice(0, 120) || `SALAMA LOCK support request: ${intent}`,
          summary: message || intent,
          channel,
          requestedAgentHint,
          requestedHandoffTeam
        });
        responseType = 'ticket';
        const agentName = ticket.assignedAgentName || '';
        const agentLine = agentName
          ? ` I’ll connect you to ${agentName} on WhatsApp.`
          : ' I’ll connect you to WhatsApp support.';
        reply = ticket.wasCreated
          ? `${reply}${agentLine} A support ticket has been created with reference ${ticket.reference_number}.`
          : `${reply}${agentLine} I’ve attached this to your existing support ticket ${ticket.reference_number}.`;
      }
    }

    const assistantMessage = await appendMessage({
      conversationId: conversation.id,
      senderType: 'assistant',
      senderId: null,
      channel,
      messageType: 'text',
      content: reply,
      safeContent: reply,
      deliveryStatus: 'stored',
      metadata: {
        intent,
        responseType,
        ticketReference: ticket?.reference_number || null,
        liveAgentRequested,
        requestedHandoffTeam: requestedHandoffTeam || null
      }
    });

    await recordAudit({
      conversationId: conversation.id,
      authUser: session.user,
      toolName: 'support_chat',
      request: {
        intent,
        channel,
        hasMessage: Boolean(message),
        requestHumanAgent: liveAgentRequested,
        requestedAgentHint: requestedAgentHint || null,
        requestedHandoffTeam: requestedHandoffTeam || null
      },
      response: {
        responseType,
        ticketReference: ticket?.reference_number || null
      },
      outcome: secretRequest || promptInjection ? 'refused' : 'ok'
    }).catch(() => {});

    const refreshedConversation = await fetchConversation(conversation.id);
    const messages = await fetchConversationMessages(conversation.id);

    sendJson(res, 200, {
      ok: true,
      conversationKey: conversation.conversation_key,
      conversation: refreshedConversation || conversation,
      messages,
      reply: assistantMessage,
      ticket: ticket ? {
        id: ticket.id,
        referenceNumber: ticket.reference_number,
        status: ticket.status,
        priority: ticket.priority,
        assignedAgentId: ticket.assignedAgentId || null,
        assignedAgentName: ticket.assignedAgentName || null,
        assignedAgentCode: ticket.assignedAgentCode || null,
        assignedAgentPhone: ticket.assignedAgentPhone || null,
        requestedHandoffTeam: ticket.requestedHandoffTeam || null
      } : null,
      security: {
        promptInjection,
        secretRequest
      }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message || 'Support assistant request failed.'
    });
  }
}
