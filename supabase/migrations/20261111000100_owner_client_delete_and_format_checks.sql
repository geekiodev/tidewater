-- AUTHZ-001 and VALID-001, from the G2.1 / G2.6 review (audit/review-g2.1-g2.6.md).
--
-- 1. Only the workspace owner can delete a client. Deleting a client cascades
--    to its contacts and notes, and the cascade doesn't check the notes
--    policy (author or owner only), so any member could delete everyone's
--    notes by deleting the client.
--
-- 2. The format rules the server actions enforce with zod are now enforced
--    by the database too, so writes sent straight to the Data API with a
--    user's own token meet the same rules (length caps were already here).
--    Patterns mirror src/lib/validation/crm.ts:
--      website  /^https?:\/\/[^\s]+$/i
--      email    zod 4.6 z.email() default pattern
--      phone    /^[0-9+().\-\s x]{3,50}$/i
--    Values are stored trimmed by the server actions; the checks apply to
--    the stored value.

-- 1. Client deletion: owner only -------------------------------------------

drop policy clients_delete on public.clients;

create policy clients_delete_owner on public.clients for delete to authenticated
  using ((select private.is_workspace_owner(workspace_id)));

-- 2. Format checks ------------------------------------------------------------

alter table public.clients
  add constraint clients_website_format
    check (website is null or website ~* '^https?://[^[:space:]]+$');

alter table public.contacts
  add constraint contacts_email_format
    check (email is null or email ~ '^(?:[A-Za-z0-9_''+-]+\.)*[A-Za-z0-9_''+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$'),
  add constraint contacts_phone_format
    check (phone is null or phone ~* '^[0-9+().[:space:]x-]{3,50}$');
