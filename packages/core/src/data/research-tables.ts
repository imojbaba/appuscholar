// Generated from v1 index.html build 2026.10.13a (e3ad7404efcc) by test/golden/harness. Do not edit; re-run: pnpm --filter @appuscholar/core golden:capture research --emit
export const RS_DESIGNS = [
  "randomised trial",
  "non-randomised experiment",
  "cohort study",
  "case-control study",
  "cross-sectional survey",
  "qualitative study",
  "systematic review",
  "meta-analysis",
  "narrative review",
  "case study",
  "other"
] as const;
export const RS_DESIGN = {
  "any": {},
  "rct": {
    "oa": "(\"randomized controlled trial\" OR \"randomised controlled trial\" OR \"randomized trial\")",
    "pm": "\"Randomized Controlled Trial\"[pt]"
  },
  "sr": {
    "oa": "(\"systematic review\" OR \"meta-analysis\")",
    "pm": "(Systematic Review[pt] OR Meta-Analysis[pt])"
  },
  "review": {
    "oaFilter": "type:review",
    "pm": "Review[pt]"
  },
  "qual": {
    "oa": "(qualitative OR \"thematic analysis\" OR interview)",
    "pm": "(qualitative[tiab] OR \"thematic analysis\"[tiab])"
  },
  "survey": {
    "oa": "(survey OR questionnaire OR \"cross-sectional\")",
    "pm": "(survey*[tiab] OR questionnaire*[tiab] OR \"cross-sectional\"[tiab])"
  }
} as const;
