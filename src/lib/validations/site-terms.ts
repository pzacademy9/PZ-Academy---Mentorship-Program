// src/lib/validations/site-terms.ts
import { z } from "zod";

export const MAX_TERMS_LENGTH = 20000;

/** The general Terms and Conditions text, saved from the admin screen. */
export const siteTermsSchema = z.object({ body: z.string().max(MAX_TERMS_LENGTH, "The Terms are too long. Please keep them under 20,000 characters.") });
