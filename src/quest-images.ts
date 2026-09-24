import { z } from "zod";

export function isQuestImageSource(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\/assets\.tarkov\.dev\/[a-f0-9]{24}\.webp$/.test(value);
}

export const questImagesSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().max(64),
    sources: z.array(z.string().regex(/^https:\/\/json\.tarkov\.dev\/(regular|pve|pvp-season)\/tasks$/)).max(3),
    images: z
      .array(
        z
          .object({
            gameMode: z.enum(["regular", "pve", "pvp-season"]),
            taskId: z.string().regex(/^[a-f0-9]{24}$/),
            kind: z.literal("generic-quest"),
            path: z.string().regex(/^\/maps\/quests\/images\/[a-f0-9]{24}\.webp$/),
            sourceUrl: z.string().refine(isQuestImageSource),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            bytes: z.number().int().positive().max(2_000_000),
          })
          .refine(
            (entry) =>
              entry.path === `/maps/quests/images/${entry.taskId}.webp` &&
              entry.sourceUrl === `https://assets.tarkov.dev/${entry.taskId}.webp`,
          ),
      )
      .max(3000),
  })
  .superRefine((metadata, context) => {
    const seen = new Set<string>();
    for (const entry of metadata.images) {
      const key = `${entry.gameMode}:${entry.taskId}`;
      if (seen.has(key)) context.addIssue({ code: "custom", message: "Duplicate quest image" });
      seen.add(key);
    }
  });
