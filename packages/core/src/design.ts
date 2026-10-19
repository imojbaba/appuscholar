import { DESIGN_ITEMS, EC_DOCS, CTRI_FIELDS, PI_ITEMS, BUDGET_DEFAULTS } from "./data/design-tables";
import { aiuDate } from "./aiustatement";

export { DESIGN_ITEMS, EC_DOCS, CTRI_FIELDS, PI_ITEMS, BUDGET_DEFAULTS };

/* v1's Design & Ethics panel (D1), the parts that compute: designRenderDash's count and done rule (index.html:5884-5897), regCompute (5906-5941), protoRead, protoSave and
   protoGenerate (5948-5977), ecMinorsNote (5999-6005), ecToggle's and ecSave's done rules (6006-6028), ecStatement (6029-6046), ecGenerateConsent (6047-6070), ctriToggle's done rule
   and ctriExport (6079-6096), piToggle's and piSave's done rules and piExportCv (6106-6128), budgetRows (6130-6133), budgetEdit's done rule (6145-6151), budgetTotal and budgetExport
   (6162-6176). DESIGN_ITEMS (5875-5882, keys and labels only: v1's `open` functions show the dialogs), EC_DOCS (5978), CTRI_FIELDS (6071), PI_ITEMS (6097) and BUDGET_DEFAULTS (6129)
   are emitted from v1 into data/design-tables.ts (golden:capture design --emit), never retyped. Not ported (the panel's): designGet and designSet (5873-5874), designOpen (5883), the
   *Render and *Load functions, budgetAddRow and budgetRemove (6152-6161, which store the rows and leave `done` as it was), the toasts, the editor insert, the dialogs and the downloads
   (their file names use `new Date().toISOString().slice(0,10)`, the panel's).
   The strings, branch order and early returns are v1's: every line of regCompute's list (the baseline, the drug and device rules, the `[pop]||pop` label, the biospecimen and multi-site
   lines, the DCGI and CTRI lines with `ctriMandatory` and `ctriNote`, the IEC line), the warning under it, the protocol's headings and `[not filled in]`, ecMinorsNote's two arms,
   ecStatement's `c`, `no` and `dt` defaults (dt through aiuDate), its consent sentences and `[Describe how participants gave consent.]`, its five status arms and two minors arms, the
   consent form, ctriExport's `- [x] `/`- [ ] ` lines and count, budgetTotal's `parseFloat(r.amount)||0` and `'Total: ₹'+total.toLocaleString('en-IN')`, budgetExport's markdown
   table with `r.label||'—'`; the done rules exactly as v1 computes them: protoSave `Object.values(o).some(v=>v)`, ecToggle, ctriToggle and piToggle
   `Object.values(s.checklist).some(Boolean)`, ecSave `s.done||!!(s.title||s.pi||s.status)`, piSave `s.done||!!s.cv`, budgetEdit `s.rows.some(r=>parseFloat(r.amount)>0)`, regCompute
   `done:true` (5938).
   What differs from v1's text:
   - types and `export`; the functions take what v1 read from the page: RegState for #regType, #regPop, #regBio and #regMulti; ProtoFields for protoRead's object (the caller trims,
     as protoRead does); EcState for designGet('ec') after ecSave (the caller trims as ecSave does); the checklist, cv and rows for the ctri, pi and budget blobs;
   - regCompute's `lines` are returned (`{ lines }`), REG_WARN is the `p.warn` text it writes under them (v1 writes it with the 📐 into innerHTML; the text has no markup), and its
     `designSet('reg',{…,done:true,savedAt:Date.now()})` is regDone(), the constant true (register row D-W2-11);
   - `showToast(m);return` becomes null (protocolMarkdown: "Fill in at least one section first", DESIGN_TOASTS.protoEmpty) or `{ error: m }` (ethicsStatement, consentMarkdown,
     piCvText); `insertIntoEditor(t,false)` becomes the returned text (ethicsStatement returns its first line, "Ethical considerations", as `heading` and the rest as `text`: v1
     inserts `heading+'\n'+text`); the Blob's text is the returned string (ctriMarkdown, piCvText, budgetMarkdown); ecMinorsNote returns '' where v1 hides #ecMinorsMsg;
   - the two lookup literals, regCompute's popLabel and ecStatement's consent, keep v1's object literal and `||` fallback, cast to Record<string, string> so that a string indexes them;
   - designDashboard takes each blob's done flag and returns the count, the total and the items instead of the HTML (✅ for done, ⬜ otherwise, the buttons: the panel's).
   Register rows: D-W2-11 (the store, insert and toast of regCompute, ecStatement and protoGenerate are the panel's), D-W2-12 (budgetTotalText and budgetMarkdown use
   toLocaleString('en-IN'), pinned in Node and against Wave 0's Chrome fixture). */

export type DesignKey = (typeof DESIGN_ITEMS)[number]["key"];
export type RegState = { type: "drug" | "device" | "interventional" | "observational" | string; pop: "adults" | "minors" | "vulnerable" | "pregnant" | string; bio: boolean; multi: boolean };
export type ProtoFields = { bg: string; obj: string; design: string; part: string; sample: string; proc: string; risk: string; dmp: string };
export type EcState = {
  title: string; pi: string; what: string; risks: string; benefits: string; contact: string; status: string; committee: string; apprNo: string; apprDate: string;
  consentMode: string; minors: string; checklist?: Record<number, boolean>; done?: boolean;
};
export type BudgetRow = { label: string; amount: string };
export type DesignDashboard = { done: number; total: number; items: Array<{ key: DesignKey; label: string; done: boolean }> };

/** The toasts v1 shows on success in this panel, for the panel to show (the refusals are the `error` strings the functions return, and protocolMarkdown's null is `protoEmpty`). */
export const DESIGN_TOASTS = {
  regChecked: "Pathway checked ✓",
  saved: "Saved ✓",
  protoEmpty: "Fill in at least one section first",
  protoInserted: "Protocol inserted into your document ✓",
  ethicsInserted: "Ethics statement inserted. Check every sentence is true.",
  consentInserted: "Consent form inserted into your document ✓",
  exported: "Exported ✓",
} as const;

/** The `p.warn` regCompute writes under the list (5935). */
export const REG_WARN = "📐 This is a starting checklist built from general ICMR/CDSCO guidance, not a ruling on your specific study. Confirm the final requirement with your own institution's Ethics Committee.";

export function regPathway(s: RegState): { lines: string[] } {
  const type=s.type,pop=s.pop,bio=s.bio,multi=s.multi;
  const lines=['ICMR National Ethical Guidelines for Biomedical and Health Research Involving Human Participants (2017) — the baseline guideline for every study on this list.'];
  let dcgi=false,ctriMandatory=true,ctriNote='';
  if(type==='drug'){
    lines.push('New Drugs and Clinical Trials Rules, 2019 (CDSCO) applies — this is an investigational drug trial.');
    dcgi=true; ctriNote='Mandatory, and prospective — register before the first participant is enrolled.';
  }else if(type==='device'){
    lines.push("Medical Device Rules, 2017 (CDSCO) applies — this is an investigational device trial. A brain-wave or neuro device usually falls under this unless it's already a licensed, unmodified medical device used strictly within its approved purpose.");
    dcgi=true; ctriNote="Mandatory for most device clinical investigations — confirm your device's risk classification with your EC.";
  }else if(type==='interventional'){
    ctriNote='Mandatory. A behavioral or psychological intervention compared against a control or another condition counts as a clinical trial under the WHO/ICMR definition, whatever your department calls it.';
  }else{
    ctriMandatory=false;
    ctriNote='Not legally mandatory for a purely observational study, but registering anyway is increasingly expected — many journals now ask for it at submission.';
  }
  if(pop!=='adults'){
    const popLabel=({minors:'minors',vulnerable:'cognitively impaired or institutionalised adults',pregnant:'pregnant women'} as Record<string, string>)[pop]||pop;
    lines.push('Vulnerable population ('+popLabel+') — expect your EC to require extra safeguards: assent plus guardian consent, an independent advocate, or additional institutional sign-off on top of the standard package. Build in extra review time.');
  }
  if(bio)lines.push("Biological samples — add a separate biospecimen consent clause; for genetic material, check whether ICMR's biobanking guidance or a material-transfer agreement applies.");
  if(multi)lines.push("Multi-site — each site normally needs its own EC approval, or a lead/central EC with the other sites' written concurrence. Confirm which model your sites use before you register.");
  lines.push((dcgi?'DCGI approval: likely required. Apply through CDSCO\'s SUGAM portal once your protocol and EC approval are in hand.':'DCGI approval: not triggered by this design.'));
  lines.push('CTRI registration: '+(ctriMandatory?'mandatory':'not mandatory')+'. '+ctriNote);
  lines.push('Institutional Ethics Committee (IEC) approval is required before enrollment starts, regardless of the above.');
  return {lines};
}
/** regCompute stores `done:true` whenever it runs (5938). */
export function regDone(): true {return true}

/** protoSave's done rule (5955). */
export function protoDone(o: ProtoFields): boolean {return Object.values(o).some(v=>v)}
/** protoGenerate's document (5961-5970), or null when every field is empty (v1 toasts DESIGN_TOASTS.protoEmpty and stops). */
export function protocolMarkdown(o: ProtoFields): string | null {
  if(!Object.values(o).some(v=>v)){return null}
  const doc='# Research protocol / synopsis\n\n'
    +'## Background & rationale\n'+(o.bg||'[not filled in]')+'\n\n'
    +'## Objectives & hypotheses\n'+(o.obj||'[not filled in]')+'\n\n'
    +'## Design\n'+(o.design||'[not filled in]')+'\n\n'
    +'## Participants — inclusion & exclusion criteria\n'+(o.part||'[not filled in]')+'\n\n'
    +'## Sample size & justification\n'+(o.sample||'[not filled in]')+'\n\n'
    +'## Procedures\n'+(o.proc||'[not filled in]')+'\n\n'
    +'## Risks & benefits\n'+(o.risk||'[not filled in]')+'\n\n'
    +'## Data management plan\n'+(o.dmp||'[not filled in]')+'\n\n'
    +'## References\n[add citations from the Citation Manager]\n';
  return doc;
}

/** The text of #ecMinorsMsg for #ecMinors' value, or '' where v1 hides it. */
export function ecMinorsNote(m: string): string {
  if(m==='yes'||m==='unsure'){
    return (m==='yes'?'':'Settle this before you collect data. ')+'Participants under 18 usually need a parent or guardian to give written permission, plus the young person\'s own agreement, and a committee that has approved this. In India a person under 18 is a child under the data-protection law, so extra care applies to their data. Ask your committee and your supervisor. Appuscholar is for adults and does not collect children\'s data itself.';
  }else return '';
}

/** ecToggle, ctriToggle and piToggle's done rule (6008, 6081, 6108). */
export function checklistDone(checks: Record<number, boolean>): boolean {return Object.values(checks).some(Boolean)}
/** ecToggle's done rule (6008), on the state after the tick is stored. */
export function ecDoneAfterToggle(s: { checklist: Record<number, boolean> }): boolean {return checklistDone(s.checklist)}
/** ecSave's done rule (6025), on the state after the fields are stored (`done` is the flag before the save). */
export function ecDoneAfterSave(s: Pick<EcState, "title" | "pi" | "status" | "done">): boolean {return s.done||!!(s.title||s.pi||s.status)}

export function ethicsStatement(s: Pick<EcState, "status" | "committee" | "apprNo" | "apprDate" | "consentMode" | "minors">): { heading: "Ethical considerations"; text: string } | { error: "Choose where things stand first" } {
  if(!s.status){return {error:'Choose where things stand first'}}
  const c=s.committee||'[committee name]',no=s.apprNo?' (reference '+s.apprNo+')':' (reference [number])',dt=s.apprDate?' on '+aiuDate(s.apprDate):' on [date]';
  const consent=({written:'Each participant read the information sheet and signed a consent form before taking part.',online:'Each participant read the information sheet and ticked a consent box before the online form opened.',verbal:'Each participant gave spoken consent, which the researcher recorded before the session began.',waived:'The committee waived the need for consent.'} as Record<string, string>)[s.consentMode]||'[Describe how participants gave consent.]';
  let t='';
  if(s.status==='approved')t='The study was approved by '+c+no+dt+'. '+consent;
  else if(s.status==='applied')t='[The study has been submitted to '+c+' and a decision is awaited. Do not write that the study was approved until you hold the approval letter.] '+consent;
  else if(s.status==='noreview')t='The study was brought to '+c+', which decided in writing that full ethics review was not needed'+no+dt+'. '+consent;
  else if(s.status==='nohuman')t='The study did not involve human participants.';
  else t='[The study has not yet been sent to an ethics committee. Do not collect data until it has been.]';
  if(s.minors==='yes')t+=' [Some participants were under 18. State how a parent or guardian gave permission and how the participants gave their own assent.]';
  else if(s.minors==='unsure')t+=' [State whether any participant was under 18.]';
  return {heading:'Ethical considerations',text:t};
}

export function consentMarkdown(s: Pick<EcState, "title" | "pi" | "what" | "risks" | "benefits" | "contact">): string | { error: string } {
  if(!s.title||!s.pi){return {error:'Fill in at least the study title and PI/institution first'}}
  const doc='# Informed Consent Form\n\n'
    +'**Study title:** '+s.title+'\n\n'
    +'**Principal investigator:** '+s.pi+'\n\n'
    +'## What this study involves\n'+(s.what||'[describe]')+'\n\n'
    +'## Risks and discomforts\n'+(s.risks||'[describe]')+'\n\n'
    +'## Benefits\n'+(s.benefits||'[describe]')+'\n\n'
    +'## Voluntary participation\n'
    +'Taking part in this study is entirely voluntary. You may refuse to participate, or withdraw at any point, without giving a reason and without any penalty or loss of benefit you would otherwise be entitled to.\n\n'
    +'## Confidentiality\n'
    +'Your responses will be kept confidential, stored securely, and reported only in a form that does not identify you personally, except where required by law.\n\n'
    +'## Questions or complaints\n'+(s.contact||"[PI contact and your institution's EC contact]")+'\n\n'
    +'## Consent\n'
    +'I have read and understood the above, had the chance to ask questions, and agree to take part in this study.\n\n'
    +'Participant signature: ______________________  Date: __________\n\n'
    +'Researcher signature: ______________________  Date: __________\n';
  return doc;
}

/** ctriExport's markdown (6085-6089), from `appu_design_ctri.checklist`. */
export function ctriMarkdown(checks: Record<number, boolean>): string {
  const n=CTRI_FIELDS.filter((f,i)=>checks[i]).length;
  const md='# CTRI registration readiness\n\n'+n+' of '+CTRI_FIELDS.length+' fields ready\n\n'
    +CTRI_FIELDS.map((f,i)=>'- ['+(checks[i]?'x':' ')+'] '+f).join('\n')+'\n\n'
    +'This is a readiness check, not a CTRI submission — the actual registration happens on ctri.nic.in.\n';
  return md;
}

/** piSave's done rule (6114), on the state after the trimmed cv is stored (`done` is the flag before the save). */
export function piDone(s: { done?: boolean; cv: string }): boolean {return s.done||!!s.cv}
/** piExportCv's file text (6118-6127): the stored (trimmed) cv, or the refusal. */
export function piCvText(cv: string): string | { error: string } {
  if(!cv){return {error:'Fill in the CV field first'}}
  return cv;
}

/** budgetRows (6130-6133): the stored rows, or the defaults with empty amounts when none are stored. */
export function budgetRows(saved: BudgetRow[] | undefined | null): BudgetRow[] {
  return (saved&&saved.length)?saved:BUDGET_DEFAULTS.map(l=>({label:l,amount:''}));
}
export function budgetTotal(rows: readonly BudgetRow[]): number {return rows.reduce((sum,r)=>sum+(parseFloat(r.amount)||0),0)}
/** #budgetTotal's text (6164). */
export function budgetTotalText(rows: readonly BudgetRow[]): string {
  const total=budgetTotal(rows);
  return 'Total: ₹'+total.toLocaleString('en-IN');
}
/** budgetExport's markdown (6167-6171). */
export function budgetMarkdown(rows: readonly BudgetRow[]): string {
  const total=rows.reduce((sum,r)=>sum+(parseFloat(r.amount)||0),0);
  const md='# Trial budget estimate\n\n| Item | Amount (₹) |\n|---|---|\n'
    +rows.map(r=>'| '+(r.label||'—')+' | '+(parseFloat(r.amount)||0).toLocaleString('en-IN')+' |').join('\n')
    +'\n| **Total** | **'+total.toLocaleString('en-IN')+'** |\n';
  return md;
}
/** budgetEdit's done rule (6148), on the rows after the edit. */
export function budgetDone(rows: readonly BudgetRow[]): boolean {return rows.some(r=>parseFloat(r.amount)>0)}

/** designRenderDash's count and items (5884-5897): an item is done when its blob's `done` is truthy. */
export function designDashboard(done: Partial<Record<DesignKey, boolean>>): DesignDashboard {
  const items=DESIGN_ITEMS.map(i=>({key:i.key,label:i.label as string,done:!!done[i.key]}));
  return {done:items.filter(i=>i.done).length,total:DESIGN_ITEMS.length,items};
}
