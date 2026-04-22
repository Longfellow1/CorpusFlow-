import fs from "node:fs";
import path from "node:path";

type RegressionConfig = {
  analyze: Array<{ sentence: string }>;
  fineTune: {
    seed: string;
    analysis: Record<string, string>;
    style: string;
  };
};

const API_BASE = process.env.TEST_API_BASE || "http://127.0.0.1:3000";
const FIXTURE_PATH = path.join(process.cwd(), "fixtures", "regression-cases.json");
const config = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf-8")) as RegressionConfig;

async function request<T>(pathname: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${pathname} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

function hasTemplateSmell(text: string) {
  return /(\{.+\}|示例|占位|参数|模板)/.test(text);
}

function charCosine(left: string, right: string) {
  const leftMap = new Map<string, number>();
  const rightMap = new Map<string, number>();
  for (const char of left) leftMap.set(char, (leftMap.get(char) || 0) + 1);
  for (const char of right) rightMap.set(char, (rightMap.get(char) || 0) + 1);

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const [char, count] of leftMap.entries()) {
    dot += count * (rightMap.get(char) || 0);
    leftNorm += count * count;
  }
  for (const count of rightMap.values()) {
    rightNorm += count * count;
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

async function main() {
  const analyzeResults = await Promise.all(
    config.analyze.map((item) => request<Record<string, string>>("/api/algorithm/analyze", { sentence: item.sentence })),
  );

  const paraphrases = await request<Array<{ text: string; type: "convergence" | "generalization" }>>(
    "/api/algorithm/paraphrases",
    {
      sentence: config.fineTune.seed,
      analysis: config.fineTune.analysis,
      expansions: {
        action: ["开启", "掀开"],
        object: ["后备箱", "尾门"],
        modifiers: ["麻烦", "帮忙"],
      },
      style: config.fineTune.style,
    },
  );

  const sentenceStyleIntentRate =
    analyzeResults.filter((item) => item.intent.length >= 8 && /[用户想期望询问希望需要]/.test(item.intent)).length /
    analyzeResults.length;
  const templateSmellRate = paraphrases.filter((item) => hasTemplateSmell(item.text)).length / Math.max(paraphrases.length, 1);
  const averageSimilarity =
    paraphrases.reduce((sum, item) => sum + charCosine(item.text, config.fineTune.seed), 0) / Math.max(paraphrases.length, 1);
  const uniqueRatio = new Set(paraphrases.map((item) => item.text)).size / Math.max(paraphrases.length, 1);

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      analyzedCases: analyzeResults.length,
      paraphraseCount: paraphrases.length,
      sentenceStyleIntentRate: Number(sentenceStyleIntentRate.toFixed(2)),
      templateSmellRate: Number(templateSmellRate.toFixed(2)),
      averageSimilarity: Number(averageSimilarity.toFixed(2)),
      uniqueRatio: Number(uniqueRatio.toFixed(2)),
    },
    heuristics: {
      sentenceStyleIntentRateTarget: ">= 0.9",
      templateSmellRateTarget: "<= 0.1",
      averageSimilarityTarget: "0.35 - 0.9",
      uniqueRatioTarget: ">= 0.8",
    },
    analyzeResults,
    paraphrases,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
