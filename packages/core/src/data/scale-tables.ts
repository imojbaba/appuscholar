// Generated from v1 index.html build 2026.10.13a (e3ad7404efcc) by test/golden/harness. Do not edit; re-run: pnpm --filter @appuscholar/core golden:capture scales --emit
export const SCALES = [
  {
    "id": "RSES",
    "name": "Rosenberg Self-Esteem Scale",
    "short": "RSES",
    "construct": "Global self-esteem",
    "stem": "Below is a list of statements dealing with your general feelings about yourself. Please indicate how strongly you agree or disagree with each statement.",
    "items": [
      "On the whole, I am satisfied with myself.",
      "At times, I think I am no good at all.",
      "I feel that I have a number of good qualities.",
      "I am able to do things as well as most other people.",
      "I feel I do not have much to be proud of.",
      "I certainly feel useless at times.",
      "I feel that I'm a person of worth, at least on an equal plane with others.",
      "I wish I could have more respect for myself.",
      "All in all, I am inclined to feel that I am a failure.",
      "I take a positive attitude toward myself."
    ],
    "labels": [
      "Strongly agree",
      "Agree",
      "Disagree",
      "Strongly disagree"
    ],
    "codings": [
      {
        "label": "Strongly agree = 3 down to Strongly disagree = 0 (Rosenberg original)",
        "min": 0,
        "max": 3,
        "dir": "agree-high"
      },
      {
        "label": "Strongly agree = 4 down to Strongly disagree = 1",
        "min": 1,
        "max": 4,
        "dir": "agree-high"
      }
    ],
    "reverse": [
      2,
      5,
      6,
      8,
      9
    ],
    "bands": null,
    "scoring": "Add the ten items after reverse-scoring items 2, 5, 6, 8 and 9. Higher totals mean higher self-esteem. The owner gives no official cut-off scores.",
    "licence": {
      "status": "Public domain",
      "commercial": true,
      "attribution": "Rosenberg, M. (1965). Society and the adolescent self-image. Princeton University Press.",
      "source": "https://socy.umd.edu/about-us/using-rosenberg-self-esteem-scale",
      "checked": "2026-10-07",
      "note": "The University of Maryland states: the scale is in the public domain, may be used without charge and without notifying the Sociology Department, including translations and adaptations, with traditional scholarly attribution.",
      "verified": "Item text agreed word for word between two independent web copies. Compare once with the printed scale you cite."
    },
    "screening": false,
    "hindi": null
  },
  {
    "id": "SWLS",
    "name": "Satisfaction With Life Scale",
    "short": "SWLS",
    "construct": "Global life satisfaction",
    "stem": "Below are five statements that you may agree or disagree with. Using the 1 to 7 scale below, indicate your agreement with each item. Please be open and honest in your responding.",
    "items": [
      "In most ways my life is close to my ideal.",
      "The conditions of my life are excellent.",
      "I am satisfied with my life.",
      "So far I have gotten the important things I want in life.",
      "If I could live my life over, I would change almost nothing."
    ],
    "labels": [
      "Strongly disagree",
      "Disagree",
      "Slightly disagree",
      "Neither agree nor disagree",
      "Slightly agree",
      "Agree",
      "Strongly agree"
    ],
    "codings": [
      {
        "label": "Strongly disagree = 1 up to Strongly agree = 7",
        "min": 1,
        "max": 7,
        "dir": "agree-high"
      }
    ],
    "reverse": [],
    "bands": [
      {
        "max": 9,
        "label": "Extremely dissatisfied"
      },
      {
        "max": 14,
        "label": "Dissatisfied"
      },
      {
        "max": 19,
        "label": "Slightly below average"
      },
      {
        "max": 24,
        "label": "Average"
      },
      {
        "max": 29,
        "label": "High satisfaction"
      },
      {
        "max": 35,
        "label": "Very high satisfaction"
      }
    ],
    "scoring": "Add the five items. The total runs from 5 to 35. The bands come from the scale's own scoring guide and describe a score. They do not diagnose anything.",
    "licence": {
      "status": "Free to use with credit",
      "commercial": false,
      "attribution": "Diener, E., Emmons, R. A., Larsen, R. J., & Griffin, S. (1985). The Satisfaction With Life Scale. Journal of Personality Assessment, 49(1), 71-75.",
      "source": "https://ggsc.berkeley.edu/images/uploads/Satisfaction_With_Life_Scale.pdf",
      "checked": "2026-10-07",
      "note": "Free to use without permission or charge for non-commercial purposes, with credit to the authors. Do not use it in anything that is sold.",
      "verified": "Item text agreed word for word between two independent web copies (Berkeley GGSC and the TBI Model Systems page). Compare once with the owner's page."
    },
    "screening": false,
    "hindi": null
  }
] as const;
export const SL_PENDING = "PHQ-9, GAD-7, PHQ-2, GAD-2, AUDIT, DASS-21, MSPSS, UCLA Loneliness v3, General Self-Efficacy, Mini-IPIP and Grit-S are cleared in the research notes but wait for the owner's original file, so the wording is copied exactly. Screening scales (PHQ-9, GAD-7, AUDIT) also need the on-screen help path for self-harm answers before they go in." as const;
