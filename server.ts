import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const DATA_DIR = path.join(process.cwd(), "data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const JWT_SECRET = process.env.JWT_SECRET || "corpusflow-dev-secret-change-in-prod";
const JWT_EXPIRES_IN = "7d";
let ALGORITHM_BASE = process.env.ALGORITHM_BASE_URL || "http://127.0.0.1:8001";

async function resolveAlgorithmBase(): Promise<string> {
  if (process.env.ALGORITHM_BASE_URL) return process.env.ALGORITHM_BASE_URL;
  const portFile = path.join(DATA_DIR, "algorithm.port");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (fs.existsSync(portFile)) {
      const port = fs.readFileSync(portFile, "utf-8").trim();
      if (port && !isNaN(Number(port))) return `http://127.0.0.1:${port}`;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return "http://127.0.0.1:8001";
}
const PORT = Number(process.env.PORT || 3000);

type Task = {
  id: string;
  userId: string;
  name: string;
  time: string;
  status: "running" | "completed" | "idle";
  active?: boolean;
  businessType?: "evaluation" | "training";
  workMode?: "quick" | "advanced";
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2));
  }
}

function readJsonFile<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(file: string, value: unknown) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function escapeCsvField(val: unknown): string {
  const s = String(val ?? "");
  // 防公式注入：以 = + - @ 开头的加前缀单引号
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  // RFC 4180：含逗号、双引号、换行的字段用双引号包裹，内部双引号翻倍
  return `"${safe.replace(/"/g, '""')}"`;
}

const fileLocks = new Map<string, Promise<void>>();

async function writeJsonFileLocked(file: string, value: unknown): Promise<void> {
  const prev = fileLocks.get(file) ?? Promise.resolve();
  let resolve!: () => void;
  const current = new Promise<void>((r) => { resolve = r; });
  fileLocks.set(file, current);
  await prev;
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } finally {
    resolve();
    if (fileLocks.get(file) === current) fileLocks.delete(file);
  }
}

function getUserIdFromAuth(req: express.Request): string {
  const auth = req.headers.authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return "guest@example.com";
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return payload.sub;
  } catch {
    return "guest@example.com";
  }
}

function listTasks(userId: string) {
  const tasks = readJsonFile<Task[]>(TASKS_FILE, []);
  return tasks.filter((task) => task.userId === userId);
}

function saveTasks(tasks: Task[]) {
  writeJsonFile(TASKS_FILE, tasks);
}

function getSeedFile(taskId: string) {
  return path.join(DATA_DIR, `seeds_${taskId}.json`);
}

function getGeneratedFile(taskId: string) {
  return path.join(DATA_DIR, `gen_${taskId}.json`);
}

function assertTaskOwner(taskId: string, userId: string, res: express.Response): boolean {
  const tasks = readJsonFile<Task[]>(TASKS_FILE, []);
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.userId !== userId) {
    res.status(403).json({ error: "禁止访问" });
    return false;
  }
  return true;
}

async function callAlgorithm<T>(endpoint: string, payload: unknown): Promise<T> {
  const response = await fetch(`${ALGORITHM_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Algorithm service error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function startServer() {
  ensureDataDir();
  ALGORITHM_BASE = await resolveAlgorithmBase();
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", async (_req, res) => {
    let algorithm = { ok: false, baseUrl: ALGORITHM_BASE };
    try {
      const response = await fetch(`${ALGORITHM_BASE}/health`);
      algorithm = { ok: response.ok, baseUrl: ALGORITHM_BASE };
    } catch {
      algorithm = { ok: false, baseUrl: ALGORITHM_BASE };
    }

    res.json({
      ok: true,
      services: {
        node: true,
        algorithm,
      },
    });
  });

  app.post("/api/auth/login", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "有效的 email 是必填项" });
    }
    const token = jwt.sign({ sub: email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return res.json({
      token,
      user: { id: email, email, displayName: email },
    });
  });

  app.get("/api/tasks", (req, res) => {
    const userId = getUserIdFromAuth(req);
    return res.json(listTasks(userId));
  });

  app.post("/api/tasks", (req, res) => {
    const userId = getUserIdFromAuth(req);
    const allTasks = readJsonFile<Task[]>(TASKS_FILE, []);
    const now = new Date();
    const task: Task = {
      id: `task-${Date.now()}`,
      userId,
      name: String(req.body?.name || `新任务-${now.toLocaleTimeString()}`),
      time: now.toISOString().split("T")[0],
      status: "idle",
      businessType: req.body?.businessType || "evaluation",
      workMode: req.body?.workMode || "advanced",
    };
    const updated = [
      task,
      ...allTasks.map((item) =>
        item.userId === userId ? { ...item, active: false } : item,
      ),
    ];
    saveTasks(updated);
    return res.json(task);
  });

  app.delete("/api/tasks/:id", (req, res) => {
    const userId = getUserIdFromAuth(req);
    const allTasks = readJsonFile<Task[]>(TASKS_FILE, []);
    const nextTasks = allTasks.filter(
      (task) => !(task.userId === userId && task.id === req.params.id),
    );
    saveTasks(nextTasks);
    const seedFile = getSeedFile(req.params.id);
    const genFile = getGeneratedFile(req.params.id);
    if (fs.existsSync(seedFile)) fs.unlinkSync(seedFile);
    if (fs.existsSync(genFile)) fs.unlinkSync(genFile);
    return res.json({ success: true });
  });

  app.get("/api/tasks/:taskId/seeds", (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!assertTaskOwner(req.params.taskId, userId, res)) return;
    return res.json(readJsonFile(getSeedFile(req.params.taskId), []));
  });

  app.post("/api/tasks/:taskId/seeds", async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!assertTaskOwner(req.params.taskId, userId, res)) return;

    // Validate seeds input
    const seeds = req.body;
    if (!Array.isArray(seeds)) {
      return res.status(400).json({ error: "seeds 必须是数组" });
    }
    if (seeds.length > 500) {
      return res.status(400).json({ error: "seeds 数量不能超过 500 条" });
    }

    await writeJsonFileLocked(getSeedFile(req.params.taskId), req.body);
    return res.json(req.body);
  });

  app.get("/api/tasks/:taskId/generated", (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!assertTaskOwner(req.params.taskId, userId, res)) return;
    return res.json(readJsonFile(getGeneratedFile(req.params.taskId), []));
  });

  app.post("/api/tasks/:taskId/generated", async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!assertTaskOwner(req.params.taskId, userId, res)) return;
    await writeJsonFileLocked(getGeneratedFile(req.params.taskId), req.body);
    return res.json(req.body);
  });

  app.post("/api/algorithm/analyze", async (req, res) => {
    try {
      const result = await callAlgorithm("/analyze", req.body);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务分析失败" });
    }
  });

  app.post("/api/algorithm/paraphrases", async (req, res) => {
    try {
      const result = await callAlgorithm("/paraphrases", req.body);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务仿写失败" });
    }
  });

  app.post("/api/algorithm/expand", async (req, res) => {
    try {
      const result = await callAlgorithm("/expand", req.body);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务实体扩写失败" });
    }
  });

  app.post("/api/algorithm/qa", async (req, res) => {
    try {
      const result = await callAlgorithm("/qa", req.body);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务问答生成失败" });
    }
  });

  app.post("/api/algorithm/instruct", async (req, res) => {
    try {
      const result = await callAlgorithm("/instruct", req.body);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务指令生成失败" });
    }
  });

  app.post("/api/algorithm/quick-generate", async (req, res) => {
    try {
      const result = await callAlgorithm("/quick-generate", req.body);
      return res.json(result);
    } catch (error) {
      console.error(error);
      // Surface 422 validation errors directly to the client
      const msg = error instanceof Error ? error.message : "";
      const match422 = msg.match(/Algorithm service error 422: (.*)/s);
      if (match422) {
        try {
          const detail = JSON.parse(match422[1]);
          return res.status(422).json(detail);
        } catch {
          return res.status(422).json({ error: match422[1] });
        }
      }
      return res.status(502).json({ error: "算法服务快速生成失败" });
    }
  });

  app.get("/api/algorithm/progress/:jobId", async (req, res) => {
    try {
      const response = await fetch(
        `${ALGORITHM_BASE}/progress/${req.params.jobId}`
      );
      if (!response.ok) {
        return res
          .status(response.status)
          .json({ error: "任务不存在或已清理" });
      }
      const result = await response.json();
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "无法连接算法服务" });
    }
  });

  app.post("/api/tasks/:taskId/generate", async (req, res) => {
    try {
      const result = await callAlgorithm<any>("/generate", req.body);
      writeJsonFile(getGeneratedFile(req.params.taskId), result.items);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务批量生成失败" });
    }
  });

  app.post("/api/tasks/:taskId/export", (req, res) => {
    const { format = "json", items = [] } = req.body || {};

    let content: string;
    if (format === "jsonl") {
      content = (items as any[]).map((item: any) => {
        let record: Record<string, unknown>;
        if (item.type === "multi" && item.conversations) {
          record = { conversations: item.conversations };
        } else if (item.type === "instruct" || item.type === "code") {
          record = {
            instruction: item.instruction ?? "",
            input: item.input ?? "",
            output: item.output ?? "",
          };
        } else {
          // qa / single
          record = {
            instruction: "",
            input: item.q ?? "",
            output: item.a ?? "",
          };
        }
        return JSON.stringify(record);
      }).join("\n");
    } else if (format === "csv") {
      content = "Type,Query,Response\n" +
        (items as any[]).map((item: any) =>
          [item.type, item.q ?? item.input ?? "", item.a ?? item.output ?? ""].map(escapeCsvField).join(",")
        ).join("\n");
    } else {
      // JSON export - strip metadata fields (id, seedIndex, type)
      const cleanedItems = (items as any[]).map((item: any) => {
        if (item.type === "multi" && item.conversations) {
          return { conversations: item.conversations };
        }
        if (item.type === "instruct" || item.type === "code") {
          return {
            instruction: item.instruction ?? "",
            input: item.input ?? "",
            output: item.output ?? "",
          };
        }
        // qa / single
        return {
          instruction: "",
          input: item.q ?? "",
          output: item.a ?? "",
        };
      });
      content = JSON.stringify(cleanedItems, null, 2);
    }

    res.json({
      format,
      recordCount: Array.isArray(items) ? items.length : 0,
      content,
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ["**/data/**", "**/dist/**"],
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Node backend running on http://localhost:${PORT}`);
    console.log(`Algorithm service expected at ${ALGORITHM_BASE}`);
  });
}

startServer();
