# Metrics cube

_Draft. The cube is the queryable index built from raw catalog outputs — the reduce half of the pipeline._

## Model

The mental model is a data cube: **numeric facts at intersections of open-ended categories**.

- A **fact** is one number: `metric` (e.g. `languages.lines`, `lint.errors`, `commits.count`), `value`.
- Every fact is anchored to a **commit** (and through it to time) and to the **collector** that produced it.
- Beyond that, dimensions are open-ended **categories**: `language`, `author`, `rule`, `directory`, `severity`, … Collectors introduce categories freely; the store must not require migrations when they do.

Examples of facts:

| metric            | value | commit  | categories                                         |
| ----------------- | ----- | ------- | -------------------------------------------------- |
| `languages.lines` | 48210 | `ab12…` | `{ "language": "TypeScript" }`                     |
| `lint.errors`     | 3     | `ab12…` | `{ "rule": "no-unused-vars", "severity": "error"}` |
| `churn.added`     | 120   | `ab12…` | `{ "extension": ".ts" }`                           |

## Storage: SQLite (confirmed as the first backend)

Backed by `node:sqlite`'s `DatabaseSync` from the standard library — no native dependency, which keeps `npx` startup clean.
Schema as built by `index` (v0):

```sql
CREATE TABLE commits (
  sha TEXT PRIMARY KEY,
  authored_at TEXT NOT NULL,     -- ISO 8601
  author_email TEXT NOT NULL,
  author_name TEXT NOT NULL
  -- … more metadata columns as needed
);

CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  commit_sha TEXT NOT NULL REFERENCES commits (sha),
  collector TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  categories TEXT NOT NULL DEFAULT '{}'  -- JSON object, e.g. {"language":"TypeScript"}
);

CREATE INDEX facts_by_metric ON facts (metric, commit_sha);
CREATE INDEX facts_by_collector ON facts (collector);
```

Which commits a sampled collector actually covered is read off `facts.collector` rather than a flag on `commits`, so nothing has to be kept in sync.

Why a JSON `categories` column rather than an EAV side table or wide columns:

- **Open-ended categories for free** — new categories need no DDL.
- SQLite's `json_extract` works in indexes, so hot category keys can get expression indexes (e.g. on `json_extract(categories, '$.language')`) when queries ask for them. None are created yet — the two indexes above are all the cube has.
- EAV (a `fact_categories(fact_id, key, value)` table) is the fallback if multi-category filtering at scale proves slow — the decision is revisitable cheaply because the cube is always rebuildable from raw catalog data.

## Query shapes to design for

```sql
-- Language breakdown over time (stacked area chart)
SELECT c.authored_at, json_extract(f.categories, '$.language') AS language,
       f.value
FROM facts f JOIN commits c ON c.sha = f.commit_sha
WHERE f.metric = 'languages.lines'
ORDER BY c.authored_at;

-- Lint debt trend by rule (top N rules)
SELECT c.authored_at, json_extract(f.categories, '$.rule') AS rule,
       sum(f.value) AS errors
FROM facts f JOIN commits c ON c.sha = f.commit_sha
WHERE f.metric = 'lint.errors'
GROUP BY 1, 2;
```

The `report` and `query` commands, future chart generation and any AI/MCP integration all sit on top of this one SQL surface.

## Notes

- **Rebuildability** is the key invariant: `index` drops the DB and reruns every collector's `normalize` over the raw catalog on every invocation. The cube is a cache, never the source of truth — which is also why no `--rebuild` flag is needed.
- **Dates as dimensions**: time bucketing (day/week/month) is derived at query time from `commits.authored_at` rather than materialized, until performance says otherwise.
- **Future backends**: the cube interface should stay narrow enough that a DuckDB or Parquet export ("give me the facts table as Parquet") is an output format, not a rewrite. An `export` command is the likely shape.
