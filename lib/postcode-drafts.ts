import type { Postcode } from "@/lib/postcode-types";
import { updatePostcodeSchema } from "@/lib/validation/postcode";

// Text fields editable in the CMS table (`postcode` and `country` are read-only there).
export const EDITABLE_TEXT_FIELDS = [
  "town",
  "region",
  "countryString",
  "basicPrice",
  "additionalCharges",
  "parcelForceZone",
  "discount",
  "calendar",
] as const;

export type EditableTextField = (typeof EDITABLE_TEXT_FIELDS)[number];

// Unsaved edits of one row. Only fields that differ from the stored record are
// kept, so a row with a draft always has something to save.
export type Draft = Partial<Record<EditableTextField, string>> & {
  active?: boolean;
};

type Editable = Pick<Postcode, EditableTextField | "active">;

export function pruneDraft(item: Editable, draft: Draft | undefined) {
  if (!draft) {
    return undefined;
  }

  const next: Draft = {};
  for (const field of EDITABLE_TEXT_FIELDS) {
    const value = draft[field];
    if (value !== undefined && value !== item[field]) {
      next[field] = value;
    }
  }
  if (draft.active !== undefined && draft.active !== item.active) {
    next.active = draft.active;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function withDraft(
  drafts: Record<string, Draft>,
  id: string,
  draft: Draft | undefined,
) {
  const next = { ...drafts };
  if (draft) {
    next[id] = draft;
  } else {
    delete next[id];
  }
  return next;
}

// Same rules as the API, so Save is only enabled for changes it will accept.
export function validateDraft(draft: Draft) {
  const result = updatePostcodeSchema.safeParse(draft);
  if (result.success) {
    return null;
  }

  const issues = result.error.issues;
  return {
    fields: new Set(issues.map((issue) => String(issue.path[0]))),
    message: issues
      .map((issue) => `${String(issue.path[0])}: ${issue.message}`)
      .join("; "),
  };
}

// Drops draft fields that already match freshly loaded records (for example
// after a bulk update). Returns the same object when nothing changes.
export function pruneDrafts(drafts: Record<string, Draft>, items: Postcode[]) {
  let next = drafts;
  for (const item of items) {
    const draft = drafts[item._id];
    if (!draft) {
      continue;
    }

    const pruned = pruneDraft(item, draft);
    if (!pruned || Object.keys(pruned).length !== Object.keys(draft).length) {
      next = withDraft(next, item._id, pruned);
    }
  }
  return next;
}
