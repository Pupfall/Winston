/**
 * Unicode/Homograph Safety Filter
 * Detects deceptive or risky domain labels
 */

import punycode from 'punycode/';

// Zero-width and invisible characters to reject
const INVISIBLE_CODEPOINTS = [
  0x200b, // ZERO WIDTH SPACE
  0x200c, // ZERO WIDTH NON-JOINER
  0x200d, // ZERO WIDTH JOINER
  0x2060, // WORD JOINER
  0xfeff, // ZERO WIDTH NO-BREAK SPACE (BOM)
];

/**
 * Check if a label contains only ASCII LDH (Letters-Digits-Hyphen)
 * Valid: a-z, 0-9, hyphen
 * Length: 1-63 characters
 * No leading/trailing hyphen
 * Not all-numeric single label
 */
export function isAsciiLdh(label: string): boolean {
  if (!label || label.length < 1 || label.length > 63) {
    return false;
  }

  // Check for leading or trailing hyphen
  if (label.startsWith('-') || label.endsWith('-')) {
    return false;
  }

  // Check if all characters are ASCII LDH
  const asciiLdhRegex = /^[a-z0-9-]+$/;
  if (!asciiLdhRegex.test(label)) {
    return false;
  }

  // Reject all-numeric labels (edge case)
  const allNumeric = /^[0-9]+$/;
  if (allNumeric.test(label)) {
    return false;
  }

  return true;
}

/**
 * Check if string contains invisible characters
 */
export function hasInvisibleChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const codePoint = s.codePointAt(i);
    if (codePoint && INVISIBLE_CODEPOINTS.includes(codePoint)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if label has mixed Unicode scripts (basic heuristic)
 * Uses Unicode script property to detect mixing
 */
export function hasMixedScripts(s: string): boolean {
  // Skip if ASCII-only
  if (/^[\x00-\x7F]+$/.test(s)) {
    return false;
  }

  // Detect scripts using Unicode property escapes
  const scripts = {
    latin: /\p{Script=Latin}/u,
    cyrillic: /\p{Script=Cyrillic}/u,
    greek: /\p{Script=Greek}/u,
    arabic: /\p{Script=Arabic}/u,
    hebrew: /\p{Script=Hebrew}/u,
    han: /\p{Script=Han}/u,
    hiragana: /\p{Script=Hiragana}/u,
    katakana: /\p{Script=Katakana}/u,
  };

  let scriptCount = 0;
  for (const [_name, regex] of Object.entries(scripts)) {
    if (regex.test(s)) {
      scriptCount++;
      if (scriptCount > 1) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if label is punycode encoded (starts with xn--)
 */
export function isPunycode(s: string): boolean {
  return s.startsWith('xn--');
}

/**
 * Validate punycode can be decoded
 */
function isValidPunycode(label: string): boolean {
  if (!isPunycode(label)) {
    return false;
  }

  try {
    // Try to decode - will throw if invalid
    punycode.decode(label.slice(4)); // Remove "xn--" prefix
    return true;
  } catch {
    return false;
  }
}

export interface LabelSafetyOptions {
  allowUnicode: boolean;
}

export interface LabelSafetyResult {
  safe: boolean;
  reasons: string[];
}

/**
 * Analyze label safety based on homograph and Unicode rules
 *
 * Logic:
 * 1. If ASCII LDH → safe
 * 2. If !allowUnicode → unsafe (NonASCIINotAllowed)
 * 3. If allowUnicode but not punycode → unsafe (UnicodeMustUsePunycode)
 * 4. Reject invisible chars → unsafe (HasInvisible)
 * 5. Reject mixed scripts → unsafe (MixedScripts)
 * 6. Validate length, hyphens, punycode validity
 */
export function analyzeLabelSafety(
  label: string,
  opts: LabelSafetyOptions
): LabelSafetyResult {
  const reasons: string[] = [];

  // Normalize: lowercase and trim
  const normalized = label.toLowerCase().trim();

  // Basic length check
  if (normalized.length < 1 || normalized.length > 63) {
    reasons.push('InvalidLength');
    return { safe: false, reasons };
  }

  // Check for leading/trailing hyphen
  if (normalized.startsWith('-') || normalized.endsWith('-')) {
    reasons.push('InvalidHyphenPosition');
    return { safe: false, reasons };
  }

  // Fast path: ASCII LDH is always safe
  if (isAsciiLdh(normalized)) {
    return { safe: true, reasons: [] };
  }

  // Non-ASCII path: check if Unicode is allowed
  if (!opts.allowUnicode) {
    reasons.push('NonASCIINotAllowed');
    return { safe: false, reasons };
  }

  // Unicode is allowed, but must be in punycode form
  if (!isPunycode(normalized)) {
    reasons.push('UnicodeMustUsePunycode');
    return { safe: false, reasons };
  }

  // Validate punycode can be decoded
  if (!isValidPunycode(normalized)) {
    reasons.push('InvalidPunycode');
    return { safe: false, reasons };
  }

  // Decode punycode to check the actual Unicode content
  let decoded: string;
  try {
    decoded = punycode.decode(normalized.slice(4));
  } catch {
    reasons.push('PunycodeDcodeFailed');
    return { safe: false, reasons };
  }

  // Check for invisible characters in decoded form
  if (hasInvisibleChars(decoded)) {
    reasons.push('HasInvisible');
  }

  // Check for mixed scripts in decoded form
  if (hasMixedScripts(decoded)) {
    reasons.push('MixedScripts');
  }

  // If any issues found, mark as unsafe
  if (reasons.length > 0) {
    return { safe: false, reasons };
  }

  // All checks passed
  return { safe: true, reasons: [] };
}
