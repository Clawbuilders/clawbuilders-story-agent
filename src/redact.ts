// Secret-shaped-string scrubber, applied to every piece of text before it
// reaches the LLM or a public post. Deliberately broad: false positives just
// mean an extra [REDACTED] in a build-log post, which is harmless; a missed
// secret is not.
const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/g, // AWS access key ID
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens (ghp_/gho_/ghu_/ghs_/ghr_)
  /github_pat_[A-Za-z0-9_]{20,}/g, // GitHub fine-grained PAT
  /sk-[A-Za-z0-9]{20,}/g, // OpenAI / generic sk- style keys
  /sk_(live|test)_[A-Za-z0-9]{16,}/g, // Stripe secret keys
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /AIza[0-9A-Za-z\-_]{20,}/g, // Google API keys
  /AC[a-f0-9]{32}/g, // Twilio account SID
  /SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, // SendGrid keys
  /npm_[A-Za-z0-9]{30,}/g, // npm tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, // PEM private keys
  /\b(?:api[_-]?key|secret|token|password|passwd|access[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9\/+_=-]{8,}["']?/gi, // generic key=value
];

export function redact(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

export function looksSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => new RegExp(pattern.source, pattern.flags).test(text));
}
