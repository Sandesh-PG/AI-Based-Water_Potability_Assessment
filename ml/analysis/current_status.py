import pandas as pd

# Load merged dataset
df = pd.read_csv("data/geocoded/karnataka_train_2016_2022.csv")

print("Dataset shape:", df.shape)

# 1️⃣ Most polluted locations
most_polluted = df.sort_values("pollution_score", ascending=False).head(10)

print("\nTop 10 Most Polluted Locations:")
print(most_polluted[["monitoring_location", "year", "pollution_score"]])

# 2️⃣ Cleanest locations
cleanest = df.sort_values("pollution_score").head(10)

print("\nTop 10 Cleanest Locations:")
print(cleanest[["monitoring_location", "year", "pollution_score"]])

# 3️⃣ Average pollution per year
yearly = df.groupby("year")["pollution_score"].mean()

print("\nAverage Pollution Score by Year:")
print(yearly)

# 4️⃣ Parameter averages
params = [
    "temperature_avg",
    "do_avg",
    "ph_avg",
    "conductivity_avg",
    "bod_avg",
    "nitrate_avg",
    "fecal_coliform_avg",
    "total_coliform_avg",
    "fecal_streptococci_avg"
]

param_means = df[params].mean()

print("\nAverage Parameter Values:")
print(param_means)