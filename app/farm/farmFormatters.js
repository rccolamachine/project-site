export function countLabel(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}

export function formatLogClock(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}

import { formatMoney } from "../../lib/farm/engine";

export function formatScientificNumber(value, significantDigits = 2) {
  const num = Number(value);
  if (Number.isNaN(num)) return "0";
  if (!Number.isFinite(num)) return num < 0 ? "-9.9E999" : "9.9E999";
  if (num === 0) return "0";
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const exp = Math.floor(Math.log10(abs));
  const mantissa = abs / 10 ** exp;
  const decimals = Math.max(0, Math.floor(significantDigits) - 1);
  const compact = mantissa.toFixed(decimals).replace(/\.?0+$/, "");
  return `${sign}${compact}E${exp}`;
}

export function formatMoneyAdaptive(value, maxChars = 12, significantDigits = 2) {
  const regular = formatMoney(value);
  if (regular.length <= maxChars) return regular;
  return `$${formatScientificNumber(value, significantDigits)}`;
}
