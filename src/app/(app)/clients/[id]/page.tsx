import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { idSchema, LIMITS, pageRange } from "@/lib/validation/crm";
import { z } from "zod";
import { reportError } from "@/lib/errors/report";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Pagination } from "@/components/pagination";
import {
  createContactAction,
  createNoteAction,
  deleteClientAction,
  deleteContactAction,
  deleteNoteAction,
  updateClientAction,
  updateContactAction,
  updateNoteAction,
} from "../actions";

const pageParam = z.coerce.number().int().min(1).max(LIMITS.maxPage).catch(1);
const CONTACTS_PAGE_SIZE = LIMITS.maxPageSize;
const NOTES_PAGE_SIZE = LIMITS.defaultPageSize;

export default async function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  const ctx = await requireWorkspace();
  const { id: rawId } = await params;
  const idResult = idSchema.safeParse(rawId);
  if (!idResult.success) notFound();
  const id = idResult.data;

  const sp = await searchParams;
  const contactsPage = pageParam.parse(sp.contactsPage);
  const notesPage = pageParam.parse(sp.notesPage);

  const supabase = await createClient();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name, website, created_at")
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (clientError) reportError(clientError, { where: "client-page" });
  if (!client) notFound();

  const [cFrom, cTo] = pageRange({ page: contactsPage, pageSize: CONTACTS_PAGE_SIZE });
  const [nFrom, nTo] = pageRange({ page: notesPage, pageSize: NOTES_PAGE_SIZE });

  const [contactsRes, notesRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, full_name, email, phone, job_title", { count: "exact" })
      .eq("client_id", id)
      .eq("workspace_id", ctx.workspace.id)
      .order("full_name", { ascending: true })
      .range(cFrom, cTo),
    supabase
      .from("notes")
      .select("id, body, author_id, created_at, updated_at", { count: "exact" })
      .eq("client_id", id)
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false })
      .range(nFrom, nTo),
  ]);
  if (contactsRes.error) reportError(contactsRes.error, { where: "client-page:contacts" });
  if (notesRes.error) reportError(notesRes.error, { where: "client-page:notes" });
  const contacts = contactsRes.data ?? [];
  const notes = notesRes.data ?? [];

  return (
    <main>
      <p className="small">
        <Link href="/clients">← All clients</Link>
      </p>
      <div className="row spread">
        <h1>{client.name}</h1>
      </div>
      {client.website ? (
        <p className="small">
          <a href={client.website} target="_blank" rel="noopener noreferrer nofollow">
            {client.website}
          </a>
        </p>
      ) : null}

      <section className="card">
        <h2>Contacts</h2>
        {contactsRes.error ? <p className="error">Couldn&apos;t load contacts.</p> : null}
        {contacts.length === 0 && !contactsRes.error ? <p className="muted">No contacts yet.</p> : null}
        {contacts.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Job title</th>
                <th>Email</th>
                <th>Phone</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.full_name}</td>
                  <td>{c.job_title ?? ""}</td>
                  <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : ""}</td>
                  <td>{c.phone ?? ""}</td>
                  <td>
                    <details>
                      <summary className="small">Edit</summary>
                      <ActionForm action={updateContactAction} submitLabel="Save">
                        <input type="hidden" name="contactId" value={c.id} />
                        <ContactFields
                          defaults={{
                            fullName: c.full_name,
                            email: c.email,
                            phone: c.phone,
                            jobTitle: c.job_title,
                          }}
                        />
                      </ActionForm>
                      <form action={deleteContactAction}>
                        <input type="hidden" name="contactId" value={c.id} />
                        <ConfirmSubmit message="Delete this contact?">Delete contact</ConfirmSubmit>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <Pagination
          basePath={`/clients/${id}`}
          page={contactsPage}
          pageSize={CONTACTS_PAGE_SIZE}
          total={contactsRes.count ?? 0}
          pageParam="contactsPage"
          extraParams={{ notesPage: String(notesPage) }}
        />
        <details>
          <summary>Add a contact</summary>
          <ActionForm action={createContactAction} submitLabel="Add contact" resetOnSuccess>
            <input type="hidden" name="clientId" value={id} />
            <ContactFields />
          </ActionForm>
        </details>
      </section>

      <section className="card">
        <h2>Notes</h2>
        <ActionForm action={createNoteAction} submitLabel="Add note" resetOnSuccess>
          <input type="hidden" name="clientId" value={id} />
          <label>
            New note
            <textarea name="body" required maxLength={LIMITS.noteBody} />
          </label>
        </ActionForm>
        {notesRes.error ? <p className="error">Couldn&apos;t load notes.</p> : null}
        {notes.length === 0 && !notesRes.error ? <p className="muted">No notes yet.</p> : null}
        <div className="stack">
          {notes.map((n) => {
            const mine = n.author_id === ctx.user.id;
            return (
              <article key={n.id} className="card">
                {/* Rendered as plain text: React escapes it, and no HTML/Markdown is interpreted. */}
                <pre className="plain">{n.body}</pre>
                <p className="small muted">
                  {mine ? "You" : "A teammate"} · {new Date(n.created_at).toLocaleString("en-US")}
                  {n.updated_at !== n.created_at ? " · edited" : ""}
                </p>
                {mine || ctx.role === "owner" ? (
                  <details>
                    <summary className="small">{mine ? "Edit or delete" : "Delete"}</summary>
                    {mine ? (
                      <ActionForm action={updateNoteAction} submitLabel="Save note">
                        <input type="hidden" name="noteId" value={n.id} />
                        <textarea name="body" defaultValue={n.body} required maxLength={LIMITS.noteBody} />
                      </ActionForm>
                    ) : null}
                    <form action={deleteNoteAction}>
                      <input type="hidden" name="noteId" value={n.id} />
                      <ConfirmSubmit message="Delete this note?">Delete note</ConfirmSubmit>
                    </form>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
        <Pagination
          basePath={`/clients/${id}`}
          page={notesPage}
          pageSize={NOTES_PAGE_SIZE}
          total={notesRes.count ?? 0}
          pageParam="notesPage"
          extraParams={{ contactsPage: String(contactsPage) }}
        />
      </section>

      <section className="card stack">
        <h2>Client details</h2>
        <ActionForm action={updateClientAction} submitLabel="Save changes">
          <input type="hidden" name="clientId" value={id} />
          <label>
            Company name
            <input name="name" defaultValue={client.name} required maxLength={LIMITS.clientName} />
          </label>
          <label>
            Website
            <input name="website" type="url" defaultValue={client.website ?? ""} maxLength={LIMITS.website} />
          </label>
        </ActionForm>
        <form action={deleteClientAction}>
          <input type="hidden" name="clientId" value={id} />
          <ConfirmSubmit message="Delete this client and all of its contacts and notes? This can't be undone.">
            Delete client
          </ConfirmSubmit>
        </form>
      </section>
    </main>
  );
}

function ContactFields({
  defaults,
}: {
  defaults?: { fullName: string; email: string | null; phone: string | null; jobTitle: string | null };
}) {
  return (
    <>
      <label>
        Name
        <input name="fullName" defaultValue={defaults?.fullName} required maxLength={LIMITS.fullName} />
      </label>
      <label>
        Job title
        <input name="jobTitle" defaultValue={defaults?.jobTitle ?? ""} maxLength={LIMITS.jobTitle} />
      </label>
      <label>
        Email
        <input name="email" type="email" defaultValue={defaults?.email ?? ""} maxLength={LIMITS.email} />
      </label>
      <label>
        Phone
        <input name="phone" type="tel" defaultValue={defaults?.phone ?? ""} maxLength={LIMITS.phone} />
      </label>
    </>
  );
}
