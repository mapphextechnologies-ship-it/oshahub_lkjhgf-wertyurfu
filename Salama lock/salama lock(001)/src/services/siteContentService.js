import { buildApiUrl } from './apiUrl.js';
import { defaultPaymentConfig } from './paymentConfigService.js';

const heroPhoto = '/landing/boda-paygo.jpg';
const paymentPhoto = '/landing/mobile-money-agent.jpg';
const cookerPhoto = '/landing/gas-cooker.jpg';
const solarPhoto = '/landing/solar-lamp.jpg';
const supportPhone = '0740418079';
const supportEmail = 'SALAMA LOCKpaygo@gmail.com';

export const defaultSiteContent = {
  brand: {
    name: 'SALAMA LOCK Paygo',
    meta: 'Lipa mdogo mdogo products',
    location: 'Nairobi, Kenya'
  },
  hero: {
    kicker: 'PAYGO services',
    title: 'SALAMA LOCK Paygo',
    subtitle: 'Premium PAYGO access for motorbikes, phones, cookers, solar lamps, and practical assets customers can start using now and pay for steadily.',
    visualTitle: 'Access today. Pay steadily.',
    visualText: 'Products for work, mobility, home use, and everyday progress.',
    image: heroPhoto
  },
  trustSignals: ['Lipa mdogo mdogo', 'Nairobi base', 'Kenya-wide dealer plan'],
  heroStats: [
    { label: 'Paybill', value: defaultPaymentConfig.paybillNumber || '4050421', hint: 'Configured for direct customer payments' },
    { label: 'Portals', value: '3', hint: 'Agent, customer, and back office workspaces' },
    { label: 'Inventory lanes', value: '2', hint: 'Separate bike and phone workflows' }
  ],
  paybill: {
    kicker: 'Direct Paybill',
    title: 'Pay without the app',
    intro: 'Use the configured Paybill and your National ID as the account number. The payment is matched to your customer record after M-PESA confirms it.',
    note: 'Works for payments from any M-PESA line.',
    accountReferenceLabel: 'National ID'
  },
  about: {
    kicker: 'About',
    title: 'PAYGO built around real customers',
    intro: 'SALAMA LOCK helps customers and small businesses access useful products through structured lipa mdogo mdogo plans, with Nairobi operations and a dealer network growing across Kenya.',
    mainTitle: 'Access without paying everything upfront',
    mainText: 'Customers can apply for approved products, pay a deposit, and continue with manageable instalments. SALAMA LOCK focuses on assets that help people move, work, cook, communicate, and light their spaces.',
    metrics: [
      { value: '4', label: 'Customer journeys' },
      { value: '1', label: 'PAYGO access model' }
    ]
  },
  products: {
    kicker: 'Products',
    title: 'PAYGO assets for daily life and work',
    intro: 'Motorbikes, phones, cookers, solar lamps, and other approved products can be offered through lipa mdogo mdogo.',
    statementTitle: 'Any approved product can become PAYGO.',
    statementText: 'Motorbikes, phones, cookers, solar lamps, appliances, business tools, and dealer-approved assets can be structured for lipa mdogo mdogo when the customer profile and repayment plan are approved.',
    cards: [
      { title: 'Motorbikes', text: 'Bodaboda riders can access income-ready motorcycles and repay in manageable instalments.', image: heroPhoto },
      { title: 'Phones', text: 'Customers can choose smartphones and connected devices without paying the full price upfront.', image: paymentPhoto },
      { title: 'Cookers with lockers', text: 'Household cooking products and secured asset packages for everyday needs.', image: cookerPhoto },
      { title: 'Solar lamps', text: 'Lighting products and small energy assets for homes, shops, and workspaces.', image: solarPhoto }
    ]
  },
  services: {
    kicker: 'Services',
    title: 'How SALAMA LOCK supports PAYGO customers',
    intro: 'From product selection to repayment support, SALAMA LOCK is built for customers, field agents, dealers, and teams serving everyday Kenyan PAYGO needs.',
    visualKicker: 'For customers and teams',
    visualTitle: 'Designed for familiar Kenyan payment behavior',
    visualText: 'Customers can use familiar mobile money journeys while SALAMA LOCK teams and approved dealers keep the service relationship clear, professional, and accountable.',
    highlights: [
      {
        title: 'Flexible asset access',
        text: 'Customers can start with an approved deposit, receive the product, and continue with a repayment plan that fits daily life.'
      },
      {
        title: 'Mobile money convenience',
        text: 'Payments are designed around familiar Kenyan M-PESA habits through Safaricom Daraja payment flows.'
      },
      {
        title: 'Agent and dealer support',
        text: 'Agents and dealers help customers apply, understand repayment expectations, and receive follow-up support.'
      }
    ],
    image: paymentPhoto
  },
  workflow: {
    kicker: 'Workflow',
    title: 'From product choice to ownership',
    steps: [
      { title: 'Choose', text: 'Select a PAYGO-ready product from SALAMA LOCK or an approved dealer.' },
      { title: 'Apply', text: 'Share the required details and receive screening guidance.' },
      { title: 'Start', text: 'Pay the deposit and begin using the product after approval.' },
      { title: 'Continue', text: 'Repay in manageable instalments with support when needed.' }
    ]
  },
  location: {
    kicker: 'Location',
    title: 'Based in Nairobi',
    intro: 'SALAMA LOCK is based in Nairobi, with dealer coverage planned across Kenya so customers can access approved PAYGO products closer to where they live and work.',
    statementTitle: 'Office visits and dealer onboarding',
    statementText: 'Customers, agents, and dealers can use the contact channels to confirm office visit arrangements, product availability, and dealer onboarding information.',
    details: [
      { label: 'Base', value: 'Nairobi, Kenya' },
      { label: 'Coverage', value: 'Dealer network planned across Kenya' },
      { label: 'Products', value: 'Motorbikes, phones, cookers, solar lamps, and approved assets' },
      { label: 'Support', value: 'Customer, agent, and dealer support channels' }
    ]
  },
  contact: {
    title: 'Contact',
    pageTitle: 'Talk to SALAMA LOCK about PAYGO products, dealers, or portal access',
    intro: 'Reach the SALAMA LOCK team through the main business channels below.',
    statementTitle: 'Customers and agents can start from the portals.',
    statementText: 'Customer and agent access stays separated by role while internal team portals stay private by direct link.',
    phone: supportPhone,
    email: supportEmail,
    location: 'Nairobi, Kenya'
  },
  footer: {
    title: 'SALAMA LOCK Paygo',
    text: 'PAYGO products and customer support.',
    location: 'Nairobi, Kenya',
    phone: supportPhone,
    email: supportEmail
  }
};

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.map((item) => normalizeText(item)).filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}

function normalizePairs(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') {
        const [first, ...rest] = item.split('|');
        const title = normalizeText(first);
        const text = normalizeText(rest.join('|'));
        return title && text ? { title, text } : null;
      }

      if (typeof item === 'object') {
        const title = normalizeText(item.title || item.label || item.name);
        const text = normalizeText(item.text || item.description || item.value || item.detail);
        const image = normalizeText(item.image || item.imageUrl || item.image_url);
        return title && text ? { title, text, ...(image ? { image } : {}) } : null;
      }

      return null;
    })
    .filter(Boolean);

  return cleaned.length ? cleaned : fallback;
}

function normalizeMetricList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => {
      if (!item) return null;
      const valueText = normalizeText(item.value || item.amount || item.count);
      const label = normalizeText(item.label || item.title || item.name);
      const hint = normalizeText(item.hint || item.text || item.description);
      return valueText && label ? { value: valueText, label, ...(hint ? { hint } : {}) } : null;
    })
    .filter(Boolean);

  return cleaned.length ? cleaned : fallback;
}

export function normalizeSiteContent(raw = {}) {
  const website = raw && typeof raw === 'object' ? raw : {};

  return {
    brand: {
      ...defaultSiteContent.brand,
      ...(website.brand && typeof website.brand === 'object' ? website.brand : {})
    },
    hero: {
      ...defaultSiteContent.hero,
      ...(website.hero && typeof website.hero === 'object' ? website.hero : {})
    },
    trustSignals: normalizeList(website.trustSignals, defaultSiteContent.trustSignals),
    heroStats: normalizeMetricList(website.heroStats, defaultSiteContent.heroStats),
    paybill: {
      ...defaultSiteContent.paybill,
      ...(website.paybill && typeof website.paybill === 'object' ? website.paybill : {})
    },
    about: {
      ...defaultSiteContent.about,
      ...(website.about && typeof website.about === 'object' ? website.about : {}),
      metrics: normalizeMetricList(website.about?.metrics, defaultSiteContent.about.metrics)
    },
    products: {
      ...defaultSiteContent.products,
      ...(website.products && typeof website.products === 'object' ? website.products : {}),
      cards: normalizePairs(website.products?.cards, defaultSiteContent.products.cards)
    },
    services: {
      ...defaultSiteContent.services,
      ...(website.services && typeof website.services === 'object' ? website.services : {}),
      highlights: normalizePairs(website.services?.highlights, defaultSiteContent.services.highlights)
    },
    workflow: {
      ...defaultSiteContent.workflow,
      ...(website.workflow && typeof website.workflow === 'object' ? website.workflow : {}),
      steps: normalizePairs(website.workflow?.steps, defaultSiteContent.workflow.steps)
    },
    location: {
      ...defaultSiteContent.location,
      ...(website.location && typeof website.location === 'object' ? website.location : {}),
      details: normalizePairs(website.location?.details, defaultSiteContent.location.details)
    },
    contact: {
      ...defaultSiteContent.contact,
      ...(website.contact && typeof website.contact === 'object' ? website.contact : {}),
      phone: supportPhone,
      email: supportEmail
    },
    footer: {
      ...defaultSiteContent.footer,
      ...(website.footer && typeof website.footer === 'object' ? website.footer : {}),
      phone: supportPhone,
      email: supportEmail
    }
  };
}

export async function loadSiteContent() {
  const response = await fetch(buildApiUrl('/api/public/site-content'), {
    headers: {
      Accept: 'application/json'
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Could not load site content.');
  }

  return {
    website: normalizeSiteContent(data.website || {}),
    paymentConfig: {
      ...defaultPaymentConfig,
      ...(data.paymentConfig || {})
    }
  };
}
