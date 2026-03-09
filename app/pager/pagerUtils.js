export const MAX_PAGER_TEXT_LENGTH = 80;

export function clampPagerText(value) {
  return String(value || "").slice(0, MAX_PAGER_TEXT_LENGTH);
}

export function validatePagerText(value) {
  const text = String(value || "").trim();
  if (!text) return "Text is required.";
  if (text.length > MAX_PAGER_TEXT_LENGTH) {
    return `Text must be ${MAX_PAGER_TEXT_LENGTH} characters or fewer.`;
  }
  return "";
}

export function promptForPagerCredentials() {
  const usernameRaw = window.prompt("Username:");
  if (usernameRaw === null) return { cancelled: true };

  const passwordRaw = window.prompt("Password:");
  if (passwordRaw === null) return { cancelled: true };

  const username = String(usernameRaw || "").trim();
  const password = String(passwordRaw || "").trim();

  if (!username || !password) {
    return { cancelled: false, error: "Username and password are required." };
  }

  return { cancelled: false, username, password };
}
