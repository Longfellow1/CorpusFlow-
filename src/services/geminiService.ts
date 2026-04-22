const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin;

async function post<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function analyzeSentence(sentence: string, context?: Record<string, unknown>) {
  return post<{
    intent: string;
    subject: string;
    action: string;
    object: string;
    modifiers: string;
  }>("/api/algorithm/analyze", { sentence, context });
}

export async function generateParaphrases(
  sentence: string,
  analysis: any,
  options?: {
    style?: string;
    overallRequirement?: string;
    multiTurnContext?: string;
    workMode?: string;
    businessType?: string;
    expansions?: {
      subject?: string[];
      action?: string[];
      object?: string[];
      modifiers?: string[];
    };
  },
) {
  return post<Array<{ text: string; type: "convergence" | "generalization" }>>(
    "/api/algorithm/paraphrases",
    { sentence, analysis, ...options },
  );
}

export async function expandSeedFields(
  sentence: string,
  analysis: any,
  options?: {
    overallRequirement?: string;
    workMode?: string;
    businessType?: string;
    styleAdjustment?: string;
  },
) {
  return post<{
    subject: string[];
    action: string[];
    object: string[];
    modifiers: string[];
  }>("/api/algorithm/expand", { sentence, analysis, ...options });
}

export async function generateQA(
  sentence: string,
  options?: { context?: string; overallRequirement?: string; styleAdjustment?: string },
) {
  return post<{ q1: string; a1: string; q2: string; a2: string }>(
    "/api/algorithm/qa",
    { sentence, ...options },
  );
}

export async function generateInstruct(
  sentence: string,
  options?: { context?: string; overallRequirement?: string; styleAdjustment?: string },
) {
  return post<{ query: string; instruct: string }>(
    "/api/algorithm/instruct",
    { sentence, ...options },
  );
}
