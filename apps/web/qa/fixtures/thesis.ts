import { deflateSync } from "node:zlib";
import { MARK, escapeHtml } from "./common";

/**
 * An invented thesis draft, as the Writing place holds a document (spec section 11; S8 Closeness reads a shelf of papers against it). The study, the people and the three
 * works it cites do not exist. It has about 3,000 words, one H1, nine H2 headings, a table of 2 rows and 3 columns, a small PNG picture (a data URL, as the editor keeps
 * pictures), three citations in the text and in the reference list, and the sentence `copied`, whole, inside one paragraph of the discussion (before the reference list, outside
 * any quotation mark). Its own sentences share no run of six words with the papers of pdfs.ts, so the sentence copied is the only passage the Closeness check can find.
 */

// ---- The picture: a 96 x 64 bar chart, written as a PNG by hand -----------------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}
let picture: string | undefined;
/** The picture as a data URL: two bars on a white ground, a blue one and an orange one, above a dark axis. */
function pictureUrl(): string {
  if (picture) return picture;
  const W = 96, H = 64;
  const raw = Buffer.alloc((1 + W * 3) * H, 255);
  const paint = (x: number, y: number, [r, g, b]: [number, number, number]) => {
    const at = y * (1 + W * 3) + 1 + x * 3;
    raw[at] = r; raw[at + 1] = g; raw[at + 2] = b;
  };
  for (let y = 0; y < H; y++) raw[y * (1 + W * 3)] = 0; // filter type 0 on every row
  for (let y = 24; y < 56; y++) for (let x = 16; x < 40; x++) paint(x, y, [76, 120, 168]);
  for (let y = 31; y < 56; y++) for (let x = 56; x < 80; x++) paint(x, y, [245, 133, 24]);
  for (let y = 56; y < 58; y++) for (let x = 8; x < 88; x++) paint(x, y, [51, 51, 51]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, no interlace
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return (picture = "data:image/png;base64," + png.toString("base64"));
}

// ---- The text --------------------------------------------------------------------------------------------------------------------------------------

/** The three citations as they stand in the html (an ampersand is written as one). */
const CITE = { kulkarni: "(Kulkarni &amp; Ahmed, 2018)", fernandes: "(Fernandes, 2020)", gupta: "(Gupta, Bennett &amp; Rao, 2016)" };

const REFERENCES = [
  "Fernandes, L. (2020). Language at home and language at school: A study of early readers. Indian Journal of Child Learning, 14(1), 5-27.",
  "Gupta, R., Bennett, S., & Rao, P. (2016). Sleep, worry and examination performance in adolescents. Studies in Adolescent Health, 7(3), 101-119.",
  "Kulkarni, S., & Ahmed, Z. (2018). Reading together: Community reading groups and school engagement. Journal of Rural Education Practice, 9(2), 33-52."
];

const ABSTRACT = `This thesis asks whether a weekly village reading circle, led by a volunteer teacher and held outside school hours, is followed by better reading comprehension among Class Nine students than ordinary classroom teaching alone. Across eight villages, one hundred and twenty students answered a short survey and sat a reading comprehension test at the start and at the end of one school term, and twenty-four students and six teachers were interviewed. Students who attended the circle at least eight times gained more on the comprehension test than students who attended rarely or never, once their starting scores were taken into account. The interviews suggest that the circles were valued less for the books themselves than for the quiet and unhurried hour they gave. The gain was modest, and the design cannot show that the circle itself caused it. The thesis ends by describing what a larger and better controlled study would need. This draft is filed under the study code ${MARK}.`;

const INTRODUCTION = [
  "In the villages where this study was carried out, a Class Nine student is expected to read a textbook in a language that is not spoken at home, to prepare for a board examination that is two years away, and to help with work on the family land or in the household. Reading is the skill on which every other subject rests, yet it is the one that schools in small settlements have the least time to teach. Classes are large, teachers are few, and many of them travel long distances to reach the school. A student who falls behind in reading in the middle years of schooling often stays behind, and the gap widens each year until the student leaves.",
  "A number of voluntary groups have tried to fill this gap with reading circles. A circle is simple to describe: a small group of students meets once a week in a shared room, a volunteer brings a box of books, and the students read aloud, listen, choose, and talk about what they have read. Nobody is graded, and attendance is not compulsory. Supporters of circles say that they build the habit of reading for pleasure, that they give students a calm place in a crowded week, and that they lift the marks of students who join. These claims are made often and tested rarely, and the few studies that exist were carried out in towns, not in villages like these.",
  "This thesis therefore asks one main question and two smaller ones. The main question is whether students who attend a village reading circle gain more in reading comprehension over one term than students who do not. The first smaller question is whether the gain depends on how often a student attends. The second is how the students and their teachers describe what the circle gives them, and whether their descriptions help to explain the numbers. The study uses a short survey, a comprehension test given twice, and interviews, and it treats each as a partial view of the same circle.",
  "The chapters that follow set out the earlier work, describe the method, report the results, discuss them and state the limits of what has been found. A note on language is needed first. The students in this study speak Marathi, Hindi or a local dialect at home, and read English and Marathi at school. The comprehension test was given in the language of the textbook, and the interviews were held in whichever language the student chose. The extracts quoted here were translated by the researcher."
];

const LITERATURE = [
  `Research on reading in rural schools is spread across several fields, and it is easier to summarise by theme than by date. The first theme is the out-of-school reading group. Groups that meet in a community hall or under a tree have been reported to raise attendance and to give shy students a first experience of reading aloud without being corrected in front of the class ${CITE.kulkarni}. Most reports of this kind describe a single group in a single place, and they rely on the impressions of the people who run it. They are useful for showing what a circle looks like, but they say little about whether students who attend gain more than similar students who do not.`,
  `The second theme is the language of the classroom. Children who begin school in a language they do not speak at home must learn to read and to learn the language at the same time. A careful study of early readers found that children who first learned to read in their home language moved on to the school language faster than children who were taught in the school language from the start ${CITE.fernandes}. The finding matters here because the students in this study are in the middle of that move. A reading circle that allows them to speak, read and joke in their own language, even for an hour, may ease a transition that the timetable makes hard.`,
  `The third theme is the link between sleep, worry and examinations. Adolescents who worry about their marks sleep less, and students who sleep less recall less of what they have studied, so worry and poor sleep can feed each other across an examination term ${CITE.gupta}. This theme is not the centre of the present study, but it shaped the survey. The students in the sample were close to their first board examinations, and a calm hour of reading may matter as much as the reading itself. The survey therefore asked about worry as well as about reading habits.`,
  "Taken together, the earlier work leaves three gaps. There are few comparisons between students who attend a circle and students who do not. There is little evidence from villages as small as these, where a circle may be the only organised activity outside school. And there is almost no work that listens to students and their teachers while also counting what changes in their marks. The present study tries to address all three, with the limits that its size and its design allow."
];

const METHOD: Array<[string, string]> = [
  ["Design.", "The study followed one cohort of Class Nine students through one school term, from the first week of July to the last week of October. It used a convergent mixed design: the numbers and the interviews were collected during the same term, analysed separately and brought together only in the discussion. The comparison is between students who attended the circle often, students who attended a few times, and students who did not attend. Students were not assigned to these groups. They chose, or their families chose, and the analysis must be read with that in mind."],
  ["Setting and participants.", "Eight villages in one block took part. Each had a school with a single Class Nine section and a volunteer who agreed to run a circle on Saturday mornings. The villages are given invented names in the data and are not named here. One hundred and twenty students returned a signed consent form, and a parent or guardian signed for each student under eighteen. The students were between thirteen and nineteen years old, and most were fifteen or sixteen. A further twenty-four of them, three from each village, were invited to an interview, along with six teachers who had seen the circle at work."],
  ["Instruments.", "The survey had three parts. The first asked for the student's age and village. The second held five statements about reading, such as whether the student read anything outside school, and each was answered on a scale from one, strongly disagree, to five, strongly agree. The third was an open question inviting the student to write a few lines about the circle or about reading in general. The comprehension test was a set of passages with questions, taken from a past examination paper and marked out of one hundred. Two versions of equal difficulty were used, one at the start of the term and one at the end, and they were given in alternating order to guard against a version effect."],
  ["Procedure.", "The test and the survey were given in the school during a regular period, with a teacher present but not marking. Attendance at the circle was recorded by the volunteer on a printed sheet, and the sheets were collected at the end of the term. Interviews were held in the school library room or, where there was none, in the staff room, and each lasted between twenty and thirty-five minutes. They were recorded with permission, transcribed, and checked against the recordings. Students were told that they could stop at any time and that nothing they said would be shown to their teachers in a form that identified them."],
  ["Analysis.", "The test scores were analysed with a regression of the end-of-term score on the starting score and on the number of sessions attended, to ask whether attendance predicted the end score after the starting score was taken into account. The Likert items were summed into a single reading habits score. The open answers and the interviews were read several times and coded by hand, first with codes close to the students' own words and later with broader themes. A second reader coded a sample of one in five transcripts, and the two coders discussed each difference until they agreed on a code. Personal details were removed from the transcripts before they were stored, and the names in this thesis are invented."],
  ["Ethics.", "The study was approved by the ethics committee of the supervising institution, and permission to work in the schools was given by each head teacher. Students who wished to leave the study did so without giving a reason, and their data were deleted. Because many of the students were minors, every consent form was explained aloud in the language of the household, and a student's answers were never shown to a parent or a teacher."]
];

const RESULTS_BEFORE_TABLE = "Of the one hundred and twenty students who began the study, one hundred and nineteen completed both tests. The mean score at the start of the term was 52.8 and the mean at the end was 58.6. Fifty-eight students attended the circle at least eight times, thirty-one attended between one and seven times, and thirty never attended. The three groups did not differ much in age or in the reading habits score at the start, although the students who attended most often came from slightly larger households.";
const RESULTS_AFTER_TABLE = "After the starting score was taken into account, each additional session attended was linked with a rise of about 0.6 points in the end score. The relationship was weaker among students who attended fewer than eight times, and it was not statistically distinguishable from zero in that group. Figure 1 shows the mean end score of the group that attended often beside the mean of the group that did not attend. The difference is small enough that it could not be called large in practice, although it is larger than the difference in the starting scores.";
const RESULTS_AFTER_FIGURE = [
  "The survey gives a second view. Students who attended the circle often reported reading outside school more days of the week, and they agreed more strongly with the statement that reading helps them to calm down. Their open answers were longer, and about a third of them described the circle in terms of time, using phrases such as an hour of their own. Fewer than one in ten of the students who never attended wrote about reading at all, and several of them said that the circle clashed with farm work or with the weekly market.",
  "The interviews supported and complicated the numbers. Students spoke warmly about reading aloud in a small group, about choosing their own book and about not being corrected in front of others. Teachers described students who had spoken rarely in class and now asked for a second book. At the same time, several students said that the room was noisy, that the long words were still hard, and that the monsoon had made some Saturdays impossible. Three students said that they came mainly for the quiet and read very little."
];

const DISCUSSION_BEFORE = [
  "The main finding is a modest and consistent association between attending the circle and gaining in reading comprehension. It would be wrong to call it an effect of the circle. Students who chose to attend may have been the ones who already cared more about reading, who had more time, or whose families encouraged it, and a regression cannot remove differences that were not measured. What the result does show is that the circle was not harmful to marks, as some parents feared, and that students who came often did at least as well as students who did not.",
  "The second question, whether the gain depends on how often a student attends, received a cautious answer. The relationship held for students who attended eight times or more and was unclear for those who attended less. This pattern fits the idea that a habit needs time to form, and it fits what the volunteers said about the first few weeks, when students were shy and read little. It also fits the practical point that a student who attends only twice in a term has had very little reading time."
];
/** The paragraph that holds the sentence copied from a paper: the sentence stands in the middle of it. */
const discussionWithCopy = (copied: string): string =>
  `Several volunteers described a pattern that the students themselves did not name. ${escapeHtml(copied)} We saw the same thing in two of the eight villages, where the volunteer split a large group in half after the second week and the quietest students began to read aloud.`;
const DISCUSSION_AFTER = [
  `The students' own descriptions point to something that the marks cannot show. For most of them the circle was one of the few hours of the week that belonged to no one else, with no work to do and no score at the end. This matters in a term when many of them were anxious about the first board examinations. The students who spoke about sleep and worry did not claim that the circle cured either, but several said that it made the evenings after it calmer. A larger study should ask about this directly, as the earlier work on sleep and worry suggests ${CITE.gupta}.`,
  `The findings also bear on the question of language. Students who read in a circle can use both languages, move between them and ask what a word means without fear of being laughed at. This is consistent with earlier findings that the home language is a bridge to the school language and not an obstacle ${CITE.fernandes}. The present study did not test this directly, and the circles did not keep the languages apart, so any conclusion must remain a suggestion.`,
  "For the volunteers and the organisations that support them, the results suggest three small changes. The first is to keep groups to four or five students. The second is to meet on a day that does not clash with the weekly market. The third is to keep a simple record of attendance, which makes later comparison possible and costs almost nothing. None of these changes needs money, and each follows from what the students and teachers said."
];

const LIMITATIONS = [
  "The study has several limits. The students chose whether to attend, so the groups were not comparable at the start. The sample is small, drawn from eight villages in one block, and the villages differ in the quality of their schools in ways that were not measured. The comprehension test was a single instrument, marked by one teacher in each school, and the two versions may not have been equally hard despite the care taken. Finally, the term was short, and nothing can be said about whether the gain lasts into the next year.",
  "The interviews bring their own limits. Students spoke to an adult from outside the village in a school building, and some of them may have said what they thought a visitor wanted to hear. The translation of quotations from Marathi and Hindi into English involved choices of wording, and a different translator might have chosen differently. The second coder read only a fifth of the transcripts, and the agreement between the coders was reached by discussion, not measured with a statistic."
];

const CONCLUSION = [
  "This thesis set out to ask whether a weekly village reading circle is followed by better reading comprehension. The answer from this sample is a cautious yes: students who attended eight times or more gained somewhat more than students who did not attend, and the pattern held after their starting scores were taken into account. The design does not allow a claim that the circle caused the gain, and the size of the gain is small.",
  "The interviews add what the numbers cannot. The students valued the circle as a quiet and unhurried hour, and their teachers saw a change in who spoke in class. A better study would assign students to the circle by lot, follow them for a full year, measure sleep and worry along with reading, and keep the groups small. Until then, the circle is best seen as a low-cost and low-risk addition to village schooling, and one that the students themselves are glad to have."
];

// ---- The document ----------------------------------------------------------------------------------------------------------------------------------

const p = (text: string): string => `<p>${text}</p>`;
const ps = (texts: readonly string[]): string[] => texts.map(p);
const h2 = (text: string): string => `<h2>${text}</h2>`;

/** The draft as the document's html. `copied` is plain text (a sentence of a shelf paper); it is made safe here and stands once, whole, in one paragraph of the discussion. */
export function thesisDraft(copied: string): string {
  return [
    "<h1>Village Reading Circles and Reading Comprehension in Class Nine: A Mixed-Methods Study</h1>",
    h2("Abstract"), p(ABSTRACT),
    h2("Introduction"), ...ps(INTRODUCTION),
    h2("Literature review"), ...ps(LITERATURE),
    h2("Method"), ...METHOD.map(([label, text]) => p(`<strong>${label}</strong> ${text}`)),
    h2("Results"),
    p(RESULTS_BEFORE_TABLE),
    p("<strong>Table 1.</strong> Mean comprehension score at the end of the term, by attendance."),
    "<table><tbody><tr><th>Group</th><th>Students</th><th>Mean end score</th></tr><tr><td>Attended eight times or more</td><td>58</td><td>63.1</td></tr></tbody></table>",
    p(RESULTS_AFTER_TABLE),
    `<p><img src="${pictureUrl()}" alt="Bar chart of the mean end-of-term score of students who attended the circle often and of students who never attended"></p>`,
    p("<strong>Figure 1.</strong> Mean end-of-term comprehension score of students who attended the circle eight times or more and of students who never attended."),
    ...ps(RESULTS_AFTER_FIGURE),
    h2("Discussion"), ...ps(DISCUSSION_BEFORE), p(discussionWithCopy(copied)), ...ps(DISCUSSION_AFTER),
    h2("Limitations"), ...ps(LIMITATIONS),
    h2("Conclusion"), ...ps(CONCLUSION),
    h2("References"), ...ps(REFERENCES.map(escapeHtml))
  ].join("\n");
}
