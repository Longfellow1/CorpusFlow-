# CorpusFlow API 接口设计规范

## 1. 数据模型 (Data Models)

### Task (任务)
```typescript
interface Task {
  id: string;
  name: string;
  time: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  active?: boolean;
}
```

### SeedData (种子数据)
```typescript
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
  paraphrases: Array<{ text: string; type: 'convergence' | 'generalization' }>;
  qa: { q1: string; a1: string; q2: string; a2: string };
  instruct: { query: string; instruct: string };
  status: 'pending' | 'processing' | 'completed';
}
```

## 2. 核心接口定义

### 2.1 任务同步 (Sync)
- **Endpoint**: `POST /api/tasks/sync`
- **Payload**: `{ tasks: Task[], dataMap: Record<string, { seeds: SeedData[], generated: GeneratedItem[] }> }`
- **Description**: 将本地 localStorage 数据全量或增量同步至后端。

### 2.2 AI 代理接口 (AI Proxy)
- **Endpoint**: `POST /api/ai/analyze`
- **Payload**: `{ text: string }`
- **Response**: `SeedData['analysis']`
- **Note**: 后端持有 GEMINI_API_KEY，负责构造 Prompt 并调用 Gemini。

### 2.3 批量生成 (Batch Generation)
- **Endpoint**: `POST /api/generate/batch`
- **Payload**: `{ seeds: string[], config: { generalization: number, duplication: number, mode: string } }`
- **Response**: `{ taskId: string }`
- **Note**: 建议采用异步任务模式，前端通过 WebSocket 或轮询获取进度。

## 3. 前端预留修改点
在 `src/services/` 目录下，应新建 `apiService.ts`，封装基于 `fetch` 或 `axios` 的请求：

```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL;

export const apiClient = {
  async get(path: string) {
    const token = localStorage.getItem('auth_token');
    return fetch(`${API_BASE}${path}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => res.json());
  },
  // ... post, put, delete
};
```
