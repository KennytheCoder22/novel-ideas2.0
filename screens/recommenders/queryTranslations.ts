export const QUERY_TRANSLATIONS = {
  genre: {
    fantasy: ["fantasy novel"],
    thriller: ["suspense novel"],
    mystery: ["mystery novel"],
    crime: ["crime fiction"],
    horror: ["horror novel"],
    "science fiction": ["science fiction novel"],
    romance: ["romance novel"],
    "historical fiction": ["historical fiction novel"],
  },

  tone: {
    dark: ["dark", "psychological", "noir"],
    cozy: ["cozy"],
    hopeful: ["hopeful"],
    humorous: ["funny"],
    spooky: ["gothic", "haunting"],
    epic: ["epic"],
    atmospheric: ["atmospheric", "moody"],
    realistic: ["grounded"],
    psychological: ["psychological"],
  },

  pacing: {
    "fast-paced": ["fast-paced", "gripping"],
    "slow-burn": ["slow-burn"],
  },

  scenario: {
    politics: ["political intrigue", "power struggle"],
    betrayal: ["betrayal", "family secrets"],
    quest: ["quest", "journey"],
    war: ["war"],
    investigation: ["investigation"],
    survival: ["survival"],
    family: ["family story"],
    mythic: ["mythic", "prophecy"],
  },
} as const;