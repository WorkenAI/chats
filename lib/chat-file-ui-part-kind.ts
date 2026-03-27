import type { FileUIPart } from "ai";

/**
 * How we treat a user `FileUIPart` in chat (model pipeline + UI).
 * Add new categories here and extend matchers below — avoid one `isFooPart` per format.
 */
export type ChatFileUIPartKind =
  | "image"
  | "spreadsheet"
  | "text"
  | "binary";

/** Declarative: exact MIME → kind (checked after image/ prefix). */
const MIME_EXACT_KIND: ReadonlyArray<{
  kind: ChatFileUIPartKind;
  types: readonly string[];
}> = [
  {
    kind: "spreadsheet",
    types: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
    ],
  },
];

const MIME_EXACT = new Map<string, ChatFileUIPartKind>();
for (const { kind, types } of MIME_EXACT_KIND) {
  for (const t of types) {
    MIME_EXACT.set(t, kind);
  }
}

/** Declarative: filename (basename) pattern → kind. Order: first match wins. */
const NAME_PATTERN_KIND: ReadonlyArray<{
  kind: ChatFileUIPartKind;
  pattern: RegExp;
}> = [{ kind: "spreadsheet", pattern: /\.(xlsx|xls|xlsm)$/i }];

const TEXT_APPLICATION_MEDIA_TYPES = new Set([
  "application/csv",
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/x-javascript",
  "application/ecmascript",
  "application/typescript",
  "application/x-typescript",
  "application/x-yaml",
  "application/yaml",
  "application/toml",
  "application/graphql",
  "application/sql",
  "application/x-sh",
  "application/x-shellscript",
]);

const TEXT_FILE_EXT =
  /\.(?:md|markdown|mdx|txt|text|log|json|jsonl|ndjson|xml|yaml|yml|toml|csv|ts|tsx|mts|cts|js|jsx|mjs|cjs|css|scss|sass|less|html|htm|svg|vue|svelte|astro|sql|graphql|gql|sh|bash|zsh|fish|ps1|py|rb|go|rs|java|kt|kts|swift|c|h|cpp|hpp|cc|cxx|cs|php|pl|pm|r|lua|ex|exs|elm|clj|cljs|edn|ini|cfg|conf|properties|gradle)$/i;

function isTextMediaType(mediaType: string): boolean {
  const m = mediaType.trim().toLowerCase();
  if (m.startsWith("text/")) {
    return true;
  }
  return TEXT_APPLICATION_MEDIA_TYPES.has(m);
}

function hasTextFilename(filename: string | undefined): boolean {
  if (!filename?.trim()) {
    return false;
  }
  const base = filename.trim().split(/[/\\]/).pop() ?? "";
  if (
    /^(?:README|LICENSE|CONTRIBUTING|CHANGELOG|CODEOWNERS|Dockerfile|Makefile|Gemfile|Rakefile)$/i.test(
      base,
    )
  ) {
    return true;
  }
  return TEXT_FILE_EXT.test(base);
}

function kindFromMimeExact(mediaType: string | undefined): ChatFileUIPartKind | null {
  if (!mediaType?.trim()) {
    return null;
  }
  return MIME_EXACT.get(mediaType.trim()) ?? null;
}

function kindFromFilename(filename: string | undefined): ChatFileUIPartKind | null {
  if (!filename?.trim()) {
    return null;
  }
  const base = filename.trim().split(/[/\\]/).pop() ?? "";
  for (const { kind, pattern } of NAME_PATTERN_KIND) {
    if (pattern.test(base)) {
      return kind;
    }
  }
  return null;
}

/**
 * Single entry point: classify a `FileUIPart` for chat/model behavior.
 * Precedence: image (prefix) → MIME/name registry → text heuristics → binary.
 */
export function getChatFileUIPartKind(part: FileUIPart): ChatFileUIPartKind {
  const mt = part.mediaType?.trim() ?? "";
  if (mt.startsWith("image/")) {
    return "image";
  }

  const fromMime = kindFromMimeExact(part.mediaType);
  if (fromMime != null) {
    return fromMime;
  }

  const fromName = kindFromFilename(part.filename);
  if (fromName != null) {
    return fromName;
  }

  if (mt && isTextMediaType(mt)) {
    return "text";
  }
  if (hasTextFilename(part.filename)) {
    return "text";
  }

  return "binary";
}
