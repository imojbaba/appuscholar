# Faults found by the QA layer

The faults a QA run found in the product, each with a Q id (Q1, Q2, ...). The F and O ids of the 2026-10-23 walk are in `apps/web/qa/known.json` and `docs/walkthroughs/notes/2026-10-23-tools-walk.md`; this file is for what the runs add.

A fault is recorded here when OJ has seen it in the report, not before. Record it in three places: an entry below, an entry in `apps/web/qa/known.json` with the same id and status `known`, and the failing check's `known: "Q<n>"` in the case. The case then shows KNOWN FAULT and CI stays green until the fix lands. When a fix is merged and the case passes, the report says FIXED?: set the status to `fixed` here and in `known.json`.

Nothing here is handed to a developer session until OJ says so.

## Entry format

Copy this for each fault. Keep the entries in order of id, newest last.

```
### Q<n>: <a short name, in words a student would use>

- Case: <case id, e.g. S6-02 [F3]>
- Date: <date the run found it>
- Commit: <sha of the build that was tested>
- Kind: <UI | Error | Unexpected | Slow>
- Expected: <what should have happened> (source: <sheet row, register row or rule>)
- Happened: <what happened instead, copied from the report>
- Evidence: <screenshot, trace and run report, as paths or links>
- Status: <known | awaiting | fixed>  (fixed in <PR or commit>, when it is)
```

## Entries

None yet. The first full run (plan task 19) adds the first ones.
