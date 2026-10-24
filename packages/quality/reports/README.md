# AI-quality reports

Each file here is one run of one test set (`packages/quality/sets`) against one provider, named `<set>-<provider>-<YYYY-MM-DD>.md`. It holds a summary table with one row for each item (for the Ask, each question) and one column for each grade, then every reply in full under its item, with its grades. The prompts are the ones the web sends for a student who reads English, built by the same core builders, with the same temperature and token limit. The replies are the provider's own words, unchanged. A run of the same prompt is repeated (three times for a baseline) because a model does not answer the same way twice.

## Status: the first baseline has not been run

It waits on OJ's capped test key (plan Task Q2, step 5, is OJ's action). Until then this folder holds only this file. Do not commit a report made with a stub or a made-up provider as if it were a baseline; the stub in `apps/api/test/quality.cli.test.ts` never writes here.

## Producing the baseline

Put a capped test key for the provider in the environment, then run one command for each set from the repository root. Groq is the example; the provider is in the file name, so a second provider's reports sit beside the first.

```sh
export QUALITY_API_KEY=...   # a capped test key for the provider named below
pnpm --filter @appuscholar/api exec tsx scripts/quality.ts --set idea --provider groq --repeats 3
pnpm --filter @appuscholar/api exec tsx scripts/quality.ts --set summary --provider groq --repeats 3
pnpm --filter @appuscholar/api exec tsx scripts/quality.ts --set gap --provider groq --repeats 3
pnpm --filter @appuscholar/api exec tsx scripts/quality.ts --set litreview --provider groq --repeats 3
pnpm --filter @appuscholar/api exec tsx scripts/quality.ts --set ask --provider groq --repeats 3
pnpm --filter @appuscholar/api exec tsx scripts/quality.ts --set walk --provider groq --repeats 3
```

`--set all` runs the six in one go. `--out <folder>` writes somewhere else; a relative folder is relative to `apps/api`, where `pnpm exec` runs. A second run on the same day with the same set and provider replaces the first file, so move the first aside if you want both. Then commit the reports (`feat(quality): the runner, and the first baseline reports`) and link them from the walk notes.

About the key:

- It comes from the environment variable `QUALITY_API_KEY` and nowhere else. Never put it on the command line, where the shell keeps it.
- It must be a capped test key: a spend limit set at the provider, not a student's key and not a main key. A full run at three repeats is 75 calls, and the summary prompts are about 19,000 characters each.
- It must be a key for the provider named in `--provider`; it is sent to that provider only.
- The CLI never prints it, logs it, writes it to a report or puts it in an error message. A failed call is recorded as its class and HTTP status (for example `rate-limit (HTTP 429)`), never the provider's answer, which can quote the key. A reply that repeats the key has it taken out before the file is written.
- If `QUALITY_API_KEY` is not set, it stops with a sentence that names the variable. If the provider rejects the key, it stops at once and writes nothing.

The calls go one after the other. On a rate limit a call waits 20, 40 and then 60 seconds and tries again; if it still fails, the reply is recorded as failed and the run goes on. CI never runs this: it costs money and needs a key.

## Reading a baseline

The baseline is read against the known weak spots of draft section 8 (`docs/design/2026-10-20-journey-redesign-draft.md`). Each weak spot has a column that measures it:

| Weak spot | Set | Column in the table | Grader |
| --- | --- | --- | --- |
| The idea read names areas | `idea` | Areas: how many replies gave all five areas a line that starts with the area's name | `gradeAreas` |
| The summary finds the limitations | `summary` | Limitations: how many of the item's expected limitations each reply names; Not reported: how many replies wrote "not reported" | `gradeLimitations` |
| Gaps are named by author | `gap` (and `litreview`) | Papers named: how many papers each reply names by first author's surname; Numbered: how many replies name papers by number | `gradeGapNames` |
| Authors are complete | none | none | No grader yet |

"Authors complete" is the weak spot of authors and references being incomplete. Nothing in the sets or the graders measures it yet, so a baseline cannot speak to it; it needs its own set (papers whose full author lists are known) and a grader before it can be read here.

The other columns hold every set to the grounding the plan asks for:

- Numbers (`gradeNumbers`): numbers in a reply that the source text does not hold. The source is the paper's text, or for the gap finder and the literature review the numbered abstracts as the prompt prints them. For the Ask and the Walk-through it also includes the student's own question or attempt, since a reply that repeats those has not made anything up. Zero is the bar.
- Quotations (`gradeQuotes`): how many quotations a reply gives and how many are found word for word in the paper, by the same check the Ask and the Walk-through use.
- In paper (`ask`): whether the reply's `in_paper` is what the item expects. The second question of each paper is one the paper does not answer, so `in_paper` should be false.
- Facts (`ask`, `walk`): how many of the item's `facts` the answer states. The quotations are not counted, only the reply's own words. Numbers match with or without thousands commas, and hyphens match spaces.
- AI-use label (`gradeLabel`): whether the prompt logs under the label the item expects. It is a property of the prompt, so it is the same for every repeat. The Ask and the Walk-through carry no label today, and have no such column.

Two things to know when reading a report. A prompt that the web would stop to ask about personal data (the scan can take a number in an abstract for an ID number) is marked in its section; the runner sends it as it is. And the summary builder reads about 18,000 characters picked from the paper, so a number from a part of a long paper that was not sent is still counted as the paper's.
