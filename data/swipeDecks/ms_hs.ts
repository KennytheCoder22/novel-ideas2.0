// /data/swipeDecks/ms_hs.ts
// Canonical Teen (MS/HS) swipe deck.
// Fully canonical rewrite aligned to the expanded semanticTraitRegistry.ts and tagNormalizationMap.ts.

import type { SwipeDeck } from "./types";
const GRAPHIC_NOVEL_KEYWORDS = new Set([
  "superhero","fantasy","sci_fi","dystopian","romance","mystery","horror","adventure","comedy","mythology",
  "historical","drama","coming_of_age","survival","crime","school_life","paranormal","slice_of_life","action",
  "manga","queer_identity","sports","western",
]);

const MSHS_GRAPHIC_NOVEL_KEYWORDS_BY_TITLE: Record<string, string[]> = {
  "spider-man: into the spider-verse": ["superhero", "action", "coming_of_age"],
  "spider-man: homecoming": ["superhero", "coming_of_age", "school_life"],
  "the batman": ["superhero", "mystery", "crime"],
  "the dark knight": ["superhero", "crime", "drama"],
  "smallville": ["superhero", "coming_of_age", "drama"],
  "the umbrella academy": ["superhero", "sci_fi", "drama"],
  "heartstopper: volume 1": ["romance", "coming_of_age", "queer_identity", "slice_of_life"],
  "lore olympus: volume one": ["romance", "mythology", "fantasy"],
  "nimona": ["fantasy", "comedy", "action"],
};

function inferMsHsGraphicNovelKeywords(card: any): string[] {
  const titleKey = String(card?.title || "").trim().toLowerCase();
  const explicit = MSHS_GRAPHIC_NOVEL_KEYWORDS_BY_TITLE[titleKey] || [];
  const fromCard = Array.isArray(card?.graphicNovelKeywords) ? card.graphicNovelKeywords : [];
  const tags = Array.isArray(card?.tags) ? card.tags.map((t: unknown) => String(t || "").toLowerCase()) : [];
  const joined = [titleKey, String(card?.genre || "").toLowerCase(), ...tags].join(" ");
  const inferred: string[] = [];
  if (/superhero|superheroes|spider-man|batman|smallville|marvel|dc\b/.test(joined)) inferred.push("superhero");
  if (/fantasy|magic|myth|dragon|witcher|zelda/.test(joined)) inferred.push("fantasy");
  if (/science fiction|sci[- ]?fi|cyberpunk|space|future|doctor who/.test(joined)) inferred.push("sci_fi");
  if (/dystopian|apocalypse|rebellion|hunger games|maze runner/.test(joined)) inferred.push("dystopian");
  if (/romance|love|heartstopper|young royals/.test(joined)) inferred.push("romance");
  if (/mystery|detective|investigation|sherlock/.test(joined)) inferred.push("mystery");
  if (/horror|haunted|ghost|walking dead/.test(joined)) inferred.push("horror");
  if (/adventure|quest|journey/.test(joined)) inferred.push("adventure");
  if (/mythology|percy jackson|olympus/.test(joined)) inferred.push("mythology");
  if (/crime|heist|noir/.test(joined)) inferred.push("crime");
  if (/coming of age|coming-of-age|teen|school/.test(joined)) inferred.push("coming_of_age");
  if (/anime|manga/.test(joined)) inferred.push("manga");
  const combined = Array.from(new Set([...explicit, ...fromCard, ...inferred].map((v) => String(v || "").toLowerCase())))
    .filter((k) => GRAPHIC_NOVEL_KEYWORDS.has(k))
    .slice(0, 4);
  return combined.length ? combined : ["drama"];
}

const CANON_MSHS_BOOKS: any[] = [
  { isDefault: true, title: "The Hunger Games", semantic: { contentTraits: ["dystopian_society","survival_game","rebellion"], toneTraits: ["intense","dark","fast"], characterTraits: ["reluctant_leader"], storyTraits: ["competition_arc","resistance_story","survival_story"], aversionTraits: ["violence","bleak_tone"] }, author: "Suzanne Collins", genre: "Dystopian / Survival", wikiTitle: "The Hunger Games", tags: ["audience:teen","age:mshs","media:book","dystopian","survival","high stakes","fast-paced","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 1, realism: 0.0, characterFocus: 0.0, ideaDensity: 0.0 },  output: { genre: ["dystopian","survival","high stakes"], vibes: ["fast-paced","dark"] }, },
  { isDefault: true, title: "Catching Fire", semantic: { contentTraits: ["rebellion","political_control","arena"], toneTraits: ["tense","dark","dramatic"], characterTraits: ["reluctant_leader"], storyTraits: ["return_to_arena","revolt_building","survival_story"], aversionTraits: ["violence","bleak_tone"] }, author: "Suzanne Collins", genre: "Dystopian / Action", wikiTitle: "Catching Fire", tags: ["audience:teen","age:mshs","media:book","dystopian","political","survival","fast-paced","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 1, realism: 0.07, characterFocus: 0.16, ideaDensity: 0.55 },  output: { genre: ["dystopian","political","survival"], vibes: ["fast-paced","dark"] }, },
  { isDefault: true, title: "Divergent", semantic: { contentTraits: ["faction_society","identity","rebellion"], toneTraits: ["serious","dramatic","fast"], characterTraits: ["independent_protagonist"], storyTraits: ["training_arc","rebellion_against_society","identity_discovery"], aversionTraits: ["predictable_tropes"] }, author: "Veronica Roth", genre: "Dystopian / Adventure", wikiTitle: "Divergent", tags: ["audience:teen","age:mshs","media:book","dystopian","identity","adventure","fast-paced"],tasteTraits: { warmth: 0.0, darkness: 0.5, pacing: 1, realism: -0.48, characterFocus: 1, ideaDensity: 1 },  output: { genre: ["dystopian","identity","adventure"], vibes: ["fast-paced"] }, },
  { isDefault: true, title: "The Maze Runner", semantic: { contentTraits: ["memory_loss","maze","survival"], toneTraits: ["mysterious","tense","fast"], characterTraits: ["curious_leader"], storyTraits: ["escape_mystery","group_dynamics","truth_discovery"], aversionTraits: ["violence","complexity"] }, author: "James Dashner", genre: "Dystopian / Mystery", wikiTitle: "The Maze Runner", tags: ["audience:teen","age:mshs","media:book","dystopian","mystery","survival","fast-paced"],tasteTraits: { warmth: 0.0, darkness: 0.5, pacing: 1, realism: 0.0, characterFocus: 0.0, ideaDensity: 0.45 },  output: { genre: ["dystopian","mystery","survival"], vibes: ["fast-paced"] }, },
  { isDefault: true, title: "Legend", semantic: { contentTraits: ["dystopian_society","political_control","survival"], toneTraits: ["fast","tense","dark"], characterTraits: ["young_leaders"], storyTraits: ["cat_and_mouse","resistance_story","identity_discovery"], aversionTraits: ["violence"] }, author: "Marie Lu", genre: "Dystopian / Thriller", wikiTitle: "Legend (novel)", tags: ["audience:teen","age:mshs","media:book","dystopian","thriller","survival","fast-paced","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 1, realism: 0.0, characterFocus: 0.52, ideaDensity: 0.48 },  output: { genre: ["dystopian","thriller","survival"], vibes: ["fast-paced","dark"] }, },
  { isDefault: true, title: "The Giver", semantic: { contentTraits: ["political_control","memory","social_divide"], toneTraits: ["quiet","thoughtful","somber"], characterTraits: ["questioning_protagonist"], storyTraits: ["awakening","rebellion_against_society","truth_discovery"], aversionTraits: ["quiet_pacing"] }, author: "Lois Lowry", genre: "Dystopian / Drama", wikiTitle: "The Giver", tags: ["audience:teen","age:mshs","media:book","dystopian","drama","identity","political"],tasteTraits: { warmth: 0.0, darkness: 0.77, pacing: -0.27, realism: -0.14, characterFocus: 0.84, ideaDensity: 1 },  output: { genre: ["dystopian","drama","identity","political"], vibes: [] }, },
  { isDefault: true, title: "Scythe", semantic: { contentTraits: ["death_system","authority","competition"], toneTraits: ["serious","intense","thoughtful"], characterTraits: ["morally_conflicted_teens"], storyTraits: ["training_arc","ideological_conflict","power_struggle"], aversionTraits: ["violence","heavy_themes"] }, author: "Neal Shusterman", genre: "Science Fiction / Dystopian", wikiTitle: "Scythe (novel)", tags: ["audience:teen","age:mshs","media:book","science fiction","dystopian","authority","high stakes"],tasteTraits: { warmth: 0.0, darkness: 0.66, pacing: 0.41, realism: -1, characterFocus: 0.0, ideaDensity: 0.57 },  output: { genre: ["science fiction","dystopian","authority","high stakes"], vibes: [] }, },
  { isDefault: true, title: "Unwind", semantic: { contentTraits: ["systemic_injustice","survival","political_control"], toneTraits: ["dark","tense","thoughtful"], characterTraits: ["outsider_teens"], storyTraits: ["escape_and_pursuit","survival_story","system_exposure"], aversionTraits: ["body_horror","heavy_themes"] }, author: "Neal Shusterman", genre: "Dystopian / Thriller", wikiTitle: "Unwind", tags: ["audience:teen","age:mshs","media:book","dystopian","thriller","survival","systemic injustice","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 1, realism: 0.0, characterFocus: 0.0, ideaDensity: 0.95 },  output: { genre: ["dystopian","thriller","survival","systemic injustice"], vibes: ["dark"] }, },
  { isDefault: true, title: "Six of Crows", semantic: { contentTraits: ["crime","found_family","heist"], toneTraits: ["dark","clever","fast"], characterTraits: ["lovable_misfits","morally_complicated_characters"], storyTraits: ["heist_twists","team_building","strategic_conflict"], aversionTraits: ["complex_plotting"] }, author: "Leigh Bardugo", genre: "Fantasy / Heist", wikiTitle: "Six of Crows", tags: ["audience:teen","age:mshs","media:book","fantasy","crime","family","fast-paced","dark"],tasteTraits: { warmth: 0.5, darkness: 1, pacing: 1, realism: -0.73, characterFocus: 1, ideaDensity: 0.18 },  output: { genre: ["fantasy","crime","family"], vibes: ["fast-paced","dark"] }, },
  { isDefault: true, title: "Crooked Kingdom", semantic: { contentTraits: ["crime","found_family","revenge"], toneTraits: ["dark","clever","intense"], characterTraits: ["lovable_misfits","morally_complicated_characters"], storyTraits: ["revenge_cycle","strategic_conflict","team_building"], aversionTraits: ["complex_plotting"] }, author: "Leigh Bardugo", genre: "Fantasy / Crime", wikiTitle: "Crooked Kingdom", tags: ["audience:teen","age:mshs","media:book","fantasy","crime","family","dark"],tasteTraits: { warmth: 0.5, darkness: 1, pacing: 0.48, realism: -0.73, characterFocus: 1, ideaDensity: 0.27 },  output: { genre: ["fantasy","crime","family"], vibes: ["dark"] }, },
  { isDefault: true, title: "Shadow and Bone", semantic: { contentTraits: ["magic_system","war","chosen_one"], toneTraits: ["dramatic","adventurous","serious"], characterTraits: ["outsider_protagonist"], storyTraits: ["training_arc","destiny_conflict","coming_into_power"], aversionTraits: ["predictable_tropes"] }, author: "Leigh Bardugo", genre: "Fantasy / Adventure", wikiTitle: "Shadow and Bone", tags: ["audience:teen","age:mshs","media:book","fantasy","adventure","war & society"],tasteTraits: { warmth: 0.0, darkness: 0.61, pacing: 0.61, realism: -1, characterFocus: 0.16, ideaDensity: 0.5 },  output: { genre: ["fantasy","adventure","war & society"], vibes: [] }, },
  { isDefault: true, title: "Harry Potter and the Sorcerer's Stone", semantic: { contentTraits: ["magic_school","friendship","chosen_one"], toneTraits: ["wonder_filled","fun","hopeful"], characterTraits: ["outsider_kids","young_wizards"], storyTraits: ["journey_beginning","coming_into_power","friendship_growth"], aversionTraits: ["younger_skew"] }, author: "J.K. Rowling", genre: "Fantasy / School", wikiTitle: "Harry Potter and the Philosopher's Stone", tags: ["audience:teen","age:mshs","media:book","fantasy","school","friendship","hopeful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.0, realism: -0.5, characterFocus: 1, ideaDensity: 0.0 },  output: { genre: ["fantasy","school","friendship"], vibes: ["hopeful"] }, },
  { isDefault: true, title: "Harry Potter and the Prisoner of Azkaban", semantic: { contentTraits: ["magic_school","time_travel","mystery"], toneTraits: ["mysterious","dark","wonder_filled"], characterTraits: ["young_wizards"], storyTraits: ["investigation","truth_reveal","coming_of_age"], aversionTraits: ["heavier_tone"] }, author: "J.K. Rowling", genre: "Fantasy / Mystery", wikiTitle: "Harry Potter and the Prisoner of Azkaban", tags: ["audience:teen","age:mshs","media:book","fantasy","mystery","school","time travel","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.2, realism: -1, characterFocus: 0.36, ideaDensity: 0.8 },  output: { genre: ["fantasy","mystery","school","time travel"], vibes: ["dark"] }, },
  { isDefault: true, title: "Percy Jackson & the Olympians: The Lightning Thief", semantic: { contentTraits: ["greek_mythology","demigods","adventure"], toneTraits: ["fun","adventurous","witty"], characterTraits: ["reluctant_hero","loyal_friends"], storyTraits: ["quest_journey","identity_discovery","coming_of_age"], aversionTraits: ["younger_skew"] }, author: "Rick Riordan", genre: "Fantasy / Adventure", wikiTitle: "The Lightning Thief", tags: ["audience:teen","age:mshs","media:book","fantasy","adventure","mythology","identity","friendship","playful"],tasteTraits: { warmth: 0.73, darkness: 0.0, pacing: 0.91, realism: -1, characterFocus: 1, ideaDensity: 0.41 },  output: { genre: ["fantasy","adventure","mythology","identity","friendship"], vibes: ["playful"] }, },
  { isDefault: true, title: "The Sea of Monsters", semantic: { contentTraits: ["greek_mythology","demigods","adventure"], toneTraits: ["fun","adventurous","witty"], characterTraits: ["young_heroes","loyal_friends"], storyTraits: ["quest_journey","team_growth","rescue_mission"], aversionTraits: ["younger_skew"] }, author: "Rick Riordan", genre: "Fantasy / Adventure", wikiTitle: "The Sea of Monsters", tags: ["audience:teen","age:mshs","media:book","fantasy","adventure","mythology","friendship","playful"],tasteTraits: { warmth: 0.73, darkness: 0.0, pacing: 0.91, realism: -1, characterFocus: 0.7, ideaDensity: 0.0 },  output: { genre: ["fantasy","adventure","mythology","friendship"], vibes: ["playful"] }, },
  { isDefault: true, title: "The Outsiders", semantic: { contentTraits: ["friendship","class_conflict","family"], toneTraits: ["emotional","serious","grounded"], characterTraits: ["outsider_teens"], storyTraits: ["coming_of_age","loyalty_under_pressure","tragedy_and_growth"], aversionTraits: ["sad_outcome"] }, author: "S. E. Hinton", genre: "Realistic / Coming-of-Age", wikiTitle: "The Outsiders (novel)", tags: ["audience:teen","age:mshs","media:book","drama","friendship","family","outsider","coming of age","realistic","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.0, realism: 1, characterFocus: 1, ideaDensity: 0.0 },  output: { genre: ["drama","friendship","family","outsider","realistic"], vibes: ["coming of age","emotional growth"] }, },
  { isDefault: true, title: "The Perks of Being a Wallflower", semantic: { contentTraits: ["teen_friendship","mental_health","trauma"], toneTraits: ["emotional","reflective","warm"], characterTraits: ["shy_protagonist"], storyTraits: ["self_realization","healing_arc","coming_of_age"], aversionTraits: ["heavy_themes"] }, author: "Stephen Chbosky", genre: "Drama / Coming-of-Age", wikiTitle: "The Perks of Being a Wallflower", tags: ["audience:teen","age:mshs","media:book","drama","coming of age","identity","friendship","vulnerability","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -0.11, realism: 0.14, characterFocus: 1, ideaDensity: 0.2 },  output: { genre: ["drama","identity","friendship","vulnerability"], vibes: ["coming of age","emotional growth"] }, },
  { isDefault: true, title: "Speak", semantic: { contentTraits: ["trauma","school","identity"], toneTraits: ["quiet","serious","emotional"], characterTraits: ["silenced_protagonist"], storyTraits: ["self_reclamation","finding_your_voice","healing_arc"], aversionTraits: ["heavy_themes"] }, author: "Laurie Halse Anderson", genre: "Drama / Realistic", wikiTitle: "Speak (Anderson novel)", tags: ["audience:teen","age:mshs","media:book","drama","school","identity","realistic","vulnerability","emotional growth"],tasteTraits: { warmth: 0.32, darkness: 0.2, pacing: -0.2, realism: 1, characterFocus: 1, ideaDensity: 0.41 },  output: { genre: ["drama","school","identity","realistic","vulnerability"], vibes: ["emotional growth"] }, },
  { isDefault: true, title: "Long Way Down", semantic: { contentTraits: ["grief","violence","family"], toneTraits: ["intense","somber","thoughtful"], characterTraits: ["wounded_protagonist"], storyTraits: ["moral_test_under_pressure","reckoning_with_loss","compressed_journey"], aversionTraits: ["violence","sad_theme"] }, author: "Jason Reynolds", genre: "Drama / Realistic", wikiTitle: "Long Way Down (novel)", tags: ["audience:teen","age:mshs","media:book","drama","family","realistic","vulnerability","high stakes"],tasteTraits: { warmth: 0.61, darkness: 0.61, pacing: 0.41, realism: 1, characterFocus: 1, ideaDensity: 0.0 },  output: { genre: ["drama","family","realistic","vulnerability","high stakes"], vibes: [] }, },
  { isDefault: true, title: "The Hate U Give", semantic: { contentTraits: ["systemic_injustice","identity","community"], toneTraits: ["emotional","powerful","serious"], characterTraits: ["courageous_teen"], storyTraits: ["finding_your_voice","community_action","identity_conflict"], aversionTraits: ["heavy_themes","violence"] }, author: "Angie Thomas", genre: "Drama / Contemporary", wikiTitle: "The Hate U Give", tags: ["audience:teen","age:mshs","media:book","drama","identity","community","systemic injustice","realistic","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.0, realism: 1, characterFocus: 1, ideaDensity: 1 },  output: { genre: ["drama","identity","community","systemic injustice","realistic"], vibes: ["emotional growth"] }, },
  { isDefault: true, title: "Dear Martin", semantic: { contentTraits: ["systemic_injustice","identity","education"], toneTraits: ["thoughtful","serious","emotional"], characterTraits: ["questioning_protagonist"], storyTraits: ["identity_conflict","social_reckoning","coming_of_age"], aversionTraits: ["heavy_themes"] }, author: "Nic Stone", genre: "Drama / Contemporary", wikiTitle: "Dear Martin", tags: ["audience:teen","age:mshs","media:book","drama","identity","school","systemic injustice","realistic"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: -0.07, realism: 1, characterFocus: 1, ideaDensity: 1 },  output: { genre: ["drama","identity","school","systemic injustice","realistic"], vibes: [] }, },
  { isDefault: true, title: "One of Us Is Lying", semantic: { contentTraits: ["murder_mystery","school","secrets"], toneTraits: ["tense","fast","dramatic"], characterTraits: ["morally_mixed_teens"], storyTraits: ["whodunit","twist_reveal","social_pressure"], aversionTraits: ["melodrama"] }, author: "Karen M. McManus", genre: "Mystery / Thriller", wikiTitle: "One of Us Is Lying", tags: ["audience:teen","age:mshs","media:book","mystery","thriller","school","fast-paced"],tasteTraits: { warmth: 0.0, darkness: 0.41, pacing: 1, realism: 0.48, characterFocus: 0.16, ideaDensity: 0.34 },  output: { genre: ["mystery","thriller","school"], vibes: ["fast-paced"] }, },
  { isDefault: true, title: "A Good Girl's Guide to Murder", semantic: { contentTraits: ["crime_solving","small_town_mystery","school"], toneTraits: ["clever","tense","fast"], characterTraits: ["resourceful_protagonist"], storyTraits: ["investigation","truth_discovery","case_solving"], aversionTraits: ["crime_content"] }, author: "Holly Jackson", genre: "Mystery / Crime", wikiTitle: "A Good Girl's Guide to Murder", tags: ["audience:teen","age:mshs","media:book","mystery","crime","school","fast-paced"],tasteTraits: { warmth: 0.0, darkness: 0.48, pacing: 1, realism: 0.41, characterFocus: 0.0, ideaDensity: 0.61 },  output: { genre: ["mystery","crime","school"], vibes: ["fast-paced"] }, },
  { isDefault: true, title: "Truly Devious", semantic: { contentTraits: ["school_mystery","crime_solving","secrets"], toneTraits: ["moody","clever","mysterious"], characterTraits: ["obsessive_investigator"], storyTraits: ["cold_case_investigation","mystery_unfolding","school_intrigue"], aversionTraits: ["slow_burn"] }, author: "Maureen Johnson", genre: "Mystery / School", wikiTitle: "Truly Devious", tags: ["audience:teen","age:mshs","media:book","mystery","school","crime","atmospheric"],tasteTraits: { warmth: 0.0, darkness: 0.32, pacing: 0.23, realism: 0.82, characterFocus: 0.0, ideaDensity: 0.66 },  output: { genre: ["mystery","school","crime"], vibes: ["atmospheric"] }, },
  { isDefault: true, title: "The Fault in Our Stars", semantic: { contentTraits: ["illness","romance","mortality"], toneTraits: ["emotional","bittersweet","tender"], characterTraits: ["thoughtful_teens"], storyTraits: ["love_story","inevitable_loss","coming_of_age"], aversionTraits: ["sad_theme"] }, author: "John Green", genre: "Romance / Drama", wikiTitle: "The Fault in Our Stars", tags: ["audience:teen","age:mshs","media:book","romance","drama","emotional growth","warm"],tasteTraits: { warmth: 1, darkness: 0.2, pacing: -0.07, realism: 0.14, characterFocus: 1, ideaDensity: 0.0 },  output: { genre: ["romance","drama"], vibes: ["emotional growth","warm"] }, },
  { isDefault: true, title: "Looking for Alaska", semantic: { contentTraits: ["school","friendship","grief"], toneTraits: ["reflective","emotional","witty"], characterTraits: ["searching_teens"], storyTraits: ["coming_of_age","friendship_growth","loss_and_reckoning"], aversionTraits: ["sad_theme"] }, author: "John Green", genre: "Drama / Coming-of-Age", wikiTitle: "Looking for Alaska", tags: ["audience:teen","age:mshs","media:book","drama","school","friendship","coming of age","identity","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: -0.11, realism: 0.55, characterFocus: 1, ideaDensity: 0.2 },  output: { genre: ["drama","school","friendship","identity"], vibes: ["coming of age","emotional growth"] }, },
  { isDefault: true, title: "Eleanor & Park", semantic: { contentTraits: ["romance","outsider_identity","family_conflict"], toneTraits: ["tender","warm","emotional"], characterTraits: ["outsider_teens"], storyTraits: ["relationship_building","coming_of_age","first_love"], aversionTraits: ["sad_tone"] }, author: "Rainbow Rowell", genre: "Romance / Contemporary", wikiTitle: "Eleanor & Park", tags: ["audience:teen","age:mshs","media:book","romance","identity","friendship","outsider","warm","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: 0.0, realism: 0.25, characterFocus: 1, ideaDensity: 0.41 },  output: { genre: ["romance","identity","friendship","outsider"], vibes: ["warm","emotional growth"] }, },
  { isDefault: true, title: "Fangirl", semantic: { contentTraits: ["college_transition","family","identity"], toneTraits: ["warm","quirky","thoughtful"], characterTraits: ["introverted_protagonist"], storyTraits: ["self_realization","relationship_building","coming_of_age"], aversionTraits: ["quiet_pacing"] }, author: "Rainbow Rowell", genre: "Contemporary / Coming-of-Age", wikiTitle: "Fangirl (novel)", tags: ["audience:teen","age:mshs","media:book","drama","identity","family","coming of age","quirky","warm"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -0.07, realism: 0.32, characterFocus: 1, ideaDensity: 0.41 },  output: { genre: ["drama","identity","family"], vibes: ["coming of age","quirky","warm"] }, },
  { isDefault: true, title: "The Book Thief", semantic: { contentTraits: ["war","books","friendship"], toneTraits: ["somber","emotional","hopeful"], characterTraits: ["resilient_child"], storyTraits: ["survival_story","relationship_building","narrated_memory"], aversionTraits: ["sad_theme","war_cruelty"] }, author: "Markus Zusak", genre: "Historical / Drama", wikiTitle: "The Book Thief", tags: ["audience:teen","age:mshs","media:book","historical","drama","war & society","friendship","nostalgia","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.89, pacing: 0.14, realism: 1, characterFocus: 1, ideaDensity: 0.36 },  output: { genre: ["historical","drama","war & society","friendship","nostalgia"], vibes: ["emotional growth"] }, },
  { isDefault: true, title: "Code Name Verity", semantic: { contentTraits: ["war","friendship","deception"], toneTraits: ["tense","emotional","serious"], characterTraits: ["courageous_friends"], storyTraits: ["survival_story","test_of_loyalty","truth_reveal"], aversionTraits: ["war_cruelty","sad_theme"] }, author: "Elizabeth Wein", genre: "Historical / Thriller", wikiTitle: "Code Name Verity", tags: ["audience:teen","age:mshs","media:book","historical","thriller","friendship","war & society","high stakes"],tasteTraits: { warmth: 1, darkness: 1, pacing: 0.8, realism: 1, characterFocus: 1, ideaDensity: 0.25 },  output: { genre: ["historical","thriller","friendship","war & society","high stakes"], vibes: [] }, },
  { isDefault: true, title: "The Book of Dust", semantic: { contentTraits: ["parallel_worlds","political_control","adventure"], toneTraits: ["mysterious","serious","adventurous"], characterTraits: ["curious_hero"], storyTraits: ["quest_journey","truth_discovery","coming_into_power"], aversionTraits: ["worldbuilding_density"] }, author: "Philip Pullman", genre: "Fantasy / Adventure", wikiTitle: "La Belle Sauvage", tags: ["audience:teen","age:mshs","media:book","fantasy","adventure","political","mystery"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.89, realism: -0.73, characterFocus: 0.0, ideaDensity: 0.66 },  output: { genre: ["fantasy","adventure","political","mystery"], vibes: [] }, },
  { isDefault: true, title: "His Dark Materials: The Golden Compass", semantic: { contentTraits: ["parallel_worlds","religion","rebellion"], toneTraits: ["adventurous","mysterious","serious"], characterTraits: ["curious_explorer"], storyTraits: ["quest_journey","truth_discovery","outsider_resilience"], aversionTraits: ["complex_themes"] }, author: "Philip Pullman", genre: "Fantasy / Adventure", wikiTitle: "Northern Lights (Pullman novel)", tags: ["audience:teen","age:mshs","media:book","fantasy","adventure","mystery","political"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.68, realism: -0.73, characterFocus: 0.0, ideaDensity: 0.64 },  output: { genre: ["fantasy","adventure","mystery","political"], vibes: [] }, },
  { isDefault: true, title: "Eragon", semantic: { contentTraits: ["dragons","destiny","adventure"], toneTraits: ["epic","adventurous","hopeful"], characterTraits: ["farmboy_hero"], storyTraits: ["coming_into_power","quest_journey","mentor_guided_growth"], aversionTraits: ["predictable_tropes"] }, author: "Christopher Paolini", genre: "Fantasy / Epic", wikiTitle: "Eragon", tags: ["audience:teen","age:mshs","media:book","fantasy","adventure","dragon","epic","hopeful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.75, realism: -1, characterFocus: 0.0, ideaDensity: 0.0 },  output: { genre: ["fantasy","adventure","dragon"], vibes: ["epic","hopeful"] }, },
  { isDefault: true, title: "Children of Blood and Bone", semantic: { contentTraits: ["magic","rebellion","political_control"], toneTraits: ["dramatic","intense","epic"], characterTraits: ["young_leaders"], storyTraits: ["resistance_story","quest_journey","coming_into_power"], aversionTraits: ["violence"] }, author: "Tomi Adeyemi", genre: "Fantasy / Adventure", wikiTitle: "Children of Blood and Bone", tags: ["audience:teen","age:mshs","media:book","fantasy","adventure","political","epic","high stakes"],tasteTraits: { warmth: 0.0, darkness: 0.16, pacing: 0.98, realism: -1, characterFocus: 0.16, ideaDensity: 0.55 },  output: { genre: ["fantasy","adventure","political","high stakes"], vibes: ["epic"] }, },
  { isDefault: true, title: "An Ember in the Ashes", semantic: { contentTraits: ["political_control","survival","rebellion"], toneTraits: ["dark","intense","dramatic"], characterTraits: ["outsider_teens"], storyTraits: ["resistance_story","survival_story","identity_conflict"], aversionTraits: ["violence","bleak_tone"] }, author: "Sabaa Tahir", genre: "Fantasy / Dystopian", wikiTitle: "An Ember in the Ashes", tags: ["audience:teen","age:mshs","media:book","fantasy","dystopian","survival","political","dark","high stakes"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 1, realism: -0.66, characterFocus: 0.68, ideaDensity: 0.75 },  output: { genre: ["fantasy","dystopian","survival","political","high stakes"], vibes: ["dark"] }, },
  { isDefault: true, title: "The Cruel Prince", semantic: { contentTraits: ["court_politics","identity","betrayal"], toneTraits: ["dark","stylish","sharp"], characterTraits: ["ambitious_outsider"], storyTraits: ["power_struggle","court_intrigue","identity_formation"], aversionTraits: ["moral_ambiguity"] }, author: "Holly Black", genre: "Fantasy / Political", wikiTitle: "The Cruel Prince", tags: ["audience:teen","age:mshs","media:book","fantasy","political","betrayal","dark","atmospheric"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: -0.05, realism: -0.73, characterFocus: 1, ideaDensity: 0.98 },  output: { genre: ["fantasy","political","betrayal"], vibes: ["dark","atmospheric"] }, },
  { isDefault: true, title: "Caraval", semantic: { contentTraits: ["sister_relationship","mystery_game","magic"], toneTraits: ["whimsical","atmospheric","romantic"], characterTraits: ["curious_sisters"], storyTraits: ["game_of_illusions","truth_discovery","relationship_building"], aversionTraits: ["ornate_style"] }, author: "Stephanie Garber", genre: "Fantasy / Mystery", wikiTitle: "Caraval", tags: ["audience:teen","age:mshs","media:book","fantasy","mystery","family","atmospheric","romance"],tasteTraits: { warmth: 0.45, darkness: 0.0, pacing: 0.11, realism: -1, characterFocus: 1, ideaDensity: 0.39 },  output: { genre: ["fantasy","mystery","family","romance"], vibes: ["atmospheric"] }, },
  { isDefault: true, title: "Legendborn", semantic: { contentTraits: ["magic","identity","grief"], toneTraits: ["dramatic","smart","dark"], characterTraits: ["outsider_heroine"], storyTraits: ["coming_into_power","secret_society_mystery","self_reclamation"], aversionTraits: ["complexity"] }, author: "Tracy Deonn", genre: "Fantasy / Mystery", wikiTitle: "Legendborn", tags: ["audience:teen","age:mshs","media:book","fantasy","mystery","identity","school","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.2, realism: -0.84, characterFocus: 1, ideaDensity: 0.75 },  output: { genre: ["fantasy","mystery","identity","school"], vibes: ["dark"] }, },
  { isDefault: true, title: "Miss Peregrine's Home for Peculiar Children", semantic: { contentTraits: ["time_loop","monsters","outsider_identity"], toneTraits: ["spooky","mysterious","adventurous"], characterTraits: ["outsider_protagonist"], storyTraits: ["truth_discovery","found_family","escape_and_pursuit"], aversionTraits: ["unease"] }, author: "Ransom Riggs", genre: "Fantasy / Paranormal", wikiTitle: "Miss Peregrine's Home for Peculiar Children", tags: ["audience:teen","age:mshs","media:book","fantasy","spooky","identity","family","mystery"],tasteTraits: { warmth: 0.5, darkness: 1, pacing: 0.27, realism: -1, characterFocus: 1, ideaDensity: 0.52 },  output: { genre: ["fantasy","identity","family","mystery"], vibes: ["spooky"] }, },
  { isDefault: true, title: "A Monster Calls", semantic: { contentTraits: ["grief","family","monsters"], toneTraits: ["emotional","dark","tender"], characterTraits: ["wounded_protagonist"], storyTraits: ["grief_journey","truth_telling","healing_arc"], aversionTraits: ["sad_theme"] }, author: "Patrick Ness", genre: "Fantasy / Drama", wikiTitle: "A Monster Calls", tags: ["audience:teen","age:mshs","media:book","fantasy","drama","family","emotional growth","dark"],tasteTraits: { warmth: 1, darkness: 1, pacing: 0.0, realism: -0.93, characterFocus: 1, ideaDensity: 0.0 },  output: { genre: ["fantasy","drama","family"], vibes: ["emotional growth","dark"] }, },
  { isDefault: true, title: "Chaos Walking: The Knife of Never Letting Go", semantic: { contentTraits: ["survival","secrets","political_control"], toneTraits: ["tense","dark","fast"], characterTraits: ["outsider_teens"], storyTraits: ["escape_and_pursuit","truth_discovery","survival_story"], aversionTraits: ["violence","bleak_tone"] }, author: "Patrick Ness", genre: "Science Fiction / Survival", wikiTitle: "The Knife of Never Letting Go", tags: ["audience:teen","age:mshs","media:book","science fiction","survival","political","fast-paced","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 1, realism: -0.73, characterFocus: 0.0, ideaDensity: 0.86 },  output: { genre: ["science fiction","survival","political"], vibes: ["fast-paced","dark"] }, },
  { isDefault: true, title: "They Both Die at the End", semantic: { contentTraits: ["mortality","friendship","human_connection"], toneTraits: ["emotional","tender","bittersweet"], characterTraits: ["thoughtful_teens"], storyTraits: ["single_day_journey","relationship_building","reckoning_with_time"], aversionTraits: ["sad_theme"] }, author: "Adam Silvera", genre: "Drama / Contemporary", wikiTitle: "They Both Die at the End", tags: ["audience:teen","age:mshs","media:book","drama","friendship","human connection","romance","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: -0.07, realism: 0.39, characterFocus: 1, ideaDensity: 0.0 },  output: { genre: ["drama","friendship","romance"], vibes: ["human connection","emotional growth"] }, },
  { isDefault: true, title: "Aristotle and Dante Discover the Secrets of the Universe", semantic: { contentTraits: ["friendship","identity","family"], toneTraits: ["warm","tender","reflective"], characterTraits: ["thoughtful_teens"], storyTraits: ["relationship_building","self_acceptance","coming_of_age"], aversionTraits: ["quiet_pacing"] }, author: "Benjamin Alire Sáenz", genre: "Contemporary / Coming-of-Age", wikiTitle: "Aristotle and Dante Discover the Secrets of the Universe", tags: ["audience:teen","age:mshs","media:book","identity","friendship","family","coming of age","warm","human connection"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -0.18, realism: 0.25, characterFocus: 1, ideaDensity: 0.41 },  output: { genre: ["identity","friendship","family"], vibes: ["coming of age","warm","human connection"] }, },
  { isDefault: true, title: "Simon vs. the Homo Sapiens Agenda", semantic: { contentTraits: ["romance","identity","friendship"], toneTraits: ["warm","funny","hopeful"], characterTraits: ["closeted_protagonist"], storyTraits: ["identity_discovery","relationship_building","coming_of_age"], aversionTraits: ["predictable_beats"] }, author: "Becky Albertalli", genre: "Romance / Coming-of-Age", wikiTitle: "Simon vs. the Homo Sapiens Agenda", tags: ["audience:teen","age:mshs","media:book","romance","identity","friendship","coming of age","warm","hopeful"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: 0.0, realism: 0.0, characterFocus: 1, ideaDensity: 0.61 },  output: { genre: ["romance","identity","friendship"], vibes: ["coming of age","warm","hopeful"] }, },
  { isDefault: true, title: "Cemetery Boys", semantic: { contentTraits: ["ghost_stories","identity","family"], toneTraits: ["warm","spooky","funny"], characterTraits: ["determined_outsider"], storyTraits: ["mystery_unfolding","self_acceptance","relationship_building"], aversionTraits: ["low_plot"] }, author: "Aiden Thomas", genre: "Paranormal / Romance", wikiTitle: "Cemetery Boys", tags: ["audience:teen","age:mshs","media:book","fantasy","romance","identity","family","spooky","warm"],tasteTraits: { warmth: 1, darkness: 1, pacing: 0.07, realism: -1, characterFocus: 1, ideaDensity: 0.52 },  output: { genre: ["fantasy","romance","identity","family"], vibes: ["spooky","warm"] }, },
  { isDefault: true, title: "Heartstopper: Volume 1", semantic: { contentTraits: ["romance","friendship","identity"], toneTraits: ["warm","gentle","hopeful"], characterTraits: ["kindhearted_teens"], storyTraits: ["relationship_building","self_acceptance","coming_of_age"], aversionTraits: ["low_conflict"] }, author: "Alice Oseman", genre: "Graphic Novel / Romance", wikiTitle: "Heartstopper", tags: ["audience:teen","age:mshs","media:book","format:graphic_novel","publisher:first second books","facet:ya_library","graphic novel","romance","identity","friendship","coming of age","warm","gentle","hopeful"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -0.41, realism: -0.18, characterFocus: 1, ideaDensity: 0.41 },  output: { genre: ["graphic novel","romance","identity","friendship"], vibes: ["coming of age","warm","gentle","hopeful"] }, },
  { isDefault: true, title: "Nimona", semantic: { contentTraits: ["friendship","monsters","identity"], toneTraits: ["funny","playful","heartfelt"], characterTraits: ["lovable_misfits"], storyTraits: ["team_up","identity_conflict","redemption_arc"], aversionTraits: ["goofy_tone"] }, author: "ND Stevenson", genre: "Graphic Novel / Fantasy", wikiTitle: "Nimona", tags: ["audience:teen","age:mshs","media:book","format:graphic_novel","publisher:oni press","facet:ya_library","facet:humor","graphic novel","fantasy","friendship","identity","comedy","playful"],tasteTraits: { warmth: 1, darkness: 0.34, pacing: 0.18, realism: -1, characterFocus: 1, ideaDensity: 0.61 },  output: { genre: ["graphic novel","fantasy","friendship","identity","comedy"], vibes: ["playful"] }, },
  { isDefault: true, title: "Lore Olympus: Volume One", semantic: { contentTraits: ["mythology","romance","identity"], toneTraits: ["stylish","warm","dramatic"], characterTraits: ["complicated_lovers"], storyTraits: ["relationship_building","self_acceptance","myth_reframing"], aversionTraits: ["romance_dominance"] }, author: "Rachel Smythe", genre: "Graphic Novel / Romance", wikiTitle: "Lore Olympus", tags: ["audience:teen","age:mshs","media:book","graphic novel","romance","mythology","identity","atmospheric"],tasteTraits: { warmth: 1, darkness: 0.2, pacing: -0.05, realism: -1, characterFocus: 1, ideaDensity: 0.43 },  output: { genre: ["graphic novel","romance","mythology","identity"], vibes: ["atmospheric"] }, },
];

const CANON_MSHS_TV: any[] = [
  { isDefault: true, title: "Stranger Things", semantic: { contentTraits: ["small_town_mystery","alternate_dimension","friendship"], toneTraits: ["spooky","adventurous","nostalgic"], characterTraits: ["loyal_friend_group","outsider_kids"], storyTraits: ["group_quest","mystery_escalation"], aversionTraits: ["fear_intensity","monster_threat"] }, author: "Netflix", genre: "Sci‑Fi / Mystery", wikiTitle: "Stranger Things", tags: ["audience:teen","age:mshs","media:tv","format:series","series","science fiction","mystery","friendship","spooky"],tasteTraits: { warmth: 1, darkness: 0.95, pacing: 0.45, realism: -0.77, characterFocus: 1, ideaDensity: 0.61 }, 
 output: {
   genre: ["science fiction", "mystery", "friendship"],
   vibes: ["spooky"],
 }, },
  { isDefault: true, title: "The Umbrella Academy", semantic: { contentTraits: ["superpowered_family","time_travel","apocalypse"], toneTraits: ["dark","chaotic","quirky"], characterTraits: ["dysfunctional_family","gifted_outcasts"], storyTraits: ["prevent_apocalypse","family_conflict"], aversionTraits: ["overstimulating"] }, author: "Netflix", genre: "Superhero / Fantasy", wikiTitle: "The Umbrella Academy (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","superheroes","fantasy","time travel","dark","quirky"],tasteTraits: { warmth: 0.75, darkness: 1, pacing: -0.02, realism: -1, characterFocus: 1, ideaDensity: 0.45 }, 
 output: {
   genre: ["superheroes", "fantasy", "time travel"],
   vibes: ["dark", "quirky"],
 }, },
  { isDefault: true, title: "Avatar: The Last Airbender", semantic: { contentTraits: ["elemental_magic","war","friendship"], toneTraits: ["hopeful","adventurous","funny"], characterTraits: ["chosen_one","mentor_guided_growth","leader_with_companions"], storyTraits: ["quest_structure","coming_of_age"], aversionTraits: ["high_tension"] }, author: "Nickelodeon", genre: "Fantasy / Adventure", wikiTitle: "Avatar: The Last Airbender", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","adventure","war & society","friendship","hopeful","comedy"],tasteTraits: { warmth: 1, darkness: 0.61, pacing: 0.59, realism: -1, characterFocus: 1, ideaDensity: 0.25 }, 
 output: {
   genre: ["fantasy", "adventure", "war & society", "friendship", "comedy"],
   vibes: ["hopeful"],
 }, },
  { isDefault: true, title: "The Legend of Korra", semantic: { contentTraits: ["elemental_magic","political_unrest","identity"], toneTraits: ["serious","adventurous"], characterTraits: ["headstrong_hero","mentor_figures"], storyTraits: ["rise_to_mastery","ideological_conflict"], aversionTraits: ["heavier_tone"] }, author: "Nickelodeon", genre: "Fantasy / Adventure", wikiTitle: "The Legend of Korra", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","adventure","identity","drama"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.59, realism: -1, characterFocus: 1, ideaDensity: 0.68 }, 
 output: {
   genre: ["fantasy", "adventure", "identity", "drama"],
   vibes: [],
 }, },
  { isDefault: true, title: "Wednesday", semantic: { contentTraits: ["school_mystery","outsider_identity","mystery"], toneTraits: ["deadpan","gothic","quirky"], characterTraits: ["emotionally_detached_protagonist","outsider_protagonist"], storyTraits: ["investigation","mystery_unfolding"], aversionTraits: ["deadpan_tone"] }, author: "Netflix", genre: "Mystery / Gothic", wikiTitle: "Wednesday (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","mystery","identity","dark","outsider","quirky"],tasteTraits: { warmth: 0.0, darkness: 0.82, pacing: 0.32, realism: 0.2, characterFocus: 1, ideaDensity: 0.98 }, 
 output: {
   genre: ["mystery", "identity", "outsider"],
   vibes: ["dark", "quirky"],
 }, },
  { isDefault: true, title: "The Mandalorian", semantic: { contentTraits: ["child_protection","space_politics"], toneTraits: ["serious","adventurous"], characterTraits: ["reluctant_guardian"], storyTraits: ["quest_structure","bond_building"], aversionTraits: ["slow_pacing"] }, author: "Disney+", genre: "Sci‑Fi / Adventure", wikiTitle: "The Mandalorian", tags: ["audience:teen","age:mshs","media:tv","format:series","series","science fiction","adventure","drama"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.59, realism: -0.3, characterFocus: 0.18, ideaDensity: 0.16 }, 
 output: {
   genre: ["science fiction", "adventure", "drama"],
   vibes: [],
 }, },
  { isDefault: true, title: "Arcane", semantic: { contentTraits: ["class_conflict","sister_relationship","political_intrigue"], toneTraits: ["dark","intense","tragic"], characterTraits: ["morally_complicated_characters"], storyTraits: ["parallel_arcs","tripwire_escalation"], aversionTraits: ["emotional_heaviness","violence"] }, author: "Netflix", genre: "Fantasy / Action", wikiTitle: "Arcane (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","fast-paced","political","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 1, realism: -0.73, characterFocus: 0.02, ideaDensity: 0.55 }, 
 output: {
   genre: ["fantasy", "political"],
   vibes: ["fast-paced", "dark"],
 }, },
  { isDefault: true, title: "Doctor Who", semantic: { contentTraits: ["time_travel","alien_encounters","ethics"], toneTraits: ["whimsical","adventurous"], characterTraits: ["eccentric_genius","companion_dynamic"], storyTraits: ["case_of_the_week","problem_solving"], aversionTraits: ["dated_effects"] }, author: "BBC", genre: "Sci‑Fi / Adventure", wikiTitle: "Doctor Who", tags: ["audience:teen","age:mshs","media:tv","format:series","series","science fiction","adventure","time travel","whimsical"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.59, realism: -0.95, characterFocus: 0.02, ideaDensity: 0.93 }, 
 output: {
   genre: ["science fiction", "adventure", "time travel"],
   vibes: ["whimsical"],
 }, },
  { isDefault: true, title: "The Walking Dead", semantic: { contentTraits: ["zombie_apocalypse","survival","resource_scarcity"], toneTraits: ["bleak","tense"], characterTraits: ["battle_hardened_survivors"], storyTraits: ["survival_arc","group_dynamics"], aversionTraits: ["graphic_violence","hopelessness"] }, author: "AMC", genre: "Horror / Survival", wikiTitle: "The Walking Dead (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","horror","survival"],tasteTraits: { warmth: -0.16, darkness: 1, pacing: 0.91, realism: 0.0, characterFocus: 0.02, ideaDensity: 0.0 }, 
 output: {
   genre: ["horror", "survival"],
   vibes: [],
 }, },
  { isDefault: true, title: "The 100", semantic: { contentTraits: ["post_apocalypse","teen_leadership","ethics"], toneTraits: ["intense","grim"], characterTraits: ["young_leaders","morally_conflicted"], storyTraits: ["survival_decisions","power_struggle"], aversionTraits: ["moral_ambiguity","bleak_tone"] }, author: "The CW", genre: "Sci‑Fi / Dystopia", wikiTitle: "The 100 (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","science fiction","dystopian"],tasteTraits: { warmth: 0.0, darkness: 0.64, pacing: 0.64, realism: -0.36, characterFocus: 0.02, ideaDensity: 0.48 }, 
 output: {
   genre: ["science fiction", "dystopian"],
   vibes: [],
 }, },
  { isDefault: true, title: "Shadow and Bone", semantic: { contentTraits: ["magic_system","war","chosen_one"], toneTraits: ["dramatic","adventurous"], characterTraits: ["outsider_protagonist","mentor_figures"], storyTraits: ["training_arc","destiny_conflict"], aversionTraits: ["predictable_tropes"] }, author: "Netflix", genre: "Fantasy", wikiTitle: "Shadow and Bone (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","war & society"],tasteTraits: { warmth: 0.0, darkness: 0.61, pacing: 0.18, realism: -1, characterFocus: 0.18, ideaDensity: 0.5 }, 
 output: {
   genre: ["fantasy", "war & society"],
   vibes: [],
 }, },
  { isDefault: true, title: "The Witcher", semantic: { contentTraits: ["monster_hunting","magic","political_intrigue"], toneTraits: ["dark"], characterTraits: ["outsider_hero","morally_conflicted"], storyTraits: ["case_based","season_arc"], aversionTraits: ["confusing_timeline","violence"] }, author: "Netflix", genre: "Fantasy", wikiTitle: "The Witcher (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","political","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: -0.02, realism: -1, characterFocus: 0.02, ideaDensity: 0.55 }, 
 output: {
   genre: ["fantasy", "political"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "Heartstopper", semantic: { contentTraits: ["teen_romance","identity_exploration","friendship"], toneTraits: ["warm","gentle","hopeful"], characterTraits: ["kindhearted_teens"], storyTraits: ["relationship_building","self_acceptance"], aversionTraits: ["low_conflict"] }, author: "Netflix", genre: "Romance / Coming‑of‑Age", wikiTitle: "Heartstopper (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","romance","coming of age","identity","friendship","warm","gentle","hopeful"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -0.43, realism: 0.0, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["romance", "identity", "friendship"],
   vibes: ["coming of age", "warm", "gentle", "hopeful"],
 }, },
  { isDefault: true, title: "Cobra Kai", semantic: { contentTraits: ["martial_arts","competition","mentorship"], toneTraits: ["fun","dramatic"], characterTraits: ["ragtag_team","flawed_mentors"], storyTraits: ["competition_arc","redemption_arc"], aversionTraits: ["repetition"] }, author: "Netflix", genre: "Action / Comedy", wikiTitle: "Cobra Kai", tags: ["audience:teen","age:mshs","media:tv","format:series","series","comedy","fast-paced","playful"],tasteTraits: { warmth: 0.52, darkness: 0.0, pacing: 0.93, realism: 0.07, characterFocus: 0.18, ideaDensity: 0.0 }, 
 output: {
   genre: ["comedy"],
   vibes: ["fast-paced", "playful"],
 }, },
  { isDefault: true, title: "Sherlock", semantic: { contentTraits: ["crime_solving"], toneTraits: ["clever","fast"], characterTraits: ["brilliant_but_detached","loyal_partner"], storyTraits: ["case_of_the_week","twist_reveals"], aversionTraits: ["complex_plotting"] }, author: "BBC", genre: "Mystery / Crime", wikiTitle: "Sherlock (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","mystery","crime","fast-paced"],tasteTraits: { warmth: 0.0, darkness: 0.48, pacing: 1, realism: 0.0, characterFocus: 0.02, ideaDensity: 0.5 }, 
 output: {
   genre: ["mystery", "crime"],
   vibes: ["fast-paced"],
 }, },
  { isDefault: true, title: "The Queen's Gambit", semantic: { contentTraits: ["chess_competition","addiction","coming_of_age"], toneTraits: ["focused","reflective"], characterTraits: ["gifted_protagonist"], storyTraits: ["rise_to_mastery","inner_struggle_externalized"], aversionTraits: ["slow_pacing"] }, author: "Netflix", genre: "Drama / Competition", wikiTitle: "The Queen's Gambit (miniseries)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","drama","coming of age"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: -0.14, realism: 0.14, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["drama"],
   vibes: ["coming of age"],
 }, },
  { isDefault: true, title: "Lockwood & Co.", semantic: { contentTraits: ["ghost_hunting","teen_group","mystery"], toneTraits: ["spooky","adventurous"], characterTraits: ["found_family_team"], storyTraits: ["case_based","team_growth"], aversionTraits: ["unease"] }, author: "Netflix", genre: "Paranormal / Mystery", wikiTitle: "Lockwood & Co.", tags: ["audience:teen","age:mshs","media:tv","format:series","series","mystery","spooky"],tasteTraits: { warmth: 0.25, darkness: 0.95, pacing: 0.39, realism: -0.75, characterFocus: 0.73, ideaDensity: 0.34 }, 
 output: {
   genre: ["mystery"],
   vibes: ["spooky"],
 }, },
  { isDefault: true, title: "A Series of Unfortunate Events", semantic: { contentTraits: ["orphan_siblings","mystery"], toneTraits: ["darkly_comedic","quirky"], characterTraits: ["resourceful_protagonist","persistent_villain"], storyTraits: ["repeated_escape_and_growth","patterned_conflict"], aversionTraits: ["repetition"] }, author: "Netflix", genre: "Adventure / Mystery", wikiTitle: "A Series of Unfortunate Events (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","mystery","adventure","quirky"],tasteTraits: { warmth: 0.0, darkness: 0.82, pacing: 0.59, realism: -0.27, characterFocus: 0.02, ideaDensity: 0.59 }, 
 output: {
   genre: ["mystery", "adventure"],
   vibes: ["quirky"],
 }, },
  { isDefault: true, title: "The Dragon Prince", semantic: { contentTraits: ["magic","war","friendship"], toneTraits: ["hopeful","adventurous"], characterTraits: ["young_heroes","unlikely_allies"], storyTraits: ["quest_journey","peace_vs_conflict"], aversionTraits: ["slow_burn_build"] }, author: "Netflix", genre: "Fantasy / Adventure", wikiTitle: "The Dragon Prince", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","adventure","war & society","friendship","hopeful"],tasteTraits: { warmth: 1, darkness: 0.61, pacing: 0.59, realism: -1, characterFocus: 1, ideaDensity: 0.25 }, 
 output: {
   genre: ["fantasy", "adventure", "war & society", "friendship"],
   vibes: ["hopeful"],
 }, },
  { isDefault: true, title: "His Dark Materials", semantic: { contentTraits: ["parallel_worlds","religion","rebellion"], toneTraits: ["serious","mysterious"], characterTraits: ["curious_explorer"], storyTraits: ["exploration_arc","truth_discovery"], aversionTraits: ["complex_themes"] }, author: "BBC / HBO", genre: "Fantasy / Adventure", wikiTitle: "His Dark Materials (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","adventure","drama","mystery"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.45, realism: -0.66, characterFocus: 0.18, ideaDensity: 0.36 }, 
 output: {
   genre: ["fantasy", "adventure", "drama", "mystery"],
   vibes: [],
 }, },
  { isDefault: true, title: "The Society", semantic: { contentTraits: ["community","isolation","power"], toneTraits: ["tense","dramatic"], characterTraits: ["emerging_leaders"], storyTraits: ["society_building","tripwire_escalation"], aversionTraits: ["unfinished_story"] }, author: "Netflix", genre: "Mystery / Survival", wikiTitle: "The Society (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","mystery","survival","community"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.68, realism: 0.25, characterFocus: 0.73, ideaDensity: 0.23 }, 
 output: {
   genre: ["mystery", "survival", "community"],
   vibes: [],
 }, },
  { isDefault: true, title: "Never Have I Ever", semantic: { contentTraits: ["teen_life","family","identity"], toneTraits: ["funny","quirky","heartfelt"], characterTraits: ["flawed_but_relatable"], storyTraits: ["coming_of_age","relationship_complexity"], aversionTraits: ["cringe_moments"] }, author: "Netflix", genre: "Comedy / Coming-of-Age", wikiTitle: "Never Have I Ever", tags: ["audience:teen","age:mshs","media:tv","format:series","series","comedy","coming of age","family","identity","quirky"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: -0.02, realism: 0.0, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["comedy", "family", "identity"],
   vibes: ["coming of age", "quirky"],
 }, },
  { isDefault: true, title: "Sweet Tooth", semantic: { contentTraits: ["post_apocalypse","hybrid_child","adventure"], toneTraits: ["hopeful","melancholic"], characterTraits: ["innocent_child","protective_guardian"], storyTraits: ["travel_arc","team_building"], aversionTraits: ["sad_tone"] }, author: "Netflix", genre: "Fantasy / Survival", wikiTitle: "Sweet Tooth (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","survival","adventure","hopeful","melancholic"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: 0.75, realism: -0.73, characterFocus: 0.02, ideaDensity: 0.0 }, 
 output: {
   genre: ["fantasy", "survival", "adventure"],
   vibes: ["hopeful", "melancholic"],
 }, },
  { isDefault: true, title: "The Sandman", semantic: { contentTraits: ["dream_world","mythology","immortals"], toneTraits: ["dark","poetic"], characterTraits: ["enigmatic_protagonist"], storyTraits: [], aversionTraits: ["abstract_storytelling"] }, author: "Netflix", genre: "Fantasy / Mythology", wikiTitle: "The Sandman (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","mythology","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: -0.02, realism: -1, characterFocus: 0.02, ideaDensity: 0.0 }, 
 output: {
   genre: ["fantasy", "mythology"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "Bridgerton", semantic: { contentTraits: ["romance","community","scandal"], toneTraits: ["dramatic","lush"], characterTraits: ["romantic_leads"], storyTraits: ["relationship_arc","court_intrigue"], aversionTraits: ["slow_pacing"] }, author: "Netflix", genre: "Romance / Historical", wikiTitle: "Bridgerton", tags: ["audience:teen","age:mshs","media:tv","format:series","series","romance","historical","community"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: -0.02, realism: 1, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["romance", "historical", "community"],
   vibes: [],
 }, },
  { isDefault: true, title: "Friday Night Lights", semantic: { contentTraits: ["high_school_sports","community","competition"], toneTraits: ["grounded","emotional"], characterTraits: ["team_players","mentor_figures"], storyTraits: ["seasonal_competition","personal_growth"], aversionTraits: ["sports_focus"] }, author: "NBC", genre: "Sports / Drama", wikiTitle: "Friday Night Lights (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","drama","coming of age","energetic","school","community","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.68, realism: 1, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["drama", "school", "community"],
   vibes: ["coming of age", "energetic", "emotional growth"],
 }, },
  { isDefault: true, title: "Ted Lasso", semantic: { contentTraits: ["sports_team","human_connection","power"], toneTraits: ["warm","uplifting","funny"], characterTraits: ["optimistic_leader"], storyTraits: ["team_building","personal_growth"], aversionTraits: ["sentimentality"] }, author: "Apple TV+", genre: "Sports / Comedy", wikiTitle: "Ted Lasso", tags: ["audience:teen","age:mshs","media:tv","format:series","series","comedy","energetic","community","human connection","warm"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: 0.68, realism: 0.32, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["comedy", "community"],
   vibes: ["energetic", "human connection", "warm"],
 }, },
  { isDefault: true, title: "Peaky Blinders", semantic: { contentTraits: ["crime_family","postwar","power"], toneTraits: ["dark","intense"], characterTraits: ["ruthless_leader"], storyTraits: ["power_rise","strategic_conflict"], aversionTraits: ["violence"] }, author: "BBC", genre: "Historical / Crime", wikiTitle: "Peaky Blinders (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","historical","crime","dark"],tasteTraits: { warmth: 0.25, darkness: 1, pacing: 0.45, realism: 1, characterFocus: 0.73, ideaDensity: 0.27 }, 
 output: {
   genre: ["historical", "crime"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "Buffy the Vampire Slayer", semantic: { contentTraits: ["monster_hunting","teen_life","destiny"], toneTraits: ["witty","dark","adventurous"], characterTraits: ["chosen_one","found_family_team"], storyTraits: ["monster_of_the_week","season_arc"], aversionTraits: ["dated_effects"] }, author: "The WB / UPN", genre: "Paranormal / Horror", wikiTitle: "Buffy the Vampire Slayer", tags: ["audience:teen","age:mshs","media:tv","format:series","series","horror","coming of age","spooky","dark"],tasteTraits: { warmth: 0.25, darkness: 1, pacing: 0.18, realism: -0.55, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["horror"],
   vibes: ["coming of age", "spooky", "dark"],
 }, },
  { isDefault: true, title: "Supernatural", semantic: { contentTraits: ["monster_hunting","family","road_trip"], toneTraits: ["dark","funny"], characterTraits: ["loyal_siblings"], storyTraits: ["case_of_the_week","mythology_arc"], aversionTraits: ["long_runtime"] }, author: "The WB / The CW", genre: "Paranormal / Horror", wikiTitle: "Supernatural (American TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","horror","spooky","family","vehicles","dark","comedy"],tasteTraits: { warmth: 0.82, darkness: 1, pacing: -0.02, realism: -1, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["horror", "family", "vehicles", "comedy"],
   vibes: ["spooky", "dark"],
 }, },
  { isDefault: true, title: "Percy Jackson and the Olympians", semantic: { contentTraits: ["greek_mythology","demigods","adventure"], toneTraits: ["adventurous","funny"], characterTraits: ["reluctant_hero","loyal_friends"], storyTraits: ["training_and_quest","destiny_arc"], aversionTraits: ["predictable_beats"] }, author: "Disney+", genre: "Fantasy / Adventure", wikiTitle: "Percy Jackson and the Olympians (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","adventure","mythology","identity","comedy"],tasteTraits: { warmth: 0.32, darkness: 0.0, pacing: 0.8, realism: -1, characterFocus: 0.55, ideaDensity: 0.45 }, 
 output: {
   genre: ["fantasy", "adventure", "mythology", "identity", "comedy"],
   vibes: [],
 }, },
  { isDefault: true, title: "Veronica Mars", semantic: { contentTraits: ["teen_detective","crime","social_divide"], toneTraits: ["sharp","moody"], characterTraits: ["sarcastic_protagonist"], storyTraits: ["case_solving","season_mystery"], aversionTraits: ["heavy_themes"] }, author: "UPN / The CW", genre: "Mystery / Drama", wikiTitle: "Veronica Mars", tags: ["audience:teen","age:mshs","media:tv","format:series","series","mystery","drama","identity","crime"],tasteTraits: { warmth: 0.0, darkness: 0.32, pacing: 0.18, realism: 0.14, characterFocus: 0.86, ideaDensity: 0.73 }, 
 output: {
   genre: ["mystery", "drama", "identity", "crime"],
   vibes: [],
 }, },
  { isDefault: true, title: "Anne with an E", semantic: { contentTraits: ["orphan_life","community","identity"], toneTraits: ["warm","emotional"], characterTraits: ["imaginative_protagonist"], storyTraits: ["coming_of_age","outsider_resilience"], aversionTraits: ["slower_pacing"] }, author: "CBC / Netflix", genre: "Historical / Coming-of-Age", wikiTitle: "Anne with an E", tags: ["audience:teen","age:mshs","media:tv","format:series","series","historical","drama","coming of age","identity","friendship","community","warm","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -0.02, realism: 1, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["historical", "drama", "identity", "friendship", "community"],
   vibes: ["coming of age", "warm", "emotional growth"],
 }, },
  { isDefault: true, title: "One Piece", semantic: { contentTraits: ["pirate_adventure","treasure_hunt","friendship"], toneTraits: ["fun","adventurous"], characterTraits: ["optimistic_leader","loyal_crew"], storyTraits: ["island_quests","team_building"], aversionTraits: ["campy_style"] }, author: "Netflix", genre: "Adventure / Fantasy", wikiTitle: "One Piece (2023 TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","adventure","fantasy","treasure","friendship","playful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.89, realism: -0.73, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["adventure", "fantasy", "treasure", "friendship"],
   vibes: ["playful"],
 }, },
  { isDefault: true, title: "Outer Banks", semantic: { contentTraits: ["treasure_hunt","class_conflict","teen_group"], toneTraits: ["dramatic","adventurous"], characterTraits: ["loyal_friend_group"], storyTraits: ["mystery_quest","tripwire_escalation"], aversionTraits: ["melodrama"] }, author: "Netflix", genre: "Adventure / Mystery", wikiTitle: "Outer Banks (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","adventure","mystery","treasure"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.8, realism: 0.07, characterFocus: 0.18, ideaDensity: 0.34 }, 
 output: {
   genre: ["adventure", "mystery", "treasure"],
   vibes: [],
 }, },
  { isDefault: true, title: "The Owl House", semantic: { contentTraits: ["magic_school","found_family","identity"], toneTraits: ["funny","heartfelt"], characterTraits: ["curious_outsider"], storyTraits: ["training_arc","friendship_growth"], aversionTraits: ["younger_skew"] }, author: "Disney Channel", genre: "Fantasy / Coming-of-Age", wikiTitle: "The Owl House", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","adventure","identity","coming of age","family","comedy"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.18, realism: -1, characterFocus: 1, ideaDensity: 0.66 }, 
 output: {
   genre: ["fantasy", "adventure", "identity", "family", "comedy"],
   vibes: ["coming of age"],
 }, },
  { isDefault: true, title: "Young Royals", semantic: { contentTraits: ["royalty","romance","identity"], toneTraits: ["intimate","dramatic"], characterTraits: ["conflicted_protagonist"], storyTraits: ["relationship_conflict","self_acceptance"], aversionTraits: ["slow_burn"] }, author: "Netflix", genre: "Romance / Drama", wikiTitle: "Young Royals", tags: ["audience:teen","age:mshs","media:tv","format:series","series","romance","drama","coming of age","identity"],tasteTraits: { warmth: 0.61, darkness: 0.0, pacing: -0.02, realism: 0.2, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["romance", "drama", "identity"],
   vibes: ["coming of age"],
 }, },
  { isDefault: true, title: "Merlin", semantic: { contentTraits: ["magic","royalty","friendship"], toneTraits: ["adventurous","light"], characterTraits: ["secret_power_holder"], storyTraits: ["monster_of_the_week","destiny_arc"], aversionTraits: ["dated_effects"] }, author: "BBC", genre: "Fantasy / Adventure", wikiTitle: "Merlin (2008 TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","adventure","friendship"],tasteTraits: { warmth: 1, darkness: 0.16, pacing: 0.59, realism: -1, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["fantasy", "adventure", "friendship"],
   vibes: [],
 }, },
  { isDefault: true, title: "The Summer I Turned Pretty", semantic: { contentTraits: ["summer_romance","friendship","family"], toneTraits: ["warm","nostalgic"], characterTraits: ["questioning_protagonist"], storyTraits: ["relationship_conflict","personal_growth"], aversionTraits: ["romance_dominance"] }, author: "Prime Video", genre: "Romance / Coming-of-Age", wikiTitle: "The Summer I Turned Pretty (TV series)", tags: ["audience:teen","age:mshs","media:tv","format:series","series","romance","coming of age","friendship","family","warm"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -0.02, realism: 0.0, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["romance", "friendship", "family"],
   vibes: ["coming of age", "warm"],
 }, },
  { isDefault: true, title: "The Good Place", semantic: { contentTraits: ["afterlife","ethics","friendship"], toneTraits: ["funny","philosophical"], characterTraits: ["morally_flawed_characters"], storyTraits: ["moral_growth","twist_reveals"], aversionTraits: ["concept_heavy"] }, author: "NBC", genre: "Fantasy / Comedy", wikiTitle: "The Good Place", tags: ["audience:teen","age:mshs","media:tv","format:series","series","fantasy","comedy","identity","friendship"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: -0.02, realism: -1, characterFocus: 1, ideaDensity: 0.52 }, 
 output: {
   genre: ["fantasy", "comedy", "identity", "friendship"],
   vibes: [],
 }, },
  { isDefault: true, title: "Smallville", semantic: { contentTraits: ["secret_identity","small_town"], toneTraits: ["dramatic","hopeful"], characterTraits: ["eager_hero"], storyTraits: ["power_awakening","patterned_conflict"], aversionTraits: ["predictable_beats"] }, author: "The WB / The CW", genre: "Superhero / Coming-of-Age", wikiTitle: "Smallville", tags: ["audience:teen","age:mshs","media:tv","format:series","series","superheroes","drama","identity","coming of age","hopeful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: -0.02, realism: -0.2, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["superheroes", "drama", "identity"],
   vibes: ["coming of age", "hopeful"],
 }, },
  { isDefault: true, title: "School Spirits", semantic: { contentTraits: ["afterlife","high_school","mystery"], toneTraits: ["moody","mysterious"], characterTraits: ["confused_protagonist"], storyTraits: ["identity_discovery","mystery_unfolding"], aversionTraits: ["slow_burn"] }, author: "Paramount+", genre: "Paranormal / Mystery", wikiTitle: "School Spirits", tags: ["audience:teen","age:mshs","media:tv","format:series","series","mystery","identity","spooky","school"],tasteTraits: { warmth: 0.0, darkness: 0.48, pacing: 0.25, realism: -0.5, characterFocus: 1, ideaDensity: 0.86 }, 
 output: {
   genre: ["mystery", "identity", "school"],
   vibes: ["spooky"],
 }, },
  { isDefault: true, title: "The Midnight Club", semantic: { contentTraits: ["terminal_illness","ghost_stories","friendship"], toneTraits: ["dark","emotional"], characterTraits: ["vulnerable_teens"], storyTraits: ["storytelling_frame","personal_awakening"], aversionTraits: ["heavy_themes"] }, author: "Netflix", genre: "Horror / Drama", wikiTitle: "The Midnight Club", tags: ["audience:teen","age:mshs","media:tv","format:series","series","horror","drama","friendship","dark","emotional growth"],tasteTraits: { warmth: 1, darkness: 1, pacing: -0.02, realism: 0.14, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["horror", "drama", "friendship"],
   vibes: ["dark", "emotional growth"],
 }, },
];

const CANON_MSHS_MOVIES: any[] = [
  { isDefault: true, title: "The Hunger Games", semantic: { contentTraits: ["dystopian_society","survival_game","rebellion"], toneTraits: ["intense","dark"], characterTraits: ["reluctant_leader"], storyTraits: ["competition_arc","resistance_story"], aversionTraits: ["violence"] }, author: "Lionsgate", genre: "Dystopia / Action", wikiTitle: "The Hunger Games (film)", tags: ["audience:teen","age:mshs","media:movie","dystopian","film","fast-paced","survival","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 1, realism: 0.0, characterFocus: 0.0, ideaDensity: 0.0 }, 
 output: {
   genre: ["dystopian", "survival"],
   vibes: ["fast-paced", "dark"],
 }, },
  { isDefault: true, title: "Catching Fire", semantic: { contentTraits: ["rebellion","political_control","arena"], toneTraits: ["tense"], characterTraits: ["reluctant_leader"], storyTraits: ["return_to_arena","revolt_building"], aversionTraits: ["bleak_tone"] }, author: "Lionsgate", genre: "Dystopia / Action", wikiTitle: "The Hunger Games: Catching Fire", tags: ["audience:teen","age:mshs","media:movie","dystopian","film","fast-paced","political"],tasteTraits: { warmth: 0.0, darkness: 0.25, pacing: 1, realism: 0.0, characterFocus: 0.0, ideaDensity: 0.55 }, 
 output: {
   genre: ["dystopian", "political"],
   vibes: ["fast-paced"],
 }, },
  { isDefault: true, title: "The Maze Runner", semantic: { contentTraits: ["memory_loss","maze","survival"], toneTraits: ["mysterious","tense"], characterTraits: ["curious_leader"], storyTraits: ["escape_mystery","group_dynamics"], aversionTraits: ["complexity"] }, author: "20th Century", genre: "Dystopia / Sci‑Fi", wikiTitle: "The Maze Runner (film)", tags: ["audience:teen","age:mshs","media:movie","dystopian","science fiction","film","survival","mystery"],tasteTraits: { warmth: 0.0, darkness: 0.25, pacing: 0.73, realism: -0.36, characterFocus: 0.0, ideaDensity: 0.5 }, 
 output: {
   genre: ["dystopian", "science fiction", "survival", "mystery"],
   vibes: [],
 }, },
  { isDefault: true, title: "Divergent", semantic: { contentTraits: ["faction_society","identity","rebellion"], toneTraits: ["serious","dramatic"], characterTraits: ["independent_protagonist"], storyTraits: ["training_arc","rebellion_against_society"], aversionTraits: ["predictable"] }, author: "Lionsgate", genre: "Dystopia / Action", wikiTitle: "Divergent (film)", tags: ["audience:teen","age:mshs","media:movie","dystopian","film","fast-paced","identity","drama"],tasteTraits: { warmth: 0.0, darkness: 0.25, pacing: 0.89, realism: -0.41, characterFocus: 1, ideaDensity: 0.91 }, 
 output: {
   genre: ["dystopian", "identity", "drama"],
   vibes: ["fast-paced"],
 }, },
  { isDefault: true, title: "Ready Player One", semantic: { contentTraits: ["virtual_world","competition","pop_culture"], toneTraits: ["fast","fun"], characterTraits: ["underdog_player"], storyTraits: ["quest_competition","puzzle_solving"], aversionTraits: ["reference_heavy"] }, author: "Warner Bros.", genre: "Sci‑Fi / Adventure", wikiTitle: "Ready Player One (film)", tags: ["audience:teen","age:mshs","media:movie","science fiction","adventure","film","fast-paced","playful"],tasteTraits: { warmth: 0.2, darkness: 0.0, pacing: 1, realism: -0.36, characterFocus: 0.0, ideaDensity: 0.16 }, 
 output: {
   genre: ["science fiction", "adventure"],
   vibes: ["fast-paced", "playful"],
 }, },
  { isDefault: true, title: "Spider-Man: Into the Spider-Verse", semantic: { contentTraits: ["multiverse","secret_identity","identity"], toneTraits: ["energetic","inspiring"], characterTraits: ["reluctant_hero","mentor_figures"], storyTraits: ["coming_of_age","team_up"], aversionTraits: ["overstimulating"] }, author: "Sony", genre: "Illustrated / Superhero", wikiTitle: "Spider-Man: Into the Spider-Verse", tags: ["audience:teen","age:mshs","media:movie","source_universe:marvel","publisher:marvel comics","facet:superhero","superheroes","film","illustrated","science fiction","identity","energetic","uplifting"],tasteTraits: { warmth: 0.66, darkness: 0.0, pacing: 1, realism: -1, characterFocus: 1, ideaDensity: 0.77 }, 
 output: {
   genre: ["superheroes", "illustrated", "science fiction", "identity"],
   vibes: ["energetic", "uplifting"],
 }, },
  { isDefault: true, title: "The Dark Knight", semantic: { contentTraits: ["crime","power"], toneTraits: ["dark","serious"], characterTraits: ["morally_conflicted"], storyTraits: ["ideological_conflict","choice_and_consequence"], aversionTraits: ["intensity"] }, author: "Warner Bros.", genre: "Superhero / Crime", wikiTitle: "The Dark Knight (film)", tags: ["audience:teen","age:mshs","media:movie","source_universe:dc","publisher:dc comics","facet:superhero","superheroes","crime","film","dark","drama"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.02, realism: -0.27, characterFocus: 0.16, ideaDensity: 0.27 }, 
 output: {
   genre: ["superheroes", "crime", "drama"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "Inception", semantic: { contentTraits: ["dream_world","heist","constructed_reality"], toneTraits: ["tense","intellectual"], characterTraits: ["haunted_protagonist"], storyTraits: ["layered_mission","reality_questioning"], aversionTraits: ["complexity"] }, author: "Warner Bros.", genre: "Sci‑Fi / Thriller", wikiTitle: "Inception", tags: ["audience:teen","age:mshs","media:movie","science fiction","thriller","film"],tasteTraits: { warmth: 0.0, darkness: 0.41, pacing: 0.64, realism: -0.36, characterFocus: 0.0, ideaDensity: 0.16 }, 
 output: {
   genre: ["science fiction", "thriller"],
   vibes: [],
 }, },
  { isDefault: true, title: "Jurassic Park", semantic: { contentTraits: ["dinosaurs","science_problem_solving","survival"], toneTraits: ["suspenseful","awe"], characterTraits: ["experts_in_crisis"], storyTraits: ["escape_and_pursuit","escape"], aversionTraits: ["monster_threat"] }, author: "Universal", genre: "Adventure / Sci‑Fi", wikiTitle: "Jurassic Park (film)", tags: ["audience:teen","age:mshs","media:movie","adventure","science fiction","film","dinosaurs","survival","atmospheric"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.75, realism: -0.36, characterFocus: 0.0, ideaDensity: 0.18 }, 
 output: {
   genre: ["adventure", "science fiction", "dinosaurs", "survival"],
   vibes: ["atmospheric"],
 }, },
  { isDefault: true, title: "The Lord of the Rings: The Fellowship of the Ring", semantic: { contentTraits: ["epic_quest","friendship","destiny"], toneTraits: ["epic","serious"], characterTraits: ["reluctant_hero","loyal_companions"], storyTraits: ["journey_beginning","team_formation"], aversionTraits: ["long_runtime"] }, author: "New Line", genre: "Fantasy / Epic", wikiTitle: "The Lord of the Rings: The Fellowship of the Ring", tags: ["audience:teen","age:mshs","media:movie","fantasy","epic","film","friendship","drama"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.2, realism: -0.66, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["fantasy", "friendship", "drama"],
   vibes: ["epic"],
 }, },
  { isDefault: true, title: "Harry Potter and the Prisoner of Azkaban", semantic: { contentTraits: ["magic_school","time_travel","mystery"], toneTraits: ["dark","mysterious"], characterTraits: ["young_wizards"], storyTraits: ["investigation","truth_reveal"], aversionTraits: ["heavier_tone"] }, author: "Warner Bros.", genre: "Fantasy / Mystery", wikiTitle: "Harry Potter and the Prisoner of Azkaban (film)", tags: ["audience:teen","age:mshs","media:movie","fantasy","mystery","film","time travel","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.23, realism: -1, characterFocus: 0.0, ideaDensity: 0.8 }, 
 output: {
   genre: ["fantasy", "mystery", "time travel"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "The Giver", semantic: { contentTraits: ["political_control","memory","social_divide"], toneTraits: ["quiet","thoughtful"], characterTraits: ["questioning_protagonist"], storyTraits: ["awakening","rebellion_against_society"], aversionTraits: ["slow_pacing"] }, author: "The Weinstein Company", genre: "Dystopia / Drama", wikiTitle: "The Giver (film)", tags: ["audience:teen","age:mshs","media:movie","dystopian","drama","film","political","identity"],tasteTraits: { warmth: 0.0, darkness: 0.25, pacing: -0.25, realism: -0.14, characterFocus: 0.84, ideaDensity: 1 }, 
 output: {
   genre: ["dystopian", "drama", "political", "identity"],
   vibes: [],
 }, },
  { isDefault: true, title: "Dead Poets Society", semantic: { contentTraits: ["education","identity","outsider_identity"], toneTraits: ["emotional","inspiring"], characterTraits: ["mentor_teacher","searching_students"], storyTraits: ["personal_awakening","rebellion_against_society"], aversionTraits: ["sad_outcome"] }, author: "Touchstone", genre: "Drama", wikiTitle: "Dead Poets Society", tags: ["audience:teen","age:mshs","media:movie","drama","identity","film","school","outsider","emotional growth","uplifting"],tasteTraits: { warmth: 0.86, darkness: 0.0, pacing: 0.02, realism: 0.07, characterFocus: 1, ideaDensity: 0.86 }, 
 output: {
   genre: ["drama", "identity", "school", "outsider"],
   vibes: ["emotional growth", "uplifting"],
 }, },
  { isDefault: true, title: "The Truman Show", semantic: { contentTraits: ["constructed_reality","surveillance","identity"], toneTraits: ["satirical","thoughtful"], characterTraits: ["unaware_protagonist"], storyTraits: ["truth_discovery","escape"], aversionTraits: ["existential_theme"] }, author: "Paramount", genre: "Satire / Drama", wikiTitle: "The Truman Show", tags: ["audience:teen","age:mshs","media:movie","satire","drama","film","identity"],tasteTraits: { warmth: 0.0, darkness: 0.2, pacing: -0.05, realism: 0.14, characterFocus: 1, ideaDensity: 0.66 }, 
 output: {
   genre: ["satire", "drama", "identity"],
   vibes: [],
 }, },
  { isDefault: true, title: "Scott Pilgrim vs. the World", semantic: { contentTraits: ["romance","virtual_world","competition"], toneTraits: ["quirky","fast","comic"], characterTraits: ["immature_protagonist"], storyTraits: ["battle_for_love","emotional_growth_arc"], aversionTraits: ["overstimulating"] }, author: "Universal", genre: "Comedy / Action", wikiTitle: "Scott Pilgrim vs. the World", tags: ["audience:teen","age:mshs","media:movie","comedy","film","fast-paced","romance","quirky"],tasteTraits: { warmth: 0.93, darkness: 0.0, pacing: 1, realism: 0.0, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["comedy", "romance"],
   vibes: ["fast-paced", "quirky"],
 }, },
  { isDefault: true, title: "Get Out", semantic: { contentTraits: ["racism","mental_health"], toneTraits: ["tense","unsettling"], characterTraits: ["trapped_protagonist"], storyTraits: ["truth_reveal","escape"], aversionTraits: ["disturbing_content"] }, author: "Universal", genre: "Horror / Thriller", wikiTitle: "Get Out", tags: ["audience:teen","age:mshs","media:movie","horror","thriller","film","systemic injustice","vulnerability"],tasteTraits: { warmth: 0.11, darkness: 1, pacing: 0.64, realism: 0.0, characterFocus: 0.3, ideaDensity: 0.34 }, 
 output: {
   genre: ["horror", "thriller", "systemic injustice", "vulnerability"],
   vibes: [],
 }, },
  { isDefault: true, title: "Knives Out", semantic: { contentTraits: ["whodunit","family_secrets","inheritance"], toneTraits: ["clever","playful"], characterTraits: ["eccentric_detective"], storyTraits: ["investigation","twist_reveal"], aversionTraits: ["talky_scenes"] }, author: "Lionsgate", genre: "Mystery / Crime", wikiTitle: "Knives Out", tags: ["audience:teen","age:mshs","media:movie","mystery","crime","film","playful"],tasteTraits: { warmth: 0.66, darkness: 0.32, pacing: 0.34, realism: 0.0, characterFocus: 0.7, ideaDensity: 0.41 }, 
 output: {
   genre: ["mystery", "crime"],
   vibes: ["playful"],
 }, },
  { isDefault: true, title: "Love, Simon", semantic: { contentTraits: ["teen_romance","queer_identity","friendship"], toneTraits: ["warm","hopeful"], characterTraits: ["closeted_protagonist"], storyTraits: ["identity_discovery","relationship_building"], aversionTraits: ["predictable_beats"] }, author: "20th Century", genre: "Romance / Coming-of-Age", wikiTitle: "Love, Simon", tags: ["audience:teen","age:mshs","media:movie","romance","coming of age","identity","friendship","film","warm","hopeful"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: 0.02, realism: 0.0, characterFocus: 1, ideaDensity: 0.61 }, 
 output: {
   genre: ["romance", "identity", "friendship"],
   vibes: ["coming of age", "warm", "hopeful"],
 }, },
  { isDefault: true, title: "The Perks of Being a Wallflower", semantic: { contentTraits: ["teen_friendship","mental_health","trauma"], toneTraits: ["emotional","reflective"], characterTraits: ["shy_protagonist"], storyTraits: ["self_realization","healing_arc"], aversionTraits: ["heavy_themes"] }, author: "Summit", genre: "Drama / Coming-of-Age", wikiTitle: "The Perks of Being a Wallflower (film)", tags: ["audience:teen","age:mshs","media:movie","drama","coming of age","identity","friendship","film","vulnerability","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.2, pacing: -0.09, realism: 0.14, characterFocus: 1, ideaDensity: 0.2 }, 
 output: {
   genre: ["drama", "identity", "friendship", "vulnerability"],
   vibes: ["coming of age", "emotional growth"],
 }, },
  { isDefault: true, title: "A Quiet Place", semantic: { contentTraits: ["silent_survival","family","monsters"], toneTraits: ["tense","suspenseful"], characterTraits: ["protective_parents"], storyTraits: ["survival_scenario","survival_story"], aversionTraits: ["high_tension"] }, author: "Paramount", genre: "Horror / Survival", wikiTitle: "A Quiet Place (film)", tags: ["audience:teen","age:mshs","media:movie","horror","survival","film","family"],tasteTraits: { warmth: 0.5, darkness: 1, pacing: 1, realism: -0.34, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["horror", "survival", "family"],
   vibes: [],
 }, },
  { isDefault: true, title: "Edge of Tomorrow", semantic: { contentTraits: ["time_loop","war","training"], toneTraits: ["fast","intense"], characterTraits: ["reluctant_soldier"], storyTraits: ["repeat_and_learn","battle_progression"], aversionTraits: ["repetition"] }, author: "Warner Bros.", genre: "Sci-Fi / Action", wikiTitle: "Edge of Tomorrow", tags: ["audience:teen","age:mshs","media:movie","science fiction","film","fast-paced","war & society"],tasteTraits: { warmth: 0.0, darkness: 0.61, pacing: 1, realism: -0.64, characterFocus: 0.0, ideaDensity: 0.66 }, 
 output: {
   genre: ["science fiction", "war & society"],
   vibes: ["fast-paced"],
 }, },
  { isDefault: true, title: "Cruella", semantic: { contentTraits: ["identity","fashion","rebellion"], toneTraits: ["stylish"], characterTraits: ["ambitious_outsider"], storyTraits: ["power_rise","identity_formation"], aversionTraits: ["antihero_focus"] }, author: "Disney", genre: "Crime / Drama", wikiTitle: "Cruella (film)", tags: ["audience:teen","age:mshs","media:movie","crime","drama","film","identity","atmospheric"],tasteTraits: { warmth: 0.0, darkness: 0.32, pacing: -0.02, realism: 0.14, characterFocus: 1, ideaDensity: 0.82 }, 
 output: {
   genre: ["crime", "drama", "identity"],
   vibes: ["atmospheric"],
 }, },
  { isDefault: true, title: "Spider-Man: Homecoming", semantic: { contentTraits: ["secret_identity","high_school","mentorship"], toneTraits: ["fun","light"], characterTraits: ["eager_hero"], storyTraits: ["prove_yourself","coming_of_age"], aversionTraits: ["predictable"] }, author: "Sony", genre: "Superhero / Coming-of-Age", wikiTitle: "Spider-Man: Homecoming", tags: ["audience:teen","age:mshs","media:movie","superheroes","coming of age","film","school","playful"],tasteTraits: { warmth: 0.2, darkness: 0.0, pacing: 0.11, realism: 0.07, characterFocus: 1, ideaDensity: 0.2 }, 
 output: {
   genre: ["superheroes", "school"],
   vibes: ["coming of age", "playful"],
 }, },
  { isDefault: true, title: "The Book Thief", semantic: { contentTraits: ["war","books","friendship"], toneTraits: ["somber","emotional"], characterTraits: ["resilient_child"], storyTraits: ["survival_story","relationship_building"], aversionTraits: ["sad_tone"] }, author: "20th Century", genre: "Historical / Drama", wikiTitle: "The Book Thief (film)", tags: ["audience:teen","age:mshs","media:movie","historical","drama","film","war & society","nostalgia","friendship","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.89, pacing: 0.16, realism: 1, characterFocus: 1, ideaDensity: 0.25 }, 
 output: {
   genre: ["historical", "drama", "war & society", "nostalgia", "friendship"],
   vibes: ["emotional growth"],
 }, },
  { isDefault: true, title: "Arrival", semantic: { contentTraits: ["first_contact","language","memory"], toneTraits: ["quiet","thoughtful"], characterTraits: ["intellectual_protagonist"], storyTraits: ["mystery_unfolding","nonlinear_reveal"], aversionTraits: ["slow_pacing"] }, author: "Paramount", genre: "Science Fiction / Drama", wikiTitle: "Arrival (film)", tags: ["audience:teen","age:mshs","media:movie","science fiction","drama","film","identity"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: -0.18, realism: -0.59, characterFocus: 0.84, ideaDensity: 0.75 }, 
 output: {
   genre: ["science fiction", "drama", "identity"],
   vibes: [],
 }, },
  { isDefault: true, title: "Lady Bird", semantic: { contentTraits: ["teen_life","family","identity"], toneTraits: ["realistic","witty"], characterTraits: ["flawed_protagonist"], storyTraits: ["coming_of_age","relationship_conflict"], aversionTraits: ["low_plot"] }, author: "A24", genre: "Realistic / Coming-of-Age", wikiTitle: "Lady Bird (film)", tags: ["audience:teen","age:mshs","media:movie","drama","coming of age","identity","film","realistic","family"],tasteTraits: { warmth: 0.5, darkness: 0.0, pacing: 0.02, realism: 1, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["drama", "identity", "realistic", "family"],
   vibes: ["coming of age"],
 }, },
  { isDefault: true, title: "The Edge of Seventeen", semantic: { contentTraits: ["teen_life","friendship","family_conflict"], toneTraits: ["quirky","emotional","witty"], characterTraits: ["insecure_protagonist"], storyTraits: ["coming_of_age","self_realization"], aversionTraits: ["cringe_moments"] }, author: "STX", genre: "Realistic / Coming-of-Age", wikiTitle: "The Edge of Seventeen", tags: ["audience:teen","age:mshs","media:movie","drama","coming of age","identity","friendship","film","realistic","quirky","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.02, realism: 1, characterFocus: 1, ideaDensity: 0.2 }, 
 output: {
   genre: ["drama", "identity", "friendship", "realistic"],
   vibes: ["coming of age", "quirky", "emotional growth"],
 }, },
  { isDefault: true, title: "To All the Boys I've Loved Before", semantic: { contentTraits: ["teen_romance","letters","family"], toneTraits: ["warm","light"], characterTraits: ["shy_protagonist"], storyTraits: ["fake_relationship","real_feelings"], aversionTraits: ["predictable_romance"] }, author: "Netflix", genre: "Romance / Coming-of-Age", wikiTitle: "To All the Boys I've Loved Before (film)", tags: ["audience:teen","age:mshs","media:movie","romance","coming of age","film","family","warm"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: 0.02, realism: 0.0, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["romance", "family"],
   vibes: ["coming of age", "warm"],
 }, },
  { isDefault: true, title: "The Fault in Our Stars", semantic: { contentTraits: ["illness","romance","mortality"], toneTraits: ["emotional","bittersweet"], characterTraits: ["thoughtful_teens"], storyTraits: ["love_story","inevitable_loss"], aversionTraits: ["sad_theme"] }, author: "20th Century", genre: "Romance / Drama", wikiTitle: "The Fault in Our Stars (film)", tags: ["audience:teen","age:mshs","media:movie","romance","drama","film","emotional growth"],tasteTraits: { warmth: 0.82, darkness: 0.0, pacing: -0.05, realism: 0.14, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["romance", "drama"],
   vibes: ["emotional growth"],
 }, },
  { isDefault: true, title: "Rocky", semantic: { contentTraits: ["competition","training"], toneTraits: ["dark","inspiring"], characterTraits: ["determined_underdog"], storyTraits: ["training_arc","competition_progression"], aversionTraits: ["sports_focus"] }, author: "United Artists", genre: "Sports / Drama", wikiTitle: "Rocky", tags: ["audience:teen","age:mshs","media:movie","drama","film","energetic","dark","uplifting"],tasteTraits: { warmth: 0.66, darkness: 1, pacing: 0.73, realism: -0.3, characterFocus: 0.32, ideaDensity: 0.5 }, 
 output: {
   genre: ["drama"],
   vibes: ["energetic", "dark", "uplifting"],
 }, },
  { isDefault: true, title: "Gladiator", semantic: { contentTraits: ["revenge","arena","political_control"], toneTraits: ["epic","intense"], characterTraits: ["wronged_hero"], storyTraits: ["rise_and_revenge","battle_progression"], aversionTraits: ["violence"] }, author: "DreamWorks / Universal", genre: "Historical / Action", wikiTitle: "Gladiator (2000 film)", tags: ["audience:teen","age:mshs","media:movie","historical","film","fast-paced","political","epic"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 1, realism: 1, characterFocus: 0.0, ideaDensity: 0.55 }, 
 output: {
   genre: ["historical", "political"],
   vibes: ["fast-paced", "epic"],
 }, },
  { isDefault: true, title: "The Conjuring", semantic: { contentTraits: ["haunting","family","ghost_hunting"], toneTraits: ["scary","tense"], characterTraits: ["investigator_couple"], storyTraits: ["case_escalation"], aversionTraits: ["jump_scares"] }, author: "Warner Bros.", genre: "Horror / Paranormal", wikiTitle: "The Conjuring", tags: ["audience:teen","age:mshs","media:movie","horror","film","spooky","family"],tasteTraits: { warmth: 0.5, darkness: 1, pacing: 0.23, realism: -0.55, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["horror", "family"],
   vibes: ["spooky"],
 }, },
  { isDefault: true, title: "Now You See Me", semantic: { contentTraits: ["fantasy_heist","deception","found_family"], toneTraits: ["slick","fast"], characterTraits: ["lovable_misfits"], storyTraits: ["heist_twists","cat_and_mouse"], aversionTraits: ["implausibility"] }, author: "Summit", genre: "Mystery / Heist", wikiTitle: "Now You See Me (film)", tags: ["audience:teen","age:mshs","media:movie","mystery","crime","film","family","fast-paced"],tasteTraits: { warmth: 0.5, darkness: 0.16, pacing: 1, realism: -0.36, characterFocus: 1, ideaDensity: 0.32 }, 
 output: {
   genre: ["mystery", "crime", "family"],
   vibes: ["fast-paced"],
 }, },
  { isDefault: true, title: "The Karate Kid", semantic: { contentTraits: ["martial_arts","bullying","mentorship"], toneTraits: ["inspiring","grounded"], characterTraits: ["underdog_student"], storyTraits: ["training_arc","competition_progression"], aversionTraits: ["sports_focus"] }, author: "Columbia", genre: "Sports / Drama", wikiTitle: "The Karate Kid", tags: ["audience:teen","age:mshs","media:movie","drama","film","energetic","uplifting"],tasteTraits: { warmth: 0.66, darkness: 0.0, pacing: 0.73, realism: 0.34, characterFocus: 0.32, ideaDensity: 0.25 }, 
 output: {
   genre: ["drama"],
   vibes: ["energetic", "uplifting"],
 }, },
  { isDefault: true, title: "Percy Jackson & the Olympians: The Lightning Thief", semantic: { contentTraits: ["greek_mythology","demigods","adventure"], toneTraits: ["fun","adventurous"], characterTraits: ["reluctant_hero"], storyTraits: ["quest_journey","identity_discovery"], aversionTraits: ["predictable"] }, author: "20th Century", genre: "Fantasy / Adventure", wikiTitle: "Percy Jackson & the Olympians: The Lightning Thief", tags: ["audience:teen","age:mshs","media:movie","fantasy","adventure","mythology","identity","film","playful"],tasteTraits: { warmth: 0.2, darkness: 0.0, pacing: 0.93, realism: -1, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["fantasy", "adventure", "mythology", "identity"],
   vibes: ["playful"],
 }, },
  { isDefault: true, title: "The Princess Bride", semantic: { contentTraits: ["fairytale","romance","adventure"], toneTraits: ["whimsical","funny"], characterTraits: ["heroic_lovers"], storyTraits: ["quest_and_rescue","story_within_story"], aversionTraits: ["campy_style"] }, author: "20th Century", genre: "Fantasy / Adventure", wikiTitle: "The Princess Bride (film)", tags: ["audience:teen","age:mshs","media:movie","fantasy","adventure","film","romance","whimsical","comedy"],tasteTraits: { warmth: 0.73, darkness: 0.0, pacing: 0.64, realism: -1, characterFocus: 1, ideaDensity: 0.25 }, 
 output: {
   genre: ["fantasy", "adventure", "romance", "comedy"],
   vibes: ["whimsical"],
 }, },
  { isDefault: true, title: "The Batman", semantic: { contentTraits: ["crime","investigation","corruption"], toneTraits: ["dark","moody","serious"], characterTraits: ["broken_detective"], storyTraits: ["investigation","mystery_unfolding"], aversionTraits: ["violence","heavy_themes"] }, author: "Warner Bros.", genre: "Superhero / Mystery", wikiTitle: "The Batman (film)", tags: ["audience:teen","age:mshs","media:movie","superheroes","mystery","crime","film","dark","drama"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.23, realism: -0.27, characterFocus: 0.16, ideaDensity: 0.52 }, 
 output: {
   genre: ["superheroes", "mystery", "crime", "drama"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "Dungeons & Dragons: Honor Among Thieves", semantic: { contentTraits: ["fantasy_heist","found_family","magic"], toneTraits: ["fun","playful","adventurous"], characterTraits: ["lovable_misfits"], storyTraits: ["heist_twists","quest_structure"], aversionTraits: ["campy_style"] }, author: "Paramount", genre: "Fantasy / Adventure", wikiTitle: "Dungeons & Dragons: Honor Among Thieves", tags: ["audience:teen","age:mshs","media:movie","fantasy","adventure","film","family","playful"],tasteTraits: { warmth: 0.91, darkness: 0.0, pacing: 0.82, realism: -1, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["fantasy", "adventure", "family"],
   vibes: ["playful"],
 }, },
  { isDefault: true, title: "Everything Everywhere All at Once", semantic: { contentTraits: ["family","multiverse","identity"], toneTraits: ["chaotic","emotional","weird"], characterTraits: ["overwhelmed_protagonist"], storyTraits: ["reality_jumping","relationship_building"], aversionTraits: ["overstimulating","complexity"] }, author: "A24", genre: "Science Fiction / Adventure", wikiTitle: "Everything Everywhere All at Once", tags: ["audience:teen","age:mshs","media:movie","science fiction","adventure","identity","family","film","emotional growth"],tasteTraits: { warmth: 0.7, darkness: 0.0, pacing: 0.43, realism: -1, characterFocus: 1, ideaDensity: 0.73 }, 
 output: {
   genre: ["science fiction", "adventure", "identity", "family"],
   vibes: ["emotional growth"],
 }, },
  { isDefault: true, title: "Enola Holmes", semantic: { contentTraits: ["teen_detective","mystery","outsider_identity"], toneTraits: ["clever","playful","adventurous"], characterTraits: ["resourceful_protagonist"], storyTraits: ["case_solving","truth_discovery"], aversionTraits: ["predictable_beats"] }, author: "Netflix", genre: "Mystery / Adventure", wikiTitle: "Enola Holmes", tags: ["audience:teen","age:mshs","media:movie","mystery","adventure","historical","identity","film","outsider","playful"],tasteTraits: { warmth: 0.41, darkness: 0.0, pacing: 1, realism: 0.52, characterFocus: 1, ideaDensity: 0.75 }, 
 output: {
   genre: ["mystery", "adventure", "historical", "identity", "outsider"],
   vibes: ["playful"],
 }, },
  { isDefault: true, title: "Little Women", semantic: { contentTraits: ["family","coming_of_age","human_connection"], toneTraits: ["warm","emotional","nostalgic"], characterTraits: ["strong_sisters"], storyTraits: ["coming_of_age","relationship_building"], aversionTraits: ["slow_pacing"] }, author: "Sony", genre: "Historical / Drama", wikiTitle: "Little Women (2019 film)", tags: ["audience:teen","age:mshs","media:movie","historical","drama","coming of age","friendship","film","family","human connection","warm","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: 0.02, realism: 1, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["historical", "drama", "friendship", "family"],
   vibes: ["coming of age", "human connection", "warm", "emotional growth"],
 }, },
  { isDefault: true, title: "The Martian", semantic: { contentTraits: ["space_survival","science_problem_solving","isolation"], toneTraits: ["smart","focused","hopeful"], characterTraits: ["resourceful_survivor"], storyTraits: ["survival_strategy","problem_solving_chain"], aversionTraits: ["technical_details"] }, author: "20th Century", genre: "Science Fiction / Survival", wikiTitle: "The Martian (film)", tags: ["audience:teen","age:mshs","media:movie","science fiction","survival","film","hopeful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.75, realism: -1, characterFocus: 0.0, ideaDensity: 0.57 }, 
 output: {
   genre: ["science fiction", "survival"],
   vibes: ["hopeful"],
 }, },
  { isDefault: true, title: "How to Train Your Dragon", semantic: { contentTraits: ["friendship","magic","outsider_identity"], toneTraits: ["adventurous","warm","hopeful"], characterTraits: ["underestimated_protagonist"], storyTraits: ["training_and_quest","friendship_growth"], aversionTraits: ["younger_skew"] }, author: "DreamWorks", genre: "Fantasy / Adventure", wikiTitle: "How to Train Your Dragon (film)", tags: ["audience:teen","age:mshs","media:movie","fantasy","adventure","film","friendship","outsider","warm","hopeful"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: 0.64, realism: -1, characterFocus: 1, ideaDensity: 0.45 }, 
 output: {
   genre: ["fantasy", "adventure", "friendship", "outsider"],
   vibes: ["warm", "hopeful"],
 }, },
  { isDefault: true, title: "Akeelah and the Bee", semantic: { contentTraits: ["education","competition","giftedness"], toneTraits: ["inspiring","heartfelt","grounded"], characterTraits: ["gifted_underdog"], storyTraits: ["competition_progression","prove_yourself"], aversionTraits: ["predictable_beats"] }, author: "Lionsgate", genre: "Drama / Competition", wikiTitle: "Akeelah and the Bee", tags: ["audience:teen","age:mshs","media:movie","drama","identity","film","school","uplifting"],tasteTraits: { warmth: 0.98, darkness: 0.0, pacing: 0.02, realism: 0.7, characterFocus: 0.84, ideaDensity: 0.2 }, 
 output: {
   genre: ["drama", "identity", "school"],
   vibes: ["uplifting"],
 }, },
  { isDefault: true, title: "The Half of It", semantic: { contentTraits: ["teen_romance","identity_exploration","friendship"], toneTraits: ["quiet","tender","thoughtful"], characterTraits: ["shy_protagonist"], storyTraits: ["relationship_building","self_acceptance"], aversionTraits: ["slow_burn"] }, author: "Netflix", genre: "Romance / Coming-of-Age", wikiTitle: "The Half of It", tags: ["audience:teen","age:mshs","media:movie","romance","identity","friendship","film","coming of age","warm"],tasteTraits: { warmth: 1, darkness: 0.2, pacing: -0.25, realism: 0.0, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["romance", "identity", "friendship"],
   vibes: ["coming of age", "warm"],
 }, },
];

const CANON_MSHS_GAMES: any[] = [
  { isDefault: true, title: "Minecraft", semantic: { contentTraits: ["adventure","community","survival"], toneTraits: ["playful","adventurous","fun"], characterTraits: ["curious_explorer"], storyTraits: ["exploration_arc","building_a_new_life"], aversionTraits: ["low_plot"] }, author: "Mojang", genre: "Sandbox", wikiTitle: "Minecraft", tags: ["audience:teen","age:mshs","media:game","playful","adventure","community","survival"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: 0.14, characterFocus: 0.55, ideaDensity: 0.0 }, 
 output: {
   genre: ["adventure", "community", "survival"],
   vibes: ["playful"],
 }, },
  { isDefault: true, title: "Fortnite", semantic: { contentTraits: ["competition","survival","media_spectacle"], toneTraits: ["energetic","fast","playful"], characterTraits: ["team_players"], storyTraits: ["competition_progression","survival_scenario"], aversionTraits: ["overstimulating"] }, author: "Epic Games", genre: "Battle Royale", wikiTitle: "Fortnite", tags: ["audience:teen","age:mshs","media:game","survival","energetic","fast-paced","playful"],tasteTraits: { warmth: 0.41, darkness: 0.0, pacing: 1, realism: -0.05, characterFocus: 0.0, ideaDensity: 0.0 }, 
 output: {
   genre: ["survival"],
   vibes: ["energetic", "fast-paced", "playful"],
 }, },
  { isDefault: true, title: "The Legend of Zelda: Breath of the Wild", semantic: { contentTraits: ["adventure","magic","power_mastery"], toneTraits: ["awe","adventurous","immersive"], characterTraits: ["silent_wanderer"], storyTraits: ["exploration_arc","quest_journey"], aversionTraits: ["quiet_pacing"] }, author: "Nintendo", genre: "Fantasy / Adventure", wikiTitle: "The Legend of Zelda: Breath of the Wild", tags: ["audience:teen","age:mshs","media:game","fantasy","adventure","atmospheric"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.8, realism: -1, characterFocus: 0.0, ideaDensity: 0.02 }, 
 output: {
   genre: ["fantasy", "adventure"],
   vibes: ["atmospheric"],
 }, },
  { isDefault: true, title: "The Elder Scrolls V: Skyrim", semantic: { contentTraits: ["adventure","magic","power"], toneTraits: ["immersive","adventurous","grand"], characterTraits: ["outsider_hero"], storyTraits: ["quest_structure","exploration_arc"], aversionTraits: ["worldbuilding_density"] }, author: "Bethesda", genre: "Fantasy / Open World", wikiTitle: "The Elder Scrolls V: Skyrim", tags: ["audience:teen","age:mshs","media:game","fantasy","adventure"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.64, realism: -1, characterFocus: 0.0, ideaDensity: 0.0 }, 
 output: {
   genre: ["fantasy", "adventure"],
   vibes: [],
 }, },
  { isDefault: true, title: "The Witcher 3: Wild Hunt", semantic: { contentTraits: ["monster_hunting","magic","found_family"], toneTraits: ["dark","immersive","dramatic"], characterTraits: ["stoic_monster_hunter"], storyTraits: ["quest_structure","relationship_complexity"], aversionTraits: ["violence","worldbuilding_density"] }, author: "CD Projekt", genre: "Fantasy / RPG", wikiTitle: "The Witcher 3: Wild Hunt", tags: ["audience:teen","age:mshs","media:game","fantasy","family","dark"],tasteTraits: { warmth: 0.5, darkness: 1, pacing: 0.02, realism: -1, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["fantasy", "family"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "Life Is Strange", semantic: { contentTraits: ["time_travel","teen_life","friendship"], toneTraits: ["emotional","melancholic","thoughtful"], characterTraits: ["thoughtful_teens"], storyTraits: ["choice_and_consequence","coming_of_age"], aversionTraits: ["slow_pacing"] }, author: "Square Enix", genre: "Narrative / Choice", wikiTitle: "Life Is Strange", tags: ["audience:teen","age:mshs","media:game","identity","time travel","friendship","emotional growth","melancholic"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -0.09, realism: -0.64, characterFocus: 1, ideaDensity: 0.66 }, 
 output: {
   genre: ["identity", "time travel", "friendship"],
   vibes: ["emotional growth", "melancholic"],
 }, },
  { isDefault: true, title: "The Last of Us", semantic: { contentTraits: ["zombie_apocalypse","survival","parent_child_bond"], toneTraits: ["dark","emotional","tense"], characterTraits: ["hardened_protector"], storyTraits: ["survival_journey","protective_bond"], aversionTraits: ["graphic_violence","emotional_heaviness"] }, author: "Naughty Dog", genre: "Survival / Drama", wikiTitle: "The Last of Us (video game)", tags: ["audience:teen","age:mshs","media:game","survival","drama","dark","emotional growth"],tasteTraits: { warmth: 0.2, darkness: 1, pacing: 0.98, realism: 0.09, characterFocus: 0.32, ideaDensity: 0.0 }, 
 output: {
   genre: ["survival", "drama"],
   vibes: ["dark", "emotional growth"],
 }, },
  { isDefault: true, title: "Red Dead Redemption 2", semantic: { contentTraits: ["crime","family","honor_vs_survival"], toneTraits: ["melancholic","grounded","dramatic"], characterTraits: ["morally_conflicted"], storyTraits: ["power_struggle","redemption_arc"], aversionTraits: ["long_runtime","slow_pacing"] }, author: "Rockstar", genre: "Western / Open World", wikiTitle: "Red Dead Redemption 2", tags: ["audience:teen","age:mshs","media:game","western","crime","family","melancholic"],tasteTraits: { warmth: 0.5, darkness: 0.73, pacing: 0.23, realism: 0.39, characterFocus: 1, ideaDensity: 0.18 }, 
 output: {
   genre: ["western", "crime", "family"],
   vibes: ["melancholic"],
 }, },
  { isDefault: true, title: "Portal 2", semantic: { contentTraits: ["artificial_intelligence","science_problem_solving","constructed_reality"], toneTraits: ["witty","clever","weird"], characterTraits: ["eccentric_genius"], storyTraits: ["puzzle_solving","escape_mystery"], aversionTraits: ["puzzle_focus"] }, author: "Valve", genre: "Puzzle", wikiTitle: "Portal 2", tags: ["audience:teen","age:mshs","media:game","ai","science fiction"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.11, realism: -0.68, characterFocus: 0.0, ideaDensity: 0.52 }, 
 output: {
   genre: ["ai", "science fiction"],
   vibes: [],
 }, },
  { isDefault: true, title: "Undertale", semantic: { contentTraits: ["friendship","monsters","ethics"], toneTraits: ["quirky","warm","weird"], characterTraits: ["unlikely_allies"], storyTraits: ["choice_and_consequence","moral_growth"], aversionTraits: ["younger_skew"] }, author: "Toby Fox", genre: "Indie / RPG", wikiTitle: "Undertale", tags: ["audience:teen","age:mshs","media:game","friendship","quirky","warm"],tasteTraits: { warmth: 1, darkness: 0.75, pacing: 0.05, realism: -0.39, characterFocus: 1, ideaDensity: 0.32 }, 
 output: {
   genre: ["friendship"],
   vibes: ["quirky", "warm"],
 }, },
  { isDefault: true, title: "Hollow Knight", semantic: { contentTraits: ["isolation","mystery","monsters"], toneTraits: ["haunting","dark","immersive"], characterTraits: ["silent_wanderer"], storyTraits: ["exploration_arc","mystery_unfolding"], aversionTraits: ["difficulty","bleakness"] }, author: "Team Cherry", genre: "Action / Metroidvania", wikiTitle: "Hollow Knight", tags: ["audience:teen","age:mshs","media:game","fast-paced","mystery","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 1, realism: -0.39, characterFocus: 0.0, ideaDensity: 0.34 }, 
 output: {
   genre: ["mystery"],
   vibes: ["fast-paced", "dark"],
 }, },
  { isDefault: true, title: "Stardew Valley", semantic: { contentTraits: ["community","friendship","family"], toneTraits: ["cozy","gentle","warm"], characterTraits: ["gentle_caretaker"], storyTraits: ["building_a_new_life","relationship_building"], aversionTraits: ["low_conflict","slow_pacing"] }, author: "ConcernedApe", genre: "Cozy / Farming", wikiTitle: "Stardew Valley", tags: ["audience:teen","age:mshs","media:game","cozy","community","friendship","family","gentle","warm"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -1, realism: 0.14, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["community", "friendship", "family"],
   vibes: ["cozy", "gentle", "warm"],
 }, },
  { isDefault: true, title: "Among Us", semantic: { contentTraits: ["deception","competition","mystery"], toneTraits: ["chaotic","fun","tense"], characterTraits: ["morally_mixed_cast"], storyTraits: ["cat_and_mouse","mystery_unfolding"], aversionTraits: ["repetition"] }, author: "Innersloth", genre: "Social Deduction", wikiTitle: "Among Us", tags: ["audience:teen","age:mshs","media:game","mystery","playful"],tasteTraits: { warmth: 0.2, darkness: 0.0, pacing: 0.55, realism: -0.05, characterFocus: 0.0, ideaDensity: 0.34 }, 
 output: {
   genre: ["mystery"],
   vibes: ["playful"],
 }, },
  { isDefault: true, title: "Mass Effect", semantic: { contentTraits: ["space_politics","alien_encounters","found_family"], toneTraits: ["epic","dramatic","hopeful"], characterTraits: ["leader_with_loyal_crew"], storyTraits: ["save_the_galaxy_arc","relationship_building"], aversionTraits: ["worldbuilding_density"] }, author: "BioWare", genre: "Science Fiction / RPG", wikiTitle: "Mass Effect", tags: ["audience:teen","age:mshs","media:game","science fiction","family","epic","hopeful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.14, realism: -0.7, characterFocus: 1, ideaDensity: 0.32 }, 
 output: {
   genre: ["science fiction", "family"],
   vibes: ["epic", "hopeful"],
 }, },
  { isDefault: true, title: "Cyberpunk 2077", semantic: { contentTraits: ["corporate_control","artificial_intelligence","identity"], toneTraits: ["dark","stylish","intense"], characterTraits: ["ambitious_outsider"], storyTraits: ["power_struggle","identity_reinvention"], aversionTraits: ["violence","moral_ambiguity"] }, author: "CD Projekt", genre: "Sci‑Fi / RPG", wikiTitle: "Cyberpunk 2077", tags: ["audience:teen","age:mshs","media:game","science fiction","ai","identity","dark","atmospheric"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.48, realism: -0.68, characterFocus: 1, ideaDensity: 1 }, 
 output: {
   genre: ["science fiction", "ai", "identity"],
   vibes: ["dark", "atmospheric"],
 }, },
  { isDefault: true, title: "Rocket League", semantic: { contentTraits: ["competition","sports_team","community"], toneTraits: ["energetic","fast","playful"], characterTraits: ["team_players"], storyTraits: ["competition_progression","team_building"], aversionTraits: ["sports_focus"] }, author: "Psyonix", genre: "Sports", wikiTitle: "Rocket League", tags: ["audience:teen","age:mshs","media:game","energetic","community","fast-paced","playful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: 0.36, characterFocus: 0.55, ideaDensity: 0.0 }, 
 output: {
   genre: ["community"],
   vibes: ["energetic", "fast-paced", "playful"],
 }, },
  { isDefault: true, title: "Hades", semantic: { contentTraits: ["mythology","family_conflict","power"], toneTraits: ["stylish","fast","witty"], characterTraits: ["sarcastic_protagonist"], storyTraits: ["repeated_escape_and_growth","family_conflict"], aversionTraits: ["repetition"] }, author: "Supergiant", genre: "Fantasy / Action", wikiTitle: "Hades (video game)", tags: ["audience:teen","age:mshs","media:game","fantasy","fast-paced","mythology","atmospheric"],tasteTraits: { warmth: 0.5, darkness: 0.0, pacing: 1, realism: -1, characterFocus: 1, ideaDensity: 0.02 }, 
 output: {
   genre: ["fantasy", "mythology"],
   vibes: ["fast-paced", "atmospheric"],
 }, },
  { isDefault: true, title: "Persona 5 Royal", semantic: { contentTraits: ["rebellion","high_school","secret_identity"], toneTraits: ["stylish","smart","dark"], characterTraits: ["found_family_team"], storyTraits: ["heist_and_resistance","team_building"], aversionTraits: ["length"] }, author: "Atlus", genre: "Fantasy / Mystery", wikiTitle: "Persona 5 Royal", tags: ["audience:teen","age:mshs","media:game","fantasy","mystery","school","atmospheric","dark"],tasteTraits: { warmth: 0.25, darkness: 1, pacing: 0.09, realism: -0.36, characterFocus: 1, ideaDensity: 0.45 }, 
 output: {
   genre: ["fantasy", "mystery", "school"],
   vibes: ["atmospheric", "dark"],
 }, },
  { isDefault: true, title: "Oxenfree", semantic: { contentTraits: ["ghost_stories","friendship","small_town"], toneTraits: ["moody","spooky","mysterious"], characterTraits: ["vulnerable_teens"], storyTraits: ["mystery_unfolding","truth_reveal"], aversionTraits: ["slow_burn","unease"] }, author: "Night School Studio", genre: "Mystery / Paranormal", wikiTitle: "Oxenfree", tags: ["audience:teen","age:mshs","media:game","mystery","spooky","friendship"],tasteTraits: { warmth: 1, darkness: 0.95, pacing: 0.25, realism: -0.8, characterFocus: 1, ideaDensity: 0.34 }, 
 output: {
   genre: ["mystery", "friendship"],
   vibes: ["spooky"],
 }, },
  { isDefault: true, title: "Celeste", semantic: { contentTraits: ["mental_health","identity","competition"], toneTraits: ["hopeful","emotional","focused"], characterTraits: ["determined_underdog"], storyTraits: ["prove_yourself","self_realization"], aversionTraits: ["difficulty"] }, author: "Matt Makes Games", genre: "Platformer / Drama", wikiTitle: "Celeste (video game)", tags: ["audience:teen","age:mshs","media:game","drama","vulnerability","identity","hopeful","emotional growth"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.05, realism: 0.09, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["drama", "vulnerability", "identity"],
   vibes: ["hopeful", "emotional growth"],
 }, },
  { isDefault: true, title: "Subnautica", semantic: { contentTraits: ["survival","isolation","space_survival"], toneTraits: ["awe","lonely","immersive"], characterTraits: ["resourceful_survivor"], storyTraits: ["exploration_arc","survival_strategy"], aversionTraits: ["threat_of_depths"] }, author: "Unknown Worlds", genre: "Survival / Sci-Fi", wikiTitle: "Subnautica", tags: ["audience:teen","age:mshs","media:game","science fiction","survival","atmospheric"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.89, realism: -0.41, characterFocus: 0.0, ideaDensity: 0.18 }, 
 output: {
   genre: ["science fiction", "survival"],
   vibes: ["atmospheric"],
 }, },
  { isDefault: true, title: "Firewatch", semantic: { contentTraits: ["small_town_mystery","isolation","human_connection"], toneTraits: ["quiet","moody","thoughtful"], characterTraits: ["lonely_protagonist"], storyTraits: ["mystery_unfolding","relationship_building"], aversionTraits: ["slow_pacing"] }, author: "Campo Santo", genre: "Mystery / Adventure", wikiTitle: "Firewatch", tags: ["audience:teen","age:mshs","media:game","mystery","adventure","human connection","identity"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.45, realism: -0.05, characterFocus: 1, ideaDensity: 0.66 }, 
 output: {
   genre: ["mystery", "adventure", "identity"],
   vibes: ["human connection"],
 }, },
  { isDefault: true, title: "Spiritfarer", semantic: { contentTraits: ["afterlife","grief","human_connection"], toneTraits: ["gentle","melancholic","warm"], characterTraits: ["gentle_caretaker"], storyTraits: ["journey_of_grief_and_bonding","subtle_healing"], aversionTraits: ["sad_theme","slow_pacing"] }, author: "Thunder Lotus", genre: "Fantasy / Emotional", wikiTitle: "Spiritfarer", tags: ["audience:teen","age:mshs","media:game","fantasy","emotional growth","human connection","gentle","melancholic","warm"],tasteTraits: { warmth: 1, darkness: 0.82, pacing: -0.57, realism: -1, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["fantasy"],
   vibes: ["emotional growth", "human connection", "gentle", "melancholic", "warm"],
 }, },
  { isDefault: true, title: "Control", semantic: { contentTraits: ["constructed_reality","mystery","power"], toneTraits: ["weird","dark","mysterious"], characterTraits: ["conflicted_protagonist"], storyTraits: ["investigation","reality_questioning"], aversionTraits: ["strangeness","complexity"] }, author: "Remedy", genre: "Paranormal / Mystery", wikiTitle: "Control (video game)", tags: ["audience:teen","age:mshs","media:game","mystery","spooky","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.25, realism: -0.59, characterFocus: 0.0, ideaDensity: 0.34 }, 
 output: {
   genre: ["mystery"],
   vibes: ["spooky", "dark"],
 }, },
  { isDefault: true, title: "Ace Attorney", semantic: { contentTraits: ["crime_solving","investigation","deception"], toneTraits: ["clever","campy","playful"], characterTraits: ["resourceful_protagonist"], storyTraits: ["case_solving","twist_reveals"], aversionTraits: ["talkiness"] }, author: "Capcom", genre: "Mystery / Courtroom", wikiTitle: "Ace Attorney", tags: ["audience:teen","age:mshs","media:game","mystery","crime","playful"],tasteTraits: { warmth: 0.41, darkness: 0.32, pacing: 0.36, realism: -0.05, characterFocus: 0.0, ideaDensity: 0.41 }, 
 output: {
   genre: ["mystery", "crime"],
   vibes: ["playful"],
 }, },
  { isDefault: true, title: "Disco Elysium", semantic: { contentTraits: ["crime_solving","identity","political_intrigue"], toneTraits: ["darkly_funny","intellectual","melancholic"], characterTraits: ["damaged_detectives"], storyTraits: ["investigation","self_reclamation"], aversionTraits: ["talkiness","complex_themes"] }, author: "ZA/UM", genre: "Mystery / Psychological", wikiTitle: "Disco Elysium", tags: ["audience:teen","age:mshs","media:game","mystery","drama","identity","dark","crime","political","melancholic"],tasteTraits: { warmth: 0.16, darkness: 1, pacing: 0.18, realism: 0.02, characterFocus: 1, ideaDensity: 1 }, 
 output: {
   genre: ["mystery", "drama", "identity", "crime", "political"],
   vibes: ["dark", "melancholic"],
 }, },
  { isDefault: true, title: "The Legend of Zelda: Tears of the Kingdom", semantic: { contentTraits: ["adventure","magic","power_mastery"], toneTraits: ["awe","adventurous","grand"], characterTraits: ["silent_wanderer"], storyTraits: ["quest_journey","exploration_arc"], aversionTraits: ["worldbuilding_density"] }, author: "Nintendo", genre: "Fantasy / Adventure", wikiTitle: "The Legend of Zelda: Tears of the Kingdom", tags: ["audience:teen","age:mshs","media:game","fantasy","adventure","atmospheric"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.82, realism: -1, characterFocus: 0.0, ideaDensity: 0.02 }, 
 output: {
   genre: ["fantasy", "adventure"],
   vibes: ["atmospheric"],
 }, },
  { isDefault: true, title: "Slay the Spire", semantic: { contentTraits: ["magic","competition","power_mastery"], toneTraits: ["focused","smart","dark"], characterTraits: ["underestimated_protagonist"], storyTraits: ["battle_progression","power_awakening"], aversionTraits: ["repetition","difficulty"] }, author: "Mega Crit", genre: "Fantasy / Strategy", wikiTitle: "Slay the Spire", tags: ["audience:teen","age:mshs","media:game","fantasy","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.05, realism: -1, characterFocus: 0.0, ideaDensity: 0.0 }, 
 output: {
   genre: ["fantasy"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "Overwatch 2", semantic: { contentTraits: ["competition","superpowered_family","community"], toneTraits: ["energetic","fast","playful"], characterTraits: ["found_family_team"], storyTraits: ["team_building","competition_progression"], aversionTraits: ["overstimulating"] }, author: "Blizzard", genre: "Hero Shooter", wikiTitle: "Overwatch 2", tags: ["audience:teen","age:mshs","media:game","superheroes","community","energetic","fast-paced","playful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: -0.2, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["superheroes", "community"],
   vibes: ["energetic", "fast-paced", "playful"],
 }, },
  { isDefault: true, title: "Unpacking", semantic: { contentTraits: ["family","identity","human_connection"], toneTraits: ["gentle","quiet","warm"], characterTraits: ["sensitive_protagonist"], storyTraits: ["building_a_new_life","life_story_reveal"], aversionTraits: ["low_plot"] }, author: "Witch Beam", genre: "Cozy / Puzzle", wikiTitle: "Unpacking (video game)", tags: ["audience:teen","age:mshs","media:game","cozy","family","identity","human connection","gentle","warm"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -0.89, realism: -0.05, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["family", "identity"],
   vibes: ["cozy", "human connection", "gentle", "warm"],
 }, },
  { isDefault: true, title: "Animal Crossing: New Horizons", semantic: { contentTraits: ["community","friendship","family"], toneTraits: ["cozy","gentle","warm"], characterTraits: ["gentle_caretaker"], storyTraits: ["building_a_new_life","relationship_building"], aversionTraits: ["slow_pacing","low_conflict"] }, author: "Nintendo", genre: "Cozy / Simulation", wikiTitle: "Animal Crossing: New Horizons", tags: ["audience:teen","age:mshs","media:game","cozy","community","friendship","family","gentle","warm"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -1, realism: 0.14, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["community", "friendship", "family"],
   vibes: ["cozy", "gentle", "warm"],
 }, },
  { isDefault: true, title: "Splatoon 3", semantic: { contentTraits: ["competition","community","friendship"], toneTraits: ["energetic","playful","fast"], characterTraits: ["team_players"], storyTraits: ["competition_progression","team_building"], aversionTraits: ["overstimulating"] }, author: "Nintendo", genre: "Action / Competition", wikiTitle: "Splatoon 3", tags: ["audience:teen","age:mshs","media:game","fast-paced","community","friendship","energetic","playful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: 0.14, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["community", "friendship"],
   vibes: ["fast-paced", "energetic", "playful"],
 }, },
  { isDefault: true, title: "Night in the Woods", semantic: { contentTraits: ["small_town","identity","mental_health"], toneTraits: ["quirky","melancholic","thoughtful"], characterTraits: ["flawed_but_relatable"], storyTraits: ["coming_of_age","relationship_building"], aversionTraits: ["slow_pacing"] }, author: "Infinite Fall", genre: "Narrative / Mystery", wikiTitle: "Night in the Woods", tags: ["audience:teen","age:mshs","media:game","mystery","drama","identity","vulnerability","quirky","melancholic"],tasteTraits: { warmth: 0.11, darkness: 0.41, pacing: 0.11, realism: 0.02, characterFocus: 1, ideaDensity: 0.64 }, 
 output: {
   genre: ["mystery", "drama", "identity", "vulnerability"],
   vibes: ["quirky", "melancholic"],
 }, },
  { isDefault: true, title: "Sea of Stars", semantic: { contentTraits: ["adventure","friendship","destiny"], toneTraits: ["adventurous","warm","grand"], characterTraits: ["young_heroes"], storyTraits: ["quest_journey","team_growth"], aversionTraits: ["predictable_tropes"] }, author: "Sabotage Studio", genre: "Fantasy / Adventure", wikiTitle: "Sea of Stars", tags: ["audience:teen","age:mshs","media:game","fantasy","adventure","friendship","warm"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: 0.86, realism: -0.77, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["fantasy", "adventure", "friendship"],
   vibes: ["warm"],
 }, },
  { isDefault: true, title: "Hi-Fi Rush", semantic: { contentTraits: ["music_and_storytelling","rebellion","friendship"], toneTraits: ["playful","energetic","stylish"], characterTraits: ["lovable_misfits"], storyTraits: ["team_building","rebellion_against_society"], aversionTraits: ["overstimulating"] }, author: "Tango Gameworks", genre: "Action / Comedy", wikiTitle: "Hi-Fi Rush", tags: ["audience:teen","age:mshs","media:game","comedy","fast-paced","friendship","playful","energetic","atmospheric"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: -0.32, characterFocus: 1, ideaDensity: 0.27 }, 
 output: {
   genre: ["comedy", "friendship"],
   vibes: ["fast-paced", "playful", "energetic", "atmospheric"],
 }, },
  { isDefault: true, title: "Marvel's Guardians of the Galaxy", semantic: { contentTraits: ["found_family","space_politics","human_connection"], toneTraits: ["funny","adventurous","heartfelt"], characterTraits: ["leader_with_loyal_crew"], storyTraits: ["save_the_galaxy_arc","team_building"], aversionTraits: ["predictable_beats"] }, author: "Square Enix", genre: "Science Fiction / Adventure", wikiTitle: "Marvel's Guardians of the Galaxy", tags: ["audience:teen","age:mshs","media:game","science fiction","adventure","family","human connection","comedy"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.66, realism: -0.77, characterFocus: 1, ideaDensity: 0.32 }, 
 output: {
   genre: ["science fiction", "adventure", "family", "comedy"],
   vibes: ["human connection"],
 }, },
];

const CANON_MSHS_ANIME: any[] = [
  { isDefault: true, title: "Attack on Titan", semantic: { contentTraits: ["dystopian_society","survival","war"], toneTraits: ["grim","intense","dark"], characterTraits: ["young_leaders"], storyTraits: ["survival_story","truth_reveal"], aversionTraits: ["graphic_violence","hopelessness"] }, author: "Anime", genre: "Dystopian / Survival", wikiTitle: "Attack on Titan", tags: ["audience:teen","age:mshs","media:anime","dystopian","adventure","high stakes","survival","war & society","dark"],tasteTraits: { warmth: -0.16, darkness: 1, pacing: 1, realism: -0.09, characterFocus: 0.0, ideaDensity: 0.25 }, 
 output: {
   genre: ["dystopian", "adventure", "high stakes", "survival", "war & society"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "My Hero Academia", semantic: { contentTraits: ["superpowered_family","high_school","competition"], toneTraits: ["hopeful","energetic","inspiring"], characterTraits: ["determined_underdog"], storyTraits: ["training_arc","coming_into_power"], aversionTraits: ["younger_skew"] }, author: "Anime", genre: "Fantasy / Heroes", wikiTitle: "My Hero Academia", tags: ["audience:teen","age:mshs","media:anime","fantasy","adventure","superheroes","school","hopeful","energetic","uplifting"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: -1, characterFocus: 0.7, ideaDensity: 0.25 }, 
 output: {
   genre: ["fantasy", "adventure", "superheroes", "school"],
   vibes: ["hopeful", "energetic", "uplifting"],
 }, },
  { isDefault: true, title: "Demon Slayer: Kimetsu no Yaiba", semantic: { contentTraits: ["monster_hunting","family","training"], toneTraits: ["dramatic","emotional","adventurous"], characterTraits: ["resilient_protagonist"], storyTraits: ["quest_journey","battle_progression"], aversionTraits: ["violence","emotional_heaviness"] }, author: "Anime", genre: "Paranormal / Adventure", wikiTitle: "Demon Slayer: Kimetsu no Yaiba", tags: ["audience:teen","age:mshs","media:anime","adventure","spooky","family","emotional growth"],tasteTraits: { warmth: 0.7, darkness: 0.64, pacing: 0.68, realism: -0.84, characterFocus: 1, ideaDensity: 0.25 }, 
 output: {
   genre: ["adventure", "family"],
   vibes: ["spooky", "emotional growth"],
 }, },
  { isDefault: true, title: "Jujutsu Kaisen", semantic: { contentTraits: ["monsters","high_school","training"], toneTraits: ["dark","fast","funny"], characterTraits: ["young_heroes"], storyTraits: ["training_arc","battle_progression"], aversionTraits: ["violence","overstimulating"] }, author: "Anime", genre: "Paranormal / Horror", wikiTitle: "Jujutsu Kaisen", tags: ["audience:teen","age:mshs","media:anime","horror","spooky","school","dark","fast-paced","comedy"],tasteTraits: { warmth: 0.32, darkness: 1, pacing: 1, realism: -1, characterFocus: 0.0, ideaDensity: 0.5 }, 
 output: {
   genre: ["horror", "school", "comedy"],
   vibes: ["spooky", "dark", "fast-paced"],
 }, },
  { isDefault: true, title: "Fullmetal Alchemist: Brotherhood", semantic: { contentTraits: ["family","artificial_life","political_intrigue"], toneTraits: ["dramatic","adventurous","emotional"], characterTraits: ["loyal_siblings"], storyTraits: ["quest_journey","truth_discovery"], aversionTraits: ["violence","complex_themes"] }, author: "Anime", genre: "Fantasy / Adventure", wikiTitle: "Fullmetal Alchemist: Brotherhood", tags: ["audience:teen","age:mshs","media:anime","fantasy","adventure","family","robots","political","emotional growth"],tasteTraits: { warmth: 0.7, darkness: 0.0, pacing: 0.68, realism: -0.95, characterFocus: 1, ideaDensity: 0.55 }, 
 output: {
   genre: ["fantasy", "adventure", "family", "robots", "political"],
   vibes: ["emotional growth"],
 }, },
  { isDefault: true, title: "Code Geass", semantic: { contentTraits: ["war","rebellion","deception"], toneTraits: ["intense","smart"], characterTraits: ["antihero_lead"], storyTraits: ["resistance_story","power_struggle"], aversionTraits: ["moral_ambiguity"] }, author: "Anime", genre: "Science Fiction / Dystopian", wikiTitle: "Code Geass", tags: ["audience:teen","age:mshs","media:anime","science fiction","dystopian","war & society"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.55, realism: -0.82, characterFocus: 0.0, ideaDensity: 0.57 }, 
 output: {
   genre: ["science fiction", "dystopian", "war & society"],
   vibes: [],
 }, },
  { isDefault: true, title: "Death Note", semantic: { contentTraits: ["power","crime","deception"], toneTraits: ["dark","tense"], characterTraits: ["obsessive_rivals"], storyTraits: ["cat_and_mouse","choice_and_consequence"], aversionTraits: ["heavy_themes"] }, author: "Anime", genre: "Mystery / Suspense", wikiTitle: "Death Note", tags: ["audience:teen","age:mshs","media:anime","mystery","thriller","crime","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.61, realism: -0.09, characterFocus: 0.0, ideaDensity: 0.41 }, 
 output: {
   genre: ["mystery", "thriller", "crime"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "Hunter × Hunter", semantic: { contentTraits: ["adventure","competition"], toneTraits: ["adventurous"], characterTraits: ["optimistic_protagonist","unlikely_allies"], storyTraits: ["training_arc","coming_into_power"], aversionTraits: ["strangeness"] }, author: "Anime", genre: "Adventure / Fantasy", wikiTitle: "Hunter × Hunter", tags: ["audience:teen","age:mshs","media:anime","adventure","fantasy"],tasteTraits: { warmth: 0.0, darkness: 0.0, pacing: 0.89, realism: -1, characterFocus: 0.0, ideaDensity: 0.25 }, 
 output: {
   genre: ["adventure", "fantasy"],
   vibes: [],
 }, },
  { isDefault: true, title: "Spy × Family", semantic: { contentTraits: ["undercover_policing","found_family","family_secrets"], toneTraits: ["light","funny","warm"], characterTraits: ["unlikely_allies","found_family_team"], storyTraits: ["case_of_the_week","relationship_building"], aversionTraits: ["low_plot"] }, author: "Anime", genre: "Adventure / Humor", wikiTitle: "Spy × Family", tags: ["audience:teen","age:mshs","media:anime","adventure","playful","family","comedy","warm"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: 0.57, realism: -0.09, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["adventure", "family", "comedy"],
   vibes: ["playful", "warm"],
 }, },
  { isDefault: true, title: "Cowboy Bebop", semantic: { contentTraits: ["crime","grief"], toneTraits: ["stylish","melancholic"], characterTraits: ["lovable_misfits"], storyTraits: ["case_based","hidden_past_reveal"], aversionTraits: ["slow_pacing"] }, author: "Anime", genre: "Science Fiction / Adventure", wikiTitle: "Cowboy Bebop", tags: ["audience:teen","age:mshs","media:anime","science fiction","adventure","crime","emotional growth","atmospheric","melancholic"],tasteTraits: { warmth: 0.2, darkness: 0.73, pacing: 0.43, realism: -0.82, characterFocus: 0.2, ideaDensity: 0.52 }, 
 output: {
   genre: ["science fiction", "adventure", "crime"],
   vibes: ["emotional growth", "atmospheric", "melancholic"],
 }, },
  { isDefault: true, title: "Steins;Gate", semantic: { contentTraits: ["time_travel","science_problem_solving","friendship"], toneTraits: ["thoughtful","tense","weird"], characterTraits: ["eccentric_genius"], storyTraits: ["time_loop_puzzle","truth_reveal"], aversionTraits: ["slow_burn","complexity"] }, author: "Anime", genre: "Science Fiction / Mystery", wikiTitle: "Steins;Gate", tags: ["audience:teen","age:mshs","media:anime","science fiction","mystery","time travel","friendship","identity"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.34, realism: -1, characterFocus: 1, ideaDensity: 1 }, 
 output: {
   genre: ["science fiction", "mystery", "time travel", "friendship", "identity"],
   vibes: [],
 }, },
  { isDefault: true, title: "Tokyo Ghoul", semantic: { contentTraits: ["monsters","identity","survival"], toneTraits: ["dark","brooding","tragic"], characterTraits: ["outsider_protagonist"], storyTraits: ["identity_fragmentation","survival_story"], aversionTraits: ["graphic_violence","body_horror"] }, author: "Anime", genre: "Horror / Paranormal", wikiTitle: "Tokyo Ghoul", tags: ["audience:teen","age:mshs","media:anime","horror","spooky","identity","survival","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.61, realism: -0.98, characterFocus: 1, ideaDensity: 0.61 }, 
 output: {
   genre: ["horror", "identity", "survival"],
   vibes: ["spooky", "dark"],
 }, },
  { isDefault: true, title: "Sword Art Online", semantic: { contentTraits: ["virtual_world","survival_game","romance"], toneTraits: ["fast","dramatic","adventurous"], characterTraits: ["eager_hero"], storyTraits: ["survival_story","quest_structure"], aversionTraits: ["predictable_tropes"] }, author: "Anime", genre: "Science Fiction / Adventure", wikiTitle: "Sword Art Online", tags: ["audience:teen","age:mshs","media:anime","science fiction","adventure","survival","romance","fast-paced"],tasteTraits: { warmth: 0.41, darkness: 0.0, pacing: 1, realism: -0.75, characterFocus: 1, ideaDensity: 0.32 }, 
 output: {
   genre: ["science fiction", "adventure", "survival", "romance"],
   vibes: ["fast-paced"],
 }, },
  { isDefault: true, title: "Bleach", semantic: { contentTraits: ["monsters","high_school","power"], toneTraits: ["stylish","fast","adventurous"], characterTraits: ["reluctant_hero"], storyTraits: ["coming_into_power","battle_progression"], aversionTraits: ["repetition"] }, author: "Anime", genre: "Paranormal / Adventure", wikiTitle: "Bleach (TV series)", tags: ["audience:teen","age:mshs","media:anime","adventure","spooky","school","atmospheric","fast-paced"],tasteTraits: { warmth: 0.0, darkness: 0.82, pacing: 1, realism: -0.57, characterFocus: 0.0, ideaDensity: 0.02 }, 
 output: {
   genre: ["adventure", "school"],
   vibes: ["spooky", "atmospheric", "fast-paced"],
 }, },
  { isDefault: true, title: "Naruto", semantic: { contentTraits: ["training","friendship","outsider_identity"], toneTraits: ["hopeful","energetic","fun"], characterTraits: ["determined_underdog"], storyTraits: ["training_arc","coming_of_age"], aversionTraits: ["repetition"] }, author: "Anime", genre: "Adventure / Fantasy", wikiTitle: "Naruto", tags: ["audience:teen","age:mshs","media:anime","adventure","fantasy","friendship","outsider","hopeful","energetic","playful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: -1, characterFocus: 1, ideaDensity: 0.7 }, 
 output: {
   genre: ["adventure", "fantasy", "friendship", "outsider"],
   vibes: ["hopeful", "energetic", "playful"],
 }, },
  { isDefault: true, title: "One Piece", semantic: { contentTraits: ["pirate_adventure","friendship","treasure_hunt"], toneTraits: ["fun","adventurous","playful"], characterTraits: ["optimistic_leader"], storyTraits: ["island_quests","team_building"], aversionTraits: ["length"] }, author: "Anime", genre: "Adventure / Fantasy", wikiTitle: "One Piece", tags: ["audience:teen","age:mshs","media:anime","adventure","fantasy","friendship","treasure","playful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: -0.82, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["adventure", "fantasy", "friendship", "treasure"],
   vibes: ["playful"],
 }, },
  { isDefault: true, title: "Haikyu!!", semantic: { contentTraits: ["sports_team","competition","friendship"], toneTraits: ["energetic","hopeful","fun"], characterTraits: ["young_athletes"], storyTraits: ["competition_progression","team_growth"], aversionTraits: ["sports_focus"] }, author: "Anime", genre: "Sports", wikiTitle: "Haikyu!!", tags: ["audience:teen","age:mshs","media:anime","energetic","community","friendship","hopeful","playful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: 0.23, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["community", "friendship"],
   vibes: ["energetic", "hopeful", "playful"],
 }, },
  { isDefault: true, title: "Chainsaw Man", semantic: { contentTraits: ["monsters","power","survival"], toneTraits: ["darkly_funny","fast","dark"], characterTraits: ["antihero_lead"], storyTraits: ["power_unleashed","survival_story"], aversionTraits: ["graphic_violence","disturbing_content"] }, author: "Anime", genre: "Horror / Paranormal", wikiTitle: "Chainsaw Man", tags: ["audience:teen","age:mshs","media:anime","horror","spooky","survival","fast-paced","dark"],tasteTraits: { warmth: 0.16, darkness: 1, pacing: 1, realism: -0.98, characterFocus: 0.0, ideaDensity: 0.0 }, 
 output: {
   genre: ["horror", "survival"],
   vibes: ["spooky", "fast-paced", "dark"],
 }, },
  { isDefault: true, title: "Mob Psycho 100", semantic: { contentTraits: ["power","identity","mentorship"], toneTraits: ["funny","heartfelt","weird"], characterTraits: ["overwhelmed_protagonist"], storyTraits: ["self_realization","coming_into_power"], aversionTraits: ["younger_skew"] }, author: "Anime", genre: "Paranormal / Humor", wikiTitle: "Mob Psycho 100", tags: ["audience:teen","age:mshs","media:anime","playful","spooky","identity","comedy"],tasteTraits: { warmth: 0.84, darkness: 0.48, pacing: 0.16, realism: -0.64, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["identity", "comedy"],
   vibes: ["playful", "spooky"],
 }, },
  { isDefault: true, title: "Neon Genesis Evangelion", semantic: { contentTraits: ["apocalypse","artificial_life","trauma"], toneTraits: ["dark","brooding","philosophical"], characterTraits: ["traumatized_protagonists"], storyTraits: ["psychological_unraveling","fate_vs_choice"], aversionTraits: ["bleakness","complex_themes"] }, author: "Anime", genre: "Science Fiction / Psychological", wikiTitle: "Neon Genesis Evangelion", tags: ["audience:teen","age:mshs","media:anime","science fiction","dystopian","dark","robots"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.07, realism: -1, characterFocus: 0.0, ideaDensity: 0.32 }, 
 output: {
   genre: ["science fiction", "dystopian", "robots"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "Psycho-Pass", semantic: { contentTraits: ["dystopian_society","crime","surveillance"], toneTraits: ["dark","serious","intense"], characterTraits: ["morally_conflicted"], storyTraits: ["investigation_of_systemic_coverup","ideological_conflict"], aversionTraits: ["violence","complex_plotting"] }, author: "Anime", genre: "Dystopian / Mystery", wikiTitle: "Psycho-Pass", tags: ["audience:teen","age:mshs","media:anime","dystopian","mystery","crime","dark","drama"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.68, realism: -0.02, characterFocus: 0.16, ideaDensity: 0.66 }, 
 output: {
   genre: ["dystopian", "mystery", "crime", "drama"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "Blue Lock", semantic: { contentTraits: ["competition","sports_team","ambition"], toneTraits: ["intense","fast","dramatic"], characterTraits: ["obsessive_rivals"], storyTraits: ["competition_progression","power_ascent"], aversionTraits: ["sports_focus"] }, author: "Anime", genre: "Sports", wikiTitle: "Blue Lock", tags: ["audience:teen","age:mshs","media:anime","energetic","community","fast-paced"],tasteTraits: { warmth: 0.5, darkness: 0.0, pacing: 1, realism: 0.3, characterFocus: 0.43, ideaDensity: 0.0 }, 
 output: {
   genre: ["community"],
   vibes: ["energetic", "fast-paced"],
 }, },
  { isDefault: true, title: "Vinland Saga", semantic: { contentTraits: ["war","revenge","survival"], toneTraits: ["grim","serious","epic"], characterTraits: ["rage_driven_protagonist"], storyTraits: ["revenge_cycle","survival_journey"], aversionTraits: ["graphic_violence","bleakness"] }, author: "Anime", genre: "Historical / Adventure", wikiTitle: "Vinland Saga", tags: ["audience:teen","age:mshs","media:anime","historical","adventure","war & society","survival","drama","epic"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 1, realism: 1, characterFocus: 0.16, ideaDensity: 0.25 }, 
 output: {
   genre: ["historical", "adventure", "war & society", "survival", "drama"],
   vibes: ["epic"],
 }, },
  { isDefault: true, title: "Your Name", semantic: { contentTraits: ["romance","time_travel","identity"], toneTraits: ["romantic","dreamlike","emotional"], characterTraits: ["thoughtful_teens"], storyTraits: ["love_story","identity_discovery"], aversionTraits: ["melodrama"] }, author: "Anime", genre: "Romance / Fantasy", wikiTitle: "Your Name", tags: ["audience:teen","age:mshs","media:anime","romance","fantasy","time travel","identity","emotional growth"],tasteTraits: { warmth: 0.82, darkness: 0.0, pacing: 0.0, realism: -1, characterFocus: 1, ideaDensity: 1 }, 
 output: {
   genre: ["romance", "fantasy", "time travel", "identity"],
   vibes: ["emotional growth"],
 }, },
  { isDefault: true, title: "The Promised Neverland", semantic: { contentTraits: ["child_endangerment","mystery","survival"], toneTraits: ["tense","smart","dark"], characterTraits: ["gifted_outcasts"], storyTraits: ["escape_and_pursuit","truth_discovery"], aversionTraits: ["high_tension","child_endangerment"] }, author: "Anime", genre: "Mystery / Horror", wikiTitle: "The Promised Neverland", tags: ["audience:teen","age:mshs","media:anime","mystery","horror","survival","dark"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.84, realism: -0.09, characterFocus: 0.0, ideaDensity: 0.34 }, 
 output: {
   genre: ["mystery", "horror", "survival"],
   vibes: ["dark"],
 }, },
  { isDefault: true, title: "Your Lie in April", semantic: { contentTraits: ["music_and_storytelling","romance","grief"], toneTraits: ["emotional","bittersweet","tender"], characterTraits: ["wounded_protagonist"], storyTraits: ["love_story","subtle_healing"], aversionTraits: ["sad_theme"] }, author: "Anime", genre: "Romance / Drama", wikiTitle: "Your Lie in April", tags: ["audience:teen","age:mshs","media:anime","romance","drama","coming of age","emotional growth","warm"],tasteTraits: { warmth: 1, darkness: 0.2, pacing: 0.07, realism: 0.05, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["romance", "drama"],
   vibes: ["coming of age", "emotional growth", "warm"],
 }, },
  { isDefault: true, title: "Kuroko's Basketball", semantic: { contentTraits: ["sports_team","competition","friendship"], toneTraits: ["energetic","hopeful","dramatic"], characterTraits: ["young_athletes"], storyTraits: ["competition_progression","team_growth"], aversionTraits: ["sports_focus"] }, author: "Anime", genre: "Sports", wikiTitle: "Kuroko's Basketball", tags: ["audience:teen","age:mshs","media:anime","energetic","community","friendship","hopeful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: 0.3, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["community", "friendship"],
   vibes: ["energetic", "hopeful"],
 }, },
  { isDefault: true, title: "Dr. Stone", semantic: { contentTraits: ["science_problem_solving","post_apocalypse","community"], toneTraits: ["smart","playful","hopeful"], characterTraits: ["eccentric_genius"], storyTraits: ["society_building","quest_for_knowledge"], aversionTraits: ["technical_details"] }, author: "Anime", genre: "Science Fiction / Adventure", wikiTitle: "Dr. Stone", tags: ["audience:teen","age:mshs","media:anime","science fiction","adventure","friendship","community","playful","hopeful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 0.66, realism: -0.64, characterFocus: 1, ideaDensity: 0.32 }, 
 output: {
   genre: ["science fiction", "adventure", "friendship", "community"],
   vibes: ["playful", "hopeful"],
 }, },
  { isDefault: true, title: "Moriarty the Patriot", semantic: { contentTraits: ["crime","political_intrigue","revenge"], toneTraits: ["dark","smart","stylish"], characterTraits: ["antihero_lead"], storyTraits: ["strategic_conflict","cat_and_mouse"], aversionTraits: ["moral_ambiguity"] }, author: "Anime", genre: "Mystery / Historical", wikiTitle: "Moriarty the Patriot", tags: ["audience:teen","age:mshs","media:anime","mystery","historical","crime","political","dark","atmospheric"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.16, realism: 0.95, characterFocus: 0.0, ideaDensity: 0.98 }, 
 output: {
   genre: ["mystery", "historical", "crime", "political"],
   vibes: ["dark", "atmospheric"],
 }, },
  { isDefault: true, title: "Frieren: Beyond Journey's End", semantic: { contentTraits: ["friendship","grief","magic"], toneTraits: ["gentle","melancholic","thoughtful"], characterTraits: ["enigmatic_protagonist"], storyTraits: ["journey_of_grief_and_bonding","subtle_healing"], aversionTraits: ["slow_pacing"] }, author: "Anime", genre: "Fantasy / Adventure", wikiTitle: "Frieren", tags: ["audience:teen","age:mshs","media:anime","fantasy","adventure","friendship","emotional growth","gentle","melancholic","identity"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: -0.0, realism: -1, characterFocus: 1, ideaDensity: 0.2 }, 
 output: {
   genre: ["fantasy", "adventure", "friendship", "identity"],
   vibes: ["emotional growth", "gentle", "melancholic"],
 }, },
  { isDefault: true, title: "Horimiya", semantic: { contentTraits: ["romance","high_school","friendship"], toneTraits: ["warm","funny","tender"], characterTraits: ["kindhearted_teens"], storyTraits: ["relationship_building","coming_of_age"], aversionTraits: ["low_conflict"] }, author: "Anime", genre: "Romance / Coming-of-Age", wikiTitle: "Horimiya", tags: ["audience:teen","age:mshs","media:anime","romance","drama","coming of age","school","friendship","warm","comedy"],tasteTraits: { warmth: 1, darkness: 0.41, pacing: 0.07, realism: 0.39, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["romance", "drama", "school", "friendship", "comedy"],
   vibes: ["coming of age", "warm"],
 }, },
  { isDefault: true, title: "Erased", semantic: { contentTraits: ["time_travel","child_protection","murder_mystery"], toneTraits: ["tense","emotional","mysterious"], characterTraits: ["caregiver_protagonist"], storyTraits: ["time_loop_puzzle","investigation"], aversionTraits: ["heavy_themes"] }, author: "Anime", genre: "Mystery / Suspense", wikiTitle: "Erased", tags: ["audience:teen","age:mshs","media:anime","mystery","thriller","time travel","emotional growth"],tasteTraits: { warmth: 0.2, darkness: 0.2, pacing: 0.68, realism: -0.68, characterFocus: 0.0, ideaDensity: 0.8 }, 
 output: {
   genre: ["mystery", "thriller", "time travel"],
   vibes: ["emotional growth"],
 }, },
  { isDefault: true, title: "Bungo Stray Dogs", semantic: { contentTraits: ["crime","found_family","power"], toneTraits: ["stylish","funny","dark"], characterTraits: ["gifted_outcasts"], storyTraits: ["case_based","team_growth"], aversionTraits: ["overstimulating"] }, author: "Anime", genre: "Mystery / Supernatural", wikiTitle: "Bungo Stray Dogs", tags: ["audience:teen","age:mshs","media:anime","mystery","crime","family","atmospheric","comedy","dark"],tasteTraits: { warmth: 0.82, darkness: 1, pacing: 0.16, realism: -0.09, characterFocus: 1, ideaDensity: 0.43 }, 
 output: {
   genre: ["mystery", "crime", "family", "comedy"],
   vibes: ["atmospheric", "dark"],
 }, },
  { isDefault: true, title: "Assassination Classroom", semantic: { contentTraits: ["education","found_family","mentorship"], toneTraits: ["funny","heartfelt","energetic"], characterTraits: ["searching_students"], storyTraits: ["training_arc","emotional_growth_arc"], aversionTraits: ["younger_skew"] }, author: "Anime", genre: "Comedy / Action", wikiTitle: "Assassination Classroom", tags: ["audience:teen","age:mshs","media:anime","comedy","fast-paced","school","family","energetic"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: -0.16, characterFocus: 1, ideaDensity: 0.25 }, 
 output: {
   genre: ["comedy", "school", "family"],
   vibes: ["fast-paced", "energetic"],
 }, },
  { isDefault: true, title: "Natsume's Book of Friends", semantic: { contentTraits: ["ghost_stories","identity","friendship"], toneTraits: ["gentle","melancholic","warm"], characterTraits: ["sensitive_protagonist"], storyTraits: ["case_based","subtle_healing"], aversionTraits: ["slow_pacing"] }, author: "Anime", genre: "Paranormal / Drama", wikiTitle: "Natsume's Book of Friends", tags: ["audience:teen","age:mshs","media:anime","drama","identity","spooky","friendship","gentle","melancholic","warm"],tasteTraits: { warmth: 1, darkness: 1, pacing: -0.34, realism: -0.5, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["drama", "identity", "friendship"],
   vibes: ["spooky", "gentle", "melancholic", "warm"],
 }, },
  { isDefault: true, title: "Black Clover", semantic: { contentTraits: ["magic","competition","outsider_identity"], toneTraits: ["energetic","hopeful","fun"], characterTraits: ["determined_underdog"], storyTraits: ["training_arc","coming_into_power"], aversionTraits: ["repetition"] }, author: "Anime", genre: "Fantasy / Adventure", wikiTitle: "Black Clover", tags: ["audience:teen","age:mshs","media:anime","fantasy","adventure","outsider","energetic","hopeful","playful"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: -1, characterFocus: 0.52, ideaDensity: 0.45 }, 
 output: {
   genre: ["fantasy", "adventure", "outsider"],
   vibes: ["energetic", "hopeful", "playful"],
 }, },
  { isDefault: true, title: "Sk8 the Infinity", semantic: { contentTraits: ["competition","friendship","community"], toneTraits: ["fast","playful","funny"], characterTraits: ["young_athletes"], storyTraits: ["competition_progression","friendship_growth"], aversionTraits: ["sports_focus"] }, author: "Anime", genre: "Sports / Action", wikiTitle: "SK8 the Infinity", tags: ["audience:teen","age:mshs","media:anime","playful","energetic","fast-paced","friendship","community","comedy"],tasteTraits: { warmth: 1, darkness: 0.0, pacing: 1, realism: 0.2, characterFocus: 1, ideaDensity: 0.0 }, 
 output: {
   genre: ["friendship", "community", "comedy"],
   vibes: ["playful", "energetic", "fast-paced"],
 }, },
  { isDefault: true, title: "A Silent Voice", semantic: { contentTraits: ["bullying","grief","friendship"], toneTraits: ["quiet","emotional","tender"], characterTraits: ["wounded_protagonist"], storyTraits: ["subtle_healing","self_reclamation"], aversionTraits: ["heavy_themes"] }, author: "Anime", genre: "Drama / Coming-of-Age", wikiTitle: "A Silent Voice (film)", tags: ["audience:teen","age:mshs","media:anime","drama","identity","friendship","coming of age","emotional growth","warm"],tasteTraits: { warmth: 1, darkness: 0.2, pacing: -0.14, realism: 0.05, characterFocus: 1, ideaDensity: 0.2 }, 
 output: {
   genre: ["drama", "identity", "friendship"],
   vibes: ["coming of age", "emotional growth", "warm"],
 }, },
  { isDefault: true, title: "86", semantic: { contentTraits: ["war","racism","survival"], toneTraits: ["grim","dramatic","serious"], characterTraits: ["young_leaders"], storyTraits: ["war_escalation","survival_story"], aversionTraits: ["war_cruelty","bleakness"] }, author: "Anime", genre: "Science Fiction / Dystopian", wikiTitle: "86 (novel series)", tags: ["audience:teen","age:mshs","media:anime","science fiction","dystopian","war & society","systemic injustice","survival","drama"],tasteTraits: { warmth: 0.0, darkness: 1, pacing: 0.61, realism: -0.68, characterFocus: 0.32, ideaDensity: 0.91 }, 
 output: {
   genre: ["science fiction", "dystopian", "war & society", "systemic injustice", "survival", "drama"],
   vibes: [],
 }, },
  { isDefault: true, title: "Noragami", semantic: { contentTraits: ["mythology","friendship","outsider_identity"], toneTraits: ["funny","adventurous","heartfelt"], characterTraits: ["lovable_misfits"], storyTraits: ["case_based","relationship_building"], aversionTraits: ["younger_skew"] }, author: "Anime", genre: "Paranormal / Adventure", wikiTitle: "Noragami", tags: ["audience:teen","age:mshs","media:anime","adventure","identity","spooky","mythology","friendship","outsider","comedy"],tasteTraits: { warmth: 1, darkness: 0.48, pacing: 0.68, realism: -1, characterFocus: 1, ideaDensity: 0.41 }, 
 output: {
   genre: ["adventure", "identity", "mythology", "friendship", "outsider", "comedy"],
   vibes: ["spooky"],
 }, },
];

const msHsDeck: SwipeDeck = {
  deckKey: "ms_hs",
  deckLabel: "Teens School",
  version: 2,
  rules: {
    targetSwipesBeforeRecommend: 12,
    allowUpToSwipesBeforeRecommend: 15,
    shuffle: "true_random_each_session",
  },
  cards: [
    // Books
    ...CANON_MSHS_BOOKS,
    ...CANON_MSHS_TV,
    ...CANON_MSHS_MOVIES,
    ...CANON_MSHS_GAMES,
    ...CANON_MSHS_ANIME,
  ].map((card: any) => {
    const tags = Array.isArray(card?.tags) ? [...card.tags] : [];
    const hasComicVineUsefulTag = tags.some((tag: string) =>
      /^(publisher:|source_universe:|facet:|format:graphic_novel)/i.test(String(tag || ""))
    );
    if (!hasComicVineUsefulTag) tags.push("facet:indie_genre");
    return {
      ...card,
      tags: Array.from(new Set(tags)),
      graphicNovelKeywords: inferMsHsGraphicNovelKeywords(card),
    };
  }),
};

export default msHsDeck;
