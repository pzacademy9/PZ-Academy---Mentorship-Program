// src/lib/validations/landing-payment.ts
import { z } from "zod";

export const ACCOUNT_KEY_RE = /^[a-z0-9_]{2,40}$/;
export const REGION_KEY_RE = /^[A-Z]{2,6}$/;
export const MAX_ACCOUNT_ROWS = 8;
export const MAX_ACCOUNTS_PER_COUNTRY = 12;

const kind = z.enum(["bank", "wallet", "paypal"]);
const row = z.object({
  label: z.string().trim().min(1, "Give every detail a name.").max(80, "A detail name can be 80 characters at most."),
  value: z.string().trim().min(1, "Fill in every detail.").max(200, "A detail can be 200 characters at most."),
});
const accountFields = {
  label: z.string().trim().min(1, "Give the account a name.").max(80, "The name can be 80 characters at most."),
  kind,
  rows: z.array(row).min(1, "Add at least one detail.").max(MAX_ACCOUNT_ROWS, "An account can have 8 details at most."),
  displayText: z.string().trim().max(120, "The short note can be 120 characters at most."),
};

export const accountCreateSchema = z.object(accountFields);

export const accountPatchSchema = z
  .object({ ...accountFields, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");

const countryName = z.string().trim().min(1, "Give the country a name.").max(80, "The name can be 80 characters at most.");

export const countryCreateSchema = z.object({
  regionKey: z.string().regex(REGION_KEY_RE, "Use 2 to 6 capital letters, for example PK."),
  name: countryName,
});

export const countryPatchSchema = z
  .object({ name: countryName, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");

export const countryAccountsSchema = z.object({
  accountKeys: z
    .array(z.string().regex(ACCOUNT_KEY_RE, "That account is not valid."))
    .min(1, "A country needs at least one account.")
    .max(MAX_ACCOUNTS_PER_COUNTRY, "A country can have 12 accounts at most.")
    .refine((keys) => new Set(keys).size === keys.length, "An account can only be listed once."),
});
