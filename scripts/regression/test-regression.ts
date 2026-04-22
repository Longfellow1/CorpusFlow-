import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

type AnalyzeCase = {
  sentence: string;
  mustContainInIntent: string[];
  expectedObject?: string;
  expectedAction?: string;
  expectedSubject?: string;
};

type RegressionConfig = {
  analyze: AnalyzeCase[];
  fineTune: {
    taskName: string;
    seed: string;
    analysis: Record<string, string>;
    style: string;
    manualExpansionDraft: string;
  };
  generate: {
    taskName: string;
    mode: "single" | "multi" | "instruct" | "quick";
    expansionRatio: number;
    overallRequirement: string;
    styleAdjustment: string;
  };
  quickGenerate: {
    taskName: string;
    mode: "quick";
    expansionRatio: number;
    overallRequirement: string;
    styleAdjustment: string;
    maxDurationSeconds: number;
    seeds: string[];
  };
};

const API_BASE = process.env.TEST_API_BASE || "http://127.0.0.1:3000";
const FIXTURE_PATH = path.join(process.cwd(), "fixtures", "regression-cases.json");
const config = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf-8")) as RegressionConfig;

let authToken = "";

async function request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${pathname} failed: ${response.status} ${message}`);
  }

  return response.json() as Promise<T>;
}

function logSection(title: string) {
  console.log(`\n[${title}]`);
}

function validateIntentLooksLikeSentence(intent: string) {
  assert.ok(intent.length >= 8, `intent too short: ${intent}`);
  assert.ok(/[用户想期望询问希望需要]/.test(intent), `intent lacks user-oriented phrasing: ${intent}`);
}

async function ensureHealth() {
  logSection("health");
  const health = await request<{ ok: boolean; services: { algorithm: { ok: boolean } } }>("/api/health");
  assert.equal(health.ok, true, "node service should be healthy");
  assert.equal(health.services.algorithm.ok, true, "algorithm service should be healthy");
  console.log("health ok");
}

async function login() {
  logSection("login");
  const email = `regression-${Date.now()}@local.test`;
  const result = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "dev" }),
  });
  authToken = result.token;
  assert.ok(authToken.startsWith("dev-token:"), "login token should be issued");
  console.log(`login ok as ${email}`);
}

async function runAnalyzeRegression() {
  logSection("analyze");
  for (const testCase of config.analyze) {
    const result = await request<Record<string, string>>("/api/algorithm/analyze", {
      method: "POST",
      body: JSON.stringify({ sentence: testCase.sentence }),
    });
    validateIntentLooksLikeSentence(result.intent || "");
    for (const token of testCase.mustContainInIntent) {
      assert.ok(result.intent.includes(token), `intent should contain "${token}": ${result.intent}`);
    }
    if (testCase.expectedObject) {
      assert.ok(result.object.includes(testCase.expectedObject), `object mismatch: ${result.object}`);
    }
    if (testCase.expectedAction) {
      assert.ok(result.action.includes(testCase.expectedAction), `action mismatch: ${result.action}`);
    }
    if (testCase.expectedSubject) {
      assert.ok(result.subject.includes(testCase.expectedSubject), `subject mismatch: ${result.subject}`);
    }
    console.log(`analyze ok: ${testCase.sentence}`);
  }
}

async function runFineTunePreviewRegression() {
  logSection("fine-tune-preview");
  const expand = await request<Record<string, string[]>>("/api/algorithm/expand", {
    method: "POST",
    body: JSON.stringify({
      sentence: config.fineTune.seed,
      analysis: config.fineTune.analysis,
    }),
  });

  assert.ok(Array.isArray(expand.object), "expand.object should be an array");
  assert.ok(Array.isArray(expand.action), "expand.action should be an array");
  console.log("expand ok", expand);

  const paraphrases = await request<Array<{ text: string; type: "convergence" | "generalization" }>>(
    "/api/algorithm/paraphrases",
    {
      method: "POST",
      body: JSON.stringify({
        sentence: config.fineTune.seed,
        analysis: config.fineTune.analysis,
        expansions: {
          ...expand,
          object: Array.from(new Set([...(expand.object || []), ...config.fineTune.manualExpansionDraft.split(",")])),
        },
        style: config.fineTune.style,
      }),
    },
  );

  assert.ok(paraphrases.length >= 4, `expected at least 4 paraphrases, got ${paraphrases.length}`);
  assert.ok(paraphrases.every((item) => item.text && !item.text.includes("{")), "paraphrases should not contain placeholders");
  assert.ok(
    paraphrases.some((item) => /(后备箱|尾门|后盖)/.test(item.text)),
    "paraphrases should reflect current object/expansion context",
  );
  console.log("paraphrase preview ok");
}

async function runGenerateRegression() {
  logSection("generate");
  const task = await request<{ id: string }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      name: config.generate.taskName,
      businessType: "evaluation",
      workMode: "advanced",
    }),
  });

  const seedRecord = {
    id: `seed-${Date.now()}`,
    text: config.fineTune.seed,
    analysis: config.fineTune.analysis,
    expansions: {
      object: ["后备箱", "尾门"],
      action: ["开启", "掀开"],
      subject: [],
      modifiers: ["麻烦", "帮忙"],
    },
    paraphrases: [],
    qa: { q1: "", a1: "", q2: "", a2: "" },
    instruct: { query: "", instruct: "" },
    status: "completed",
  };

  await request(`/api/tasks/${task.id}/seeds`, {
    method: "POST",
    body: JSON.stringify([seedRecord]),
  });

  const generated = await request<{ items: Array<{ q: string; a: string; type: string }>; meta: { count: number } }>(
    `/api/tasks/${task.id}/generate`,
    {
      method: "POST",
      body: JSON.stringify({
        task: {
          mode: config.generate.mode,
          expansionRatio: config.generate.expansionRatio,
          overallRequirement: config.generate.overallRequirement,
          styleAdjustment: config.generate.styleAdjustment,
          multiTurnContext: "",
        },
        seeds: [seedRecord],
      }),
    },
  );

  assert.ok(generated.meta.count > 0, "generate should return items");
  assert.ok(generated.items.every((item) => item.q.trim().length > 0), "generated items should contain q");
  console.log(`generate ok: ${generated.meta.count} items`);

  const exported = await request<{ format: string; recordCount: number; content: string }>(`/api/tasks/${task.id}/export`, {
    method: "POST",
    body: JSON.stringify({
      format: "csv",
      items: generated.items,
    }),
  });

  assert.equal(exported.format, "csv");
  assert.ok(exported.recordCount > 0, "export should contain records");
  assert.ok(exported.content.includes("Type,Query,Response"), "csv header should be present");
  console.log("export ok");
}

async function runQuickRegression() {
  logSection("quick-generate");
  const task = await request<{ id: string }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      name: config.quickGenerate.taskName,
      businessType: "evaluation",
      workMode: "quick",
    }),
  });

  const quickSeeds = config.quickGenerate.seeds.map((text, index) => ({
    id: `quick-${Date.now()}-${index}`,
    text,
    analysis: {
      intent: index === 0 ? "用户想要打开车辆后备箱尾门" : "Quick",
      subject: index === 0 ? "用户" : "",
      action: index === 0 ? "打开" : "",
      object: index === 0 ? "后盖" : "",
      modifiers: index === 0 ? "帮我" : "",
    },
    expansions: index === 0
      ? {
          object: ["后备箱", "尾门"],
          action: ["开启", "掀开"],
          subject: [],
          modifiers: ["麻烦", "帮忙"],
        }
      : { object: [], action: [], subject: [], modifiers: [] },
    paraphrases: [],
    qa: { q1: "", a1: "", q2: "", a2: "" },
    instruct: { query: "", instruct: "" },
    status: "completed",
  }));

  const startedAt = Date.now();
  const generated = await request<{ items: Array<{ q: string; a: string; type: string }>; meta: { count: number } }>(
    `/api/tasks/${task.id}/generate`,
    {
      method: "POST",
      body: JSON.stringify({
        task: {
          mode: config.quickGenerate.mode,
          expansionRatio: config.quickGenerate.expansionRatio,
          overallRequirement: config.quickGenerate.overallRequirement,
          styleAdjustment: config.quickGenerate.styleAdjustment,
          multiTurnContext: "",
        },
        seeds: quickSeeds,
      }),
    },
  );
  const durationSeconds = (Date.now() - startedAt) / 1000;

  assert.ok(generated.meta.count > 0, "quick generate should return items");
  assert.ok(generated.items.length <= config.quickGenerate.expansionRatio * quickSeeds.length, "quick generate should obey expansion ratio");
  assert.ok(generated.items.every((item) => item.q.trim().length > 0), "quick items should contain q");
  assert.ok(durationSeconds <= config.quickGenerate.maxDurationSeconds, `quick generate too slow: ${durationSeconds.toFixed(1)}s`);
  const exported = await request<{ format: string; recordCount: number; content: string }>(`/api/tasks/${task.id}/export`, {
    method: "POST",
    body: JSON.stringify({
      format: "json",
      items: generated.items,
    }),
  });
  assert.equal(exported.format, "json");
  assert.ok(exported.recordCount > 0, "quick export should contain records");
  console.log(`quick generate ok: ${generated.meta.count} items in ${durationSeconds.toFixed(1)}s`);
}

async function main() {
  await ensureHealth();
  await login();
  await runAnalyzeRegression();
  await runFineTunePreviewRegression();
  await runGenerateRegression();
  await runQuickRegression();
  console.log("\nRegression suite passed.");
}

main().catch((error) => {
  console.error("\nRegression suite failed.");
  console.error(error);
  process.exitCode = 1;
});
