// Keep small, positive daily flows visible instead of rounding them to zero.
export function marketQuantity(value, locale = 'en') {
  const n = value ?? 0;
  return new Intl.NumberFormat(locale, n !== 0 && Math.abs(n) < 1
    ? {maximumSignificantDigits: 3}
    : {maximumFractionDigits: 1}).format(n);
}
