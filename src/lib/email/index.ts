import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Email delivery.
 *   EMAIL_PROVIDER=resend  + RESEND_API_KEY + EMAIL_FROM → sent via Resend's HTTP API
 *   EMAIL_PROVIDER=outbox  → written to .data/outbox/*.json (development only; nothing is sent)
 *   unset                  → disabled; the app shows invitation links to share instead
 */
export type Email = { to: string; subject: string; text: string; html: string };
export type EmailMode = "resend" | "outbox" | "disabled";

export function emailMode(): EmailMode {
  const p = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  if (p === "resend" && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return "resend";
  if (p === "outbox") return "outbox";
  return "disabled";
}

/** Returns true if the message was handed to a delivery mechanism. */
export async function sendEmail(email: Email): Promise<boolean> {
  const mode = emailMode();
  if (mode === "disabled") return false;
  if (mode === "outbox") {
    const dir = path.resolve(process.env.EMAIL_OUTBOX_DIR || ".data/outbox");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}.json`), JSON.stringify(email, null, 2));
    return true;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
  });
  if (!res.ok) {
    console.error("[habitat:email] delivery failed", res.status);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Templates (plain, accessible, no tracking)
// ---------------------------------------------------------------------------
export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, body: string) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d221f">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="font-weight:600;color:#42634f;margin:0 0 20px">Habitat</p>
<div style="background:#fff;border:1px solid #e3dfd6;border-radius:10px;padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h1>${body}</div>
<p style="font-size:12px;color:#5f6761;margin-top:16px">You’re receiving this because you use Habitat. Manage email in Settings.</p>
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:20px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#42634f;color:#fff;text-decoration:none;padding:10px 16px;border-radius:7px;font-weight:600">${escapeHtml(label)}</a></p>`;

export function invitationEmail(a: { to: string; household: string; inviter: string; url: string; days: number }): Email {
  const subject = `${a.inviter} invited you to ${a.household} on Habitat`;
  const text = `${a.inviter} invited you to share “${a.household}” on Habitat — the household’s appliances, maintenance, documents and expenses.\n\nAccept the invitation (expires in ${a.days} days):\n${a.url}\n\nSign in or create an account with this email address (${a.to}) to accept. If you weren’t expecting this, you can ignore it.`;
  const html = layout(
    `Join ${a.household}`,
    `<p style="margin:0 0 8px;line-height:1.5">${escapeHtml(a.inviter)} invited you to share <strong>${escapeHtml(a.household)}</strong> on Habitat — appliances, maintenance, documents and expenses in one place.</p>
<p style="margin:0;line-height:1.5;color:#5f6761;font-size:14px">Use this email address (${escapeHtml(a.to)}) to accept. The link expires in ${a.days} days.</p>${button(a.url, "Accept invitation")}
<p style="font-size:12px;color:#5f6761;margin:16px 0 0">If you weren’t expecting this, you can ignore it.</p>`,
  );
  return { to: a.to, subject, text, html };
}

export function reminderDigestEmail(a: { to: string; name: string; household: string; appUrl: string; items: { title: string; body: string | null; link: string | null }[] }): Email {
  const n = a.items.length;
  const subject = `${n} reminder${n === 1 ? "" : "s"} for ${a.household}`;
  const lines = a.items.map((i) => `• ${i.title}${i.body ? ` — ${i.body}` : ""}${i.link ? `\n  ${a.appUrl}${i.link}` : ""}`).join("\n");
  const text = `Hi ${a.name || "there"},\n\nHere’s what needs attention in ${a.household}:\n\n${lines}\n\nOpen Habitat: ${a.appUrl}/overview`;
  const html = layout(
    subject,
    `<ul style="padding-left:18px;margin:0;line-height:1.5">${a.items
      .map((i) => `<li style="margin-bottom:8px">${i.link ? `<a href="${escapeHtml(a.appUrl + i.link)}" style="color:#1d221f;font-weight:600">${escapeHtml(i.title)}</a>` : `<strong>${escapeHtml(i.title)}</strong>`}${i.body ? `<br><span style="color:#5f6761;font-size:14px">${escapeHtml(i.body)}</span>` : ""}</li>`)
      .join("")}</ul>${button(`${a.appUrl}/overview`, "Open Habitat")}`,
  );
  return { to: a.to, subject, text, html };
}
