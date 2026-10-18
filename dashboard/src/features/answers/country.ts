// Where Answers asks from: a short list of countries, and a guess from the site's time zone for a site that has not chosen yet.
export const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'CH', 'IE', 'PT', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'CA', 'AU', 'NZ', 'BR', 'MX', 'IN', 'JP', 'SG', 'ZA', 'AE']

const ZONES: Record<string, string> = {
  'Europe/Berlin': 'DE', 'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Vienna': 'AT',
  'Europe/Zurich': 'CH', 'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL',
  'Europe/Prague': 'CZ', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Pacific/Auckland': 'NZ', 'America/Sao_Paulo': 'BR',
  'America/Mexico_City': 'MX', 'Asia/Kolkata': 'IN', 'Asia/Tokyo': 'JP', 'Asia/Singapore': 'SG', 'Africa/Johannesburg': 'ZA', 'Asia/Dubai': 'AE',
}

/** The country a time zone suggests: the table above, else the United States for its zones, else none. */
export function countryOfZone(tz: string): string {
  return ZONES[tz] ?? (tz.startsWith('America/') && !tz.includes('Sao_Paulo') ? 'US' : '')
}
