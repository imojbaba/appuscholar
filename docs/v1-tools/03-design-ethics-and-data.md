# 03. Design & Ethics and Collection & Analysis (Appuscholar v1)

Source: `appuscholer/index.html`, version labelled 2026.10.08. Stage map: `TOOL_TO_STAGE` {design→design, stats→collect, qual→collect} (2691). The sidebar groups are "Design & Ethics" (one tool) and "Collection & Analysis" (Statistics & Charts, Qualitative Coding) (671-686). Note: all of Design & Ethics is deterministic, with no AI call (comment at 5866-5872). The Statistics Lab also computes in code. AI appears only in `statsExplain` and in the AI-use log.

---

## Part A. Design & Ethics (tool id `design`, stage Design & Ethics)

### Design & Ethics dashboard (`designRenderDash`)
- **Purpose:** One panel that tells the student which paperwork pieces they have started, without ruling on anything.
- **Entry:** Sidebar tab "⚖ Design & Ethics" (`showTool('design')`). Panel at 756-766.
- **Steps:**
  1. The student sees "N of 6 ready" and six rows with ✅ or ⬜.
  2. Clicking a row opens that sub-tool's dialog.
  3. Below are seven buttons. The seventh, AI-use statement, is not in the dashboard count.
- **Stored:** One localStorage blob per sub-tool at `appu_design_<key>`, keys `reg, proto, ec, ctri, pi, budget`. Each holds a `done` flag (`designGet`/`designSet`, 5873-5874).
- **"Done" rules:** reg is set after "Check pathway". proto is set when any section is filled. ec is set when any checklist box is ticked or title, PI or status is saved. ctri and pi are set by any tick or by a CV. budget is set when any amount is above 0.
- **Computation:** Rules and templates only. No AI. Interior dialog copy is English only. Only the panel entry points are translated (5870-5872, `design_btn_*` keys).
- **Exact copy:**
  - "Plan your method, pick the right regulatory path, and prepare consent, ethics committee and registration paperwork before data collection starts. Everything below is a starting checklist, not a legal ruling — confirm the final requirement with your own institution's Ethics Committee." (`design_panel_desc`, 757)
  - Guide: "These are starting checklists. They are not a legal ruling. Your own institution's Ethics Committee decides what applies to you, and you should ask them before you collect any data." (9647)
- **Line refs:** 5866-5896, 756-766, 668-686.

### Regulatory-pathway wizard (`reg`)
- **Purpose:** Four questions, then a starting list of which approvals usually apply in India.
- **Entry:** Button "🧭 Regulatory-pathway wizard". `regDlg` at 1813.
- **Steps:**
  1. Select study type: observational, interventional (behavioural), interventional drug, or interventional device (including brain-wave or neuro devices).
  2. Select population: adults, minors, vulnerable adults, or pregnant women.
  3. Tick "Collects blood, saliva, genetic or other biological samples" and "Runs at more than one site or institution".
  4. Press "Check pathway". A bullet list and a warning appear.
- **Stored:** `appu_design_reg` = {type, pop, bio, multi, done, savedAt}.
- **Computation (`regCompute`, 5906):** Pure rules. The first line is always the ICMR 2017 guideline. Drug triggers NDCT Rules 2019 and DCGI. Device triggers Medical Device Rules 2017 and DCGI. Behavioural interventional makes CTRI mandatory. Observational makes CTRI "not legally mandatory". A non-adult population adds a "Vulnerable population" line. Biological samples add a biospecimen clause. Multi-site adds an EC-per-site line. It always ends with a DCGI line, a CTRI line, and an IEC line.
- **Exact copy:**
  - "Answer four questions and get a starting list of which approvals usually apply in India. This is a checklist to walk in with, not a ruling — your institution's Ethics Committee has the final word."
  - "A behavioral or psychological intervention compared against a control or another condition counts as a clinical trial under the WHO/ICMR definition, whatever your department calls it."
  - "Not legally mandatory for a purely observational study, but registering anyway is increasingly expected — many journals now ask for it at submission."
  - "Institutional Ethics Committee (IEC) approval is required before enrollment starts, regardless of the above."
  - "📐 This is a starting checklist built from general ICMR/CDSCO guidance, not a ruling on your specific study. Confirm the final requirement with your own institution's Ethics Committee."
- **Guardrails:** The committee decides. The wizard is India-specific (ICMR, CDSCO, CTRI). UNKNOWN: any non-India pathway, which I searched for and did not find.
- **Dependencies:** Feeds CTRI readiness only conceptually. There is no code link.
- **Line refs:** 5898-5940, 1813-1843.

### Protocol / synopsis builder (`proto`)
- **Purpose:** The student writes eight sections in their own words and the app assembles them into one structured document.
- **Entry:** `protoDlg` at 1845.
- **Steps:**
  1. Fill any of eight boxes: Background & rationale; Objectives & hypotheses; Design; Participants (inclusion and exclusion criteria); Sample size & justification; Procedures; Risks & benefits; Data management plan.
  2. "Save", or "Generate protocol document".
  3. The markdown document is inserted at the end of the editor and the dialog closes.
- **Stored:** `appu_design_proto` holds the eight texts and `done`. These are the student's own protocol text, not participant data.
- **Computation:** Template fill (`protoGenerate`, 5959). Empty sections become "[not filled in]". References become "[add citations from the Citation Manager]". If every section is empty it shows the toast "Fill in at least one section first".
- **Exact copy:**
  - "Fill in each section in your own words. "Generate" assembles them into one structured document you can drop straight into your document editor, or hand to a funder or your EC."
  - Placeholder for sample size: "Target N and how you got there — use the Statistics Lab's calculators if you have an expected effect size".
  - "Protocol inserted into your document ✓"
- **Dependencies:** `insertIntoEditor`. Points to the power calculator and the Citation Manager.
- **Line refs:** 5942-5977, 1845-1860.

### Ethics Committee package, approval record and consent form (`ec`)
- **Purpose:** Track which EC documents are ready, record what the committee decided (never decide for them), and draft an ethics statement and a consent form.
- **Entry:** `ecDlg` at 1862.
- **Steps:**
  1. Tick off the eight documents: Protocol / synopsis; Informed consent form; Participant information sheet; Principal investigator CV; EC application form (your institution's own); Insurance / indemnity (if more than minimal risk); Data management plan; Recruitment materials.
  2. Ethics approval record fields:
     - "Where things stand": Not yet sent / Applied, waiting / Approved / The committee told me in writing that full review is not needed / No human participants.
     - Committee name, reference number, decision date.
     - "How participants agree to take part": signed form / tick-box online / spoken consent recorded / committee waived consent.
     - "Participants under 18": no / yes / not sure.
  3. Choosing yes or unsure for minors shows an amber note.
  4. "Insert an ethics statement into my document" writes an "Ethical considerations" paragraph.
  5. Separately, five fields (study title, PI & institution, what participation involves, risks, benefits, contact) feed "Generate consent form".
- **Stored:** `appu_design_ec` holds the checklist, all record fields, and the consent-form fields. It is localStorage text typed by the student. No file is uploaded.
- **Computation:** Rules and templates (`ecStatement` 6029, `ecGenerateConsent` 6047).
  - The statement is chosen by status. "approved" gives "The study was approved by {committee} (reference …) on {date}. {consent sentence}". "applied" gives a bracketed "[…Do not write that the study was approved until you hold the approval letter.]". "noreview" says the committee decided in writing that full review was not needed. "nohuman" says no human participants. "none" gives "[…Do not collect data until it has been.]".
  - If minors is yes or unsure, a bracketed prompt is appended.
  - The consent form requires a title and a PI. The fixed paragraphs are Voluntary participation and Confidentiality. The signature lines are Participant and Researcher. Everything else is the student's text, or "[describe]".
  - UNKNOWN: any assent or guardian form, or a Hindi or translated consent form. I searched the `ec*` functions and found none.
- **Exact copy:**
  - "Write down what your committee decided. Appuscholar never decides it for you."
  - "Participants under 18 usually need a parent or guardian to give written permission, plus the young person's own agreement, and a committee that has approved this. In India a person under 18 is a child under the data-protection law, so extra care applies to their data. Ask your committee and your supervisor. Appuscholar is for adults and does not collect children's data itself."
  - "Settle this before you collect data." (prefix when "Not sure yet")
  - "Taking part in this study is entirely voluntary. You may refuse to participate, or withdraw at any point, without giving a reason and without any penalty or loss of benefit you would otherwise be entitled to."
  - "Your responses will be kept confidential, stored securely, and reported only in a form that does not identify you personally, except where required by law."
  - "Ethics statement inserted. Check every sentence is true."
  - Guide: "It never says a study is exempt. Only your committee can say that, in writing." (9641)
- **Guardrails:** No auto-exempt. Bracketed placeholders force the student to complete the statement. An 18+ stance: "Appuscholar is for adults".
- **Line refs:** 5979-6070, 1862-1887.

### CTRI registration readiness (`ctri`)
- **Purpose:** A 13-item readiness checklist so the student does not hunt for a missing field halfway through filling CTRI's form.
- **Entry:** `ctriDlg` at 1912.
- **Steps:** Tick fields such as "Public title and scientific title decided", "Ethics Committee approval obtained or applied for", "Primary outcome and its time point defined", "Phase stated, if this is a drug trial", "A publicly listable contact (name, phone, email) ready". Then "⬇ Export readiness report".
- **Stored:** `appu_design_ctri` = {checklist{index:bool}, done}.
- **Output:** `ctri-readiness-YYYY-MM-DD.md` with "N of 13 fields ready" and `- [x]` / `- [ ]` lines.
- **Exact copy:**
  - "This is a readiness check, not a CTRI submission — the actual registration happens on ctri.nic.in."
  - "this doesn't submit anything, it just gets you ready to fill CTRI's own form without hunting for a missing piece halfway through."
- **Computation:** Counting only.
- **Line refs:** 6072-6096, 1912-1921.

### PI eligibility & training (`pi`)
- **Purpose:** What an EC expects from a Principal Investigator.
- **Entry:** `piDlg` at 1923.
- **Steps:**
  1. Tick six items: affiliation confirmed; GCP training completed (ICMR NOC/GCP or WHO GCP); CV current; any conflict of interest disclosed in writing; prior research or supervised-research experience; co-investigators and roles identified.
  2. Write a short CV in the textarea.
  3. Save, or "⬇ Export CV text" (`pi-cv-YYYY-MM-DD.txt`).
- **Stored:** `appu_design_pi` = {checklist, cv, done}.
- **Exact copy:** "Free GCP training: ICMR's own NOC/GCP course, or WHO's GCP course — search "WHO Global Health Learning GCP"; both are free and widely accepted."
- **Line refs:** 6098-6128, 1923-1934.

### Trial budget estimator (`budget`)
- **Purpose:** A line-item estimate in ₹, for a funder or department.
- **Entry:** `budgetDlg` at 1936.
- **Steps:** Seven default rows: Site costs; Participant compensation; Statistician time; Publication / open-access costs; Travel; Equipment; Contingency (10-15%). Edit labels and amounts, add or remove rows, see "Total: ₹…" (en-IN locale), then "⬇ Export budget".
- **Stored:** `appu_design_budget` = {rows[{label,amount}], done}.
- **Output:** `trial-budget-YYYY-MM-DD.md`, a markdown table with a bold total.
- **Computation:** Sum only. The contingency line is a typed amount, not computed from a percentage.
- **Exact copy:** "A line-item estimate to share with a potential funder or your department. Numbers only — this doesn't move or hold any real money."
- **Line refs:** 6130-6178, 1936-1948.

### AI-use statement (no design key; log in `appu_ailog`)
- **Purpose:** Turn a private log of AI use into a disclosure the student can edit and paste, without ever storing what was sent or answered.
- **Entry:** Button "🤖 AI-use statement" in the Design panel (`aiuOpen`, 765). `aiuDlg` at 1889.
- **Steps:**
  1. Toggle "Keep the log".
  2. Choose From/To dates. Untick kinds of help that belong to another project.
  3. Optionally list AI tools used elsewhere.
  4. Tick what is true: planned the argument myself; rewrote AI wording; checked every citation; checked every number and claim; sent no participant names or identifying details.
  5. Choose style: Coursework / Thesis / Journal.
  6. "Build the statement", then edit the box, then Copy, Insert into my document, or Download.
- **Stored:** `appu_ailog`, capped at 1,500 entries. Each entry is {d date, p provider, m model (80 chars), k help-kind, g group}. `appu_ailog_off` is the opt-out. Never stored: the prompt text or the AI's answer.
- **Computation:** `aiuClassify` matches the first 400 characters of each prompt against about 25 regexes (`AIU_RULES`, 5412-5440). Each match maps to a plain label and a group: text, feedback, explain, other. The help-assistant "Appu" is not logged. The statement is assembled by templates (`aiuBuild`, 5509).
- **Exact copy:**
  - "It never keeps what you typed or what the AI answered."
  - "The log shows N request(s) in these dates. Tick them, or change the dates, before you say that no AI was used."
  - "AI is not an author of this work. I am responsible for everything in it."
  - "[Your institution or the journal decides what you must disclose. Edit this text so that it is true.]"
  - "[Say which passages still contain AI wording, since you did not tick that you rewrote it.]"
  - "[Check this against your own records. The log only knows about Appuscholar in this browser.]"
- **Dependencies:** Every `callAI`. Reads `styleMeta`/`styleSamples` to add a sentence if the My Writing Style profile was used.
- **Line refs:** 5411-5568, 1889-1910.

---

## Part B. Collection & Analysis (tool ids `stats`, `qual`)

### Data entry, parsing and dataset naming
- **Purpose:** Get a table into the lab without leaving the computer.
- **Entry:** Panel "📊 Statistics Lab" (769-779). `statsDlg` at 1529.
- **Steps:**
  1. Optionally name the dataset (`statsDsName`, max 60 characters).
  2. Paste into "Your data", or press "📂 Upload .csv" (accepts .csv/.tsv/.txt via FileReader; the file name seeds the dataset name).
  3. Press "Parse data". Chips show each column as `numeric` or `categorical` with n. The personal-data box appears, and the test chooser unhides.
- **Computation:**
  - `statsParseText` (9358): delimiter is tab if the first line contains a tab, otherwise comma. Quoted fields are handled. A column is numeric only if every non-empty value matches `-?\d+(\.\d+)?`. Rows with the wrong field count are silently dropped.
  - `rtRegister` stores a fast hash of the data under the dataset name.
- **Stored:** `appu_statsname` (last name typed). `appu_statsets` = {name:{hash, ts, n}}. Never stored: the data rows themselves. I found no localStorage write of rows in this path.
- **Exact copy:**
  - "🔒 Paste data from Excel, SPSS, Google Sheets or a CSV file — first row = column names. Everything is computed on this computer; your data is never sent anywhere unless you tap "Explain in plain language" below, and even then only the computed numbers are sent, not your raw data."
  - "Results you insert are tagged with this name. If you later load changed data under the same name, the tagged results in your document are flagged as out of date."
  - "Data parsed ✓"; "Paste some data first — one header row, then your rows".
- **Line refs:** 9348-9410, 1529-1612.

### Personal-data scan on upload (`pdScan`, `pdRender`, `pdTransform`, `pdApply`)
- **Purpose:** Find identifiers before the data goes anywhere, and offer removal or coding.
- **Entry:** Runs automatically inside `statsParse` (9395), so it covers paste, upload, demo-data runs and scale-scoring re-parses.
- **Steps:**
  1. After parsing, the box `pdBox` either says nothing was found, or shows an amber panel "Possible personal details found".
  2. Per flagged column the student chooses Remove column / Replace with a code / Keep as it is. Defaults: names and roll numbers → code; phone, email, DOB, address, government ID → remove.
  3. "Apply" rewrites the paste box with the cleaned CSV, re-parses, and shows a result message.
  4. If any column was coded, the browser downloads `appuscholar_key_keep_separate.csv`.
- **Detection rules (`pdScan` 9433, `PD_HDR` 9414):**
  - Value-shape first, with at least 60% of non-empty values matching:
    - email: `^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$`.
    - phone: Indian mobile, 10 digits starting 6-9, optional +91.
    - govid: 12 digits, or PAN (`AAAAA9999A`).
    - dob: d/m/yyyy or yyyy/m/d, years 1940 to 2019.
  - Else by heading, with regexes for name (including "naam" and Devanagari नाम), phone, email, roll/enrolment/registration/USN/PRN/student id, dob, address/village/pincode, and Aadhaar/PAN/passport/voter. A "name" heading is ignored if it contains group, scale, test, condition, class, school, city, task and similar words. A name or roll column with 4 or more values and under 50% unique values is skipped.
  - Else a column whose values look like two-word alphabetic names, at least 3 values, at least 80% unique and at least 70% name-shaped, is flagged as names.
  - Free-text warning: a non-numeric column with mean length above 40 or any value above 120 characters is listed as "columns with long text".
- **Masking:** Coding (`pdTransform` 9464) assigns `P001, P002…` (zero-padded to at least 3 digits) per distinct value of the FIRST coded column. The key file holds ParticipantCode plus the coded columns. `ParticipantCode` is inserted where the first coded column was. A BOM-prefixed UTF-8 CSV is downloaded.
- **Exact copy:**
  - "Possible personal details found"
  - "Choose what to do with each column. Removing is safest. A code keeps rows linked to one person without showing who, and you get a key file that maps each code back."
  - Labels: "looks like names / phone numbers / email addresses / roll or enrolment numbers / dates of birth / an address or place / a government ID number".
  - "A code is pseudonymisation, not anonymisation. While the key file exists, the data still counts as personal data. Keep the key file away from the data, for example on a different drive, and share only the coded data. If you lose the key file, nobody can recover the names."
  - "This check reads column headings and the shape of the values. It cannot see a name typed inside an open answer (columns with long text: …). Read those yourself before they go anywhere."
  - "No column looks like names, phone numbers, emails, roll numbers or birth dates."
  - "Nothing changed. You chose to keep every flagged column."
  - "Done. N column(s) removed. N column(s) replaced with ParticipantCode. The key file was downloaded. Store it apart from the data."
- **Guardrails:** Deterministic, no AI. The student is always allowed "Keep as it is".
- **Gaps:** UNKNOWN: a scan on the Chart Studio paste box `vzPaste`, or on the qualitative text. `pdRender` is called only from `statsParse`.
- **Line refs:** 9411-9522, 1308-1318.

### Text scan before any AI call (`PD_SEND`, `pdScanText`, `pdMask`, `pdPreSend`)
- **Purpose:** Catch emails, phone numbers and ID numbers in any text before it reaches the AI provider.
- **Entry:** `callAI` runs `pdPreSend(prompt)` on every call (5321). No caller passes `noScan`.
- **Steps:**
  1. If nothing is found, the prompt is sent unchanged.
  2. If a match is found, a dialog "Personal details in this text" lists "Found: N email address…".
  3. Buttons are "Mask them and send", "Send as it is" or "Cancel".
  4. "Send as it is" is remembered for the same findings in this session (`window._pdOk`).
  5. Cancel throws "Cancelled. Nothing was sent to the AI provider."
- **Rules (9524):** Email, Indian mobile (+91 optional, 5+5 digits), and ID number (`#### #### ####`, 12 digits, or PAN). Masks are `[email]`, `[phone]`, `[id number]`.
- **Exact copy:** "This text goes straight to your AI provider. The check finds email addresses, phone numbers and ID numbers. It cannot find a name written inside a sentence, so read the text once yourself."
- **Quirk:** The found-list pluralises by appending "s", so two emails read "email addresss" (9543).
- **Line refs:** 9524-9560, 5320-5322, 1308.

### Test catalogue (`statsRunNow`, 12609-13456)
The dropdown has 26 options (1529-1590). Every branch computes in code, writes an HTML result and one APA sentence, then draws a chart (if Chart.js loaded). p-values use `fmtP`/`pCell` (no leading zero, `< .001`).

| key | Label | Reports | Line |
|---|---|---|---|
| desc | Descriptive statistics | N, M, SD, Median, Min, Max; histogram | 12618 |
| ttest1 | One-sample t | M, SD, N, μ, t, df, p, mean diff + 95% CI, Cohen's d | 12627 |
| ttestInd | Independent t (Welch default) | group N/M/SD; Welch t(df), p, Hedges' g, mean diff + 95% CI; Student's t shown for comparison | 12641 |
| ttestPaired | Paired t | N pairs, mean diff, SD diff, t, df, p, 95% CI, d_z | 12665 |
| anova1 | One-way ANOVA, classic | group table, F(df1,df2), p, η² | 12684 |
| tukey | Tukey HSD post hoc | pairwise diff, q, adjusted p (exact studentised range), MSW | 12702 |
| regression | Simple linear | b0, b1, SE, t, df, p, R², F, CI of slope, β | 12725 |
| mannwhitney | Mann-Whitney U | medians, U, exact p (no ties, n<50 each) else z with continuity + tie correction, rank-biserial r | 12751 |
| wilcoxon | Wilcoxon signed-rank | n non-zero diffs, W, exact p or z (normal approx), matched-pairs rank-biserial r | 12772 |
| pearson | Pearson r | N, r, df, p, strength word, Fisher-z 95% CI, scatter | 12795 |
| chisq | χ² independence | table, χ²(df,N), p, Cramér's V; Yates for 2×2; Fisher exact + odds ratio if any expected <5 in 2×2; Fisher-Freeman-Halton if >20% cells <5 and N≤200 | 12820 |
| anova2 | Two-way ANOVA | cells, Type III SS table, F, p, partial η²; simple effects with Bonferroni; Tukey pairs or interaction-split pairs; 2-6 levels per factor | 12861 |
| mregress | Multiple regression | R², adj R², F, df, p; b, SE, β, t, p, 95% CI, VIF; optional step 2 with ΔR², F change; categorical dummies | 12932 |
| logistic | Logistic regression | LR χ², McFadden, Cox-Snell, Nagelkerke R², AUC; b, SE, Wald z, p, OR + CI; confusion table, sensitivity, specificity | 12982 |
| moderate | Moderation | centred X, W, X×W; R², ΔR², F change; simple slopes at −1 SD/mean/+1 SD; Johnson-Neyman points; slopes plot | 13025 |
| mediate | Mediation | paths a, b, c, c′ with tests; indirect a×b, 5,000-resample percentile bootstrap (fixed seed from n), standardised indirect | 13073 |
| welchAnova | Welch one-way ANOVA | Welch F(df1,df2), p, ω²; Games-Howell table if significant | 13116 |
| gof | χ² goodness of fit | observed/expected/std residual, χ², p, Cohen's w; exact binomial if expected <5 and two categories | 13137 |
| kruskal | Kruskal-Wallis | Mdn, mean rank, H, p, ε²; Dunn with Holm if significant | 13165 |
| spearman | Spearman | rₛ, 95% CI, df, p | 13188 |
| mcnemar | McNemar | 2×2 table; exact binomial if fewer than 25 changers, else χ² with continuity | 13203 |
| cochran | Cochran's Q | proportions, Q, df, p; pairwise exact McNemar with Bonferroni only if significant | 13224 |
| friedman | Friedman | Mdn, mean rank, χ², df, p, Kendall's W; pairwise rank-diff with Bonferroni if significant | 13250 |
| rmanova | Repeated-measures ANOVA | Mauchly's W, Greenhouse-Geisser if ε<.75 else Huynh-Feldt; partial and generalised η²; Bonferroni paired t if significant | 13281 |
| mixed | Mixed ANOVA | group, time, interaction; partial η²; Mauchly for >2 conditions; unequal-n note; Box's M not run | 13334 |
| alpha | Cronbach's α and McDonald's ω | α + CI, ω + 400-resample bootstrap CI, mean inter-item r, item-total r, α-if-deleted, loading; reverse-score option | 13400 |

- **Assumptions and warnings:**
  - After a parametric result, `stkAssumpFor` (8797) appends an "Assumption checks" block. It runs Shapiro-Wilk (Royston) per group, or on differences for paired tests, or on residuals for regression, moderation, and two-way ANOVA. It also runs Brown-Forsythe for equal spread. It covers ttest1, ttestInd, anova1, tukey, welchAnova, mregress, moderate, anova2, ttestPaired, regression only.
  - Copy: "At least one Shapiro-Wilk p is below .05, so the scores depart from a normal curve. Look at the histogram. With small groups or a clear skew, a rank test (Mann-Whitney, Wilcoxon, Kruskal-Wallis) is the safer choice."
  - Copy: "Treat them as a prompt to look at the plot, not as a verdict."
  - Safety net (`statsResultsShow` 11985): any "NaN|Infinity|undefined" in the result blocks it. The student sees "This analysis produced a number that is undefined, so no result is shown. It usually means a group has no spread (every value the same), a group is too small, or the data fit a line exactly."
  - Non-numeric cells are dropped and counted: "N entries that are not a number were left out."
  - Refusals appear as toasts, e.g. "Every value is the same, so there is no spread and this test cannot be calculated.", "This grouping variable needs exactly 2 groups — it has N", "One-way ANOVA needs 3 or more groups — use the t-test for 2".
  - Dialog footer: "📐 These formulas cover the common cases correctly (Welch's independent t, average-rank non-parametric tests, standard ANOVA/chi-square). For an unusual design, or before a dissertation defense, cross-check against SPSS or JASP."
- **Inconsistencies to fix in the rebuild:**
  - The Guide says "Anything the lab cannot compute, such as a two-way ANOVA or multiple regression, needs another program", but both are built (9654 vs 12861, 12932).
  - The Guide says 2 to 8 predictors; the code allows up to 12 columns after dummy expansion.
  - The "Which test" guide marks `rmanova`, `friedman` and `twoway` as "not built" because their `keys` arrays are empty, yet the lab runs them (TG_RES 12076-12100).

### APA sentence, insert, copy and explain
- **Steps:** Result block shows a sentence in `#statsSentence`, with three buttons: "Insert into document", "Copy", "💡 Explain in plain language".
- **Insert (`statsInsert` 12010):** Puts the sentence in the editor wrapped in a hidden `<span class="stat-tag" data-run="ID">`. It saves a run record to `appu_statruns`, capped at 300. The record holds {test, label, dataset name, hash, field column names, extras, sentence, ts}. Never stored: the raw rows.
- **`statsExplain` (12027):** Sends to `callAI`, temperature 0.3:
  - the system text: "You are a statistics tutor for students of {field}. A student ran this analysis. In 2 to 4 sentences of plain language, with no jargon beyond what a first-year knows, say what the result means and whether it was statistically significant (use alpha = .05 unless the summary states another). Say once that statistical significance does not show the effect is large or useful, and avoid causal wording unless the design in the summary was an experiment. Use only numbers given below and invent none."
  - a tag-stripped text of the result tables, which includes column names, group labels and assumption text
  - the APA sentence.
  - The raw rows are not sent. Because group labels are included, `pdPreSend` still scans the prompt. The answer is appended as "💡 In plain language: …".
- **Line refs:** 12006-12036.

### Results-and-data linking (`rtCapture`, `rtScan`, `rtOpen`, `rtRerun*`)
- **Purpose:** Flag inserted results that were computed on data that has since changed.
- **Entry:** "🔗 Check results against my data" (777). `rtDlg` at 1642.
- **Behaviour:** Each tagged sentence is labelled Current / Out of date / Cannot check by comparing the stored hash with the current hash of the same dataset name. "Re-run on current data" restores the column choices, re-runs the test, and replaces the sentence. It flags if the conclusion at .05 flipped.
- **Exact copy:**
  - "Every result inserted from the Statistics Lab carries a hidden tag that remembers which test it came from and which data it was run on."
  - "The app cannot tell which words in your paragraph depended on a number. After a re-run, reread the text around it. Tables, charts and figures made earlier are not tagged and are not checked."
  - "The conclusion at .05 has changed. Read the paragraph around this sentence again."
  - "Re-running replaces your edited text with the new sentence. Continue?"
- **Line refs:** 9372-9388, 12260-12350, 1642-1649, i18n 2081-2089.

### "Which test fits my data?" guide (`TG_*`)
- **Purpose:** Fixed-rule routing from the student's design to a test, with reasons, assumptions, a demo, and a data check.
- **Entry:** Button "🧭 Which test fits my data?" (`tgToggle`, 12486).
- **Steps:**
  1. Questions, in order (`TG_Q` 12038):
     - "What do you want to find out?" (compare / relate / predict / scale reliability / counts)
     - "What kind of score are you comparing?" (a number such as a total or mean / a single rating item or ranks)
     - "How many groups or conditions?" (one / two / three or more / two factors)
     - "Are they different people in each group, or the same people measured more than once (or matched pairs)?"
     - "What kind of scores are the two variables?" (numbers / at least one rating item or ranking)
     - "What are you predicting?" (a number / a yes-no outcome)
     - "How many predictors?"
     - "What is your design?" (counts)
  2. Result card "Best fit", with a "Why this fits" list of the student's answers, "What it assumes" and "When it stops fitting" (`TG_EXTRA`).
  3. Optional "Other options" list.
  4. "Use this test" selects it in the lab.
  5. "Try a small demo": the student must "Predict first" (a clear result, or no clear result), then it runs invented data and compares the prediction (`TG_DEMO`). "Back to my own data" restores the paste box.
  6. "Check my numbers": per-group n, skew, outliers (Tukey fences), and expected counts. The student must pick columns.
- **Routing logic:**
  - Compare + scale → Welch t, paired t, Welch ANOVA + Games-Howell, repeated-measures ANOVA, one-sample t.
  - Compare + ordinal → Mann-Whitney, Wilcoxon, Kruskal-Wallis + Dunn, Friedman.
  - Relate → Pearson, or Spearman if ordinal.
  - Predict → simple regression, multiple regression, or logistic.
  - Scale reliability → ω with α.
  - Counts → goodness-of-fit, χ², McNemar, Cochran.
- **Exact copy:**
  - "The app does not run this test yet. This is a case for a human or a statistician to confirm, and the app will hand it over once the full workflow is built. Until then, run it in jamovi or JASP (both free) and bring the numbers back here to write up."
  - "Some groups have fewer than 20 people and either strong skew (beyond ±1) or extreme values. A rank-based test is the safer choice here."
  - "This is a rule of thumb with no formal source behind it, and you can still choose differently. Do not rely on a normality test to decide…"
  - Welch rationale: "…so there is no need to test for equal variances first."
  - "Predict first. Before you run it, what do you expect?"
  - "The numbers are invented for practice."
- **Pedagogy:** Fixed rules, no AI. Demos run with `actLog` disabled and `_rtSkip` so demo data is not registered as the student's dataset.
- **Line refs:** 12038-12103, 12385-12573.

### Generate-before-reveal gate (Practice mode)
- **Purpose:** Make the student commit to a design before the lab shows whether their test fits.
- **Entry:** Checkbox "Practice mode: commit to my design before the test runs" in the lab (1599). Stored as `appu_gen_first` (restored at 4161).
- **Steps:**
  1. With the box ticked, "Run test" does not run. A gate appears.
  2. The label is "Before it runs: what is your design?", with a select starting "Choose…". There are ten designs:
     - only describe one variable
     - one group against a known value
     - two separate groups
     - same people twice
     - three or more separate groups
     - how two numeric variables move together
     - predict one numeric variable from another
     - reliability of a scale
     - one categorical variable against expected counts
     - two categorical variables related
  3. "Check my choice" reveals one of three messages. "Your choice, {test}, fits this design." "{test} is a valid choice for this design, usually as the fallback when the usual assumptions fail." "The usual test for this design is {first}, not {chosen}."
  4. A one-line reason follows (`GEN_DESIGNS[...].why`).
  5. If it does not fit, "Switch to {first}" appears. The student can always press "Run {test}" and proceed.
- **Not asked:** The gate does not ask for a predicted result. That is only in the guide demo.
- **Exact copy:** "Pick the design first" (toast). "Switched. Choose your columns, then check again." Comment: "Rules are fixed and deterministic, no AI. The student always keeps control" (12558).
- **Line refs:** 12558-12608, 1599-1600.

### Power and sensitivity (`pw*`, `pl*`)
- **Purpose:** Sample size, power, or smallest detectable effect, with a sentence for a methods section or ethics form.
- **Entry:** "🎯 Sample size and power" (`pwOpen`, 13478). `powerDlg` at 1701.
- **Steps:**
  1. Planned test: independent t, paired t, one-sample t, one-way ANOVA, Pearson r, multiple regression (overall F), χ².
  2. "I want to find": the sample size, the power, or the smallest effect.
  3. Enter effect size (default per test), alpha, tails, and k, p, df, dropout % as relevant.
  4. "Calculate" gives a headline, a table of 80/90/95% power, and a "For your methods section or ethics form" sentence with "Copy sentence".
- **Computation:** Exact noncentral t, F and χ² for the t-tests, ANOVA, regression and χ² (9044-9110). Correlation uses the Fisher z approximation. Cohen's benchmarks are `PW_INFO` (13458). Dropout inflates per-group recruitment.
- **Exact copy:**
  - "A supervisor or statistician should confirm the effect size you chose."
  - "They are a last resort. Better is the smallest effect you would care about, or an effect taken from earlier studies, kept on the cautious side."
  - "This is below the usual .80, so a real effect of this size would be missed more than one time in five."
  - Power simulation banner: "SIMULATED. N pretend studies … None of this is real data."
  - "Teaching tool only … Written by AI, checked against the power calculator on this page; no human reviewer yet."
- **Learn: watch power happen (`plRun` 9007):** Runs 100/200/500 pretend independent t-tests with a fixed seed, and shows the share reaching p < .05 against the calculator. It also shows the average observed d among significant studies, to teach winner's-curse overstatement. The text includes a "Professor RAJ (AI character)" line, which is canned and not a live AI call.
- **Line refs:** 13458-13530, 9007-9043, 9044-9110, 1701-1752.

### Chart Studio: research figures (`vz*`)
- **Purpose:** APA-style figures where every participant can be seen, drawn as plain SVG on this computer.
- **Entry:** "📈 Research figures (box plot, error bars, histogram, Q-Q)" (`vzOpen`, 776). `vzDlg` at 1651.
- **Steps:**
  1. Paste data, or "Use the Statistics Lab data".
  2. Choose chart: Box plot with every participant / Bar of means with error bars / Histogram with normal curve / Q-Q plot.
  3. Choose score column and optional groups.
  4. Options:
    - error bars (95% CI / SD / SE / None)
    - colours ("Colour (colour-blind safe)" or "Black and white (for print)")
    - bins (auto = max(5, ceil(log2 n + 1)))
    - show every participant
    - show n under each group
    - draw the title inside the picture
    - figure title, x-label, y-label, axis from/to, figure number, note
  5. A summary table sits under every chart (Group, n, M, SD, Mdn, Q1, Q3, Min, Max).
  6. "Insert into my document": inserts "**Figure N**", an italic title paragraph above, a PNG at 2× scale, then "*Note.* …" below (APA 7 layout), and increments the figure number. Or "⬇ PNG" / "⬇ SVG".
- **Computation:** Bars always start at zero. If "Axis from" is above 0, a warning shows: "Bars show size by their length, so a bar axis should start at zero. Starting higher makes small differences look large." Default title text is "Distribution of {y} by {g}", "Mean {y} by {g}", and so on. Default notes are generated. The box plot uses 1.5×IQR whiskers, open circles for outliers, and a diamond for the mean. Participant dots use deterministic jitter. The Q-Q reference line passes through the quartiles. The histogram's skewness shown is m3/n. The colour set is blue, orange, green, yellow, pink, dark green, violet, red.
- **Figure-key copy (verbatim):**
  - `vz_box_key`: "Box = middle half of scores. Thick line = median. Diamond = mean. Whiskers reach the furthest score within 1.5 box-lengths. Open circles = unusual scores beyond that. Dots = each participant."
  - `vz_bar_key_ci`: "Bars = group means. Error bars = 95% confidence interval. Dots = each participant."
  - `vz_bar_key_sd`: "Bars = group means. Error bars = one standard deviation. Dots = each participant."
  - `vz_bar_key_se`: "Bars = group means. Error bars = one standard error. Dots = each participant."
  - `vz_bar_key_none`: "Bars = group means. Dots = each participant."
  - `vz_hist_key`: "Bars count scores in each range. Dashed curve = the normal curve with the same mean and spread. Skewness = {s} (0 is symmetric; beyond about 1 or below -1 is clearly lopsided)."
  - `vz_qq_key`: "Dots close to the dashed line mean the scores are close to a normal distribution. Bends at the ends suggest skew or outliers. With very few scores, expect wobble."
  - Other: "Paste your data (first row = column names) or use the data from the Statistics Lab. Pick a chart. Every chart is drawn on this computer and can be saved for your paper." "No numbers to draw yet. Check that you picked a score column with numbers."
- **Guardrails:** Shows every participant by default. No personal-data scan on the paste box here.
- **Line refs:** 3636-3924, 1651-1699.

### Chart Maker: Quick chart and Venn (`chartGenerate`, `vennGenerate`)
- **Purpose:** A simple bar or line chart from typed label,value pairs, or a 2- or 3-circle Venn from typed counts.
- **Entry:** "📊 Quick chart (bars, lines, Venn)" (`chartDlg`, 1754).
- **Steps:**
  1. Pick a type: bar, line, Venn 2 sets, Venn 3 sets.
  2. For bar/line, enter one `label,value` per line (the last comma splits), plus an optional title, then Generate. This uses Chart.js and starts at zero.
  3. For Venn, enter set labels, "only" counts, and the intersections (A∩B, A∩C, B∩C, A∩B∩C). Circle sizes are fixed and not proportional to the counts.
  4. "Insert into document" adds a PNG (bar/line) or a resizable SVG (Venn).
- **Exact copy:** "📈 Charts need an internet connection the first time this page loads." "Add at least one "label,value" line first." "Generate a chart first."
- **Line refs:** 4854-4947, 1754-1799.

### Statistics charts (`statsChart*`)
- **Purpose:** One quick on-screen plot per result.
- **What is drawn:** Histogram (desc, ttest1). Bar of means ±1 SD (ttestInd, ttestPaired, anova1, tukey). Medians bar (mannwhitney, wilcoxon). Scatter plus fit line (regression, pearson, spearman). Grouped bar of counts (chisq). Interaction plot (anova2). Simple-slopes plot (moderate).
- **Notes:** They need Chart.js (CDN). The bar charts use `beginAtZero:false`, unlike Chart Studio. There is no insert or export button for these charts. UNKNOWN: any way to insert them into the document; I found none in the `statsChart*` functions.
- **Line refs:** 11903-11984.

### Numbers check (`ncFind`, `ncJudge`)
- **Purpose:** Re-derive each reported p-value from its statistic and df, so typos and rounding slips surface.
- **Entry:** "🔢 Check the numbers in my document" (`ncOpen`, 12351). `ncDlg` at 1624.
- **Detects (`NC_RES` 12185):** In APA order, `t(df) = x, p …`, `F(df1, df2) = x, p …`, `χ²(df[, N = n]) = x`, `chi-square(...)`, `H(df)`, `r(df)`, `z = x`. The operator may be =, <, >, ≤ or ≥.
- **Judging:**
  - It allows for rounding by taking the statistic ± half a unit of its last decimal, and p ± half a unit of its last decimal.
  - Status OK means the reported p is consistent. Warn means not consistent. Error means "Changes the conclusion", i.e. it flips significance at .05.
  - Special notes: reported p about half the recomputed one ("one-tailed?"), p written as exactly 0, p outside 0 to 1, non-positive df, small gap (rounding), otherwise a typo.
- **Report:** A summary line, then per item a coloured card (✓ / ⚠ / ✗) with the raw text, "You wrote: p … Recomputed: p …", a note, and "Go to this text" (selects it in the editor).
- **Exact copy:**
  - "Finds the statistics written in your document (t, F, χ², r, z and H, with their df and p), works out the p-value again from the test statistic and df, and flags any that do not match. It runs on this computer and uses no AI."
  - "Found {n}: {ok} consistent, {w} not consistent ({e} change the conclusion)."
  - "No statistics found. This check reads the APA pattern, for example "t(21) = 2.15, p = .043"."
  - "The reported p is about half of the recomputed one. Was a one-tailed test used? If so, say so in the text."
  - "p can never be exactly zero. Write p < .001."
  - "A typo in the statistic, the df or the p-value is the most common cause. Check them against your output."
  - "A consistent result does not show that the right test was used."
- **Line refs:** 12183-12257, 12351-12384, i18n 2098.

### Citation cross-check (`ccAnalyse`)
- **Purpose:** Compare in-text citations with the reference list.
- **Entry:** "📚 Cross-check citations and references". The button sits in the Citation Manager panel, not the stats panel (937). `ccDlg` at 1614.
- **Detects:**
  - It finds a "References / Reference list / Bibliography / Works cited / संदर्भ सूची" heading line. If none exists, the Citation Library is used as the list.
  - Narrative citations `Smith (2020)`, `Smith and Lee (2020)`, `Smith et al. (2020)`, and parenthetical lists `(Smith, 2020; Jones et al., 2019)`. A stop-word set (table, figure, months, …) avoids false hits.
  - It matches first-author surname (accents and case folded) plus year, tolerating a/b suffixes.
  - A list entry needs a leading surname and a "(year)" or "(n.d.)".
- **Reports:**
  - "Cited in the text but missing from the list". Each item shows count, raw text, near-misses ("same name, different year" or "similar name, Levenshtein ≤2, same year"), and a jump button.
  - "In the list but never cited".
  - "List entries that could not be read: N".
- **Exact copy:**
  - "Compares the citations in your text with your reference list. It lists every source cited but missing from the list, and every list entry that is never cited. It runs on this computer and uses no AI."
  - "{c} sources cited in the text. {m} not in the list. {u} list entries never cited."
  - "The list has {n} with a different year ({y}). Check the year."
  - "The list has a similar name: {n} ({y}). Check the spelling."
  - "None. Every citation has a list entry."
  - "Matching uses the first author's surname and the year."
- **Line refs:** 12100-12203, i18n 2099.

### Qualitative coding (`qual*`; tool id `qual`)
- **Purpose:** Tag passages with the student's own codes, build a code tree, and read everything under a code across all documents. Coding is the student's judgment; the tool only keeps tags.
- **Entry:** Tab "🏷 Qualitative Coding". Panel at 782-792. `qualPassagesDlg` after `chartDlg`.
- **Steps:**
  1. "+ New top-level code" prompts for a name (a native `prompt()`). A "+" on a row adds a sub-code.
  2. Select text in the document, then tap a code's name or colour swatch to wrap the selection.
  3. A selection that spans paragraphs, headings or list items fails with "Select a passage within a single paragraph (not across headings or list items)".
  4. The 👁 button opens "🏷 {code name}", listing each passage with its document title. Rows are ✎ rename and 🗑 delete.
  5. "⬇ Export all coded passages (Markdown)" downloads `appuscholar-coded-passages-YYYY-MM-DD.md`.
  6. A checkbox toggles code colours in the document.
- **Stored:**
  - `appu_qual_codes` = flat array of {id, name, parentId, color}.
  - Tags live inside each document's HTML as `<span class="qual-tag" data-qcode="ID">`, with background `colour+'55'` and an outline. Passages are not stored separately.
  - `appu_qual_showcolors`.
- **Colours:** `QUAL_PALETTE` = #f59e0b, #10b981, #3b82f6, #ef4444, #8b5cf6, #ec4899, #14b8a6, #f97316, #6366f1, #84cc16. Assigned in order of creation.
- **Delete:** Removes the code and its sub-codes, and strips the spans in every stored document. The text stays.
- **Export format:** `# Coded passages`, then each code as a heading (level = depth+2, max 6), then `- **{Doc title}:** "{passage}"`, or `_No passages tagged yet._`.
- **Computation:** None, and no AI. `actLog('qual')` is recorded.
- **Exact copy:**
  - "Select a passage in your document, then tap a code below to tag it. Build codes under other codes to group related ideas. Works across every document you have, not just the one that's open."
  - "No codes yet — add one above, then select text in your document and tap it to tag that passage."
  - "Every passage tagged with this code, across all your documents."
  - "Delete "{code}" and its N sub-code(s)? The passage text itself stays in your document — only the tag is removed."
  - "Coding is your judgment. The tool only keeps the tags." (guide, 9693)
- **Gaps:** UNKNOWN: memos, code merging, inter-coder features, or a personal-data scan on transcripts. I found none.
- **Line refs:** 6180-6330, 782-792, i18n 2014-2019.

### Scale library (`sl*`)
- **Purpose:** Fixed, permission-checked wording for validated scales, with a licence record, a codebook, and scoring in the student's data.
- **Entry:** "📋 Scale library" (`slOpen`, 11421). `scaleDlg` at 1255. `slScoreDlg` at 1263.
- **Included (2 scales):**
  - **RSES** (Rosenberg Self-Esteem Scale, 10 items, reverse items 2, 5, 6, 8, 9; two codings, 0-3 or 1-4). Status "Public domain", commercial use allowed, checked 2026-10-07.
  - **SWLS** (Satisfaction With Life Scale, 5 items, 1-7, with bands from the scale's own guide). Status "Free to use with credit", commercial use not allowed.
- **Pending list (`SL_PENDING`):** "PHQ-9, GAD-7, PHQ-2, GAD-2, AUDIT, DASS-21, MSPSS, UCLA Loneliness v3, General Self-Efficacy, Mini-IPIP and Grit-S are cleared in the research notes but wait for the owner's original file, so the wording is copied exactly. Screening scales (PHQ-9, GAD-7, AUDIT) also need the on-screen help path for self-harm answers before they go in."
- **Steps:**
  1. Pick a scale. The view shows the stem, response options, numbered items (reverse items marked), a scoring note, and a licence record.
  2. "Copy the questionnaire text" copies it with the credit line.
  3. "Download the item list (CSV)" downloads `{ID}_items.csv` with columns variable (`RSES_01`…), label, reverse_scored, response_codes and scale (`slCodebook`).
  4. "Score this scale in my data" (needs parsed data) maps each item to a column (auto-guessed from names like `RSES_01`) and asks for the coding.
  5. `slScoreRun` writes `{ID}_total`, plus `{ID}_band` where bands exist, back into the paste box, then re-parses (so the personal-data scan runs again). It reports scored rows, M, SD, and sample Cronbach's α. It checks that every item has its own column, answers are within range and integer, and rows with missing or invalid answers are left blank.
- **Exact copy:**
  - "Item text is copied from the owner's published form and is never edited by the AI." (comment, 11391)
  - "The text is fixed. The AI never rewrites it, because a reworded item is no longer the validated item." (guide)
  - "Add the ten items after reverse-scoring items 2, 5, 6, 8 and 9. Higher totals mean higher self-esteem. The owner gives no official cut-off scores."
  - "The bands come from the scale's own scoring guide and describe a score. They do not diagnose anything."
  - "Give the data as the raw answers, not already reversed."
  - "Compare once with the printed scale you cite." and "Anything you add yourself still needs the owner's permission."
- **Rule for entry:** A scale enters the list only when two independent copies agree word for word and the owner's permission statement was read.
- **Line refs:** 11390-11512, 1255-1272, guide 9670-9678.

---

## Cross-cutting guardrails and pedagogy
- **Numbers in code.** Every number the app reports is computed in code, not by the AI (APP_DESCRIPTION.md). The AI only paraphrases a result in `statsExplain`, with "Use only numbers given below and invent none".
- **Personal-data scan** runs at parse time and before any AI call. Both are deterministic and both say what they cannot see (names inside sentences and open answers).
- **No participant rows persisted.** localStorage holds the dataset name, hash and row count, plus run metadata (test, column names, sentence).
- **Generate-before-reveal** is opt-in. The student keeps control and can run their own choice.
- **Supervisor or statistician prompts** appear in the power tool, the lab footer, the guide demo, and the "not built" fallback.
- **Reporting honesty:** Results are never offered if undefined. Pairwise follow-ups are hidden when the omnibus test is not significant. Fisher or Games-Howell are suggested when assumptions fail.

## Student journey through Design and Collection
1. In Design & Ethics, the student opens the **Regulatory-pathway wizard**, answers four questions, and reads the starting checklist with its "confirm with your Ethics Committee" warning.
2. They write the **Protocol / synopsis** section by section, then generate it into the document.
3. They check **PI eligibility & training** and keep a short CV.
4. They run **Sample size and power** from the Statistics panel, copy the generated methods sentence into the protocol's sample-size section, and have a supervisor confirm the effect size.
5. In the **EC package**, they tick documents, generate a **consent form**, and later record the committee's decision. They insert an ethics statement only once the record is true.
6. They tick **CTRI readiness** and optionally export it, and fill a **budget**.
7. In Collection & Analysis, they paste or upload data under a dataset name. The **personal-data scan** offers to remove or code identifier columns. A coded set downloads a separate key file.
8. They optionally score a validated scale from the **Scale library**, and use "Which test fits my data?" (with the demo, Predict first) before choosing a test. Optionally they turn on **Practice mode** to commit to a design first.
9. They run the test, read the **assumption checks**, and insert the APA sentence (tagged to the dataset). They may use "Explain in plain language" and check the **Chart Studio** figure with its key and insert it with an APA caption.
10. For interview or open-ended data, they use **Qualitative Coding**, tag passages across documents, and export the coded passages.
11. If the data change, **Check results against my data** flags stale sentences, and the **Numbers check** and **Citation cross-check** audit the finished document.
12. Before submission, they build the **AI-use statement** from the log, tick only what is true, edit it, and insert it.

---

Fixes and open questions worth passing to the rebuild team:
- Guide copy and Test Guide status are out of date relative to the code (see the Inconsistencies list above).
- `pdAsk` pluralisation bug ("email addresss", 9543).
- Stats-chart bars start at non-zero while Chart Studio enforces zero.
- No personal-data scan on `vzPaste` or on qualitative text.
