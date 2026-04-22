import React, { useMemo, useRef } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import { type QuickTaskKind, type QuickTaskRow } from "../utils/quickTaskImport";

type QuickGeneratedItem = {
  id: string;
  type: "single" | "multi" | "instruct" | "code";
  q: string;
  a: string;
  seedIndex?: number;
};

type QuickTaskWorkspaceProps = {
  quickImportStatus: "idle" | "parsing" | "ready" | "error";
  quickImportError: string;
  quickFile: { name: string; size: string } | null;
  quickTaskKind: QuickTaskKind;
  quickRows: QuickTaskRow[];
  quickHeaders: string[];
  quickColumns: {
    query?: string;
    input?: string;
    output?: string;
    instruction?: string;
  };
  quickWarnings: string[];
  quickTargetPerSeed: number;
  quickFilterStrength: "loose" | "medium" | "strict";
  quickConcurrency: number;
  quickControlExpanded: boolean;
  quickRunStatus: "idle" | "running" | "done";
  quickRunStats: {
    seeds_count: number;
    total_generated: number;
    total_retained: number;
    pass_rate: number;
  } | null;
  quickGeneratedItems: QuickGeneratedItem[];
  quickSeedTexts: string[];
  quickGroupedResults: Array<{
    seedIndex: number;
    items: QuickGeneratedItem[];
  }>;
  onImportFile: (file: File) => Promise<void>;
  onResetImport: () => void;
  onTaskKindChange: (kind: QuickTaskKind) => void;
  onTargetPerSeedChange: (value: number) => void;
  onFilterStrengthChange: (value: "loose" | "medium" | "strict") => void;
  onConcurrencyChange: (value: number) => void;
  onToggleControlExpanded: () => void;
  onGenerate: () => void;
  onExport: (format: "json" | "csv" | "jsonl") => void;
  onClearResults: () => void;
  isExporting: boolean;
  quickInstructionTemplate: string;
  onInstructionTemplateChange: (v: string) => void;
  quickDiversity: number;
  onDiversityChange: (v: number) => void;
  quickGenerationIntent: string;
  onGenerationIntentChange: (v: string) => void;
};

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function fieldBadge(value?: string) {
  if (!value) return <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-500">未识别</span>;
  return <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">{value}</span>;
}

export function QuickTaskWorkspace({
  quickImportStatus,
  quickImportError,
  quickFile,
  quickTaskKind,
  quickRows,
  quickHeaders,
  quickColumns,
  quickWarnings,
  quickTargetPerSeed,
  quickFilterStrength,
  quickConcurrency,
  quickControlExpanded,
  quickRunStatus,
  quickRunStats,
  quickGeneratedItems,
  quickSeedTexts,
  quickGroupedResults,
  onImportFile,
  onResetImport,
  onTaskKindChange,
  onTargetPerSeedChange,
  onFilterStrengthChange,
  onConcurrencyChange,
  onToggleControlExpanded,
  onGenerate,
  onExport,
  onClearResults,
  isExporting,
  quickInstructionTemplate,
  onInstructionTemplateChange,
  quickDiversity,
  onDiversityChange,
  quickGenerationIntent,
  onGenerationIntentChange,
}: QuickTaskWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewTexts = useMemo(() => quickSeedTexts.slice(0, 8), [quickSeedTexts]);
  const fileLabel = quickFile ? quickFile.name.split(".").pop()?.toUpperCase() || "FILE" : "FILE";
  const totalCount = quickRows.length;
  const validCount = quickSeedTexts.length;
  const currentTypeLabel = quickTaskKind === "instruct" ? "指令微调" : quickTaskKind === "multi" ? "多轮对话" : quickTaskKind === "code" ? "代码生成" : "单轮问答";

  return (
    <>
      {/* ── 左轨 w-72：单一控制流 ── */}
      <div className="w-72 border-r border-slate-800 bg-[#1A1A27] flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Upload size={14} className="text-emerald-400" />
            快速导入
          </h2>
          <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">{currentTypeLabel}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">

          {/* ── 区块①：导入 ── */}
          {quickImportStatus === "idle" || quickImportStatus === "parsing" || quickImportStatus === "error" ? (
            <>
              <label
                className={cn(
                  "flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-4 text-center transition-all",
                  quickImportStatus === "error"
                    ? "border-rose-500/50 bg-rose-500/5"
                    : "border-slate-700 bg-slate-900/40 hover:border-emerald-500/50 hover:bg-emerald-500/5",
                )}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files?.[0];
                  if (file) void onImportFile(file);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onImportFile(file);
                    event.target.value = "";
                  }}
                />
                {quickImportStatus === "parsing" ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={36} className="animate-spin text-emerald-400" />
                    <p className="text-sm text-slate-300">正在识别文件</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                      <Upload size={26} />
                    </div>
                    <div>
                      <div className="text-base font-bold text-white">上传表格文件</div>
                      <div className="text-xs text-slate-500">支持 xlsx / csv / json</div>
                    </div>
                    <div className="text-[11px] text-slate-600">拖拽或点击选择文件</div>
                  </div>
                )}
              </label>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
              >
                选择文件
              </button>

              {quickImportError && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  {quickImportError}
                </div>
              )}
            </>
          ) : (
            /* quickImportStatus === "ready" */
            <>
              {/* 紧凑文件卡片 */}
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{quickFile?.name}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {quickFile?.size} · 有效行 {validCount} / 总行数 {totalCount}
                  </div>
                </div>
              </div>
              <button
                onClick={onResetImport}
                className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
              >
                重新上传
              </button>

              {/* 字段识别卡片 */}
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div className="text-xs font-bold text-slate-400">字段识别</div>
                <div className="grid gap-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">query</span>
                    {fieldBadge(quickColumns.query)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">input</span>
                    {fieldBadge(quickColumns.input)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">output</span>
                    {fieldBadge(quickColumns.output)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">instruction</span>
                    {fieldBadge(quickColumns.instruction)}
                  </div>
                </div>
              </div>

              {/* Warnings */}
              {quickWarnings.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <AlertCircle size={12} />
                    识别提示
                  </div>
                  <div className="space-y-1 text-xs text-slate-400">
                    {quickWarnings.map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── 区块②：配置（仅 ready 时显示）── */}
          {quickImportStatus === "ready" && (
            <>
              {/* 输出类型 */}
              <div className="rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div className="text-xs font-bold text-slate-400">输出类型</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: "qa", label: "单轮问答" },
                      { value: "instruct", label: "指令微调" },
                      { value: "multi", label: "多轮对话" },
                      { value: "code", label: "代码生成" },
                    ] as const
                  ).map(({ value, label }) => {
                    const activeClasses: Record<string, string> = {
                      qa:      "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
                      instruct:"bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30",
                      multi:   "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30",
                      code:    "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
                    };
                    return (
                      <button
                        key={value}
                        onClick={() => onTaskKindChange(value)}
                        className={cn(
                          "rounded-xl px-3 py-2 text-xs font-bold transition-all",
                          quickTaskKind === value
                            ? activeClasses[value]
                            : "border border-slate-700 text-slate-400 hover:bg-slate-800",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 训练角色定义 */}
              {(!quickColumns.instruction || quickTaskKind === "instruct") && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-400">训练角色定义</label>
                    <span className="text-[10px] text-slate-600">← 写入每条训练数据</span>
                  </div>
                  <textarea
                    rows={3}
                    value={quickInstructionTemplate}
                    onChange={(e) => onInstructionTemplateChange(e.target.value)}
                    placeholder="例：你是车载语音助手，请根据用户指令执行操作"
                    className={cn(
                      "w-full resize-none rounded-xl border px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none transition-colors",
                      quickInstructionTemplate.trim()
                        ? "border-slate-700 bg-slate-900/60 focus:border-indigo-500"
                        : "border-rose-500/60 bg-rose-500/5 focus:border-rose-400"
                    )}
                  />
                  {!quickInstructionTemplate.trim() && (
                    <p className="text-[10px] text-rose-400">指令微调模式必须填写 Instruction</p>
                  )}
                </div>
              )}

              {/* 生成意图 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-400">生成意图</label>
                  <span className="text-[10px] text-slate-500">可选</span>
                </div>
                <textarea
                  rows={2}
                  value={quickGenerationIntent}
                  onChange={(e) => onGenerationIntentChange(e.target.value)}
                  placeholder="例：重点覆盖紧急场景，语气简短口语"
                  className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition-colors"
                />
                <p className="text-[10px] text-slate-600">仅用于指导生成方向，不写入训练数据</p>
              </div>

              {/* 生成规模 */}
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-400">生成规模</div>
                  <div className="text-sm font-bold text-emerald-400">x{quickTargetPerSeed}</div>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={quickTargetPerSeed}
                  onChange={(event) => onTargetPerSeedChange(Number(event.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span>省时</span>
                  <span>更多</span>
                </div>
              </div>

              {/* 语义多样性 */}
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-400">语义多样性</div>
                  <div className="text-sm font-bold text-emerald-400">{quickDiversity}</div>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={quickDiversity}
                  onChange={(e) => onDiversityChange(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span>专注 2-3簇</span>
                  <span>广泛 10+簇</span>
                </div>
              </div>

              {/* 过滤强度 */}
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-400">过滤强度</div>
                  <button
                    onClick={onToggleControlExpanded}
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    {quickControlExpanded ? "收起" : "高级"}{" "}
                    <ChevronDown size={12} className={cn("transition-transform", quickControlExpanded && "rotate-180")} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["loose", "宽松"],
                      ["medium", "平衡"],
                      ["strict", "严格"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => onFilterStrengthChange(value)}
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-bold transition-all",
                        quickFilterStrength === value
                          ? "bg-slate-100 text-slate-950"
                          : "border border-slate-700 text-slate-400 hover:bg-slate-800",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {quickControlExpanded && (
                  <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">并发</span>
                      <span className="text-xs font-bold text-white">{quickConcurrency}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="16"
                      value={quickConcurrency}
                      onChange={(event) => onConcurrencyChange(Number(event.target.value))}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-slate-100"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── 区块③：生成按钮（始终显示）── */}
          <button
            onClick={onGenerate}
            disabled={
              quickRunStatus === "running" ||
              quickSeedTexts.length === 0 ||
              (quickTaskKind === "instruct" && !quickInstructionTemplate.trim())
            }
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-60",
              quickRunStatus === "done"
                ? "border border-emerald-500 bg-transparent text-emerald-400 hover:bg-emerald-500/10 shadow-none"
                : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/20",
            )}
          >
            {quickRunStatus === "running" ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                生成中…
              </>
            ) : quickRunStatus === "done" ? (
              <>
                <RefreshCw size={16} />
                重新生成
              </>
            ) : (
              <>
                <Play size={16} />
                开始生成
              </>
            )}
          </button>

          {/* ── 区块④：导出 + 统计（仅有结果时显示）── */}
          {quickGeneratedItems.length > 0 && (
            <div className="space-y-3">
              {/* 统计行 */}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>保留 {quickRunStats?.total_retained ?? quickGeneratedItems.length} 条</span>
                {quickRunStats && (
                  <span>通过率 {Math.round(quickRunStats.pass_rate * 100)}%</span>
                )}
              </div>

              {/* 导出按钮 */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onExport("json")}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileJson size={12} /> JSON
                </button>
                <button
                  onClick={() => onExport("csv")}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileSpreadsheet size={12} /> CSV
                </button>
                <button
                  onClick={() => onExport("jsonl")}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileText size={12} /> JSONL
                </button>
              </div>

              {/* 清空：文字链接，非按钮 */}
              <button
                onClick={onClearResults}
                className="w-full text-center text-xs text-slate-500 hover:text-rose-400 transition-colors"
              >
                清空结果
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 中央区块（全宽结果，原样保留）── */}
      <div className="flex-1 overflow-y-auto bg-[#0F0F16] p-6 custom-scrollbar">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-[#1A1A27] p-6 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-500">快速任务台</div>
                <h2 className="mt-1 text-2xl font-black text-white">上传文件，自动识别，直接开跑</h2>
                <p className="mt-2 text-sm text-slate-500">少文字，快判断，大卡片。</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">{fileLabel}</span>
                <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">{currentTypeLabel}</span>
                <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">{validCount} 行有效</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-[#1A1A27] p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles size={16} className="text-emerald-400" />
                数据预览 / 结果
              </h3>
              {quickRunStatus === "done" && quickRunStats && (
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>保留 {quickRunStats.total_retained}</span>
                  <span>通过率 {Math.round(quickRunStats.pass_rate * 100)}%</span>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-4">
              {quickGeneratedItems.length > 0 ? (
                quickGroupedResults.map((group) => {
                  const sourceText = quickSeedTexts[group.seedIndex] || `种子 ${group.seedIndex + 1}`;
                  return (
                    <div key={group.seedIndex} className="overflow-hidden rounded-2xl border border-slate-800 bg-[#161621]">
                      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/40 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            #{group.seedIndex + 1}
                          </span>
                          <span className="text-sm text-white">{sourceText}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{group.items.length} 条</span>
                      </div>
                      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                        {group.items.map((item, index) => (
                          <div key={item.id || `${group.seedIndex}-${index}`} className="rounded-2xl border border-slate-800 bg-[#1A1A27] p-4">
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span className={item.type === "instruct" ? "text-indigo-400" : item.type === "multi" ? "text-violet-400" : item.type === "code" ? "text-amber-400" : "text-emerald-400"}>
                                {item.type === "instruct" ? "指令微调" : item.type === "multi" ? "多轮对话" : item.type === "code" ? "代码生成" : "问答"}
                              </span>
                              <span>#{index + 1}</span>
                            </div>
                            {item.type === "multi" ? (
                              <div className="mt-3 space-y-2">
                                {((item as any).conversations || []).map((turn: any, i: number) => (
                                  <div key={i} className={cn("rounded-xl px-3 py-2 text-sm", turn.from === "human" ? "bg-slate-800 text-white" : "bg-indigo-500/10 text-indigo-200")}>
                                    <span className="text-[10px] font-bold text-slate-500 mr-2">{turn.from === "human" ? "用户" : "助手"}</span>
                                    {turn.value}
                                  </div>
                                ))}
                              </div>
                            ) : item.type === "code" ? (
                              <div className="mt-3 space-y-3">
                                <div>
                                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Instruction</div>
                                  <p className="text-sm leading-relaxed text-slate-300">{(item as any).instruction || "—"}</p>
                                </div>
                                {(item as any).input && <><div className="h-px bg-slate-800" /><div><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Input</div><p className="text-sm text-white">{(item as any).input}</p></div></>}
                                <div className="h-px bg-slate-800" />
                                <div>
                                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">Output</div>
                                  <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-amber-200 font-mono">{(item as any).output || "—"}</pre>
                                </div>
                              </div>
                            ) : item.type === "instruct" ? (
                              <div className="mt-3 space-y-3">
                                <div>
                                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Instruction</div>
                                  <p className="text-sm leading-relaxed text-slate-300">{(item as any).instruction || "—"}</p>
                                </div>
                                <div className="h-px bg-slate-800" />
                                <div>
                                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Input</div>
                                  <p className="text-sm leading-relaxed text-white">{(item as any).input || "—"}</p>
                                </div>
                                <div className="h-px bg-slate-800" />
                                <div>
                                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Output</div>
                                  <p className="text-sm leading-relaxed text-slate-400">{(item as any).output || "—"}</p>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 space-y-3">
                                <div>
                                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">提问</div>
                                  <p className="text-sm leading-relaxed text-white">{item.q}</p>
                                </div>
                                <div className="h-px bg-slate-800" />
                                <div>
                                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">回答</div>
                                  <p className="text-sm leading-relaxed text-slate-400">{item.a || "—"}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : previewTexts.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {previewTexts.map((text, index) => (
                    <div key={`${text}-${index}`} className="rounded-2xl border border-slate-800 bg-[#161621] p-4">
                      <div className="mb-3 flex items-center justify-between text-[10px] text-slate-500">
                        <span>#{index + 1}</span>
                        <span>待生成</span>
                      </div>
                      <p className="text-sm leading-relaxed text-white">{text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-800 bg-[#12121A] text-slate-500">
                  <FileText size={42} className="opacity-20" />
                  <p className="text-sm">先上传文件，再开始生成</p>
                </div>
              )}
            </div>
          </div>

          {quickImportStatus === "ready" && quickHeaders.length > 0 && (
            <div className="rounded-3xl border border-slate-800 bg-[#1A1A27] p-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                <Check size={12} className="text-emerald-400" />
                识别到的列
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {quickHeaders.map((header) => (
                  <span key={header} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
                    {header}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
