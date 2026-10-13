/**
 * Feature flags read at build time (the site is static).
 *
 * Kjappen is on hold from October 2026: the code and the /kjappen route stay, but the
 * game is not shown on the front page. Build with NEXT_PUBLIC_KJAPPEN_ENABLED=true to
 * bring it back.
 */
export const KJAPPEN_ENABLED = process.env.NEXT_PUBLIC_KJAPPEN_ENABLED === "true";
