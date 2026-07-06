export type AiProviderId = 'openai' | 'gemini' | 'anthropic' | 'openai-compatible';

export type AiProviderPreset = {
  id: AiProviderId;
  label: string;
  endpoint: string;
  models: string[];
};

export type AiRequestPayload = {
  instructions: string;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  prompt: string;
  responseSchema: unknown;
};

export type AiProviderConfig = {
  provider: AiProviderId;
  endpoint: string;
  model: string;
  apiKey: string;
};

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    models: ['gpt-5.4-mini', 'gpt-5.5', 'gpt-5.4-nano'],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5'],
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    endpoint: 'https://api.example.com/v1',
    models: [],
  },
];

export function presetForProvider(provider: AiProviderId): AiProviderPreset {
  return AI_PROVIDER_PRESETS.find(preset => preset.id === provider) || AI_PROVIDER_PRESETS[0];
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('The AI provider returned an empty response.');
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return JSON.parse(fenced);
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('The AI provider did not return valid workflow JSON.');
  }
}

function chatMessages(payload: AiRequestPayload): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  return [
    { role: 'system', content: `${payload.instructions}\n\nReturn only JSON matching the requested workflow shape. Do not wrap it in Markdown.` },
    ...payload.messages.map(message => ({ role: message.role, content: message.text })),
    { role: 'user', content: payload.prompt },
  ];
}

function authHeaders(config: AiProviderConfig): Headers {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (config.provider === 'anthropic') {
    headers.set('x-api-key', config.apiKey);
    headers.set('anthropic-version', '2023-06-01');
  } else {
    headers.set('authorization', `Bearer ${config.apiKey}`);
  }
  return headers;
}

function extractOpenAiResponseText(payload: any): string {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  return '';
}

function geminiModelName(value: string): string {
  return value.trim().replace(/^models\//, '');
}

async function readJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AI provider returned invalid JSON: ${text.slice(0, 160)}`);
  }
}

export async function fetchAiProviderModels(config: AiProviderConfig, signal?: AbortSignal): Promise<string[]> {
  const endpoint = trimTrailingSlash(config.endpoint);
  if (!config.apiKey.trim()) throw new Error('Enter an API key before fetching models.');
  let response: Response;
  if (config.provider === 'gemini') {
    response = await fetch(`${endpoint}/models?key=${encodeURIComponent(config.apiKey)}`, { signal });
  } else {
    response = await fetch(`${endpoint}/models`, { headers: authHeaders(config), signal });
  }
  const payload = await readJsonResponse(response);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || 'Could not fetch models.');

  if (config.provider === 'gemini') {
    const models = (payload.models || [])
      .filter((model: any) => !Array.isArray(model.supportedActions) || model.supportedActions.includes('generateContent'))
      .map((model: any) => String(model.baseModelId || model.name || '').replace(/^models\//, '').trim())
      .filter((value: string) => value.length > 0);
    return [...new Set<string>(models)].sort();
  }

  const models = (payload.data || [])
    .map((model: any) => String(model.id || model.name || '').trim())
    .filter((value: string) => value.length > 0);
  return [...new Set<string>(models)].sort();
}

export async function generateCustomAiWorkflow(config: AiProviderConfig, payload: AiRequestPayload, signal?: AbortSignal): Promise<unknown> {
  const endpoint = trimTrailingSlash(config.endpoint);
  if (!endpoint) throw new Error('AI endpoint is required.');
  if (!config.model.trim()) throw new Error('Model name is required.');
  if (!config.apiKey.trim()) throw new Error('API key is required.');

  if (config.provider === 'openai') {
    const response = await fetch(`${endpoint}/responses`, {
      method: 'POST',
      headers: authHeaders(config),
      signal,
      body: JSON.stringify({
        model: config.model,
        instructions: payload.instructions,
        input: [...payload.messages.map(message => ({ role: message.role, content: message.text })), { role: 'user', content: payload.prompt }],
        max_output_tokens: 3000,
        text: { format: { type: 'json_schema', name: 'xrpl_workflow', strict: true, schema: payload.responseSchema } },
      }),
    });
    const json = await readJsonResponse(response);
    if (!response.ok) throw new Error(json?.error?.message || 'OpenAI could not generate a workflow.');
    return parseJsonFromText(extractOpenAiResponseText(json));
  }

  if (config.provider === 'gemini') {
    const response = await fetch(`${endpoint}/models/${encodeURIComponent(geminiModelName(config.model))}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: payload.instructions }] },
        contents: [
          ...payload.messages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.text }] })),
          { role: 'user', parts: [{ text: payload.prompt }] },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 3000,
        },
      }),
    });
    const json = await readJsonResponse(response);
    if (!response.ok) throw new Error(json?.error?.message || 'Gemini could not generate a workflow.');
    const text = json?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
    return parseJsonFromText(text);
  }

  if (config.provider === 'anthropic') {
    const response = await fetch(`${endpoint}/messages`, {
      method: 'POST',
      headers: authHeaders(config),
      signal,
      body: JSON.stringify({
        model: config.model,
        max_tokens: 3000,
        system: `${payload.instructions}\n\nReturn only JSON matching the requested workflow shape. Do not wrap it in Markdown.`,
        messages: [...payload.messages.map(message => ({ role: message.role, content: message.text })), { role: 'user', content: payload.prompt }],
      }),
    });
    const json = await readJsonResponse(response);
    if (!response.ok) throw new Error(json?.error?.message || 'Anthropic could not generate a workflow.');
    const text = (json?.content || []).map((part: any) => part.text || '').join('');
    return parseJsonFromText(text);
  }

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(config),
    signal,
    body: JSON.stringify({
      model: config.model,
      messages: chatMessages(payload),
      response_format: { type: 'json_object' },
      max_tokens: 3000,
    }),
  });
  const json = await readJsonResponse(response);
  if (!response.ok) throw new Error(json?.error?.message || 'The custom AI endpoint could not generate a workflow.');
  return parseJsonFromText(json?.choices?.[0]?.message?.content || '');
}
