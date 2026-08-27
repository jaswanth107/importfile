export function normalizeName(raw: string): { value: string; warning?: string } {
  const original = raw ?? "";
  let value = original.trim().replace(/\s+/g, " ");
  const warning = value !== original.trim() ? "Whitespace normalized." : undefined;
  return { value, warning };
}

export function isNameValid(name: string): boolean {
  if (!name) return false;
  if (name.length > 100) return false;
  // reject punctuation-only (must contain at least one letter, incl. unicode letters)
  if (!/[\p{L}]/u.test(name)) return false;
  return true;
}

export function normalizeEmail(raw: string): { value: string; warning?: string } {
  const original = raw ?? "";
  const trimmed = original.trim();
  const value = trimmed.toLowerCase();
  const warning = value !== trimmed ? "Email capitalization normalized." : undefined;
  return { value, warning };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isEmailValid(email: string): boolean {
  if (!email) return false;
  return EMAIL_RE.test(email);
}

export function normalizePhone(raw: string): { value: string | null; warning?: string; changed: boolean } {
  const original = (raw ?? "").trim();
  let digits = original.replace(/[^\d+]/g, "");
  let normalized: string | null = null;

  if (/^\+91\d{10}$/.test(digits)) {
    normalized = digits;
  } else if (/^91\d{10}$/.test(digits)) {
    normalized = "+" + digits;
  } else if (/^\d{10}$/.test(digits)) {
    normalized = "+91" + digits;
  } else if (/^0\d{10}$/.test(digits)) {
    normalized = "+91" + digits.slice(1);
  } else {
    normalized = null;
  }

  // reject numbers where the 10-digit core doesn't start with a valid Indian mobile prefix (6-9)
  if (normalized) {
    const core = normalized.slice(-10);
    if (!/^[6-9]\d{9}$/.test(core)) {
      normalized = null;
    }
  }

  const changed = normalized !== null && normalized !== original;
  return {
    value: normalized,
    warning: changed ? "Phone formatting normalized." : undefined,
    changed,
  };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function normalizeJoiningDate(raw: string): { value: string | null; reason?: string } {
  const original = (raw ?? "").trim();
  if (!original) return { value: null, reason: "Missing joining date." };

  let y: number, m: number, d: number;
  const isoMatch = DATE_RE.exec(original);
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(original);
  const dashMatch = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(original);

  if (isoMatch) {
    y = Number(isoMatch[1]);
    m = Number(isoMatch[2]);
    d = Number(isoMatch[3]);
  } else if (slashMatch || dashMatch) {
    // Ambiguous DD/MM/YYYY vs MM/DD/YYYY - only accept if unambiguous (day > 12)
    const match = slashMatch || dashMatch!;
    const a = Number(match[1]);
    const b = Number(match[2]);
    y = Number(match[3]);
    if (a > 12 && b <= 12) {
      d = a; m = b;
    } else if (b > 12 && a <= 12) {
      d = b; m = a;
    } else {
      return { value: null, reason: "Ambiguous joining date." };
    }
  } else {
    return { value: null, reason: "Invalid joining date format." };
  }

  if (m < 1 || m > 12) return { value: null, reason: "Invalid joining date." };
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d < 1 || d > daysInMonth) return { value: null, reason: "Invalid joining date." };

  const iso = `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  return { value: iso };
}
