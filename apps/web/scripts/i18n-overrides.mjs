// The v2 wording (a product decision; the terms are for the lawyer). These nine English keys replace what the v1 extraction
// produces; extract-v1-i18n.mjs applies them after extraction so re-running it keeps them.
// The v1 Hindi for the same keys no longer matches, so applyHindiDrafts replaces it with the HINDI_DRAFTS below.
// These are drafts for Dr. Sharma's review, not yet approved.
export const OVERRIDES = {
  terms_d1: "Your documents, sources and projects are saved on Appuscholar's server under your account, with every version kept, so you can open them from any device. The people who run Appuscholar can see them only to keep the service running and will not read them for any other purpose. Statistics data is encrypted with a passphrase only you know before it leaves your browser.",
  terms_d2: "Your AI key stays in this browser, or on the server locked with a passphrase only you know. When you press an AI button, the key travels with that one request to the provider you chose, is used once, and is not kept.",
  terms_d3: "When you press an AI button, the text you selected travels through Appuscholar's server straight to that provider (Google, Groq, OpenRouter, DeepSeek, OpenAI or Anthropic). Appuscholar does not keep it. The provider's own terms apply, and on a free key a provider may read or reuse what it receives. Never send names, phone numbers, roll numbers or other details that identify a participant.",
  terms_d4: "Paper search sends your search words, DOI or ORCID iD to OpenAlex, Crossref, PubMed and ORCID. The fonts and the Word and PDF tools load with the app from Appuscholar's own address, which can see your IP address, as any website can.",
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

// DRAFT — reviewed by: (pending)
// Hindi for the nine override keys, in the register of v1's Hindi (formal Hindi-medium university Hindi; "AI", "Appuscholar" and product names kept in Latin).
export const HINDI_DRAFTS = {
  terms_d1: "आपके दस्तावेज़, सन्दर्भ और प्रोजेक्ट आपके खाते के अंतर्गत Appuscholar के सर्वर पर सहेजे जाते हैं और हर संस्करण रखा जाता है, ताकि आप उन्हें किसी भी डिवाइस से खोल सकें। Appuscholar चलाने वाले लोग उन्हें केवल सेवा को चालू रखने के लिए देख सकते हैं और किसी अन्य उद्देश्य से नहीं पढ़ेंगे। सांख्यिकी का डेटा आपके ब्राउज़र से निकलने से पहले एक ऐसे पासफ़्रेज़ से एन्क्रिप्ट किया जाता है जो केवल आप जानते हैं।",
  terms_d2: "आपकी AI कुंजी इसी ब्राउज़र में रहती है, या सर्वर पर उस पासफ़्रेज़ से बंद रहती है जो केवल आप जानते हैं। जब आप किसी AI बटन को दबाते हैं, तो कुंजी उसी एक अनुरोध के साथ आपके चुने हुए प्रदाता तक जाती है, एक बार उपयोग होती है और सहेजी नहीं जाती।",
  terms_d3: "जब आप किसी AI बटन को दबाते हैं, तो आपका चुना हुआ पाठ Appuscholar के सर्वर से होकर सीधे उस प्रदाता (Google, Groq, OpenRouter, DeepSeek, OpenAI या Anthropic) तक जाता है। Appuscholar उसे सहेजकर नहीं रखता। प्रदाता की अपनी शर्तें लागू होती हैं, और मुफ़्त कुंजी पर प्रदाता जो पाठ पाता है उसे पढ़ सकता है या दोबारा उपयोग कर सकता है। नाम, फ़ोन नंबर, रोल नंबर या प्रतिभागी की पहचान कराने वाला कोई भी विवरण कभी न भेजें।",
  terms_d4: "शोध-पत्र की खोज आपके खोज-शब्द, DOI या ORCID iD को OpenAlex, Crossref, PubMed और ORCID को भेजती है। फ़ॉन्ट तथा Word और PDF के टूल ऐप के साथ Appuscholar के अपने पते से लोड होते हैं, जो किसी भी वेबसाइट की तरह आपका IP पता देख सकता है।",
  terms_ver: "संस्करण {version}, {date}।",
  welcome_intro: "लेखन और शोध में सहायक, जिसमें मनोविज्ञान शोध की सहायता पहले से जुड़ी है। आप जो कुछ लिखते हैं वह आपके खाते के अंतर्गत सहेजा जाता है।",
  faq_a_lost: "आपके दस्तावेज़ हर संस्करण के साथ आपके खाते के अंतर्गत सहेजे जाते हैं, इसलिए ब्राउज़र साफ़ करने से वे नहीं खोते। किसी भी डिवाइस पर साइन इन करके उन्हें पाएँ। कोई दस्तावेज़ न दिखे तो दस्तावेज़ सूची और शोध प्रोजेक्ट्स देखें, फिर हमें लिखें।",
  faq_a_key: "आपकी AI कुंजी इसी ब्राउज़र में रखी जाती है, या आपके खाते के अंतर्गत आपके पासफ़्रेज़ से बंद रहती है। ऐप कहे कि कोई कुंजी नहीं है, तो <b>⚙ AI प्रदाता / कुंजी</b> खोलें और उसे फिर से पेस्ट करें।",
  sap_desc: "शोध प्रोजेक्ट यह दर्ज करते हैं कि कोई कार्य किस चरण पर है, ताकि ऐप आपको सही टूल तक पहुँचा सके। खुला हुआ दस्तावेज़ प्रोजेक्ट में चला जाता है; आपके बाक़ी दस्तावेज़ स्क्रैच स्पेस में रहते हैं।"
};

/** Returns a copy of the Hindi dictionary with the draft Hindi wording written over the nine overridden keys. */
export function applyHindiDrafts(hi) {
  return { ...hi, ...HINDI_DRAFTS };
}
