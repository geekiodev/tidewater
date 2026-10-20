import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { escapeLike, LIMITS, pageRange, parseListQuery } from "@/lib/validation/crm";
import { reportError } from "@/lib/errors/report";
import { ActionForm } from "@/components/action-form";
import { Pagination } from "@/components/pagination";
import { createClientAction } from "./actions";

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const ctx = await requireWorkspace();
  const query = parseListQuery(await searchParams);
  const [from, to] = pageRange(query);

  const supabase = await createClient();
  let request = supabase
    .from("clients")
    .select("id, name, website, updated_at", { count: "exact" })
    .eq("workspace_id", ctx.workspace.id)
    .order("name", { ascending: true })
    .range(from, to);
  if (query.q) request = request.ilike("name", `%${escapeLike(query.q)}%`);
  const { data: clients, count, error } = await request;
  if (error) reportError(error, { where: "clients-page" });

  return (
    <main>
      <div className="row spread">
        <h1>Clients</h1>
        <form className="row" action="/clients" method="get" role="search">
          <input name="q" defaultValue={query.q} placeholder="Search by name" maxLength={LIMITS.search} />
          <button type="submit" className="secondary">
            Search
          </button>
        </form>
      </div>

      {error ? <p className="error">Couldn&apos;t load clients. Please refresh.</p> : null}

      <section className="card">
        {clients && clients.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Website</th>
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/clients/${c.id}`}>{c.name}</Link>
                  </td>
                  <td className="small">{c.website ?? ""}</td>
                  <td className="small muted">{new Date(c.updated_at).toLocaleDateString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : !error ? (
          <p className="muted">
            {query.q ? "No clients match that search." : "No clients yet. Add your first one below."}
          </p>
        ) : null}
        <Pagination
          basePath="/clients"
          page={query.page}
          pageSize={query.pageSize}
          total={count ?? 0}
          extraParams={query.q ? { q: query.q } : {}}
        />
      </section>

      <section className="card">
        <h2>Add a client</h2>
        <ActionForm action={createClientAction} submitLabel="Add client" pendingLabel="Adding…">
          <label>
            Company name
            <input name="name" required maxLength={LIMITS.clientName} />
          </label>
          <label>
            Website (optional)
            <input name="website" type="url" maxLength={LIMITS.website} placeholder="https://" />
          </label>
        </ActionForm>
      </section>
    </main>
  );
}
