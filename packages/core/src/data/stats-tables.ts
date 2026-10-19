// Generated from v1 index.html build 2026.10.13a (e3ad7404efcc) by test/golden/harness. Do not edit; re-run: pnpm --filter @appuscholar/core golden:capture stats --emit
export const STAT_TESTS = {
  "desc": {
    "label": "Descriptive statistics",
    "fields": [
      {
        "id": "dv",
        "label": "Variable",
        "type": "numeric"
      }
    ]
  },
  "ttest1": {
    "label": "One-sample t-test",
    "fields": [
      {
        "id": "dv",
        "label": "Variable",
        "type": "numeric"
      }
    ],
    "extra": [
      {
        "id": "mu",
        "label": "Test value (μ)",
        "placeholder": "0"
      }
    ]
  },
  "ttestInd": {
    "label": "Independent-samples t-test",
    "fields": [
      {
        "id": "dv",
        "label": "Dependent variable",
        "type": "numeric"
      },
      {
        "id": "iv",
        "label": "Grouping variable (exactly 2 groups)",
        "type": "categorical"
      }
    ]
  },
  "ttestPaired": {
    "label": "Paired-samples t-test",
    "fields": [
      {
        "id": "v1",
        "label": "Variable 1 (e.g. pre)",
        "type": "numeric"
      },
      {
        "id": "v2",
        "label": "Variable 2 (e.g. post)",
        "type": "numeric"
      }
    ]
  },
  "anova1": {
    "label": "One-way ANOVA, classic (equal spreads)",
    "fields": [
      {
        "id": "dv",
        "label": "Dependent variable",
        "type": "numeric"
      },
      {
        "id": "iv",
        "label": "Grouping variable (3+ groups)",
        "type": "categorical"
      }
    ]
  },
  "tukey": {
    "label": "Tukey HSD post-hoc",
    "fields": [
      {
        "id": "dv",
        "label": "Dependent variable",
        "type": "numeric"
      },
      {
        "id": "iv",
        "label": "Grouping variable (3-6 groups)",
        "type": "categorical"
      }
    ]
  },
  "regression": {
    "label": "Simple linear regression",
    "fields": [
      {
        "id": "iv",
        "label": "Predictor (X)",
        "type": "numeric"
      },
      {
        "id": "dv",
        "label": "Outcome (Y)",
        "type": "numeric"
      }
    ]
  },
  "mannwhitney": {
    "label": "Mann-Whitney U",
    "fields": [
      {
        "id": "dv",
        "label": "Dependent variable",
        "type": "numeric"
      },
      {
        "id": "iv",
        "label": "Grouping variable (exactly 2 groups)",
        "type": "categorical"
      }
    ]
  },
  "wilcoxon": {
    "label": "Wilcoxon signed-rank",
    "fields": [
      {
        "id": "v1",
        "label": "Variable 1 (e.g. pre)",
        "type": "numeric"
      },
      {
        "id": "v2",
        "label": "Variable 2 (e.g. post)",
        "type": "numeric"
      }
    ]
  },
  "pearson": {
    "label": "Pearson correlation",
    "fields": [
      {
        "id": "v1",
        "label": "Variable 1",
        "type": "numeric"
      },
      {
        "id": "v2",
        "label": "Variable 2",
        "type": "numeric"
      }
    ]
  },
  "mcnemar": {
    "label": "McNemar test (same people, a yes/no answer at two times)",
    "fields": [
      {
        "id": "v1",
        "label": "First time (a column with exactly two different answers)",
        "type": "binary"
      },
      {
        "id": "v2",
        "label": "Second time (same two answers)",
        "type": "binary"
      }
    ],
    "extra": [
      {
        "id": "pos",
        "label": "Which answer counts as yes (optional)",
        "placeholder": "e.g. Yes. Empty: 1, yes, true or present, else the later answer in the alphabet"
      }
    ]
  },
  "cochran": {
    "label": "Cochran's Q (same people, a yes/no answer at three or more times)",
    "fields": [
      {
        "id": "items",
        "label": "One column per time or condition (tick each; every row is one person)",
        "type": "binary",
        "multi": true,
        "unchecked": true
      }
    ],
    "extra": [
      {
        "id": "pos",
        "label": "Which answer counts as yes (optional)",
        "placeholder": "e.g. Yes. Empty: 1, yes, true or present, else the later answer in the alphabet"
      }
    ]
  },
  "chisq": {
    "label": "Chi-square test of independence",
    "fields": [
      {
        "id": "v1",
        "label": "Variable 1",
        "type": "categorical"
      },
      {
        "id": "v2",
        "label": "Variable 2",
        "type": "categorical"
      }
    ]
  },
  "moderate": {
    "label": "Moderation: does the effect of X on Y depend on a moderator W?",
    "fields": [
      {
        "id": "dv",
        "label": "Outcome (Y)",
        "type": "numeric"
      },
      {
        "id": "x",
        "label": "Predictor (X)",
        "type": "numeric"
      },
      {
        "id": "w",
        "label": "Moderator (W)",
        "type": "numeric"
      }
    ]
  },
  "mediate": {
    "label": "Mediation: does a mediator M carry part of the effect of X on Y?",
    "fields": [
      {
        "id": "x",
        "label": "Predictor (X)",
        "type": "numeric"
      },
      {
        "id": "m",
        "label": "Mediator (M)",
        "type": "numeric"
      },
      {
        "id": "dv",
        "label": "Outcome (Y)",
        "type": "numeric"
      }
    ]
  },
  "logistic": {
    "label": "Logistic regression (a yes/no outcome predicted from other variables)",
    "fields": [
      {
        "id": "dv",
        "label": "Outcome (a column with exactly two different answers, such as 0/1 or yes/no)",
        "type": "binary"
      },
      {
        "id": "preds",
        "label": "Numeric predictors (tick any; a 0/1 column can go here too)",
        "type": "numeric",
        "multi": true,
        "unchecked": true
      },
      {
        "id": "cats",
        "label": "Categorical predictors (tick any; each becomes 0/1 columns)",
        "type": "categorical",
        "multi": true,
        "unchecked": true
      }
    ],
    "extra": [
      {
        "id": "pos",
        "label": "Which answer counts as the event (optional)",
        "placeholder": "e.g. Yes. Empty: 1, yes, true or present, else the later answer in the alphabet"
      },
      {
        "id": "ref",
        "label": "Reference level for a categorical predictor (optional)",
        "placeholder": "e.g. gender=Male, group=Control. Empty means the largest group"
      }
    ]
  },
  "mregress": {
    "label": "Multiple linear regression",
    "fields": [
      {
        "id": "dv",
        "label": "Outcome (Y)",
        "type": "numeric"
      },
      {
        "id": "preds",
        "label": "Numeric predictors (tick any; a 0/1 column can go here too)",
        "type": "numeric",
        "multi": true,
        "unchecked": true
      },
      {
        "id": "cats",
        "label": "Categorical predictors (tick any; each becomes 0/1 columns)",
        "type": "categorical",
        "multi": true,
        "unchecked": true
      },
      {
        "id": "preds2",
        "label": "Step 2 (optional): numeric predictors added after the ones above",
        "type": "numeric",
        "multi": true,
        "unchecked": true
      },
      {
        "id": "cats2",
        "label": "Step 2 (optional): categorical predictors added after the ones above",
        "type": "categorical",
        "multi": true,
        "unchecked": true
      }
    ],
    "extra": [
      {
        "id": "ref",
        "label": "Reference level for a categorical predictor (optional)",
        "placeholder": "e.g. gender=Male, group=Control. Empty means the largest group"
      }
    ]
  },
  "friedman": {
    "label": "Friedman test (same people measured 3 or more times, ranks)",
    "fields": [
      {
        "id": "items",
        "label": "One column per time point or condition (tick each; every row is one person)",
        "type": "numeric",
        "multi": true,
        "unchecked": true
      }
    ]
  },
  "rmanova": {
    "label": "Repeated-measures ANOVA (same people measured 3 or more times)",
    "fields": [
      {
        "id": "items",
        "label": "One column per time point or condition (tick each; every row is one person)",
        "type": "numeric",
        "multi": true,
        "unchecked": true
      }
    ]
  },
  "mixed": {
    "label": "Mixed ANOVA (separate groups, each person measured two or more times)",
    "fields": [
      {
        "id": "grp",
        "label": "Grouping variable (who is in which group)",
        "type": "categorical"
      },
      {
        "id": "items",
        "label": "One column per time point or condition (tick each; every row is one person)",
        "type": "numeric",
        "multi": true,
        "unchecked": true
      }
    ]
  },
  "anova2": {
    "label": "Two-way ANOVA (two grouping variables)",
    "fields": [
      {
        "id": "dv",
        "label": "Dependent variable",
        "type": "numeric"
      },
      {
        "id": "iv",
        "label": "Factor A (grouping variable)",
        "type": "categorical"
      },
      {
        "id": "iv2",
        "label": "Factor B (grouping variable)",
        "type": "categorical"
      }
    ]
  },
  "welchAnova": {
    "label": "One-way ANOVA, Welch (recommended)",
    "fields": [
      {
        "id": "dv",
        "label": "Dependent variable",
        "type": "numeric"
      },
      {
        "id": "iv",
        "label": "Grouping variable (3+ groups)",
        "type": "categorical"
      }
    ]
  },
  "gof": {
    "label": "Chi-square goodness-of-fit",
    "fields": [
      {
        "id": "v1",
        "label": "Categorical variable",
        "type": "categorical"
      }
    ],
    "extra": [
      {
        "id": "exp",
        "label": "Expected shares (optional)",
        "placeholder": "e.g. A:50, B:30, C:20. Empty means equal shares"
      }
    ]
  },
  "kruskal": {
    "label": "Kruskal-Wallis",
    "fields": [
      {
        "id": "dv",
        "label": "Dependent variable",
        "type": "numeric"
      },
      {
        "id": "iv",
        "label": "Grouping variable (3+ groups)",
        "type": "categorical"
      }
    ]
  },
  "spearman": {
    "label": "Spearman correlation",
    "fields": [
      {
        "id": "v1",
        "label": "Variable 1",
        "type": "numeric"
      },
      {
        "id": "v2",
        "label": "Variable 2",
        "type": "numeric"
      }
    ]
  },
  "alpha": {
    "label": "Cronbach's alpha and McDonald's omega",
    "fields": [
      {
        "id": "items",
        "label": "Items of ONE scale (tick each item)",
        "type": "numeric",
        "multi": true
      }
    ],
    "extra": [
      {
        "id": "rev",
        "label": "Reverse-score these items (names, comma separated)",
        "placeholder": "e.g. Q3, Q7"
      },
      {
        "id": "rrange",
        "label": "Lowest and highest answer (needed to reverse)",
        "placeholder": "e.g. 1-5"
      }
    ]
  }
} as const;
