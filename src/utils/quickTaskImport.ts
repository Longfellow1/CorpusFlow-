import * as XLSX from "xlsx";

export type QuickTaskKind = "qa" | "instruct" | "multi" | "code";

export type QuickTaskRow = {
  query?: string;
  input?: string;
  output?: string;
  instruction?: string;
  raw: Record<string, string>;
};

export type QuickTaskParsedFile = {
  kind: QuickTaskKind;
  headers: string[];
  columns: {
    query?: string;
    input?: string;
    output?: string;
    instruction?: string;
  };
  rows: QuickTaskRow[];
  warnings: string[];
};

const QUERY_ALIASES = ["query", "q", "sentence", "text", "prompt"];
const INPUT_ALIASES = ["input", "instruction", "prompt", "query"];
const OUTPUT_ALIASES = ["output", "out", "answer", "response", "label", "outpu"];

function cleanHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function toStringCell(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return String(value).trim();
}

function findHeader(headers: string[], aliases: string[]) {
  const normalized = headers.map((header) => ({ raw: header, key: cleanHeader(header) }));
  const matched = normalized.find((header) => aliases.includes(header.key));
  return matched?.raw;
}

export function detectQuickTaskKindFromHeaders(headers: string[]): QuickTaskKind {
  const normalized = headers.map(cleanHeader);
  const hasInput = INPUT_ALIASES.some((alias) => normalized.includes(alias));
  const hasOutput = OUTPUT_ALIASES.some((alias) => normalized.includes(alias));
  const hasInstruction = normalized.includes("instruction");
  if (hasInput && hasOutput) {
    return "instruct";
  }
  if (hasInstruction && (hasInput || hasOutput)) {
    return "instruct";
  }
  if (hasInstruction && !normalized.some((alias) => QUERY_ALIASES.includes(alias))) {
    return "instruct";
  }
  const hasQuery = QUERY_ALIASES.some((alias) => normalized.includes(alias));
  return hasQuery ? "qa" : "qa";
}

export function normalizeQuickTaskRows(rows: Record<string, unknown>[], kind: QuickTaskKind): QuickTaskRow[] {
  return rows
    .map((row) => {
      const raw = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, toStringCell(value)]),
      ) as Record<string, string>;

      if (kind === "instruct") {
        return {
          input: raw.input || raw.query || "",
          output: raw.output || raw.answer || raw.response || "",
          instruction: raw.instruction || "",
          raw,
        } satisfies QuickTaskRow;
      }

      return {
        query: raw.query || raw.input || "",
        raw,
      } satisfies QuickTaskRow;
    })
    .filter((row) => {
      if (kind === "instruct") {
        return Boolean(row.input?.trim()) || Boolean(row.output?.trim()) || Boolean(row.instruction?.trim());
      }
      return Boolean(row.query?.trim());
    });
}

function parseJsonRows(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  }
  if (parsed && typeof parsed === "object") {
    const candidate = (parsed as { data?: unknown }).data;
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
    }
  }
  throw new Error("JSON 文件必须是数组或包含 data 数组");
}

function parseSheetRows(workbook: XLSX.WorkBook): Record<string, unknown>[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return [];
  }
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

function inferKindAndColumns(rows: Record<string, unknown>[]) {
  const headers = rows.length > 0 ? Object.keys(rows[0] || {}) : [];
  const kind = detectQuickTaskKindFromHeaders(headers);
  const columns = {
    query: findHeader(headers, QUERY_ALIASES),
    input: findHeader(headers, INPUT_ALIASES),
    output: findHeader(headers, OUTPUT_ALIASES),
    instruction: findHeader(headers, ["instruction"]),
  };
  return { kind, columns };
}

export async function parseQuickTaskFile(file: File): Promise<QuickTaskParsedFile> {
  const name = file.name.toLowerCase();
  let rows: Record<string, unknown>[] = [];

  if (name.endsWith(".json")) {
    rows = parseJsonRows(await file.text());
  } else if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    rows = parseSheetRows(workbook);
  } else {
    throw new Error("只支持 xlsx、csv、tsv、json 文件");
  }

  const { kind, columns } = inferKindAndColumns(rows);
  const normalized = normalizeQuickTaskRows(rows, kind);
  const warnings: string[] = [];

  if (rows.length === 0) {
    warnings.push("文件里没有可用数据");
  }
  if (kind === "qa" && !columns.query) {
    warnings.push("未找到 query 列，已按首列文本尝试解析");
  }
  if (kind === "instruct" && (!columns.input || !columns.output)) {
    warnings.push("未完整识别 input/output 列，已尝试自动映射");
  }

  return {
    kind,
    headers: rows.length > 0 ? Object.keys(rows[0] || {}) : [],
    columns,
    rows: normalized,
    warnings,
  };
}

export function buildQuickTaskSeedText(row: QuickTaskRow, kind: QuickTaskKind): string {
  switch (kind) {
    case "instruct":
      return row.input || row.query || "";
    case "multi":
      return row.query || row.input || "";
    case "code":
      return row.instruction || row.input || row.query || "";
    default: // qa
      return row.query || row.input || row.output || row.instruction || "";
  }
}
