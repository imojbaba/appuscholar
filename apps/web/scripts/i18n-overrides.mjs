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

// DRAFT — reviewed by: (pending)
// New v2 student-facing copy with no v1 equivalent (the researcher's vault, export and account deletion).
// English is the product copy; Hindi is a draft for Dr. Sharma's review, in the register of HINDI_DRAFTS above and v1's Hindi:
// पासफ़्रेज़ (bk_pass1), बंद / खोलें for locked / unlock (bk_h_open, bk_ok_open), डाउनलोड (backup_btn_full), निर्यात (cite_export_btn),
// दस्तावेज़, कुंजी, खाता, सुरक्षित, इस कंप्यूटर पर याद रखें (settings_keymode_plain), हटाएं (doc_delete_title), बैकअप.
// "Vault" is rendered as तिजोरी (plain Hindi for a strongbox), "recovery sheet" and "recovery code" as रिकवरी शीट / रिकवरी कोड.
export const V2_STRINGS = {
  vault_pill_off: { en: "Vault off", hi: "तिजोरी चालू नहीं है" },
  vault_pill_locked: { en: "Vault locked", hi: "तिजोरी बंद है" },
  vault_pill_on: { en: "Vault on", hi: "तिजोरी चालू है" },
  vault_pill_migrating: { en: "Vault: securing your documents…", hi: "तिजोरी: आपके दस्तावेज़ सुरक्षित किए जा रहे हैं…" },
  vault_setup_h2: { en: "Protect your work with a passphrase", hi: "अपने काम को पासफ़्रेज़ से सुरक्षित करें" },
  // The titles sentence (Ruling, final review): what the vault does not hide. DRAFT — its Hindi is pending review with the rest.
  vault_setup_intro: {
    en: "Your documents are saved under your account, locked so that only this passphrase opens them. Nobody at Appuscholar can read them. Titles and project names stay readable so your lists work. If you lose the passphrase and the recovery sheet, the documents cannot be recovered.",
    hi: "आपके दस्तावेज़ आपके खाते के अंतर्गत सहेजे जाते हैं और इस तरह बंद रहते हैं कि केवल यही पासफ़्रेज़ उन्हें खोलता है। Appuscholar में कोई भी उन्हें नहीं पढ़ सकता। शीर्षक और प्रोजेक्ट के नाम पढ़े जा सकते हैं, ताकि आपकी सूचियाँ काम करें। अगर आप पासफ़्रेज़ और रिकवरी शीट दोनों खो देते हैं, तो दस्तावेज़ वापस नहीं पाए जा सकते।"
  },
  vault_setup_btn: { en: "Set passphrase", hi: "पासफ़्रेज़ तय करें" },
  vault_setup_later: { en: "Not now", hi: "अभी नहीं" },
  vault_sheet_h2: { en: "Your recovery sheet", hi: "आपकी रिकवरी शीट" },
  vault_sheet_intro: {
    en: "If you forget the passphrase, this code is the only way back in. Save the file somewhere safe. Appuscholar does not keep a copy.",
    hi: "अगर आप पासफ़्रेज़ भूल जाते हैं, तो वापस भीतर आने का एकमात्र रास्ता यही कोड है। फ़ाइल को कहीं सुरक्षित रखें। Appuscholar इसकी कोई प्रति अपने पास नहीं रखता।"
  },
  vault_sheet_download: { en: "⬇ Download recovery sheet", hi: "⬇ रिकवरी शीट डाउनलोड करें" },
  vault_sheet_saved: { en: "I have saved it", hi: "मैंने इसे सहेज लिया है" },
  vault_sheet_done: { en: "Done", hi: "पूरा हुआ" },
  vault_unlock_h2: { en: "Unlock your vault", hi: "अपनी तिजोरी खोलें" },
  vault_unlock_hint: { en: "Type the passphrase that protects your documents.", hi: "अपने दस्तावेज़ों को सुरक्षित रखने वाला पासफ़्रेज़ लिखें।" },
  // Same sentence as the key lock (v1 bk_err_wrong says it differently, so this is its own key).
  vault_wrong: { en: "Wrong passphrase — nothing was unlocked. Try again.", hi: "पासफ़्रेज़ गलत है — कुछ भी नहीं खुला। फिर कोशिश करें।" },
  vault_forgot: { en: "Forgot it? Use your recovery sheet", hi: "भूल गए? अपनी रिकवरी शीट का उपयोग करें" },
  vault_recover_h2: { en: "Recover with your code", hi: "अपने कोड से वापस पाएँ" },
  vault_recover_code: { en: "Recovery code", hi: "रिकवरी कोड" },
  vault_recover_new: { en: "New passphrase", hi: "नया पासफ़्रेज़" },
  vault_recover_btn: { en: "Recover and set passphrase", hi: "वापस पाएँ और पासफ़्रेज़ तय करें" },
  vault_recover_bad: { en: "That code did not match. Check the sheet and try again.", hi: "वह कोड मेल नहीं खाया। शीट देखें और फिर कोशिश करें।" },
  vault_recovered: { en: "Vault recovered ✓ — a new recovery sheet is ready", hi: "तिजोरी वापस मिल गई ✓ — नई रिकवरी शीट तैयार है" },
  vault_change_h2: { en: "Change passphrase", hi: "पासफ़्रेज़ बदलें" },
  vault_change_old: { en: "Current passphrase", hi: "मौजूदा पासफ़्रेज़" },
  vault_change_new: { en: "New passphrase", hi: "नया पासफ़्रेज़" },
  vault_change_btn: { en: "Change", hi: "बदलें" },
  vault_changed: { en: "Passphrase changed ✓", hi: "पासफ़्रेज़ बदल गया ✓" },
  vault_migrating_n: { en: "Securing document {n} of {total}…", hi: "दस्तावेज़ {n}/{total} सुरक्षित किया जा रहा है…" },
  vault_migrated: { en: "All your documents are now locked in your vault ✓", hi: "आपके सभी दस्तावेज़ अब आपकी तिजोरी में बंद हैं ✓" },
  // The migration stopped part way (offline, locked meanwhile); it carries on when the browser is back online, at the next unlock, or from the pill. DRAFT Hindi.
  vault_migrate_fail: {
    en: "Some documents are not yet in your vault. Reconnect, or open the vault again, to finish.",
    hi: "कुछ दस्तावेज़ अभी आपकी तिजोरी में नहीं हैं। पूरा करने के लिए फिर से कनेक्ट करें, या तिजोरी दोबारा खोलें।"
  },
  vault_doc_locked: { en: "This document is locked. Unlock your vault to read it.", hi: "यह दस्तावेज़ बंद है। इसे पढ़ने के लिए अपनी तिजोरी खोलें।" },
  vault_doc_broken: { en: "This document cannot be opened on this device. Nothing was changed.", hi: "यह दस्तावेज़ इस डिवाइस पर नहीं खुल सकता। कुछ भी बदला नहीं गया।" },
  vault_save_locked: { en: "Unlock your vault to save your changes.", hi: "अपने बदलाव सहेजने के लिए अपनी तिजोरी खोलें।" },
  vault_remember: { en: "Remember on this computer", hi: "इस कंप्यूटर पर याद रखें" },
  vault_forget_q: { en: "Forget the vault on this computer?", hi: "इस कंप्यूटर पर तिजोरी को भुला दें?" },
  vault_forget_btn: { en: "Forget on this computer", hi: "इस कंप्यूटर पर भुला दें" },
  vault_forgotten: { en: "The vault is no longer remembered on this computer.", hi: "यह कंप्यूटर अब आपकी तिजोरी को याद नहीं रखता।" },
  vault_setup_fail: { en: "Could not set up the vault. Check your connection and try again.", hi: "तिजोरी तैयार नहीं हो सकी। अपना कनेक्शन जाँचें और फिर कोशिश करें।" },
  vault_change_fail: { en: "Could not change the passphrase. Check your connection and try again.", hi: "पासफ़्रेज़ नहीं बदला जा सका। अपना कनेक्शन जाँचें और फिर कोशिश करें।" },
  help_export_btn: { en: "⬇ Export all my work", hi: "⬇ मेरा सारा काम निर्यात करें" },
  export_done: { en: "Export ready ✓", hi: "निर्यात तैयार है ✓" },
  export_fail: { en: "Could not make the export. Check your connection and try again.", hi: "निर्यात नहीं बन सका। अपना कनेक्शन जाँचें और फिर कोशिश करें।" },
  // The folder in the export zip that holds the documents written outside any research project.
  export_scratch: { en: "Scratch space", hi: "स्क्रैच स्पेस" },
  help_erase_btn: { en: "Delete my account", hi: "मेरा खाता हटाएं" },
  erase_h2: { en: "Delete your account?", hi: "अपना खाता हटाएं?" },
  erase_intro: {
    en: "Everything under your account is deleted: projects, documents and their versions, keys and the AI-use log. This cannot be undone. Export first if you want a copy.",
    hi: "आपके खाते के अंतर्गत सब कुछ हटा दिया जाता है: प्रोजेक्ट, दस्तावेज़ और उनके संस्करण, कुंजियाँ और AI उपयोग का लॉग। इसे वापस नहीं किया जा सकता। प्रति चाहिए तो पहले निर्यात कर लें।"
  },
  // The word the student must type. It stays in Latin capitals in Hindi too, so the same keystrokes confirm in either language.
  erase_confirm_word: { en: "DELETE", hi: "DELETE" },
  erase_type: { en: "Type {word} to confirm", hi: "पुष्टि के लिए {word} लिखें" },
  erase_btn: { en: "Delete everything", hi: "सब कुछ हटाएं" },
  erased: { en: "Your account has been deleted.", hi: "आपका खाता हटा दिया गया है।" },
  erase_fail: { en: "Could not delete your account. Check your connection and try again.", hi: "आपका खाता नहीं हटाया जा सका। अपना कनेक्शन जाँचें और फिर कोशिश करें।" },
  import_v1_vault: { en: "Your backup is read on this computer and saved locked in your vault.", hi: "आपका बैकअप इसी कंप्यूटर पर पढ़ा जाता है और आपकी तिजोरी में बंद करके सहेजा जाता है।" },
  import_v1_progress: { en: "Importing… {n} of {total}", hi: "आयात हो रहा है… {total} में से {n}" }
};

/** Adds the v2 strings to both dictionaries. A V2 key that already exists in the v1 extraction is a collision and throws. */
export function applyV2Strings(en, hi) {
  const outEn = { ...en }, outHi = { ...hi };
  for (const [k, v] of Object.entries(V2_STRINGS)) {
    if (k in outEn || k in outHi) throw new Error(`V2 string key collides with a v1 key: ${k}`);
    outEn[k] = v.en;
    outHi[k] = v.hi;
  }
  return { en: outEn, hi: outHi };
}
