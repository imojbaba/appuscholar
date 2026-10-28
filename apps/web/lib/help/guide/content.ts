import type { GuideSection } from "./types";

/**
 * The Guide's sections: v1's 26 in v1's order, ids, groups and titles (index.html build 2026.10.24a, `GUIDE` 10591-10783), as HTML that `sanitizeHtml` keeps
 * unchanged (no `dl`, `dt` or `dd`). The text is v1's, word for word, except where v1 said work, keys, backups, the AI-use log, offline use or installation
 * were on "this browser" or "this computer" (v2 saves work in the student's account, sealed by the vault when it is on), or named a button, menu or place v2
 * does not have. Each change is a row in the wave C register (docs/superpowers/specs/parity-deviations.md, D-C-1 onward). Copy here is English only, as the Guide is.
 */
export const GUIDE: GuideSection[] = [
  {
    id: "start",
    group: "Begin",
    title: "Your first ten minutes",
    keywords: "start begin first key provider setup sample study account passphrase vault save dashboard connect shape type field",
    html: `<p>You need about ten minutes. The AI buttons need a free AI key, which Appuscholar asks for the first time you press one. Statistics, charts and citations work without a key, so you can try those first.</p>
<ol>
<li>Open Appuscholar. The first page is <b>Your studies</b>, your dashboard. The <b>Appuscholar</b> name at the top left brings you back to it. Press <b>Start a new study</b>.</li>
<li>Give the study a name, choose its type (undergraduate project or thesis, master's dissertation, PhD thesis, course assignment, journal article or other) and its field, then press <b>Create study</b>. You can change all three later. Everything you do afterwards is saved in your account, under the study you make.</li>
<li><b>Shape your study</b> opens. It has six short parts: your question, who or what you would study, how you would find out, time, what you have, and ethics. Answer what you can in your own words, and press <b>Skip for now</b> or <b>Not sure yet</b> for the rest. Everything is saved as you type, and you can come back any time. If you are stuck, press <b>Help me think</b>: the AI asks questions and suggests options, and it never grades your plan. Press <b>See my plan</b> to read the summary. On it, <b>Check if it's doable</b> is optional: an outside opinion from the AI on whether the plan is realistic. Expect a frank read, and expect to disagree with part of it. It will not approve your topic. Your supervisor does that. Then press <b>Go to my study</b>.</li>
<li>The first time you press an AI button, such as <b>Help me think</b> or <b>Check if it's doable</b>, <b>Connect AI</b> opens. Press <b>Yes, I have a key</b>, or <b>No, help me get a free one</b> and follow the steps from <b>Open Google AI Studio</b>. Paste the key and press <b>Connect</b>; Appuscholar checks that it works. Then choose how the key is kept: <b>Remember on this computer</b> keeps it in this browser, and <b>Protect with a passphrase</b> keeps it on the server, locked with a passphrase only you know. Press <b>Not now</b> to do this later. At the top right, the AI pill reads <b>Connect AI</b> until a key is saved and <b>AI: Gemini</b> once one is (on a phone, open <b>Menu</b> first). When you press an AI button, the key travels with that one request to your provider and is not kept.</li>
<li>Open <b>Literature</b> from the study home and search your topic on the <b>Find</b> tab. Tick the papers that look relevant. The abstracts you ticked are all the AI sees when it drafts a review.</li>
<li>Open <b>Collection and analysis</b>, then the <b>Statistics</b> tab. Paste this small table and press <b>Parse data</b>:<pre>group,score
A,12
A,15
A,11
B,9
B,11
B,8</pre>Then find <b>Which test fits my data?</b> further down, press <b>Open the guide</b> and read why it picks what it picks.</li>
<li>Press <b>Help</b> at the top right, then <b>Guide</b>, whenever you get stuck. Search for a word, such as <i>alpha</i> or <i>consent</i>.</li>
</ol>`
  },
  {
    id: "stages",
    group: "Begin",
    title: "The six stages",
    keywords: "stages order idea literature design ethics analysis writing publish menu sidebar home tabs",
    html: `<p>The study home lists the stages in the order most studies take, and most stages have their own tabs. You can open any stage at any time. The stages are a suggestion.</p>
<ul>
<li><b>Idea.</b> Decide what to study and whether you can finish it.</li>
<li><b>Literature.</b> Find papers, read them, compare them, and draft the review from what you found. Your citations are kept here too.</li>
<li><b>Design and ethics.</b> Choose the method, work out which approvals you need, and prepare consent forms and the ethics package.</li>
<li><b>Collection and analysis.</b> Run tests on your data, make charts, and code interviews.</li>
<li><b>Writing.</b> Write your document, train it on your own style, look up words, and ask questions while you write.</li>
<li><b>Review.</b> Turn the document into slides. The AI text and Viva question buttons help you check your own work before you hand it in.</li>
</ul>`
  },
  {
    id: "editor",
    group: "Tools",
    title: "The writing area and its buttons",
    keywords: "editor write continue improve extend template viva draft first ai text highlight document dictate voice speak microphone dictation speech save size limit",
    html: `<p>The large page is your document. Several buttons sit under it.</p>
<ul>
<li><b>Continue Writing</b> suggests the next few sentences. They appear in the AI suggestion pane. Press Tab in the editor to take them, or ignore them.</li>
<li><b>Improve selection</b> rewrites the text you selected. Check that it still says what you meant.</li>
<li><b>Extend</b> roughly doubles the length of the passage you selected, with more detail and examples. Press Tab to replace your selection with it.</li>
<li><b>Template</b> inserts a ready-made outline for a lab report, an essay or a literature review. You fill it in.</li>
<li><b>AI text</b> marks every passage the AI inserted, directly in the document. Use it before you submit, so you can see how much of the page is yours.</li>
<li><b>Viva question</b> opens the Viva tab in Review and asks you an examiner-style question about your own writing. The answer box has no AI help.</li>
<li><b>Draft first</b> turns the AI into a questioner. You write, and it asks about what you wrote.</li>
</ul>
<p><b>Dictate</b> types what you say, at your cursor. Pick the language beside the button, press it, and speak. It works in Chrome and Edge, needs internet, and types each phrase when you pause. Say <i>full stop</i>, <i>comma</i>, <i>question mark</i>, <i>new line</i> or <i>new paragraph</i> for punctuation. In Hindi say <i>पूर्ण विराम</i>, <i>अल्पविराम</i> or <i>नई पंक्ति</i>. Your voice goes to your browser's speech service, which is Google in Chrome and Microsoft in Edge. Appuscholar never receives it. Never dictate participant names, interview recordings or anything that identifies a person. Press the button again to stop.</p>
<p>Pictures you add are scaled down to 1600 pixels on the long side before they go into the document. Each document is saved to your account as one piece, and a piece has a size limit, so a document with many large pictures can stop saving. If the page warns that the document is not being saved, download it, then shrink or remove large pictures.</p>
<p><b>Worked example.</b> Write two rough paragraphs of your introduction. Turn on Draft first. Answer the questions it asks, then fix the paragraphs. You end up with sentences that are yours and an argument you can defend aloud.</p>`
  },
  {
    id: "idea",
    group: "Tools",
    title: "Idea & Feasibility",
    keywords: "idea feasibility topic question resources timeframe assess",
    html: `<p>In <b>Shape your study</b>, describe the question, who you can reach, how you would find out, how long you have and what else you have. On the summary, <b>Check if it's doable</b> gives an outside opinion on whether the plan fits your resources. It is optional.</p>
<p><b>Worked example.</b> Question: does sleep quality predict exam marks in college students? Who: 80 students from your own department. What you have: a free survey form, no budget. Time: one semester. The honest answer will probably point at sample size, a reliable sleep measure, and the ethics route for student participants.</p>
<p>It will not approve your topic. Your supervisor does that.</p>`
  },
  {
    id: "research",
    group: "Tools",
    title: "Research (finding papers)",
    keywords: "research papers search openalex pubmed literature review gap abstracts sort cited",
    html: `<p>On the <b>Find</b> tab of Literature, type a topic and press <b>Find relevant papers</b>. Results come live from OpenAlex and PubMed. Sort by relevance, by most cited, or by newest. Tick the ones that matter.</p>
<p>From your ticked papers you can draft a literature review or look for a research gap. The AI works only from the abstracts it was given, so it cannot cite a paper you did not tick. Open each paper and read it before you cite it in your own work.</p>
<p>Your search words go to OpenAlex and PubMed. No document text does.</p>`
  },
  {
    id: "shelf",
    group: "Tools",
    title: "Reading shelf",
    keywords: "reading shelf pdf papers highlight notes search matrix synthesis passages summary backup indexeddb account export reading list",
    html: `<p>Open the <b>Reading list</b> tab of Literature, where the Reading shelf is. Press <b>Add PDFs</b> to put papers you have the right to read on the shelf. Appuscholar reads each PDF in your browser and keeps only the extracted text, saved with your study in your account (locked under your passphrase when the vault is on). The PDF file itself is not stored and is not uploaded. A scanned PDF with no text layer cannot be read, and the shelf says so.</p>
<ul>
<li><b>Papers</b> lists what you have added. Rename a paper, read it page by page, or remove it. Removing asks you to press twice.</li>
<li><b>Search</b> looks for words across every page and shows the page number and the words in context.</li>
<li><b>Find passages for a sentence</b> takes a sentence from your draft and lists the pages that share its key words. It is word matching. A page on the list does not show that the paper supports your claim. Read it.</li>
<li><b>Matrix</b> is a table with one row per paper and columns you choose, such as sample or method. You fill the cells. Download it as CSV.</li>
<li>In the reader, select a passage and press <b>Save selected passage as a highlight</b>. It keeps the page number and your note.</li>
<li><b>Summarise with AI</b> unlocks after you write at least two lines of your own about the paper. Your two lines are saved first. The AI sees the paper text with email addresses removed.</li>
</ul>
<p>Extracted text can jumble tables and two-column layouts. Check the original for exact numbers. The shelf is saved in your account with the rest of your study, so clearing your browser data does not erase it, and <b>Export all my work</b> includes it. <b>Back up the shelf</b> also downloads your papers and highlights as one file, which <b>Restore a shelf backup</b> can bring back.</p>`
  },
  {
    id: "offline",
    group: "Help",
    title: "Using Appuscholar offline and installing it",
    keywords: "offline install phone home screen app connection internet service worker cache bar account",
    html: `<p>Appuscholar needs a connection to work. Your documents and everything in your study are saved in your account, not on your device, so saving, the AI buttons, paper search and any new page all go online. After your first visit, Appuscholar keeps a small copy of its own files on your device, so that it can show a short offline page instead of your browser's error page. It does not keep your documents.</p>
<p>When the connection drops, a bar at the bottom says: <i>You are offline. Your last page is on screen, but saving, AI, paper search and new pages need a connection.</i> The page you had open stays on screen, but nothing new is saved until you are back online. Keep the tab open, and if the page warns that your document is not being saved, download it. Nothing you already saved is lost.</p>
<p>When you are online, the app always asks the website for the latest page first. The offline page is shown only when that fails. A new version therefore reaches you at the next load.</p>
<p><strong>To install it.</strong> In Chrome or Edge on a computer or an Android phone, press <b>Install Appuscholar on this device</b> in Help when it appears, or use the browser menu: <b>Install app</b>, or <b>Add to Home Screen</b>. On an iPhone, open the Share menu in Safari and choose Add to Home Screen. Your work is saved in your account, so the installed copy and the browser tab show the same studies once you are signed in. On some devices the installed copy keeps its own sign-in and its own AI key, so you may need to sign in or paste your key again.</p>
<p>If something looks stuck on an old version, add <i>?nosw=1</i> to the end of the address and press Enter. That clears the saved copy. The next normal visit saves a fresh one.</p>`
  },
  {
    id: "psych",
    group: "Tools",
    title: "Research helpers",
    keywords: "psychology tools summarize case study literature explain apa challenge devil argument",
    html: `<p>In Writing, open <b>Research helpers</b> beside the document. Select a passage of at least a few sentences, or select nothing to use the whole document, then press one button. The answer appears in the AI suggestion pane. Press Tab in the editor to insert it.</p>
<ul>
<li><b>Summarize research paper.</b> Paste an abstract or a section. You get four headings: Aim, Method, Key findings and Limitations. Anything the text does not say comes back as "not reported".</li>
<li><b>Analyze case study.</b> Names the psychological issues and the theories that apply, as study material. It gives no diagnosis and no treatment advice. Remove names, dates of birth and addresses first. The app asks you to confirm this once per session.</li>
<li><b>Literature review helper.</b> Advises how to organize a review paragraph: themes, how sources agree or clash, and angles for critique. It does not invent references.</li>
<li><b>Explain concept simply.</b> Explains a term the way you would to a first-year student, with one everyday example and one point worth remembering for an exam.</li>
<li><b>Format results in APA.</b> Paste raw SPSS, JASP or R output and get APA 7th wording.</li>
<li><b>Challenge my argument.</b> Gives up to four weaknesses a critical reviewer would raise. It does not rewrite your text and it offers no replacement sentences.</li>
</ul>
<p>Treat every output as a draft from a fast but fallible assistant.</p>`
  },
  {
    id: "design",
    group: "Tools",
    title: "Design & Ethics",
    keywords: "design ethics regulatory pathway protocol synopsis ethics committee consent ctri registration pi budget",
    html: `<p>Seven helpers, each producing a checklist or a draft document. Open <b>Design and ethics</b>: its <b>Overview</b> tab lists them, and each has a tab of its own.</p>
<ul>
<li><b>Regulatory-pathway wizard.</b> Answer questions about your study to see which approvals may apply.</li>
<li><b>Protocol / synopsis builder.</b> Builds the study outline most committees ask for.</li>
<li><b>Ethics Committee package and consent form.</b> Lists the documents a committee usually asks for and drafts a consent form. It also holds your <strong>ethics approval record</strong>: committee, reference number, date, how participants agree, and whether anyone is under 18. One button writes a short ethics statement for your Method section. It never says a study needs no committee review. Only your committee can say that, in writing.</li>
<li><b>CTRI registration readiness.</b> Checks whether a clinical-trial registration is likely to apply.</li>
<li><b>PI eligibility and training.</b> Lists who may lead the study and what training is expected.</li>
<li><b>Trial budget estimator.</b> A starting estimate.</li>
<li><b>AI-use statement.</b> See <i>AI-use statement</i>.</li>
</ul>
<p>These are starting checklists. They are not a legal ruling. Your own institution's Ethics Committee decides what applies to you, and you should ask them before you collect any data.</p>`
  },
  {
    id: "aiuse",
    group: "Tools",
    title: "AI-use statement",
    keywords: "ai use statement disclosure declare log provider model plagiarism misconduct journal thesis coursework author erase account",
    html: `<p>Universities and journals now ask you to say where AI helped. Appuscholar keeps a private log of this in your account, for each study. It records the date, the AI provider, the model and the kind of help, such as grammar and polish or practice viva questions. It never stores what you typed or what the AI replied.</p>
<p>Open the <b>AI-use statement</b> tab in Design and ethics. Choose the dates for this piece of work, untick any help that belongs to another piece of work, add AI tools you used elsewhere, and tick only what you really did yourself. Press <b>Build the statement</b>. Edit the text until it is true, then copy it, insert it into your document, or download it.</p>
<p>The log knows only about Appuscholar, and the statement is built from the open study's log, so AI you used with no study open is not in it. If you used AI outside Appuscholar, or with <b>Keep the AI-use log</b> switched off, add that yourself. If the log shows requests and you try to write that no AI was used, Appuscholar stops you. Your institution or the journal decides what you must disclose. AI cannot be an author.</p>
<p><b>Erase the log</b>, on the same tab, erases the whole AI-use log in your account: all your studies, and AI you used with no study open. It cannot be undone. A statement you have already built stays in its box.</p>`
  },
  {
    id: "stats",
    group: "Tools",
    title: "Statistics Lab",
    keywords: "statistics stats test paste data parse csv t-test anova correlation chi regression alpha omega welch kruskal mann whitney spearman",
    html: `<p>On the <b>Statistics</b> tab of Collection and analysis, paste a table from Excel, SPSS or Google Sheets, or upload a .csv. The first row holds column names. Press <b>Parse data</b>, pick a test, and the lab computes the result and writes an APA sentence. Everything is calculated in your browser.</p>
<p><b>Tests available.</b> Descriptives, one-sample, independent and paired t-tests, one-way ANOVA (Welch with a Games-Howell follow-up is the default, classic ANOVA and Tukey are there too), Kruskal-Wallis with a Dunn follow-up, Mann-Whitney, Wilcoxon, Pearson and Spearman correlation, simple regression, chi-square, Fisher's exact test, and Cronbach's alpha with McDonald's omega.</p>
<p><b>Which test fits my data?</b> A guide that asks about your design and explains why it picks a test. Each answer has a short demo.</p>
<p><b>Personal-data scan.</b> When you parse, the lab flags columns that look like names, phone numbers, emails, roll numbers or birth dates, and offers to remove them or replace them with codes. See <i>Handling participant data</i>.</p>
<p><b>Worked example.</b> Two groups, ten scores each. Choose the independent-samples t-test. The lab reports a Welch t, the degrees of freedom, p, Hedges' g, and a sentence you can paste into your results.</p>
<p>Small samples. Mann-Whitney and Wilcoxon give an exact p-value when no scores are tied and each group has fewer than 50. Otherwise they use a normal approximation with continuity and tie corrections, as R does. A 2 by 2 chi-square shows the plain and the Yates-corrected result side by side.</p>
<p>Assumption checks. Under the parametric tests the lab runs a Shapiro-Wilk test for each group (for paired tests, on the differences; for regression, on the residuals) and a Brown-Forsythe test for equal spread. Read them as a prompt to look at the histogram. They are weak with small samples and over-sensitive with large ones. The Shapiro-Wilk W and p follow the Royston (1995) method used by R.</p>
<p>Two-way ANOVA. Choose one score and two grouping variables. The lab fits every combination of the two factors, reports the two main effects and their interaction with Type III sums of squares, and shows the cell means. Every combination must contain at least one score. With unequal cell sizes SPSS and JASP agree with this table; R's basic <code>anova()</code> does not, because it uses Type I. A significant interaction means the main effects cannot be read alone, so the lab then adds simple-effects tables (one factor tested inside each level of the other, with a Bonferroni column).</p>
<p>Multiple regression. Choose the outcome, then tick two to eight numeric predictors. The lab reports R², adjusted R², the overall F test, and for each predictor b, its standard error, the standardised β, t, p, a 95% confidence interval and the VIF. Rows with a missing value in any chosen column are left out and counted. Categorical predictors can be ticked too: each is turned into 0/1 columns against a reference level (the largest group unless you name one). Two extra lists let you enter predictors in a second step (hierarchical regression): the lab then reports the change in R² with its F test. A VIF of 5 or more is a warning about overlapping predictors. The residuals get the same Shapiro-Wilk check as the other tests.</p>
<p>Logistic regression. Choose an outcome with exactly two answers (0/1 or yes/no), then tick the predictors. The lab reports the likelihood-ratio test of the whole model, three pseudo-R² values, the AUC, and for each predictor its odds ratio with a 95% interval. A classification table shows how many people the model sorted correctly. If one predictor separates the two outcomes perfectly, the model cannot be fitted and the lab says so. Plan on at least 10 cases in the rarer outcome for every predictor.</p>
<p>Moderation. Choose the outcome Y, the predictor X and the moderator W, all numeric (a 0/1 column works for a two-group moderator). The lab centres X and W, tests the interaction, and reports the slope of X at low, average and high W with a plot. It also gives the Johnson-Neyman points, the values of W where the slope of X turns significant. Plan on 50 or more people, because interactions need large samples.</p>
<p>Mediation. Choose X, the mediator M and the outcome Y. The lab gives the paths a, b, c′ and c with their tests, and the indirect effect a × b with a 5,000-resample percentile bootstrap interval. The seed is fixed, so the same data always give the same interval. The order X, M, Y has to come from your theory or design. Numbers measured all at one time cannot prove it.</p>
<p>Sample size and power. Open it from the <b>Sample size</b> tab. Pick the test you plan to run, then ask for one of three things: the number of people you need, the power a sample of a given size gives, or the smallest effect that sample can detect. The lab uses the exact noncentral distributions for the t-tests, ANOVA, regression and chi-square, and the Fisher z approximation for correlation. It also writes a sentence you can paste into a methods section or an ethics form. The effect size is the number that decides the result, so take it from earlier studies or from the smallest difference you would care about, and have a supervisor confirm it.</p>
<p>How the numbers were checked. Every test was compared with reference values from the SciPy library, and the distribution functions on a grid of 100 points. That is one independent check, not a replacement for your own: before a thesis relies on a result, run the same data in JASP, SPSS or R and compare.</p>
<p>Anything the lab cannot compute needs another program for now.</p>`
  },
  {
    id: "scales",
    group: "Tools",
    title: "Scale library",
    keywords: "scale library questionnaire rosenberg swls self-esteem life satisfaction score reverse licence attribution codebook",
    html: `<p>Open the <b>Scales</b> tab (the Scale library) of Collection and analysis. Each scale shows the owner's wording, the response options, how to score it, and a licence record: what the owner allows, whether commercial use is allowed, the credit line to print, and when it was checked. The text is fixed. The AI never rewrites it, because a reworded item is no longer the validated item.</p>
<ul>
<li><b>Copy the questionnaire text</b> copies the stem, the options and the items with the credit line.</li>
<li><b>Download the item list</b> gives a variable name, label and reverse-scoring flag for each item, ready for a codebook.</li>
<li><b>Score this scale in my data</b> matches items to your columns, reverse-scores the right items, adds a total column (and a band column where the owner publishes bands), and reports your sample's mean, SD and Cronbach's alpha.</li>
</ul>
<p>Today the library holds the Rosenberg Self-Esteem Scale and the Satisfaction With Life Scale. More scales arrive once the owner's original file is checked. Anything you add yourself still needs the owner's permission.</p>
<p><b>Worked example.</b> Paste ten columns named RSES_01 to RSES_10 with answers coded 0 to 3. Press Parse data on the Statistics tab, open the Scales tab, pick the Rosenberg scale and press Score this scale in my data. A column named RSES_total appears.</p>`
  },
  {
    id: "numcheck",
    group: "Tools",
    title: "Check the numbers in my document",
    keywords: "numbers check p value recompute apa statistics reporting errors",
    html: `<p>Open the <b>Check numbers</b> tab of Collection and analysis and press <b>Check the numbers in my document</b>. It finds results written in the usual APA order, such as <i>t(21) = 2.15, p = .043</i>, recomputes p from the statistic and degrees of freedom, and marks each one as matching, close, or wrong. An effect size or a confidence interval between the statistic and p is fine (<i>t(21) = 2.15, d = 0.47, p = .043</i>), and so is a semicolon. Write <i>one-tailed p</i> and the check uses the one-tailed value.</p>
<p>It catches typos, rounding slips, and a p that was written as significant when the numbers say otherwise. It cannot tell you whether you picked the right test.</p>`
  },
  {
    id: "charts",
    group: "Tools",
    title: "Charts",
    keywords: "chart graph bar line venn figure picture",
    html: `<p>On the <b>Charts</b> tab of Collection and analysis, Quick chart draws bar and line charts from numbers you type or paste, and two- or three-circle Venn diagrams. Add the finished chart to your document with one press.</p>
<p>Label the axes with units, and give every figure a caption in the text.</p>`
  },
  {
    id: "pictures",
    group: "Tools",
    title: "Pictures and captions",
    keywords: "picture photo image crop rotate eyes face identity black bar pixelate background caption figure table number apa",
    html: `<p>Insert a picture with <b>Image</b>. Tap the picture, then press <b>Edit picture</b>. You can turn it, <b>Crop</b> it, change brightness and contrast, and hide a participant's identity: <b>Black bar</b> over the eyes or the whole face, <b>Pixelate</b>, or <b>Plain background</b> (you draw the outline by hand; there is no automatic cut-out yet). Pick a tool, then drag on the picture. <b>Undo</b> steps back.</p>
<p>A black bar hides a face far more safely than pixels, because pixelation can sometimes be partly undone. Whatever you hide, say so in the caption. Tick the caption box and the app writes a first draft of that note for you to check.</p>
<p>On a laptop, press <b>Open in a bigger window</b> in the picture editor, or <b>Photo studio</b> under <b>More</b> in the toolbar, for a full-size canvas in its own window. It adds <b>Blur</b>, <b>Box</b>, <b>Arrow</b>, <b>Pen</b> and <b>Text</b> for labelling, flips, sharpen, a border, resize, redo, and a colour-strength slider. Press <b>Done</b> and the picture goes back to the same place, with its caption. Keep the Appuscholar tab open while the studio is open. <b>Save a copy</b> downloads the picture instead.</p>
<p>The picture is redrawn when you press <b>Use this picture</b>, so hidden camera data such as the place and time a photo was taken is removed.</p>
<p><b>Caption</b> adds "Figure 1" or "Table 1" with your title above the picture or table, the way APA 7 shows it. Numbers follow the order in your document and update when you add or remove one. Check what your journal or university asks for. Some want the caption below. References in your text, such as "see Figure 2", do not change by themselves, so reread them after you reorder.</p>`
  },
  {
    id: "qual",
    group: "Tools",
    title: "Qualitative Coding",
    keywords: "qualitative coding codes themes interview thematic tag passage export markdown",
    html: `<p>On the <b>Coding</b> tab of Collection and analysis, select a passage in your document, then tap a code to tag it. Codes can sit under other codes, so related ideas group into themes. Coding works across all the documents in the open study. <b>Export all coded passages</b> gives you a Markdown file with each code and the passages under it.</p>
<p><b>Worked example.</b> Paste an interview transcript. Make top-level codes such as <i>stress sources</i> and <i>coping</i>. Select a sentence about exam fear, tap the stress code, then move on. When you finish, export and read each code's passages together.</p>
<p>Coding is your judgment. The tool only keeps the tags.</p>`
  },
  {
    id: "style",
    group: "Tools",
    title: "My Writing Style",
    keywords: "style writing voice learn files upload profile train",
    html: `<p>On the <b>My style</b> tab of Writing, upload your own earlier writing, up to 100 files in Word, PDF or text. Appuscholar writes a short profile of your style: sentence length, tone, habits. Switch on <b>Use my style in suggestions</b> and the AI follows the profile.</p>
<p>You can edit the profile by hand. Only your own writing belongs in it. Files you did not write will pull the voice away from yours.</p>`
  },
  {
    id: "cite",
    group: "Tools",
    title: "Citation Manager",
    keywords: "citation cite reference apa mla chicago doi source bibliography cross-check",
    html: `<p>The Citation Manager is the <b>Citations</b> tab of Literature. Source types are journal article, book, book chapter, report, thesis or dissertation, conference paper and website; the form shows the extra fields each one needs. Choose a style: APA 7th or 6th, MLA 9th, Chicago (author-date), Harvard, Vancouver, IEEE or AMA 11th. Journal names and book titles come out in italics where the style asks for it. For a website, fill the month, day and the date you accessed it. Vancouver, IEEE and AMA are numbered: the number is the source's place in your library, so check the order against your text before you submit. Compare one finished entry per style with the manual or your journal's rules. Add a source by typing the fields, or paste a DOI, a link, a PubMed ID, a full reference or just a title and press <b>Fill from DOI, link, PubMed ID or title</b>. Check what it filled. Then insert the citation into your text.</p>
<p><b>Cross-check citations and references</b> compares what you cited in the text with your reference list. It lists citations with no reference, references nobody cited, and near-matches such as a misspelled author name.</p>
<p>It checks consistency. It does not confirm that a paper says what you claim it says. Read the paper.</p>
<p>Check that sources exist asks Crossref about each source in your library and says whether the title, year and first author match. A source that is not found may simply not be indexed there, as with many books, reports and Hindi sources, so treat it as a prompt to look again. With a numbered style, the library also warns when your text cites a number that has no source.</p>
<p>Insert reference list puts a formatted list in your document, with italics and a hanging indent. Author-date styles are sorted by surname. Numbered styles follow the library order.</p>`
  },
  {
    id: "appu",
    group: "Help",
    title: "Ask Appu (the guide helper)",
    keywords: "appu helper assistant ask question guide",
    html: `<p>Open the Guide from Help and type a question in <b>Ask Appu</b>. Appu finds up to three guide sections that match, sends them with your question to your AI provider through Appuscholar's server, and answers from those sections only. If the guide does not cover it, Appu says so.</p>
<p>Appu cannot see your documents or data. It will not rule on ethics, consent or law. Those questions go to your supervisor or ethics committee. Without an AI key, Appu lists the matching sections instead.</p>`
  },
  {
    id: "chat",
    group: "Tools",
    title: "Ask Appuscholar",
    keywords: "ask chat question study buddy insert",
    html: `<p>In Writing, open <b>Chat</b> beside the document. It is a chat for questions about your writing or your method. Every reply has an <b>Insert into document</b> button. It only knows what you type here. It cannot see your data unless you paste it, and it should not be given participant details.</p>`
  },
  {
    id: "slides",
    group: "Tools",
    title: "Make PPT",
    keywords: "slides powerpoint ppt presentation heading pptx",
    html: `<p>On the <b>Make PPT</b> tab of Review, your Heading 1, Heading 2 and Heading 3 styles become slide breaks. Text under a heading becomes bullet points. A picture goes on the slide it sits under, and only the first picture on a slide is used. Press <b>Generate slide preview</b>, check it, then download the .pptx.</p>`
  },
  {
    id: "data",
    group: "Practice",
    title: "Handling participant data",
    keywords: "participant data privacy personal names code key pseudonymisation anonymisation consent dpdp identifiers",
    html: `<p>The Statistics tab flags columns that look like identifiers. For each one you choose to remove it, replace it with a code (P001, P002, and so on), or keep it. If you use codes, you download a key file that maps each code back to the person.</p>
<p>Coding is <b>pseudonymisation</b>. It is weaker than anonymisation. While the key file exists, the data still counts as personal data. Store the key file apart from the coded data, for example on a different drive. If you lose it, nobody can recover the names.</p>
<p>The scan reads column headings and the shape of the values. It cannot see a name typed inside an open answer. Read long text answers yourself before they go anywhere, including to an AI provider.</p>
<p>Before text goes to an AI provider, Appuscholar looks for email addresses, phone numbers and ID numbers and asks whether to mask them. It cannot find a name inside a sentence. Never paste participant names into an AI box.</p>`
  },
  {
    id: "habits",
    group: "Practice",
    title: "Habits that keep your own thinking in the work",
    keywords: "habits thinking integrity ai honesty disclose declare supervisor viva export locked account",
    html: `<ul>
<li>Write the first version yourself. Use the AI on your draft, not in place of it.</li>
<li>Read every source you cite. Appuscholar can mislabel a paper, and so can any AI.</li>
<li>Run <b>AI text</b> before you submit. Be ready to explain every highlighted passage.</li>
<li>Follow your institution's rule on AI help and say where the AI helped. Rules differ between institutions, so ask your supervisor and put the answer in writing.</li>
<li>Practise the viva question. If you cannot defend a paragraph aloud, rewrite it.</li>
<li>Your work is saved in your account, sealed with your passphrase when the vault is on. Once a week, press <b>Export all my work</b> in Help to download a copy, and keep it somewhere safe. The export is a readable zip, so a <b>Locked backup</b> is the one to keep in email or a cloud drive, because only its passphrase opens it. Press <b>Check a backup file</b> now and then to see that a copy opens.</li>
</ul>`
  },
  {
    id: "never",
    group: "Practice",
    title: "What Appuscholar will not do",
    keywords: "will not never limits diagnosis legal medical advice submit invent data supervisor account save",
    html: `<ul>
<li>It does not invent data, and it does not run a test on numbers you did not give it.</li>
<li>It does not send your text to an AI provider until you press an AI button. Your work is saved in your account as you write, sealed with your passphrase when the vault is on.</li>
<li>It does not replace your supervisor, your ethics committee or a lawyer.</li>
<li>It does not diagnose. A score on a screening scale is information for a trained professional.</li>
<li>It does not submit anything for you.</li>
<li>It does not guarantee that a result, a citation or an AI answer is correct.</li>
</ul>`
  },
  {
    id: "faq",
    group: "Help",
    title: "Questions people ask",
    keywords: "faq problem error key stopped lost work backup hindi english slow quota rate limit account vault passphrase export restore",
    html: `<p><strong>The AI says my key failed.</strong> Press the AI pill at the top right (it reads <b>AI: Gemini</b>, or the name of your provider) to open the AI connection window, press <b>Test</b>, and read the message under the buttons. If the key was refused, press <b>Change key</b> and paste a new one. Free keys run out of quota. If you saved a second key for another provider, Appuscholar tries it automatically.</p>
<p><strong>My work vanished.</strong> Your work is saved in your account, so clearing site data, switching browsers or moving to another computer does not remove it. Sign in again. If a study looks empty, press the <b>Appuscholar</b> name at the top left to see all your studies, and if the page says your vault is locked, type your passphrase. If you lose both your passphrase and your recovery sheet, locked work cannot be recovered. Press <b>Export all my work</b> in Help every week and keep the file somewhere safe. Papers on the Reading shelf are in that file, and the shelf also has its own <b>Back up the shelf</b> button. To put a backup file back, press <b>Restore from backup</b> in Help: it adds the studies in the file as new studies named (restored) and never changes or replaces the ones you already have.</p>
<p><strong>Which test do I use?</strong> Open the Statistics tab of Collection and analysis and press <b>Open the guide</b> under <b>Which test fits my data?</b></p>
<p><strong>The p-value looks different from SPSS.</strong> Check whether SPSS ran a Student or a Welch t-test and whether it reports a one- or two-tailed p. Appuscholar reports two-tailed p and uses Welch by default.</p>
<p><strong>Something stayed in English after I chose Hindi.</strong> Test names and citation styles stay in English on purpose. The guide and the statistics text are still English only.</p>
<p><strong>Something is broken.</strong> Open Help and press <b>Report a problem</b>.</p>`
  },
  {
    id: "gloss",
    group: "Help",
    title: "Glossary",
    keywords: "glossary p value effect size confidence interval alpha omega reliability normality welch hedges cohen pseudonymisation degrees of freedom",
    html: `<ul>
<li><b>p-value.</b> How often data this extreme would turn up if there were no real effect. A small p does not mean a large or useful effect.</li>
<li><b>Effect size.</b> How big the difference or relationship is, in a unit you can compare across studies, such as Hedges' g or r.</li>
<li><b>Degrees of freedom.</b> The number of values that are free to vary once the statistic is fixed. Reported in brackets after the test letter.</li>
<li><b>Cronbach's alpha.</b> How consistently the items of one scale hang together. Reverse-score negatively worded items first.</li>
<li><b>McDonald's omega.</b> A reliability estimate that does not assume every item counts equally. It is usually the better choice.</li>
<li><b>Welch test.</b> A t-test or ANOVA that does not assume equal spread in each group. Safe to use by default.</li>
<li><b>Hedges' g.</b> Standardised difference between two means, corrected for small samples.</li>
<li><b>Pseudonymisation.</b> Swapping identifiers for codes while a key still exists. People can be re-identified with the key.</li>
<li><b>Anonymisation.</b> Removing identifiers so that nobody can be identified, even by whoever collected the data.</li>
</ul>`
  }
];
