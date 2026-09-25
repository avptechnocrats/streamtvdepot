/**
 * Geolocation Service
 * Detects user's country from IP address using free geolocation API
 * Falls back to browser locale if IP detection fails
 */

export interface GeolocationData {
    country: string | null;
    region: string | null;
    city: string | null;
}

/**
 * Detect user's country from IP address
 * Uses ipapi.co free API (1,000 requests/day)
 * Returns ISO 3166-1 alpha-2 country code
 */
export async function detectCountryFromIP(): Promise<string | null> {
    try {
        const response = await fetch("https://ipapi.co/json/", {
            method: "GET",
            headers: {
                "Accept": "application/json",
            },
        });

        if (!response.ok) {
            console.warn("IP geolocation API failed:", response.status);
            return null;
        }

        const data = await response.json();
        return data.country_code ?? null;
    } catch (error) {
        console.warn("IP geolocation fetch failed:", error);
        return null;
    }
}

/**
 * Get user's country from multiple sources
 * Priority: User profile → localStorage/sessionStorage → IP detection → Browser locale → null
 */
export async function getUserCountry(userProfileCountry?: string | null): Promise<string | null> {
    // 1. Use user profile country if available
    if (userProfileCountry) {
        return userProfileCountry;
    }

    // 2. Check localStorage/sessionStorage for manually selected country
    if (typeof window !== "undefined") {
        const storedCountry = localStorage.getItem("pricing_country") || sessionStorage.getItem("pricing_country");
        if (storedCountry) {
            return storedCountry;
        }
    }

    // 3. Try IP-based detection (most reliable for non-logged-in users)
    const ipCountry = await detectCountryFromIP();
    if (ipCountry) {
        return ipCountry;
    }

    // 4. Fall back to browser locale region
    if (typeof navigator !== "undefined") {
        try {
            const locale = new Intl.Locale(navigator.language);
            return locale.region ?? null;
        } catch {
            return null;
        }
    }

    return null;
}

/**
 * Save user's selected country to localStorage
 * Used to remember the user's manual selection
 */
export function setSelectedCountry(country: string): void {
    if (typeof window !== "undefined") {
        localStorage.setItem("pricing_country", country);
    }
}

/**
 * Clear saved country selection (e.g., when user logs in with different country)
 */
export function clearSelectedCountry(): void {
    if (typeof window !== "undefined") {
        localStorage.removeItem("pricing_country");
        sessionStorage.removeItem("pricing_country");
    }
}

/**
 * List of all supported countries with ISO codes and names
 * Ordered by relevance and market size
 */
export const COUNTRIES = [
    { code: "US", name: "United States" },
    { code: "GB", name: "United Kingdom" },
    { code: "CA", name: "Canada" },
    { code: "AU", name: "Australia" },
    { code: "IN", name: "India" },
    { code: "DE", name: "Germany" },
    { code: "FR", name: "France" },
    { code: "JP", name: "Japan" },
    { code: "BR", name: "Brazil" },
    { code: "MX", name: "Mexico" },
    { code: "AE", name: "United Arab Emirates" },
    { code: "SG", name: "Singapore" },
    { code: "CN", name: "China" },
    { code: "KR", name: "South Korea" },
    { code: "IT", name: "Italy" },
    { code: "ES", name: "Spain" },
    { code: "NL", name: "Netherlands" },
    { code: "SE", name: "Sweden" },
    { code: "NO", name: "Norway" },
    { code: "CH", name: "Switzerland" },
    { code: "ZA", name: "South Africa" },
    { code: "NZ", name: "New Zealand" },
    { code: "AR", name: "Argentina" },
    { code: "CL", name: "Chile" },
    { code: "CO", name: "Colombia" },
    { code: "PE", name: "Peru" },
    { code: "PK", name: "Pakistan" },
    { code: "BD", name: "Bangladesh" },
    { code: "ID", name: "Indonesia" },
    { code: "MY", name: "Malaysia" },
    { code: "TH", name: "Thailand" },
    { code: "PH", name: "Philippines" },
    { code: "VN", name: "Vietnam" },
    { code: "TR", name: "Turkey" },
    { code: "SA", name: "Saudi Arabia" },
    { code: "EG", name: "Egypt" },
    { code: "NG", name: "Nigeria" },
    { code: "KE", name: "Kenya" },
    { code: "HK", name: "Hong Kong" },
    { code: "TW", name: "Taiwan" },
    { code: "RU", name: "Russia" },
    { code: "UA", name: "Ukraine" },
    { code: "PL", name: "Poland" },
    { code: "CZ", name: "Czech Republic" },
    { code: "HU", name: "Hungary" },
    { code: "AT", name: "Austria" },
    { code: "BE", name: "Belgium" },
    { code: "DK", name: "Denmark" },
    { code: "FI", name: "Finland" },
    { code: "IE", name: "Ireland" },
    { code: "GR", name: "Greece" },
    { code: "PT", name: "Portugal" },
    { code: "RO", name: "Romania" },
];

export function getCountryName(code: string): string {
    return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}
