import type { Comparison } from "./model--quality.types";

const start = "<!-- quality-comparison:start -->";
const end = "<!-- quality-comparison:end -->";

export const updateComparisonPage = (page: string, comparison: Comparison): string => {
  const from = page.indexOf(start);
  const to = page.indexOf(end);
  if (from < 0 || to < from || page.indexOf(start, from + start.length) !== -1 || page.indexOf(end, to + end.length) !== -1) {
    throw new Error("Missing or duplicated quality comparison markers in content/results.md - restore the markers");
  }
  const eligible = comparison.rows.filter((row) => row.switchExit === 0 && row.qualityExit === 0 && row.incomplete === 0 && row.errors === 0 && row.passed + row.failed === comparison.limit);
  const best = Math.max(0, ...eligible.map((row) => row.passed));
  const leaders = eligible.filter((row) => row.passed === best && best > 0);
  const winner = leaders.length ? `Best completed result${leaders.length > 1 ? "s (tie)" : ""}: **${leaders.map((row) => row.model.replaceAll("|", "\\|")).join("; ")}**, ${best}/${comparison.limit} checks passed.` : "No winner: no fully evaluated model passed a check.";
  const sample = comparison.filter === null ? "All coding choices" : `Model filter: ${comparison.filter.replaceAll("|", "\\|")}`;
  const parameters = comparison.sampling;
  const rows = comparison.rows.map((row) => {
    const status = row.switchExit !== 0 ? "Load error" : row.qualityExit !== 0 || row.incomplete || row.errors || row.passed + row.failed !== comparison.limit ? "Incomplete/error" : "Complete";
    const inputs = row.inputMin === null || row.inputMax === null ? "—" : row.inputMin === row.inputMax ? String(row.inputMin) : `${row.inputMin}–${row.inputMax}`;
    return `| ${row.model.replaceAll("|", "\\|")} | ${status} | ${row.passed}/${comparison.limit} | ${row.failed} | ${row.incomplete} | ${row.errors} | ${inputs} | ${row.seconds} |`;
  }).join("\n");
  const report = `${start}\n## Latest automated complex-model comparison\n\n${winner}\n\n${sample}. Completed ${comparison.completedAt}. This is a single sample per task; incomplete or failed-to-load models are excluded from the winner, so it does not establish an overall best model. Ties are not broken by speed.\n\nAllocated context ${comparison.allocation}; prompt-content target ${comparison.promptTarget}; output cap ${comparison.maxTokens}; reasoning ${comparison.effort}; temperature ${parameters.temperature}; top-p ${parameters.top_p}; top-k ${parameters.top_k}; min-p ${parameters.min_p}; repetition penalty ${parameters.repetition_penalty}; presence penalty ${parameters.presence_penalty}; frequency penalty ${parameters.frequency_penalty}; seed ${parameters.seed}. These are requested settings and may be interpreted differently by each backend.\n\nTasks: ${comparison.tasks.join(", ")}. Input contains synthetic filler; this does not measure a multi-file agent task.\n\n| Model and approach | Status | Passed | Failed | Incomplete | Errors | Actual input tokens | Total seconds |\n|---|---|---:|---:|---:|---:|---:|---:|\n${rows}\n${end}`;
  return page.slice(0, from) + report + page.slice(to + end.length);
};
