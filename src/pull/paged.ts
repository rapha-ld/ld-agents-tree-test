/** Supabase caps a response at 1000 rows regardless of the key used. */
export const PAGE_SIZE = 1000;

export type PageFetcher<T> = (
  from: number,
  to: number,
) => Promise<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Read every row by walking inclusive ranges.
 *
 * An unpaged select against a table past the cap returns a truncated list with
 * no error, which would make every figure in the report wrong while looking
 * like it worked. An error mid-walk throws rather than returning the rows
 * gathered so far, for the same reason: a short list that looks complete is
 * worse than a failure.
 */
export async function fetchAllRows<T>(fetchPage: PageFetcher<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (data === null || data.length === 0) return rows;
    rows.push(...data);
    // A short page means the end. A full page might not, so ask again even when
    // the total is an exact multiple of the page size.
    if (data.length < pageSize) return rows;
  }
}
