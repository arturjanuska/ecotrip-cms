import type { en } from "@/lib/i18n/messages/en";

// Lithuanian has more plural forms than English: next to `x_one` / `x_other`
// a dictionary may add `x_few` and `x_many` (picked by Intl.PluralRules).
type PluralExtras<T> = {
  [
    Key in keyof T as Key extends `${infer Base}_other`
      ? `${Base}_few` | `${Base}_many`
      : never
  ]?: string;
};

type Shape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : Shape<T[Key]>;
} & PluralExtras<T>;

// Every dictionary has the keys of en.ts, with any texts.
export type Messages = Shape<typeof en>;
