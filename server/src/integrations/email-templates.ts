// ─────────────────────────────────────────────────────────────────────────────
// QMS — Central Email Template Registry (single source of truth)
// Ported verbatim from supabase/functions/_shared/email-templates.ts — same
// branding/copy. Only change: COMPANY_NAME reads from validated env.
// ─────────────────────────────────────────────────────────────────────────────
import { env } from '../env';

const BRAND = {
  navy: '#0F2A47',
  blue: '#1B5EA0',
  gold: '#D4930A',
  green: '#15673A',
  red: '#B91C1C',
  amber: '#92400E',
  border: '#CBD5E1',
  surface: '#F8FAFC',
  muted: '#64748B',
  ink: '#1a1a1a',
};

export const COMPANY_NAME = env.SENDER_NAME || 'Global Geotechnical Consultancy';

function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(opts: { heading: string; subheading?: string; body: string; accent?: string }): string {
  const accent = opts.accent || BRAND.navy;
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:${BRAND.surface};">
  <div style="font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};max-width:600px;margin:0 auto;padding:24px 12px;">
    <div style="background:${accent};padding:22px 28px;border-radius:10px 10px 0 0;">
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">${esc(opts.heading)}</h1>
      ${opts.subheading ? `<p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px;font-family:monospace;">${esc(opts.subheading)}</p>` : ''}
    </div>
    <div style="background:#ffffff;border:1px solid ${BRAND.border};border-top:none;padding:32px 28px;border-radius:0 0 10px 10px;">
      ${opts.body}
      <hr style="border:none;border-top:1px solid ${BRAND.border};margin:28px 0 16px;" />
      <p style="color:${BRAND.muted};font-size:12px;margin:0;">${esc(COMPANY_NAME)}</p>
    </div>
  </div>
</body>
</html>`;
}

function button(href: string, label: string, color = BRAND.blue): string {
  return `<div style="text-align:center;margin:26px 0;">
    <a href="${esc(href)}" style="display:inline-block;background:${color};color:#ffffff;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${esc(label)}</a>
  </div>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 0;color:${BRAND.muted};width:140px;vertical-align:top;">${esc(label)}</td>
    <td style="padding:7px 0;font-weight:600;">${value}</td>
  </tr>`;
}

export interface TemplateParams {
  intake_link: { client_name: string; ref_number?: string; intake_url: string };
  intake_reminder: { client_name: string; ref_number: string; intake_url: string; is_final?: boolean };
  intake_expiry_admin: { ref_number: string; client_name: string; client_phone: string; expiry_date: string };
  new_intake_admin: { ref_number: string; site_city?: string; structure_type?: string; num_bores?: number | string };
  quotation_sent: { client_name: string; ref_number: string; total_amount: string; validity_date: string };
  payment_request: { client_name: string; ref_number: string; amount: string };
  payment_request_detailed: {
    client_name: string; ref_number: string; type_label: string; amount: string;
    due_date: string; bank_details: string; instructions?: string;
  };
  payment_reminder: { client_name: string; ref_number: string; amount: string; payment_type: string };
  mobilisation_confirmed: {
    client_name: string; ref_number: string; date: string; time?: string;
    city: string; contact_name?: string; contact_phone?: string;
  };
  mobilisation_revised: { client_name: string; ref_number: string; date: string; city: string; confirm_url: string };
  followup_reminder: { ref_number: string; client_name?: string; scheduled_date: string; notes?: string | null; is_overdue?: boolean };
  job_reminder: { ref_number: string; client_name?: string; type_label: string; days_before: number | string; target_date: string };
  site_visit_today: {
    ref_number: string; geologist_name: string; client_name: string; client_phone: string;
    client_email?: string | null; site_address: string; structure_type?: string | null;
    num_bores?: number | null; depth_m?: number | null; notes?: string; form_url: string;
  };
  weekly_summary: {
    week_ending: string; new_enquiries: number; quotations_sent: number; revenue: string;
    status_counts: Record<string, number>; overdue_follow_ups: number; pending_payments: number;
  };
  // Client-facing lifecycle touchpoints.
  order_confirmed: { client_name: string; ref_number: string; total_amount: string; advance_amount?: string };
  payment_received: { client_name: string; ref_number: string; amount: string; payment_type: string; balance?: string };
  mobilisation_acknowledged: { client_name: string; ref_number: string; date: string; city: string };
  job_completed: { client_name: string; ref_number: string };
}

export type TemplateKey = keyof TemplateParams;
export interface RenderedEmail {
  subject: string;
  html: string;
}

const TEMPLATES: { [K in TemplateKey]: (p: TemplateParams[K]) => RenderedEmail } = {
  intake_link: (p) => ({
    subject: p.ref_number ? `Site Investigation Intake Form — ${p.ref_number}` : 'Site Investigation Intake Form',
    html: layout({
      heading: 'Site Investigation Intake',
      subheading: p.ref_number,
      body: `
        <p style="font-size:16px;">Dear ${esc(p.client_name)},</p>
        <p>Please fill in the intake form for your site investigation enquiry${p.ref_number ? ` <strong>${esc(p.ref_number)}</strong>` : ''}.</p>
        ${button(p.intake_url, 'Fill Intake Form')}
        <p style="font-size:12px;color:${BRAND.muted};">This link expires in 7 days.</p>`,
    }),
  }),

  intake_reminder: (p) => ({
    subject: p.is_final ? `Last Day: Intake form link expires today — ${p.ref_number}` : `Reminder: Please fill the intake form — ${p.ref_number}`,
    html: layout({
      heading: p.is_final ? 'Last Day — Intake Form Expiring' : 'Reminder: Intake Form Pending',
      subheading: p.ref_number,
      accent: p.is_final ? BRAND.red : BRAND.navy,
      body: `
        <p>Dear ${esc(p.client_name)},</p>
        <p>We sent you an intake form for your site investigation enquiry <strong>${esc(p.ref_number)}</strong>, but it hasn't been filled yet.</p>
        ${p.is_final ? `<p style="background:#FEF2F2;color:${BRAND.red};padding:10px 14px;border-radius:6px;font-size:13px;font-weight:600;">This link expires today. Please fill the form before end of day.</p>` : ''}
        <p>Please take a few minutes to fill it so we can prepare your quotation:</p>
        ${button(p.intake_url, 'Fill Intake Form')}
        <p style="font-size:12px;color:${BRAND.muted};">${p.is_final ? 'This is the last reminder — the link expires today.' : 'If you have already submitted, please disregard this email.'}</p>`,
    }),
  }),

  intake_expiry_admin: (p) => ({
    subject: `⚠ Intake form not filled — ${p.ref_number} — ${p.client_name}`,
    html: layout({
      heading: 'Intake Form Not Filled',
      accent: BRAND.red,
      body: `
        <table style="width:100%;border-collapse:collapse;">
          ${detailRow('Enquiry', esc(p.ref_number))}
          ${detailRow('Client', esc(p.client_name))}
          ${detailRow('Phone', `<a href="tel:${esc(p.client_phone)}" style="color:${BRAND.blue};">${esc(p.client_phone)}</a>`)}
          ${detailRow('Link Expires', esc(p.expiry_date))}
        </table>
        <div style="background:#FEF2F2;padding:12px 14px;border-radius:6px;margin:18px 0 0;">
          <p style="margin:0;font-size:13px;color:${BRAND.red};font-weight:600;">Action Required</p>
          <p style="margin:4px 0 0;font-size:13px;color:#7F1D1D;">This client has not filled the intake form after 7 days. Please call them to follow up or fill the form on their behalf.</p>
        </div>`,
    }),
  }),

  new_intake_admin: (p) => ({
    subject: `New Intake Submitted — ${p.ref_number}`,
    html: layout({
      heading: 'New Intake Received',
      body: `
        <p>A new intake form has been submitted.</p>
        <div style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;padding:18px 20px;margin:16px 0;">
          <table style="width:100%;border-collapse:collapse;">
            ${detailRow('Reference', `<span style="font-family:monospace;">${esc(p.ref_number)}</span>`)}
            ${detailRow('City', esc(p.site_city || '—'))}
            ${detailRow('Structure', esc(p.structure_type || '—'))}
            ${detailRow('Bores', esc(p.num_bores ?? '—'))}
          </table>
        </div>
        <p style="color:${BRAND.muted};font-size:14px;">Log in to the QMS to review and create a quotation.</p>`,
    }),
  }),

  quotation_sent: (p) => ({
    subject: `Quotation — ${p.ref_number}`,
    html: layout({
      heading: COMPANY_NAME,
      body: `
        <p style="font-size:16px;">Dear ${esc(p.client_name)},</p>
        <p>Thank you for your enquiry. Please find below the quotation details for your project.</p>
        <div style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;padding:18px 20px;margin:22px 0;">
          <table style="width:100%;border-collapse:collapse;">
            ${detailRow('Reference Number', `<span style="font-family:monospace;">${esc(p.ref_number)}</span>`)}
            ${detailRow('Total Amount', esc(p.total_amount))}
            ${detailRow('Valid Until', esc(p.validity_date))}
          </table>
        </div>
        <p>Please find the detailed quotation attached as a PDF. If you have any questions or would like to proceed, please contact us.</p>
        <p style="margin-top:28px;">Best regards,<br/><strong>The Team</strong></p>`,
    }),
  }),

  payment_request: (p) => ({
    subject: `Advance Payment Request — ${p.ref_number}`,
    html: layout({
      heading: 'Advance Payment Request',
      body: `
        <p>Dear ${esc(p.client_name)},</p>
        <p>Thank you for confirming the quotation for <strong>${esc(p.ref_number)}</strong>.</p>
        <p>An advance payment of <strong>${esc(p.amount)}</strong> (50% of quotation value) is required to proceed with mobilization.</p>
        <p>Please arrange the payment at your earliest convenience.</p>
        <p style="margin-top:24px;">Best regards,<br/><strong>${esc(COMPANY_NAME)}</strong></p>`,
    }),
  }),

  payment_request_detailed: (p) => ({
    subject: `${p.type_label} Payment Request — ${p.ref_number}`,
    html: layout({
      heading: COMPANY_NAME,
      subheading: 'Payment Request',
      body: `
        <p style="font-size:16px;">Dear ${esc(p.client_name)},</p>
        <p>We request the ${esc(p.type_label.toLowerCase())} payment for your project <strong style="font-family:monospace;">${esc(p.ref_number)}</strong>.</p>
        <div style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;padding:18px 20px;margin:22px 0;">
          <table style="width:100%;border-collapse:collapse;">
            ${detailRow('Amount Due', esc(p.amount))}
            ${detailRow('Due Date', esc(p.due_date))}
          </table>
          <p style="margin:14px 0 4px;font-weight:bold;">Bank Details:</p>
          <p style="margin:0;white-space:pre-line;font-size:14px;">${esc(p.bank_details)}</p>
        </div>
        ${p.instructions ? `<p style="font-size:14px;color:${BRAND.muted};">${esc(p.instructions)}</p>` : ''}
        <p style="margin-top:28px;">Best regards,<br/><strong>The Team</strong></p>`,
    }),
  }),

  payment_reminder: (p) => ({
    subject: `Payment Reminder — ${p.ref_number}`,
    html: layout({
      heading: 'Payment Reminder',
      body: `
        <p>Dear ${esc(p.client_name)},</p>
        <p>This is a gentle reminder that the <strong>${esc(p.payment_type)}</strong> payment of <strong>${esc(p.amount)}</strong> for enquiry <strong>${esc(p.ref_number)}</strong> is still pending.</p>
        <p>Please arrange the payment at your earliest convenience. If you have already made the payment, kindly disregard this message.</p>`,
    }),
  }),

  mobilisation_confirmed: (p) => ({
    subject: `Site Visit Confirmed — ${p.ref_number}`,
    html: layout({
      heading: COMPANY_NAME,
      subheading: 'Mobilisation Confirmation',
      body: `
        <p style="font-size:16px;">Dear ${esc(p.client_name)},</p>
        <p>Your site investigation for project <strong style="font-family:monospace;">${esc(p.ref_number)}</strong> has been scheduled.</p>
        <div style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;padding:18px 20px;margin:22px 0;">
          <table style="width:100%;border-collapse:collapse;">
            ${detailRow('Date', esc(p.date))}
            ${p.time ? detailRow('Time', esc(p.time)) : ''}
            ${detailRow('Location', esc(p.city))}
            ${p.contact_name ? detailRow('Site Contact', `${esc(p.contact_name)}${p.contact_phone ? ` (${esc(p.contact_phone)})` : ''}`) : ''}
          </table>
        </div>
        <p style="font-size:14px;color:${BRAND.muted};">Please ensure site access is available on the scheduled date. Our team will arrive with the necessary equipment.</p>
        <p style="margin-top:28px;">Best regards,<br/><strong>The Team</strong></p>`,
    }),
  }),

  mobilisation_revised: (p) => ({
    subject: `Revised Mobilisation Date — ${p.ref_number}`,
    html: layout({
      heading: 'Mobilisation Confirmation',
      body: `
        <p>Dear ${esc(p.client_name)},</p>
        <p>We propose a revised mobilisation date for project <strong>${esc(p.ref_number)}</strong>:</p>
        <div style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;padding:16px 20px;margin:16px 0;">
          <table style="width:100%;border-collapse:collapse;">
            ${detailRow('Proposed Date', esc(p.date))}
            ${detailRow('Location', esc(p.city))}
          </table>
        </div>
        ${button(p.confirm_url, 'Confirm or Propose Another Date', BRAND.green)}
        <p style="font-size:13px;color:${BRAND.muted};">Or open this link: ${esc(p.confirm_url)}</p>`,
    }),
  }),

  followup_reminder: (p) => {
    const badge = p.is_overdue
      ? `<span style="background:${BRAND.red};color:#fff;padding:2px 10px;border-radius:4px;font-size:12px;">OVERDUE</span>`
      : `<span style="background:${BRAND.gold};color:#fff;padding:2px 10px;border-radius:4px;font-size:12px;">DUE TODAY</span>`;
    const label = p.is_overdue ? 'Overdue Follow-up' : 'Follow-up Due Today';
    return {
      subject: `${label} — ${p.ref_number}`,
      html: layout({
        heading: `Follow-up Reminder ${badge}`,
        body: `
          <table style="width:100%;border-collapse:collapse;">
            ${detailRow('Enquiry', esc(p.ref_number))}
            ${detailRow('Client', esc(p.client_name || '—'))}
            ${detailRow('Scheduled', esc(p.scheduled_date))}
            ${p.notes ? detailRow('Notes', esc(p.notes)) : ''}
          </table>
          <p style="color:${BRAND.muted};font-size:12px;margin-top:18px;">This is an automated reminder from QMS.</p>`,
      }),
    };
  },

  job_reminder: (p) => ({
    subject: `Job Reminder: ${p.type_label} in ${p.days_before} day(s) — ${p.ref_number}`,
    html: layout({
      heading: `Job Reminder — ${p.days_before} Day(s) Away`,
      body: `
        <table style="width:100%;border-collapse:collapse;">
          ${detailRow('Enquiry', esc(p.ref_number))}
          ${detailRow('Client', esc(p.client_name || '—'))}
          ${detailRow('Type', esc(p.type_label))}
          ${detailRow('Target Date', esc(p.target_date))}
        </table>
        <p style="color:${BRAND.muted};font-size:12px;margin-top:18px;">This is an automated reminder from QMS.</p>`,
    }),
  }),

  site_visit_today: (p) => ({
    subject: `Site Visit Today — ${p.ref_number} — ${p.site_address}`,
    html: layout({
      heading: '🏗️ Site Visit Today',
      subheading: p.ref_number,
      body: `
        <p style="margin:0 0 12px;">Hi <strong>${esc(p.geologist_name)}</strong>,</p>
        <p>You have a site visit scheduled for <strong>today</strong>. Here are the details:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          ${detailRow('Site Address', esc(p.site_address))}
          ${detailRow('Contact Person', esc(p.client_name))}
          ${detailRow('Phone', `<a href="tel:${esc(p.client_phone)}" style="color:${BRAND.blue};">${esc(p.client_phone)}</a>`)}
          ${p.client_email ? detailRow('Email', `<a href="mailto:${esc(p.client_email)}" style="color:${BRAND.blue};">${esc(p.client_email)}</a>`) : ''}
          ${p.structure_type ? detailRow('Structure', esc(p.structure_type)) : ''}
          ${p.num_bores ? detailRow('Bores', esc(p.num_bores)) : ''}
          ${p.depth_m ? detailRow('Depth', `${esc(p.depth_m)}m`) : ''}
        </table>
        ${p.notes ? `<p style="background:#FFFBEB;padding:10px 14px;border-radius:6px;font-size:13px;color:#78350F;"><strong>Notes:</strong> ${esc(p.notes)}</p>` : ''}
        ${button(p.form_url, '📋 Fill Site Visit Report', BRAND.green)}
        <p style="text-align:center;font-size:12px;color:#94A3B8;">Click the button above after your visit to submit your observations directly into the system.</p>`,
    }),
  }),

  order_confirmed: (p) => ({
    subject: `Thank You — Order Confirmed — ${p.ref_number}`,
    html: layout({
      heading: COMPANY_NAME,
      subheading: 'Order Confirmed',
      accent: BRAND.green,
      body: `
        <p style="font-size:16px;">Dear ${esc(p.client_name)},</p>
        <p>Thank you for choosing <strong>${esc(COMPANY_NAME)}</strong> for your geotechnical investigation. We are delighted to confirm your order for project <strong style="font-family:monospace;">${esc(p.ref_number)}</strong>.</p>
        <div style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;padding:18px 20px;margin:22px 0;">
          <table style="width:100%;border-collapse:collapse;">
            ${detailRow('Project', `<span style="font-family:monospace;">${esc(p.ref_number)}</span>`)}
            ${detailRow('Order Value', esc(p.total_amount))}
            ${p.advance_amount ? detailRow('Advance Due', esc(p.advance_amount)) : ''}
          </table>
        </div>
        <p>Our team will now proceed with the next steps. ${p.advance_amount ? 'A separate advance payment request follows this message.' : ''}</p>
        <p style="margin-top:28px;">Warm regards,<br/><strong>The Team</strong></p>`,
    }),
  }),

  payment_received: (p) => ({
    subject: `Payment Received — Thank You — ${p.ref_number}`,
    html: layout({
      heading: COMPANY_NAME,
      subheading: 'Payment Receipt',
      accent: BRAND.green,
      body: `
        <p style="font-size:16px;">Dear ${esc(p.client_name)},</p>
        <p>Thank you — we gratefully acknowledge receipt of your ${esc(p.payment_type.toLowerCase())} payment for project <strong style="font-family:monospace;">${esc(p.ref_number)}</strong>.</p>
        <div style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;padding:18px 20px;margin:22px 0;">
          <table style="width:100%;border-collapse:collapse;">
            ${detailRow('Amount Received', esc(p.amount))}
            ${detailRow('Towards', esc(p.payment_type))}
            ${p.balance ? detailRow('Balance Outstanding', esc(p.balance)) : ''}
          </table>
        </div>
        <p style="font-size:14px;color:${BRAND.muted};">This email serves as your acknowledgement of payment. Please retain it for your records.</p>
        <p style="margin-top:28px;">Warm regards,<br/><strong>The Team</strong></p>`,
    }),
  }),

  mobilisation_acknowledged: (p) => ({
    subject: `Mobilisation Confirmed — Thank You — ${p.ref_number}`,
    html: layout({
      heading: COMPANY_NAME,
      subheading: 'Mobilisation Confirmed',
      accent: BRAND.green,
      body: `
        <p style="font-size:16px;">Dear ${esc(p.client_name)},</p>
        <p>Thank you for confirming the mobilisation for project <strong style="font-family:monospace;">${esc(p.ref_number)}</strong>. Our team is scheduled and will arrive as planned.</p>
        <div style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;padding:18px 20px;margin:22px 0;">
          <table style="width:100%;border-collapse:collapse;">
            ${detailRow('Date', esc(p.date))}
            ${detailRow('Location', esc(p.city))}
          </table>
        </div>
        <p style="font-size:14px;color:${BRAND.muted};">Please ensure site access is available on the scheduled date. We look forward to working with you.</p>
        <p style="margin-top:28px;">Warm regards,<br/><strong>The Team</strong></p>`,
    }),
  }),

  job_completed: (p) => ({
    subject: `Project Completed — Thank You — ${p.ref_number}`,
    html: layout({
      heading: COMPANY_NAME,
      subheading: 'Project Completed',
      accent: BRAND.green,
      body: `
        <p style="font-size:16px;">Dear ${esc(p.client_name)},</p>
        <p>We are pleased to inform you that your geotechnical investigation for project <strong style="font-family:monospace;">${esc(p.ref_number)}</strong> is now complete and the report has been delivered.</p>
        <p>It has been a pleasure working with you. Thank you for trusting <strong>${esc(COMPANY_NAME)}</strong> with your project — we would be glad to assist you again in the future.</p>
        <p style="margin-top:28px;">Warm regards,<br/><strong>The Team</strong></p>`,
    }),
  }),

  weekly_summary: (p) => {
    const statusRows = Object.entries(p.status_counts)
      .map(([s, c]) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #E2E8F0;">${esc(s)}</td><td style="padding:6px 12px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:600;">${esc(c)}</td></tr>`)
      .join('');
    const row = (label: string, value: string | number, danger = false) =>
      `<tr><td style="padding:6px 12px;border-bottom:1px solid #E2E8F0;${danger ? `color:${BRAND.red};` : ''}">${esc(label)}</td><td style="padding:6px 12px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:600;${danger ? `color:${BRAND.red};` : ''}">${esc(value)}</td></tr>`;
    return {
      subject: `Weekly Pipeline Summary — ${p.week_ending} | QMS`,
      html: layout({
        heading: 'Weekly Pipeline Summary',
        subheading: `Week ending ${p.week_ending}`,
        body: `
          <h3 style="color:${BRAND.navy};margin:0 0 12px;">This Week</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            ${row('New Enquiries', p.new_enquiries)}
            ${row('Quotations Sent', p.quotations_sent)}
            ${row('Revenue Collected', p.revenue)}
          </table>
          <h3 style="color:${BRAND.navy};margin:0 0 12px;">Pipeline Snapshot</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">${statusRows}</table>
          <h3 style="color:${BRAND.navy};margin:0 0 12px;">Action Items</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            ${row('Overdue Follow-ups', p.overdue_follow_ups, p.overdue_follow_ups > 0)}
            ${row('Pending Payments', p.pending_payments, p.pending_payments > 0)}
          </table>`,
      }),
    };
  },
};

export function renderEmail<K extends TemplateKey>(template: K, params: TemplateParams[K]): RenderedEmail {
  const fn = TEMPLATES[template] as (p: TemplateParams[K]) => RenderedEmail;
  if (!fn) throw new Error(`Unknown email template: ${template}`);
  return fn(params);
}

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
