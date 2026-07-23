import { useState } from "react";

import { BarList } from "./components/bar-list.tsx";
import { DivergingBars } from "./components/diverging-bars.tsx";
import { DataTable, Section, StatTile } from "./components/primitives.tsx";
import {
  type TimePoint,
  TimeSeriesChart,
} from "./components/time-stack-chart.tsx";
import type { DashboardData } from "./data.ts";
import {
  formatBytes,
  formatCount,
  formatDate,
  formatPercent,
} from "./format.ts";
import { languageOfExtension } from "./languages.ts";

const categoricalColors = Array.from(
  { length: 20 },
  (_, index) => `var(--series-${index + 1})`,
);
const otherColor = "var(--text-muted)";

/**
 * How many age bands the survival charts distinguish before folding the oldest
 * years together. The actual count is the repo's age in years capped at this,
 * kept constant across every survival chart so a given year reads the same
 * shade everywhere. (Intended to become a config option.)
 */
const maxYearShades = 10;

/** How far the oldest band fades toward the surface; newest stays full color. */
const maxYearFade = 70;

/**
 * A per-year lightness band of a category's base color: the newest year keeps
 * the full color, older years mix progressively toward the surface so they
 * recede. Theme-aware — "paler" means closer to the background in either theme.
 */
function yearBandColor(
  baseColor: string,
  ageFromNewest: number,
  shadeCount: number,
): string {
  if (shadeCount <= 1 || ageFromNewest <= 0) {
    return baseColor;
  }
  const fade = Math.round((ageFromNewest / (shadeCount - 1)) * maxYearFade);
  return `color-mix(in oklab, ${baseColor} ${100 - fade}%, var(--surface-1))`;
}

type YearScale = {
  /** Age buckets, oldest first; the oldest may be a folded `≤YYYY` label. */
  buckets: string[];
  /** Maps a cohort year to its bucket (folding years past the window). */
  bucketOf: (year: string) => string;
  /** The shade of `baseColor` for a bucket — full for newest, palest for oldest. */
  colorOf: (baseColor: string, bucket: string) => string;
};

/**
 * Builds a repo-wide age scale from the years present in the survival data.
 * The number of shades stays constant across charts so colors stay comparable;
 * years older than the window fold into a single `≤YYYY` bucket.
 */
function makeYearScale(years: Iterable<string>): YearScale {
  const sorted = [...new Set(years)].filter((year) => /^\d{4}$/.test(year));
  sorted.sort();

  let buckets: string[];
  let foldBelow: number | undefined;
  let foldLabel: string | undefined;
  if (sorted.length <= maxYearShades) {
    buckets = sorted;
  } else {
    const keptNewest = sorted.slice(-(maxYearShades - 1));
    const oldestKept = Number(keptNewest[0]);
    foldBelow = oldestKept;
    foldLabel = `≤${oldestKept - 1}`;
    buckets = [foldLabel, ...keptNewest];
  }

  const shadeCount = Math.max(1, buckets.length);
  const bucketOf = (year: string) =>
    foldLabel !== undefined && Number(year) < (foldBelow ?? 0)
      ? foldLabel
      : year;
  const colorOf = (baseColor: string, bucket: string) => {
    const index = buckets.indexOf(bucket);
    const ageFromNewest =
      index === -1 ? shadeCount - 1 : shadeCount - 1 - index;
    return yearBandColor(baseColor, ageFromNewest, shadeCount);
  };

  return { buckets, bucketOf, colorOf };
}

type StackedChart = {
  points: TimePoint[];
  seriesKeys: string[];
  colors: string[];
  legendItems?: Array<{ label: string; color: string }>;
  tooltipGroups?: Array<{ label: string; color: string; keys: string[] }>;
  separateGroups?: boolean;
};

/** Separates a group (contributor, language) from its year in a stack key. */
const yearBandSeparator = "";

/** Sum of a group's living lines across all its year bands. */
function sumYears(byYear: Record<string, number>): number {
  return Object.values(byYear).reduce((total, lines) => total + lines, 0);
}

/**
 * Shapes a survival cross-tab into year-banded stacks: each group (contributor,
 * language, …) is a contiguous run of sub-series (oldest→newest), colored as
 * lightness bands of the group's base color. Top groups are kept; the rest fold
 * into "Other". The legend and tooltip collapse the bands back to one row each.
 */
function shapeYearBands(
  rows: ReadonlyArray<{
    date: string;
    byGroupYear: Record<string, Record<string, number>>;
  }>,
  maxSeries: number,
  yearScale: YearScale,
  /** Base color per kept group given its rank; defaults to the palette order. */
  baseColorOf: (label: string, rank: number) => string = (_, rank) =>
    categoricalColors[rank % categoricalColors.length] ?? otherColor,
): StackedChart {
  const latest = rows.at(-1)?.byGroupYear ?? {};
  const ranked = Object.entries(latest)
    .toSorted(([, left], [, right]) => sumYears(right) - sumYears(left))
    .map(([name]) => name);
  const kept = ranked.slice(0, maxSeries);
  const hasOther =
    ranked.length > maxSeries ||
    rows.some((row) =>
      Object.keys(row.byGroupYear).some((name) => !kept.includes(name)),
    );
  const groups = hasOther ? [...kept, "Other"] : kept;

  const seriesKeys: string[] = [];
  const colors: string[] = [];
  const legendItems: Array<{ label: string; color: string }> = [];
  const tooltipGroups: Array<{ label: string; color: string; keys: string[] }> =
    [];
  for (const [index, name] of groups.entries()) {
    const baseColor = name === "Other" ? otherColor : baseColorOf(name, index);
    const keys: string[] = [];
    for (const bucket of yearScale.buckets) {
      const key = `${name}${yearBandSeparator}${bucket}`;
      keys.push(key);
      seriesKeys.push(key);
      colors.push(yearScale.colorOf(baseColor, bucket));
    }
    legendItems.push({ label: name, color: baseColor });
    tooltipGroups.push({ label: name, color: baseColor, keys });
  }

  const points = rows.map((row) => {
    const values: Record<string, number> = {};
    for (const [name, byYear] of Object.entries(row.byGroupYear)) {
      const group = kept.includes(name) ? name : "Other";
      for (const [year, lines] of Object.entries(byYear)) {
        const key = `${group}${yearBandSeparator}${yearScale.bucketOf(year)}`;
        values[key] = (values[key] ?? 0) + lines;
      }
    }
    return { dateMs: new Date(row.date).getTime(), values };
  });

  return {
    points,
    seriesKeys,
    colors,
    legendItems,
    tooltipGroups,
    separateGroups: true,
  };
}

/** Keeps every nth row so dense per-commit series stay light to render. */
function decimate<T>(rows: readonly T[], maxPoints: number): T[] {
  if (rows.length <= maxPoints) {
    return [...rows];
  }
  const step = rows.length / maxPoints;
  const result: T[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    const row = rows[Math.floor(index * step)];
    if (row) {
      result.push(row);
    }
  }
  const last = rows.at(-1);
  if (last && result.at(-1) !== last) {
    result.push(last);
  }
  return result;
}

/**
 * Top n keys by importance; the rest fold into "Other". Importance is the
 * latest snapshot's value by default — fine when today's series are the ones
 * worth naming. Pass `rankBy: "peak"` when a series can matter historically yet
 * be absent now (e.g. a package manager used before a migration): ranking by
 * each key's peak keeps it a named series across the whole timeline instead of
 * dropping it into "Other" the moment it disappears from the latest snapshot.
 */
function shapeStacked(
  rows: ReadonlyArray<{ date: string; values: Record<string, number> }>,
  maxSeries: number,
  rankBy: "latest" | "peak" = "latest",
): { points: TimePoint[]; seriesKeys: string[]; colors: string[] } {
  const weights: Record<string, number> = {};
  if (rankBy === "peak") {
    for (const row of rows) {
      for (const [key, value] of Object.entries(row.values)) {
        weights[key] = Math.max(weights[key] ?? 0, value);
      }
    }
  } else {
    for (const [key, value] of Object.entries(rows.at(-1)?.values ?? {})) {
      weights[key] = value;
    }
  }
  const ranked = Object.keys(weights).toSorted(
    (left, right) => (weights[right] ?? 0) - (weights[left] ?? 0),
  );
  const kept = ranked.slice(0, maxSeries);
  const hasOther =
    ranked.length > maxSeries ||
    rows.some((row) =>
      Object.keys(row.values).some((key) => !kept.includes(key)),
    );

  const points = rows.map((row) => {
    const values: Record<string, number> = {};
    let other = 0;
    for (const [key, value] of Object.entries(row.values)) {
      if (kept.includes(key)) {
        values[key] = value;
      } else {
        other += value;
      }
    }
    if (hasOther) {
      values["Other"] = other;
    }
    return { dateMs: new Date(row.date).getTime(), values };
  });

  const seriesKeys = hasOther ? [...kept, "Other"] : kept;
  const colors = seriesKeys.map((key, index) =>
    key === "Other"
      ? otherColor
      : (categoricalColors[index % categoricalColors.length] ?? otherColor),
  );
  return { points, seriesKeys, colors };
}

function YearShadeToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mb-3 flex w-fit items-center gap-2 text-xs text-(--text-secondary) select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="size-3.5 accent-(--series-1)"
      />
      Shade by year written
    </label>
  );
}

/** Falls back when serving a dashboard.json written before configurable caps. */
const defaultMaxContributorsInCharts = 10;

/** Icon + label for non-human contributor kinds; humans get no badge. */
const kindBadge: Record<"bot" | "ai", { icon: string; title: string }> = {
  bot: { icon: "🤖", title: "Bot" },
  ai: { icon: "✨", title: "AI agent" },
};

export function App({ data }: { data: DashboardData }) {
  const maxContributorsInCharts =
    data.config?.contributors.maxInCharts ?? defaultMaxContributorsInCharts;
  const humanContributors = data.contributors.filter(
    (contributor) => (contributor.kind ?? "human") === "human",
  );
  const nonHumanContributors = data.contributors.filter(
    (contributor) => contributor.kind === "bot" || contributor.kind === "ai",
  );
  const latestLanguages = data.languages.at(-1);
  const latestDirectives = data.directives.at(-1);
  const latestFileTypes = data.fileTypes.at(-1);
  const dependencies = data.dependencies;
  const latestDependencies = dependencies.at(-1);
  const [shadeContributorsByYear, setShadeContributorsByYear] = useState(false);
  const [shadeLanguagesByYear, setShadeLanguagesByYear] = useState(false);

  // Repo inception, used to anchor charts whose series start mid-history (e.g.
  // dependencies, tracked only once a lockfile exists) to the full timeline.
  const repoStartMs = data.repo.firstCommitDate
    ? new Date(data.repo.firstCommitDate).getTime()
    : undefined;

  const recentCommits = data.commits.filter(
    (commit) => new Date(commit.date).getTime() >= Date.now() - 90 * 86_400_000,
  );
  const aiShareRecent =
    recentCommits.length === 0
      ? undefined
      : recentCommits.filter((commit) => commit.ai).length /
        Math.max(1, recentCommits.length);

  const languagesChart = shapeStacked(
    data.languages.map((row) => ({
      date: row.date,
      values: row.byLanguage,
    })),
    7,
  );

  const commitsChart = {
    points: data.monthly.map((row) => ({
      dateMs: new Date(`${row.month}-15`).getTime(),
      values: {
        "AI-assisted": row.aiCommits,
        Human: row.commits - row.aiCommits,
      },
    })),
    seriesKeys: ["Human", "AI-assisted"],
    colors: ["var(--series-1)", "var(--series-5)"],
  };

  const suppressionRows = decimate(data.directives, 400);
  const suppressionsChart = {
    points: suppressionRows.map((row) => ({
      dateMs: new Date(row.date).getTime(),
      values: {
        "eslint disables":
          row.eslintNextLine + row.eslintLine + row.eslintBlocks,
        "ts directives": row.tsIgnore + row.tsExpectError + row.tsNocheck,
        "todo comments": row.todos,
      },
    })),
    seriesKeys: ["eslint disables", "ts directives", "todo comments"],
    colors: ["var(--series-6)", "var(--series-3)", "var(--series-1)"],
  };

  const dependenciesChart = shapeStacked(
    decimate(dependencies, 400).map((row) => ({
      date: row.date,
      values: row.byPackageManager,
    })),
    5,
    // A repo can switch managers over its life (npm/yarn → pnpm), so rank by
    // peak to keep each one named rather than folding the retired ones away.
    "peak",
  );

  const directDependenciesTotal = latestDependencies
    ? latestDependencies.directProd +
      latestDependencies.directDev +
      latestDependencies.directOptional
    : 0;

  // One age scale shared by every survival chart, so a given year reads the
  // same lightness band whether it's split by cohort or by contributor.
  const survivalYearScale = makeYearScale(
    data.survival.flatMap((row) =>
      Object.keys(row.byCohort).map((cohortMonth) => cohortMonth.slice(0, 4)),
    ),
  );

  // Newest year at full color, oldest palest — matching the contributor chart.
  const cohortBaseColor = "var(--series-1)";
  const survivalCohortChart =
    data.survival.length === 0
      ? undefined
      : {
          points: data.survival.map((row) => {
            const values: Record<string, number> = {};
            for (const [cohortMonth, lines] of Object.entries(row.byCohort)) {
              const bucket = survivalYearScale.bucketOf(
                cohortMonth.slice(0, 4),
              );
              values[bucket] = (values[bucket] ?? 0) + lines;
            }
            return { dateMs: new Date(row.date).getTime(), values };
          }),
          seriesKeys: survivalYearScale.buckets,
          colors: survivalYearScale.buckets.map((bucket) =>
            survivalYearScale.colorOf(cohortBaseColor, bucket),
          ),
        };

  const languagesHasYearData = data.survival.some(
    (row) => row.byExtensionYear !== undefined,
  );

  // Blame-based alternative to the tokei chart: living lines per language
  // (approximated from file extensions), shaded by the year each line was
  // written. Languages the tokei chart also shows keep its colors so toggling
  // doesn't recolor the stack; extras take palette slots past the tokei ones.
  const languagesYearChart: StackedChart | undefined = languagesHasYearData
    ? shapeYearBands(
        data.survival.map((row) => {
          const byGroupYear: Record<string, Record<string, number>> = {};
          for (const [extension, byYear] of Object.entries(
            row.byExtensionYear ?? {},
          )) {
            const language = languageOfExtension(extension);
            const target = (byGroupYear[language] ??= {});
            for (const [year, lines] of Object.entries(byYear)) {
              target[year] = (target[year] ?? 0) + lines;
            }
          }
          return { date: row.date, byGroupYear };
        }),
        7,
        survivalYearScale,
        (label, rank) => {
          const tokeiKeys = languagesChart.seriesKeys;
          const matched = tokeiKeys.indexOf(label);
          const slot = matched === -1 ? tokeiKeys.length + rank : matched;
          return (
            categoricalColors[slot % categoricalColors.length] ?? otherColor
          );
        },
      )
    : undefined;

  const survivalHasYearData = data.survival.some(
    (row) => row.byContributorYear !== undefined,
  );

  // Flat one-color-per-contributor stack when age shading is off, or when a
  // pre-per-year dashboard.json has no byContributorYear to shade with.
  const survivalAuthorChart: StackedChart | undefined =
    data.survival.length === 0
      ? undefined
      : !shadeContributorsByYear || !survivalHasYearData
        ? shapeStacked(
            data.survival.map((row) => ({
              date: row.date,
              values: row.byContributor,
            })),
            maxContributorsInCharts,
          )
        : shapeYearBands(
            data.survival.map((row) => ({
              date: row.date,
              byGroupYear: row.byContributorYear ?? {},
            })),
            maxContributorsInCharts,
            survivalYearScale,
          );

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{data.repo.name}</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {formatCount(data.repo.commitCount)} commits ·{" "}
          {data.repo.contributorCount} contributors ·{" "}
          {data.repo.firstCommitDate
            ? `${formatDate(data.repo.firstCommitDate)} — ${formatDate(data.repo.lastCommitDate ?? "")}`
            : "no history"}{" "}
          · generated {formatDate(data.generatedAt)} by repo-dive
        </p>
      </header>

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Commits" value={formatCount(data.repo.commitCount)} />
        <StatTile
          label="Lines"
          value={
            latestLanguages
              ? formatCount(
                  Object.values(latestLanguages.byLanguage).reduce(
                    (sum, lines) => sum + lines,
                    0,
                  ),
                )
              : "—"
          }
          hint="latest language snapshot"
        />
        <StatTile
          label="Files"
          value={
            latestFileTypes ? formatCount(latestFileTypes.totalFiles) : "—"
          }
          hint={
            latestFileTypes
              ? formatBytes(latestFileTypes.totalBytes)
              : undefined
          }
        />
        <StatTile
          label="Dependencies"
          value={
            latestDependencies ? formatCount(latestDependencies.resolved) : "—"
          }
          hint={
            latestDependencies
              ? `${formatCount(directDependenciesTotal)} direct`
              : undefined
          }
        />
        <StatTile
          label="AI commits"
          value={
            aiShareRecent === undefined ? "—" : formatPercent(aiShareRecent)
          }
          hint="last 90 days, by co-author"
        />
        <StatTile
          label="Suppressions"
          value={
            latestDirectives
              ? formatCount(
                  latestDirectives.eslintNextLine +
                    latestDirectives.eslintLine +
                    latestDirectives.eslintBlocks +
                    latestDirectives.tsIgnore +
                    latestDirectives.tsExpectError +
                    latestDirectives.tsNocheck,
                )
              : "—"
          }
          hint="eslint + ts directives now"
        />
      </div>

      {languagesChart.points.length > 0 && (
        <Section
          title="Lines by language"
          subtitle={
            shadeLanguagesByYear && languagesYearChart
              ? "living lines via git blame at sampled commits, grouped by language (from file extensions) and shaded by the year each line was written"
              : "tokei snapshots at sampled commits; embedded code counts toward its host file's language"
          }
          controls={
            languagesYearChart ? (
              <YearShadeToggle
                checked={shadeLanguagesByYear}
                onChange={setShadeLanguagesByYear}
              />
            ) : undefined
          }
        >
          <TimeSeriesChart
            mode="area"
            {...(shadeLanguagesByYear && languagesYearChart
              ? languagesYearChart
              : languagesChart)}
          />
          <DataTable
            caption="View data"
            header={["date", ...languagesChart.seriesKeys]}
            rows={languagesChart.points.map((point) => [
              formatDate(new Date(point.dateMs).toISOString()),
              ...languagesChart.seriesKeys.map((key) => point.values[key] ?? 0),
            ])}
          />
        </Section>
      )}

      {dependenciesChart.points.length > 0 && (
        <Section
          title="Dependencies over time"
          subtitle="resolved packages in the lockfile at each commit, split by package manager"
        >
          <TimeSeriesChart
            mode="area"
            {...dependenciesChart}
            domainStartMs={repoStartMs}
            zeroLabel="No lockfile"
          />
          <DataTable
            caption="View data"
            header={["date", "resolved", "direct", "dev", "optional"]}
            rows={dependencies.map((row) => [
              formatDate(row.date),
              row.resolved,
              row.directProd,
              row.directDev,
              row.directOptional,
            ])}
          />
        </Section>
      )}

      <Section
        title="Commits per month"
        subtitle="AI-assisted = at least one AI co-author trailer on the commit"
      >
        <TimeSeriesChart mode="bar" {...commitsChart} />
      </Section>

      <Section title="Churn per month" subtitle="lines added and deleted">
        <DivergingBars
          points={data.monthly.map((row) => ({
            month: row.month,
            positive: row.added,
            negative: row.deleted,
          }))}
          positiveLabel="added"
          negativeLabel="deleted"
        />
      </Section>

      {suppressionsChart.points.length > 0 && (
        <Section
          title="Fighting the linter"
          subtitle="suppression comments in the tree over time (block disables counted as one each)"
        >
          <TimeSeriesChart mode="line" {...suppressionsChart} />
        </Section>
      )}

      {data.topRules.length > 0 && (
        <Section
          title="Most-suppressed eslint rules"
          subtitle="at the latest commit; (all) = blanket disables without a rule list"
        >
          <BarList
            items={data.topRules.map((row) => ({
              label: row.rule,
              value: row.count,
            }))}
            color="var(--series-6)"
          />
        </Section>
      )}

      {survivalCohortChart && (
        <Section
          title="Code survival by cohort"
          subtitle="living lines at sampled commits, grouped by the year each line was written"
        >
          <TimeSeriesChart mode="area" {...survivalCohortChart} />
        </Section>
      )}

      {survivalAuthorChart && (
        <Section
          title="Code survival by contributor"
          subtitle="who wrote the lines that are still alive"
          controls={
            survivalHasYearData ? (
              <YearShadeToggle
                checked={shadeContributorsByYear}
                onChange={setShadeContributorsByYear}
              />
            ) : undefined
          }
        >
          <TimeSeriesChart mode="area" {...survivalAuthorChart} />
        </Section>
      )}

      {data.aiIdentities.length > 0 && (
        <Section
          title="AI co-authors"
          subtitle="commits co-authored per AI identity"
        >
          <BarList
            items={data.aiIdentities.map((row) => ({
              label: row.identity,
              value: row.commits,
            }))}
            color="var(--series-5)"
          />
        </Section>
      )}

      <Section
        title="Contributors"
        subtitle="human contributors by commit count"
      >
        <DataTable
          caption={`All ${data.contributors.length} listed contributors`}
          header={["contributor", "commits", "added", "deleted"]}
          rows={data.contributors.map((contributor) => [
            <>
              {contributor.kind && contributor.kind !== "human" ? (
                <span
                  title={kindBadge[contributor.kind].title}
                  className="mr-1 select-none"
                >
                  {kindBadge[contributor.kind].icon}
                </span>
              ) : undefined}
              {contributor.url ? (
                <a
                  href={contributor.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium hover:underline"
                >
                  {contributor.name}
                </a>
              ) : (
                contributor.name
              )}{" "}
              <span className="text-(--text-muted)">
                &lt;{contributor.email}&gt;
              </span>
            </>,
            contributor.commits,
            formatCount(contributor.added),
            formatCount(contributor.deleted),
          ])}
        />
        <BarList
          items={humanContributors
            .slice(0, maxContributorsInCharts * 2)
            .map((contributor) => ({
              label: contributor.name || contributor.email,
              value: contributor.commits,
              href: contributor.url,
            }))}
        />
        {nonHumanContributors.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 text-sm font-medium text-(--text-secondary)">
              Bots &amp; AI agents
            </h3>
            <BarList
              color="var(--series-9)"
              items={nonHumanContributors.map((contributor) => ({
                label: `${kindBadge[contributor.kind === "ai" ? "ai" : "bot"].icon} ${contributor.name || contributor.email}`,
                value: contributor.commits,
                href: contributor.url,
              }))}
            />
          </>
        )}
      </Section>
    </main>
  );
}
