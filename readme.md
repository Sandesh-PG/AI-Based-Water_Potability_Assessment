# 💧 AI-Based Water Quality Monitoring & Potability Assessment

## 🧠 Overview

A data-driven system that processes government water quality datasets (NWMP) to evaluate drinking water safety, identify pollution causes, and generate actionable insights using explainable AI.

---

## 🚨 Problem Statement

Water quality data is collected at scale but not effectively utilized. There is a lack of systems that can:

* Evaluate water safety using standard thresholds
* Identify key pollution factors
* Provide data-driven insights for decision-making

---

## 🎯 Core Features

* Water safety classification (Safe / Unsafe)
* Pollution score calculation (0–100)
* Detection of violated parameters
* Location mapping using geocoding
* Explainable insights (rule-based + RAG using WHO guidelines)
* Time-series forecasting of pollution trends

---

## ⚙️ Setup

### Clone Repository

```bash
git clone <your-repo-url>
cd AI-Based-Water_Potability_Assessment
```

### Create Virtual Environment

```bash
python -m venv .venv
.venv\Scripts\activate
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Environment Variables

Create `.env`:

```
GROQ_API_KEY=your_api_key_here
```

---

## 🚀 Pipeline Execution

```bash
cd ml
```

### 1. Extract Data

```bash
python pipeline/extract.py --state KARNATAKA --exclude_years 2023 --data_dir data/raw --out_dir data/processed
```

### 2. Clean Data

```bash
python pipeline/clean.py --input_dir data/processed --output_dir data/processed --exclude_years 2023
```

### 3. Geocode Locations

```bash
python pipeline/geocode.py --input_dir data/processed --output_dir data/geocoded --state Karnataka --exclude_years 2023
```

### 4. Merge Dataset

```bash
python pipeline/merge_script.py
```

---

## 🤖 AI Insights (Optional)

### Ingest Knowledge Base

```bash
python analysis/ingest.py
```

### Generate Insights

```bash
python analysis/pollution_insights_runner.py
```

---

## 📊 Output

The system produces structured data including:

* Pollution score
* Safety label
* Violated parameters
* Geo-coordinates
* AI-generated insights (causes, impacts, measures)

---

## ⚠️ Notes

* 2023 data is reserved for testing
* Geocoding may be slow on first run
* RAG requires internet access

---

## 🎯 Status

* Data pipeline complete
* Explainable AI implemented
* Forecasting module in progress
* Backend & frontend integration upcoming

---

## 💬 Summary

A system that transforms raw water quality data into meaningful insights, enabling better monitoring, analysis, and decision-making.
 
---

## 🧩 Quick Dev / Run

- Run backend API (FastAPI):

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

- Run frontend (Vite/React):

```bash
cd frontend
npm install
npm run dev
```

## Contributing

- Open issues for bugs or feature requests.
- Send a PR with a clear description and tests for code changes.

## License

- MIT (or change as appropriate).

## Contact

- Maintainer: Project team (add email or GitHub handle)

