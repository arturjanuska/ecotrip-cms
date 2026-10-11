import { Schema, model, models, type Model } from "mongoose";
import type { ChangeLogEntry } from "@/lib/change-log-types";

type StoredEntry = Omit<ChangeLogEntry, "_id" | "createdAt"> & {
  createdAt: Date;
};

// Written by lib/change-log.ts only; `changes` is stored as is.
const changeLogSchema = new Schema(
  {
    user: {
      id: { type: String, required: true },
      name: { type: String, required: true },
    },
    page: { type: String, required: true },
    // { key, params } (older entries: an English string).
    summary: { type: Schema.Types.Mixed, required: true },
    changeCount: { type: Number, required: true },
    changes: { type: [Schema.Types.Mixed], default: [] },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    minimize: false,
  },
);
changeLogSchema.index({ createdAt: -1, _id: -1 });

export const ChangeLog: Model<StoredEntry> =
  (models.ChangeLog as Model<StoredEntry> | undefined) ??
  (model("ChangeLog", changeLogSchema) as unknown as Model<StoredEntry>);
