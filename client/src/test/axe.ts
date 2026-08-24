import { configureAxe } from "jest-axe";

export const axe = configureAxe({
  rules: {
    // jsdom doesn't paint, so color-contrast can't be evaluated reliably here.
    // Contrast is verified separately against the actual design tokens.
    "color-contrast": { enabled: false },
  },
});
