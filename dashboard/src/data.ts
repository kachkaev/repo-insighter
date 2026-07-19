type CommitRow = {
  sha: string;
  date: string;
  author: string;
  ai: boolean;
  added: number;
  deleted: number;
};

type MonthlyRow = {
  month: string;
  commits: number;
  aiCommits: number;
  added: number;
  deleted: number;
  aiAdded: number;
};

type LanguagesRow = {
  sha: string;
  date: string;
  byLanguage: Record<string, number>;
};

type FileTypesRow = {
  sha: string;
  date: string;
  totalFiles: number;
  totalBytes: number;
};

type DirectivesRow = {
  sha: string;
  date: string;
  eslintNextLine: number;
  eslintLine: number;
  eslintBlocks: number;
  blockCoveredLines: number;
  tsIgnore: number;
  tsExpectError: number;
  tsNocheck: number;
  todos: number;
};

type SurvivalRow = {
  sha: string;
  date: string;
  byCohort: Record<string, number>;
  byAuthor: Record<string, number>;
  byExtension: Record<string, number>;
};

type AuthorRow = {
  email: string;
  name: string;
  commits: number;
  added: number;
  deleted: number;
};

export type DashboardData = {
  generatedAt: string;
  repo: {
    name: string;
    commitCount: number;
    authorCount: number;
    firstCommitDate?: string;
    lastCommitDate?: string;
  };
  commits: CommitRow[];
  monthly: MonthlyRow[];
  languages: LanguagesRow[];
  fileTypes: FileTypesRow[];
  directives: DirectivesRow[];
  topRules: Array<{ rule: string; count: number }>;
  survival: SurvivalRow[];
  authors: AuthorRow[];
  aiIdentities: Array<{ identity: string; commits: number }>;
};

/** Inlined by `repo-insighter report` so the export works from a single file. */
const inlinedData = (globalThis as { __REPO_INSIGHTER_DATA__?: DashboardData })
  .__REPO_INSIGHTER_DATA__;

export async function loadDashboardData(): Promise<DashboardData> {
  if (inlinedData) {
    return inlinedData;
  }
  const response = await fetch("./dashboard.json");
  if (!response.ok) {
    throw new Error(
      `Could not load dashboard.json (${response.status}). Run \`repo-insighter index\` first.`,
    );
  }
  return (await response.json()) as DashboardData;
}
