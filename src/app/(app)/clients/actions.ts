"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace, SUBSCRIPTION_REQUIRED_MESSAGE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { clientInputSchema, contactInputSchema, idSchema, noteInputSchema } from "@/lib/validation/crm";
import { formDataToObject, zodFieldErrors, type FormState } from "@/lib/forms";
import { dbErrorState } from "@/lib/db-errors";

/*
 * Every action:
 *  1. re-checks the session and looks up the workspace on the server,
 *  2. validates all input with a schema (sizes capped),
 *  3. writes with the user's own Supabase client, so RLS applies, and scopes
 *     the query to the server-side workspace id as well.
 * Record ids from the form are only used to pick WHICH row; whether the user
 * may touch it is decided by the workspace scope and RLS.
 */

const NOT_FOUND: FormState = { error: "That record no longer exists." };

function parseId(value: FormDataEntryValue | null): string | null {
  const r = idSchema.safeParse(value);
  return r.success ? r.data : null;
}

// --------------------------------------------------------------------------
// Clients
// --------------------------------------------------------------------------

export async function createClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireWorkspace();
  // Friendly early exit; the RLS insert policy enforces the same rule.
  if (!ctx.active) return { error: SUBSCRIPTION_REQUIRED_MESSAGE };
  const parsed = clientInputSchema.safeParse(formDataToObject(formData, ["name", "website"]));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      workspace_id: ctx.workspace.id,
      name: parsed.data.name,
      website: parsed.data.website,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return dbErrorState(error, "create-client");

  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

export async function updateClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireWorkspace();
  const id = parseId(formData.get("clientId"));
  if (!id) return NOT_FOUND;
  const parsed = clientInputSchema.safeParse(formDataToObject(formData, ["name", "website"]));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ name: parsed.data.name, website: parsed.data.website })
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .select("id");
  if (error) return dbErrorState(error, "update-client");
  if (!data?.length) return NOT_FOUND;

  revalidatePath(`/clients/${id}`);
  return { ok: true, message: "Saved." };
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = parseId(formData.get("clientId"));
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.from("clients").delete().eq("id", id).eq("workspace_id", ctx.workspace.id);
  if (error) {
    dbErrorState(error, "delete-client");
    return;
  }
  revalidatePath("/clients");
  redirect("/clients");
}

// --------------------------------------------------------------------------
// Contacts
// --------------------------------------------------------------------------

const CONTACT_FIELDS = ["fullName", "email", "phone", "jobTitle"] as const;

export async function createContactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireWorkspace();
  // Friendly early exit; the RLS insert policy enforces the same rule.
  if (!ctx.active) return { error: SUBSCRIPTION_REQUIRED_MESSAGE };
  const clientId = parseId(formData.get("clientId"));
  if (!clientId) return NOT_FOUND;
  const parsed = contactInputSchema.safeParse(formDataToObject(formData, CONTACT_FIELDS));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  // The composite foreign key (client_id, workspace_id) guarantees the client
  // belongs to this workspace.
  const { error } = await supabase.from("contacts").insert({
    workspace_id: ctx.workspace.id,
    client_id: clientId,
    full_name: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    job_title: parsed.data.jobTitle,
  });
  if (error) return dbErrorState(error, "create-contact");

  revalidatePath(`/clients/${clientId}`);
  return { ok: true, message: "Contact added." };
}

export async function updateContactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireWorkspace();
  const id = parseId(formData.get("contactId"));
  if (!id) return NOT_FOUND;
  const parsed = contactInputSchema.safeParse(formDataToObject(formData, CONTACT_FIELDS));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      job_title: parsed.data.jobTitle,
    })
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .select("client_id");
  if (error) return dbErrorState(error, "update-contact");
  if (!data?.length) return NOT_FOUND;

  revalidatePath(`/clients/${data[0].client_id}`);
  return { ok: true, message: "Saved." };
}

export async function deleteContactAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = parseId(formData.get("contactId"));
  if (!id) return;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .select("client_id");
  if (error) {
    dbErrorState(error, "delete-contact");
    return;
  }
  if (data?.[0]) revalidatePath(`/clients/${data[0].client_id}`);
}

// --------------------------------------------------------------------------
// Notes
// --------------------------------------------------------------------------

export async function createNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireWorkspace();
  // Friendly early exit; the RLS insert policy enforces the same rule.
  if (!ctx.active) return { error: SUBSCRIPTION_REQUIRED_MESSAGE };
  const clientId = parseId(formData.get("clientId"));
  if (!clientId) return NOT_FOUND;
  const parsed = noteInputSchema.safeParse(formDataToObject(formData, ["body"]));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("notes").insert({
    workspace_id: ctx.workspace.id,
    client_id: clientId,
    body: parsed.data.body,
    author_id: ctx.user.id,
  });
  if (error) return dbErrorState(error, "create-note");

  revalidatePath(`/clients/${clientId}`);
  return { ok: true, message: "Note added." };
}

export async function updateNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireWorkspace();
  const id = parseId(formData.get("noteId"));
  if (!id) return NOT_FOUND;
  const parsed = noteInputSchema.safeParse(formDataToObject(formData, ["body"]));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .update({ body: parsed.data.body })
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .select("client_id");
  if (error) return dbErrorState(error, "update-note");
  // RLS only lets the author edit; for anyone else zero rows match.
  if (!data?.length) return { error: "Only the note's author can edit it." };

  revalidatePath(`/clients/${data[0].client_id}`);
  return { ok: true, message: "Saved." };
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = parseId(formData.get("noteId"));
  if (!id) return;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .select("client_id");
  if (error) {
    dbErrorState(error, "delete-note");
    return;
  }
  if (data?.[0]) revalidatePath(`/clients/${data[0].client_id}`);
}
