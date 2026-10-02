PRAGMA foreign_keys = ON;

CREATE TABLE geographies (
    geo_id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    geography TEXT NOT NULL CHECK (geography IN ('state', 'county', 'place'))
);
CREATE TABLE metric_definitions (
    metric TEXT PRIMARY KEY NOT NULL,
    table_id TEXT NOT NULL,
    lower_code REAL,
    lower_bound REAL,
    upper_code REAL,
    upper_bound REAL
);
CREATE TABLE raw_estimates (
    geo_id TEXT NOT NULL REFERENCES geographies(geo_id),
    metric TEXT NOT NULL REFERENCES metric_definitions(metric),
    raw_estimate REAL NOT NULL,
    raw_moe REAL NOT NULL,
    PRIMARY KEY (geo_id, metric)
);
CREATE INDEX idx_geo_type_name ON geographies(geography, name);
CREATE INDEX idx_raw_metric ON raw_estimates(metric, raw_estimate);
