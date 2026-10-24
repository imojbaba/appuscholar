/*
 * Everyday names: words that are given names and also ordinary words, lower case (the form normName gives). This is the default the Add form pre-ticks "also an everyday word"
 * from (spec §7.4), and what isEverydayName reports. The matcher itself does not read it (ruling R6, 2026-10-24): only a spelling the person's own `everyday` list marks is found
 * just when written with a capital first letter and then asked about, never replaced in bulk (C12); "I will go" is then never a find and "Will said" is asked. Devanagari has no
 * capitals, so a Devanagari spelling the student marks everyday is always an ask find.
 * Compiled by the builder on 2026-10-24 from common English words and from common Hindi and Urdu words that are used as given names. It is a judgement, not a verdict: a word
 * belongs here when its lower-case use in ordinary English or Hinglish speech is common enough that a lower-case match would usually be wrong. Surnames are not here.
 * The first-names list (names-first.ts) holds none of these words.
 * Ruling R50 (2026-10-24): the romanised Hindi words that English-language writing uses chiefly as given names (Seema, Usha, Vijay, Anand, Prakash, Jyoti, Noor, Tara and others of that kind) are
 * not here but in names-first.ts: a listed person with one of them is not pre-ticked "also an everyday word", and a capitalised one that is not listed is suggested. What stays of the Hindi words
 * is the spec's six and the words that are still common ordinary words (sona, sundar: "to sleep", "beautiful"; meet, deep, harsh, lovely: English; ganga, bharat, surya, chand, shakti: a river,
 * a country, the sun, the moon, power).
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
  // Hindi words that are also ordinary words in Hinglish and in English writing about India (the spec's six first: Asha, Kiran, Pooja, Raja, Rani, Dev)
  "asha", "kiran", "pooja", "puja", "raja", "rani", "dev", "shakti", "sona", "sundar", "sunder", "bharat", "ganga", "chand", "surya", "jeet", "meet", "lovely", "deep", "harsh",
];
