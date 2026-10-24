/**
 * The /design gallery is for the team, not for customers: on in `vite dev` and on Vercel
 * preview deployments, off in production builds (the route isn't registered at all).
 */
export const showDesignPage = import.meta.env.DEV || import.meta.env.VITE_VERCEL_ENV === 'preview';
