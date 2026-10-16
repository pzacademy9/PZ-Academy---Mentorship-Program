// src/lib/validations/landing-variants.ts
import { z } from "zod";
import { isSafeUrl } from "@/lib/landing/simple-text";

/** Whole PATCH body cap (bytes). */
export const MAX_VARIANT_BYTES = 100_000;

const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];
const key64 = z.string().min(1).max(64).refine((k) => !FORBIDDEN_KEYS.includes(k), "Invalid key");
const safeUrlOrEmpty = z.string().max(1000).refine((v) => v === "" || isSafeUrl(v), "Enter a full link starting with https://");

const sectionOverride = z.strictObject({
  hidden: z.boolean().optional(),
  fields: z.record(key64, z.unknown()).optional(),
});

// Same limits as contentSchema, every key optional (a partial override).
const settingsOverride = z.strictObject({
  registerUrl: safeUrlOrEmpty.optional(),
  registerLabel: z.string().max(40).optional(),
  whatsappNumber: z.string().max(30).optional(),
  countdownTo: z.string().max(40).optional(),
  countdownLabel: z.string().max(80).optional(),
});
const seoOverride = z.strictObject({
  title: z.string().max(120).optional(),
  description: z.string().max(300).optional(),
  ogImage: safeUrlOrEmpty.optional(),
});

export const overridesSchema = z.strictObject({
  sections: z.record(key64, sectionOverride),
  order: z.array(z.string().max(64)).max(40).optional(),
  settings: settingsOverride.optional(),
  seo: seoOverride.optional(),
});

export const createVariantSchema = z.strictObject({
  regionKey: z.string().min(1).max(20).nullable(),
  moduleKey: z.string().min(1).max(40).nullable(),
  enabled: z.boolean(),
});

export const saveVariantSchema = z.strictObject({
  overrides: overridesSchema,
  baseRevision: z.number().int().min(1),
});

export const rollbackVariantSchema = z.strictObject({ version: z.number().int().min(1) });

export const setEnabledSchema = z.strictObject({ enabled: z.boolean() });
