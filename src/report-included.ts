/**
 * Whether this build carries the report at all. True only under the dev server.
 *
 * Not a security control, and it should not be described as one: the report
 * holds no credentials, and in a published build it could only ever show a
 * visitor their own localStorage run. It is excluded from builds because it
 * contains LaunchDarkly's internal scheme comparison, the cost model, and which
 * scheme currently wins. None of that belongs in front of an external
 * participant, and seeing it could bias someone who takes the study twice.
 *
 * This is import.meta.env.DEV rather than a VITE_ variable on purpose. Vite
 * reads .env.local during `vite build` as well as during `vite dev`, so a
 * variable that enables the report locally would also silently enable it in any
 * build run on a machine that has the file. Tying it to DEV means no build can
 * contain the report, whatever is set where. The cost is that `pnpm preview`
 * cannot show the report; use `pnpm dev`.
 */
export const reportIncluded = import.meta.env.DEV;
