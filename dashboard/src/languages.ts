/**
 * The language tokei reports for each extension the survival collector scans,
 * so the blame-based year-shaded view of "Lines by language" lines up with the
 * tokei-based one. Mapping extensions is an approximation — tokei classifies
 * whole files, so names can only match where the extension is unambiguous.
 */
const languageByExtension: Record<string, string> = {
  ".astro": "Astro",
  ".c": "C",
  ".cjs": "JavaScript",
  ".cpp": "C++",
  ".cs": "C#",
  ".css": "CSS",
  ".cts": "TypeScript",
  ".go": "Go",
  ".h": "C Header",
  ".hpp": "C++ Header",
  ".html": "HTML",
  ".java": "Java",
  ".js": "JavaScript",
  ".jsx": "JSX",
  ".kt": "Kotlin",
  ".less": "LESS",
  ".md": "Markdown",
  ".mdx": "Markdown",
  ".mjs": "JavaScript",
  ".mts": "TypeScript",
  ".php": "PHP",
  ".prisma": "Prisma",
  ".py": "Python",
  ".rb": "Ruby",
  ".rs": "Rust",
  ".sass": "Sass",
  ".scss": "Sass",
  ".sh": "Shell",
  ".sql": "SQL",
  ".svelte": "Svelte",
  ".swift": "Swift",
  ".ts": "TypeScript",
  ".tsx": "TSX",
  ".vue": "Vue",
  ".yaml": "YAML",
  ".yml": "YAML",
};

/** Unknown extensions show up as themselves rather than disappearing. */
export const languageOfExtension = (extension: string): string =>
  languageByExtension[extension] ?? extension;
