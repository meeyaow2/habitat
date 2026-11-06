import { describe, expect, it } from "vitest";
import { escapeHtml, invitationEmail, reminderDigestEmail } from "@/lib/email";

describe("email templates", () => {
  it("escapes user-provided text in HTML", () => {
    const e = invitationEmail({ to: "a@b.co", household: `<script>x</script>`, inviter: `Tom "T" & co`, url: "https://h.test/invite/abc", days: 7 });
    expect(e.html).not.toContain("<script>x");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("Tom &quot;T&quot; &amp; co");
    expect(e.text).toContain("https://h.test/invite/abc");
    expect(escapeHtml(`'`)).toBe("&#39;");
  });
  it("builds a digest with absolute links", () => {
    const e = reminderDigestEmail({ to: "a@b.co", name: "Ann", household: "Home", appUrl: "https://h.test", items: [{ title: "Overdue: Filter", body: "was due 1 Nov", link: "/maintenance?task=1" }] });
    expect(e.subject).toBe("1 reminder for Home");
    expect(e.html).toContain('href="https://h.test/maintenance?task=1"');
  });
});
