import assert from "node:assert/strict";
import test from "node:test";
import {
  detectQuickTaskKindFromHeaders,
  buildQuickTaskSeedText,
  normalizeQuickTaskRows,
} from "../src/utils/quickTaskImport";

test("detects pure query imports from query headers", () => {
  const kind = detectQuickTaskKindFromHeaders(["query", "note"]);
  assert.equal(kind, "query");
});

test("detects instruction fine-tune imports from input and output headers", () => {
  const kind = detectQuickTaskKindFromHeaders(["instruction", "input", "output"]);
  assert.equal(kind, "instruction");
});

test("detects instruction imports when output header is misspelled as outpu", () => {
  const kind = detectQuickTaskKindFromHeaders(["instruction", "input", "outpu"]);
  assert.equal(kind, "instruction");
});

test("keeps instruction column unchanged when normalizing instruction rows", () => {
  const rows = normalizeQuickTaskRows(
    [
      {
        instruction: "请改写下面的句子",
        input: "帮我打开后盖",
        output: "请帮我打开后备箱",
      },
    ],
    "instruct",
  );

  assert.equal(rows[0]?.instruction, "请改写下面的句子");
  assert.equal(rows[0]?.input, "帮我打开后盖");
  assert.equal(rows[0]?.output, "请帮我打开后备箱");
});

test("builds quick seed text for qa rows without extra labels", () => {
  const seedText = buildQuickTaskSeedText(
    { query: "帮我打开后盖", raw: { query: "帮我打开后盖" } },
    "qa",
  );

  assert.equal(seedText, "帮我打开后盖");
});

test("builds quick seed text for instruct rows with instruction input and output", () => {
  const seedText = buildQuickTaskSeedText(
    {
      instruction: "请根据输入改写",
      input: "帮我打开后盖",
      output: "请帮我打开后备箱",
      raw: {},
    },
    "instruct",
  );

  assert.equal(seedText, "帮我打开后盖");
});
