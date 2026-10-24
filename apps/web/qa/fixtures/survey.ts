import { MARK, pick, seeded } from "./common";

/**
 * The invented class survey (spec section 11): 120 pupils of eight invented villages, with their ages, five Likert items, a score and an open answer. Every name, village and
 * answer is made up; nothing in it is a real person or place. The file is the same from one call to the next apart from the MARK.
 *
 * Its shapes are the ones the walk sheets name (docs/walkthroughs/tools-b.md rows 1 to 4, notes/2026-10-23-tools-walk.md F1):
 *  - `sep: ";"` writes the file as Excel saves it where a comma is the decimal mark: no quotes round a comma, and one `score` is written with a decimal comma. The Statistics
 *    tab reads such a file as one column and offers "Split on semicolons"; after the split the decimal comma makes `score` a text column (register row F17).
 *  - `openAnswersWithCommas: false` writes every open answer in plain words (letters, spaces, apostrophes, full stops: no comma, no digit). That is the shape v1's name rule
 *    mistakes for a column of names (F1). The default mixes both shapes, the commas of most answers inside quotes, and the scan finds long text there.
 *  - five open answers are in Devanagari; some answers hold straight double quotes (a quoted cell with doubled quotes).
 *  - one row (line `raggedLine`, counting the header as line 1) has one value too many, so the app's parser leaves it out and says which line it was.
 *
 * `rows` is the number of data rows written (120, the ragged one among them): the app reads 119 of them. `names`, `villages` and `openAnswers` have one entry per data row, in
 * file order.
 */
export type SurveyOptions = { sep?: "," | ";"; openAnswersWithCommas?: boolean };
export type Survey = { csv: string; names: string[]; villages: string[]; openAnswers: string[]; rows: number; raggedLine: number };

export const SURVEY_HEADER = ["student name", "village", "age", "q1", "q2", "q3", "q4", "q5", "score", "notes"] as const;
const ROWS = 120;
/** Data rows (0-based) with a special shape. */
const RAGGED_ROW = 52;
const DECIMAL_COMMA_ROW = 22;
const DEVANAGARI_ROWS = [7, 30, 55, 80, 104];

const FIRST = [
  "Aarav", "Ananya", "Diya", "Ishaan", "Kavya", "Rohan", "Sneha", "Vihaan", "Meera", "Arjun", "Pooja", "Rahul", "Neha", "Karthik", "Lakshmi", "Imran", "Fatima", "Gurpreet", "Harleen", "Tenzing",
  "Bhavna", "Sahil", "Tanvi", "Yash", "Nandini", "Omkar", "Revati", "Suresh", "Divya", "Manoj", "Emily", "Oliver", "Grace", "Daniel", "Hannah", "Joseph", "Maria", "Samuel", "Ruth", "Rhea",
  "Joshua", "Sarah", "Peter", "Esther", "Irfan"
];
const LAST = [
  "Patil", "Kulkarni", "Shinde", "Pawar", "Deshmukh", "Jadhav", "Naik", "Gaikwad", "Sharma", "Verma", "Yadav", "Nair", "Iyer", "Menon", "Reddy", "Rao", "Khan", "Sheikh", "Ansari", "D'Souza",
  "Fernandes", "Mathew", "Thomas", "Walker", "Hughes", "Bennett", "Singh", "Kaur", "Bose", "Das", "Mondal"
];
const VILLAGES = ["Dhanorewadi", "Kelvanpada", "Maruthur Kuppam", "Nandgaonwadi", "Hirapur Khurd", "Chandanvihir", "Bhoirwadi", "Jambulpada"];

// ---- The open answers --------------------------------------------------------------------------------------------------------------------------------

/** Plain answers: letters, spaces, apostrophes and full stops only. {t} is a topic. */
const PLAIN_FRAMES = [
  "I liked {t} because it made the lesson feel less lonely.",
  "Honestly {t} was the only part of the week I looked forward to.",
  "My friends said {t} was boring but I did not agree.",
  "I think {t} helped me more than the extra classes did.",
  "At first I did not see the point of {t} but now I do.",
  "What stayed with me most was {t}.",
  "Our teacher gave us {t} and I did not want it to end.",
  "My mother noticed that I was calmer after {t}."
];
const CLOSERS = [
  "I want to join again next term.",
  "The room was too noisy for me to concentrate though.",
  "My little brother now asks me to read to him.",
  "I was nervous at first but nobody laughed at me.",
  "It would be better if it started earlier in the day.",
  "I still find the long words difficult.",
  "My parents did not understand why I stayed after school.",
  "I wish we had more books about our own region.",
  "Exams still make me anxious but reading helps me calm down.",
  "The monsoon made it hard to come every week.",
  "I would tell the younger students to try it.",
  "Some days I was too tired to read after farm work."
];
/** Answers with a comma, a digit, a bracket, a question mark or a quote. {T} is the topic with a capital letter. No semicolon: it is the other file's separator. */
const RICH_FRAMES = [
  "Yes, {t} was good, but only 2 days a week is not enough.",
  "I read for about 20 minutes every evening after {t}, and my marks went up (maths too).",
  "{T}, mostly. My sister (class 6) joined me - she liked it more than I did!",
  "Not sure, to be honest: {t} helped, but the heat made it hard to stay for 2 hours.",
  "Why only once a week? I would come every day, {t} is better than tuition.",
  'My teacher said, "read slowly", and {t} gave me time to do that.',
  "After {t} I read 3 pages at home, then slept better, which my mother noticed.",
  "Honestly, I came for the free books, but {t} made me stay."
];
/** Added to a rich answer now and then, so that the answers about one topic differ. */
const RICH_TAILS = [
  " I read 2 pages a day now.",
  " My brother, who is 9, copied me.",
  " Maybe 3 Saturdays were too wet to come.",
  " Next term, please start at 8, not 10.",
  " The teacher (a volunteer) never shouted.",
  " We need more books, not more rules!",
  " Sometimes 5 of us shared a single book.",
  " Honestly, I did not expect to like it."
];
const TOPICS = [
  "the reading circle on Saturday mornings",
  "reading aloud with my group",
  "the stories we read in the shade of the school tree",
  "the quiet corner of the library room",
  "choosing my own book",
  "the teacher's questions after each chapter",
  "the picture books for the younger children",
  "the evening session at the panchayat hall",
  "the word game at the end of class",
  "sharing one book between three of us",
  "reading the newspaper together on Fridays",
  "the notebook where we wrote new words"
];

/** The five answers in Devanagari (two carry the MARK, a Latin word in a Hindi sentence, as pupils write them). The danda is the full stop; none has a comma or a digit. */
const hindiAnswers = (): string[] => [
  "मुझे कहानियाँ पढ़ना बहुत अच्छा लगा। अगली बार भी आऊँगी।",
  `मुझे ${MARK} मंडली में पढ़ना पसंद है और मैं हर शनिवार आना चाहती हूँ।`,
  "गाँव में किताबें कम मिलती हैं इसलिए यह मंडली मेरे लिए ज़रूरी है।",
  "पढ़ने का समय बहुत कम था पर शिक्षक ने अच्छे से समझाया।",
  `मेरे दोस्त भी ${MARK} में शामिल होना चाहते हैं।`
];

const fill = (frame: string, topic: string): string => frame.replace("{t}", topic).replace("{T}", topic[0]!.toUpperCase() + topic.slice(1));

/** The notes, one per row: a third of them name the MARK's reading circle, 70% are the commas-and-digits kind when the option allows, five are Hindi. */
function openAnswers(rand: () => number, withCommas: boolean): string[] {
  const hindi = hindiAnswers();
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < ROWS; i++) {
    const h = DEVANAGARI_ROWS.indexOf(i);
    if (h >= 0) { out.push(hindi[h]!); continue; }
    const rich = withCommas && i % 10 < 7;
    let note = "";
    for (let tries = 0; ; tries++) {
      if (tries > 200) throw new Error(`QA survey: no new open answer for row ${i} after ${tries} tries.`);
      const topic = i % 3 === 0 ? `the ${MARK} reading circle` : pick(rand, TOPICS);
      note = rich
        ? fill(pick(rand, RICH_FRAMES), topic) + (rand() < 0.7 ? pick(rand, RICH_TAILS) : "")
        : fill(pick(rand, PLAIN_FRAMES), topic) + " " + pick(rand, CLOSERS);
      if (!seen.has(note)) break;
    }
    seen.add(note);
    out.push(note);
  }
  return out;
}

// ---- The file ----------------------------------------------------------------------------------------------------------------------------------------

/** One cell as a spreadsheet writes it: in quotes when it holds the separator, a double quote or a line break, a double quote doubled. */
function cell(v: string, sep: string): string {
  return v.includes(sep) || /["\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

export function survey(o: SurveyOptions = {}): Survey {
  const sep = o.sep ?? ",";
  const rand = seeded(20261024);
  const names: string[] = [];
  const villages: string[] = [];
  const lines: string[] = [SURVEY_HEADER.join(sep)];
  const notes = openAnswers(rand, o.openAnswersWithCommas ?? true);
  for (let i = 0; i < ROWS; i++) {
    // A step of 53 through the 45 x 31 pairs: 120 different names, first names and surnames mixed.
    const p = (i * 53 + 11) % (FIRST.length * LAST.length);
    names.push(`${FIRST[p % FIRST.length]} ${LAST[Math.floor(p / FIRST.length)]}`);
    villages.push(pick(rand, VILLAGES));
    const likert = () => String(Math.min(5, Math.max(1, Math.round(1 + 2 * (rand() + rand())))));
    const age = String(13 + Math.floor(rand() * 7));
    const items = [likert(), likert(), likert(), likert(), likert()];
    let score = (38 + rand() * 55).toFixed(3);
    if (sep === ";" && i === DECIMAL_COMMA_ROW) score = score.replace(".", ",");
    const values = [names[i]!, villages[i]!, age, ...items, score, notes[i]!];
    // The ragged row has a sixth Likert item nobody asked for.
    if (i === RAGGED_ROW) values.push("3");
    lines.push(values.map((v) => cell(v, sep)).join(sep));
  }
  return { csv: lines.join("\n"), names, villages, openAnswers: notes, rows: ROWS, raggedLine: RAGGED_ROW + 2 };
}
