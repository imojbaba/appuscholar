import { MARK, escapeHtml } from "./common";

/**
 * Two invented interview transcripts, as the Writing place holds a document (spec section 11; S6 Coding tags passages in them). Everything said is made up.
 *
 * What they carry on purpose:
 *  - Shift-Enter line breaks: a `<br>` inside a paragraph, as the editor writes it. Interview 1 holds the one of F3 (notes/2026-10-23-tools-walk.md, tools-c row 13): a
 *    passage that runs across a break, "were long<br>and quiet", which must be read as "were long and quiet" (a space where the break was), in the passages view, in the
 *    Markdown file and in the zip.
 *  - curly and straight quotation marks, double and single, and curly and straight apostrophes;
 *  - accents (café, Zoë, naïve, résumé);
 *  - speaker labels in bold ("Interviewer:", the speaker's first name);
 *  - two lines in Hindi in each transcript, one of them with a break after it;
 *  - the phrases the tools-c sheet tags ("feels anxious before every exam", "drinks coffee until midnight"), in the field note that ends transcript 1;
 *  - the run's MARK in each title and in each body.
 */
export type Interview = { title: string; html: string };

/** The passage of interview 1 that crosses a Shift-Enter break: as the document's html holds it, and as a reader sees it (the break read as one space). */
export const BREAK_PASSAGE = { html: "were long<br>and quiet", text: "were long and quiet" } as const;

/** A paragraph: a bold speaker label (or none) and the speech, in parts that are joined with a line break. The text is plain; it is made safe here. */
function para(label: string | null, ...parts: string[]): string {
  const body = parts.map(escapeHtml).join("<br>");
  return `<p>${label ? `<strong>${escapeHtml(label)}:</strong> ` : ""}${body}</p>`;
}
const note = (text: string): string => `<p><em>${escapeHtml(text)}</em></p>`;

function kavita(): Interview {
  const I = "Interviewer";
  const K = "Kavita";
  return {
    title: `Interview 1 - Kavita Pawar, Class 10 (${MARK})`,
    html: [
      note(`Interview 1 of 2. Recorded in the school library room on a Saturday afternoon. Transcript code ${MARK}. English and Hindi; the Hindi lines are given as she said them.`),
      para(I, "How have the nights been since the exam dates were announced?"),
      // BREAK_PASSAGE.html is "were long<br>and quiet": the paragraph is written in two parts, with the break between them.
      para(K, "Not good, honestly. I don't sleep before the maths paper. The nights were long", "and quiet, and I just lie there listening to the fan."),
      para(I, "What do you do when you can't fall asleep?"),
      para(K, "I look at my phone. My brother says it's the 'blue light' that keeps me awake, but I think it's my thoughts. The café near the bus stand sells very strong coffee, and I started drinking it late in the evening, even after nine."),
      para(I, "Do you talk to anyone about it?"),
      para(K, "मुझे रात को नींद नहीं आती और बहुत डर लगता है।", "(She said this in Hindi, looking at the floor.)"),
      para(I, "That sounds hard. What does your mother say?"),
      para(K, "She says “just sleep, beta”, but it isn’t that simple. My cousin Zoë, who lives in the city, has a timetable for everything. She’s a bit naïve to think it works for everyone."),
      para(I, "And at school? Does it help when the teachers explain the paper?"),
      para(K, 'A little. Our teacher said, "Marks are not your worth," and I wrote it on the back of my notebook. But when the paper is in front of me I forget everything and my hands shake.'),
      para(K, "कल रात मैं दो बजे तक जागती रही।"),
      para(I, "Last question. What would help you most before the exams?"),
      para(K, "A quiet place to study in the evening, without the television. And someone to tell me it’s okay to sleep.", "Not to study more. To sleep more."),
      note("Field note: she feels anxious before every exam, drinks coffee until midnight, and says the Saturday reading circle is the one quiet hour of her week.")
    ].join("\n")
  };
}

function zoe(): Interview {
  const I = "Interviewer";
  const Z = "Zoë";
  return {
    title: `Interview 2 - Mrs Zoë Fernandes, class teacher (${MARK})`,
    html: [
      note(`Interview 2 of 2. Recorded in the staff room after the last bell. Transcript code ${MARK}. English with some Hindi.`),
      para(I, "How long has the reading circle been running?"),
      para(Z, "Since June, so about one term. We began with eight children under the banyan tree, and it grew because the parents saw a difference."),
      para(I, "What kind of difference?"),
      para(Z, "Small things at first. A boy who never spoke in class asked me for a second book.", "Then his mother came to the school, which she had never done before.", "She said ‘he reads to the cattle now’."),
      para(Z, "बच्चों को कहानी सुनना बहुत पसंद है और अब वे खुद पढ़ना चाहते हैं।"),
      para(I, "And the difficulties?"),
      para(Z, "Honestly, the monsoon. When the road floods, half the circle can’t come. Some parents see it as 'time-pass', not studying. I tell them: “reading is studying.”"),
      para(I, "Do you worry about the pupils who are anxious about exams?"),
      para(Z, "Very much. Two girls in Class 10 told me they can't sleep. I don't want to be naïve about it: a book circle will not fix that, but it gives them one hour with no score on it."),
      para(Z, "मैं चाहती हूँ कि परीक्षा से पहले बच्चे थोड़ा आराम करें।", "(Said quietly, and then again in English.)"),
      para(I, "Is there anything else for the report?"),
      para(Z, 'Yes, please write that the café owner in the village lent us his tables for free. Nobody ever writes that down. He said, "A school needs a résumé of good neighbours," and I laughed.')
    ].join("\n")
  };
}

/** The two transcripts, each as the Writing place would hold it: a title and the document's html. */
export function interviews(): Interview[] {
  return [kavita(), zoe()];
}
