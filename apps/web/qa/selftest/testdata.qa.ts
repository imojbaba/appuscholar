import { MARK } from "../fixtures/common";
import { PAPER07_PARAGRAPH, paperTitle, shelfPdfs } from "../fixtures/pdfs";
import { T } from "../support/dict";
import { serverRows } from "../support/server";
import { newStudent, toPlace, type Student } from "../support/student";
import { expect, notChecked, test } from "../support/test";

/**
 * The invented test data (qa/fixtures/*.ts) against the app. The unit tests (test/qa/fixtures.test.ts) hold the files to pdf.js, the parsers and the Closeness engine in Node;
 * this one adds a generated PDF to the Reading shelf in the browser, as a student does, and asks the server what it holds of it. A real check: a PDF the shelf cannot read, or a
 * MARK that reaches the server in clear, fails it.
 */
const TAGS = { tag: ["@selftest", "@slice"] };
/** A sealed title or body (lib/vault's AES-GCM output: a 16-character IV, a dot, the ciphertext, base64url). */
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
const PROJECT = { name: "Reading circles and exams", idea: "Does a weekly village reading circle raise reading comprehension in Class Nine students?" };

test("testdata: a generated PDF is added to the Reading shelf as two pages, and the server holds none of it in clear", TAGS, async ({ page, qa }) => {
  qa.begin({
    story: "S0",
    id: "SELF-TESTDATA-PDF",
    goal: "A paper the fixtures wrote is added to the Reading shelf, read as two pages, and sealed before it reaches the server",
    situation: { vault: "open", data: "realistic" },
    steps: ["new student", "add paper 07", "what the server holds"]
  });
  const paper = (await shelfPdfs(7))[6]!;
  let s!: Student;

  await qa.step("new student", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: PROJECT });
  });

  await qa.step("add paper 07", async () => {
    await toPlace(page, s.projectId!, "literature", "reading");
    await expect(page.getByTestId("sh-empty")).toHaveText(T("sh2_the_shelf_is_empty"));
    // The shelf saves the paper's text and then its index; the server's copy is read after both.
    const saved = Promise.all(
      [/\/blobs\/shelf_paper%3A[A-Za-z0-9_-]+$/, /\/blobs\/shelf_index$/].map((blob) =>
        page.waitForResponse((r) => r.request().method() === "PUT" && blob.test(r.url()) && r.ok(), { timeout: 30_000 })
      )
    );
    // If the add throws first, `saved` is never awaited: a branch with a catch of its own keeps its rejection from going unhandled (the await below still sees it).
    saved.catch(() => undefined);
    await page.getByTestId("sh-file").setInputFiles({ name: paper.name, mimeType: "application/pdf", buffer: paper.bytes });
    await qa.check("data", "the status reads \"<file>: added, 2 pages\"", async () => {
      await expect(page.getByTestId("sh-status")).toHaveText(paper.name + T("sh2_added_pages", { pagesCount: 2 }));
    }, { source: "e2e: stage2-idea-literature step 7" });
    await qa.check("data", "the shelf holds one paper, titled by the first line of its first page, with 2 pages and no highlights", async () => {
      await expect(page.getByTestId("sh-paper")).toHaveCount(1);
      await expect(page.getByTestId("sh-title")).toHaveValue(paperTitle(7));
      await expect(page.getByTestId("sh-paper-meta")).toHaveText(paper.name + " " + T("sh2_pages_highlights", { pagesCount: 2, notesCount: 0 }));
    }, { source: "e2e: stage2-idea-literature step 7" });
    await qa.check("data", "the reader shows the paper's first page with the MARK, and its second page with paper 07's paragraph", async () => {
      await page.getByTestId("sh-read").click();
      await expect(page.getByTestId("sh-reader-title")).toHaveText(paperTitle(7));
      await expect(page.getByTestId("sh-text")).toContainText(MARK);
      await page.getByTestId("sh-next").click();
      await expect(page.getByTestId("sh-text")).toContainText(PAPER07_PARAGRAPH.slice(0, 60));
    }, { source: "e2e: stage2-idea-literature step 7" });
    await saved;
  });

  await qa.step("what the server holds", async () => {
    const rows = await serverRows(s.uid);
    const shelf = rows.blobs.filter((b) => b.kind.startsWith("shelf_"));
    await qa.check("data", "the shelf's blobs are on the server sealed: no MARK, no title and no sentence of the paper in clear", async () => {
      if (shelf.length === 0) notChecked("the account has no shelf blobs on the server, so there was nothing to read");
      expect(shelf.map((b) => b.kind).some((k) => k.startsWith("shelf_paper:"))).toBe(true);
      for (const b of shelf) {
        expect(b.body, b.kind).toMatch(CIPHERTEXT);
        for (const plain of [MARK, paperTitle(7), PAPER07_PARAGRAPH.slice(0, 40), paper.name]) expect(b.body, b.kind).not.toContain(plain);
      }
      for (const b of rows.blobs) expect(b.body, b.kind).not.toContain(MARK);
      for (const t of rows.titles) expect(t).not.toContain(MARK);
    }, { source: "e2e: stage2-idea-literature step 7 (the shelf is sealed)" });
  });
});
