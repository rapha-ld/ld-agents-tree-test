/**
 * This study shares a Supabase project with ld-nav-lab, so its tables carry a
 * prefix to keep the two studies' rows apart. See supabase/schema.sql.
 *
 * Kept apart from session.ts so Node scripts can import it without Vite's env.
 */
export const TABLES = {
  sessions: 'agents_sessions',
  events: 'agents_events',
  tasks: 'agents_tasks',
} as const;
