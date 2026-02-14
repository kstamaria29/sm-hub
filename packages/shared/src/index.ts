export const CLASSIC_MAPPING_ID = "classic_v1";

export const FAMILY_ROLES = ["owner", "admin", "member"] as const;
export type FamilyRole = (typeof FAMILY_ROLES)[number];

export const AVATAR_EXPRESSIONS = ["neutral", "happy", "angry", "crying"] as const;
export type AvatarExpression = (typeof AVATAR_EXPRESSIONS)[number];
