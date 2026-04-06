# 💧 AI-Based Water Quality Monitoring & Potability Assessment

## 🧠 Project Overview

A data-driven system that processes government water quality reports (NWMP), evaluates drinking water safety, identifies pollution causes, and provides insights with explainable AI.

---

## 🚨 Problem Statement

Water quality data is collected but underutilized. There is no unified system to:

* Evaluate water safety using standard thresholds
* Identify pollution causes
* Provide actionable insights for authorities

---

## 🎯 What This System Does

* Extracts data from raw PDFs (2016–2023)
* Cleans and standardizes datasets
* Calculates:

  * Safety label (Safe / Unsafe)
  * Pollution score (0–100)
  * Violated parameters
* Converts locations → latitude/longitude
* Generates insights using RAG + WHO guidelines
* Prepares dataset for visualization and forecasting

---

## 📁 Project Structure

```
ml/
├── data/
│   ├── raw/           # Year-wise PDFs (2016–2023)
│   ├── processed/     # Extracted + cleaned CSVs
│   ├── geocoded/      # CSVs with lat/long
│   ├── insights/      # Cached AI insights
│
├── pipeline/
│   ├── extract.py
│   ├── clean.py
│   ├── geocode.py
│   ├── merge_script.py
│
├── analysis/
│   ├── current_status.py
│   ├── pollution_insights.py
│   ├── pollution_insights_runner.py
│   ├── rag_pipeline.py
│   ├── ingest.py
│
backend/
frontend/
```

---

## ⚙️ Setup Instructions

### 1️⃣ Clone Repo

```bash
git clone <your-repo-url>
cd AI-Based-Water_Potability_Assessment
```

---

### 2️⃣ Create Virtual Environment

```bash
python -m venv .venv
.venv\Scripts\activate   # Windows
```

---

### 3️⃣ Install Dependencies

```bash
pip install -r requirements.txt
```

---

### 4️⃣ Set Environment Variables

Create `.env` file inside `ml/analysis/`:

```
GROQ_API_KEY=your_api_key_here
```

---

## 🚀 How to Run (Step-by-Step)

### 🔹 Step 1: Go to ML folder

```bash
cd ml
```

---

### 🔹 Step 2: Extract Data from PDFs

```bash
python pipeline/extract.py --state KARNATAKA --exclude_years 2023 --data_dir data/raw --out_dir data/processed
```

---

### 🔹 Step 3: Clean Data

```bash
python pipeline/clean.py --input_dir data/processed --output_dir data/processed --exclude_years 2023
```

---

### 🔹 Step 4: Geocode Locations

```bash
python pipeline/geocode.py --input_dir data/processed --output_dir data/geocoded --state Karnataka --exclude_years 2023
```

---

### 🔹 Step 5: Merge Dataset (2016–2022)

```bash
python pipeline/merge_script.py
```

📄 Output:

```
data/geocoded/karnataka_train_2016_2022.csv
```

---

## 🤖 Generate AI Insights (Optional)

### Ingest WHO Guidelines into RAG

```bash
python analysis/ingest.py
```

---

### Generate Pollution Insights

```bash
python analysis/pollution_insights_runner.py
```

📄 Output:

```
data/insights/combo_insights_cache.json
```

---

## 📊 Key Concepts Used

* PDF Parsing → `pdfplumber`
* Data Processing → `pandas`
* Geocoding → `geopy (Nominatim)`
* Pollution Scoring → Domain-based logic
* Explainable AI → RAG + LLM (Groq)
* Vector DB → ChromaDB
* Embeddings → Sentence Transformers

---

## 📈 Output Features

* Safe / Unsafe classification
* Pollution score (0–100)
* Violated parameters
* Geo-mapped water bodies
* AI-generated pollution causes & solutions

---

## ⚠️ Notes

* 2023 dataset is reserved for testing
* Geocoding uses free API → slow (cached after first run)
* RAG requires internet (Groq API)

---

## 🎯 Current Status

✅ Data extraction (multi-schema support)
✅ Cleaning & feature engineering
✅ Geocoding
✅ Dataset merging
✅ AI insights (RAG + caching)

🚧 Forecasting module (next step)
🚧 Backend + frontend integration

---

## 💬 One-Line Summary

A system that converts raw water quality reports into actionable insights, safety evaluation, and explainable analysis for better environmental decision-making.

---
