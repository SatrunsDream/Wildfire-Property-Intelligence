# Wildfire Property Intelligence

This repository implements exploratory analysis and comparative evaluation of statistical and spatial methods to detect and correct reporting inconsistencies in aggregated NSI property data for wildfire risk applications

## Local deployment of the website

**Backend**

Clone the repository and run the following code. Backend will deploy on http://localhost:8000.

```
cd website/backend
pip install uvicorn fastapi polars h3 httpx numpy scipy
uvicorn main:app --reload
```

**Frontend**

Run the following code, frontend will deploy on http://localhost:5173.

```
cd website/frontend
npm install
npm run dev
```

*Note:* the main data file is not present in this repository and will need to be downloaded separately.
