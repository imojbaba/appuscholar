// The v2 wording (a product decision; the terms are for the lawyer). These nine English keys replace what the v1 extraction
// produces; extract-v1-i18n.mjs applies them after extraction so re-running it keeps them.
// The Hindi strings for the same keys would be v1 wording that no longer matches, so they are removed from the Hindi dictionary
// (dropFromHindi): the app then shows the English v2 text until they are re-translated.
export const OVERRIDES = {
  terms_d1: "Your documents, sources and projects are saved on Appuscholar's server under your account, with every version kept, so you can open them from any device. The people who run Appuscholar can see them only to keep the service running and will not read them for any other purpose. Statistics data is encrypted with a passphrase only you know before it leaves your browser.",
  terms_d2: "Your AI key stays in this browser, or on the server locked with a passphrase only you know. When you press an AI button, the key travels with that one request to the provider you chose, is used once, and is not kept.",
  terms_d3: "When you press an AI button, the text you selected travels through Appuscholar's server straight to that provider (Google, Groq, OpenRouter, DeepSeek, OpenAI or Anthropic). Appuscholar does not keep it. The provider's own terms apply, and on a free key a provider may read or reuse what it receives. Never send names, phone numbers, roll numbers or other details that identify a participant.",
  terms_d4: "Paper search sends your search words, DOI or ORCID iD to OpenAlex, Crossref, PubMed and ORCID. The chart, Word and PDF tools load from Cloudflare, which can see your IP address, as any website can. The fonts load with the app.",
  // The version and date come from lib/terms.ts (TERMS_VERSION, TERMS_DATE), so a new version needs no dictionary edit.
  terms_ver: "Version {version}, {date}.",
  // v1 said everything stays on this computer; in v2 it is saved under the account.
  welcome_intro: "A writing and research assistant, with psychology research support built in. Everything you write is saved under your account.",
  // The v1 answers said everything and the key live only in this browser.
  faq_a_lost: "Your documents are saved under your account with every version, so clearing a browser does not lose them. Sign in on any device to find them. If a document is missing, check the Doc list and Research Projects, then write to us.",
  faq_a_key: "Your AI key is kept in this browser, or locked with your passphrase under your account. If the app says there is no key, open <b>⚙ AI Provider / Key</b> and paste it again.",
  // v1 said nothing moves; in v2 the open document moves into the project.
  sap_desc: "Research projects track which stage a piece of work is at, so the app can point you to the right tools. The open document moves into the project; your other documents stay in scratch space."
};

/** Returns a copy of the English dictionary with the overrides applied. Every override must replace an existing key. */
export function applyOverrides(en) {
  const out = { ...en };
  for (const [k, v] of Object.entries(OVERRIDES)) {
    if (!(k in out)) throw new Error(`override key not in the extraction: ${k}`);
    out[k] = v;
  }
  return out;
}

/** Returns a copy of the Hindi dictionary without the overridden keys, so tFormat falls back to the English v2 wording. */
export function dropFromHindi(hi) {
  const out = { ...hi };
  for (const k of Object.keys(OVERRIDES)) delete out[k];
  return out;
}
