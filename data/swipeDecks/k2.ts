// tasteTraits auto-generated from semantic/tags
// /data/swipeDecks/k2.ts
// Canonical: deck module in the exact shape SwipeDeckScreen expects.
// (No display/output nesting; cards are flat objects with title/author/genre/tags.)

import type { SwipeDeck } from './types';

// SwipeDeckScreen relies on tags for query-building.
// For the Kids (K–2) band we want a single age-band genre guardrail derived from layout:
//   younger/neutral -> genre:juvenile fiction
//   older           -> genre:middle grade fiction
function deriveAgeBandGenreTag(tags: string[]): string {
  const layout = (tags || []).find((t) => /^layout:/i.test(t))?.split(':')[1]?.trim().toLowerCase();
  return layout === 'older' ? 'genre:middle grade fiction' : 'genre:juvenile fiction';
}

function withDerivedGenreTag(tags: string[] | undefined): string[] {
  const base = Array.isArray(tags) ? [...tags] : [];
  const hasExplicitNonBookMedia = base.some((t) => {
    const canon = String(t || '').trim().toLowerCase();
    return canon.startsWith('media:') && canon !== 'media:book';
  });
  if (hasExplicitNonBookMedia) return base;

  // Remove any previous guardrail genre tags to avoid contradictions.
  const filtered = base.filter((t) => {
    const canon = String(t || '').trim().toLowerCase();
    return canon !== 'genre:juvenile fiction' && canon !== 'genre:middle grade fiction';
  });
  filtered.push(deriveAgeBandGenreTag(filtered));
  return filtered;
}

export const k2: SwipeDeck = {
  deckKey: 'k2',
  deckLabel: 'Kids (K–2)',
  // Prevent NaN targets in the UI; SwipeDeckScreen reads these.
  rules: {
    targetSwipesBeforeRecommend: 12,
    allowUpToSwipesBeforeRecommend: 15,
  },
  cards: [
    {
      title: "The Very Hungry Caterpillar",
      author: "Eric Carle",
      genre: "animals",
      tags: [
        "media:book",
        "layout:younger",
        "genre:animals",
        "genre:nature",
        "vibe:counting",
        "vibe:growth",
        "vibe:simple",
        "vibe:bright",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["animals", "nature"],
        vibes: ["counting", "growth", "simple", "bright"],
      },
    },
    {
      title: "Brown Bear, Brown Bear, What Do You See?",
      author: "Bill Martin Jr.",
      genre: "animals",
      tags: [
        "media:book",
        "layout:younger",
        "topic:bear",
        "genre:animals",
        "vibe:rhythm",
        "vibe:repetition",
        "vibe:colors",
        "vibe:simple",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["animals"],
        vibes: ["rhythm", "repetition", "colors", "simple"],
      },
    },
    {
      title: "Goodnight Moon",
      author: "Margaret Wise Brown",
      genre: "bedtime",
      tags: [
        "media:book",
        "layout:younger",
        "topic:rabbit",
        "genre:bedtime",
        "genre:family",
        "vibe:calm",
        "vibe:soothing",
        "vibe:routine",
        "vibe:cozy",
        "format:Bedtime Story",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["bedtime", "family"],
        vibes: ["calm", "soothing", "routine", "cozy"],
      },
    },
    {
      title: "Where the Wild Things Are",
      author: "Maurice Sendak",
      genre: "fantasy",
      tags: [
        "media:book",
        "layout:neutral",
        "genre:fantasy",
        "genre:adventure",
        "vibe:imagination",
        "vibe:big feelings",
        "vibe:misbehavior",
        "vibe:homecoming",
        "format:Classic Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["fantasy", "adventure"],
        vibes: ["imagination", "big feelings", "misbehavior", "homecoming"],
      },
    },
    {
      title: "Chicka Chicka Boom Boom",
      author: "Bill Martin Jr. & John Archambault",
      genre: "alphabet",
      tags: [
        "media:book",
        "layout:younger",
        "genre:alphabet",
        "vibe:rhythm",
        "vibe:letters",
        "vibe:playful",
        "vibe:repetition",
        "format:Alphabet / Rhyming",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["alphabet"],
        vibes: ["rhythm", "letters", "playful", "repetition"],
      },
    },
    {
      title: "Green Eggs and Ham",
      author: "Dr. Seuss",
      genre: "humor",
      tags: [
        "media:book",
        "layout:younger",
        "genre:humor",
        "vibe:silly",
        "vibe:repetition",
        "vibe:trying new things",
        "vibe:rhyming",
        "format:Rhyming / Humor",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["silly", "repetition", "trying new things", "rhyming"],
      },
    },
    {
      title: "The Cat in the Hat",
      author: "Dr. Seuss",
      genre: "humor",
      tags: [
        "media:book",
        "layout:neutral",
        "topic:cat",
        "genre:humor",
        "vibe:mischief",
        "vibe:rhyming",
        "vibe:chaos",
        "vibe:playful",
        "format:Rhyming / Humor",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["mischief", "rhyming", "chaos", "playful"],
      },
    },
    {
      title: "If You Give a Mouse a Cookie",
      author: "Laura Numeroff",
      genre: "humor",
      tags: [
        "media:book",
        "layout:younger",
        "genre:humor",
        "vibe:cause and effect",
        "vibe:playful",
        "vibe:everyday life",
        "vibe:silly",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["cause and effect", "playful", "everyday life", "silly"],
      },
    },
    {
      title: "Don't Let the Pigeon Drive the Bus!",
      author: "Mo Willems",
      genre: "humor",
      tags: [
        "media:book",
        "layout:neutral",
        "genre:humor",
        "vibe:break the rules",
        "vibe:persuasive",
        "vibe:sassy",
        "vibe:silly",
        "format:Humor",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["break the rules", "persuasive", "sassy", "silly"],
      },
    },
    {
      title: "Frog and Toad Are Friends",
      author: "Arnold Lobel",
      genre: "friendship",
      tags: [
        "media:book",
        "layout:older",
        "genre:friendship",
        "vibe:gentle",
        "vibe:episodic",
        "vibe:warm",
        "vibe:everyday",
        "format:Early Reader",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["friendship"],
        vibes: ["gentle", "episodic", "warm", "everyday"],
      },
    },
    {
      title: "Pete the Cat: I Love My White Shoes",
      author: "Eric Litwin",
      genre: "music",
      tags: [
        "media:book",
        "layout:neutral",
        "topic:cat",
        "genre:music",
        "genre:humor",
        "vibe:optimistic",
        "vibe:repetition",
        "vibe:groovy",
        "vibe:resilience",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["music", "humor"],
        vibes: ["optimistic", "repetition", "groovy", "resilience"],
      },
    },
    {
      title: "Dragons Love Tacos",
      author: "Adam Rubin",
      genre: "humor",
      tags: [
        "media:book",
        "layout:neutral",
        "topic:dragon",
        "genre:humor",
        "genre:fantasy",
        "vibe:absurd",
        "vibe:silly",
        "vibe:surprise",
        "vibe:playful",
        "format:Humor",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor", "fantasy"],
        vibes: ["absurd", "silly", "surprise", "playful"],
      },
    },
    {
      title: "The Day the Crayons Quit",
      author: "Drew Daywalt",
      genre: "humor",
      tags: [
        "media:book",
        "layout:older",
        "genre:humor",
        "vibe:creative",
        "vibe:personified objects",
        "vibe:school",
        "vibe:quirky",
        "format:Humor",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["creative", "personified objects", "school", "quirky"],
      },
    },
    {
      title: "Giraffes Can't Dance",
      author: "Giles Andreae",
      genre: "animals",
      tags: [
        "media:book",
        "layout:neutral",
        "genre:animals",
        "vibe:self confidence",
        "vibe:encouraging",
        "vibe:rhyming",
        "vibe:uplifting",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["animals"],
        vibes: ["self confidence", "encouraging", "rhyming", "uplifting"],
      },
    },
    {
      title: "The Gruffalo",
      author: "Julia Donaldson",
      genre: "fantasy",
      tags: [
        "media:book",
        "layout:neutral",
        "topic:fox",
        "genre:fantasy",
        "vibe:clever hero",
        "vibe:rhyming",
        "vibe:forest",
        "vibe:brave",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["fantasy"],
        vibes: ["clever hero", "rhyming", "forest", "brave"],
      },
    },
    {
      title: "Olivia",
      author: "Ian Falconer",
      genre: "family",
      tags: [
        "media:book",
        "layout:neutral",
        "genre:family",
        "genre:humor",
        "vibe:strong willed",
        "vibe:everyday life",
        "vibe:quirky",
        "vibe:imagination",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["family", "humor"],
        vibes: ["strong willed", "everyday life", "quirky", "imagination"],
      },
    },
    {
      title: "The Snowy Day",
      author: "Ezra Jack Keats",
      genre: "family",
      tags: [
        "media:book",
        "layout:younger",
        "genre:family",
        "vibe:quiet",
        "vibe:wonder",
        "vibe:winter",
        "vibe:community",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["family"],
        vibes: ["quiet", "wonder", "winter", "community"],
      },
    },
    {
      title: "Corduroy",
      author: "Don Freeman",
      genre: "friendship",
      tags: [
        "media:book",
        "layout:neutral",
        "topic:bear",
        "genre:friendship",
        "vibe:kindness",
        "vibe:belonging",
        "vibe:gentle",
        "vibe:toy comes alive",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["friendship"],
        vibes: ["kindness", "belonging", "gentle", "toy comes alive"],
      },
    },
    {
      title: "Harold and the Purple Crayon",
      author: "Crockett Johnson",
      genre: "fantasy",
      tags: [
        "media:book",
        "layout:neutral",
        "genre:fantasy",
        "vibe:imagination",
        "vibe:creative",
        "vibe:gentle adventure",
        "vibe:curious",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["fantasy"],
        vibes: ["imagination", "creative", "gentle adventure", "curious"],
      },
    },
    {
      title: "The Rainbow Fish",
      author: "Marcus Pfister",
      genre: "friendship",
      tags: [
        "media:book",
        "layout:younger",
        "genre:friendship",
        "vibe:sharing",
        "vibe:kindness",
        "vibe:underwater",
        "vibe:lesson",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["friendship"],
        vibes: ["sharing", "kindness", "underwater", "lesson"],
      },
    },
    {
      title: "Caps for Sale",
      author: "Esphyr Slobodkina",
      genre: "humor",
      tags: [
        "media:book",
        "layout:younger",
        "topic:monkey",
        "genre:humor",
        "vibe:repetition",
        "vibe:mischief",
        "vibe:monkeys",
        "vibe:call and response",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["repetition", "mischief", "monkeys", "call and response"],
      },
    },
    {
      title: "Curious George",
      author: "H. A. Rey",
      genre: "adventure",
      tags: [
        "media:book",
        "layout:neutral",
        "topic:monkey",
        "genre:adventure",
        "vibe:curious",
        "vibe:mischief",
        "vibe:city",
        "vibe:lighthearted",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["adventure"],
        vibes: ["curious", "mischief", "city", "lighthearted"],
      },
    },
    {
      title: "Madeline",
      author: "Ludwig Bemelmans",
      genre: "adventure",
      tags: [
        "media:book",
        "layout:neutral",
        "genre:adventure",
        "vibe:brave",
        "vibe:Paris",
        "vibe:rhyming",
        "vibe:school",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["adventure"],
        vibes: ["brave", "paris", "rhyming", "school"],
      },
    },
    {
      title: "The Tale of Peter Rabbit",
      author: "Beatrix Potter",
      genre: "animals",
      tags: [
        "media:book",
        "layout:neutral",
        "topic:rabbit",
        "genre:animals",
        "vibe:mischief",
        "vibe:garden",
        "vibe:classic",
        "vibe:consequences",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["animals"],
        vibes: ["mischief", "garden", "classic", "consequences"],
      },
    },
    {
      title: "Llama Llama Red Pajama",
      author: "Anna Dewdney",
      genre: "bedtime",
      tags: [
        "media:book",
        "layout:younger",
        "genre:bedtime",
        "vibe:reassurance",
        "vibe:feelings",
        "vibe:rhyming",
        "vibe:cozy",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["bedtime"],
        vibes: ["reassurance", "feelings", "rhyming", "cozy"],
      },
    },
    {
      title: "No, David!",
      author: "David Shannon",
      genre: "humor",
      tags: [
        "media:book",
        "layout:younger",
        "genre:humor",
        "vibe:mischief",
        "vibe:family",
        "vibe:big feelings",
        "vibe:simple",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["mischief", "family", "big feelings", "simple"],
      },
    },
    {
      title: "Click, Clack, Moo: Cows That Type",
      author: "Doreen Cronin",
      genre: "humor",
      tags: [
        "media:book",
        "layout:older",
        "genre:humor",
        "vibe:farm",
        "vibe:negotiation",
        "vibe:clever",
        "vibe:silly",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["farm", "negotiation", "clever", "silly"],
      },
    },
    {
      title: "The Little Engine That Could",
      author: "Watty Piper",
      genre: "inspiration",
      tags: [
        "media:book",
        "layout:younger",
        "genre:inspiration",
        "vibe:perseverance",
        "vibe:optimistic",
        "vibe:classic",
        "vibe:encouraging",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["inspiration"],
        vibes: ["perseverance", "optimistic", "classic", "encouraging"],
      },
    },
    {
      title: "We're Going on a Bear Hunt",
      author: "Michael Rosen",
      genre: "adventure",
      tags: [
        "media:book",
        "layout:younger",
        "topic:bear",
        "genre:adventure",
        "vibe:rhythm",
        "vibe:repetition",
        "vibe:family",
        "vibe:brave",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["adventure"],
        vibes: ["rhythm", "repetition", "family", "brave"],
      },
    },
    {
      title: "The Mitten",
      author: "Jan Brett",
      genre: "animals",
      tags: [
        "media:book",
        "layout:younger",
        "topic:fox",
        "genre:animals",
        "genre:folklore",
        "vibe:winter",
        "vibe:repetition",
        "vibe:cozy",
        "vibe:classic",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["animals", "folklore"],
        vibes: ["winter", "repetition", "cozy", "classic"],
      },
    },
    {
      title: "The Polar Express",
      author: "Chris Van Allsburg",
      genre: "holiday",
      tags: [
        "media:book",
        "layout:neutral",
        "genre:holiday",
        "genre:fantasy",
        "vibe:Christmas",
        "vibe:wonder",
        "vibe:train journey",
        "vibe:nostalgic",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["holiday", "fantasy"],
        vibes: ["christmas", "wonder", "train journey", "nostalgic"],
      },
    },
    {
      title: "Room on the Broom",
      author: "Julia Donaldson",
      genre: "fantasy",
      tags: [
        "media:book",
        "layout:neutral",
        "topic:cat",
        "genre:fantasy",
        "vibe:friendship",
        "vibe:witch",
        "vibe:rhyming",
        "vibe:teamwork",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["fantasy"],
        vibes: ["friendship", "witch", "rhyming", "teamwork"],
      },
    },
    {
      title: "The Paper Bag Princess",
      author: "Robert Munsch",
      genre: "fantasy",
      tags: [
        "media:book",
        "layout:older",
        "topic:princess",
        "genre:fantasy",
        "vibe:brave heroine",
        "vibe:subverts tropes",
        "vibe:independent",
        "vibe:funny",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["fantasy"],
        vibes: ["brave heroine", "subverts tropes", "independent", "funny"],
      },
    },
    {
      title: "Alexander and the Terrible, Horrible, No Good, Very Bad Day",
      author: "Judith Viorst",
      genre: "humor",
      tags: [
        "media:book",
        "layout:older",
        "genre:humor",
        "vibe:everyday life",
        "vibe:bad day",
        "vibe:relatable",
        "vibe:family",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["everyday life", "bad day", "relatable", "family"],
      },
    },
    {
      title: "Cloudy with a Chance of Meatballs",
      author: "Judi Barrett",
      genre: "humor",
      tags: [
        "media:book",
        "layout:neutral",
        "genre:humor",
        "genre:fantasy",
        "vibe:absurd",
        "vibe:weather",
        "vibe:silly",
        "vibe:imagination",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor", "fantasy"],
        vibes: ["absurd", "weather", "silly", "imagination"],
      },
    },
    {
      title: "The True Story of the 3 Little Pigs",
      author: "Jon Scieszka",
      genre: "humor",
      tags: [
        "media:book",
        "layout:older",
        "genre:humor",
        "vibe:unreliable narrator",
        "vibe:twist",
        "vibe:fairy tale",
        "vibe:clever",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["unreliable narrator", "twist", "fairy tale", "clever"],
      },
    },
    {
      title: "The Monster at the End of This Book",
      author: "Jon Stone",
      genre: "humor",
      tags: [
        "media:book",
        "layout:neutral",
        "genre:humor",
        "vibe:interactive",
        "vibe:fourth wall",
        "vibe:silly",
        "vibe:fear",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["interactive", "fourth wall", "silly", "fear"],
      },
    },
    {
      title: "I Want My Hat Back",
      author: "Jon Klassen",
      genre: "humor",
      tags: [
        "media:book",
        "layout:older",
        "topic:bear",
        "genre:humor",
        "vibe:deadpan",
        "vibe:mystery",
        "vibe:animals",
        "vibe:twist ending",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["deadpan", "mystery", "animals", "twist ending"],
      },
    },
    {
      title: "Ada Twist, Scientist",
      author: "Andrea Beaty",
      genre: "science",
      tags: [
        "media:book",
        "layout:older",
        "genre:science",
        "vibe:curious",
        "vibe:STEM",
        "vibe:questions",
        "vibe:persistent",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["science"],
        vibes: ["curious", "stem", "questions", "persistent"],
      },
    },
    {
      title: "Last Stop on Market Street",
      author: "Matt de la Peña",
      genre: "family",
      tags: [
        "media:book",
        "layout:older",
        "genre:family",
        "vibe:community",
        "vibe:gratitude",
        "vibe:city",
        "vibe:thoughtful",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["family"],
        vibes: ["community", "gratitude", "city", "thoughtful"],
      },
    },
    {
      title: "The Pout-Pout Fish",
      author: "Deborah Diesen",
      genre: "friendship",
      tags: [
        "media:book",
        "layout:younger",
        "genre:friendship",
        "vibe:mood shift",
        "vibe:underwater",
        "vibe:rhythm",
        "vibe:uplifting",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["friendship"],
        vibes: ["mood shift", "underwater", "rhythm", "uplifting"],
      },
    },
    {
      title: "The Book with No Pictures",
      author: "B. J. Novak",
      genre: "humor",
      tags: [
        "media:book",
        "layout:neutral",
        "genre:humor",
        "vibe:silly",
        "vibe:interactive",
        "vibe:read aloud",
        "vibe:absurd",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["silly", "interactive", "read aloud", "absurd"],
      },
    },
    {
      title: "The Bad Seed",
      author: "Jory John",
      genre: "humor",
      tags: [
        "media:book",
        "layout:older",
        "genre:humor",
        "vibe:second chances",
        "vibe:feelings",
        "vibe:self control",
        "vibe:quirky",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["humor"],
        vibes: ["second chances", "feelings", "self control", "quirky"],
      },
    },
    {
      title: "Creepy Carrots!",
      author: "Aaron Reynolds",
      genre: "mystery",
      tags: [
        "media:book",
        "layout:older",
        "topic:rabbit",
        "genre:mystery",
        "genre:humor",
        "vibe:spooky",
        "vibe:suspense",
        "vibe:funny",
        "vibe:twist",
        "format:Picture Book",
        "audience:children",
        "age:k2",
      ],

      output: {
        genre: ["mystery", "humor"],
        vibes: ["spooky", "suspense", "funny", "twist"],
      },
    },

    // Imported from screens/swipe/defaultCards.ts (K–2)
    { isDefault: true, title: "Don’t Let the Pigeon Drive the Bus!", author: "Mo Willems", genre: "Humor", tags: ["audience:children", "age:k2", "format:picture_book", "genre:humor", "vibe:silly"] },
    { isDefault: true, title: "There’s a Monster at the End of This Book", author: "Jon Stone", genre: "Humor / Classic", tags: ["audience:children", "age:k2", "format:picture_book", "genre:humor", "vibe:meta"] },
    { isDefault: true, title: "We Are in a Book!", author: "Mo Willems", genre: "Humor / Early Reader", tags: ["audience:children", "age:k2", "format:early_reader", "genre:humor", "vibe:fast_paced"] },
    { isDefault: true, title: "Clifford the Big Red Dog", author: "Norman Bridwell", genre: "Animals / Character", tags: ["audience:children", "age:k2", "format:picture_book", "genre:animals", "vibe:wholesome"] },
    { isDefault: true, title: "Froggy Gets Dressed", author: "Jonathan London", genre: "Humor / Everyday", tags: ["audience:children", "age:k2", "format:picture_book", "genre:humor", "vibe:silly"] },
    { isDefault: true, title: "How Do Dinosaurs Say Goodnight?", author: "Jane Yolen", genre: "Dinosaurs / Bedtime", tags: ["audience:children", "age:k2", "format:picture_book", "topic:dinosaurs", "genre:bedtime", "vibe:warm"] },
    { isDefault: true, title: "First Big Book of Animals", author: "Catherine D. Hughes", genre: "Animals / Nonfiction", tags: ["audience:children", "age:k2", "format:nonfiction", "genre:animals"] },
    { isDefault: true, title: "Goodnight, Goodnight, Construction Site", author: "Sherri Duskey Rinker", genre: "Vehicles / Bedtime", tags: ["audience:children", "age:k2", "format:picture_book", "topic:vehicles", "genre:bedtime", "vibe:calm"] },
    { isDefault: true, title: "The Color Monster", author: "Anna Llenas", genre: "SEL / Feelings", tags: ["audience:children", "age:k2", "format:picture_book", "topic:feelings", "vibe:gentle"] },
    { isDefault: true, title: "The Invisible String", author: "Patrice Karst", genre: "SEL / Family", tags: ["audience:children", "age:k2", "format:picture_book", "topic:family", "topic:feelings", "vibe:cozy"] },
    { isDefault: true, title: "Not a Box", author: "Antoinette Portis", genre: "Imagination", tags: ["audience:children", "age:k2", "format:picture_book"] },
    { isDefault: true, title: "I Am a Frog!", author: "Mo Willems", genre: "Early Reader / Humor", tags: ["audience:children", "age:k2", "format:early_reader", "genre:humor", "vibe:friendship"] },
    { isDefault: true, title: "Pete the Cat and the Missing Cupcakes", author: "Kimberly & James Dean", genre: "Character / Mystery-lite", tags: ["audience:children", "age:k2", "format:picture_book", "genre:mystery", "vibe:playful"] },
    { isDefault: true, title: "Bluey", author: "ABC / Disney", genre: "Family / Imagination / Empathy", wikiTitle: "Bluey (2018 TV series)", tags: ["audience:children", "age:k2", "media:tv", "genre:family", "genre:friendship", "theme:kindness", "tone:warm", "vibe:playful"] },
    { isDefault: true, title: "Daniel Tiger’s Neighborhood", author: "PBS", genre: "Feelings / Routine / Kindness", wikiTitle: "Daniel Tiger's Neighborhood", tags: ["audience:children", "age:k2", "media:tv", "theme:feelings", "theme:kindness", "tone:gentle", "vibe:calm"] },
    { isDefault: true, title: "Puffin Rock", author: "Netflix", genre: "Friendship / Nature / Calm", wikiTitle: "Puffin Rock", tags: ["audience:children", "age:k2", "media:tv", "genre:animals", "theme:friendship", "theme:nature", "tone:calm", "vibe:calm"] },
    { isDefault: true, title: "Octonauts", author: "BBC / Netflix", genre: "Animals / Science / Teamwork", wikiTitle: "Octonauts", tags: ["audience:children", "age:k2", "media:tv", "genre:animals", "genre:science_fiction", "theme:teamwork", "tone:adventurous"] },
    { isDefault: true, title: "Wild Kratts", author: "PBS", genre: "Animals / Adventure / Learning", wikiTitle: "Wild Kratts", tags: ["audience:children", "age:k2", "media:tv", "genre:animals", "genre:adventure", "theme:learning", "tone:energetic"] },
    { isDefault: true, title: "Go, Dog. Go!", author: "Netflix", genre: "Animals / Community / Fun", wikiTitle: "Go, Dog. Go!", tags: ["audience:children", "age:k2", "media:tv", "genre:animals", "theme:community", "tone:playful", "vibe:silly"] },
    { isDefault: true, title: "Paw Patrol", author: "Nickelodeon", genre: "Helping / Teamwork / Courage", wikiTitle: "PAW Patrol", tags: ["audience:children", "age:k2", "media:tv", "theme:kindness", "theme:teamwork", "theme:courage", "tone:uplifting", "vibe:heroic"] },
    { isDefault: true, title: "Tumble Leaf", author: "Amazon", genre: "Curiosity / Problem-Solving / Nature", wikiTitle: "Tumble Leaf", tags: ["audience:children", "age:k2", "media:tv", "theme:problem_solving", "theme:nature", "tone:gentle", "vibe:whimsical"] },
    { isDefault: true, title: "Peg + Cat", author: "PBS", genre: "Math / Logic / Humor", wikiTitle: "Peg + Cat", tags: ["audience:children", "age:k2", "media:tv", "theme:problem_solving", "tone:playful", "vibe:clever"] },
    { isDefault: true, title: "Creative Galaxy", author: "Amazon", genre: "Creativity / Art / Expression", wikiTitle: "Creative Galaxy", tags: ["audience:children", "age:k2", "media:tv", "theme:art", "tone:uplifting"] },
    { isDefault: true, title: "My Little Pony: Friendship Is Magic", author: "Hasbro", genre: "Friendship / Fantasy / Growth", wikiTitle: "My Little Pony: Friendship Is Magic", tags: ["audience:children", "age:k2", "media:tv", "genre:fantasy", "theme:friendship", "theme:emotional_growth", "tone:uplifting", "vibe:hopeful"] },
    { isDefault: true, title: "Sarah & Duck", author: "BBC", genre: "Whimsy / Observation / Calm", wikiTitle: "Sarah & Duck", tags: ["audience:children", "age:k2", "media:tv", "theme:observation", "theme:friendship", "tone:calm", "vibe:quirky"] },
    { isDefault: true, title: "Sesame Street", author: "PBS", genre: "Learning / Friendship / Songs", wikiTitle: "Sesame Street", tags: ["audience:children", "age:k2", "media:tv", "genre:learning", "theme:friendship", "format:series"] },
    { isDefault: true, title: "Mister Rogers’ Neighborhood", author: "PBS", genre: "Feelings / Kindness / Calm", wikiTitle: "Mister Rogers' Neighborhood", tags: ["audience:children", "age:k2", "media:tv", "genre:feelings", "genre:kindness", "genre:calm", "format:series"] },
    { isDefault: true, title: "StoryBots", author: "Netflix", genre: "Science / Curiosity / Humor", wikiTitle: "Ask the StoryBots", tags: ["audience:children", "age:k2", "media:tv", "genre:science_fiction", "genre:humor", "format:series"] },
    { isDefault: true, title: "Super Why!", author: "PBS", genre: "Reading / Adventures / Problem-Solving", wikiTitle: "Super Why!", tags: ["audience:children", "age:k2", "media:tv", "genre:adventure", "genre:problem_solving", "format:series"] },
    { isDefault: true, title: "Blue’s Clues & You!", author: "Nickelodeon", genre: "Mystery / Observation / Participation", wikiTitle: "Blue's Clues & You!", tags: ["audience:children", "age:k2", "media:tv", "genre:mystery", "genre:observation", "format:series"] },
    { isDefault: true, title: "Numberblocks", author: "BBC / Netflix", genre: "Math / Patterns / Learning", wikiTitle: "Numberblocks", tags: ["audience:children", "age:k2", "media:tv", "genre:learning", "format:series"] },
    { isDefault: true, title: "Little Bear", author: "Nick Jr.", genre: "Gentle / Everyday / Friendship", wikiTitle: "Little Bear (TV series)", tags: ["audience:children", "age:k2", "media:tv", "genre:gentle", "theme:friendship", "format:series"] },
    { isDefault: true, title: "Franklin", author: "PBS / Nick Jr.", genre: "Friendship / Growing Up / Lessons", wikiTitle: "Franklin (TV series)", tags: ["audience:children", "age:k2", "media:tv", "theme:friendship", "genre:growing_up", "format:series"] },
    { isDefault: true, title: "Toy Story", author: "Pixar", genre: "Illustrated / Friendship", wikiTitle: "Toy Story", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "theme:friendship"] },
    { isDefault: true, title: "Finding Nemo", author: "Pixar", genre: "Illustrated / Adventure", wikiTitle: "Finding Nemo", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "genre:adventure"] },
    { isDefault: true, title: "Monsters, Inc.", author: "Pixar", genre: "Illustrated / Comedy", wikiTitle: "Monsters, Inc.", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "genre:comedy"] },
    { isDefault: true, title: "Paddington", author: "StudioCanal", genre: "Family / Comedy", wikiTitle: "Paddington (film)", tags: ["audience:children", "age:k2", "media:movie", "theme:family", "genre:comedy"] },
    { isDefault: true, title: "Paddington 2", author: "StudioCanal", genre: "Family / Comedy", wikiTitle: "Paddington 2", tags: ["audience:children", "age:k2", "media:movie", "theme:family", "genre:comedy"] },
    { isDefault: true, title: "Winnie the Pooh (2011)", author: "Disney", genre: "Illustrated / Family", wikiTitle: "Winnie the Pooh (2011 film)", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "theme:family"] },
    { isDefault: true, title: "The Many Adventures of Winnie the Pooh", author: "Disney", genre: "Illustrated / Family", wikiTitle: "The Many Adventures of Winnie the Pooh", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "theme:family"] },
    { isDefault: true, title: "My Neighbor Totoro", author: "Studio Ghibli", genre: "Illustrated / Fantasy", wikiTitle: "My Neighbor Totoro", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "genre:fantasy"] },
    { isDefault: true, title: "The Secret Life of Pets", author: "Illumination", genre: "Illustrated / Comedy", wikiTitle: "The Secret Life of Pets", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "genre:comedy"] },
    { isDefault: true, title: "Cars", author: "Pixar", genre: "Illustrated / Adventure", wikiTitle: "Cars (film)", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "genre:adventure"] },
    { isDefault: true, title: "Inside Out", author: "Pixar", genre: "Illustrated / Feelings", wikiTitle: "Inside Out (2015 film)", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "genre:feelings"] },
    { isDefault: true, title: "The Incredibles", author: "Pixar", genre: "Illustrated / Superhero", wikiTitle: "The Incredibles", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "genre:superheroes"] },
    { isDefault: true, title: "WALL·E", author: "Pixar", genre: "Illustrated / Sci‑Fi", wikiTitle: "WALL-E", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "genre:science_fiction"] },
    { isDefault: true, title: "The Peanuts Movie", author: "Blue Sky", genre: "Illustrated / Friendship", wikiTitle: "The Peanuts Movie", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "theme:friendship"] },
    { isDefault: true, title: "Curious George (2006)", author: "Universal", genre: "Illustrated / Adventure", wikiTitle: "Curious George (film)", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "genre:adventure"] },
    { isDefault: true, title: "Minecraft", author: "Mojang", genre: "Creative / Sandbox", wikiTitle: "Minecraft", tags: ["media:game", "audience:children", "age:k2"] },
    { isDefault: true, title: "Animal Crossing: New Horizons", author: "Nintendo", genre: "Cozy / Life Sim", wikiTitle: "Animal Crossing: New Horizons", tags: ["media:game", "audience:children", "age:k2", "vibe:cozy"] },
    { isDefault: true, title: "Mario Kart 8 Deluxe", author: "Nintendo", genre: "Racing / Party", wikiTitle: "Mario Kart 8 Deluxe", tags: ["media:game", "audience:children", "age:k2"] },
    { isDefault: true, title: "Super Mario Odyssey", author: "Nintendo", genre: "Platformer / Adventure", wikiTitle: "Super Mario Odyssey", tags: ["media:game", "audience:children", "age:k2", "genre:adventure"] },
    { isDefault: true, title: "Kirby and the Forgotten Land", author: "Nintendo", genre: "Platformer / Adventure", wikiTitle: "Kirby and the Forgotten Land", tags: ["media:game", "audience:children", "age:k2", "genre:adventure"] },
    { isDefault: true, title: "Yoshi’s Crafted World", author: "Nintendo", genre: "Platformer / Cozy", wikiTitle: "Yoshi's Crafted World", tags: ["media:game", "audience:children", "age:k2", "vibe:cozy"] },
    { isDefault: true, title: "LEGO City Undercover", author: "TT Games", genre: "Adventure / Comedy", wikiTitle: "Lego City Undercover", tags: ["media:game", "audience:children", "age:k2", "genre:adventure", "genre:comedy"] },
    { isDefault: true, title: "LEGO Marvel Super Heroes", author: "TT Games", genre: "Action / Adventure", wikiTitle: "Lego Marvel Super Heroes", tags: ["media:game", "audience:children", "age:k2", "genre:action", "genre:adventure"] },
    { isDefault: true, title: "Paw Patrol: On a Roll!", author: "Outright Games", genre: "Kids / Platformer", wikiTitle: "Paw Patrol: On a Roll!", tags: ["media:game", "audience:children", "age:k2"] },
    { isDefault: true, title: "Pokémon: Let’s Go, Pikachu! / Eevee!", author: "Nintendo", genre: "Adventure / Creatures", wikiTitle: "Pokémon: Let's Go, Pikachu!", tags: ["media:game", "audience:children", "age:k2", "genre:adventure", "genre:creatures"] },
    { isDefault: true, title: "New Pokémon Snap", author: "Nintendo", genre: "Photography / Adventure", wikiTitle: "New Pokémon Snap", tags: ["media:game", "audience:children", "age:k2", "genre:adventure"] },
    { isDefault: true, title: "Scribblenauts Unlimited", author: "Warner Bros.", genre: "Puzzle / Creativity", wikiTitle: "Scribblenauts Unlimited", tags: ["media:game", "audience:children", "age:k2"] },
    { isDefault: true, title: "Untitled Goose Game", author: "House House", genre: "Comedy / Puzzle", wikiTitle: "Untitled Goose Game", tags: ["media:game", "audience:children", "age:k2", "genre:comedy"] },
    { isDefault: true, title: "Alba: A Wildlife Adventure", author: "ustwo", genre: "Adventure / Nature", wikiTitle: "Alba: A Wildlife Adventure", tags: ["media:game", "audience:children", "age:k2", "genre:adventure", "genre:nature"] },
    { isDefault: true, title: "Disney Dreamlight Valley", author: "Gameloft", genre: "Cozy / Adventure", wikiTitle: "Disney Dreamlight Valley", tags: ["media:game", "audience:children", "age:k2", "vibe:cozy", "genre:adventure"] },

    // New additions (+10)
    { isDefault: true, title: "Interrupting Chicken", author: "David Ezra Stein", genre: "humor", tags: ["media:book", "layout:younger", "genre:humor", "vibe:bedtime", "vibe:interrupting", "vibe:silly", "vibe:read aloud", "format:Picture Book", "audience:children", "age:k2"] },
    { isDefault: true, title: "Nanette's Baguette", author: "Mo Willems", genre: "humor", tags: ["media:book", "layout:older", "genre:humor", "vibe:rhyming", "vibe:wordplay", "vibe:family", "vibe:funny", "format:Picture Book", "audience:children", "age:k2"] },
    { isDefault: true, title: "Elephant & Piggie: My New Friend Is So Fun!", author: "Mo Willems", genre: "friendship", tags: ["media:book", "layout:older", "genre:friendship", "vibe:funny", "vibe:everyday", "vibe:gentle", "format:Early Reader", "audience:children", "age:k2"] },
    { isDefault: true, title: "Molly of Denali", author: "PBS", genre: "Adventure / Family", wikiTitle: "Molly of Denali", tags: ["audience:children", "age:k2", "media:tv", "genre:adventure", "theme:family", "theme:community", "tone:uplifting", "format:series"] },
    { isDefault: true, title: "Trash Truck", author: "Netflix", genre: "Friendship / Calm", wikiTitle: "Trash Truck", tags: ["audience:children", "age:k2", "media:tv", "theme:friendship", "tone:gentle", "vibe:cozy", "format:series"] },
    { isDefault: true, title: "Kiki's Delivery Service", author: "Studio Ghibli", genre: "Illustrated / Fantasy", wikiTitle: "Kiki's Delivery Service", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "genre:fantasy", "theme:independence", "vibe:cozy"] },
    { isDefault: true, title: "Ratatouille", author: "Pixar", genre: "Illustrated / Comedy", wikiTitle: "Ratatouille (film)", tags: ["audience:children", "age:k2", "media:movie", "genre:animation", "genre:comedy", "theme:creativity"] },
    { isDefault: true, title: "Lil Gator Game", author: "MegaWobble", genre: "Adventure / Cozy", wikiTitle: "Lil Gator Game", tags: ["audience:children", "age:k2", "media:game", "genre:adventure", "vibe:cozy", "theme:imagination"] },
    { isDefault: true, title: "A Short Hike", author: "adamgryu", genre: "Adventure / Nature", wikiTitle: "A Short Hike", tags: ["audience:children", "age:k2", "media:game", "genre:adventure", "genre:nature", "vibe:gentle", "vibe:cozy"] },
    { isDefault: true, title: "Unicorn Academy", author: "Netflix", genre: "Fantasy / Friendship", wikiTitle: "Unicorn Academy", tags: ["audience:children", "age:k2", "media:tv", "genre:fantasy", "theme:friendship", "tone:uplifting", "vibe:hopeful"] },
],
};

// Inject the derived age-band genre guardrail tag onto every card (without touching
// the canonical per-card tag lists above).
k2.cards = k2.cards.map((c) => ({
  ...c,
  tags: withDerivedGenreTag((c as any).tags),
}));

export default k2;
