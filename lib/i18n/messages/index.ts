import type { Locale } from "@/lib/i18n/config";
import { en } from "@/lib/i18n/messages/en";
import { lt } from "@/lib/i18n/messages/lt";
import type { Messages } from "@/lib/i18n/messages/types";

export type { Messages };

export const DICTIONARIES: Record<Locale, Messages> = { en, lt };
