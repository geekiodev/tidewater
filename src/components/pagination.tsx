import Link from "next/link";

type Props = {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  pageParam?: string;
  extraParams?: Record<string, string>;
};

export function Pagination({ basePath, page, pageSize, total, pageParam = "page", extraParams = {} }: Props) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams({ ...extraParams, [pageParam]: String(p) });
    return `${basePath}?${params.toString()}`;
  };

  return (
    <nav className="row small" aria-label="Pagination">
      {page > 1 ? <Link href={href(page - 1)}>← Previous</Link> : null}
      <span className="muted">
        Page {page} of {lastPage}
      </span>
      {page < lastPage ? <Link href={href(page + 1)}>Next →</Link> : null}
    </nav>
  );
}
