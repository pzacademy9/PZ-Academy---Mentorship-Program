// src/lib/landing/countries.ts
// Countries an admin can add to a page ("Add a country"). Pure data, no imports.
// regionKey must match what pickRegion maps a visitor's country to (region-pick.ts): AE -> UAE,
// SA -> KSA, every other country its own two letters. tests/landing-link-names.test.ts checks this.

export interface Country {
  /** ISO 3166 alpha-2 code ("" for International, which is not one country). */
  iso2: string;
  name: string;
  regionKey: string;
  currency: string;
  timezoneLabel: string;
}

export const COUNTRIES: readonly Country[] = [
  { iso2: "PK", name: "Pakistan", regionKey: "PK", currency: "PKR", timezoneLabel: "Pakistan Standard Time" },
  { iso2: "AE", name: "United Arab Emirates", regionKey: "UAE", currency: "AED", timezoneLabel: "UAE / Gulf Time" },
  { iso2: "SA", name: "Saudi Arabia", regionKey: "KSA", currency: "SAR", timezoneLabel: "Saudi Arabia Time" },
  { iso2: "PH", name: "Philippines", regionKey: "PH", currency: "PHP", timezoneLabel: "Philippine Time" },
  { iso2: "IN", name: "India", regionKey: "IN", currency: "INR", timezoneLabel: "India Standard Time" },
  { iso2: "QA", name: "Qatar", regionKey: "QA", currency: "QAR", timezoneLabel: "Qatar Time" },
  { iso2: "KW", name: "Kuwait", regionKey: "KW", currency: "KWD", timezoneLabel: "Kuwait Time" },
  { iso2: "BH", name: "Bahrain", regionKey: "BH", currency: "BHD", timezoneLabel: "Bahrain Time" },
  { iso2: "OM", name: "Oman", regionKey: "OM", currency: "OMR", timezoneLabel: "Oman / Gulf Time" },
  { iso2: "EG", name: "Egypt", regionKey: "EG", currency: "EGP", timezoneLabel: "Egypt Time" },
  { iso2: "BD", name: "Bangladesh", regionKey: "BD", currency: "BDT", timezoneLabel: "Bangladesh Time" },
  { iso2: "LK", name: "Sri Lanka", regionKey: "LK", currency: "LKR", timezoneLabel: "Sri Lanka Time" },
  { iso2: "MY", name: "Malaysia", regionKey: "MY", currency: "MYR", timezoneLabel: "Malaysia Time" },
  { iso2: "SG", name: "Singapore", regionKey: "SG", currency: "SGD", timezoneLabel: "Singapore Time" },
  { iso2: "NG", name: "Nigeria", regionKey: "NG", currency: "NGN", timezoneLabel: "Nigeria Time" },
  { iso2: "KE", name: "Kenya", regionKey: "KE", currency: "KES", timezoneLabel: "Kenya Time" },
  { iso2: "GB", name: "United Kingdom", regionKey: "GB", currency: "GBP", timezoneLabel: "UK Time" },
  { iso2: "US", name: "United States", regionKey: "US", currency: "USD", timezoneLabel: "US Eastern Time" },
  { iso2: "CA", name: "Canada", regionKey: "CA", currency: "CAD", timezoneLabel: "Canada Eastern Time" },
  { iso2: "AU", name: "Australia", regionKey: "AU", currency: "AUD", timezoneLabel: "Australia Eastern Time" },
  { iso2: "", name: "International (everyone else)", regionKey: "INTL", currency: "USD", timezoneLabel: "Your Local Time" },
];

export function findCountry(regionKey: string): Country | undefined {
  return COUNTRIES.find((c) => c.regionKey === regionKey);
}
