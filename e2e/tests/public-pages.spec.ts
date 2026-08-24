import { test, expect } from "@playwright/test";

// Billa's public marketing/auth pages don't implement dark mode (data-theme is only
// applied inside the authenticated AppLayout shell), so these snapshots are light-mode
// only - that's a real gap worth its own follow-up, not something this suite hides.

const pages: { path: string; name: string; heading: RegExp }[] = [
  { path: "/", name: "landing", heading: /stop building invoices by hand/i },
  { path: "/login", name: "login", heading: /log in/i },
  { path: "/register", name: "register", heading: /create your account/i },
  { path: "/privacy", name: "privacy-policy", heading: /privacy policy/i },
  { path: "/terms", name: "terms-of-service", heading: /terms of service/i },
  { path: "/help", name: "help-center", heading: /help center/i },
  { path: "/contact", name: "contact", heading: /contact us/i },
];

for (const { path, name, heading } of pages) {
  test(`${name} page matches its visual baseline`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
