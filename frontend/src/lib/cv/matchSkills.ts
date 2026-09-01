// ════════════════════════════════════════════════════════════════════
// Foundry · Deterministic CV → skills matching
//
// Pure string matching against the closed taxonomy (20260901000001) —
// no LLM, no prompt, nothing the extracted text can influence except
// which of OUR OWN skill ids come back. Two rules keep it that way, and
// both are enforced by this function's shape rather than by convention:
//
//   * It returns skill ids, never strings built from the input text.
//   * The extracted text itself never leaves this call — the caller
//     passes it in and gets only ids back.
//
// Word-boundary matching (not naive substring) is what makes a taxonomy
// entry like "R (statistics)" safe: without a boundary check, "r" would
// match inside nearly every word in the document.
// ════════════════════════════════════════════════════════════════════

export type SkillTerm = { id: number; name: string; aliases: string[] };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `term` appears in `normalizedText` on word boundaries. */
function hasWordBoundaryMatch(normalizedText: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return false;
  const pattern = `(?<![a-z0-9])${escapeRegExp(t)}(?![a-z0-9])`;
  return new RegExp(pattern, "i").test(normalizedText);
}

/**
 * Match extracted CV text against the closed skills taxonomy. Returns
 * matched skill ids in taxonomy order — never text, never a score, never
 * anything derived from the input beyond "which fixed ids are present".
 */
export function matchSkillsInText(text: string, taxonomy: SkillTerm[]): number[] {
  const normalized = text.toLowerCase();
  const matched: number[] = [];
  for (const skill of taxonomy) {
    const terms = [skill.name, ...skill.aliases];
    if (terms.some((term) => hasWordBoundaryMatch(normalized, term))) {
      matched.push(skill.id);
    }
  }
  return matched;
}
