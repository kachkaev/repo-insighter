import { useMemo } from "react";

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

const categoricalColors = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];
const otherColor = "var(--text-muted)";
const cohortRamp = [
  "var(--seq-700)",
  "var(--seq-600)",
  "var(--seq-500)",
  "var(--seq-400)",
  "var(--seq-300)",
  "var(--seq-200)",
];

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

/** Top n keys by the latest snapshot's value; the rest fold into "Other". */
function shapeStacked(
  rows: ReadonlyArray<{ date: string; values: Record<string, number> }>,
  maxSeries: number,
): { points: TimePoint[]; seriesKeys: string[]; colors: string[] } {
  const latest = rows.at(-1)?.values ?? {};
  const ranked = Object.entries(latest)
    .toSorted(([, left], [, right]) => right - left)
    .map(([key]) => key);
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
    key === "Other" ? otherColor : (categoricalColors[index] ?? otherColor),
  );
  return { points, seriesKeys, colors };
}

export function App({ data }: { data: DashboardData }) {
  const latestLanguages = data.languages.at(-1);
  const latestDirectives = data.directives.at(-1);
  const latestFileTypes = data.fileTypes.at(-1);

  const aiShareRecent = useMemo(() => {
    const cutoff = Date.now() - 90 * 86_400_000;
    const recent = data.commits.filter(
      (commit) => new Date(commit.date).getTime() >= cutoff,
    );
    if (recent.length === 0) {
      return;
    }
    return (
      recent.filter((commit) => commit.ai).length / Math.max(1, recent.length)
    );
  }, [data.commits]);

  const languagesChart = useMemo(
    () =>
      shapeStacked(
        data.languages.map((row) => ({
          date: row.date,
          values: row.byLanguage,
        })),
        7,
      ),
    [data.languages],
  );

  const commitsChart = useMemo(() => {
    const points = data.monthly.map((row) => ({
      dateMs: new Date(`${row.month}-15`).getTime(),
      values: {
        "AI-assisted": row.aiCommits,
        Human: row.commits - row.aiCommits,
      },
    }));
    return {
      points,
      seriesKeys: ["Human", "AI-assisted"],
      colors: ["var(--series-1)", "var(--series-5)"],
    };
  }, [data.monthly]);

  const suppressionsChart = useMemo(() => {
    const rows = decimate(data.directives, 400);
    return {
      points: rows.map((row) => ({
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
  }, [data.directives]);

  const survivalCohortChart = useMemo(() => {
    if (data.survival.length === 0) {
      return;
    }
    const rows = data.survival.map((row) => {
      const byYear: Record<string, number> = {};
      for (const [cohortMonth, lines] of Object.entries(row.byCohort)) {
        const year = cohortMonth.slice(0, 4);
        byYear[year] = (byYear[year] ?? 0) + lines;
      }
      return { date: row.date, byYear };
    });
    const years = [
      ...new Set(rows.flatMap((row) => Object.keys(row.byYear))),
    ].toSorted();
    // Fold the oldest years together so the ramp never runs out of steps.
    const overflow = Math.max(0, years.length - cohortRamp.length);
    const bucketOf = (year: string) =>
      overflow > 0 && years.indexOf(year) <= overflow
        ? `≤${years[overflow] ?? ""}`
        : year;
    const buckets = [...new Set(years.map(bucketOf))];
    const points = rows.map((row) => {
      const values: Record<string, number> = {};
      for (const [year, lines] of Object.entries(row.byYear)) {
        const bucket = bucketOf(year);
        values[bucket] = (values[bucket] ?? 0) + lines;
      }
      return { dateMs: new Date(row.date).getTime(), values };
    });
    return {
      points,
      seriesKeys: buckets,
      colors: buckets.map((_, index) => cohortRamp[index] ?? "var(--seq-200)"),
    };
  }, [data.survival]);

  const survivalAuthorChart = useMemo(() => {
    if (data.survival.length === 0) {
      return;
    }
    return shapeStacked(
      data.survival.map((row) => ({ date: row.date, values: row.byAuthor })),
      6,
    );
  }, [data.survival]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{data.repo.name}</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {formatCount(data.repo.commitCount)} commits · {data.repo.authorCount}{" "}
          authors ·{" "}
          {data.repo.firstCommitDate
            ? `${formatDate(data.repo.firstCommitDate)} — ${formatDate(data.repo.lastCommitDate ?? "")}`
            : "no history"}{" "}
          · generated {formatDate(data.generatedAt)} by repo-insighter
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
          subtitle="tokei snapshots at sampled commits; embedded code counts toward its host file's language"
        >
          <TimeSeriesChart mode="area" {...languagesChart} />
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
          title="Code survival by author"
          subtitle="who wrote the lines that are still alive"
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

      <Section title="Authors" subtitle="top contributors by commit count">
        <DataTable
          caption={`All ${data.authors.length} listed authors`}
          header={["author", "commits", "added", "deleted"]}
          rows={data.authors.map((author) => [
            `${author.name} <${author.email}>`,
            author.commits,
            formatCount(author.added),
            formatCount(author.deleted),
          ])}
        />
        <BarList
          items={data.authors.slice(0, 10).map((author) => ({
            label: author.name || author.email,
            value: author.commits,
          }))}
        />
      </Section>
    </main>
  );
}
