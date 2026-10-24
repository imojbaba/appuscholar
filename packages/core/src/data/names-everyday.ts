/*
 * Everyday names: words that are given names and also ordinary words, lower case (the form normName gives). A person's spelling that is one of these is found only when it
 * is written with a capital first letter, and is then asked about, never replaced in bulk (spec §7.4, C12): "I will go" is never a find, "Will said" is asked. Devanagari
 * has no capitals, so a Devanagari spelling the student marks everyday is always an ask find.
 * Compiled by the builder on 2026-10-24 from common English words and from common Hindi and Urdu words that are used as given names. It is a judgement, not a verdict: a word
 * belongs here when its lower-case use in ordinary English or Hinglish speech is common enough that a lower-case match would usually be wrong. Surnames are not here.
 * The first-names list (names-first.ts) holds none of these words.
 */
export const EVERYDAY_NAMES: readonly string[] = [
  // English words
  "will", "may", "june", "april", "august", "mark", "bill", "art", "grace", "hope", "faith", "joy", "rose", "dawn", "summer", "sunny", "winter", "autumn",
  "pat", "bob", "rob", "sue", "ray", "rod", "guy", "gene", "dean", "don", "frank", "grant", "page", "drew", "chase", "cash", "chance", "wade", "jack",
  "jay", "jade", "jewel",
  // English words
  "mercy", "charity", "patience", "prudence", "justice", "honor", "trinity", "unity", "pearl", "ruby", "amber", "crystal", "coral", "daisy", "lily",
  "olive", "violet", "holly", "ivy", "iris", "hazel", "heather", "ginger", "cherry", "candy", "honey", "poppy", "sage", "scarlet", "willow", "robin",
  "jasmine",
  // English words
  "angel", "sandy", "sky", "skye", "star", "storm", "rain", "river", "brook", "forest", "dale", "glen", "lane", "hunter", "mason", "archer", "major",
  "king", "prince", "earl", "duke", "victor", "christian", "job", "carol", "eve", "penny", "nick", "miles", "bliss", "harmony", "destiny", "liberty",
  "lucky", "happy", "baby", "princess", "precious",
  // Hindi words
  "asha", "kiran", "pooja", "puja", "raja", "rani", "dev", "anand", "prem", "shanti", "shakti", "sagar", "tara", "usha", "jyoti", "kamal", "neel", "sona",
  "sundar", "sunder", "vijay", "sapna", "seema", "diya", "bharat", "ganga", "madhu", "pawan", "prakash", "roshni", "chandni", "chand", "suraj", "surya",
  "noor", "khushi", "veer", "jeet", "preet", "meet", "lovely", "amrit", "deep", "harsh", "aarti", "arti",
];
