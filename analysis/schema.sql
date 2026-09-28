PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS raw_properties (
    id TEXT PRIMARY KEY NOT NULL,
    neighborhood TEXT NOT NULL,
    region TEXT NOT NULL,
    home_type TEXT NOT NULL,
    bedrooms INTEGER,
    bathrooms REAL,
    square_feet INTEGER,
    sale_price REAL,
    household_income REAL,
    property_age INTEGER,
    condition_score REAL
);

CREATE TABLE IF NOT EXISTS clean_properties (
    id TEXT PRIMARY KEY NOT NULL,
    neighborhood TEXT NOT NULL,
    region TEXT NOT NULL,
    home_type TEXT NOT NULL,
    bedrooms INTEGER NOT NULL CHECK (bedrooms BETWEEN 1 AND 5),
    bathrooms REAL NOT NULL CHECK (bathrooms > 0),
    square_feet INTEGER NOT NULL CHECK (square_feet > 0),
    sale_price REAL NOT NULL CHECK (sale_price > 0),
    household_income REAL NOT NULL CHECK (household_income > 0),
    property_age INTEGER NOT NULL CHECK (property_age >= 0),
    condition_score REAL NOT NULL CHECK (condition_score BETWEEN 0 AND 100),
    price_per_sqft INTEGER NOT NULL,
    affordability_ratio REAL NOT NULL,
    market_segment TEXT NOT NULL CHECK (market_segment IN ('Entry', 'Mid-market', 'Premium')),
    affordability_band TEXT NOT NULL CHECK (affordability_band IN ('Accessible', 'Stretched', 'Highly stretched')),
    quality_band TEXT NOT NULL CHECK (quality_band IN ('Needs work', 'Good', 'Excellent'))
);

CREATE INDEX IF NOT EXISTS idx_clean_region_neighborhood
ON clean_properties(region, neighborhood);

CREATE INDEX IF NOT EXISTS idx_clean_home_type
ON clean_properties(home_type);

CREATE INDEX IF NOT EXISTS idx_clean_market_segment
ON clean_properties(market_segment);

CREATE INDEX IF NOT EXISTS idx_clean_bedrooms
ON clean_properties(bedrooms);
