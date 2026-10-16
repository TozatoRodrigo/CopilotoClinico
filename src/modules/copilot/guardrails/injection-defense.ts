export interface InjectionScanResult {
  safe: boolean;
  reasons: string[];
  confidence: number;
}

const INJECTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /ignore\s+(previous|all|above|prior)\s*(instructions|rules|prompts?)/i,
    reason: 'INSTRUCTION_OVERRIDE_ATTEMPT',
  },
  {
    pattern: /forget\s+(everything|all|previous|your\s+instructions)/i,
    reason: 'INSTRUCTION_OVERRIDE_ATTEMPT',
  },
  {
    pattern: /you\s+are\s+now\s+(a|an)\s+/i,
    reason: 'ROLE_MANIPULATION_ATTEMPT',
  },
  {
    pattern: /pretend\s+(you\s+are|to\s+be)/i,
    reason: 'ROLE_MANIPULATION_ATTEMPT',
  },
  {
    pattern: /act\s+as\s+(if\s+you\s+are|a|an)\s+/i,
    reason: 'ROLE_MANIPULATION_ATTEMPT',
  },
  {
    pattern: /system\s*:/i,
    reason: 'SYSTEM_PROMPT_EXTRACTION_ATTEMPT',
  },
  {
    pattern: /reveal\s+(your|the)\s+(instructions|prompt|system)/i,
    reason: 'SYSTEM_PROMPT_EXTRACTION_ATTEMPT',
  },
  {
    pattern: /show\s+me\s+(your|the)\s+(instructions|prompt)/i,
    reason: 'SYSTEM_PROMPT_EXTRACTION_ATTEMPT',
  },
  {
    pattern: /\<\/?system\>/i,
    reason: 'XML_TAG_INJECTION',
  },
  {
    pattern: /\<\/?(instructions|prompt|guidelines)\>/i,
    reason: 'XML_TAG_INJECTION',
  },
  {
    pattern: /new\s+instructions?\s*:/i,
    reason: 'INSTRUCTION_OVERRIDE_ATTEMPT',
  },
  {
    pattern: /disregard\s+(previous|all|above|prior)/i,
    reason: 'INSTRUCTION_OVERRIDE_ATTEMPT',
  },
  // Português. Só formas imperativas e alvos que não são vocabulário clínico:
  // "orientações" fica de fora ("ignorou as orientações de alta" é relato).
  {
    pattern:
      /\b(ignore|desconsidere|esque[çc]a)\s+(todas\s+as\s+|todos\s+os\s+|as\s+|os\s+|suas\s+|seus\s+|tudo\s+)?(instru[çc][õo]es|regras|comandos|prompts?)\b/i,
    reason: 'INSTRUCTION_OVERRIDE_ATTEMPT',
  },
  {
    pattern: /\bnovas\s+instru[çc][õo]es\s*:/i,
    reason: 'INSTRUCTION_OVERRIDE_ATTEMPT',
  },
  {
    // Sem \b depois de "é": em regex sem a flag u, "é" não conta como letra.
    pattern: /\b(voc[êe]\s+agora\s+[ée]\s+(um|uma|o|a)\s|finja\s+(ser|que\s+[ée]))/i,
    reason: 'ROLE_MANIPULATION_ATTEMPT',
  },
  {
    pattern:
      /\b(revele|mostre|exiba|repita|imprima)\s+(o\s+|seu\s+|suas\s+|as\s+)?(prompt|instru[çc][õo]es\s+(do\s+sistema|internas|iniciais))\b/i,
    reason: 'SYSTEM_PROMPT_EXTRACTION_ATTEMPT',
  },
];

export function scanForInjection(text: string): InjectionScanResult {
  const reasons: string[] = [];

  for (const { pattern, reason } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push(reason);
    }
  }

  const uniqueReasons = [...new Set(reasons)];

  return {
    safe: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    confidence: uniqueReasons.length === 0 ? 1 : Math.min(uniqueReasons.length * 0.25, 1),
  };
}
