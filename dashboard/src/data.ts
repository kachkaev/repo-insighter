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

type DependenciesRow = {
  sha: string;
  date: string;
  /** Total resolved packages across all lockfiles in the tree. */
  resolved: number;
  directProd: number;
  directDev: number;
  directOptional: number;
  /** Resolved packages split by package manager (pnpm, …). */
  byPackageManager: Record<string, number>;
};

type SurvivalRow = {
  sha: string;
  date: string;
  byCohort: Record<string, number>;
  byContributor: Record<string, number>;
  byExtension: Record<string, number>;
};

type ContributorKind = "human" | "bot" | "ai";

type ContributorRow = {
  email: string;
  name: string;
  /** Optional profile URL from the config's contributor aliases. */
  url?: string;
  /** Missing in dashboard.json written before contributor kinds landed. */
  kind?: ContributorKind;
  commits: number;
  added: number;
  deleted: number;
};

export type DashboardData = {
  generatedAt: string;
  /** Optional: absent in dashboard.json written before configurable caps landed. */
  config?: {
    contributors: {
      /** How many contributors per-contributor charts keep before folding into "Other". */
      maxInCharts: number;
    };
  };
  repo: {
    name: string;
    commitCount: number;
    contributorCount: number;
    firstCommitDate?: string;
    lastCommitDate?: string;
  };
  commits: CommitRow[];
  monthly: MonthlyRow[];
  languages: LanguagesRow[];
  fileTypes: FileTypesRow[];
  directives: DirectivesRow[];
  dependencies: DependenciesRow[];
  topRules: Array<{ rule: string; count: number }>;
  survival: SurvivalRow[];
  contributors: ContributorRow[];
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
