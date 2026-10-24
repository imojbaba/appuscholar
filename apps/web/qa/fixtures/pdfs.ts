import { MARK, seeded } from "./common";

/**
 * Twenty invented two-page papers for the Reading shelf, as PDFs written by hand (spec section 11; tools-e.md row 5 used 20 two-page papers, paper 07 with a six-sentence
 * paragraph on page 2). No dependency makes them: a PDF is a few objects of plain text, Helvetica (and its bold) and the text operators (BT, Tf, Td, Tj, T*), with the cross-reference
 * table counted by hand. They are read by the shelf's own reader, pdf.js, as `apps/web/e2e/fixtures/shelf-paper.pdf` is.
 *
 * Page 1 holds the title (the shelf's title guess is the first line of the first page), the authors, a line with the run's MARK, an abstract, an introduction and the method.
 * Page 2 holds the results, a discussion, a limitation and a conclusion. Every paper, its study and its numbers are made up; the text is plain ASCII so that no encoding matters.
 * Paper 07's discussion is PAPER07_PARAGRAPH, six sentences with no quotation mark, digit or hyphen, so that the Closeness check counts the same words that a reader does.
 */

/** The six sentences of paper 07's page 2, one by one: a test copies one of them into a thesis draft. */
export const PAPER07_SENTENCES: readonly string[] = [
  "Students who read aloud in small groups answered more comprehension questions correctly than students who read the same chapter alone.",
  "The gain was largest for pupils whose home language differed from the language of the textbook.",
  "Teachers reported that the weaker readers stopped hiding behind the stronger ones once the groups were kept to four.",
  "Several pupils asked to take the chapter home so that they could practise the hard words with a younger sibling.",
  "We therefore read the effect as the result of repeated and low risk speaking, and not of extra time on the task.",
  "A larger trial with a control group that also receives group time is needed before this explanation is accepted."
];
/** Paper 07's known paragraph (page 2 of `paper-07.pdf`). */
export const PAPER07_PARAGRAPH: string = PAPER07_SENTENCES.join(" ");

type Paper = {
  title: string;
  authors: string;
  year: number;
  abstract: string;
  intro: string;
  /** What was measured, as a noun phrase. */
  measure: string;
  /** The two arms of the study: the one that was tried, and the one it was compared with. */
  arms: [string, string];
  /** One sentence for the discussion (paper 07 has a paragraph instead). */
  finding: string;
};

const PAPERS: readonly Paper[] = [
  {
    title: "Evening reading groups and school attendance in small villages", authors: "Deshmukh, R., and Iyer, S.", year: 2019,
    abstract: "We asked whether an evening reading group held in the village hall changed how often Class Nine pupils came to school. Pupils who joined the group missed fewer days than pupils who did not, although the two groups differed in their homes.",
    intro: "Many families depend on older children for field work, so every school day is a choice that someone has to make.",
    measure: "days of school attended", arms: ["evening", "comparison"],
    finding: "Attendance rose most among pupils whose families farmed their own land, which suggests that the group gave them a reason to come that outweighed the pull of work."
  },
  {
    title: "Sleep routines and exam worry among first-year college students", authors: "Menon, K., and Walker, T.", year: 2020,
    abstract: "Students who kept a fixed bedtime for a fortnight reported less worry about their examinations than students who slept whenever they could. Worry was rated each morning in a short diary.",
    intro: "Examination weeks are known to cut sleep, and poor sleep is in turn linked to a harder time with memory and mood.",
    measure: "morning worry about examinations", arms: ["fixed bedtime", "free bedtime"],
    finding: "The effect was clearest in the second week, once the new bedtime had become a habit and no longer felt like a rule."
  },
  {
    title: "Phone use after dark and attention in the morning class", authors: "Kaur, H., and Naik, V.", year: 2021,
    abstract: "We compared pupils who put their phones away at nine in the evening with pupils who kept using them. Teachers rated attention in the first lesson of the day without knowing which pupils had changed their habits.",
    intro: "Mobile phones reached many villages faster than reliable electricity, and the evening hours are now shared between screens and study.",
    measure: "attention in the first lesson", arms: ["early phone-off", "usual phone use"],
    finding: "Teachers noticed the difference most in the first lesson and least after the midday meal."
  },
  {
    title: "School meals and the length of attention in primary classes", authors: "Thomas, J., and Sheikh, R.", year: 2018,
    abstract: "A hot meal served in the middle of the morning was followed by longer spells of attention than a meal at noon. Observers timed how long pupils stayed on a task before looking away.",
    intro: "Hunger is easy to see in a classroom, but its effect on attention has rarely been timed.",
    measure: "minutes of steady attention", arms: ["mid-morning meal", "noon meal"],
    finding: "Observers saw the largest gains in the last lesson before the meal, when hungry pupils usually lose the thread."
  },
  {
    title: "Peer tutoring in mathematics for Class Eight", authors: "Bose, A., and Hughes, L.", year: 2017,
    abstract: "Pupils paired with a stronger classmate for one lesson a week gained more in mathematics than pupils taught only by their teacher. The stronger pupils did not lose marks by teaching.",
    intro: "A teacher with seventy pupils cannot answer every question, so pupils have long relied on each other.",
    measure: "marks in mathematics", arms: ["peer tutoring", "teacher only"],
    finding: "The stronger classmates reported that explaining a method showed them where their own understanding was thin."
  },
  {
    title: "Teaching in the home language and the first years of reading", authors: "Reddy, S., and Fernandes, M.", year: 2016,
    abstract: "Children who learned their first letters in the language spoken at home read simple sentences sooner than children taught in the state language. The gap narrowed once both groups had learned the sounds of the second language.",
    intro: "For many children the language of the classroom is not the language of the kitchen.",
    measure: "simple sentences read aloud", arms: ["home language", "state language"],
    finding: "Parents of children in the home language group were more likely to listen to their children read aloud in the evening."
  },
  {
    title: "Reading aloud in small groups and textbook comprehension in Class Eight", authors: "Joshi, P., and Bennett, A.", year: 2022,
    abstract: "Pupils who read a textbook chapter aloud in small groups understood it better than pupils who read the same chapter alone. We tested comprehension with a short set of questions on the day after the reading.",
    intro: "Silent reading is the usual task in a crowded classroom, but it hides the pupils who cannot follow the page.",
    measure: "comprehension questions answered correctly", arms: ["reading", "solo reading"],
    finding: PAPER07_PARAGRAPH
  },
  {
    title: "A library cupboard in the village school and borrowing at home", authors: "Ansari, F., and Mondal, D.", year: 2019,
    abstract: "Schools that kept a small locked cupboard of storybooks lent them out more often than schools that kept the same books in the head teacher's office. Borrowing was recorded in a notebook that the pupils kept themselves.",
    intro: "A book that nobody can see is a book that nobody asks for.",
    measure: "books borrowed per pupil", arms: ["library cupboard", "office shelf"],
    finding: "The notebook records show that most books went home with pupils who had never borrowed anything before."
  },
  {
    title: "Homework time and sleep in Class Ten", authors: "Sharma, N., and Das, P.", year: 2020,
    abstract: "When homework was cut to a single task a night, pupils slept longer and reported less tiredness in the morning. Marks on the monthly test did not fall.",
    intro: "Homework is meant to practise what was taught, yet it is often the reason pupils stay awake.",
    measure: "hours of sleep", arms: ["single task homework", "usual homework"],
    finding: "Pupils said that they used the saved time to help at home or to rest, and rarely to study more."
  },
  {
    title: "Girls' travel to school and attendance across the monsoon", authors: "Gaikwad, S., and Thomas, E.", year: 2018,
    abstract: "Girls given a bicycle for the school journey missed fewer days in the monsoon months than girls who walked. The effect was largest where the road crossed a stream.",
    intro: "The journey to school is a hidden part of the school day, and it is longer for girls in scattered settlements.",
    measure: "days attended in the monsoon", arms: ["bicycle scheme", "walking"],
    finding: "Parents said that a bicycle shortened the time their daughters spent on the road and so made them feel safer."
  },
  {
    title: "Written feedback with a question and the revision of short essays", authors: "Pawar, G., and Walker, S.", year: 2021,
    abstract: "Short essays came back better revised when the teacher wrote a question in the margin than when the teacher wrote only a grade. Pupils were asked to rewrite one paragraph after reading the comment.",
    intro: "A grade tells a pupil how the essay was received but not what to change.",
    measure: "quality of the rewritten paragraph", arms: ["margin question", "grade only"],
    finding: "Pupils answered the margin question in nearly every revision, which a bare grade never prompted."
  },
  {
    title: "Noise in the classroom and the memory of spoken instructions", authors: "Yadav, M., and Hughes, D.", year: 2017,
    abstract: "Pupils remembered fewer spoken instructions when a road or a market could be heard through the window. We repeated the test in a quiet room of the same school.",
    intro: "Many village classrooms open onto a road, and the noise is part of the lesson.",
    measure: "instructions recalled", arms: ["quiet room", "noisy room"],
    finding: "The loss was greatest for instructions with several steps and small for single, short ones."
  },
  {
    title: "A weekly timetable for revision before the board examinations", authors: "Iyer, V., and Kulkarni, R.", year: 2022,
    abstract: "Pupils who wrote a weekly revision timetable studied more evenly across subjects than pupils who revised as they felt. They also reported less rush in the last week.",
    intro: "The final weeks before an examination are often spent on the subject that frightens a pupil most.",
    measure: "hours of revision in the weakest subject", arms: ["written timetable", "no timetable"],
    finding: "The timetable did not raise the total hours, but it moved hours from favourite subjects to neglected ones."
  },
  {
    title: "Breathing practice before a test and calm in the classroom", authors: "Menon, S., and Bose, T.", year: 2019,
    abstract: "A short breathing practice before a test left pupils calmer than the same time spent sitting quietly. Calm was rated by the pupils on a simple scale of faces.",
    intro: "Short exercises are easy to fit into a timetable that has no spare period.",
    measure: "calm before the test", arms: ["breathing practice", "sitting quietly"],
    finding: "Several pupils kept the practice up on their own at home before the evening meal."
  },
  {
    title: "Information about scholarships and school completion in small villages", authors: "Jadhav, K., and Mathew, B.", year: 2018,
    abstract: "Villages visited by a speaker who explained the scholarship forms saw more pupils finish Class Ten than villages without a visit. The talk was held in the school yard with parents present.",
    intro: "Families often do not know which scholarships exist or how to ask for them.",
    measure: "pupils finishing Class Ten", arms: ["scholarship talk", "no talk"],
    finding: "Parents who attended the talk were the most likely to ask the school for the form in the following month."
  },
  {
    title: "Handwritten notes and typed notes in the recall of a lesson", authors: "Das, R., and Fernandes, G.", year: 2020,
    abstract: "Students who wrote notes by hand recalled the main ideas of a lesson better than students who typed them. The difference was clear a week later but small on the same day.",
    intro: "As laptops reach colleges, students ask whether typing is as good as writing.",
    measure: "main ideas recalled after a week", arms: ["handwritten notes", "typed notes"],
    finding: "Handwriting forced students to choose what to write, which may have helped them to understand it."
  },
  {
    title: "Telling mathematics problems as stories in Class Six", authors: "Shinde, A., and Menon, R.", year: 2016,
    abstract: "Word problems told as short stories were solved more often than the same problems in plain form. The stories used characters and places that the pupils knew.",
    intro: "Many pupils can do the sum but cannot see which sum a problem is asking for.",
    measure: "word problems solved", arms: ["story version", "plain version"],
    finding: "The stories helped most with problems that asked pupils to share, to divide or to compare."
  },
  {
    title: "A village notice board and parents' knowledge of school dates", authors: "Verma, L., and D'Souza, K.", year: 2021,
    abstract: "Parents in villages with a public notice board for school news knew more of the term's dates than parents in villages without one. The board was read most on market days.",
    intro: "School news travels by word of mouth, and the word that reaches a parent is often late.",
    measure: "school dates known to parents", arms: ["notice board", "no notice board"],
    finding: "Parents said that the board saved them a trip to the school to ask what a message meant."
  },
  {
    title: "Group study at home and the completion of coursework", authors: "Naik, T., and Bennett, F.", year: 2017,
    abstract: "Pupils who met in a group of three or four to finish their coursework handed in more of it than pupils who worked alone. The groups met in a home chosen by the pupils themselves.",
    intro: "Where there is no quiet room at home, a neighbour's veranda may be a better place to study.",
    measure: "pieces of coursework handed in", arms: ["shared study", "study alone"],
    finding: "Pupils said that having someone wait for them made it harder to put the work off."
  },
  {
    title: "Daylight in the morning and a steady mood in college students", authors: "Rao, U., and Walker, M.", year: 2022,
    abstract: "Students who spent ten minutes outdoors before their first class rated their mood higher through the day than students who stayed indoors. Mood was rated three times a day on a short card.",
    intro: "Mood is rarely taught as part of study skills, although every student knows how it shapes a day.",
    measure: "mood through the day", arms: ["morning daylight", "indoors"],
    finding: "The difference was biggest on cloudy days, when the students would otherwise have seen little daylight at all."
  }
];

const LIMITS = [
  "The pupils were not chosen at random, so the groups may have differed before the study began.",
  "All of the schools were in one district, and the results may not hold elsewhere.",
  "Most of the measures were reported by the pupils themselves and may be too generous.",
  "The study ran for a single term, and we do not know whether the effect lasts.",
  "A few families moved away during the term, and their children could not be followed."
];
const CONCLUSIONS = [
  "The finding is small but steady, and it is worth testing again in more villages.",
  "We think the approach is cheap enough to try in other schools and should be tried with a comparison group.",
  "The result is promising, but it needs a longer follow up before any school changes its timetable.",
  "These results add one more careful study to a small literature and invite others to repeat it."
];

// ---- The PDF ---------------------------------------------------------------------------------------------------------------------------------------

type Line = { text: string; style?: "title" | "heading" };

/** Words on lines of at most `width` characters (about 450 points of 11 point Helvetica; the page's text area is 500). */
function wrap(text: string, width = 86): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) { lines.push(line); line = word; } else line = line ? line + " " + word : word;
  }
  if (line) lines.push(line);
  return lines;
}
const block = (heading: string, text: string): Line[] => [{ text: heading, style: "heading" }, ...wrap(text).map((t) => ({ text: t })), { text: "" }];

/** A PDF string: its backslashes and brackets escaped. The text is plain ASCII. */
function pdfString(s: string): string {
  if (/[^\x20-\x7E]/.test(s)) throw new Error(`QA shelfPdfs: "${s}" holds a character outside ASCII.`);
  return "(" + s.replace(/[\\()]/g, (c) => "\\" + c) + ")";
}

/** The content stream of one page: Helvetica (F1), Helvetica Bold (F2) for the title and the headings, a line at a time (T* moves down by the leading). */
function pageStream(lines: Line[]): string {
  const ops: string[] = ["BT 14 TL 56 756 Td"];
  let font = "";
  lines.forEach((l, i) => {
    if (i > 0) ops.push("T*");
    const want = l.style === "title" ? "/F2 14 Tf" : l.style === "heading" ? "/F2 11 Tf" : "/F1 11 Tf";
    if (l.text && want !== font) { ops.push(want); font = want; }
    if (l.text) ops.push(`${pdfString(l.text)} Tj`);
  });
  ops.push("ET");
  return ops.join(" ");
}

/** A PDF of text pages: catalog, page tree, two fonts, and a content stream and a page object for each page, with the cross-reference table counted by byte. */
function pdfOf(pages: Line[][]): Buffer {
  const first = 5; // objects 1 to 4 are the catalog, the page tree and the two fonts
  const kids = pages.map((_, k) => `${first + 2 * k + 1} 0 R`).join(" ");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  ];
  pages.forEach((lines, k) => {
    const content = pageStream(lines);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${first + 2 * k} 0 R >>`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const LIMIT_AT = (k: number) => LIMITS[k % LIMITS.length]!;
const CONCLUSION_AT = (k: number) => CONCLUSIONS[k % CONCLUSIONS.length]!;

/** One paper, as the two pages of lines. The numbers of the method and the results are drawn from a generator of the paper's own, so each paper has its own. */
function paperPages(k: number): Line[][] {
  const p = PAPERS[k]!;
  const rand = seeded(1_000 + k);
  const n = 60 + 12 * Math.floor(rand() * 15);
  const villages = 2 + Math.floor(rand() * 8);
  const weeks = 4 + Math.floor(rand() * 13);
  const ahead = (1 + rand() * 9).toFixed(1);
  const code = String(k + 1).padStart(2, "0");
  const page1: Line[] = [
    { text: p.title, style: "title" },
    { text: `${p.authors} (${p.year})` },
    ...wrap(`Reference code ${MARK}-${code}. A fictional paper made for the Appuscholar tests. The study and its numbers do not exist.`).map((text) => ({ text })),
    { text: "" },
    ...block("Abstract", p.abstract),
    ...block("Introduction", p.intro),
    ...block("Method", `We followed ${n} pupils from ${villages} villages for ${weeks} weeks. We measured ${p.measure} before the first session and again after the last. Pupils who missed more than a quarter of the sessions were counted as not taking part.`)
  ];
  const page2: Line[] = [
    ...block("Results", `Pupils in the ${p.arms[0]} group ended ${ahead} points ahead of pupils in the ${p.arms[1]} group on ${p.measure}. The gap was smaller for pupils who started with the highest scores.`),
    ...block("Discussion", p.finding),
    ...block("Limitations", LIMIT_AT(k)),
    ...block("Conclusion", CONCLUSION_AT(k))
  ];
  return [page1, page2];
}

/** The papers' file names: `paper-01.pdf` to `paper-20.pdf`. */
export const paperName = (k: number): string => `paper-${String(k + 1).padStart(2, "0")}.pdf`;

/** The title of paper `number` (1 to 20, the number in its file name): the first line of its first page, which is the title the shelf shows for it. */
export function paperTitle(number: number): string {
  const paper = PAPERS[number - 1];
  if (!paper) throw new RangeError(`QA paperTitle: there is no paper ${number}; ${PAPERS.length} are written.`);
  return paper.title;
}

export async function shelfPdfs(n = 20): Promise<Array<{ name: string; bytes: Buffer }>> {
  if (!Number.isInteger(n) || n < 1 || n > PAPERS.length) throw new RangeError(`QA shelfPdfs: ${PAPERS.length} papers are written, and ${n} were asked for.`);
  return PAPERS.slice(0, n).map((_, k) => ({ name: paperName(k), bytes: pdfOf(paperPages(k)) }));
}
