/**
 * Public API client
 *
 * Points at the Next.js proxy route (/api/public/*) which adds the
 * CLIENT_SLUG server-side before forwarding to the real backend.
 *
 * No auth headers — public data only.
 */

import axios from "axios";

const publicApiClient = axios.create({
    baseURL: "/api/public",
    headers: { "Content-Type": "application/json" },
    timeout: 15_000,
});

export default publicApiClient;
