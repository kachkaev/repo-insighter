export const formatCount = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${Math.round(value / 1000)}k`;
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(Math.round(value));
};

export const formatBytes = (value: number): string => {
  if (value >= 1_073_741_824) {
    return `${(value / 1_073_741_824).toFixed(1)} GB`;
  }
  if (value >= 1_048_576) {
    return `${(value / 1_048_576).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} kB`;
  }
  return `${value} B`;
};

export const formatMonth = (isoMonth: string): string => {
  const [year, month] = isoMonth.split("-");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[Number(month) - 1] ?? month} ${year}`;
};

export const formatDate = (isoDate: string): string => isoDate.slice(0, 10);

export const formatPercent = (ratio: number): string =>
  `${(ratio * 100).toFixed(ratio >= 0.1 ? 0 : 1)}%`;
