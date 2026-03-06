function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

export const EMPTY_GUESTBOOK_LEAD = Object.freeze({
  name: "",
  email: "",
  linkedinUrl: "",
  message: "",
  emailSelf: false,
});

export function isValidGuestbookEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeTrim(email));
}

export function appendGuestbookLead(formData, lead) {
  const next = formData ?? new FormData();
  next.append("name", safeTrim(lead?.name));
  next.append("email", safeTrim(lead?.email));
  next.append("linkedinUrl", safeTrim(lead?.linkedinUrl));
  next.append("message", safeTrim(lead?.message));
  next.append("emailSelf", lead?.emailSelf ? "1" : "0");
  return next;
}

export function getGuestbookDeleteCookieName(id) {
  return `gb_owner_${safeTrim(id)}`;
}

export function hasGuestbookDeleteCookie(id) {
  if (typeof document === "undefined") return false;
  const cookieName = getGuestbookDeleteCookieName(id);
  return document.cookie
    .split("; ")
    .some((cookie) => cookie.startsWith(`${cookieName}=`));
}
