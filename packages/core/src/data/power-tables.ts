// Generated from v1 index.html build 2026.10.13a (e3ad7404efcc) by test/golden/harness. Do not edit; re-run: pnpm --filter @appuscholar/core golden:capture power --emit
export const PW_INFO = {
  "ind": {
    "name": "independent-samples t-test",
    "eff": "Cohen's d",
    "sym": "d",
    "conv": [
      0.2,
      0.5,
      0.8
    ],
    "def": "0.5",
    "nLbl": "People in each group",
    "per": true,
    "hint": "d is the difference between the two group means divided by the pooled standard deviation. Equal group sizes are assumed."
  },
  "paired": {
    "name": "paired-samples t-test",
    "eff": "dz (mean of the differences ÷ SD of the differences)",
    "sym": "dz",
    "conv": [
      0.2,
      0.5,
      0.8
    ],
    "def": "0.5",
    "nLbl": "Number of pairs",
    "hint": "dz uses the standard deviation of the differences between the two measurements. It is larger than d when the two measurements correlate."
  },
  "one": {
    "name": "one-sample t-test",
    "eff": "Cohen's d",
    "sym": "d",
    "conv": [
      0.2,
      0.5,
      0.8
    ],
    "def": "0.5",
    "nLbl": "Number of people",
    "hint": "d is the difference between the sample mean and the fixed value, divided by the standard deviation."
  },
  "anova": {
    "name": "one-way ANOVA",
    "eff": "Cohen's f",
    "sym": "f",
    "conv": [
      0.1,
      0.25,
      0.4
    ],
    "def": "0.25",
    "nLbl": "People in each group",
    "per": true,
    "hint": "f is the spread of the group means divided by the common standard deviation. Equal group sizes are assumed. f = .25 corresponds to η² of about .06."
  },
  "corr": {
    "name": "correlation",
    "eff": "population correlation r",
    "sym": "r",
    "conv": [
      0.1,
      0.3,
      0.5
    ],
    "def": "0.3",
    "nLbl": "Number of people",
    "hint": "Uses the Fisher z approximation, which can differ by one or two people from an exact calculation."
  },
  "regr": {
    "name": "multiple regression (overall F test)",
    "eff": "Cohen's f²",
    "sym": "f²",
    "conv": [
      0.02,
      0.15,
      0.35
    ],
    "def": "0.15",
    "nLbl": "Number of people",
    "hint": "f² = R² ÷ (1 − R²) for the whole set of predictors. f² = .15 corresponds to R² of about .13."
  },
  "chisq": {
    "name": "chi-square test",
    "eff": "Cohen's w",
    "sym": "w",
    "conv": [
      0.1,
      0.3,
      0.5
    ],
    "def": "0.3",
    "nLbl": "Total number of people",
    "hint": "w = √(χ² ÷ N). For a 2×2 table w equals φ. Degrees of freedom: (rows − 1) × (columns − 1), or categories − 1 for goodness of fit."
  }
} as const;
