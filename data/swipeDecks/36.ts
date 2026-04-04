export const deck36 = {
  deckKey: "36",
  deckLabel: "Pre-Teens",
  version: 4,
  rules: {
    targetSwipesBeforeRecommend: 12,
    allowUpToSwipesBeforeRecommend: 15,
    shuffle: "true_random_each_session",
  },
  cards: [
    {
      id: "36_book_hp1",
      title: "Harry Potter and the Sorcerer's Stone",
      author: "J.K. Rowling",
      semantic: {
        contentTraits: ["friendship", "magic", "magic_school", "chosen_one"],
        toneTraits: ["fun", "wonder_filled", "adventurous"],
        characterTraits: ["young_wizards", "outsider_kids"],
        storyTraits: ["journey_beginning", "mystery_unfolding", "coming_into_power"],
        aversionTraits: ["fantasy_density"],
      },
      tags: ["fantasy", "friendship", "adventure", "mystery", "series"],

      output: {

        genre: ["fantasy", "friendship", "adventure", "mystery"],

        vibes: [],

      },
    },
    {
      id: "36_book_hp2",
      title: "Harry Potter and the Chamber of Secrets",
      author: "J.K. Rowling",
      semantic: {
        contentTraits: ["friendship", "magic", "magic_school", "mystery"],
        toneTraits: ["fun", "mysterious", "spooky"],
        characterTraits: ["young_wizards", "loyal_friends"],
        storyTraits: ["mystery_unfolding", "truth_discovery", "journey"],
        aversionTraits: ["monster_threat"],
      },
      tags: ["fantasy", "friendship", "mystery", "spooky", "series"],

      output: {

        genre: ["fantasy", "friendship", "mystery"],

        vibes: ["spooky"],

      },
    },
    {
      id: "36_book_percy1",
      title: "The Lightning Thief",
      author: "Rick Riordan",
      semantic: {
        contentTraits: ["friendship", "demigods", "greek_mythology", "adventure"],
        toneTraits: ["fun", "adventurous", "witty"],
        characterTraits: ["young_heroes", "outsider_protagonist"],
        storyTraits: ["quest_journey", "identity_discovery", "journey_beginning"],
        aversionTraits: ["action_emphasis"],
      },
      tags: ["fantasy", "mythology", "friendship", "adventure", "series"],

      output: {

        genre: ["fantasy", "mythology", "friendship", "adventure"],

        vibes: [],

      },
    },
    {
      id: "36_book_percy2",
      title: "The Sea of Monsters",
      author: "Rick Riordan",
      semantic: {
        contentTraits: ["friendship", "demigods", "greek_mythology", "monsters"],
        toneTraits: ["fun", "adventurous", "witty"],
        characterTraits: ["young_heroes", "loyal_companions"],
        storyTraits: ["quest_journey", "rescue_mission", "team_growth"],
        aversionTraits: ["action_emphasis"],
      },
      tags: ["fantasy", "mythology", "adventure", "friendship", "series"],

      output: {

        genre: ["fantasy", "mythology", "adventure", "friendship"],

        vibes: [],

      },
    },
    {
      id: "36_book_wimpy",
      title: "Diary of a Wimpy Kid",
      author: "Jeff Kinney",
      semantic: {
        contentTraits: ["coming_of_age", "friendship", "education"],
        toneTraits: ["funny", "playful", "quirky"],
        characterTraits: ["immature_protagonist", "underdog_student"],
        storyTraits: ["coming_of_age", "emotional_growth", "life_choices"],
        aversionTraits: ["cringe_moments", "low_stakes"],
      },
      tags: ["comedy", "school", "friendship", "coming of age", "illustrated", "series"],

      output: {

        genre: ["comedy", "school", "friendship", "illustrated"],

        vibes: ["coming of age"],

      },
    },
    {
      id: "36_book_dogman",
      title: "Dog Man",
      author: "Dav Pilkey",
      semantic: {
        contentTraits: ["friendship", "crime_solving", "community"],
        toneTraits: ["funny", "absurd", "playful"],
        characterTraits: ["unlikely_hero", "lovable_misfits"],
        storyTraits: ["case_solving", "friendship_growth", "problem_solving"],
        aversionTraits: ["goofy_tone", "younger_skew"],
      },
      tags: ["comedy", "graphic novel", "friendship", "heroic", "playful", "series"],

      output: {

        genre: ["comedy", "graphic novel", "friendship", "heroic"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_book_captain",
      title: "Captain Underpants",
      author: "Dav Pilkey",
      semantic: {
        contentTraits: ["friendship", "education", "community"],
        toneTraits: ["funny", "absurd", "playful"],
        characterTraits: ["young_heroes", "loyal_friends"],
        storyTraits: ["problem_solving", "team_up", "chaos_to_connection"],
        aversionTraits: ["goofy_tone", "younger_skew"],
      },
      tags: ["comedy", "school", "graphic novel", "friendship", "playful", "series"],

      output: {

        genre: ["comedy", "school", "graphic novel", "friendship"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_book_wonder",
      title: "Wonder",
      author: "R.J. Palacio",
      semantic: {
        contentTraits: ["friendship", "coming_of_age", "bullying", "family"],
        toneTraits: ["heartfelt", "hopeful", "warm"],
        characterTraits: ["sensitive_protagonist", "kindhearted_teens"],
        storyTraits: ["emotional_growth", "self_acceptance", "relationship_building"],
        aversionTraits: ["emotional_pain"],
      },
      tags: ["realistic", "friendship", "family", "kindness", "emotional growth", "school"],

      output: {

        genre: ["realistic", "friendship", "family", "kindness", "school"],

        vibes: ["emotional growth"],

      },
    },
    {
      id: "36_book_holes",
      title: "Holes",
      author: "Louis Sachar",
      semantic: {
        contentTraits: ["friendship", "mystery", "family_secrets", "survival"],
        toneTraits: ["quirky", "mysterious", "clever"],
        characterTraits: ["underdog_student", "loyal_friends"],
        storyTraits: ["mystery_unfolding", "truth_discovery", "endurance_under_injustice"],
        aversionTraits: ["slow_pacing"],
      },
      tags: ["mystery", "friendship", "adventure", "quirky", "realistic"],

      output: {

        genre: ["mystery", "friendship", "adventure", "realistic"],

        vibes: ["quirky"],

      },
    },
    {
      id: "36_book_matilda",
      title: "Matilda",
      author: "Roald Dahl",
      semantic: {
        contentTraits: ["giftedness", "family_conflict", "magic", "education"],
        toneTraits: ["whimsical", "funny", "clever"],
        characterTraits: ["gifted_protagonist", "outsider_kids"],
        storyTraits: ["power_awakening", "self_reclamation", "problem_solving"],
        aversionTraits: ["child_endangerment"],
      },
      tags: ["fantasy", "school", "comedy", "outsider", "playful"],

      output: {

        genre: ["fantasy", "school", "comedy", "outsider"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_book_bfg",
      title: "The BFG",
      author: "Roald Dahl",
      semantic: {
        contentTraits: ["friendship", "dream_world", "adventure"],
        toneTraits: ["whimsical", "fun", "warm"],
        characterTraits: ["brave_child", "gentle_caretaker"],
        storyTraits: ["quest_journey", "unlikely_friendship_under_pressure", "rescue_plot"],
        aversionTraits: ["younger_skew"],
      },
      tags: ["fantasy", "friendship", "adventure", "whimsical", "gentle"],

      output: {

        genre: ["fantasy", "friendship", "adventure"],

        vibes: ["whimsical", "gentle"],

      },
    },
    {
      id: "36_book_charlie",
      title: "Charlie and the Chocolate Factory",
      author: "Roald Dahl",
      semantic: {
        contentTraits: ["family", "adventure", "community"],
        toneTraits: ["whimsical", "funny", "darkly_funny"],
        characterTraits: ["innocent_child", "eccentric_genius"],
        storyTraits: ["journey", "tests_of_courage", "truth_discovery"],
        aversionTraits: ["goofy_tone"],
      },
      tags: ["fantasy", "family", "comedy", "whimsical", "adventure"],

      output: {

        genre: ["fantasy", "family", "comedy", "adventure"],

        vibes: ["whimsical"],

      },
    },
    {
      id: "36_book_narnia",
      title: "The Lion, the Witch and the Wardrobe",
      author: "C.S. Lewis",
      semantic: {
        contentTraits: ["adventure", "royalty", "magic", "chosen_one"],
        toneTraits: ["wonder_filled", "adventurous", "epic"],
        characterTraits: ["young_heroes", "loyal_siblings"],
        storyTraits: ["save_the_land_quest", "quest_journey", "journey_beginning"],
        aversionTraits: ["fantasy_density"],
      },
      tags: ["fantasy", "adventure", "heroic", "family", "series"],

      output: {

        genre: ["fantasy", "adventure", "heroic", "family"],

        vibes: [],

      },
    },
    {
      id: "36_book_among_hidden",
      title: "Among the Hidden",
      author: "Margaret Peterson Haddix",
      semantic: {
        contentTraits: ["dystopian_society", "political_control", "outsider_identity", "friendship"],
        toneTraits: ["tense", "thoughtful", "quiet"],
        characterTraits: ["outsider_protagonist", "vulnerable_child"],
        storyTraits: ["identity_discovery", "escape", "truth_discovery"],
        aversionTraits: ["heavier_tone"],
      },
      tags: ["dystopian", "friendship", "outsider", "high stakes", "science fiction", "series"],

      output: {

        genre: ["dystopian", "friendship", "outsider", "high stakes", "science fiction"],

        vibes: [],

      },
    },
    {
      id: "36_book_39clues",
      title: "The 39 Clues",
      author: "Rick Riordan",
      semantic: {
        contentTraits: ["adventure", "family_secrets", "treasure_hunt", "competition"],
        toneTraits: ["fast", "adventurous", "clever"],
        characterTraits: ["young_heroes", "loyal_siblings"],
        storyTraits: ["quest_competition", "mystery_quest", "team_growth"],
        aversionTraits: ["complex_plotting"],
      },
      tags: ["adventure", "mystery", "family", "fast-paced", "series", "treasure"],

      output: {

        genre: ["adventure", "mystery", "family", "treasure"],

        vibes: ["fast-paced"],

      },
    },
    {
      id: "36_book_goosebumps",
      title: "Goosebumps",
      author: "R.L. Stine",
      semantic: {
        contentTraits: ["mystery", "monsters", "horror_elements"],
        toneTraits: ["spooky", "fun", "tense"],
        characterTraits: ["young_heroes", "curious_explorer"],
        storyTraits: ["monster_of_the_week", "escape_from_hidden_threat", "problem_solving"],
        aversionTraits: ["fear_intensity"]
      },
      tags: ["horror", "spooky", "mystery", "playful", "series"],

      output: {

        genre: ["horror", "mystery"],

        vibes: ["spooky", "playful"],

      },
    },
    {
      id: "36_book_wayside",
      title: "Sideways Stories from Wayside School",
      author: "Louis Sachar",
      semantic: {
        contentTraits: ["education", "friendship", "community"],
        toneTraits: ["absurd", "funny", "playful"],
        characterTraits: ["lovable_misfits", "young_heroes"],
        storyTraits: ["anthology_misfortune", "chaos_to_connection", "case_of_the_week"],
        aversionTraits: ["goofy_tone"],
      },
      tags: ["comedy", "school", "friendship", "weird", "short stories"],

      output: {

        genre: ["comedy", "school", "friendship", "short stories"],

        vibes: ["weird"],

      },
    },
    {
      id: "36_book_frindle",
      title: "Frindle",
      author: "Andrew Clements",
      semantic: {
        contentTraits: ["education", "friendship", "language"],
        toneTraits: ["clever", "playful", "warm"],
        characterTraits: ["gifted_underdog", "mentor_teacher"],
        storyTraits: ["problem_solving", "prove_yourself", "emotional_growth"],
        aversionTraits: ["low_stakes"],
      },
      tags: ["school", "comedy", "friendship", "realistic", "emotional growth"],

      output: {

        genre: ["school", "comedy", "friendship", "realistic"],

        vibes: ["emotional growth"],

      },
    },
    {
      id: "36_book_inkheart",
      title: "Inkheart",
      author: "Cornelia Funke",
      semantic: {
        contentTraits: ["books", "magic", "family", "adventure"],
        toneTraits: ["wonder_filled", "adventurous", "mysterious"],
        characterTraits: ["curious_explorer", "protective_parent"],
        storyTraits: ["story_within_story_escape", "quest_journey", "rescue_mission"],
        aversionTraits: ["fantasy_density"],
      },
      tags: ["fantasy", "adventure", "family", "mystery", "series"],

      output: {

        genre: ["fantasy", "adventure", "family", "mystery"],

        vibes: [],

      },
    },
    {
      id: "36_book_redwall",
      title: "Redwall",
      author: "Brian Jacques",
      semantic: {
        contentTraits: ["adventure", "community", "power", "survival"],
        toneTraits: ["epic", "adventurous", "warm"],
        characterTraits: ["young_heroes", "mentor_figures"],
        storyTraits: ["save_the_land_quest", "team_building", "quest_journey"],
        aversionTraits: ["fantasy_density"],
      },
      tags: ["fantasy", "adventure", "heroic", "community", "series"],

      output: {

        genre: ["fantasy", "adventure", "heroic", "community"],

        vibes: [],

      },
    },
    {
      id: "36_movie_spiderverse",
      title: "Spider-Man: Into the Spider-Verse",
      author: "Sony Pictures Animation",
      genre: "Superheroes / Adventure / Family",
      semantic: {
        contentTraits: ["identity", "multiverse", "family", "friendship"],
        toneTraits: ["energetic", "fun", "stylish"],
        characterTraits: ["young_heroes", "mentor_guided_growth"],
        storyTraits: ["coming_into_power", "identity_discovery", "team_up"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:movie", "film", "superheroes", "adventure", "family", "playful"],

      output: {

        genre: ["superheroes", "adventure", "family"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_movie_frozen",
      title: "Frozen",
      author: "Disney",
      genre: "Fantasy / Family / Music",
      semantic: {
        contentTraits: ["family", "sister_relationship", "magic", "identity"],
        toneTraits: ["emotional", "hopeful", "wonder_filled"],
        characterTraits: ["strong_sisters", "overwhelmed_heroine"],
        storyTraits: ["self_acceptance", "quest_journey", "emotional_growth"],
        aversionTraits: ["sad_tone"]
      },
      tags: ["media:movie", "film", "fantasy", "family", "music", "emotional growth", "hopeful"],

      output: {

        genre: ["fantasy", "family", "music"],

        vibes: ["emotional growth", "hopeful"],

      },
    },
    {
      id: "36_movie_frozen2",
      title: "Frozen II",
      author: "Disney",
      genre: "Fantasy / Family / Music",
      semantic: {
        contentTraits: ["family", "magic", "identity", "adventure"],
        toneTraits: ["emotional", "wonder_filled", "epic"],
        characterTraits: ["strong_sisters", "questioning_protagonist"],
        storyTraits: ["quest_journey", "truth_discovery", "self_realization"],
        aversionTraits: ["sad_tone"],
      },
      tags: ["media:movie", "film", "fantasy", "family", "music", "adventure", "identity"],

      output: {

        genre: ["fantasy", "family", "music", "adventure", "identity"],

        vibes: [],

      },
    },
    {
      id: "36_movie_luca",
      title: "Luca",
      author: "Pixar",
      genre: "Friendship / Ocean",
      semantic: {
        contentTraits: ["friendship", "family", "outsider_identity", "identity"],
        toneTraits: ["warm", "playful", "gentle"],
        characterTraits: ["curious_explorer", "loyal_friends"],
        storyTraits: ["coming_of_age", "self_acceptance", "friendship_growth"],
        aversionTraits: ["low_stakes"],
      },
      tags: ["media:movie", "film", "friendship", "coming of age", "ocean", "warm", "playful"],

      output: {

        genre: ["friendship", "ocean"],

        vibes: ["coming of age", "warm", "playful"],

      },
    },
    {
      id: "36_movie_encanto",
      title: "Encanto",
      author: "Disney",
      genre: "Fantasy / Family / Music",
      semantic: {
        contentTraits: ["family", "magic", "giftedness", "community"],
        toneTraits: ["warm", "hopeful", "emotional"],
        characterTraits: ["outsider_hero", "interconnected_families"],
        storyTraits: ["family_conflict", "self_acceptance", "emotional_repair"],
        aversionTraits: ["emotional_pain"],
      },
      tags: ["media:movie", "film", "fantasy", "family", "music", "emotional growth", "warm"],

      output: {

        genre: ["fantasy", "family", "music"],

        vibes: ["emotional growth", "warm"],

      },
    },
    {
      id: "36_movie_mitchells",
      title: "The Mitchells vs. the Machines",
      author: "Sony Pictures Animation",
      genre: "AI / Family / Comedy",
      semantic: {
        contentTraits: ["family", "artificial_intelligence", "human_connection", "road_trip"],
        toneTraits: ["funny", "energetic", "chaotic"],
        characterTraits: ["lovable_misfits", "protective_parent"],
        storyTraits: ["team_up", "family_conflict", "emotional_growth"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:movie", "film", "ai", "family", "comedy", "adventure", "robots"],

      output: {

        genre: ["ai", "family", "comedy", "adventure", "robots"],

        vibes: [],

      },
    },
    {
      id: "36_movie_moana",
      title: "Moana",
      author: "Disney",
      genre: "Fantasy / Adventure / Ocean",
      semantic: {
        contentTraits: ["adventure", "mythology", "family", "identity"],
        toneTraits: ["hopeful", "wonder_filled", "adventurous"],
        characterTraits: ["headstrong_hero", "mentor_guided_growth"],
        storyTraits: ["quest_journey", "self_realization", "save_the_land_quest"],
        aversionTraits: ["low_stakes"],
      },
      tags: ["media:movie", "film", "fantasy", "adventure", "ocean", "heroic", "music"],

      output: {

        genre: ["fantasy", "adventure", "ocean", "heroic", "music"],

        vibes: [],

      },
    },
    {
      id: "36_movie_bighero6",
      title: "Big Hero 6",
      author: "Disney",
      genre: "Superheroes / Friendship / Family",
      semantic: {
        contentTraits: ["friendship", "artificial_intelligence", "grief", "family"],
        toneTraits: ["fun", "heartfelt", "energetic"],
        characterTraits: ["gifted_protagonist", "found_family_team"],
        storyTraits: ["team_formation", "emotional_growth", "redemption_through_action"],
        aversionTraits: ["sad_tone"],
      },
      tags: ["media:movie", "film", "superheroes", "friendship", "family", "robots", "uplifting"],

      output: {

        genre: ["superheroes", "friendship", "family", "robots"],

        vibes: ["uplifting"],

      },
    },
    {
      id: "36_movie_toystory",
      title: "Toy Story",
      author: "Pixar",
      genre: "Friendship / Comedy / Adventure",
      semantic: {
        contentTraits: ["friendship", "community", "identity"],
        toneTraits: ["fun", "warm", "playful"],
        characterTraits: ["unlikely_allies", "loyal_companions"],
        storyTraits: ["friendship_growth", "escape_and_pursuit", "emotional_growth"],
        aversionTraits: ["younger_skew"],
      },
      tags: ["media:movie", "film", "friendship", "comedy", "adventure", "warm", "playful"],

      output: {

        genre: ["friendship", "comedy", "adventure"],

        vibes: ["warm", "playful"],

      },
    },
    {
      id: "36_movie_toy4",
      title: "Toy Story 4",
      author: "Pixar",
      genre: "Friendship / Adventure / Identity",
      semantic: {
        contentTraits: ["friendship", "identity", "community"],
        toneTraits: ["warm", "bittersweet", "fun"],
        characterTraits: ["loyal_companions", "questioning_protagonist"],
        storyTraits: ["travel_arc", "self_realization", "friendship_growth"],
        aversionTraits: ["sad_tone"],
      },
      tags: ["media:movie", "film", "friendship", "adventure", "warm", "playful", "identity"],

      output: {

        genre: ["friendship", "adventure", "identity"],

        vibes: ["warm", "playful"],

      },
    },
    {
      id: "36_movie_dragons",
      title: "How to Train Your Dragon",
      author: "DreamWorks Animation",
      genre: "Fantasy / Adventure / Friendship",
      semantic: {
        contentTraits: ["friendship", "adventure", "family", "monsters"],
        toneTraits: ["adventurous", "heartfelt", "wonder_filled"],
        characterTraits: ["outsider_hero", "protective_parent"],
        storyTraits: ["self_acceptance", "save_the_land_quest", "friendship_growth"],
        aversionTraits: ["monster_threat"],
      },
      tags: ["media:movie", "film", "fantasy", "adventure", "friendship", "dragon", "heroic"],

      output: {

        genre: ["fantasy", "adventure", "friendship", "dragon", "heroic"],

        vibes: [],

      },
    },
    {
      id: "36_movie_dragons2",
      title: "How to Train Your Dragon 2",
      author: "DreamWorks Animation",
      genre: "Fantasy / Adventure / Dragon",
      semantic: {
        contentTraits: ["friendship", "adventure", "family", "monsters"],
        toneTraits: ["epic", "heartfelt", "adventurous"],
        characterTraits: ["young_leaders", "protective_parent"],
        storyTraits: ["coming_into_power", "family_conflict", "save_the_land_quest"],
        aversionTraits: ["sad_tone"],
      },
      tags: ["media:movie", "film", "fantasy", "adventure", "dragon", "family", "heroic"],

      output: {

        genre: ["fantasy", "adventure", "dragon", "family", "heroic"],

        vibes: [],

      },
    },
    {
      id: "36_movie_sing",
      title: "Sing",
      author: "Illumination",
      genre: "Music / Comedy / Friendship",
      semantic: {
        contentTraits: ["community", "music_and_storytelling", "ambition", "friendship"],
        toneTraits: ["fun", "energetic", "uplifting"],
        characterTraits: ["lovable_misfits", "dream_following_protagonist"],
        storyTraits: ["competition_progression", "team_building", "emotional_growth"],
        aversionTraits: ["predictable"],
      },
      tags: ["media:movie", "film", "music", "comedy", "friendship", "uplifting"],

      output: {

        genre: ["music", "comedy", "friendship"],

        vibes: ["uplifting"],

      },
    },
    {
      id: "36_movie_sing2",
      title: "Sing 2",
      author: "Illumination",
      genre: "Music / Comedy / Friendship",
      semantic: {
        contentTraits: ["community", "music_and_storytelling", "ambition", "friendship"],
        toneTraits: ["energetic", "uplifting", "fun"],
        characterTraits: ["lovable_misfits", "optimistic_leader"],
        storyTraits: ["team_growth", "prove_yourself", "competition_progression"],
        aversionTraits: ["predictable"],
      },
      tags: ["media:movie", "film", "music", "comedy", "friendship", "uplifting"],

      output: {

        genre: ["music", "comedy", "friendship"],

        vibes: ["uplifting"],

      },
    },
    {
      id: "36_movie_pokemon",
      title: "Detective Pikachu",
      author: "Warner Bros.",
      genre: "Mystery / Friendship / Adventure",
      semantic: {
        contentTraits: ["friendship", "mystery", "family", "artificial_life"],
        toneTraits: ["fun", "quirky", "mysterious"],
        characterTraits: ["unlikely_allies", "resourceful_protagonist"],
        storyTraits: ["case_solving", "truth_discovery", "relationship_building"],
        aversionTraits: ["predictable"],
      },
      tags: ["media:movie", "film", "mystery", "friendship", "adventure", "playful", "science fiction"],

      output: {

        genre: ["mystery", "friendship", "adventure", "science fiction"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_movie_sonic",
      title: "Sonic the Hedgehog",
      author: "Paramount Pictures",
      genre: "Adventure / Comedy",
      semantic: {
        contentTraits: ["friendship", "adventure", "community"],
        toneTraits: ["energetic", "fun", "playful"],
        characterTraits: ["sarcastic_protagonist", "unlikely_allies"],
        storyTraits: ["escape_and_pursuit", "team_up", "quest_journey"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:movie", "film", "adventure", "comedy", "fast-paced", "playful"],

      output: {

        genre: ["adventure", "comedy"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_movie_sonic2",
      title: "Sonic the Hedgehog 2",
      author: "Paramount Pictures",
      genre: "Adventure / Comedy",
      semantic: {
        contentTraits: ["friendship", "adventure", "family"],
        toneTraits: ["energetic", "fun", "playful"],
        characterTraits: ["young_heroes", "team_players"],
        storyTraits: ["team_up", "training_arc", "competition_progression"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:movie", "film", "adventure", "comedy", "fast-paced", "playful"],

      output: {

        genre: ["adventure", "comedy"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_movie_minions",
      title: "Minions",
      author: "Illumination",
      genre: "Comedy / Adventure",
      semantic: {
        contentTraits: ["community", "adventure", "crime"],
        toneTraits: ["absurd", "funny", "playful"],
        characterTraits: ["lovable_misfits", "unlikely_hero"],
        storyTraits: ["escape_and_pursuit", "chaos_to_connection", "problem_solving"],
        aversionTraits: ["goofy_tone"],
      },
      tags: ["media:movie", "film", "comedy", "adventure", "playful", "quirky"],

      output: {

        genre: ["comedy", "adventure"],

        vibes: ["playful", "quirky"],

      },
    },
    {
      id: "36_movie_despicable",
      title: "Despicable Me",
      author: "Illumination",
      genre: "Comedy / Family / Redemption",
      semantic: {
        contentTraits: ["family", "community", "crime", "friendship"],
        toneTraits: ["funny", "heartfelt", "playful"],
        characterTraits: ["unlikely_hero", "vulnerable_child"],
        storyTraits: ["redemption_arc", "family_loyalty", "emotional_growth"],
        aversionTraits: ["goofy_tone"],
      },
      tags: ["media:movie", "film", "comedy", "family", "redemption", "playful"],

      output: {

        genre: ["comedy", "family", "redemption"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_movie_paddington",
      title: "Paddington",
      author: "StudioCanal",
      genre: "Family / Comedy / Kindness",
      semantic: {
        contentTraits: ["family", "community", "outsider_identity", "friendship"],
        toneTraits: ["warm", "gentle", "whimsical"],
        characterTraits: ["curious_outsider", "outsider_hero"],
        storyTraits: ["building_a_new_life", "chaos_to_connection", "emotional_growth"],
        aversionTraits: ["low_stakes"],
      },
      tags: ["media:movie", "film", "family", "comedy", "kindness", "warm", "whimsical"],

      output: {

        genre: ["family", "comedy", "kindness"],

        vibes: ["warm", "whimsical"],

      },
    },
    {
      id: "36_tv_avatar",
      title: "Avatar: The Last Airbender",
      author: "Nickelodeon",
      genre: "Fantasy / Adventure / Friendship",
      semantic: {
        contentTraits: ["friendship", "elemental_magic", "war", "chosen_one"],
        toneTraits: ["adventurous", "hopeful", "epic"],
        characterTraits: ["young_heroes", "reluctant_hero"],
        storyTraits: ["save_the_land_quest", "team_growth", "training_arc"],
        aversionTraits: ["combat_focus"],
      },
      tags: ["media:tv", "fantasy", "adventure", "friendship", "heroic", "series"],

      output: {

        genre: ["fantasy", "adventure", "friendship", "heroic"],

        vibes: [],

      },
    },
    {
      id: "36_tv_korra",
      title: "The Legend of Korra",
      author: "Nickelodeon",
      genre: "Fantasy / Adventure / Friendship",
      semantic: {
        contentTraits: ["friendship", "elemental_magic", "political_unrest", "identity"],
        toneTraits: ["adventurous", "epic", "thoughtful"],
        characterTraits: ["strong_heroine", "young_leaders"],
        storyTraits: ["coming_into_power", "ideological_conflict", "team_growth"],
        aversionTraits: ["combat_focus"],
      },
      tags: ["media:tv", "fantasy", "adventure", "friendship", "heroic", "series"],

      output: {

        genre: ["fantasy", "adventure", "friendship", "heroic"],

        vibes: [],

      },
    },
    {
      id: "36_tv_gravity",
      title: "Gravity Falls",
      author: "Disney",
      genre: "Mystery / Comedy / Family",
      semantic: {
        contentTraits: ["friendship", "family", "small_town_mystery", "mystery"],
        toneTraits: ["funny", "weird", "spooky"],
        characterTraits: ["curious_explorer", "loyal_siblings"],
        storyTraits: ["season_mystery", "truth_discovery", "coming_of_age_mystery"],
        aversionTraits: ["fear_intensity"]
      },
      tags: ["media:tv", "mystery", "comedy", "spooky", "family", "weird", "series"],

      output: {

        genre: ["mystery", "comedy", "family"],

        vibes: ["spooky", "weird"],

      },
    },
    {
      id: "36_tv_ducktales",
      title: "DuckTales",
      author: "Disney",
      genre: "Adventure / Family / Comedy",
      semantic: {
        contentTraits: ["adventure", "family", "treasure_hunt", "community"],
        toneTraits: ["fun", "adventurous", "playful"],
        characterTraits: ["young_heroes", "eccentric_genius"],
        storyTraits: ["quest_journey", "team_building", "case_of_the_week"],
        aversionTraits: ["low_stakes"],
      },
      tags: ["media:tv", "adventure", "family", "comedy", "playful", "series", "treasure"],

      output: {

        genre: ["adventure", "family", "comedy", "treasure"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_tv_clonewars",
      title: "Star Wars: The Clone Wars",
      author: "Lucasfilm",
      genre: "Science Fiction / Space / Adventure",
      semantic: {
        contentTraits: ["war", "friendship", "space_politics", "mentorship"],
        toneTraits: ["epic", "adventurous", "dramatic"],
        characterTraits: ["young_leaders", "mentor_guided_growth"],
        storyTraits: ["war_escalation", "team_growth", "season_arc"],
        aversionTraits: ["violence"],
      },
      tags: ["media:tv", "science fiction", "space", "adventure", "heroic", "series"],

      output: {

        genre: ["science fiction", "space", "adventure", "heroic"],

        vibes: [],

      },
    },
    {
      id: "36_tv_rebels",
      title: "Star Wars Rebels",
      author: "Lucasfilm",
      genre: "Science Fiction / Space / Adventure",
      semantic: {
        contentTraits: ["rebellion", "found_family", "space_politics", "friendship"],
        toneTraits: ["hopeful", "adventurous", "epic"],
        characterTraits: ["found_family_team", "young_heroes"],
        storyTraits: ["resistance_story", "team_growth", "team_formation"],
        aversionTraits: ["combat_focus"],
      },
      tags: ["media:tv", "science fiction", "space", "adventure", "rebellion", "friendship", "series"],

      output: {

        genre: ["science fiction", "space", "adventure", "rebellion", "friendship"],

        vibes: [],

      },
    },
    {
      id: "36_tv_pokemon",
      title: "Pokémon",
      author: "The Pokemon Company",
      genre: "Adventure / Friendship",
      semantic: {
        contentTraits: ["friendship", "competition", "adventure", "training"],
        toneTraits: ["fun", "energetic", "hopeful"],
        characterTraits: ["young_heroes", "optimistic_leader"],
        storyTraits: ["competition_progression", "travel_arc", "rise_to_mastery"],
        aversionTraits: ["predictable"],
      },
      tags: ["media:tv", "adventure", "friendship", "playful", "series"],

      output: {

        genre: ["adventure", "friendship"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_tv_spongebob",
      title: "SpongeBob SquarePants",
      author: "Nickelodeon",
      genre: "Comedy / Friendship",
      semantic: {
        contentTraits: ["friendship", "community", "adventure"],
        toneTraits: ["absurd", "funny", "playful"],
        characterTraits: ["lovable_misfits", "optimistic_protagonist"],
        storyTraits: ["case_of_the_week", "chaos_to_connection", "problem_solving"],
        aversionTraits: ["goofy_tone"],
      },
      tags: ["media:tv", "comedy", "friendship", "playful", "weird", "series"],

      output: {

        genre: ["comedy", "friendship"],

        vibes: ["playful", "weird"],

      },
    },
    {
      id: "36_tv_gumball",
      title: "The Amazing World of Gumball",
      author: "Cartoon Network",
      genre: "Comedy / Family / Friendship",
      semantic: {
        contentTraits: ["friendship", "family", "community"],
        toneTraits: ["absurd", "chaotic", "funny"],
        characterTraits: ["lovable_misfits", "loyal_friend_group"],
        storyTraits: ["case_of_the_week", "chaos_to_connection", "problem_solving"],
        aversionTraits: ["goofy_tone"],
      },
      tags: ["media:tv", "comedy", "family", "friendship", "weird", "playful", "series"],

      output: {

        genre: ["comedy", "family", "friendship"],

        vibes: ["weird", "playful"],

      },
    },
    {
      id: "36_tv_loud",
      title: "The Loud House",
      author: "Nickelodeon",
      genre: "Comedy / Family / Friendship",
      semantic: {
        contentTraits: ["family", "friendship", "community"],
        toneTraits: ["funny", "warm", "playful"],
        characterTraits: ["large_ensemble", "resourceful_protagonist"],
        storyTraits: ["case_of_the_week", "family_conflict", "emotional_growth"],
        aversionTraits: ["low_stakes"],
      },
      tags: ["media:tv", "comedy", "family", "friendship", "school", "playful", "series"],

      output: {

        genre: ["comedy", "family", "friendship", "school"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_tv_adventure",
      title: "Adventure Time",
      author: "Cartoon Network",
      genre: "Fantasy / Adventure / Friendship",
      semantic: {
        contentTraits: ["friendship", "adventure", "magic", "community"],
        toneTraits: ["weird", "playful", "heartfelt"],
        characterTraits: ["young_heroes", "unlikely_allies"],
        storyTraits: ["quest_journey", "season_arc", "friendship_growth"],
        aversionTraits: ["strangeness"],
      },
      tags: ["media:tv", "fantasy", "adventure", "friendship", "weird", "playful", "series"],

      output: {

        genre: ["fantasy", "adventure", "friendship"],

        vibes: ["weird", "playful"],

      },
    },
    {
      id: "36_tv_steven",
      title: "Steven Universe",
      author: "Cartoon Network",
      genre: "Fantasy / Friendship / Family",
      semantic: {
        contentTraits: ["friendship", "family", "identity", "magic"],
        toneTraits: ["warm", "heartfelt", "playful"],
        characterTraits: ["young_heroes", "mentor_guided_growth"],
        storyTraits: ["self_acceptance", "team_growth", "healing_arc"],
        aversionTraits: ["sad_tone"],
      },
      tags: ["media:tv", "fantasy", "friendship", "family", "identity", "warm", "series"],

      output: {

        genre: ["fantasy", "friendship", "family", "identity"],

        vibes: ["warm"],

      },
    },
    {
      id: "36_tv_teen_titans",
      title: "Teen Titans Go!",
      author: "Cartoon Network",
      genre: "Superheroes / Comedy / Friendship",
      semantic: {
        contentTraits: ["friendship", "community", "secret_identity"],
        toneTraits: ["absurd", "funny", "playful"],
        characterTraits: ["team_players", "young_heroes"],
        storyTraits: ["case_of_the_week", "team_up", "problem_solving"],
        aversionTraits: ["goofy_tone"],
      },
      tags: ["media:tv", "superheroes", "comedy", "friendship", "playful", "series"],

      output: {

        genre: ["superheroes", "comedy", "friendship"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_tv_miraculous",
      title: "Miraculous: Tales of Ladybug & Cat Noir",
      author: "ZAG",
      genre: "Superheroes / Adventure / Friendship",
      semantic: {
        contentTraits: ["friendship", "secret_identity", "romance", "adventure"],
        toneTraits: ["fun", "energetic", "hopeful"],
        characterTraits: ["young_heroes", "team_players"],
        storyTraits: ["case_of_the_week", "identity_concealment", "team_up"],
        aversionTraits: ["predictable_romance"],
      },
      tags: ["media:tv", "superheroes", "adventure", "friendship", "romance", "playful", "series"],

      output: {

        genre: ["superheroes", "adventure", "friendship", "romance"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_tv_dragon_prince",
      title: "The Dragon Prince",
      author: "Netflix",
      genre: "Fantasy / Adventure / Friendship",
      semantic: {
        contentTraits: ["friendship", "magic", "adventure", "war"],
        toneTraits: ["adventurous", "epic", "heartfelt"],
        characterTraits: ["young_leaders", "unlikely_allies"],
        storyTraits: ["quest_journey", "save_the_land_quest", "team_growth"],
        aversionTraits: ["combat_focus"],
      },
      tags: ["media:tv", "fantasy", "adventure", "friendship", "dragon", "epic", "series"],

      output: {

        genre: ["fantasy", "adventure", "friendship", "dragon"],

        vibes: ["epic"],

      },
    },
    {
      id: "36_tv_voltron",
      title: "Voltron: Legendary Defender",
      author: "DreamWorks Animation",
      genre: "Science Fiction / Space / Adventure",
      semantic: {
        contentTraits: ["friendship", "space_politics", "war", "adventure"],
        toneTraits: ["energetic", "epic", "adventurous"],
        characterTraits: ["team_players", "young_leaders"],
        storyTraits: ["team_formation", "season_arc", "resistance_story"],
        aversionTraits: ["combat_focus"],
      },
      tags: ["media:tv", "science fiction", "space", "adventure", "friendship", "series"],

      output: {

        genre: ["science fiction", "space", "adventure", "friendship"],

        vibes: [],

      },
    },
    {
      id: "36_tv_ninjago",
      title: "LEGO Ninjago",
      author: "LEGO",
      genre: "Fantasy / Adventure / Friendship",
      semantic: {
        contentTraits: ["friendship", "martial_arts", "training", "adventure"],
        toneTraits: ["energetic", "fun", "adventurous"],
        characterTraits: ["young_heroes", "mentor_guided_growth"],
        storyTraits: ["training_arc", "team_growth", "save_the_land_quest"],
        aversionTraits: ["combat_focus"],
      },
      tags: ["media:tv", "fantasy", "adventure", "friendship", "heroic", "playful", "series"],

      output: {

        genre: ["fantasy", "adventure", "friendship", "heroic"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_tv_carmen",
      title: "Carmen Sandiego",
      author: "Netflix",
      genre: "Adventure / Mystery / Crime",
      semantic: {
        contentTraits: ["crime_solving", "adventure", "education", "family_secrets"],
        toneTraits: ["clever", "stylish", "adventurous"],
        characterTraits: ["resourceful_protagonist", "leader_with_companions"],
        storyTraits: ["heist_and_resistance", "case_solving", "truth_discovery"],
        aversionTraits: ["complex_plotting"],
      },
      tags: ["media:tv", "adventure", "mystery", "crime", "fast-paced", "series"],

      output: {

        genre: ["adventure", "mystery", "crime"],

        vibes: ["fast-paced"],

      },
    },
    {
      id: "36_tv_jurassic",
      title: "Jurassic World Camp Cretaceous",
      author: "DreamWorks Animation",
      genre: "Science Fiction / Dinosaurs / Adventure",
      semantic: {
        contentTraits: ["friendship", "dinosaurs", "survival", "adventure"],
        toneTraits: ["tense", "adventurous", "fun"],
        characterTraits: ["young_heroes", "ragtag_team"],
        storyTraits: ["survival_story", "team_growth", "escape_and_pursuit"],
        aversionTraits: ["fear_intensity"]
      },
      tags: ["media:tv", "science fiction", "dinosaurs", "adventure", "survival", "friendship", "series"],

      output: {

        genre: ["science fiction", "dinosaurs", "adventure", "survival", "friendship"],

        vibes: [],

      },
    },
    {
      id: "36_tv_beyblade",
      title: "Beyblade",
      author: "Takara Tomy",
      genre: "Friendship",
      semantic: {
        contentTraits: ["competition", "friendship", "training", "community"],
        toneTraits: ["energetic", "fun", "playful"],
        characterTraits: ["young_heroes", "optimistic_leader"],
        storyTraits: ["competition_progression", "training_arc", "rise_to_mastery"],
        aversionTraits: ["predictable"],
      },
      tags: ["media:tv", "friendship", "fast-paced", "playful", "series"],

      output: {

        genre: ["friendship"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_minecraft",
      title: "Minecraft",
      author: "Mojang Studios",
      genre: "Adventure / Survival / Community",
      semantic: {
        contentTraits: ["adventure", "community", "survival"],
        toneTraits: ["wonder_filled", "playful", "adventurous"],
        characterTraits: ["curious_explorer", "resourceful_protagonist"],
        storyTraits: ["exploration_arc", "building_a_new_life", "problem_solving"],
        aversionTraits: ["low_plot"],
      },
      tags: ["media:game", "adventure", "survival", "playful", "community"],

      output: {

        genre: ["adventure", "survival", "community"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_game_roblox",
      title: "Roblox",
      author: "Roblox",
      genre: "Adventure / Community",
      semantic: {
        contentTraits: ["adventure", "community", "competition"],
        toneTraits: ["playful", "energetic", "chaotic"],
        characterTraits: ["curious_explorer", "lovable_misfits"],
        storyTraits: ["branching_choices", "problem_solving", "group_dynamics"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:game", "adventure", "playful", "community", "fast-paced"],

      output: {

        genre: ["adventure", "community"],

        vibes: ["playful", "fast-paced"],

      },
    },
    {
      id: "36_game_mariokart",
      title: "Mario Kart 8",
      author: "Nintendo",
      genre: "Friendship / Vehicles",
      semantic: {
        contentTraits: ["competition", "friendship", "community"],
        toneTraits: ["energetic", "playful", "fun"],
        characterTraits: ["team_players", "optimistic_protagonist"],
        storyTraits: ["competition_progression", "problem_solving", "group_dynamics"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:game", "friendship", "fast-paced", "playful", "vehicles"],

      output: {

        genre: ["friendship", "vehicles"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_mario_odyssey",
      title: "Super Mario Odyssey",
      author: "Nintendo",
      genre: "Fantasy / Adventure / Heroic",
      semantic: {
        contentTraits: ["adventure", "magic", "friendship"],
        toneTraits: ["playful", "wonder_filled", "energetic"],
        characterTraits: ["eager_hero", "loyal_companions"],
        storyTraits: ["quest_journey", "rescue_plot", "exploration_arc"],
        aversionTraits: ["low_plot"],
      },
      tags: ["media:game", "fantasy", "adventure", "playful", "heroic"],

      output: {

        genre: ["fantasy", "adventure", "heroic"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_game_smash",
      title: "Super Smash Bros.",
      author: "Nintendo",
      genre: "Friendship / Superheroes",
      semantic: {
        contentTraits: ["competition", "friendship", "community"],
        toneTraits: ["energetic", "playful", "chaotic"],
        characterTraits: ["team_players", "young_heroes"],
        storyTraits: ["competition_progression", "team_up", "group_dynamics"],
        aversionTraits: ["combat_focus", "overstimulating"],
      },
      tags: ["media:game", "friendship", "fast-paced", "playful", "superheroes"],

      output: {

        genre: ["friendship", "superheroes"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_zelda",
      title: "The Legend of Zelda: Breath of the Wild",
      author: "Nintendo",
      genre: "Fantasy / Adventure / Heroic",
      semantic: {
        contentTraits: ["adventure", "magic", "survival", "chosen_one"],
        toneTraits: ["wonder_filled", "adventurous", "epic"],
        characterTraits: ["solitary_traveler", "resourceful_protagonist"],
        storyTraits: ["exploration_arc", "save_the_land_quest", "quest_for_knowledge"],
        aversionTraits: ["slow_pacing"],
      },
      tags: ["media:game", "fantasy", "adventure", "heroic", "survival", "epic"],

      output: {

        genre: ["fantasy", "adventure", "heroic", "survival"],

        vibes: ["epic"],

      },
    },
    {
      id: "36_game_pokemon",
      title: "Pokémon Games",
      author: "The Pokemon Company",
      genre: "Friendship / Adventure",
      semantic: {
        contentTraits: ["friendship", "competition", "adventure", "training"],
        toneTraits: ["playful", "fun", "hopeful"],
        characterTraits: ["young_heroes", "optimistic_leader"],
        storyTraits: ["travel_arc", "rise_to_mastery", "competition_progression"],
        aversionTraits: ["predictable"],
      },
      tags: ["media:game", "friendship", "adventure", "playful", "series"],

      output: {

        genre: ["friendship", "adventure"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_game_fortnite",
      title: "Fortnite",
      author: "Epic Games",
      genre: "Survival / Adventure",
      semantic: {
        contentTraits: ["competition", "survival", "community"],
        toneTraits: ["energetic", "playful", "chaotic"],
        characterTraits: ["team_players", "resourceful_protagonist"],
        storyTraits: ["survival_scenario", "team_up", "problem_solving"],
        aversionTraits: ["combat_focus", "overstimulating"],
      },
      tags: ["media:game", "survival", "fast-paced", "playful", "adventure"],

      output: {

        genre: ["survival", "adventure"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_splatoon",
      title: "Splatoon",
      author: "Nintendo",
      genre: "Friendship / Adventure",
      semantic: {
        contentTraits: ["competition", "friendship", "community"],
        toneTraits: ["energetic", "playful", "stylish"],
        characterTraits: ["young_heroes", "team_players"],
        storyTraits: ["competition_progression", "team_up", "problem_solving"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:game", "friendship", "fast-paced", "playful", "adventure"],

      output: {

        genre: ["friendship", "adventure"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_animal",
      title: "Animal Crossing",
      author: "Nintendo",
      genre: "Community / Friendship",
      semantic: {
        contentTraits: ["community", "friendship", "family"],
        toneTraits: ["cozy", "gentle", "playful"],
        characterTraits: ["curious_explorer", "lovable_misfits"],
        storyTraits: ["building_a_new_life", "relationship_building", "problem_solving"],
        aversionTraits: ["low_conflict", "low_stakes"],
      },
      tags: ["media:game", "community", "friendship", "cozy", "gentle", "playful"],

      output: {

        genre: ["community", "friendship"],

        vibes: ["cozy", "gentle", "playful"],

      },
    },
    {
      id: "36_game_lego",
      title: "LEGO Games",
      author: "LEGO",
      genre: "Adventure / Friendship / Comedy",
      semantic: {
        contentTraits: ["friendship", "adventure", "community"],
        toneTraits: ["playful", "funny", "energetic"],
        characterTraits: ["team_players", "young_heroes"],
        storyTraits: ["team_up", "problem_solving", "quest_journey"],
        aversionTraits: ["predictable"],
      },
      tags: ["media:game", "adventure", "friendship", "comedy", "playful"],

      output: {

        genre: ["adventure", "friendship", "comedy"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_game_sonic",
      title: "Sonic Games",
      author: "Sega",
      genre: "Adventure / Heroic",
      semantic: {
        contentTraits: ["adventure", "competition", "friendship"],
        toneTraits: ["energetic", "playful", "fast"],
        characterTraits: ["sarcastic_protagonist", "loyal_friends"],
        storyTraits: ["escape_and_pursuit", "quest_journey", "problem_solving"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:game", "adventure", "fast-paced", "playful", "heroic"],

      output: {

        genre: ["adventure", "heroic"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_fallguys",
      title: "Fall Guys",
      author: "Mediatonic",
      genre: "Comedy / Friendship",
      semantic: {
        contentTraits: ["competition", "community", "friendship"],
        toneTraits: ["absurd", "playful", "energetic"],
        characterTraits: ["lovable_misfits", "team_players"],
        storyTraits: ["competition_progression", "problem_solving", "group_dynamics"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:game", "comedy", "fast-paced", "playful", "friendship"],

      output: {

        genre: ["comedy", "friendship"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_rocket",
      title: "Rocket League",
      author: "Psyonix",
      genre: "Friendship / Vehicles",
      semantic: {
        contentTraits: ["competition", "community", "friendship"],
        toneTraits: ["energetic", "playful", "focused"],
        characterTraits: ["team_players", "underdog_player"],
        storyTraits: ["competition_progression", "team_up", "problem_solving"],
        aversionTraits: ["sports_focus"],
      },
      tags: ["media:game", "friendship", "fast-paced", "vehicles", "playful"],

      output: {

        genre: ["friendship", "vehicles"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_tetris",
      title: "Tetris",
      author: "The Tetris Company",
      genre: "Concise",
      semantic: {
        contentTraits: ["competition", "community", "problem_solving"],
        toneTraits: ["focused", "energetic", "playful"],
        characterTraits: ["determined_underdog", "team_players"],
        storyTraits: ["repeat_and_learn", "problem_solving_chain", "competition_progression"],
        aversionTraits: ["puzzle_focus"],
      },
      tags: ["media:game", "fast-paced", "playful", "concise"],

      output: {

        genre: ["concise"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_subway",
      title: "Subway Surfers",
      author: "SYBO",
      genre: "Runaway / Chase",
      semantic: {
        contentTraits: ["adventure", "competition", "community"],
        toneTraits: ["energetic", "playful", "fast"],
        characterTraits: ["resourceful_protagonist", "young_heroes"],
        storyTraits: ["escape_and_pursuit", "repeat_and_learn", "problem_solving"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:game", "fast-paced", "playful", "runaway", "chase"],

      output: {

        genre: ["runaway", "chase"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_clash",
      title: "Clash Royale",
      author: "Supercell",
      genre: "Fantasy",
      semantic: {
        contentTraits: ["competition", "community", "power"],
        toneTraits: ["fast", "focused", "playful"],
        characterTraits: ["team_players", "resourceful_protagonist"],
        storyTraits: ["strategic_conflict", "competition_progression", "problem_solving"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:game", "fast-paced", "playful", "fantasy"],

      output: {

        genre: ["fantasy"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_brawl",
      title: "Brawl Stars",
      author: "Supercell",
      genre: "Friendship",
      semantic: {
        contentTraits: ["competition", "friendship", "community"],
        toneTraits: ["energetic", "playful", "chaotic"],
        characterTraits: ["team_players", "young_heroes"],
        storyTraits: ["team_up", "competition_progression", "problem_solving"],
        aversionTraits: ["combat_focus", "overstimulating"],
      },
      tags: ["media:game", "friendship", "fast-paced", "playful"],

      output: {

        genre: ["friendship"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_game_marioparty",
      title: "Mario Party",
      author: "Nintendo",
      genre: "Friendship / Comedy",
      semantic: {
        contentTraits: ["competition", "friendship", "community"],
        toneTraits: ["playful", "chaotic", "fun"],
        characterTraits: ["lovable_misfits", "team_players"],
        storyTraits: ["competition_progression", "group_dynamics", "problem_solving"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:game", "friendship", "playful", "comedy", "fast-paced"],

      output: {

        genre: ["friendship", "comedy"],

        vibes: ["playful", "fast-paced"],

      },
    },
    {
      id: "36_game_justdance",
      title: "Just Dance",
      author: "Ubisoft",
      genre: "Music / Community",
      semantic: {
        contentTraits: ["community", "music_and_storytelling", "competition"],
        toneTraits: ["energetic", "playful", "uplifting"],
        characterTraits: ["team_players", "optimistic_protagonist"],
        storyTraits: ["competition_progression", "group_dynamics", "problem_solving"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:game", "music", "playful", "fast-paced", "community"],

      output: {

        genre: ["music", "community"],

        vibes: ["playful", "fast-paced"],

      },
    },
    {
      id: "36_yt_mrbeast",
      title: "MrBeast",
      author: "Jimmy Donaldson",
      genre: "Comedy / Community",
      semantic: {
        contentTraits: ["competition", "community", "adventure"],
        toneTraits: ["energetic", "spectacular", "playful"],
        characterTraits: ["optimistic_leader", "team_players"],
        storyTraits: ["competition_progression", "group_dynamics", "problem_solving"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:youtube", "comedy", "fast-paced", "playful", "community"],

      output: {

        genre: ["comedy", "community"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_yt_markrober",
      title: "Mark Rober",
      author: "Mark Rober",
      genre: "Nonfiction",
      semantic: {
        contentTraits: ["engineering", "science_problem_solving", "education"],
        toneTraits: ["fun", "clever", "uplifting"],
        characterTraits: ["mentor_teacher", "curious_explorer"],
        storyTraits: ["problem_solving_chain", "quest_for_knowledge", "discovery_over_combat"],
        aversionTraits: ["science_heaviness"],
      },
      tags: ["media:youtube", "nonfiction", "playful", "uplifting", "fast-paced"],

      output: {

        genre: ["nonfiction"],

        vibes: ["playful", "uplifting", "fast-paced"],

      },
    },
    {
      id: "36_yt_dudeperfect",
      title: "Dude Perfect",
      author: "Dude Perfect",
      genre: "Friendship / Comedy",
      semantic: {
        contentTraits: ["friendship", "competition", "community"],
        toneTraits: ["energetic", "playful", "spectacular"],
        characterTraits: ["team_players", "optimistic_leader"],
        storyTraits: ["competition_progression", "problem_solving", "group_dynamics"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:youtube", "friendship", "fast-paced", "playful", "comedy"],

      output: {

        genre: ["friendship", "comedy"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_yt_dream",
      title: "Dream",
      author: "Dream",
      genre: "Survival / Adventure",
      semantic: {
        contentTraits: ["competition", "community", "survival"],
        toneTraits: ["energetic", "focused", "playful"],
        characterTraits: ["resourceful_protagonist", "team_players"],
        storyTraits: ["survival_scenario", "problem_solving_chain", "competition_progression"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:youtube", "fast-paced", "playful", "survival", "adventure"],

      output: {

        genre: ["survival", "adventure"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_yt_unspeakable",
      title: "Unspeakable",
      author: "Unspeakable",
      genre: "Comedy / Adventure",
      semantic: {
        contentTraits: ["community", "adventure", "competition"],
        toneTraits: ["playful", "energetic", "absurd"],
        characterTraits: ["optimistic_protagonist", "team_players"],
        storyTraits: ["problem_solving", "group_dynamics", "competition_progression"],
        aversionTraits: ["goofy_tone"],
      },
      tags: ["media:youtube", "playful", "fast-paced", "comedy", "adventure"],

      output: {

        genre: ["comedy", "adventure"],

        vibes: ["playful", "fast-paced"],

      },
    },
    {
      id: "36_yt_preston",
      title: "PrestonPlayz",
      author: "Preston Arsement",
      genre: "Adventure / Comedy",
      semantic: {
        contentTraits: ["community", "competition", "adventure"],
        toneTraits: ["playful", "energetic", "fun"],
        characterTraits: ["optimistic_protagonist", "team_players"],
        storyTraits: ["problem_solving", "competition_progression", "group_dynamics"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:youtube", "playful", "fast-paced", "adventure", "comedy"],

      output: {

        genre: ["adventure", "comedy"],

        vibes: ["playful", "fast-paced"],

      },
    },
    {
      id: "36_yt_ssundee",
      title: "SSundee",
      author: "SSundee",
      genre: "Comedy / Adventure",
      semantic: {
        contentTraits: ["community", "competition", "adventure"],
        toneTraits: ["playful", "chaotic", "funny"],
        characterTraits: ["team_players", "sarcastic_protagonist"],
        storyTraits: ["problem_solving", "group_dynamics", "competition_progression"],
        aversionTraits: ["goofy_tone"],
      },
      tags: ["media:youtube", "playful", "comedy", "fast-paced", "adventure"],

      output: {

        genre: ["comedy", "adventure"],

        vibes: ["playful", "fast-paced"],

      },
    },
    {
      id: "36_yt_danthdm",
      title: "DanTDM",
      author: "Daniel Middleton",
      genre: "Friendship / Adventure",
      semantic: {
        contentTraits: ["community", "adventure", "friendship"],
        toneTraits: ["playful", "fun", "uplifting"],
        characterTraits: ["optimistic_protagonist", "curious_explorer"],
        storyTraits: ["problem_solving", "quest_for_knowledge", "group_dynamics"],
        aversionTraits: ["predictable"],
      },
      tags: ["media:youtube", "playful", "friendship", "adventure", "uplifting"],

      output: {

        genre: ["friendship", "adventure"],

        vibes: ["playful", "uplifting"],

      },
    },
    {
      id: "36_yt_ldshadowlady",
      title: "LDShadowLady",
      author: "Lizzie",
      genre: "Friendship / Fantasy / Community",
      semantic: {
        contentTraits: ["community", "adventure", "friendship"],
        toneTraits: ["playful", "whimsical", "fun"],
        characterTraits: ["curious_explorer", "optimistic_protagonist"],
        storyTraits: ["building_a_new_life", "problem_solving", "group_dynamics"],
        aversionTraits: ["low_conflict"],
      },
      tags: ["media:youtube", "playful", "friendship", "fantasy", "community"],

      output: {

        genre: ["friendship", "fantasy", "community"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_yt_thinknoodles",
      title: "ThinkNoodles",
      author: "ThinkNoodles",
      genre: "Friendship / Adventure / Comedy",
      semantic: {
        contentTraits: ["community", "adventure", "friendship"],
        toneTraits: ["playful", "fun", "energetic"],
        characterTraits: ["optimistic_protagonist", "curious_explorer"],
        storyTraits: ["problem_solving", "group_dynamics", "quest_for_knowledge"],
        aversionTraits: ["predictable"],
      },
      tags: ["media:youtube", "playful", "friendship", "adventure", "comedy"],

      output: {

        genre: ["friendship", "adventure", "comedy"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_yt_ninja",
      title: "Ninja",
      author: "Tyler Blevins",
      genre: "Friendship / Adventure",
      semantic: {
        contentTraits: ["competition", "community", "friendship"],
        toneTraits: ["energetic", "focused", "playful"],
        characterTraits: ["team_players", "underdog_player"],
        storyTraits: ["competition_progression", "problem_solving", "team_up"],
        aversionTraits: ["overstimulating"],
      },
      tags: ["media:youtube", "fast-paced", "playful", "friendship", "adventure"],

      output: {

        genre: ["friendship", "adventure"],

        vibes: ["fast-paced", "playful"],

      },
    },
    {
      id: "36_yt_pokimane",
      title: "Pokimane",
      author: "Imane Anys",
      genre: "Friendship / Community / Comedy",
      semantic: {
        contentTraits: ["community", "friendship", "competition"],
        toneTraits: ["playful", "warm", "fun"],
        characterTraits: ["optimistic_protagonist", "team_players"],
        storyTraits: ["group_dynamics", "problem_solving", "competition_progression"],
        aversionTraits: ["low_stakes"],
      },
      tags: ["media:youtube", "friendship", "playful", "community", "comedy"],

      output: {

        genre: ["friendship", "community", "comedy"],

        vibes: ["playful"],

      },
    },
    {
      id: "36_yt_gamegrumps",
      title: "Game Grumps",
      author: "Game Grumps",
      genre: "Comedy / Friendship",
      semantic: {
        contentTraits: ["friendship", "community", "competition"],
        toneTraits: ["funny", "chaotic", "playful"],
        characterTraits: ["companion_dynamic", "lovable_misfits"],
        storyTraits: ["group_dynamics", "problem_solving", "case_of_the_week"],
        aversionTraits: ["goofy_tone"],
      },
      tags: ["media:youtube", "comedy", "friendship", "playful", "fast-paced"],

      output: {

        genre: ["comedy", "friendship"],

        vibes: ["playful", "fast-paced"],

      },
    },
    {
      id: "36_yt_ryan",
      title: "Ryan's World",
      author: "Ryan Kaji",
      genre: "Friendship / Nonfiction",
      semantic: {
        contentTraits: ["community", "friendship", "education"],
        toneTraits: ["playful", "fun", "energetic"],
        characterTraits: ["curious_explorer", "optimistic_protagonist"],
        storyTraits: ["quest_for_knowledge", "problem_solving", "case_of_the_week"],
        aversionTraits: ["younger_skew"],
      },
      tags: ["media:youtube", "playful", "friendship", "uplifting", "nonfiction"],

      output: {

        genre: ["friendship", "nonfiction"],

        vibes: ["playful", "uplifting"],

      },
    },
    {
      id: "36_yt_kidscrafts",
      title: "5-Minute Crafts Kids",
      author: "5-Minute Crafts Kids",
      genre: "Nonfiction / Concise",
      semantic: {
        contentTraits: ["education", "engineering", "community"],
        toneTraits: ["playful", "energetic", "uplifting"],
        characterTraits: ["mentor_teacher", "curious_explorer"],
        storyTraits: ["problem_solving_chain", "quest_for_knowledge", "case_of_the_week"],
        aversionTraits: ["predictable"],
      },
      tags: ["media:youtube", "nonfiction", "playful", "uplifting", "concise"],

      output: {

        genre: ["nonfiction", "concise"],

        vibes: ["playful", "uplifting"],

      },
    },
    {
      id: "36_yt_natgeokids",
      title: "Nat Geo Kids",
      author: "National Geographic Kids",
      genre: "Nonfiction / Animals / Nature",
      semantic: {
        contentTraits: ["education", "science_problem_solving", "community"],
        toneTraits: ["wonder_filled", "fun", "uplifting"],
        characterTraits: ["mentor_teacher", "curious_explorer"],
        storyTraits: ["quest_for_knowledge", "discovery_over_combat", "case_of_the_week"],
        aversionTraits: ["science_heaviness"],
      },
      tags: ["media:youtube", "nonfiction", "animals", "nature", "uplifting"],

      output: {

        genre: ["nonfiction", "animals", "nature"],

        vibes: ["uplifting"],

      },
    },
    {
      id: "36_yt_brainpop",
      title: "BrainPOP",
      author: "BrainPOP",
      genre: "Nonfiction / Concise",
      semantic: {
        contentTraits: ["education", "science_problem_solving", "community"],
        toneTraits: ["clever", "playful", "uplifting"],
        characterTraits: ["mentor_teacher", "curious_explorer"],
        storyTraits: ["quest_for_knowledge", "problem_solving_chain", "case_of_the_week"],
        aversionTraits: ["science_heaviness"],
      },
      tags: ["media:youtube", "nonfiction", "playful", "uplifting", "concise"],

      output: {

        genre: ["nonfiction", "concise"],

        vibes: ["playful", "uplifting"],

      },
    },
    {
      id: "36_yt_crashcoursekids",
      title: "Crash Course Kids",
      author: "Crash Course Kids",
      genre: "Nonfiction / Concise",
      semantic: {
        contentTraits: ["education", "science_problem_solving", "community"],
        toneTraits: ["energetic", "clever", "uplifting"],
        characterTraits: ["mentor_teacher", "curious_explorer"],
        storyTraits: ["quest_for_knowledge", "problem_solving_chain", "case_of_the_week"],
        aversionTraits: ["science_heaviness"],
      },
      tags: ["media:youtube", "nonfiction", "uplifting", "fast-paced", "concise"],

      output: {

        genre: ["nonfiction", "concise"],

        vibes: ["uplifting", "fast-paced"],

      },
    },
    {
      id: "36_yt_teded",
      title: "TED-Ed",
      author: "TED-Ed",
      genre: "Nonfiction / Concise",
      semantic: {
        contentTraits: ["education", "community", "ethics"],
        toneTraits: ["thoughtful", "clever", "uplifting"],
        characterTraits: ["mentor_teacher", "curious_explorer"],
        storyTraits: ["quest_for_knowledge", "truth_discovery", "case_of_the_week"],
        aversionTraits: ["complex_themes"],
      },
      tags: ["media:youtube", "nonfiction", "uplifting", "concise", "quirky"],

      output: {

        genre: ["nonfiction", "concise"],

        vibes: ["uplifting", "quirky"],

      },
    },
    {
      id: "36_yt_kurzgesagt",
      title: "Kurzgesagt – In a Nutshell",
      author: "Kurzgesagt",
      genre: "Nonfiction / Science Fiction",
      semantic: {
        contentTraits: ["education", "science_problem_solving", "ethics"],
        toneTraits: ["clever", "wonder_filled", "thoughtful"],
        characterTraits: ["mentor_teacher", "curious_explorer"],
        storyTraits: ["quest_for_knowledge", "truth_discovery", "problem_solving_chain"],
        aversionTraits: ["science_heaviness", "complex_themes"],
      },
      tags: ["media:youtube", "nonfiction", "uplifting", "quirky", "science fiction"],

      output: {

        genre: ["nonfiction", "science fiction"],

        vibes: ["uplifting", "quirky"],

      },
    },
  ],
} as const;