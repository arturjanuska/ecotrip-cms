import "server-only";
import { getActor } from "@/lib/auth";
import {
  CHANGE_LOG_LIMIT,
  CHANGE_LOG_MAX_CHANGES,
  type ChangeLogInput,
} from "@/lib/change-log-types";
import { ChangeLog } from "@/lib/models/change-log";

/**
 * Records a write that already happened. A write that changed nothing is not
 * recorded. Logging is best effort: a failure here is logged on the server
 * and does not turn the successful write into an error. Entries beyond the
 * newest CHANGE_LOG_LIMIT are deleted.
 */
export async function recordChange({ page, summary, changes }: ChangeLogInput) {
  if (changes.length === 0) {
    return;
  }
  try {
    await ChangeLog.create({
      user: await getActor(),
      page,
      summary,
      changeCount: changes.length,
      changes: changes.slice(0, CHANGE_LOG_MAX_CHANGES),
    });

    const oldestKept = await ChangeLog.findOne({}, { createdAt: 1 })
      .sort({ createdAt: -1, _id: -1 })
      .skip(CHANGE_LOG_LIMIT - 1)
      .lean();
    if (oldestKept) {
      await ChangeLog.deleteMany({
        $or: [
          { createdAt: { $lt: oldestKept.createdAt } },
          { createdAt: oldestKept.createdAt, _id: { $lt: oldestKept._id } },
        ],
      });
    }
  } catch (error) {
    console.error("Change log: entry not recorded", error);
  }
}
