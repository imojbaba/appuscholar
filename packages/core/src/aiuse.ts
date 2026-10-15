/** Port of v1 AIU_RULES and aiuClassify (index.html:5405-5445). Order matters: first match wins. */
export type AiUseGroup = "text" | "feedback" | "explain" | "other";

const AIU_RULES: Array<[RegExp, string, AiUseGroup]> = [
  [/^Continue this writing/, "continuing my draft", "text"],
  [/^Improve this text/, "grammar and polish", "text"],
  [/^Expand this text/, "expanding my text", "text"],
  [/^Translate the following English academic quotation/, "translating a quotation into Hindi", "text"],
  [/academic writing assistant[^]{0,80}Below are/, "drafting a literature review paragraph from selected abstracts", "text"],
  [/APA 7th edition formatting expert/, "formatting statistics output in APA style", "text"],
  [/thesis supervisor reading/, "feedback on my draft", "feedback"],
  [/ask exactly ONE realistic, probing question/, "practice viva questions", "feedback"],
  [/Argue against the passage below/, "counter-arguments to my passage", "feedback"],
  [/find a research gap/, "looking for research gaps in selected abstracts", "feedback"],
  [/judge whether a project idea is realistic/, "checking whether my project idea is realistic", "feedback"],
  [/academic writing coach[^]{0,60}Using the text/, "advice on building a literature review", "feedback"],
  [/Summari[sz]e the (research|paper) text below/, "summarising a paper", "explain"],
  [/helping a [^]{0,40}read a paper/, "summarising a paper", "explain"],
  [/tutor helping a student[^]{0,40}study/, "analysing a case description", "explain"],
  [/^Explain the [^]{0,40}concept/, "explaining a concept", "explain"],
  [/statistics tutor/, "explaining statistics output in plain words", "explain"],
  [/^You are a careful English grammar and usage checker/, "checking grammar and wording", "text"],
  [/bilingual English and Hindi dictionary helper/, "looking up a word", "explain"],
  [/^You are reading the abstract of one research paper/, "reading one abstract quickly", "explain"],
  [/^You are (Professor RAJ|Dr Shuddhi Grant), an AI teaching character/, "asking a teaching character about the practice paper", "explain"],
  [/^You are screening search results for a student/, "ranking search results", "explain"],
  [/^You help a student of .{0,60} search research databases/, "suggesting search terms", "explain"],
  [/^Paraphrase the passage below in the voice/, "trying my style on a practice passage", "explain"],
  [/studying the writing style|^Analyze the writing style/, "describing my writing style", "explain"],
  [/scholarly writing coach/, "answering a writing question", "explain"]
];

/** Kind of help a prompt represents, or null for the Appu help assistant (not logged). */
export function classifyAiUse(prompt: string): { k: string; g: AiUseGroup } | null {
  const p = String(prompt || "");
  if (/^You are Appu, the help assistant/.test(p)) return null;
  const head = p.slice(0, 400);
  for (const [re, k, g] of AIU_RULES) if (re.test(head)) return { k, g };
  return { k: "other help", g: "other" };
}
