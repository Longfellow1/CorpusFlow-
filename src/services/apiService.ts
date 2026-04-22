const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin;

let authToken = "";

function getHeaders(contentType = true) {
  return {
    ...(contentType ? { "Content-Type": "application/json" } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getHeaders(options.body ? true : false),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export type ApiTask = {
  id: string;
  name: string;
  time: string;
  status: "running" | "completed" | "idle";
  active?: boolean;
  businessType?: "evaluation" | "training";
  workMode?: "quick" | "advanced";
};

export const apiService = {
  setToken(token: string) {
    authToken = token;
  },

  clearToken() {
    authToken = "";
  },

  async login(email: string, password: string) {
    return request<{ token: string; user: { email: string; id: string; displayName: string } }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
  },

  async getHealth() {
    return request("/api/health");
  },

  async getTasks() {
    return request<ApiTask[]>("/api/tasks");
  },

  async createTask(payload: {
    name: string;
    businessType?: "evaluation" | "training";
    workMode?: "quick" | "advanced";
  }) {
    return request<ApiTask>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async deleteTask(taskId: string) {
    return request<{ success: boolean }>(`/api/tasks/${taskId}`, {
      method: "DELETE",
    });
  },

  async getSeeds(taskId: string) {
    return request<any[]>(`/api/tasks/${taskId}/seeds`);
  },

  async saveSeeds(taskId: string, seeds: any[]) {
    return request<any[]>(`/api/tasks/${taskId}/seeds`, {
      method: "POST",
      body: JSON.stringify(seeds),
    });
  },

  async getGenerated(taskId: string) {
    return request<any[]>(`/api/tasks/${taskId}/generated`);
  },

  async saveGenerated(taskId: string, generated: any[]) {
    return request<any[]>(`/api/tasks/${taskId}/generated`, {
      method: "POST",
      body: JSON.stringify(generated),
    });
  },

  async generate(taskId: string, payload: any) {
    return request<{ items: any[]; meta: { count: number; mode: string } }>(
      `/api/tasks/${taskId}/generate`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  async quickGenerate(payload: {
    seeds: string[];
    type: "qa" | "multi" | "instruct" | "code";
    target_per_seed: number;
    filter_strength: "loose" | "medium" | "strict";
    concurrency?: number;
    instruction_template?: string;
  }) {
    return request<{
      items: Array<{ id?: string; seed_index?: number; q?: string; a?: string; instruction?: string; input?: string; output?: string; conversations?: Array<{ from: string; value: string }> }>;
      stats: {
        seeds_count: number;
        total_generated: number;
        total_retained: number;
        pass_rate: number;
      };
    }>("/api/algorithm/quick-generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async export(taskId: string, payload: any) {
    return request<{ format: string; recordCount: number; content: string }>(
      `/api/tasks/${taskId}/export`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },
};
