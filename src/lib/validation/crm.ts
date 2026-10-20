import { z } from "zod";

/** Limits shared by the input schemas, the UI and (mirrored) the database. */
export const LIMITS = {
  clientName: 200,
  website: 300,
  fullName: 200,
  email: 254,
  phone: 50,
  jobTitle: 200,
  noteBody: 10_000,
  search: 100,
  defaultPageSize: 25,
  maxPageSize: 50,
  maxPage: 1000,
} as const;

/** Empty form fields become null; others are trimmed and length-capped. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const clientInputSchema = z.object({
  name: z.string().trim().min(1, "Enter the client's name").max(LIMITS.clientName),
  website: optionalText(LIMITS.website, "Website").refine(
    (v) => v === null || /^https?:\/\/[^\s]+$/i.test(v),
    "Website must start with http:// or https://",
  ),
});

export const contactInputSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a name").max(LIMITS.fullName),
  email: optionalText(LIMITS.email, "Email").refine(
    (v) => v === null || z.email().safeParse(v).success,
    "Enter a valid email address",
  ),
  phone: optionalText(LIMITS.phone, "Phone").refine(
    (v) => v === null || /^[0-9+().\-\s x]{3,50}$/i.test(v),
    "Phone can contain digits, spaces and + ( ) - . x",
  ),
  jobTitle: optionalText(LIMITS.jobTitle, "Job title"),
});

export const noteInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something first")
    .max(LIMITS.noteBody, `Notes can be at most ${LIMITS.noteBody.toLocaleString("en-US")} characters`),
});

export const idSchema = z.uuid();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(LIMITS.maxPage).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIMITS.maxPageSize)
    .catch(LIMITS.defaultPageSize),
  q: z
    .string()
    .trim()
    .max(LIMITS.search)
    .catch("")
    .transform((v) => v || ""),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export function parseListQuery(params: Record<string, string | string[] | undefined>): ListQuery {
  const pick = (k: string) => (typeof params[k] === "string" ? params[k] : undefined);
  return listQuerySchema.parse({ page: pick("page"), pageSize: pick("pageSize"), q: pick("q") });
}

export function pageRange({ page, pageSize }: { page: number; pageSize: number }): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

/** Escape LIKE wildcards so a search for "50%" matches literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}
