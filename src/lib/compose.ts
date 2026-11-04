// Deterministic sentence composition. Pure function: same data in, same sentence out.
// It knows nothing about weather or footwear; order, roles and glue words all come from the database.

export type SentencePart = { variableKey: string; position: number; role: "lead" | "item" };
export type SentenceSettings = { connector: string; listSeparator: string; lastSeparator: string; terminator: string };

/** fragments: variable key -> fragment of the selected option (missing = not answered). */
export function composeSentence(parts: SentencePart[], settings: SentenceSettings, fragments: Record<string, string>): string {
  const ordered = [...parts].sort((a, b) => a.position - b.position);
  const pick = (role: SentencePart["role"]) =>
    ordered.filter((p) => p.role === role && fragments[p.variableKey]).map((p) => fragments[p.variableKey].trim());

  const leads = pick("lead");
  if (leads.length === 0) return ""; // nothing to open the sentence with yet
  const items = pick("item");

  let sentence = leads.join(settings.listSeparator);
  if (items.length > 0) sentence += settings.connector + joinList(items, settings.listSeparator, settings.lastSeparator);
  return capitalise(sentence) + settings.terminator;
}

function joinList(items: string[], sep: string, last: string): string {
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(sep) + last + items[items.length - 1];
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
