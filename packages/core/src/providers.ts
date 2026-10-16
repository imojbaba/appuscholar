/** Port of v1 PROVIDERS and PROV_ORDER (index.html:2556-2564). v1's browser-call warnings on DeepSeek and OpenAI are dropped in v2: the calls go through Appuscholar's server, so they work. */
export type ProviderId = "gemini" | "groq" | "deepseek" | "openrouter" | "openai" | "claude";

export type ProviderInfo = {
  name: string; short: string; model: string; fallbacks?: string[];
  keyPrefix: string; keysUrl: string; stepsHtml: string; warning?: string;
};

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    name: "Google Gemini", short: "Gemini", model: "gemini-3.8-flash", fallbacks: ["gemini-3.6-flash", "gemini-2.5-flash"],
    keyPrefix: "AIza", keysUrl: "https://aistudio.google.com/apikey",
    stepsHtml: 'Sign in with Google → <b>Get API Key</b> → <b>Create API Key</b> → copy (starts with AIza). <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Open →</a>'
  },
  groq: {
    name: "Groq", short: "Groq", model: "openai/gpt-oss-120b",
    keyPrefix: "gsk_", keysUrl: "https://console.groq.com/keys",
    stepsHtml: 'Sign up free → <b>API Keys</b> → <b>Create API Key</b> → copy (starts with gsk_). <a href="https://console.groq.com/keys" target="_blank" rel="noopener">Open →</a>'
  },
  deepseek: {
    name: "DeepSeek", short: "DeepSeek", model: "deepseek-chat",
    keyPrefix: "sk-", keysUrl: "https://platform.deepseek.com/api_keys",
    stepsHtml: 'Sign up → <b>API Keys</b> → <b>Create</b> → copy (starts with sk-). <b>Paid</b>, but very cheap — add a small credit first. <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener">Open →</a>'
  },
  openrouter: {
    name: "OpenRouter", short: "OpenRouter", model: "meta-llama/llama-3.3-70b-instruct:free",
    keyPrefix: "sk-or-", keysUrl: "https://openrouter.ai/keys",
    stepsHtml: 'Sign up → <b>Keys</b> → <b>Create Key</b> → copy (starts with sk-or-). Free models available. <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">Open →</a>'
  },
  openai: {
    name: "ChatGPT (OpenAI)", short: "ChatGPT", model: "gpt-4o-mini",
    keyPrefix: "sk-", keysUrl: "https://platform.openai.com/api-keys",
    stepsHtml: 'Sign up → <b>API keys</b> → <b>Create new secret key</b> → copy (starts with sk-). <b>Paid</b> — add billing credit first (from ~$5). <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">Open →</a>'
  },
  claude: {
    // v1 used the dated id claude-haiku-4-5-20251001; the controller ruled for the undated 5-5 id with 4-5 as fallback.
    name: "Claude (Anthropic)", short: "Claude", model: "claude-haiku-5-5", fallbacks: ["claude-haiku-4-5"],
    keyPrefix: "sk-ant-", keysUrl: "https://console.anthropic.com/settings/keys",
    stepsHtml: 'Sign up → <b>API keys</b> → <b>Create key</b> → copy (starts with sk-ant-). <b>Paid</b> — add billing credit first. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Open →</a>'
  }
};

export const PROV_ORDER: ProviderId[] = ["gemini", "groq", "deepseek", "openrouter", "openai", "claude"];
