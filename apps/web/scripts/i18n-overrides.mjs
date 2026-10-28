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
  // The v1 answers said everything and the key live only in this browser; the key is connected from Connect AI (first-run build spec, OJ 2026-10-27).
  faq_a_lost: "Your documents are saved under your account with every version, so clearing a browser does not lose them. Sign in on any device to find them. If a document is missing, check the Doc list and Studies, then write to us.",
  faq_a_key: "Your AI key is kept on this computer, or locked with your passphrase under your account. If the app says AI is not connected, press <b>Connect AI</b> at the top of the page and paste your key again.",
  // v1 said nothing moves; in v2 the open document moves into the project.
  sap_desc: "Studies track which stage a piece of work is at, so the app can point you to the right tools. The open document moves into the study; your other documents stay in scratch space."
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
  faq_a_lost: "आपके दस्तावेज़ हर संस्करण के साथ आपके खाते के अंतर्गत सहेजे जाते हैं, इसलिए ब्राउज़र साफ़ करने से वे नहीं खोते। किसी भी डिवाइस पर साइन इन करके उन्हें पाएँ। कोई दस्तावेज़ न दिखे तो दस्तावेज़ सूची और शोध अध्ययन देखें, फिर हमें लिखें।",
  faq_a_key: "आपकी AI कुंजी इस कंप्यूटर पर रखी जाती है, या आपके खाते के अंतर्गत आपके पासफ़्रेज़ से बंद रहती है। अगर ऐप कहे कि AI जुड़ा नहीं है, तो पेज के ऊपर <b>AI जोड़ें</b> दबाएँ और अपनी कुंजी फिर से पेस्ट करें।",
  sap_desc: "शोध अध्ययन यह दर्ज करते हैं कि कोई कार्य किस चरण पर है, ताकि ऐप आपको सही टूल तक पहुँचा सके। खुला हुआ दस्तावेज़ अध्ययन में चला जाता है; आपके बाक़ी दस्तावेज़ स्क्रैच स्पेस में रहते हैं।"
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
  // Titles are locked too (OJ, 2026-10-20, decision D3; wave B Task 5, register D-S2-40). DRAFT — its Hindi is pending review with the rest.
  vault_setup_intro: {
    en: "Your documents, their titles and your project names are saved under your account, locked so that only this passphrase opens them. Nobody at Appuscholar can read them. If you lose the passphrase and the recovery sheet, they cannot be recovered.",
    hi: "आपके दस्तावेज़, उनके शीर्षक और आपके प्रोजेक्ट के नाम आपके खाते के अंतर्गत सहेजे जाते हैं और इस तरह बंद रहते हैं कि केवल यही पासफ़्रेज़ उन्हें खोलता है। Appuscholar में कोई भी उन्हें नहीं पढ़ सकता। अगर आप पासफ़्रेज़ और रिकवरी शीट दोनों खो देते हैं, तो वे वापस नहीं पाए जा सकते।"
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
  // Idea & Feasibility while the vault is locked: the saved intake cannot be read, and what is typed waits for the unlock. DRAFT Hindi.
  vault_idea_locked: { en: "Your saved idea is locked. Unlock your vault to read it and save your changes.", hi: "आपका सहेजा हुआ विचार बंद है। इसे पढ़ने और अपने बदलाव सहेजने के लिए अपनी तिजोरी खोलें।" },
  // Idea & Feasibility while a save that lost a race to another window left an intake this device cannot open: the typed text stays on screen, unsaved, and the note tells the student to copy it. DRAFT Hindi.
  vault_idea_broken: { en: "Your saved idea could not be opened, so this window will not save over it. Copy your text somewhere safe before you close or reload this page.", hi: "आपका सहेजा हुआ विचार खुल नहीं सका, इसलिए यह विंडो उसके ऊपर कुछ सहेजेगी नहीं। इस पेज को बंद या रीलोड करने से पहले अपना लिखा हुआ टेक्स्ट कहीं सुरक्षित कॉपी कर लें।" },
  // The Citation Manager's library while the vault is locked (the library cannot be read; + Library asks for the passphrase and saves after the unlock),
  // and a stored library that does not open on this device (shown, and confirmed before the first save replaces it: ruling R16). DRAFT Hindi.
  vault_cite_locked: { en: "Your saved library is locked. Unlock your vault to read it and save your sources.", hi: "आपकी सहेजी हुई लाइब्रेरी बंद है। इसे पढ़ने और अपने स्रोत सहेजने के लिए अपनी तिजोरी खोलें।" },
  vault_cite_broken: { en: "Your saved library cannot be opened on this device. Nothing was changed.", hi: "आपकी सहेजी हुई लाइब्रेरी इस डिवाइस पर नहीं खुल सकती। कुछ भी बदला नहीं गया।" },
  vault_cite_broken_confirm: { en: "Your saved library cannot be opened on this device. Saving now replaces it. Save anyway?", hi: "आपकी सहेजी हुई लाइब्रेरी इस डिवाइस पर नहीं खुल सकती। अभी सहेजने से वह बदल जाएगी। फिर भी सहेजें?" },
  // A stored retraction or Crossref check cache that does not open on this device: a forced check asks before replacing it (ruling R16); the quiet
  // refresh on opening the tab leaves it alone. DRAFT Hindi.
  vault_check_broken_confirm: { en: "Your saved check results cannot be opened on this device. Checking now replaces them. Check anyway?", hi: "आपके सहेजे हुए जाँच परिणाम इस डिवाइस पर नहीं खुल सकते। अभी जाँचने से वे बदल जाएँगे। फिर भी जाँचें?" },
  // The Reading shelf while the vault is locked (its papers cannot be read) and a stored shelf index, paper or matrix column list that does not open on this device (shown,
  // and confirmed before the first write replaces it: ruling R16). DRAFT Hindi.
  vault_shelf_locked: { en: "Your Reading shelf is locked. Unlock your vault to read it and save your changes.", hi: "आपकी रीडिंग शेल्फ़ बंद है। इसे पढ़ने और अपने बदलाव सहेजने के लिए अपनी तिजोरी खोलें।" },
  vault_shelf_broken: { en: "Part of your saved Reading shelf cannot be opened on this device. Nothing was changed.", hi: "आपकी सहेजी हुई रीडिंग शेल्फ़ का कुछ हिस्सा इस डिवाइस पर नहीं खुल सकता। कुछ भी बदला नहीं गया।" },
  vault_shelf_broken_confirm: { en: "This part of your saved Reading shelf cannot be opened on this device. Saving now replaces it. Save anyway?", hi: "आपकी सहेजी हुई रीडिंग शेल्फ़ का यह हिस्सा इस डिवाइस पर नहीं खुल सकता। अभी सहेजने से वह बदल जाएगा। फिर भी सहेजें?" },
  // Analyse a paper: stored paper cards (the ap_notes blob) or a stored choice of the cards' columns (ap_cols) that does not open on this device, confirmed before the first write
  // replaces it (ruling R16). DRAFT Hindi.
  // …and while the stored paper cards cannot be read: locked (shown in place of the cards, nothing can be typed until the vault opens) or not openable on this device. DRAFT Hindi.
  vault_ap_locked: { en: "Your saved paper cards are locked. Unlock your vault to read them and save your changes.", hi: "आपके सहेजे हुए पेपर कार्ड बंद हैं। इन्हें पढ़ने और अपने बदलाव सहेजने के लिए अपनी तिजोरी खोलें।" },
  vault_ap_broken: { en: "Your saved paper cards cannot be opened on this device. Nothing was changed.", hi: "आपके सहेजे हुए पेपर कार्ड इस डिवाइस पर नहीं खुल सकते। कुछ भी बदला नहीं गया।" },
  vault_ap_broken_confirm: { en: "Your saved paper cards cannot be opened on this device. Saving now replaces them. Save anyway?", hi: "आपके सहेजे हुए पेपर कार्ड इस डिवाइस पर नहीं खुल सकते। अभी सहेजने से वे बदल जाएँगे। फिर भी सहेजें?" },
  vault_ap_cols_broken_confirm: { en: "Your saved choice of columns cannot be opened on this device. Saving now replaces it. Save anyway?", hi: "कॉलम का आपका सहेजा हुआ चुनाव इस डिवाइस पर नहीं खुल सकता। अभी सहेजने से वह बदल जाएगा। फिर भी सहेजें?" },
  // Reading shelf copy with no v1 sentence (v1 has no failure path for a removal, and always knows a paper's highlights): a removal the server refused, and a paper's line
  // while its blob is not read yet (the pages only). DRAFT Hindi.
  shelf_remove_fail: { en: "That paper could not be removed. Check your connection and try again.", hi: "वह पेपर हटाया नहीं जा सका। अपना कनेक्शन जाँचें और फिर कोशिश करें।" },
  shelf_pages_only: { en: "· {pagesCount} pages", hi: "· {pagesCount} पृष्ठ" },
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
  import_v1_progress: { en: "Importing… {n} of {total}", hi: "आयात हो रहा है… {total} में से {n}" },
  // O14 (Phase 3A walk): the eye on every passphrase and key field (components/ui/secret-input.tsx). DRAFT Hindi: दिखाएं / छिपाएं as in qual_show_colors_label.
  pass_show: { en: "Show passphrase", hi: "पासफ़्रेज़ दिखाएं" },
  pass_hide: { en: "Hide passphrase", hi: "पासफ़्रेज़ छिपाएं" },
  key_show: { en: "Show key", hi: "कुंजी दिखाएं" },
  key_hide: { en: "Hide key", hi: "कुंजी छिपाएं" },
  // A stage blob's save lost the race to another window three times in a row (fix wave A, Task 5; register D-S2-35): the edit is held in this window and goes
  // with the next one. DRAFT Hindi: विंडो as v1 writes it (the pop-out strings), सहेजा and बदलाव as in the drafts above.
  blob_conflict: {
    en: "This was changed in another window at the same time, so your change is not saved yet. It is kept here and saved with your next edit.",
    hi: "इसे उसी समय किसी दूसरी विंडो में बदला गया, इसलिए आपका बदलाव अभी सहेजा नहीं गया है। यह यहीं रखा है और आपके अगले बदलाव के साथ सहेजा जाएगा।"
  },
  // The one-click capture filled an entry of the same title that had no author (fix wave A, Task 8; walk fault W1, register D-S2-23) in place of adding a second one.
  // DRAFT Hindi: उद्धरण लाइब्रेरी as in cc_src_lib, पेज as in cite_bookmarklet_desc.
  cap_filled: {
    en: 'Updated "{title}" in your citation library with what this page lists.',
    hi: 'आपकी उद्धरण लाइब्रेरी में "{title}" को इस पेज पर दी गई जानकारी से अपडेट किया गया।'
  },
  // Under the one-click capture link (W1, D-S2-23): a bookmark dragged before keeps v1's code, which misses PubMed's authors, until it is dragged again.
  // DRAFT Hindi: बुकमार्क बार as in cite_bookmarklet_desc.
  cite_bookmarklet_redrag: {
    en: "Dragged this button before? Drag it to your bookmarks bar again, so it also reads PubMed's authors and the volume, issue and pages.",
    hi: "यह बटन पहले खींचा था? इसे फिर से अपने बुकमार्क बार पर खींचें, ताकि यह PubMed के लेखक और खंड, अंक और पृष्ठ भी पढ़ सके।"
  },
  // The Crossref check flags a source with no author or without its volume, issue or pages, and fills them on consent (fix wave A, Task 11; walk faults W27, W28, register D-S2-33).
  // DRAFT Hindi: Crossref in Latin letters as in the v1 rc_ strings; लेखक, खंड, अंक and पृष्ठ as in cite_bookmarklet_redrag.
  rc_missing: {
    en: "Missing here: {fields}. Crossref has them.",
    hi: "यहाँ नहीं है: {fields}। Crossref में ये हैं।"
  },
  rc_fill_btn: { en: "Fill from Crossref", hi: "Crossref से भरें" },
  rc_fill_confirm: {
    en: "Fill these from Crossref? Only empty fields change.\n\n{list}",
    hi: "इन्हें Crossref से भरें? केवल खाली खाने बदलेंगे।\n\n{list}"
  },
  rc_filled: {
    en: "Filled from Crossref. In-text citations already in your document keep their old wording; insert them again.",
    hi: "Crossref से भर दिया गया। आपके दस्तावेज़ में पहले से मौजूद इन-टेक्स्ट उद्धरण पुराने रूप में रहेंगे; उन्हें दोबारा डालें।"
  },
  // The name of the Author field in the Fill question's list ("Author: Schaefer, Ellen M.; ..."); the other three names are v1's cite_vol_label, cite_issue_label and cite_pages_label.
  rc_fld_author: { en: "Author", hi: "लेखक" },
  // Above each Ask answer and each walk-through reply in Analyse a paper: which paper it is about (fix wave A, Task 16; walk fault W20, register D-S2-30).
  // DRAFT Hindi: के बारे में.
  ap_about: { en: "About: {title}", hi: "इसके बारे में: {title}" },
  // A stage panel's loading sign while its encrypted saved work is read and opened (fix wave A, Task 18; walk fault W8, register D-S2-34). DRAFT Hindi.
  blob_loading: { en: "Opening your saved work…", hi: "आपका सहेजा हुआ काम खुल रहा है…" },
  // A sealed project or document title while the vault is locked, and one that does not open under this vault (wave B Task 5, register D-S2-40). DRAFT Hindi.
  title_locked: { en: "Locked title", hi: "बंद शीर्षक" },
  title_unreadable: { en: "This title cannot be opened", hi: "यह शीर्षक खोला नहीं जा सकता" },
  titles_unlock: { en: "Type your passphrase to see the names of your projects and documents.", hi: "अपने प्रोजेक्ट और दस्तावेज़ों के नाम देखने के लिए अपना पासफ़्रेज़ लिखें।" },
  // Wave B Task 6 (register D-S2-38): the routes, the header and the place header. Stage names are plain, with no number or emoji; Literature's tabs.
  // DRAFT Hindi throughout.
  stage_name_idea: { en: "Idea", hi: "विचार" },
  stage_name_lit: { en: "Literature", hi: "साहित्य" },
  stage_name_design: { en: "Design and ethics", hi: "डिज़ाइन और नैतिकता" },
  stage_name_collect: { en: "Collection and analysis", hi: "संग्रह और विश्लेषण" },
  stage_name_writing: { en: "Writing", hi: "लेखन" },
  stage_name_review: { en: "Review", hi: "समीक्षा" },
  tab_name_find: { en: "Find", hi: "खोजें" },
  tab_name_reading: { en: "Reading list", hi: "पढ़ने की सूची" },
  tab_name_compare: { en: "Compare", hi: "तुलना करें" },
  tab_name_citations: { en: "Citations", hi: "उद्धरण" },
  // The header (canvas Main): the vault pill while unlocked, the AI pill, Help and the account menu.
  vault_pill_yours: { en: "Vault unlocked", hi: "तिजोरी खुली है" },
  ai_pill_key: { en: "AI: {provider}, your key", hi: "AI: {provider}, आपकी कुंजी" },
  ai_pill_nokey: { en: "AI: add your key", hi: "AI: अपनी कुंजी जोड़ें" },
  hdr_help: { en: "Help", hi: "मदद" },
  hdr_account: { en: "Account", hi: "खाता" },
  acct_export: { en: "Export all my work", hi: "मेरा सारा काम निर्यात करें" },
  acct_ai: { en: "AI provider and key", hi: "AI प्रदाता और कुंजी" },
  acct_change_pass: { en: "Change passphrase", hi: "पासफ़्रेज़ बदलें" },
  acct_sign_out: { en: "Sign out", hi: "साइन आउट करें" },
  acct_erase: { en: "Delete my account", hi: "मेरा खाता हटाएं" },
  // The project switcher and the scratch space's name (as the project list names it, Task 8).
  switcher_label: { en: "Switch project", hi: "प्रोजेक्ट बदलें" },
  switcher_all: { en: "All projects", hi: "सभी प्रोजेक्ट" },
  switch_fail: { en: "Could not open that project. Try again.", hi: "वह प्रोजेक्ट नहीं खुल सका। फिर कोशिश करें।" },
  scratch_name: { en: "Documents not in a project", hi: "जो दस्तावेज़ किसी प्रोजेक्ट में नहीं हैं" },
  project_not_found: { en: "This project was not found.", hi: "यह प्रोजेक्ट नहीं मिला।" },
  // The place header: where you are, and the question strip (draft §5).
  place_crumbs: { en: "Where you are", hi: "आप कहाँ हैं" },
  place_question: { en: "Your question", hi: "आपका प्रश्न" },
  place_question_edit: { en: "Edit", hi: "बदलें" },
  place_question_none: { en: "No question yet.", hi: "अभी कोई प्रश्न नहीं।" },
  place_question_locked: { en: "Your question is locked. Enter your passphrase to see it.", hi: "आपका प्रश्न बंद है। इसे देखने के लिए अपना पासफ़्रेज़ लिखें।" },
  place_not_built: { en: "Not built yet.", hi: "अभी बना नहीं है।" },
  // The project's home, the project list and first run until Tasks 7, 8 and 9 build them.
  reading_open_pdfs: { en: "Open your PDFs", hi: "अपनी PDF खोलें" },
  // The project list and first run until Tasks 8 and 9 build them.
  projects_new: { en: "New project", hi: "नया प्रोजेक्ट" },
  projects_none: { en: "No projects yet.", hi: "अभी कोई प्रोजेक्ट नहीं।" },
  projects_finished: { en: "Finished", hi: "पूरा हुआ" },
  start_h: { en: "Start a project", hi: "प्रोजेक्ट शुरू करें" },
  start_name_label: { en: "What is your project called?", hi: "आपके प्रोजेक्ट का नाम क्या है?" },
  start_name_first: { en: "Give your project a name first.", hi: "पहले अपने प्रोजेक्ट को नाम दें।" },
  start_create: { en: "Create project", hi: "प्रोजेक्ट बनाएं" },
  start_scratch: { en: "Write without a project", hi: "बिना प्रोजेक्ट के लिखें" },
  start_fail: { en: "Could not create the project. Try again.", hi: "प्रोजेक्ट नहीं बन सका। फिर कोशिश करें।" },
  // The list's delete button names its project for a screen reader (the old dialog's aria-label). DRAFT Hindi.
  project_delete_label: { en: "Delete {name}", hi: "{name} हटाएं" },
  // Move to project in the document bar: Save as research project's move, restored (register D-S2-38). DRAFT Hindi.
  doc_move_btn: { en: "Move to project", hi: "प्रोजेक्ट में ले जाएं" },
  doc_move_h: { en: "Move this document to a project", hi: "इस दस्तावेज़ को किसी प्रोजेक्ट में ले जाएं" },
  doc_move_desc: { en: "Nothing you wrote changes. The document is filed under the project you choose, and that project opens.", hi: "आपका लिखा कुछ नहीं बदलता। दस्तावेज़ आपके चुने प्रोजेक्ट में रखा जाता है, और वह प्रोजेक्ट खुलता है।" },
  doc_move_none: { en: "You have no other open projects.", hi: "आपके पास कोई और खुला प्रोजेक्ट नहीं है।" },
  doc_move_new: { en: "New project", hi: "नया प्रोजेक्ट" },
  doc_move_unsaved: { en: "Your latest changes are not saved yet. Try again in a moment.", hi: "आपके नए बदलाव अभी सहेजे नहीं गए हैं। थोड़ी देर में फिर कोशिश करें।" },
  doc_move_fail: { en: "Could not move the document. Try again.", hi: "दस्तावेज़ नहीं ले जाया जा सका। फिर कोशिश करें।" },
  start_move_note: { en: "Your open document moves into the new project.", hi: "आपका खुला दस्तावेज़ नए प्रोजेक्ट में चला जाएगा।" },
  // Switching project while a stage's value waits for the passphrase (wave A residual, held-blobs registry).
  blob_switch_held: {
    en: "Some changes are waiting for your passphrase. They are kept and saved once you unlock.",
    hi: "कुछ बदलाव आपके पासफ़्रेज़ की प्रतीक्षा कर रहे हैं। वे रखे गए हैं और अनलॉक करते ही सहेजे जाएंगे।"
  },
  // Task 8: all projects, six states each (canvas Projects). DRAFT Hindi.
  list_title: { en: "Your projects", hi: "आपके प्रोजेक्ट" },
  list_meta: { en: "{field}. Edited {date}.", hi: "{field}। {date} बदला गया।" },
  list_meta_nofield: { en: "Edited {date}.", hi: "{date} बदला गया।" },
  list_today: { en: "today", hi: "आज" },
  list_yesterday: { en: "yesterday", hi: "कल" },
  list_stage_idea: { en: "Idea", hi: "विचार" },
  list_stage_lit: { en: "Literature", hi: "साहित्य" },
  list_stage_design: { en: "Design", hi: "डिज़ाइन" },
  list_stage_collect: { en: "Analysis", hi: "विश्लेषण" },
  list_stage_writing: { en: "Writing", hi: "लेखन" },
  list_stage_review: { en: "Review", hi: "समीक्षा" },
  list_legend: { en: "What the bars show", hi: "पट्टियाँ क्या दिखाती हैं" },
  list_legend_ready: { en: "Ready", hi: "तैयार" },
  list_legend_progress: { en: "In progress", hi: "चल रहा है" },
  list_legend_early: { en: "Started early or reopened", hi: "जल्दी शुरू हुआ या फिर से खुला" },
  list_legend_none: { en: "Not started", hi: "शुरू नहीं हुआ" },
  list_vault_on: { en: "Unlocked. Titles are locked to you.", hi: "खुला है। शीर्षक केवल आपके लिए बंद हैं।" },
  list_vault_locked: { en: "Titles are locked. Enter your passphrase to see them.", hi: "शीर्षक बंद हैं। उन्हें देखने के लिए अपना पासफ़्रेज़ लिखें।" },
  list_vault_off: { en: "Vault off. Titles are readable on the server.", hi: "तिजोरी बंद है। शीर्षक सर्वर पर पढ़े जा सकते हैं।" },
  list_unlock: { en: "Unlock", hi: "खोलें" },
  // A row's spoken summary (lib/frame/stateSummary): "Idea ready; literature and writing in progress; design started early".
  state_sum_idea: { en: "idea", hi: "विचार" },
  state_sum_lit: { en: "literature", hi: "साहित्य" },
  state_sum_design: { en: "design", hi: "डिज़ाइन" },
  state_sum_collect: { en: "analysis", hi: "विश्लेषण" },
  state_sum_writing: { en: "writing", hi: "लेखन" },
  state_sum_review: { en: "review", hi: "समीक्षा" },
  state_sum_and: { en: "{a} and {b}", hi: "{a} और {b}" },
  state_sum_ready: { en: "{stages} ready", hi: "{stages} तैयार" },
  state_sum_in_progress: { en: "{stages} in progress", hi: "{stages} चल रहा है" },
  state_sum_started_early: { en: "{stages} started early", hi: "{stages} जल्दी शुरू हुआ" },
  state_sum_reopened: { en: "{stages} reopened", hi: "{stages} फिर से खुला" },
  state_sum_none: { en: "Nothing started yet", hi: "अभी कुछ शुरू नहीं हुआ" },
  // Wave B Task 10 (register D-S2-44): the Literature place's counted tabs and suggested next lines, Writing's helpers beside the document, and a
  // stage not built yet. DRAFT Hindi.
  tab_name_count: { en: "{name} ({n})", hi: "{name} ({n})" },
  lit_suggested_next: { en: "Suggested next", hi: "आगे का सुझाव" },
  lit_next_find: { en: "Next: open your reading list and read a paper you kept.", hi: "आगे: अपनी पढ़ने की सूची खोलें और रखा हुआ कोई पेपर पढ़ें।" },
  lit_next_reading: { en: "Next: compare the papers you have read.", hi: "आगे: जो पेपर आपने पढ़े हैं उनकी तुलना करें।" },
  lit_next_compare: { en: "Next: find the gap your papers leave open, then write.", hi: "आगे: वह कमी खोजें जो आपके पेपर खुली छोड़ते हैं, फिर लिखें।" },
  lit_next_citations: { en: "Next: put your reference list in your document.", hi: "आगे: अपनी संदर्भ सूची अपने दस्तावेज़ में डालें।" },
  lit_read_a_paper: { en: "Read a paper", hi: "कोई पेपर पढ़ें" },
  writing_aside: { en: "Chat and research helpers", hi: "चैट और शोध सहायक" },
  writing_chat: { en: "Chat", hi: "चैट" },
  writing_helpers: { en: "Research helpers", hi: "शोध सहायक" },
  not_built_body: { en: "The tools for this stage come in a later release. You can plan it in your document now.", hi: "इस चरण के टूल बाद की किसी रिलीज़ में आएंगे। आप अभी अपने दस्तावेज़ में इसकी योजना बना सकते हैं।" },
  not_built_open_doc: { en: "Open my document", hi: "मेरा दस्तावेज़ खोलें" },
  // Task G2: a tab whose tool is not built yet (the stage may have others that are). DRAFT Hindi.
  not_built_tab_body: { en: "This tool comes in a later release. You can plan it in your document now.", hi: "यह टूल बाद की किसी रिलीज़ में आएगा। आप अभी अपने दस्तावेज़ में इसकी योजना बना सकते हैं।" },
  // Task G2 (stages 3 to 6, ruling R3): the tool registry's tab names, from v1's own tool names in plain words, and each tab's suggested next line
  // (draft §5). Writing's first tab, the document, is the frame's. DRAFT Hindi: अन्वेषक, पंजीकरण and नियामक मार्ग as in design_btn_*, समानता as in
  // tab_close, PPT बनाएं as in tab_slides, AI-उपयोग विवरण as in exp_part_aiuse, वाइवा as in viva_h, सांख्यिकी as in tab_stats.
  tab_name_overview: { en: "Overview", hi: "सारांश" },
  tab_name_pathway: { en: "Pathway", hi: "मार्ग" },
  tab_name_protocol: { en: "Protocol", hi: "प्रोटोकॉल" },
  tab_name_ethics: { en: "Ethics and consent", hi: "नैतिकता और सहमति" },
  tab_name_registration: { en: "Registration", hi: "पंजीकरण" },
  tab_name_investigator: { en: "Investigator", hi: "अन्वेषक" },
  tab_name_budget: { en: "Budget", hi: "बजट" },
  tab_name_aiuse: { en: "AI-use statement", hi: "AI-उपयोग विवरण" },
  tab_name_participants: { en: "Participants", hi: "प्रतिभागी" },
  tab_name_data: { en: "Statistics", hi: "सांख्यिकी" },
  tab_name_power: { en: "Sample size", hi: "नमूना आकार" },
  tab_name_charts: { en: "Charts", hi: "चार्ट" },
  tab_name_check: { en: "Check numbers", hi: "संख्याएँ जाँचें" },
  tab_name_scales: { en: "Scales", hi: "स्केल" },
  tab_name_coding: { en: "Coding", hi: "कोडिंग" },
  tab_name_document: { en: "Document", hi: "दस्तावेज़" },
  tab_name_style: { en: "My style", hi: "मेरी शैली" },
  tab_name_words: { en: "Words", hi: "शब्द" },
  tab_name_closeness: { en: "Closeness", hi: "समानता" },
  tab_name_viva: { en: "Viva", hi: "वाइवा" },
  tab_name_slides: { en: "Make PPT", hi: "PPT बनाएं" },
  design_next_overview: { en: "Next: answer the four questions under Pathway to see which approvals usually apply.", hi: "आगे: आम तौर पर कौन-सी स्वीकृतियाँ लागू होती हैं, यह देखने के लिए मार्ग में चार प्रश्नों के उत्तर दें।" },
  design_next_pathway: { en: "Next: write your protocol section by section, in your own words.", hi: "आगे: अपना प्रोटोकॉल एक-एक भाग करके, अपने शब्दों में लिखें।" },
  design_next_protocol: { en: "Next: get your ethics committee papers and consent form ready.", hi: "आगे: अपनी नैतिकता समिति के कागज़ और सहमति फॉर्म तैयार करें।" },
  design_next_ethics: { en: "Next: if your study needs registering, check what the registration form asks for.", hi: "आगे: अगर आपके अध्ययन का पंजीकरण होना है, तो देखें कि पंजीकरण फॉर्म क्या पूछता है।" },
  design_next_registration: { en: "Next: check that you meet what the ethics committee expects of an investigator.", hi: "आगे: जाँचें कि नैतिकता समिति एक अन्वेषक से जो अपेक्षा रखती है, उसे आप पूरा करते हैं।" },
  design_next_investigator: { en: "Next: estimate your budget, if a funder or your department asks for one.", hi: "आगे: अगर कोई अनुदानदाता या आपका विभाग माँगे, तो अपने बजट का अनुमान लगाएँ।" },
  design_next_budget: { en: "Next: when your plans are ready, go to Collection and analysis and collect your data.", hi: "आगे: जब आपकी योजना तैयार हो जाए, तो संग्रह और विश्लेषण में जाकर अपना डेटा एकत्र करें।" },
  design_next_aiuse: { en: "Next: build this statement last, just before you hand in, from your whole log.", hi: "आगे: यह विवरण सबसे अंत में, जमा करने से ठीक पहले, अपने पूरे लॉग से बनाएँ।" },
  collect_next_participants: { en: "Next: paste your data in Statistics; names on your list are swapped for their codes.", hi: "आगे: अपना डेटा सांख्यिकी में चिपकाएँ; आपकी सूची के नाम उनके कोड से बदल दिए जाते हैं।" },
  collect_next_data: { en: "Next: run the test that fits your data, then put its result in your document.", hi: "आगे: अपने डेटा के लिए उपयुक्त परीक्षण चलाएँ, फिर उसका परिणाम अपने दस्तावेज़ में डालें।" },
  collect_next_power: { en: "Next: put the sample size sentence in your protocol, and ask your supervisor to confirm the effect size.", hi: "आगे: नमूना आकार का वाक्य अपने प्रोटोकॉल में डालें, और प्रभाव आकार की पुष्टि अपने पर्यवेक्षक से कराएँ।" },
  collect_next_charts: { en: "Next: check your figure against its key, then insert it with its caption.", hi: "आगे: अपने चित्र को उसकी कुंजी से मिलाकर देखें, फिर उसे उसके कैप्शन के साथ डालें।" },
  collect_next_check: { en: "Next: look again at each number the check marks, and correct the ones that are wrong.", hi: "आगे: जाँच जिन संख्याओं को चिह्नित करती है, उन्हें फिर से देखें और जो गलत हैं उन्हें ठीक करें।" },
  collect_next_scales: { en: "Next: score the scale in your data, then run your test.", hi: "आगे: अपने डेटा में स्केल के अंक निकालें, फिर अपना परीक्षण चलाएँ।" },
  collect_next_coding: { en: "Next: read the passages under each code, then write up what you found.", hi: "आगे: हर कोड के अंतर्गत आए अंश पढ़ें, फिर जो पाया उसे लिखें।" },
  writing_next_style: { en: "Next: write your draft in your document, in your own voice.", hi: "आगे: अपना मसौदा अपने दस्तावेज़ में, अपनी आवाज़ में लिखें।" },
  writing_next_words: { en: "Next: when your draft reads well, go to Review and check it before you hand it in.", hi: "आगे: जब आपका मसौदा ठीक पढ़ा जाए, तो समीक्षा में जाएँ और जमा करने से पहले उसे जाँचें।" },
  review_next_closeness: { en: "Next: put each marked passage in quotation marks or rewrite it, then practise a viva question.", hi: "आगे: हर चिह्नित अंश को उद्धरण चिह्नों में रखें या फिर से लिखें, फिर वाइवा प्रश्न का अभ्यास करें।" },
  review_next_viva: { en: "Next: make your slides from your document's headings.", hi: "आगे: अपने दस्तावेज़ के शीर्षकों से अपनी स्लाइडें बनाएँ।" },
  review_next_slides: { en: "Next: download your document and hand it in yourself.", hi: "आगे: अपना दस्तावेज़ डाउनलोड करें और उसे स्वयं जमा करें।" },
  // Wave B Task 9 (register D-S2-39): first run and the Idea place (canvas Start). The four fields stay v1's idea_intake keys, so the prompt is unchanged. DRAFT Hindi.
  idea_h: { en: "What do you want to study?", hi: "आप क्या अध्ययन करना चाहते हैं?" },
  idea_hint: { en: "Write it roughly, in your own words. We will sharpen it together into a question you can actually answer.", hi: "इसे मोटे तौर पर, अपने शब्दों में लिखें। हम मिलकर इसे ऐसे प्रश्न में बदलेंगे जिसका आप सच में उत्तर दे सकें।" },
  idea_topic_lbl: { en: "Your idea", hi: "आपका विचार" },
  idea_sharpen_h: { en: "Three questions to sharpen it", hi: "इसे स्पष्ट करने के लिए तीन प्रश्न" },
  idea_resources_lbl: { en: "Who would you study, and what can you use?", hi: "आप किसका अध्ययन करेंगे, और आप क्या इस्तेमाल कर सकते हैं?" },
  idea_timeframe_lbl: { en: "How much time do you have?", hi: "आपके पास कितना समय है?" },
  idea_constraints_lbl: { en: "What limits you: approvals, rules, anything else?", hi: "आपको क्या सीमित करता है: अनुमतियाँ, नियम, या कुछ और?" },
  idea_check_btn: { en: "Check if it is doable", hi: "जाँचें कि यह संभव है या नहीं" },
  idea_checking: { en: "Checking your idea…", hi: "आपके विचार की जाँच हो रही है…" },
  idea_check_note: { en: "Uses your AI key. Takes about 10 seconds.", hi: "आपकी AI कुंजी का उपयोग करता है। लगभग 10 सेकंड लगते हैं।" },
  idea_read_label: { en: "AI read of your idea. Check it against your own judgement.", hi: "आपके विचार पर AI की राय। इसे अपने विवेक से जाँचें।" },
  idea_insert_btn: { en: "Put in my document", hi: "मेरे दस्तावेज़ में डालें" },
  idea_inserted: { en: "Inserted in your document.", hi: "आपके दस्तावेज़ में डाल दिया गया।" },
  idea_again_btn: { en: "Check again", hi: "फिर से जाँचें" },
  idea_save_title: { en: "Project name", hi: "प्रोजेक्ट का नाम" },
  idea_save_btn: { en: "Save as my project", hi: "मेरे प्रोजेक्ट के रूप में सहेजें" },
  idea_edit_btn: { en: "Edit the question", hi: "प्रश्न बदलें" },
  idea_save_after: { en: "After saving, every stage of your project is open. Most people find papers next.", hi: "सहेजने के बाद आपके प्रोजेक्ट का हर चरण खुला है। ज़्यादातर लोग इसके बाद शोध-पत्र खोजते हैं।" },
  idea_save_unchecked: { en: "You can also save it now and check it later in your project.", hi: "आप इसे अभी सहेजकर बाद में अपने प्रोजेक्ट में भी जाँच सकते हैं।" },
  // Task 7: the project home (canvas Main). DRAFT Hindi.
  home_next_h: { en: "Suggested next", hi: "आगे का सुझाव" },
  next_question: { en: "Write down what you want to study.", hi: "लिखिए कि आप क्या अध्ययन करना चाहते हैं।" },
  next_feasibility: { en: "Check whether your question is doable before you search.", hi: "खोजने से पहले जाँचें कि आपका प्रश्न संभव है या नहीं।" },
  next_find: { en: "Find papers for your question and keep the ones that fit.", hi: "अपने प्रश्न के लिए शोध-पत्र खोजें और जो सही बैठें उन्हें रखें।" },
  next_read: { en: "Read {n} more of your kept papers, then look for the gap they leave open.", hi: "अपने रखे शोध-पत्रों में से {n} और पढ़ें, फिर देखें कि वे कौन-सी कमी छोड़ते हैं।" },
  next_compare: { en: "Compare your papers side by side.", hi: "अपने शोध-पत्रों की साथ-साथ तुलना करें।" },
  next_write: { en: "Write from your papers in your document.", hi: "अपने शोध-पत्रों के आधार पर अपने दस्तावेज़ में लिखें।" },
  next_sub: { en: "Papers kept: {kept}. Read: {read}. You can work on any stage below at any time.", hi: "रखे गए शोध-पत्र: {kept}। पढ़े: {read}। आप नीचे के किसी भी चरण पर कभी भी काम कर सकते हैं।" },
  next_btn_question: { en: "Open your question", hi: "अपना प्रश्न खोलें" },
  next_btn_find: { en: "Find papers", hi: "शोध-पत्र खोजें" },
  next_btn_reading: { en: "Open reading list", hi: "पढ़ने की सूची खोलें" },
  next_btn_compare: { en: "Open Compare", hi: "तुलना खोलें" },
  next_btn_writing: { en: "Open my document", hi: "मेरा दस्तावेज़ खोलें" },
  home_q_h: { en: "Your question", hi: "आपका प्रश्न" },
  home_q_edit: { en: "Edit", hi: "बदलें" },
  home_q_people: { en: "People", hi: "लोग" },
  home_q_time: { en: "Time", hi: "समय" },
  home_q_limits: { en: "Limits", hi: "सीमाएँ" },
  home_q_field: { en: "Field", hi: "क्षेत्र" },
  home_q_unset: { en: "Not written yet", hi: "अभी लिखा नहीं गया" },
  home_verdict: { en: "Feasibility: {verdict}", hi: "संभाव्यता: {verdict}" },
  home_verdict_none: { en: "Feasibility not checked yet.", hi: "संभाव्यता अभी जाँची नहीं गई।" },
  home_stages_h: { en: "Where this project stands", hi: "यह प्रोजेक्ट कहाँ है" },
  home_stages_sub: { en: "Stages run in parallel. Reopen any finished one.", hi: "चरण साथ-साथ चलते हैं। किसी भी पूरे हुए चरण को फिर खोलें।" },
  home_tools_idea: { en: "Question, feasibility", hi: "प्रश्न, संभाव्यता" },
  home_tools_lit: { en: "Find, read, compare, cite", hi: "खोजें, पढ़ें, तुलना करें, उद्धृत करें" },
  home_tools_design: { en: "Protocol, consent, registration", hi: "प्रोटोकॉल, सहमति, पंजीकरण" },
  home_tools_collect: { en: "Data, statistics, charts, coding", hi: "डेटा, सांख्यिकी, चार्ट, कोडिंग" },
  home_tools_writing: { en: "Document, style, grammar", hi: "दस्तावेज़, शैली, व्याकरण" },
  home_tools_review: { en: "Closeness check, viva, slides", hi: "समानता जाँच, मौखिकी, स्लाइड" },
  detail_idea: { en: "Question set. Feasibility read: {verdict}.", hi: "प्रश्न तय। संभाव्यता का आकलन: {verdict}।" },
  detail_idea_unread: { en: "Question set. Feasibility not checked yet.", hi: "प्रश्न तय। संभाव्यता अभी जाँची नहीं गई।" },
  detail_idea_checked: { en: "Question set. Feasibility checked.", hi: "प्रश्न तय। संभाव्यता जाँची गई।" },
  detail_idea_none: { en: "No question yet.", hi: "अभी कोई प्रश्न नहीं।" },
  detail_lit: { en: "Papers kept: {kept}. Read: {read}. Highlights: {highlights}. Paper cards: {cards}.", hi: "रखे गए शोध-पत्र: {kept}। पढ़े: {read}। हाइलाइट: {highlights}। पेपर कार्ड: {cards}।" },
  detail_writing: { en: "Draft of {words} words", hi: "{words} शब्दों का मसौदा" },
  detail_not_built: { en: "Not built yet. You can plan it in your document.", hi: "अभी बना नहीं है। आप इसकी योजना अपने दस्तावेज़ में बना सकते हैं।" },
  state_not_started: { en: "Not started", hi: "शुरू नहीं हुआ" },
  state_started_early: { en: "Started early", hi: "जल्दी शुरू हुआ" },
  state_in_progress: { en: "In progress", hi: "चल रहा है" },
  state_ready: { en: "Ready", hi: "तैयार" },
  state_reopened: { en: "Reopened", hi: "फिर खोला गया" },
  home_act_continue: { en: "Continue", hi: "जारी रखें" },
  home_act_open: { en: "Open", hi: "खोलें" },
  home_act_reopen: { en: "Reopen", hi: "फिर खोलें" },
  home_more: { en: "More for {stage}", hi: "{stage} के लिए और" },
  home_mark_ready: { en: "Mark ready", hi: "तैयार चिह्नित करें" },
  home_mark_unready: { en: "Not ready yet", hi: "अभी तैयार नहीं" },
  home_mark_fail: { en: "Could not save that. Try again.", hi: "यह सहेजा नहीं जा सका। फिर कोशिश करें।" },
  home_out_h: { en: "Take your work out", hi: "अपना काम बाहर ले जाएँ" },
  home_out_desc: { en: "One place for every file: the document, references, your search list, reading notes and paper cards.", hi: "हर फ़ाइल के लिए एक जगह: दस्तावेज़, संदर्भ, आपकी खोज सूची, पढ़ने के नोट्स और पेपर कार्ड।" },
  home_out_btn: { en: "Export project", hi: "प्रोजेक्ट निर्यात करें" },
  home_locked: { en: "This project is locked. Enter your passphrase to open it.", hi: "यह प्रोजेक्ट बंद है। इसे खोलने के लिए अपना पासफ़्रेज़ लिखें।" },
  home_unlock: { en: "Unlock", hi: "अनलॉक करें" },
  home_load_fail: { en: "Could not load this project. Check your connection and try again.", hi: "यह प्रोजेक्ट लोड नहीं हो सका। अपना कनेक्शन जाँचें और फिर कोशिश करें।" },
  home_retry: { en: "Retry", hi: "फिर कोशिश करें" },
  // Wave B Task 13 (register D-S2-43): any place in its own window, and that window's Close. DRAFT Hindi.
  place_new_window: { en: "Open in a new window", hi: "नई विंडो में खोलें" },
  window_close: { en: "Close this window", hi: "यह विंडो बंद करें" },
  // Wave B Task 11 (register D-S2-41): the document beside any place, its Close and its width, and an insert whose document did not open. DRAFT Hindi.
  place_open_doc: { en: "Open my document", hi: "मेरा दस्तावेज़ खोलें" },
  doc_close: { en: "Close", hi: "बंद करें" },
  doc_width: { en: "Document width", hi: "दस्तावेज़ की चौड़ाई" },
  doc_close_title: { en: "Close anyway?", hi: "फिर भी बंद करें?" },
  doc_close_ask: { en: "Your last changes to {title} are not saved yet.", hi: "{title} में आपके पिछले बदलाव अभी सहेजे नहीं गए हैं।" },
  doc_close_this: { en: "this document", hi: "इस दस्तावेज़" },
  ask_stay: { en: "Stay", hi: "रुकें" },
  doc_close_anyway: { en: "Close anyway", hi: "फिर भी बंद करें" },
  insert_doc_closed: { en: "Your document did not open, so nothing was inserted.", hi: "आपका दस्तावेज़ नहीं खुला, इसलिए कुछ भी नहीं डाला गया।" },
  // Wave B Task 12 (register D-S2-42): one export place per project (canvas Export), the tools' Export links, and the labels inside the
  // project's zip. DRAFT Hindi.
  exp_title: { en: "Export: {title}", hi: "निर्यात: {title}" },
  exp_sub: {
    en: "Unlocked in your browser and saved to your computer. The files are readable, so keep them somewhere safe.",
    hi: "आपके ब्राउज़र में खोला गया और आपके कंप्यूटर पर सहेजा गया। फ़ाइलें पढ़ी जा सकती हैं, इसलिए उन्हें सुरक्षित जगह रखें।"
  },
  exp_close: { en: "Close", hi: "बंद करें" },
  exp_include: { en: "What to include", hi: "क्या शामिल करें" },
  exp_part_documents: { en: "Documents", hi: "दस्तावेज़" },
  exp_detail_documents: { en: "{name}, and every other document in this project", hi: "{name}, और इस प्रोजेक्ट का हर दूसरा दस्तावेज़" },
  exp_detail_documents_none: { en: "Every document in this project", hi: "इस प्रोजेक्ट का हर दस्तावेज़" },
  exp_format_documents: { en: "Word and HTML", hi: "Word और HTML" },
  exp_part_question: { en: "Your question and feasibility read", hi: "आपका प्रश्न और व्यवहार्यता की समीक्षा" },
  exp_detail_question: { en: "The project card and the last AI read", hi: "प्रोजेक्ट कार्ड और AI की पिछली समीक्षा" },
  exp_part_citations: { en: "Citations", hi: "उद्धरण" },
  exp_detail_citations: { en: "{n} sources, with the reference list in your chosen style", hi: "{n} स्रोत, आपकी चुनी शैली में संदर्भ सूची के साथ" },
  exp_detail_citations_unknown: { en: "Your sources, with the reference list in your chosen style", hi: "आपके स्रोत, आपकी चुनी शैली में संदर्भ सूची के साथ" },
  exp_format_citations: { en: "RIS, BibTeX, text", hi: "RIS, BibTeX, टेक्स्ट" },
  exp_part_search: { en: "Search lists", hi: "खोज सूचियाँ" },
  exp_detail_search: { en: "Papers you searched and kept, with quick reads", hi: "जो पेपर आपने खोजे और रखे, त्वरित समीक्षा के साथ" },
  exp_part_notes: { en: "Reading notes", hi: "पढ़ने के नोट्स" },
  exp_detail_notes: { en: "Highlights, your own summaries and AI summaries, marked as such", hi: "हाइलाइट, आपके अपने सारांश और AI के सारांश, अलग से चिह्नित" },
  exp_part_compare: { en: "Comparison table and paper cards", hi: "तुलना तालिका और पेपर कार्ड" },
  exp_detail_compare: { en: "Your words, paper by paper", hi: "आपके शब्द, हर पेपर के लिए" },
  exp_part_record: { en: "Writing record", hi: "लेखन रिकॉर्ड" },
  exp_detail_record: { en: "What you typed and what came from AI, per version", hi: "आपने क्या टाइप किया और AI से क्या आया, हर संस्करण में" },
  exp_part_aiuse: { en: "AI-use statement", hi: "AI-उपयोग विवरण" },
  exp_detail_aiuse: { en: "Which AI helped, for what, on which days; never your text", hi: "किस AI ने मदद की, किस काम में, किन दिनों; आपका टेक्स्ट कभी नहीं" },
  exp_part_readingBackup: { en: "Reading list backup", hi: "पढ़ने की सूची का बैकअप" },
  exp_detail_readingBackup: {
    en: "The text of your PDFs and your highlights, to move your reading list to another account",
    hi: "आपकी PDF का टेक्स्ट और आपके हाइलाइट, अपनी पढ़ने की सूची को किसी दूसरे खाते में ले जाने के लिए"
  },
  exp_format_text: { en: "Text", hi: "टेक्स्ट" },
  exp_format_csv: { en: "CSV", hi: "CSV" },
  exp_format_json: { en: "JSON", hi: "JSON" },
  exp_one_zip: { en: "One zip file.", hi: "एक zip फ़ाइल।" },
  exp_cancel: { en: "Cancel", hi: "रद्द करें" },
  exp_download: { en: "Download zip", hi: "zip डाउनलोड करें" },
  exp_all_note: {
    en: "To take every project at once, or to leave Appuscholar, use Account, Export all my work.",
    hi: "सभी प्रोजेक्ट एक साथ ले जाने, या Appuscholar छोड़ने के लिए, खाता में जाकर मेरा सारा काम निर्यात करें चुनें।"
  },
  exp_building: { en: "Building your zip: {part}. Keep this page open.", hi: "आपकी zip बन रही है: {part}। यह पेज खुला रखें।" },
  exp_locked: { en: "Unlock with your passphrase to export this project.", hi: "इस प्रोजेक्ट को निर्यात करने के लिए अपने पासफ़्रेज़ से खोलें।" },
  exp_unsaved: {
    en: "Some changes could not be saved yet, so they are not in this zip.",
    hi: "कुछ बदलाव अभी सहेजे नहीं जा सके, इसलिए वे इस zip में नहीं हैं।"
  },
  exp_link: { en: "Export", hi: "निर्यात करें" },
  acct_export_project: { en: "Export this project", hi: "यह प्रोजेक्ट निर्यात करें" },
  // Inside the zip: the reading notes' and the question's labels, and the list of what did not open.
  exp_highlights: { en: "Highlights", hi: "हाइलाइट" },
  exp_page: { en: "p. {page}", hi: "पृ. {page}" },
  exp_reflection: { en: "MY REFLECTION", hi: "मेरा चिंतन" },
  exp_ai_read: { en: "AI read:", hi: "AI की समीक्षा:" },
  exp_unreadable_head: { en: "These could not be opened, so they are not in this zip:", hi: "ये खोले नहीं जा सके, इसलिए इस zip में नहीं हैं:" },
  exp_unreadable_doc: { en: "Document: {name}", hi: "दस्तावेज़: {name}" },
  exp_unreadable_paper: { en: "Reading list paper: {name}", hi: "पढ़ने की सूची का पेपर: {name}" },
  exp_unreadable_data: { en: "Saved work: {name}", hi: "सहेजा गया काम: {name}" },
  exp_kind_shelf: { en: "Reading list", hi: "पढ़ने की सूची" },
  // B1 fix wave: text kept in this tab after its editor went away unsaved (the browser's Back), saved when the document opens again; and the
  // frame's last hard-coded English (the switch question, the workspace load failure, the project list's delete). DRAFT Hindi.
  doc_held_saved: { en: "Your unsaved changes were kept and saved.", hi: "आपके न सहेजे गए बदलाव रखे गए और सहेज दिए गए।" },
  switch_title: { en: "Switch anyway?", hi: "फिर भी बदलें?" },
  switch_unsaved: { en: "Unsaved changes in \"{title}\" may be lost.", hi: "\"{title}\" में न सहेजे गए बदलाव खो सकते हैं।" },
  switch_this_doc: { en: "this document", hi: "इस दस्तावेज़" },
  switch_anyway: { en: "Switch anyway", hi: "फिर भी बदलें" },
  frame_load_fail: { en: "Could not load your workspace.", hi: "आपका कार्यक्षेत्र लोड नहीं हो सका।" },
  list_action_fail: { en: "That did not work. Try again.", hi: "यह नहीं हो पाया। फिर कोशिश करें।" },
  list_delete_title: { en: "Delete \"{title}\" and its documents permanently?", hi: "\"{title}\" और उसके दस्तावेज़ हमेशा के लिए मिटाएँ?" },
  list_delete_desc: { en: "This cannot be undone.", hi: "इसे वापस नहीं किया जा सकता।" },
  // Task 14: the frame on a phone (canvas Phone). The header's Menu, and the way back from the document opened full screen over a place.
  hdr_menu: { en: "Menu", hi: "मेन्यू" },
  // The Menu's language item names the other language in itself: Hindi in the English interface, English in the Hindi one.
  menu_lang_other: { en: "हिन्दी", hi: "English" },
  doc_back: { en: "Back to {place}", hi: "{place} पर वापस जाएँ" },
  // Go-live Task 1: the per-user AI quota answer (minute: wait a moment; hour: minutes to wait, rounded up; day: try tomorrow). DRAFT Hindi.
  ai_quota_minute: { en: "Too many AI requests in a minute. Wait a moment and try again.", hi: "एक मिनट में AI के बहुत ज़्यादा अनुरोध हो गए हैं। थोड़ा रुकें और फिर कोशिश करें।" },
  ai_quota_day: { en: "You have used your AI calls for today. Try again tomorrow.", hi: "आपने आज के लिए अपनी AI कॉल इस्तेमाल कर ली हैं। कल फिर कोशिश करें।" },
  ai_quota_hour: { en: "You have used your AI calls for this hour. Try again in {minutes} minutes.", hi: "आपने इस घंटे के लिए अपनी AI कॉल इस्तेमाल कर ली हैं। {minutes} मिनट बाद फिर कोशिश करें।" },
  ai_quota_hour_one: { en: "You have used your AI calls for this hour. Try again in 1 minute.", hi: "आपने इस घंटे के लिए अपनी AI कॉल इस्तेमाल कर ली हैं। 1 मिनट बाद फिर कोशिश करें।" },
  // Go-live Task 3: the panel shown when a page throws (app/global-error.tsx and app/(app)/error.tsx). DRAFT Hindi.
  app_error_title: { en: "Something went wrong", hi: "कुछ गड़बड़ हो गई" },
  app_error_retry: { en: "Try again", hi: "फिर कोशिश करें" }
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

// Corrections to v1 panel keys (ap2_ and the like, extracted by extract-v1-panels.mjs). v1's Analyse a paper panel says "Appuscholer"
// (a typo) in four places; v2 says "Appuscholar" (walk fault W21). The golden fixture keeps v1's text; web tests that compare against it
// apply withPanelFixes to the golden first. Hindi holds the English for these keys, so the replacement runs in both languages.
export const PANEL_FIXES = {
  keys: ["ap2_check_what_appuscholer_read", "ap2_give_appuscholer_a_research", "ap2_made_with_appuscholer_parts", "ap2_none_the_text_has"],
  from: /Appuscholer/g,
  to: "Appuscholar"
};

/** Applies PANEL_FIXES to both dictionaries. A key that is missing, or whose value has nothing to replace, throws (v1 or the keys moved). */
export function applyPanelFixes(en, hi) {
  const outEn = { ...en }, outHi = { ...hi };
  for (const out of [outEn, outHi]) {
    for (const k of PANEL_FIXES.keys) {
      if (typeof out[k] !== "string") throw new Error(`panel fix key is missing: ${k}`);
      const fixed = out[k].replace(PANEL_FIXES.from, PANEL_FIXES.to);
      if (fixed === out[k]) throw new Error(`panel fix has no match in ${k}`);
      out[k] = fixed;
    }
  }
  return { en: outEn, hi: outHi };
}

/** The golden appanel text with the same replacement, for web tests that compare the panel with v1's recorded text (the golden is never edited). */
export function withPanelFixes(s) {
  return s.replace(PANEL_FIXES.from, PANEL_FIXES.to);
}
