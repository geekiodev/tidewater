import type { ReactNode } from "react";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { logoutAction } from "@/app/auth/actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Server-side check on every render of every page in this group.
  const ctx = await requireWorkspace();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <strong>{ctx.workspace.name}</strong>
          <nav>
            <Link href="/settings/team">Team</Link>
          </nav>
          <span className="small muted">{ctx.user.email}</span>
          <form action={logoutAction}>
            <button type="submit" className="secondary">
              Log out
            </button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
