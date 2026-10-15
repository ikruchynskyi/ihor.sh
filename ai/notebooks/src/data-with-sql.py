# %% [markdown]
# # Practice: data with SQL
# *AI from scratch, stage 4* · lesson: https://ihor.sh/ai/data-with-sql.html
#
# Practice extracting and shaping real machine learning training tables with SQL:
# filtering populations with `WHERE`, aggregating historical summaries with `GROUP BY`,
# joining relational metadata safely with `LEFT JOIN`, and computing point-in-time cumulative
# features with window functions to prevent future data leakage.
# Replace each `...` under `# YOUR CODE HERE`, run the cell, then the check under it; `hint(n)` and `answer(n)`
# are there when you're stuck.

# %%
import json, sqlite3, urllib.request
import pandas as pd

conn = sqlite3.connect(":memory:")

# Load the real NYC subway outage dataset into SQLite
outages_url = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/outages.csv"
df_outages = pd.read_csv(outages_url)
df_outages.to_sql("outages", conn, index=False, if_exists="replace")

# Load rail station metadata into SQLite
stations_url = "https://raw.githubusercontent.com/ikruchynskyi/ihor.sh/main/ai/data/rail-stations.json"
req = urllib.request.urlopen(stations_url)
st_raw = json.loads(req.read().decode())
pd.DataFrame(st_raw["rows"], columns=st_raw["columns"]).to_sql("stations", conn, index=False, if_exists="replace")

# %% [markdown]
# ## 1. Basic querying: counting records
# Query the total number of records in the `outages` table using `SELECT COUNT(*) AS total FROM outages`.
# Store the integer result in `total_rows`.

# %%
### HINT Run pd.read_sql_query("SELECT COUNT(*) AS total FROM outages", conn)
### HINT total_rows = int(pd.read_sql_query("SELECT COUNT(*) AS total FROM outages", conn)["total"].iloc[0])
### BEGIN SOLUTION
total_rows = int(pd.read_sql_query("SELECT COUNT(*) AS total FROM outages", conn)["total"].iloc[0])
### END SOLUTION

# %%
check(lambda: total_rows == 667, "outages table should contain 667 rows")

# %% [markdown]
# ## 2. Filtering populations: WHERE
# Query all elevator (`kind = 'EL'`) outages that are completed (`finished = 1`).
# Select all columns and assign the resulting DataFrame to `df_el`.

# %%
### HINT Run SELECT * FROM outages WHERE kind = 'EL' AND finished = 1
### HINT df_el = pd.read_sql_query("SELECT * FROM outages WHERE kind = 'EL' AND finished = 1", conn)
### BEGIN SOLUTION
df_el = pd.read_sql_query("SELECT * FROM outages WHERE kind = 'EL' AND finished = 1", conn)
### END SOLUTION

# %%
check(lambda: df_el is not None and len(df_el) > 0 and (df_el["kind"] == "EL").all() and (df_el["finished"].isin([1, True])).all(), "WHERE kind = 'EL' AND finished = 1 keeps only completed elevator outages")

# %% [markdown]
# ## 3. Aggregation: GROUP BY and HAVING
# Find the top 5 stations with the most total outages.
# Return two columns: `station` and `outage_count` (using `COUNT(*) AS outage_count`),
# ordered by `outage_count DESC LIMIT 5`. Assign to `df_top_stations`.

# %%
### HINT SELECT station, COUNT(*) AS outage_count FROM outages GROUP BY station ORDER BY outage_count DESC LIMIT 5
### BEGIN SOLUTION
df_top_stations = pd.read_sql_query("""
    SELECT station, COUNT(*) AS outage_count
    FROM outages
    GROUP BY station
    ORDER BY outage_count DESC
    LIMIT 5
""", conn)
### END SOLUTION

# %%
check(lambda: df_top_stations is not None and len(df_top_stations) == 5 and "station" in df_top_stations.columns and "outage_count" in df_top_stations.columns and df_top_stations["outage_count"].is_monotonic_decreasing, "GROUP BY station with COUNT(*) and ORDER BY DESC returns the top 5 stations")

# %% [markdown]
# ## 4. Joining metadata: LEFT JOIN
# Enrich the outages table with railroad operator metadata from the `stations` table.
# Join `outages o` with `stations s` on `o.station = s.name`.
# Select `o.equipment`, `o.station`, and `s.railroad`. Assign the DataFrame to `df_joined`.

# %%
### HINT Use LEFT JOIN stations s ON o.station = s.name
### BEGIN SOLUTION
df_joined = pd.read_sql_query("""
    SELECT o.equipment, o.station, s.railroad
    FROM outages o
    LEFT JOIN stations s ON o.station = s.name
""", conn)
### END SOLUTION

# %%
check(lambda: df_joined is not None and len(df_joined) == 667 and "railroad" in df_joined.columns, "LEFT JOIN keeps all 667 outage records while adding railroad metadata where available")

# %% [markdown]
# ## 5. Window functions: chronological sequence numbers
# For each outage, compute which occurrence it is for that specific piece of equipment over time.
# Use `ROW_NUMBER() OVER (PARTITION BY equipment ORDER BY start) AS seq`.
# Select `equipment`, `start`, and `seq`. Assign to `df_seq`.

# %%
### HINT Use ROW_NUMBER() OVER (PARTITION BY equipment ORDER BY start) AS seq
### BEGIN SOLUTION
df_seq = pd.read_sql_query("""
    SELECT equipment, start,
           ROW_NUMBER() OVER (PARTITION BY equipment ORDER BY start) AS seq
    FROM outages
""", conn)
### END SOLUTION

# %%
check(lambda: df_seq is not None and "seq" in df_seq.columns and df_seq["seq"].min() == 1 and df_seq["seq"].max() > 1, "ROW_NUMBER() partitions outages by equipment and numbers each incident chronologically")

# %% [markdown]
# ## 6. Point-in-time feature extraction without leakage
# To predict whether an outage will take long to fix, an engineer wants to know how many outages
# occurred at that station *prior* to this one.
# Use:
# `COUNT(*) OVER (PARTITION BY station ORDER BY start ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior_station_outages`
# Select `equipment`, `station`, `start`, and `prior_station_outages`. Assign to `df_pit`.

# %%
### HINT Use COUNT(*) OVER (PARTITION BY station ORDER BY start ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior_station_outages
### BEGIN SOLUTION
df_pit = pd.read_sql_query("""
    SELECT equipment, station, start,
           COUNT(*) OVER (
               PARTITION BY station
               ORDER BY start
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ) AS prior_station_outages
    FROM outages
""", conn)
### END SOLUTION

# %%
check(lambda: df_pit is not None and "prior_station_outages" in df_pit.columns and df_pit["prior_station_outages"].fillna(0).min() == 0, "Point-in-time window counts historical incidents strictly before each row's start time without leakage")
