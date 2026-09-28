export const NEIGHBORHOODS = [
  { name: "Beverly Hills", region: "Westside", ppsf: 1120, income: 196000 },
  { name: "Santa Monica", region: "Westside", ppsf: 910, income: 142000 },
  { name: "Silver Lake", region: "Central", ppsf: 760, income: 126000 },
  { name: "Pasadena", region: "San Gabriel Valley", ppsf: 625, income: 112000 },
  { name: "Long Beach", region: "South Bay", ppsf: 545, income: 92000 },
  { name: "Inglewood", region: "South LA", ppsf: 515, income: 87000 },
  { name: "North Hollywood", region: "San Fernando Valley", ppsf: 570, income: 97000 },
  { name: "Culver City", region: "Westside", ppsf: 805, income: 132000 },
];

export const HOME_TYPES = [
  { name: "Condo", multiplier: .94, sqft: 850 },
  { name: "Single-family", multiplier: 1.12, sqft: 1580 },
  { name: "Townhome", multiplier: 1.02, sqft: 1240 },
  { name: "Multi-family", multiplier: 1.07, sqft: 1840 },
];

export const SEGMENTS = ["Entry", "Mid-market", "Premium"];

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function round(value, precision = 0) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function buildDataset(count = 10250, seed = 202503) {
  if (!Number.isInteger(count) || count < 1) throw new Error("count must be a positive integer");
  const random = mulberry32(seed);
  return Array.from({ length: count }, (_, index) => {
    const neighborhood = NEIGHBORHOODS[index % NEIGHBORHOODS.length];
    const homeType = HOME_TYPES[(index * 3 + Math.floor(random() * HOME_TYPES.length)) % HOME_TYPES.length];
    const bedrooms = Math.min(5, Math.max(1, Math.round((homeType.sqft / 500) + random() * 1.8 - .65)));
    const bathrooms = Math.max(1, round(bedrooms * .62 + random() * 1.15, 1));
    const squareFeet = Math.max(480, Math.round(homeType.sqft * (.72 + random() * .67) + bedrooms * 35));
    const propertyAge = Math.round(2 + random() * 88);
    const conditionScore = round(62 + random() * 36, 1);
    const pricePerSqft = Math.round(neighborhood.ppsf * homeType.multiplier * (.84 + random() * .34) * (1 + (conditionScore - 80) / 450));
    const salePrice = Math.round(pricePerSqft * squareFeet / 1000) * 1000;
    const householdIncome = Math.round(neighborhood.income * (.72 + random() * .72) / 1000) * 1000;
    const affordabilityRatio = round(salePrice / householdIncome, 2);
    const segment = salePrice < 750000 ? "Entry" : salePrice < 1500000 ? "Mid-market" : "Premium";
    return {
      id: `LA-${String(index + 1).padStart(5, "0")}`,
      neighborhood: neighborhood.name,
      region: neighborhood.region,
      homeType: homeType.name,
      segment,
      bedrooms,
      bathrooms,
      squareFeet,
      salePrice,
      pricePerSqft,
      householdIncome,
      affordabilityRatio,
      propertyAge,
      conditionScore,
    };
  });
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function filterRecords(records, filters = {}) {
  const { neighborhood = "All", homeType = "All", segment = "All", bedrooms = "All" } = filters;
  return records.filter((record) =>
    (neighborhood === "All" || record.neighborhood === neighborhood) &&
    (homeType === "All" || record.homeType === homeType) &&
    (segment === "All" || record.segment === segment) &&
    (bedrooms === "All" || record.bedrooms === Number(bedrooms))
  );
}

export function summarize(records, total = records.length) {
  return {
    count: records.length,
    share: total ? records.length / total : 0,
    medianPrice: median(records.map((record) => record.salePrice)),
    medianPpsf: median(records.map((record) => record.pricePerSqft)),
    medianRatio: median(records.map((record) => record.affordabilityRatio)),
  };
}

const VIEW_CONFIG = {
  price: { key: "salePrice", label: "Median sale price", title: "Median sale price by neighborhood", better: "high" },
  affordability: { key: "affordabilityRatio", label: "Price ÷ annual income", title: "Affordability burden by neighborhood", better: "low" },
  ppsf: { key: "pricePerSqft", label: "Median price per square foot", title: "Median price per square foot by neighborhood", better: "high" },
};

export function groupMarketView(records, view = "price") {
  const config = VIEW_CONFIG[view];
  if (!config) throw new Error(`Unknown market view: ${view}`);
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.neighborhood)) groups.set(record.neighborhood, []);
    groups.get(record.neighborhood).push(record[config.key]);
  }
  const values = [...groups.entries()].map(([name, group]) => ({ name, value: median(group), count: group.length }));
  values.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return { ...config, view, values };
}

export function buildInsights(records, view = "price") {
  if (!records.length) return [];
  const grouped = groupMarketView(records, view).values;
  const highest = grouped[0];
  const lowest = grouped[grouped.length - 1];
  const typeGroups = new Map();
  for (const record of records) {
    if (!typeGroups.has(record.homeType)) typeGroups.set(record.homeType, []);
    typeGroups.get(record.homeType).push(record.pricePerSqft);
  }
  const valueType = [...typeGroups].map(([name, values]) => ({ name, value: median(values) })).sort((a, b) => a.value - b.value)[0];
  return [
    { label: view === "affordability" ? "Highest burden" : "Market leader", title: highest.name, detail: `${highest.count.toLocaleString()} properties support this comparison.` },
    { label: view === "affordability" ? "Lowest burden" : "Lower end", title: lowest.name, detail: `The filtered spread is ${formatViewValue(highest.value - lowest.value, view)}.` },
    { label: "Relative value", title: valueType.name, detail: "Lowest median price per square foot among visible housing types." },
  ];
}

export function formatCurrency(value, compact = false) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: compact ? 1 : 0, notation: compact ? "compact" : "standard" }).format(value);
}

export function formatViewValue(value, view) {
  if (!Number.isFinite(value)) return "—";
  if (view === "affordability") return `${value.toFixed(1)}×`;
  if (view === "ppsf") return `${formatCurrency(value)}/ft²`;
  return formatCurrency(value, true);
}

export function toCsv(records) {
  const headers = ["id", "neighborhood", "region", "home_type", "market_segment", "bedrooms", "bathrooms", "square_feet", "sale_price", "price_per_sqft", "household_income", "affordability_ratio", "property_age", "condition_score"];
  const rows = records.map((record) => [record.id, record.neighborhood, record.region, record.homeType, record.segment, record.bedrooms, record.bathrooms, record.squareFeet, record.salePrice, record.pricePerSqft, record.householdIncome, record.affordabilityRatio, record.propertyAge, record.conditionScore]);
  const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}
