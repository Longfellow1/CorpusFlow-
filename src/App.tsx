/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from "react";
import { 
  Plus, 
  Search, 
  RotateCcw, 
  Play, 
  Download, 
  Copy,
  MoreHorizontal, 
  ChevronLeft, 
  ChevronRight, 
  User, 
  LogOut, 
  Sparkles, 
  MessageSquare, 
  FileJson, 
  FileSpreadsheet,
  Check,
  Edit3,
  History,
  LayoutGrid,
  Settings,
  AlertCircle,
  FileText,
  Trash2,
  Loader2,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { analyzeSentence, expandSeedFields, generateParaphrases, generateQA, generateInstruct } from "./services/geminiService";
import { apiService } from "./services/apiService";
import { buildQuickTaskSeedText, parseQuickTaskFile, type QuickTaskKind, type QuickTaskParsedFile, type QuickTaskRow } from "./utils/quickTaskImport";
import { QuickTaskWorkspace } from "./components/QuickTaskWorkspace";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Task {
  id: string;
  name: string;
  time: string;
  active?: boolean;
  status: "running" | "completed" | "idle";
  businessType?: "evaluation" | "training";
  workMode?: "quick" | "advanced";
}

interface SeedData {
  id: string;
  text: string;
  analysis: {
    intent: string;
    subject: string;
    action: string;
    object: string;
    modifiers: string;
  };
  paraphrases: { text: string; type: 'convergence' | 'generalization' }[];
  qa: {
    q1: string;
    a1: string;
    q2: string;
    a2: string;
  };
  instruct: {
    query: string;
    instruct: string;
  };
  expansions: {
    subject: string[];
    action: string[];
    object: string[];
    modifiers: string[];
  };
  selectedExpansions: {
    subject: string[];
    action: string[];
    object: string[];
    modifiers: string[];
  };
  expansionStatus?: 'idle' | 'processing';
  styleAdjustmentDraft?: string;
  styleAdjustmentHistory?: string[];
  appliedStyleAdjustment?: string;
  paraphraseStatus?: 'idle' | 'processing';
  copyMessage?: string;
  status: 'pending' | 'processing' | 'completed';
}

interface GeneratedItem {
  id: string;
  type: 'single' | 'multi' | 'instruct' | 'code';
  q: string;
  a: string;
  // instruct mode 专用
  instruction?: string;
  input?: string;
  output?: string;
  // multi mode 专用
  conversations?: Array<{ from: string; value: string }>;
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) => (
  <button 
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
      active ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
    )}
  >
    <Icon size={18} />
    <span>{label}</span>
  </button>
);

const Card = ({ title, step, children, className, headerRight }: { title: string, step?: number, children: React.ReactNode, className?: string, headerRight?: React.ReactNode }) => (
  <div className={cn("bg-[#1E1E2D] border border-slate-800 rounded-xl flex flex-col h-full", className)}>
    <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
      {step && (
        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
          {step}
        </div>
      )}
      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">{title}</h3>
      </div>
      {headerRight}
    </div>
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
      {children}
    </div>
  </div>
);

const InputGroup = ({ label, value, placeholder, readOnly = false }: { label: string, value: string, placeholder?: string, readOnly?: boolean }) => (
  <div className="space-y-1.5">
    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
    <input 
      type="text" 
      value={value} 
      placeholder={placeholder}
      readOnly={readOnly}
      className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
    />
  </div>
);

type View = 'home' | 'fine-tune' | 'quick' | 'batch' | 'task-list';

function getTaskView(task: Task): View {
  if (task.name.includes("批量")) return "quick";
  if (task.workMode === "quick" || task.name.includes("快速")) return "quick";
  return "fine-tune";
}

function getTaskBadge(task: Task) {
  const view = getTaskView(task);
  if (view === "batch") {
    return { label: "批量任务", className: "bg-sky-500/10 text-sky-400" };
  }
  if (view === "quick") {
    return { label: "快速任务", className: "bg-emerald-500/10 text-emerald-400" };
  }
  return { label: "精调生成", className: "bg-indigo-500/10 text-indigo-400" };
}

function createEmptyAnalysis() {
  return { intent: "", subject: "", action: "", object: "", modifiers: "" };
}

function createEmptyExpansions() {
  return { subject: [], action: [], object: [], modifiers: [] };
}

function normalizeSeed(seed: Partial<SeedData> & Pick<SeedData, "id" | "text">): SeedData {
  return {
    id: seed.id,
    text: seed.text,
    analysis: seed.analysis || createEmptyAnalysis(),
    expansions: seed.expansions || createEmptyExpansions(),
    selectedExpansions: seed.selectedExpansions || seed.expansions || createEmptyExpansions(),
    expansionStatus: seed.expansionStatus || "idle",
    paraphrases: seed.paraphrases || [],
    qa: seed.qa || { q1: "", a1: "", q2: "", a2: "" },
    instruct: seed.instruct || { query: "", instruct: "" },
    styleAdjustmentDraft: seed.styleAdjustmentDraft || "",
    styleAdjustmentHistory: seed.styleAdjustmentHistory || [],
    appliedStyleAdjustment: seed.appliedStyleAdjustment || "",
    paraphraseStatus: seed.paraphraseStatus || "idle",
    copyMessage: seed.copyMessage || "",
    status: seed.status || "pending",
  };
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [activeTask, setActiveTask] = useState("");
  const [mode, setMode] = useState<"single" | "multi" | "instruct" | "quick">("single");
  const [expansionRatio, setExpansionRatio] = useState(22);
  const [isGenerating, setIsGenerating] = useState(false);
  const [seedInput, setSeedInput] = useState("我的车是不是该加玻璃水了\n什么时候应该保养\n冬天下午雪该用什么模式");
  const [seeds, setSeeds] = useState<SeedData[]>([]);
  const [overallRequirement, setOverallRequirement] = useState("");
  const [multiTurnContext, setMultiTurnContext] = useState("");
  const [styleAdjustment, setStyleAdjustment] = useState("");
  const [generatedData, setGeneratedData] = useState<GeneratedItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskDataMap, setTaskDataMap] = useState<Record<string, { seeds: SeedData[], generated: GeneratedItem[] }>>({});
  const [newTaskName, setNewTaskName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [batchFile, setBatchFile] = useState<{ name: string, size: string } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [batchStep, setBatchStep] = useState<'upload' | 'config' | 'running' | 'result'>('upload');
  const [isConversationPreviewExpanded, setIsConversationPreviewExpanded] = useState(false);
  const [batchConfig, setBatchConfig] = useState({
    generalization: 50,
    duplication: 3,
    mode: 'balanced' as 'conservative' | 'balanced' | 'creative'
  });
  const [quickImportStatus, setQuickImportStatus] = useState<"idle" | "parsing" | "ready" | "error">("idle");
  const [quickImportError, setQuickImportError] = useState("");
  const [quickFile, setQuickFile] = useState<{ name: string; size: string } | null>(null);
  const [quickTaskKind, setQuickTaskKind] = useState<QuickTaskKind>("qa");
  const [quickRows, setQuickRows] = useState<QuickTaskRow[]>([]);
  const [quickHeaders, setQuickHeaders] = useState<string[]>([]);
  const [quickColumns, setQuickColumns] = useState<QuickTaskParsedFile["columns"]>({
    query: undefined,
    input: undefined,
    output: undefined,
    instruction: undefined,
  });
  const [quickWarnings, setQuickWarnings] = useState<string[]>([]);
  const [quickTargetPerSeed, setQuickTargetPerSeed] = useState(5);
  const [quickFilterStrength, setQuickFilterStrength] = useState<"loose" | "medium" | "strict">("medium");
  const [quickConcurrency, setQuickConcurrency] = useState(8);
  const [quickRunStatus, setQuickRunStatus] = useState<"idle" | "running" | "done">("idle");
  const [quickRunStats, setQuickRunStats] = useState<{
    seeds_count: number;
    total_generated: number;
    total_retained: number;
    pass_rate: number;
  } | null>(null);
  const [quickGeneratedItems, setQuickGeneratedItems] = useState<Array<GeneratedItem & { seedIndex?: number }>>([]);
  const [quickControlExpanded, setQuickControlExpanded] = useState(false);
  const [quickInstructionTemplate, setQuickInstructionTemplate] = useState("");
  const [quickDiversity, setQuickDiversity] = useState(5);
  const [quickGenerationIntent, setQuickGenerationIntent] = useState("");

  // Login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [tempEmail, setTempEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [toasts, setToasts] = useState<Array<{id: string; message: string; type: 'error' | 'info'}>>([]);

  const addToast = useCallback((message: string, type: 'error' | 'info' = 'error') => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tempEmail.trim()) {
      try {
        const email = tempEmail.trim();
        const login = await apiService.login(email, tempPassword);
        apiService.setToken(login.token);
        setUserEmail(login.user.email);
        setIsLoggedIn(true);
        setTempPassword("");

        const nextTasks = await apiService.getTasks();
        setTasks(nextTasks as Task[]);
        setTaskDataMap({});
        const first = nextTasks[0];
        setActiveTask(first?.id || "");
      } catch (error) {
        console.error("Login failed", error);
        setApiError("登录失败，请确认后端服务与算法服务已启动");
      }
    }
  };

  const handleLogout = () => {
    apiService.clearToken();
    setIsLoggedIn(false);
    setUserEmail("");
    setTempEmail("");
    // Clear current state
    setTasks([]);
    setActiveTask("");
    setSeeds([]);
    setGeneratedData([]);
    setTaskDataMap({});
    clearQuickWorkspace();
  };

  // Calculate task progress
  const completedSeeds = seeds.filter(s => s.status === 'completed').length;

  useEffect(() => {
    setTasks([]);
    setTaskDataMap({});
    setIsLoading(false);
  }, []);

  // Sync active task data to state
  useEffect(() => {
    if (!isLoggedIn) {
      setSeeds([]);
      setGeneratedData([]);
      setSeedInput("");
      return;
    }

    if (activeTask && taskDataMap[activeTask]) {
      const data = taskDataMap[activeTask];
      setSeeds(data.seeds || []);
      setGeneratedData(data.generated || []);
      if (data.seeds && data.seeds.length > 0) {
        setSeedInput(data.seeds.map(s => s.text).join("\n"));
      }
    } else if (activeTask) {
      // Initialize empty data for new task if not in map
      setSeeds([]);
      setGeneratedData([]);
      setSeedInput("");
    }
  }, [activeTask, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !activeTask) return;

    let cancelled = false;

    (async () => {
      try {
        const [nextSeeds, nextGenerated] = await Promise.all([
          apiService.getSeeds(activeTask),
          apiService.getGenerated(activeTask),
        ]);

        if (cancelled) return;
        const normalizedSeeds = (nextSeeds as SeedData[]).map((seed) => normalizeSeed(seed));
        setTaskDataMap((prev) => ({
          ...prev,
          [activeTask]: {
            seeds: normalizedSeeds,
            generated: nextGenerated as GeneratedItem[],
          },
        }));
        setSeeds(normalizedSeeds);
        setGeneratedData(nextGenerated as GeneratedItem[]);
        if (normalizedSeeds.length > 0) {
          setSeedInput(normalizedSeeds.map((s) => s.text).join("\n"));
        }
      } catch (error) {
        console.error("Failed to load task data", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTask, isLoggedIn]);

  // Save to map whenever seeds or generatedData change
  useEffect(() => {
    if (!activeTask) return;
    
    setTaskDataMap(prev => ({
      ...prev,
      [activeTask]: {
        seeds,
        generated: generatedData
      }
    }));
  }, [seeds, generatedData, activeTask]);

  useEffect(() => {
    if (!isLoggedIn || !activeTask) return;

    const timeout = setTimeout(() => {
      apiService.saveSeeds(activeTask, seeds).catch((error) => {
        console.error("Failed to sync seeds", error);
      });
      apiService.saveGenerated(activeTask, generatedData).catch((error) => {
        console.error("Failed to sync generated data", error);
      });
    }, 300);

    return () => clearTimeout(timeout);
  }, [activeTask, seeds, generatedData, isLoggedIn]);

  // Generation Loop
  useEffect(() => {
    if (!isGenerating || view === "batch") return;

    let cancelled = false;

    (async () => {
      try {
        let nextSeeds = seeds;
        if (mode === "quick" && seeds.length === 0) {
          const lines = seedInput.split("\n").filter((line) => line.trim());
          nextSeeds = lines.map((text, index) => normalizeSeed({
            id: `qseed-${Date.now()}-${index}`,
            text,
            analysis: { intent: "Quick", subject: "", action: "", object: "", modifiers: "" },
            paraphrases: [{ text: text, type: "convergence" }],
            qa: { q1: "", a1: "", q2: text, a2: "好的" },
            instruct: { query: text, instruct: "执行" },
            status: "completed",
          }));
          setSeeds(nextSeeds);
        }

        if (nextSeeds.length === 0) {
          setIsGenerating(false);
          return;
        }

        const result = await apiService.generate(activeTask || `temp-${Date.now()}`, {
          task: {
            mode,
            expansionRatio,
            overallRequirement,
            multiTurnContext,
            styleAdjustment,
          },
          seeds: nextSeeds,
        });

        if (cancelled) return;
        setGeneratedData(result.items as GeneratedItem[]);
      } catch (error) {
        console.error("Generation failed", error);
        setApiError("批量生成失败，请检查后端或算法服务");
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isGenerating, view, mode, seeds, seedInput, expansionRatio, overallRequirement, multiTurnContext, styleAdjustment, activeTask]);

  const handleCreateTask = async () => {
    const name = newTaskName || `新任务-${new Date().toLocaleTimeString()}`;
    const workMode = view === "quick" || mode === "quick" ? "quick" : "advanced";
    try {
      const newTask = await apiService.createTask({
        name,
        businessType: mode === "instruct" ? "training" : "evaluation",
        workMode,
      });

      setTasks((prev) => [newTask as Task, ...prev]);
      setNewTaskName("");
      setActiveTask(newTask.id);
      setView(workMode === "quick" ? "quick" : "fine-tune");
      setMode(workMode === "quick" ? "quick" : "single");
      setTaskDataMap((prev) => ({
        ...prev,
        [newTask.id]: { seeds: [], generated: [] },
      }));
    } catch (error) {
      console.error("Create task failed", error);
      setApiError("创建任务失败");
    }
  };

  const handleDeleteTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除该任务及其所有数据吗？")) {
      try {
        await apiService.deleteTask(id);
      } catch (error) {
        console.error("Delete task failed", error);
      }
      setTasks(prev => prev.filter(t => t.id !== id));
      setTaskDataMap(prev => {
        const newMap = { ...prev };
        delete newMap[id];
        return newMap;
      });
      if (activeTask === id) {
        setActiveTask("");
        setSeeds([]);
        setGeneratedData([]);
      }
    }
  };

  const clearQuickWorkspace = () => {
    setQuickImportStatus("idle");
    setQuickImportError("");
    setQuickFile(null);
    setQuickTaskKind("qa");
    setQuickRows([]);
    setQuickHeaders([]);
    setQuickColumns({
      query: undefined,
      input: undefined,
      output: undefined,
      instruction: undefined,
    });
    setQuickWarnings([]);
    setQuickRunStatus("idle");
    setQuickRunStats(null);
    setQuickGeneratedItems([]);
    setQuickInstructionTemplate("");
  };

  const handleQuickImport = async (file: File) => {
    setQuickImportStatus("parsing");
    setQuickImportError("");
    try {
      const parsed = await parseQuickTaskFile(file);
      setQuickFile({
        name: file.name,
        size: `${Math.max(1, Math.round(file.size / 1024))}KB`,
      });
      setQuickTaskKind(parsed.kind);
      setQuickRows(parsed.rows);
      setQuickHeaders(parsed.headers);
      setQuickColumns(parsed.columns);
      setQuickWarnings(parsed.warnings);
      setQuickGeneratedItems([]);
      setQuickRunStats(null);
      setQuickRunStatus("idle");
      setQuickImportStatus("ready");
    } catch (error) {
      console.error("Quick import failed", error);
      setQuickImportStatus("error");
      setQuickImportError(error instanceof Error ? error.message : "文件解析失败");
    }
  };

  const handleQuickGenerate = async () => {
    if (quickRows.length === 0) {
      setQuickImportError("请先导入文件");
      return;
    }

    const seeds = quickRows
      .map((row) => buildQuickTaskSeedText(row, quickTaskKind))
      .map((text) => text.trim())
      .filter(Boolean);

    if (seeds.length === 0) {
      setQuickImportError("没有可用于生成的有效行");
      return;
    }

    if (quickTaskKind === "instruct" && !quickInstructionTemplate.trim()) {
      setQuickImportError("指令微调模式必须填写 Instruction 模板");
      return;
    }

    try {
      setQuickRunStatus("running");
      setQuickImportError("");
      const result = await apiService.quickGenerate({
        seeds,
        type: quickTaskKind,
        target_per_seed: quickTargetPerSeed,
        filter_strength: quickFilterStrength,
        concurrency: quickConcurrency,
        instruction_template: quickTaskKind === "instruct" && quickInstructionTemplate.trim()
          ? quickInstructionTemplate.trim()
          : undefined,
      });

      const items = result.items.map((item: any) => {
        const base = {
          id: item.id || `quick-gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          seedIndex: item.seed_index,
        };
        switch (quickTaskKind) {
          case "instruct":
            return { ...base, type: "instruct" as const, instruction: item.instruction ?? "", input: item.input ?? "", output: item.output ?? "" };
          case "code":
            return { ...base, type: "code" as const, instruction: item.instruction ?? "", input: item.input ?? "", output: item.output ?? "" };
          case "multi":
            return { ...base, type: "multi" as const, conversations: item.conversations ?? [], q: "", a: "" };
          default: // qa
            return { ...base, type: "single" as const, q: item.q ?? "", a: item.a ?? "" };
        }
      });

      setQuickGeneratedItems(items);
      setQuickRunStats(result.stats);
      setQuickRunStatus("done");
    } catch (error) {
      console.error("Quick generation failed", error);
      setQuickRunStatus("idle");
      setQuickImportError(error instanceof Error ? error.message : "快速任务生成失败");
    }
  };

  const handleGeneratePreview = async () => {
    const lines = seedInput.split('\n').filter(line => line.trim() !== '');
    const newSeeds: SeedData[] = lines.map((line, index) => normalizeSeed({
      id: `seed-${Date.now()}-${index}`,
      text: line.trim(),
      status: 'pending'
    }));
    setSeeds(newSeeds);

    // Process each seed with concurrency limit of 20
    const concurrencyLimit = 20;
    const queue = [...newSeeds];
    const workers = Array.from({ length: Math.min(concurrencyLimit, queue.length) }, async () => {
      while (queue.length > 0) {
        const seed = queue.shift();
        if (seed) {
          await processSeed(seed.id, seed.text);
        }
      }
    });
    await Promise.all(workers);
  };

  const processSeed = async (id: string, text: string) => {
    setSeeds(prev => prev.map(s => s.id === id ? { ...s, status: 'processing' } : s));
    
    try {
      const businessType = mode === "instruct" ? "training" : "evaluation";
      const workMode = mode === "quick" ? "quick" : "advanced";
      const analysis = await analyzeSentence(text, {
        overallRequirement,
        styleAdjustment,
        multiTurnContext,
        businessType,
        workMode,
      });
      const expansions = await expandSeedFields(text, analysis, {
        overallRequirement,
        workMode,
        businessType,
      });
      const paraphrases = await generateParaphrases(text, analysis, {
        expansions,
        style: styleAdjustment,
        overallRequirement,
        multiTurnContext,
        workMode,
        businessType,
      });
      
      let qa: SeedData["qa"] = { q1: "", a1: "", q2: "", a2: "" };
      let instruct: SeedData["instruct"] = { query: "", instruct: "" };

      if (mode === 'multi') {
        qa = await generateQA(text, {
          context: multiTurnContext,
          overallRequirement,
          styleAdjustment,
        });
      } else if (mode === 'instruct') {
        instruct = await generateInstruct(text, {
          context: multiTurnContext,
          overallRequirement,
          styleAdjustment,
        });
      }

      setSeeds(prev => prev.map(s => s.id === id ? { 
        ...s, 
        analysis, 
        expansions,
        selectedExpansions: expansions,
        paraphrases, 
        qa, 
        instruct,
        expansionStatus: 'idle',
        paraphraseStatus: 'idle',
        status: 'completed' 
      } : s));
    } catch (error) {
      console.error("Error processing seed:", error);
      addToast(error instanceof Error ? error.message : '句子解析失败');
      setSeeds(prev => prev.map(s => s.id === id ? { ...s, status: 'pending' } : s));
    }
  };

  const handleRegenerateParaphrase = async (id: string, styleInput?: string) => {
    const seed = seeds.find(s => s.id === id);
    if (!seed) return;

    try {
      const nextStyle = (styleInput ?? seed.styleAdjustmentDraft ?? "").trim();
      setSeeds(prev => prev.map(s => s.id === id ? {
        ...s,
        paraphraseStatus: 'processing',
        appliedStyleAdjustment: nextStyle || s.appliedStyleAdjustment || "",
        styleAdjustmentHistory: nextStyle
          ? [nextStyle, ...(s.styleAdjustmentHistory || []).filter(item => item !== nextStyle)].slice(0, 3)
          : (s.styleAdjustmentHistory || []),
      } : s));
      const paraphrases = await generateParaphrases(seed.text, seed.analysis, {
        expansions: seed.selectedExpansions,
        style: nextStyle || seed.appliedStyleAdjustment || styleAdjustment,
        overallRequirement,
        multiTurnContext,
        workMode: mode === "quick" ? "quick" : "advanced",
        businessType: mode === "instruct" ? "training" : "evaluation",
      });
      setSeeds(prev => prev.map(s => s.id === id ? {
        ...s,
        paraphrases: [...(s.paraphrases || []), ...paraphrases],
        paraphraseStatus: 'idle',
        appliedStyleAdjustment: nextStyle || s.appliedStyleAdjustment || "",
        styleAdjustmentDraft: "",
        styleAdjustmentHistory: nextStyle
          ? [nextStyle, ...(s.styleAdjustmentHistory || []).filter(item => item !== nextStyle)].slice(0, 3)
          : (s.styleAdjustmentHistory || []),
      } : s));
    } catch (error) {
      console.error("Error regenerating paraphrases:", error);
      addToast(error instanceof Error ? error.message : '仿写生成失败');
      setSeeds(prev => prev.map(s => s.id === id ? {
        ...s,
        paraphraseStatus: 'idle',
      } : s));
    }
  };

  const handleUpdateSeedField = (seedId: string, section: 'analysis' | 'qa' | 'instruct', field: string, value: string) => {
    setSeeds(prev => prev.map(s => {
      if (s.id !== seedId) return s;
      
      const currentSection = s[section] || {};
      
      return {
        ...s,
        [section]: {
          ...currentSection,
          [field]: value
        }
      };
    }));
  };

  const handleUpdateSeedStyleDraft = (seedId: string, value: string) => {
    setSeeds(prev => prev.map(s => s.id === seedId ? {
      ...s,
      styleAdjustmentDraft: value,
    } : s));
  };

  const handleToggleExpansion = (seedId: string, field: 'subject' | 'action' | 'object' | 'modifiers', value: string) => {
    setSeeds((prev) => prev.map((item) => {
      if (item.id !== seedId) return item;
      const current = item.selectedExpansions[field] || [];
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      return {
        ...item,
        selectedExpansions: {
          ...item.selectedExpansions,
          [field]: next,
        },
      };
    }));
  };

  const handleExpandSeed = async (seedId: string) => {
    const seed = seeds.find((item) => item.id === seedId);
    if (!seed) return;

    try {
      setSeeds((prev) => prev.map((item) => item.id === seedId ? {
        ...item,
        expansionStatus: "processing",
      } : item));

      const generated = await expandSeedFields(seed.text, seed.analysis, {
        overallRequirement,
        styleAdjustment,
        workMode: mode === "quick" ? "quick" : "advanced",
        businessType: mode === "instruct" ? "training" : "evaluation",
      });

      setSeeds((prev) => prev.map((item) => {
        if (item.id !== seedId) return item;
        return {
          ...item,
          expansions: {
            subject: generated.subject || [],
            action: generated.action || [],
            object: generated.object || [],
            modifiers: generated.modifiers || [],
          },
          selectedExpansions: {
            subject: generated.subject || [],
            action: generated.action || [],
            object: generated.object || [],
            modifiers: generated.modifiers || [],
          },
          expansionStatus: "idle",
        };
      }));
    } catch (error) {
      console.error("Error expanding seed fields:", error);
      addToast(error instanceof Error ? error.message : 'AI扩写失败');
      setSeeds((prev) => prev.map((item) => item.id === seedId ? {
        ...item,
        expansionStatus: "idle",
        expansions: { subject: [], action: [], object: [], modifiers: [] },
        selectedExpansions: { subject: [], action: [], object: [], modifiers: [] },
      } : item));
    }
  };

  const handleCopyParaphrases = async (seedId: string) => {
    const seed = seeds.find((item) => item.id === seedId);
    if (!seed || !seed.paraphrases.length) return;

    try {
      await navigator.clipboard.writeText(seed.paraphrases.map((item) => item.text).join("\n"));
      setSeeds((prev) => prev.map((item) => item.id === seedId ? {
        ...item,
        copyMessage: `已复制 ${item.paraphrases.length} 条仿写句子`,
      } : item));
      window.setTimeout(() => {
        setSeeds((prev) => prev.map((item) => item.id === seedId ? { ...item, copyMessage: "" } : item));
      }, 1600);
    } catch (error) {
      console.error("Copy paraphrases failed", error);
      setSeeds((prev) => prev.map((item) => item.id === seedId ? {
        ...item,
        copyMessage: "复制失败，请手动复制",
      } : item));
    }
  };

  const handleExport = (format: 'json' | 'csv' | 'jsonl', items: GeneratedItem[] = generatedData) => {
    setIsExporting(true);
    apiService
      .export(activeTask || "adhoc", { format, items })
      .then((result) => {
        const mimeType = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/plain";
        const ext = format === "jsonl" ? "jsonl" : format;
        const blob = new Blob([result.content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `corpusflow_export_${Date.now()}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch((error) => {
        console.error("Export failed", error);
        setApiError("导出失败");
      })
      .finally(() => {
        setIsExporting(false);
      });
  };

  const handleClearGenerated = () => {
    if (view === "quick") {
      if (confirm("确定要清空当前快速任务已生成的结果吗？")) {
        setQuickGeneratedItems([]);
        setQuickRunStats(null);
        setQuickRunStatus("idle");
      }
      return;
    }

    if (confirm("确定要清空当前任务已生成的语料吗？")) {
      setGeneratedData([]);
      setTaskDataMap(prev => ({
        ...prev,
        [activeTask]: {
          ...prev[activeTask],
          generated: []
        }
      }));
    }
  };

  const handleDeleteGeneratedItem = (id: string) => {
    setGeneratedData(prev => prev.filter(item => item.id !== id));
  };

  const handleEditGeneratedItem = (id: string, field: 'q' | 'a', value: string) => {
    setGeneratedData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const quickSeedTexts = quickRows
    .map((row) => buildQuickTaskSeedText(row, quickTaskKind))
    .map((text) => text.trim())
    .filter(Boolean);

  const quickGroupedResults = quickGeneratedItems.reduce<Array<{
    seedIndex: number;
    items: Array<GeneratedItem & { seedIndex?: number }>;
  }>>((groups, item) => {
    const seedIndex = item.seedIndex ?? 0;
    const group = groups.find((entry) => entry.seedIndex === seedIndex);
    if (group) {
      group.items.push(item);
      return groups;
    }
    return [...groups, { seedIndex, items: [item] }];
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#12121A] text-slate-300 font-sans overflow-hidden">
      {/* Top Header */}
      <header className="h-12 border-b border-slate-800 bg-[#1A1A27] flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <div 
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => setView('home')}
          >
            <div className="w-7 h-7 bg-indigo-600 rounded flex items-center justify-center text-white group-hover:bg-indigo-500 transition-colors">
              <LayoutGrid size={18} />
            </div>
            <span className="font-bold text-base tracking-tight text-white">CorpusFlow</span>
          </div>
          <div className="h-4 w-px bg-slate-700 mx-2" />
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className={cn("cursor-pointer hover:text-indigo-400 transition-colors", view === 'home' && "text-indigo-400")} onClick={() => setView('home')}>首页</span>
            {view !== 'home' && (
              <>
                <ChevronLeft size={12} className="rotate-180" />
                <span className="text-indigo-400">
                  {view === 'fine-tune' ? '精调生成' : view === 'quick' ? '快速任务' : '任务列表'}
                </span>
              </>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {!isLoggedIn ? (
            <form onSubmit={handleLogin} className="flex items-center gap-2">
              <div className="relative">
                <User size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="用户名/邮箱"
                  value={tempEmail}
                  onChange={(e) => setTempEmail(e.target.value)}
                  autoComplete="username"
                  className="bg-slate-800 border border-slate-700 rounded px-7 py-1 text-[10px] text-white focus:outline-none focus:border-indigo-500 w-32 transition-all"
                />
              </div>
              <input 
                type="password" 
                placeholder="密码"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                autoComplete="current-password"
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-indigo-500 w-24 transition-all"
              />
              <button 
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-[10px] font-bold transition-colors"
              >
                登录
              </button>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="w-6 h-6 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400">
                  <User size={12} />
                </div>
                <span className="font-medium text-slate-200">{userEmail}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-red-400 transition-colors"
              >
                <LogOut size={14} /> 退出
              </button>
            </>
          )}
        </div>
      </header>

      {/* API Alert */}
      {apiError && (
        <div className="bg-amber-900/20 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-amber-500 text-xs font-medium">
            <AlertCircle size={14} />
            <span>{apiError}</span>
          </div>
          <button onClick={() => setApiError(null)} className="text-amber-500/50 hover:text-amber-500"><Plus size={14} className="rotate-45" /></button>
        </div>
      )}

      <main className="flex flex-1 overflow-hidden relative">
        {/* View: Home */}
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 overflow-y-auto p-12 custom-scrollbar flex flex-col items-center"
            >
              <div className="max-w-5xl w-full space-y-12">
                <div className="grid grid-cols-2 gap-8">
                  {/* Fine-tune Card */}
                  <div 
                    onClick={() => {
                      setView('fine-tune');
                      setMode('single');
                    }}
                    className="bg-[#1A1A27] border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center space-y-6 cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-600/5 transition-all group shadow-xl"
                  >
                    <div className="w-20 h-20 rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                      <Edit3 size={40} />
                    </div>
                    <div className="text-center">
                      <h2 className="text-xl font-bold text-white mb-2">精调生成</h2>
                      <p className="text-sm text-slate-500">深度解析、仿写、扩写，支持极速与高质量模式</p>
                    </div>
                  </div>

                  {/* Quick Card */}
                  <div 
                    onClick={() => {
                      clearQuickWorkspace();
                      setView('quick');
                      setMode('quick');
                    }}
                    className="bg-[#1A1A27] border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center space-y-6 cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-600/5 transition-all group shadow-xl"
                  >
                    <div className="w-20 h-20 rounded-2xl bg-emerald-600/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                      <FileText size={40} />
                    </div>
                    <div className="text-center">
                      <h2 className="text-xl font-bold text-white mb-2">快速任务</h2>
                      <p className="text-sm text-slate-500">弱编辑、重吞吐，面向大批量生成与快速筛选</p>
                    </div>
                  </div>
                </div>

                {/* Past Tasks List */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <History className="text-indigo-400" size={20} />
                      过往任务列表
                    </h3>
                    <button 
                      onClick={() => setView('task-list')}
                      className="text-sm text-slate-500 hover:text-white transition-colors"
                    >
                      查看全部任务
                    </button>
                  </div>
                  
                  <div className="bg-[#1A1A27] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="grid grid-cols-4 gap-4 p-4 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      <div className="col-span-2">任务名称</div>
                      <div>类型</div>
                      <div className="text-right">时间</div>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {tasks.slice(0, 5).map(task => (
                        <div 
                          key={task.id} 
                          onClick={() => {
                            setActiveTask(task.id);
                            const nextView = getTaskView(task);
                            setView(nextView);
                            if (nextView === 'quick') {
                              setMode('quick');
                              clearQuickWorkspace();
                            } else if (nextView === 'fine-tune' && mode === 'quick') {
                              setMode('single');
                            }
                          }}
                          className="grid grid-cols-4 gap-4 p-4 hover:bg-slate-800/30 cursor-pointer transition-colors group"
                        >
                          <div className="col-span-2 flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-slate-500 group-hover:text-indigo-400 transition-colors">
                              <FileText size={16} />
                            </div>
                            <span className="text-sm font-medium text-slate-300 group-hover:text-white">{task.name}</span>
                          </div>
                          <div className="flex items-center">
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", getTaskBadge(task).className)}>
                              {getTaskBadge(task).label}
                            </span>
                          </div>
                          <div className="flex items-center justify-end text-xs text-slate-500">
                            {task.time}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* View: Batch Task (Bulk Generation) */}
          {false && view === 'batch' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden bg-[#0F0F16]"
            >
              {/* Step 1: Upload */}
              {batchStep === 'upload' && (
                <div className="flex-1 flex flex-col items-center justify-center p-12">
                  <div 
                    onClick={() => {
                      setIsBatchImporting(true);
                      setTimeout(() => {
                        setBatchFile({ name: "批量任务数据_2026.xlsx", size: "1.2MB" });
                        setSeeds([
                          { id: '1', text: '打开空调到25度', status: 'idle' },
                          { id: '2', text: '我想听周杰伦的歌', status: 'idle' },
                          { id: '3', text: '帮我导航到最近的加油站', status: 'idle' },
                          { id: '4', text: '车窗降下一半', status: 'idle' },
                          { id: '5', text: '现在几点了', status: 'idle' },
                        ]);
                        setIsBatchImporting(false);
                        setBatchStep('config');
                      }, 1500);
                    }}
                    className="max-w-2xl w-full aspect-video border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center space-y-6 hover:border-sky-500/50 hover:bg-sky-600/5 transition-all cursor-pointer group"
                  >
                    {isBatchImporting ? (
                      <div className="flex flex-col items-center space-y-4">
                        <Loader2 size={48} className="animate-spin text-sky-400" />
                        <p className="text-lg font-medium text-slate-300">正在解析文件并检索 Query...</p>
                      </div>
                    ) : (
                      <>
                        <div className="w-20 h-20 rounded-full bg-sky-600/10 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
                          <Download size={40} className="rotate-180" />
                        </div>
                        <div className="text-center px-8">
                          <h2 className="text-2xl font-bold text-white mb-2">导入批量任务文件</h2>
                          <p className="text-slate-500">支持 .txt, .csv, .xlsx 格式。系统将自动提取首列作为种子 Query。</p>
                        </div>
                        <button className="bg-sky-600 hover:bg-sky-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-sky-500/20">
                          选择并上传文件
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Configuration (PRD Requirement) */}
              {batchStep === 'config' && batchFile && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-6 border-b border-slate-800 bg-[#1A1A27] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-sky-600/20 flex items-center justify-center text-sky-400">
                        <Settings size={20} />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white">任务配置与预览</h2>
                        <p className="text-xs text-slate-500">已成功检索到 {seeds.length} 条种子 Query，请配置生成参数</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => {
                          setBatchFile(null);
                          setBatchStep('upload');
                        }}
                        className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-bold text-slate-400 hover:text-white"
                      >
                        重新上传
                      </button>
                      <button 
                        onClick={() => {
                          setIsGenerating(true);
                          setBatchStep('running');
                          setTimeout(() => {
                            const mockGenerated: GeneratedItem[] = [];
                            seeds.forEach(s => {
                              for(let i=0; i<batchConfig.duplication; i++) {
                                mockGenerated.push({
                                  id: `g-${s.id}-${i}`,
                                  type: 'single',
                                  q: `${s.text} (变体 ${i+1})`,
                                  a: "执行成功"
                                });
                              }
                            });
                            setGeneratedData(mockGenerated);
                            setIsGenerating(false);
                            setBatchStep('result');
                          }, 3000);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2 rounded-lg text-xs font-bold shadow-lg shadow-indigo-500/20"
                      >
                        开始执行生成
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 flex overflow-hidden">
                    {/* Left: Query Preview */}
                    <div className="w-1/2 border-r border-slate-800 flex flex-col overflow-hidden">
                      <div className="p-4 border-b border-slate-800 bg-slate-800/20">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">检索到的数据预览</h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {seeds.map((seed, idx) => (
                          <div key={seed.id} className="p-3 bg-[#161621] border border-slate-800 rounded-xl flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-600 w-4">{idx + 1}</span>
                            <span className="text-xs text-slate-300">{seed.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Parameter Tuning */}
                    <div className="w-1/2 p-8 space-y-10 overflow-y-auto custom-scrollbar">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Sparkles size={16} className="text-indigo-400" />
                            生成模式调节
                          </h3>
                          <div className="flex bg-[#161621] p-1 rounded-lg border border-slate-800">
                            {['conservative', 'balanced', 'creative'].map(m => (
                              <button 
                                key={m}
                                onClick={() => setBatchConfig({...batchConfig, mode: m as any})}
                                className={cn(
                                  "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                                  batchConfig.mode === m ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-300"
                                )}
                              >
                                {m === 'conservative' ? '保守' : m === 'balanced' ? '平衡' : '创意'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Generalization Slider */}
                        <div className="space-y-4">
                          <div className="flex justify-between items-end">
                            <div>
                              <h4 className="text-xs font-bold text-slate-300">泛化程度 (Generalization)</h4>
                              <p className="text-[10px] text-slate-500 mt-1">控制 AI 偏离原始语义的程度，数值越高句式变化越大</p>
                            </div>
                            <span className="text-lg font-black text-indigo-400">{batchConfig.generalization}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={batchConfig.generalization}
                            onChange={(e) => setBatchConfig({...batchConfig, generalization: parseInt(e.target.value)})}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                          <div className="flex justify-between text-[10px] text-slate-600 font-bold">
                            <span>同义替换</span>
                            <span>场景重构</span>
                          </div>
                        </div>

                        {/* Duplication Slider */}
                        <div className="space-y-4">
                          <div className="flex justify-between items-end">
                            <div>
                              <h4 className="text-xs font-bold text-slate-300">重复/收敛程度 (Duplication)</h4>
                              <p className="text-[10px] text-slate-500 mt-1">每条种子 Query 生成的变体数量</p>
                            </div>
                            <span className="text-lg font-black text-sky-400">x{batchConfig.duplication}</span>
                          </div>
                          <input 
                            type="range" 
                            min="1" 
                            max="10" 
                            value={batchConfig.duplication}
                            onChange={(e) => setBatchConfig({...batchConfig, duplication: parseInt(e.target.value)})}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                          />
                          <div className="flex justify-between text-[10px] text-slate-600 font-bold">
                            <span>精简生成</span>
                            <span>海量覆盖</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-indigo-600/5 border border-indigo-500/20 rounded-2xl space-y-3">
                        <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-2">
                          <AlertCircle size={14} /> 任务预估
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-[#161621] p-3 rounded-xl border border-slate-800">
                            <p className="text-[10px] text-slate-500 mb-1">预计生成总数</p>
                            <p className="text-sm font-bold text-white">{seeds.length * batchConfig.duplication} 条</p>
                          </div>
                          <div className="bg-[#161621] p-3 rounded-xl border border-slate-800">
                            <p className="text-[10px] text-slate-500 mb-1">预计消耗时长</p>
                            <p className="text-sm font-bold text-white">约 {Math.ceil(seeds.length * batchConfig.duplication / 2)} 秒</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Running */}
              {batchStep === 'running' && (
                <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                  <div className="relative">
                    <div className="w-32 h-32 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <span className="text-2xl font-black text-white">65%</span>
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-bold text-white">正在执行批量生成任务...</h2>
                    <p className="text-sm text-slate-500">正在应用泛化度 {batchConfig.generalization}% 的生成策略</p>
                  </div>
                  <div className="w-96 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: '65%' }}
                      className="h-full bg-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Result */}
              {batchStep === 'result' && batchFile && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Task Overview Header */}
                  <div className="bg-[#1A1A27] border-b border-slate-800 p-6 shrink-0">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">任务名称</span>
                          <h2 className="text-lg font-bold text-white">{tasks.find(t => t.id === activeTask)?.name || "批量生成任务"}</h2>
                        </div>
                        <div className="h-10 w-px bg-slate-800" />
                        <div className="flex items-center gap-8">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">导入文件</span>
                            <div className="flex items-center gap-2 text-sky-400 font-medium">
                              <FileText size={14} />
                              <span className="text-sm">{batchFile.name}</span>
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">数据统计</span>
                            <div className="text-sm font-medium text-slate-300">
                              种子: <span className="text-white">{seeds.length}</span> / 
                              生成: <span className="text-indigo-400">{generatedData.length}</span>
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">配置参数</span>
                            <div className="text-sm font-medium text-slate-300">
                              泛化: {batchConfig.generalization}% / 重复: x{batchConfig.duplication}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setBatchStep('config')}
                          className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                        >
                          调整参数
                        </button>
                        <button 
                          onClick={() => handleExport('csv')}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                        >
                          <Download size={14} /> 导出结果
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Seed-to-Generation Detailed List */}
                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <LayoutGrid size={16} className="text-sky-400" />
                          生成结果详细列表
                        </h3>
                      </div>

                      <div className="space-y-4">
                        {seeds.map((seed, sIdx) => (
                          <div key={seed.id} className="bg-[#1A1A27] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                            <div className="bg-slate-800/30 px-6 py-3 border-b border-slate-800 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-slate-600">0{sIdx + 1}</span>
                                <span className="text-sm font-bold text-white">{seed.text}</span>
                              </div>
                              <span className="text-[10px] text-slate-500">变体: {generatedData?.filter(g => g.id.startsWith(`g-${seed.id}`)).length || 0} 条</span>
                            </div>
                            <div className="p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {generatedData?.filter(g => g.id.startsWith(`g-${seed.id}`)).map((gen, gIdx) => (
                                <div 
                                  key={gen.id}
                                  className={cn(
                                    "p-3 rounded-xl border text-xs font-medium transition-all group relative",
                                    gIdx % 2 === 0 ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : "border-violet-500/20 bg-violet-500/5 text-violet-300"
                                  )}
                                >
                                  {gen.q}
                                  <button 
                                    onClick={() => handleDeleteGeneratedItem(gen.id)}
                                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* View: Task List (Management) */}
          {view === 'task-list' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0F0F16]"
            >
              <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setView('home')}
                      className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-all"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <h2 className="text-2xl font-bold text-white">任务列表</h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <input 
                        type="text" 
                        placeholder="搜索任务..." 
                        className="bg-[#1A1A27] border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500 transition-all w-64"
                      />
                    </div>
                    <button className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white">
                      <RotateCcw size={18} />
                    </button>
                  </div>
                </div>

                <div className="bg-[#1A1A27] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-800/30">
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">任务名称</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">任务类型</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">创建时间</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">状态</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {tasks?.map(task => (
                        <tr 
                          key={task.id} 
                          className="hover:bg-slate-800/20 transition-colors group"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 group-hover:text-indigo-400 transition-colors">
                                <FileText size={20} />
                              </div>
                              <span className="text-sm font-bold text-slate-200 group-hover:text-white">{task.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn("px-2 py-1 rounded text-[10px] font-bold uppercase", getTaskBadge(task).className)}>
                              {getTaskBadge(task).label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {task.time}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                task.status === 'completed' ? "bg-emerald-500" : "bg-orange-500 animate-pulse"
                              )} />
                              <span className="text-xs text-slate-400">{task.status === 'completed' ? '已完成' : '进行中'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => {
                                  setActiveTask(task.id);
                                  const nextView = getTaskView(task);
                                  setView(nextView);
                                  if (nextView === 'quick') {
                                    setMode('quick');
                                  } else {
                                    setMode('single');
                                  }
                                }}
                                className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-indigo-600/10 rounded-lg transition-all"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button 
                                onClick={() => handleExport('csv')}
                                className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-emerald-600/10 rounded-lg transition-all"
                              >
                                <Download size={16} />
                              </button>
                              <button 
                                onClick={(e) => handleDeleteTask(task.id, e)}
                                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-600/10 rounded-lg transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tasks.length === 0 && (
                    <div className="py-20 text-center text-slate-600">
                      暂无历史任务
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* View: Fine-tune (Existing Advanced Mode) */}
          {(view === 'fine-tune' || view === 'quick') && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 overflow-hidden"
            >
              {view === 'quick' ? (
                <QuickTaskWorkspace
                  quickImportStatus={quickImportStatus}
                  quickImportError={quickImportError}
                  quickFile={quickFile}
                  quickTaskKind={quickTaskKind}
                  quickRows={quickRows}
                  quickHeaders={quickHeaders}
                  quickColumns={quickColumns}
                  quickWarnings={quickWarnings}
                  quickTargetPerSeed={quickTargetPerSeed}
                  quickFilterStrength={quickFilterStrength}
                  quickConcurrency={quickConcurrency}
                  quickControlExpanded={quickControlExpanded}
                  quickRunStatus={quickRunStatus}
                  quickRunStats={quickRunStats}
                  quickGeneratedItems={quickGeneratedItems}
                  quickSeedTexts={quickSeedTexts}
                  quickGroupedResults={quickGroupedResults}
                  onImportFile={handleQuickImport}
                  onResetImport={clearQuickWorkspace}
                  onTaskKindChange={setQuickTaskKind}
                  onTargetPerSeedChange={setQuickTargetPerSeed}
                  onFilterStrengthChange={setQuickFilterStrength}
                  onConcurrencyChange={setQuickConcurrency}
                  onToggleControlExpanded={() => setQuickControlExpanded((value) => !value)}
                  onGenerate={handleQuickGenerate}
                  onExport={(format) => handleExport(format, quickGeneratedItems as GeneratedItem[])}
                  onClearResults={handleClearGenerated}
                  isExporting={isExporting}
                  quickInstructionTemplate={quickInstructionTemplate}
                  onInstructionTemplateChange={setQuickInstructionTemplate}
                  quickDiversity={quickDiversity}
                  onDiversityChange={setQuickDiversity}
                  quickGenerationIntent={quickGenerationIntent}
                  onGenerationIntentChange={setQuickGenerationIntent}
                />
              ) : (
                <>
              {/* Left Sidebar - Task Management */}
              <aside className={cn("border-r border-slate-800 bg-[#1A1A27] flex flex-col shrink-0 transition-all duration-300", isSidebarCollapsed ? "w-16" : "w-64")}>
                <div className={cn("p-4 border-b border-slate-800 flex items-center", isSidebarCollapsed ? "justify-center" : "justify-between")}>
                  {!isSidebarCollapsed && (
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      任务管理
                    </h2>
                  )}
                  <button 
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-all"
                  >
                    {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                  </button>
                </div>
                
                {!isSidebarCollapsed ? (
                  <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">任务名字 (可选)</label>
                <input 
                  type="text" 
                  placeholder="输入任务名字" 
                  className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none" 
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleCreateTask}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <Plus size={14} /> 新建任务
                </button>
                <button className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white"><RotateCcw size={16} /></button>
              </div>
            </div>

            <div className="space-y-2">
              {tasks.map(task => (
                <div 
                  key={task.id}
                  onClick={() => setActiveTask(task.id)}
                  className={cn(
                    "p-3 rounded-xl border transition-all cursor-pointer group relative",
                    task.id === activeTask ? "bg-indigo-600/10 border-indigo-500/50" : "bg-slate-800/30 border-slate-800 hover:border-slate-700"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-1 w-4 h-4 rounded flex items-center justify-center", task.id === activeTask ? "bg-indigo-500 text-white" : "bg-slate-700 text-slate-500")}>
                      <FileText size={10} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-bold truncate", task.id === activeTask ? "text-indigo-400" : "text-slate-300")}>{task.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-500">
                          已生成: <span className={cn("font-bold", task.id === activeTask ? "text-indigo-400" : "text-slate-600")}>
                            {task.id === activeTask ? generatedData.length : (task.status === 'completed' ? 100 : 0)}
                          </span> 条
                        </span>
                      </div>
                    </div>
                    {task.id === activeTask && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse mt-1" />}
                  </div>
                  <button 
                    onClick={(e) => handleDeleteTask(task.id, e)}
                    className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar flex flex-col items-center">
                    <button 
                      onClick={handleCreateTask}
                      className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center justify-center transition-all"
                      title="新建任务"
                    >
                      <Plus size={20} />
                    </button>
                    <div className="w-full h-px bg-slate-800" />
                    {tasks.map(task => (
                      <button 
                        key={task.id}
                        onClick={() => setActiveTask(task.id)}
                        className={cn(
                          "w-10 h-10 rounded-lg border flex items-center justify-center transition-all relative group",
                          task.id === activeTask ? "bg-indigo-600/10 border-indigo-500/50 text-indigo-400" : "bg-slate-800/30 border-slate-800 text-slate-500 hover:border-slate-700"
                        )}
                        title={task.name}
                      >
                        <FileText size={18} />
                        {task.id === activeTask && (
                          <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-orange-500 border-2 border-[#1A1A27]" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden bg-[#0F0F16]">
          {/* Left Column: Input & Config */}
          <div className="w-60 border-r border-slate-800 flex flex-col shrink-0 p-4 space-y-6 overflow-y-auto custom-scrollbar">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-2">
                  <Sparkles size={14} /> 种子语句
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">数量: {seedInput.split('\n').filter(l => l.trim()).length}</span>
                  <button className="text-[10px] font-bold text-slate-400 hover:text-white flex items-center gap-1">
                    <Download size={10} className="rotate-180" /> 导入
                  </button>
                </div>
              </div>
              <textarea 
                className="w-full h-32 bg-[#161621] border border-slate-700 rounded-xl p-3 text-xs text-slate-300 outline-none focus:border-indigo-500 transition-all resize-none font-mono"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
              />
              <p className="text-[10px] text-slate-500">每行代表一个 query，系统会自动忽略空行。</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400">整体需求描述</h3>
              <textarea 
                placeholder="一句话描述整体需求，如：生成关于导航的指令，语气自然"
                className="w-full h-24 bg-[#161621] border border-slate-700 rounded-xl p-3 text-xs text-slate-300 outline-none focus:border-indigo-500 transition-all resize-none"
                value={overallRequirement}
                onChange={(e) => setOverallRequirement(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400">构造模式</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={cn("w-4 h-4 rounded-full border flex items-center justify-center transition-all", mode === "single" ? "border-indigo-500 bg-indigo-500" : "border-slate-600")}>
                    {mode === "single" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <input type="radio" className="hidden" checked={mode === "single"} onChange={() => setMode("single")} />
                  <span className={cn("text-xs font-medium", mode === "single" ? "text-white" : "text-slate-500")}>单句模式</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={cn("w-4 h-4 rounded-full border flex items-center justify-center transition-all", mode === "instruct" ? "border-indigo-500 bg-indigo-500" : "border-slate-600")}>
                    {mode === "instruct" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <input type="radio" className="hidden" checked={mode === "instruct"} onChange={() => setMode("instruct")} />
                  <span className={cn("text-xs font-medium", mode === "instruct" ? "text-white" : "text-slate-500")}>指令微调</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={cn("w-4 h-4 rounded-full border flex items-center justify-center transition-all", mode === "multi" ? "border-indigo-500 bg-indigo-500" : "border-slate-600")}>
                    {mode === "multi" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <input type="radio" className="hidden" checked={mode === "multi"} onChange={() => setMode("multi")} />
                  <span className={cn("text-xs font-medium", mode === "multi" ? "text-white" : "text-slate-500")}>多轮问答</span>
                </label>
              </div>
              
              {(mode === "multi" || mode === "instruct") && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {mode === "multi" ? "多轮上下文描述" : "指令背景/约束"}
                  </label>
                  <textarea 
                    placeholder={mode === "multi" ? "车主询问用车相关功能如何实现" : "例如：语气要专业，包含技术细节"}
                    className="w-full h-20 bg-[#161621] border border-slate-700 rounded-xl p-3 text-xs text-slate-300 outline-none focus:border-indigo-500 transition-all resize-none"
                    value={multiTurnContext}
                    onChange={(e) => setMultiTurnContext(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="pt-4 space-y-3">
              <button 
                onClick={handleGeneratePreview}
                className="w-full bg-blue-600/20 border border-blue-500/30 text-blue-400 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-600/30 transition-all flex items-center justify-center gap-2"
              >
                <Sparkles size={14} /> 生成预览
              </button>
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] text-slate-500">任务进度: {completedSeeds}/{seeds.length} 已解析</span>
                <button 
                  onClick={handleGeneratePreview}
                  className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <RotateCcw size={10} /> 重新解析
                </button>
              </div>
              <button 
                onClick={() => setIsGenerating(true)}
                disabled={completedSeeds === 0 || isGenerating}
                className={cn(
                  "w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg",
                  completedSeeds === 0 ? "bg-slate-800 text-slate-600 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20"
                )}
              >
                <Play size={14} /> 生成语料
              </button>
            </div>
          </div>

          {/* Center Column: Processing Cards or Quick Results */}
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            {mode === 'quick' ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles size={20} className="text-emerald-400" />
                    极速生成结果
                  </h2>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-500">已生成: {generatedData.length} 条</span>
                    <button 
                      onClick={handleClearGenerated}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      清空结果
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <AnimatePresence>
                    {generatedData.map((item, idx) => (
                      <motion.div 
                        key={item.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[#1A1A27] border border-slate-800 rounded-2xl p-4 space-y-3 group relative hover:border-emerald-500/30 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-slate-700">#{generatedData.length - idx}</span>
                          <button 
                            onClick={() => handleDeleteGeneratedItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm text-white font-medium leading-relaxed">{item.q}</p>
                          <div className="h-px bg-slate-800 w-full" />
                          <p className="text-xs text-slate-500 italic">{item.a}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {generatedData.length === 0 && !isGenerating && (
                    <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-600 space-y-4">
                      <Sparkles size={48} className="opacity-20" />
                      <p>暂无生成数据，在左侧输入种子并点击开始</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-16">
                {seeds.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 py-32">
                    <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center">
                      <MessageSquare size={32} />
                    </div>
                    <p className="text-sm font-medium">输入种子语句并点击“生成预览”开始</p>
                  </div>
                ) : (
                  seeds.map((seed, idx) => (
                    <div key={seed.id} className={cn("space-y-6 pb-8 border-b border-slate-800/50 last:border-0", seed.status === 'pending' && "opacity-40 grayscale pointer-events-none")}>
                      <h2 className="text-base font-bold text-white flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs">
                          {idx + 1}
                        </span>
                        {seed.text}
                        {seed.status === 'processing' && <Loader2 size={16} className="animate-spin text-indigo-400" />}
                        <button 
                          onClick={() => processSeed(seed.id, seed.text)}
                          className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-md transition-all"
                        >
                          <RotateCcw size={16} />
                        </button>
                      </h2>
                      
                      <div className="grid grid-cols-3 gap-6 min-h-[500px]">
                        {/* Card 1: Analysis */}
                        <Card
                          title="句子解析"
                          step={1}
                          headerRight={seed.expansionStatus === 'processing' ? <Loader2 size={14} className="animate-spin text-indigo-400" /> : null}
                        >
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">意图描述</label>
                              <input 
                                type="text" 
                                value={seed.analysis?.intent || ""} 
                                onChange={(e) => handleUpdateSeedField(seed.id, 'analysis', 'intent', e.target.value)}
                                placeholder="等待生成..."
                                className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">主体</label>
                              {(seed.expansions.subject || []).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(seed.expansions.subject || []).map((item, itemIndex) => (
                                    <button
                                      key={`${seed.id}-subject-${itemIndex}`}
                                      onClick={() => handleToggleExpansion(seed.id, 'subject', item)}
                                      className={cn(
                                        "rounded-full px-2.5 py-0.5 text-[11px] transition-all",
                                        seed.selectedExpansions.subject.includes(item)
                                          ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
                                          : "bg-slate-800 text-slate-500 hover:text-slate-300"
                                      )}
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={seed.analysis?.subject || ""}
                                onChange={(e) => handleUpdateSeedField(seed.id, 'analysis', 'subject', e.target.value)}
                                placeholder="等待生成..."
                                className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">动作</label>
                              {(seed.expansions.action || []).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(seed.expansions.action || []).map((item, itemIndex) => (
                                    <button
                                      key={`${seed.id}-action-${itemIndex}`}
                                      onClick={() => handleToggleExpansion(seed.id, 'action', item)}
                                      className={cn(
                                        "rounded-full px-2.5 py-0.5 text-[11px] transition-all",
                                        seed.selectedExpansions.action.includes(item)
                                          ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-500/40"
                                          : "bg-slate-800 text-slate-500 hover:text-slate-300"
                                      )}
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={seed.analysis?.action || ""}
                                onChange={(e) => handleUpdateSeedField(seed.id, 'analysis', 'action', e.target.value)}
                                placeholder="等待生成..."
                                className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">对象</label>
                              {(seed.expansions.object || []).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(seed.expansions.object || []).map((item, itemIndex) => (
                                    <button
                                      key={`${seed.id}-object-${itemIndex}`}
                                      onClick={() => handleToggleExpansion(seed.id, 'object', item)}
                                      className={cn(
                                        "rounded-full px-2.5 py-0.5 text-[11px] transition-all",
                                        seed.selectedExpansions.object.includes(item)
                                          ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40"
                                          : "bg-slate-800 text-slate-500 hover:text-slate-300"
                                      )}
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={seed.analysis?.object || ""}
                                onChange={(e) => handleUpdateSeedField(seed.id, 'analysis', 'object', e.target.value)}
                                placeholder="等待生成..."
                                className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">修饰词</label>
                              {(seed.expansions.modifiers || []).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(seed.expansions.modifiers || []).map((item, itemIndex) => (
                                    <button
                                      key={`${seed.id}-modifiers-${itemIndex}`}
                                      onClick={() => handleToggleExpansion(seed.id, 'modifiers', item)}
                                      className={cn(
                                        "rounded-full px-2.5 py-0.5 text-[11px] transition-all",
                                        seed.selectedExpansions.modifiers.includes(item)
                                          ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40"
                                          : "bg-slate-800 text-slate-500 hover:text-slate-300"
                                      )}
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={seed.analysis?.modifiers || ""}
                                onChange={(e) => handleUpdateSeedField(seed.id, 'analysis', 'modifiers', e.target.value)}
                                placeholder="等待生成..."
                                className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                            <div className="flex gap-2 pt-2">
                              <button 
                                onClick={() => handleExpandSeed(seed.id)}
                                className="flex-1 bg-indigo-600 text-white py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-indigo-700 transition-all"
                              >
                                <Sparkles size={12} /> AI扩写
                              </button>
                              <button
                                onClick={() => handleRegenerateParaphrase(seed.id)}
                                disabled={seed.paraphraseStatus === 'processing'}
                                className="flex-1 border border-slate-700 text-slate-400 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {seed.paraphraseStatus === 'processing'
                                  ? <><Loader2 size={12} className="animate-spin" /> 生成中...</>
                                  : <><RotateCcw size={12} /> 重新生成仿写</>
                                }
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-500">先点 AI 扩写拿候选词，再点选需要启用的词条，最后重新生成仿写。</p>
                          </div>
                        </Card>

                        {/* Card 2: Paraphrase */}
                        <Card
                          title={`仿写句子（${seed.paraphrases?.length || 0}条）`}
                          step={2}
                          headerRight={(
                            <div className="flex items-center gap-3">
                              {seed.paraphraseStatus === 'processing' && <Loader2 size={14} className="animate-spin text-indigo-400" />}
                              <button
                                onClick={() => handleCopyParaphrases(seed.id)}
                                disabled={!seed.paraphrases?.length}
                                className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:text-slate-600"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          )}
                        >
                          <div className="space-y-4 flex flex-col h-full">
                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">风格微调 (您想怎样调整仿写句子)</label>
                              <div className="flex gap-2">
                                <input 
                                  type="text" 
                                  placeholder="例如：语气要正式" 
                                  className="flex-1 bg-[#161621] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none"
                                  value={seed.styleAdjustmentDraft || ""}
                                  onChange={(e) => handleUpdateSeedStyleDraft(seed.id, e.target.value)}
                                />
                                <button 
                                  onClick={() => handleRegenerateParaphrase(seed.id, seed.styleAdjustmentDraft)}
                                  disabled={seed.paraphraseStatus === 'processing'}
                                  className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                                >
                                  附加
                                </button>
                              </div>
                              {(seed.styleAdjustmentHistory?.length || 0) > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {seed.styleAdjustmentHistory?.map((item, historyIndex) => (
                                    <button
                                      key={`${seed.id}-style-${historyIndex}`}
                                      onClick={() => handleRegenerateParaphrase(seed.id, item)}
                                      className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-300 hover:bg-indigo-500/20 transition-all"
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {seed.copyMessage && <p className="text-[10px] text-emerald-400">{seed.copyMessage}</p>}
                              <p className="text-[10px] text-slate-500">注：绿色句子侧重收敛，紫色句子侧重泛化。</p>
                            </div>
                            
                            <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">
                              {(seed.paraphrases?.length || 0) === 0 ? (
                                <div className="h-full flex items-center justify-center text-slate-600 text-[10px]">等待解析完成...</div>
                              ) : (
                                seed.paraphrases?.map((p, i) => (
                                  <div key={i} className={cn(
                                    "p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-all",
                                    p.type === 'convergence' ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10" : "border-violet-500/30 bg-violet-500/5 text-violet-300 hover:bg-violet-500/10"
                                  )}>
                                    {p.text}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </Card>

                        {/* Card 3: QA or Instruct Preview */}
                        <Card
                          title={mode === 'instruct' ? "指令微调预览" : mode === 'multi' ? "多轮问答预览" : "多轮问答预览（二期）"}
                          step={3}
                          className={mode === 'single' && !isConversationPreviewExpanded ? "h-fit" : undefined}
                        >
                          {mode === 'single' && !isConversationPreviewExpanded ? (
                            <div className="space-y-3">
                              <p className="text-xs text-slate-500">单句模式下默认不展开多轮对话区域，避免占用精调空间。需要查看时再展开。</p>
                              <button
                                onClick={() => setIsConversationPreviewExpanded(true)}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 transition-all"
                              >
                                <ChevronRight size={14} /> 展开查看
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-6 flex flex-col h-full">
                              <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-1">
                              {mode === 'instruct' ? (
                                seed.instruct?.query ? (
                                  <>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">提问 (指令)</span>
                                        <button className="text-[10px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <textarea 
                                        value={seed.instruct?.query || ""}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'instruct', 'query', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg p-2 text-xs text-sky-300 outline-none focus:border-indigo-500 transition-all resize-none"
                                        rows={2}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">指令 (回答)</span>
                                        <button className="text-[10px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <textarea 
                                        value={seed.instruct?.instruct || ""}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'instruct', 'instruct', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg p-2 text-xs text-emerald-300 outline-none focus:border-indigo-500 transition-all resize-none"
                                        rows={4}
                                      />
                                    </div>
                                  </>
                                ) : (
                                  <div className="h-full flex items-center justify-center text-slate-600 text-[10px]">等待解析完成...</div>
                                )
                              ) : (
                                seed.qa?.q1 ? (
                                  <>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">问题1 (上一轮提问)</span>
                                        <button className="text-[10px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <input 
                                        type="text"
                                        value={seed.qa?.q1 || ""}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'qa', 'q1', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg px-2 py-1 text-xs text-indigo-300 outline-none focus:border-indigo-500 transition-all"
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">回答1 (上一轮回答)</span>
                                        <button className="text-[10px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <textarea 
                                        value={seed.qa.a1}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'qa', 'a1', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg p-2 text-xs text-emerald-300 outline-none focus:border-indigo-500 transition-all resize-none"
                                        rows={2}
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">问题2 (当前提问)</span>
                                        <button className="text-[10px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <input 
                                        type="text"
                                        value={seed.qa.q2}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'qa', 'q2', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg px-2 py-1 text-xs text-sky-300 outline-none focus:border-indigo-500 transition-all"
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">生成回答:</span>
                                        <button className="text-[10px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <textarea 
                                        value={seed.qa.a2}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'qa', 'a2', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg p-2 text-xs text-emerald-300 outline-none focus:border-indigo-500 transition-all resize-none"
                                        rows={3}
                                      />
                                    </div>
                                  </>
                                ) : (
                                  <div className="h-full flex items-center justify-center text-slate-600 text-[10px]">等待解析完成...</div>
                                )
                              )}
                              </div>

                              <div className="flex gap-2 pt-4 border-t border-slate-800">
                                {mode === 'single' && (
                                  <button
                                    onClick={() => setIsConversationPreviewExpanded(false)}
                                    className="border border-slate-700 text-slate-400 py-2 px-3 rounded-lg text-xs font-bold hover:bg-slate-800"
                                  >
                                    收起
                                  </button>
                                )}
                                <button className="flex-1 border border-slate-700 text-slate-400 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-800">
                                  <RotateCcw size={14} /> 重新生成
                                </button>
                                <button className="flex-1 bg-green-600 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2">
                                  <Check size={14} /> 确认使用
                                </button>
                              </div>
                            </div>
                          )}
                        </Card>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Generation Controls */}
        <aside className="w-72 border-l border-slate-800 bg-[#1A1A27] flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-orange-500 flex items-center justify-center text-[10px] font-black">4</div>
              生成控制
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">当前种子数量: {seeds.length}个</span>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">扩写倍数</label>
                  <span className="text-sm font-bold text-indigo-400">{expansionRatio}倍</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="100" 
                  value={expansionRatio} 
                  onChange={(e) => setExpansionRatio(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                  <span>1倍</span>
                  <span>100倍</span>
                </div>
                <p className="text-xs text-slate-400">预计生成数量: <span className="text-white font-bold">{seeds.length * expansionRatio}条</span></p>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => setIsGenerating(!isGenerating)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all",
                    isGenerating ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  )}
                >
                  {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {isGenerating ? "停止扩写" : "开始扩写"}
                </button>
                <button className="px-3 bg-slate-800 text-slate-400 rounded-xl hover:text-white">暂停</button>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>模式: {mode === 'quick' ? '快速任务' : mode === 'instruct' ? '指令微调' : mode === 'multi' ? '多轮问答' : '单句模式'}</span>
                <span>{isGenerating ? '生成中' : '待生成'}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => handleExport('json')}
                  disabled={isExporting || generatedData.length === 0}
                  className="bg-slate-800/50 border border-slate-700 py-2 rounded-lg text-[10px] font-bold text-slate-300 hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExporting ? <Loader2 size={12} className="animate-spin" /> : <FileJson size={12} />} JSON
                </button>
                <button 
                  onClick={() => handleExport('csv')}
                  disabled={isExporting || generatedData.length === 0}
                  className="bg-slate-800/50 border border-slate-700 py-2 rounded-lg text-[10px] font-bold text-slate-300 hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExporting ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} CSV
                </button>
              </div>

              <button 
                onClick={() => handleExport('csv')}
                disabled={isExporting || generatedData.length === 0}
                className="w-full bg-slate-800 border border-slate-700 py-2 rounded-lg text-[10px] font-bold text-slate-300 hover:bg-slate-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} 导出 CSV
              </button>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">已生成: {generatedData.length}条</h3>
                <button 
                  onClick={handleClearGenerated}
                  className="text-[10px] text-red-400/70 hover:text-red-400 flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={10} /> 清空
                </button>
              </div>
              <div className="space-y-3">
                {generatedData.map(item => (
                  <div key={item.id} className="bg-[#161621] border border-slate-800 rounded-xl p-3 space-y-2 group relative">
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                        item.type === 'single' ? "bg-sky-500/10 text-sky-300" : 
                        item.type === 'multi' ? "bg-violet-500/10 text-violet-300" : 
                        "bg-emerald-500/10 text-emerald-300"
                      )}>
                        {item.type === 'single' ? '单句' : item.type === 'multi' ? '对话' : '指令'}
                      </span>
                      <button 
                        onClick={() => handleDeleteGeneratedItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all"
                      >
                        <X size={10} />
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      <div className="space-y-0.5">
                        <p className="text-[9px] text-slate-500 font-bold uppercase">提问</p>
                        <textarea 
                          value={item.q}
                          onChange={(e) => handleEditGeneratedItem(item.id, 'q', e.target.value)}
                          className="w-full bg-transparent text-[10px] text-sky-300 leading-relaxed outline-none resize-none focus:bg-slate-800/30 rounded px-1"
                          rows={1}
                        />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[9px] text-slate-500 font-bold uppercase">回答</p>
                        <textarea 
                          value={item.a}
                          onChange={(e) => handleEditGeneratedItem(item.id, 'a', e.target.value)}
                          className="w-full bg-transparent text-[10px] text-emerald-300 leading-relaxed outline-none resize-none focus:bg-slate-800/30 rounded px-1"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {generatedData.length === 0 && (
                  <div className="py-8 text-center text-[10px] text-slate-600">
                    暂无生成数据
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
                </>
              )}
            </motion.div>
    )}
  </AnimatePresence>

      {/* Toast 通知 */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              "px-4 py-2.5 rounded-lg text-xs font-medium shadow-lg pointer-events-auto",
              toast.type === 'error'
                ? "bg-red-500/90 text-white"
                : "bg-slate-700 text-slate-200"
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
</main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2D2D3F;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3D3D5F;
        }
        
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: #6366F1;
          cursor: pointer;
          border: 2px solid #1A1A27;
        }
      `}} />
    </div>
  );
}
