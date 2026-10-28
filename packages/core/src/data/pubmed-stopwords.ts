/* PubMed's published stopword list, copied on 2026-10-20 from https://pubmed.ncbi.nlm.nih.gov/help/#help-stopwords (the page is dated "Last update: September 30, 2026").
   PubMed ignores these words in a search, so a stopword tagged [tiab] matches nothing: pmTopicBlock (research.ts) drops them from the topic before it tags the rest.
   130 words are listed under "Stopwords"; the same page's "Computation of similar articles" says 132. The list is copied as published, not completed. */
export const PUBMED_STOPWORDS: readonly string[] = [
  "a", "about", "again", "all", "almost", "also", "although", "always", "among", "an", "and", "another", "any", "are", "as", "at", "be", "because",
  "been", "before", "being", "between", "both", "but", "by", "can", "could", "did", "do", "does", "done", "due", "during", "each", "either",
  "enough", "especially", "etc", "for", "found", "from", "further", "had", "has", "have", "having", "here", "how", "however", "i", "if", "in",
  "into", "is", "it", "its", "itself", "just", "kg", "km", "made", "mainly", "make", "may", "mg", "might", "ml", "mm", "most", "mostly", "must",
  "nearly", "neither", "no", "nor", "obtained", "of", "often", "on", "our", "overall", "perhaps", "pmid", "quite", "rather", "really", "regarding",
  "seem", "seen", "several", "should", "show", "showed", "shown", "shows", "significantly", "since", "so", "some", "such", "than", "that", "the",
  "their", "theirs", "them", "then", "there", "therefore", "these", "they", "this", "those", "through", "thus", "to", "upon", "various", "very",
  "was", "we", "were", "what", "when", "which", "while", "with", "within", "without", "would"
];
