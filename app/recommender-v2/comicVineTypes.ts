export type ComicVinePublicationIdentity =
  | "graphic_novel"
  | "trade_paperback"
  | "hardcover_collection"
  | "collected_edition"
  | "deluxe_edition"
  | "omnibus"
  | "compendium"
  | "story_arc"
  | "limited_series"
  | "ongoing_series"
  | "single_issue"
  | "annual"
  | "one_shot"
  | "magazine"
  | "art_book"
  | "reference_book"
  | "encyclopedia"
  | "companion_guide"
  | "movie_or_tv_tie_in"
  | "prose_novel"
  | "coloring_book"
  | "activity_book"
  | "rpg_supplement"
  | "trading_card_guide"
  | "toy_guide"
  | "unknown";

export type ComicVineEntityType =
  | "graphic_novel"
  | "trade_paperback"
  | "collected_edition"
  | "omnibus"
  | "story_arc"
  | "limited_series"
  | "ongoing_series"
  | "single_issue"
  | "annual"
  | "one_shot"
  | "reference"
  | "encyclopedia"
  | "art_book"
  | "companion_guide"
  | "movie_or_tv_tie_in"
  | "other_or_unknown";

export type ComicVinePolicyBucket =
  | "preferred"
  | "allowed"
  | "fallback_only"
  | "restricted"
  | "excluded";

export type ComicVineIdentityConfidence = "high" | "medium" | "low";

export type ComicVineIssueAccessibility =
  | "not_issue_like"
  | "issue_one"
  | "middle_issue"
  | "annual"
  | "one_shot"
  | "unknown_issue_position";

export type ComicVineFallbackState =
  | "not_applicable"
  | "eligible"
  | "released"
  | "withheld";

export type ComicVineRange = {
  start: number;
  end: number;
};

export interface ComicVineEntityMetadata {
  sourceId?: string;
  identity: ComicVinePublicationIdentity;
  entityType: ComicVineEntityType;
  policyBucket: ComicVinePolicyBucket;
  confidence: ComicVineIdentityConfidence;
  classificationEvidence: string[];
  precedenceRule: string;
  resourceType?: string;
  publisher?: string;
  aliases: string[];
  volumeId?: string;
  volumeName?: string;
  issueNumber?: number;
  seriesRoot?: string;
  titleRoot?: string;
  familyKey?: string;
  collectionIssueRange?: ComicVineRange;
  collectionVolumeRange?: ComicVineRange;
  volumeNumber?: number;
  issueAccessibility: ComicVineIssueAccessibility;
  collapseReason?: string;
  collapseWinnerSourceId?: string;
  collapseLoserSourceIds?: string[];
  fallbackEligible?: boolean;
  fallbackState?: ComicVineFallbackState;
  fallbackReason?: string;
}
