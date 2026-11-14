export function validateRequired(value: string, label: string): string | null {
  return value.trim() ? null : `${label} is required.`;
}

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Email is required.";
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(trimmed) ? null : "Enter a valid email address.";
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

export function validatePhone(value: string): string | null {
  const normalized = normalizePhone(value);
  const digitCount = normalized.replace(/\D/g, "").length;

  if (!normalized) {
    return "Phone number is required.";
  }

  if (digitCount < 7 || digitCount > 15) {
    return "Enter a valid phone number.";
  }

  return null;
}

export function validatePassword(value: string): string | null {
  if (!value.trim()) {
    return "Password is required.";
  }

  return value.length >= 8 ? null : "Password must be at least 8 characters.";
}

export function validateFullName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Full name is required.";
  }

  return trimmed.length >= 2 ? null : "Enter your full name.";
}