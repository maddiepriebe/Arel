#!/usr/bin/env python
# coding: utf-8

# In[5]:


import streamlit as st
import pandas as pd
import numpy as np
import openpyxl
from io import StringIO


# In[15]:
# Apply thresholds directly without merge
def assign_bucket(row):
    size = int(row["# in Household"])
    income = row["Total Household Income"]

    # If household size exceeds table, use largest row
    if size not in thr_dict:
        size = max(thr_dict.keys())

    t = thr_dict[size]
    if income <= t["50%"]:
        return "≤50% AMI"
    elif income <= t["80%"]:
        return "50–80% AMI"
    elif income <= t["120%"]:
        return "80–120% AMI"
    else:
        return ">120% AMI"

# Set up page
st.set_page_config(page_title="Twenty15 Compliance Tracker", layout="centered")
st.title("Compliance Tracker")

# Directions to User 
st.markdown("Upload a CSV or Excel with columns for **Unit**, **Resident Name(s)** and **Annual Income**.")

# Import Files 
file = st.file_uploader("Choose a file", type=["xlsx", "csv"])

# Define where header is 
header_row = st.number_input("Row Number of Headers", min_value=0, value=6)

# Configure Buckets
st.subheader("Income Bucket Rules")

default_thresholds = pd.DataFrame({
    "Household Size": [1, 2, 3, 4, 5],
    "50%":  [46850, 53550, 60250, 66900, 72300],
    "80%":  [74960, 85680, 96400, 107040, 115680],
    "120%": [112440, 128520, 144600, 160560, 173520],
})
st.caption("Edit the thresholds as needed. Values should be whole dollars.")
thresholds = st.data_editor(
    default_thresholds,
    num_rows="fixed",
    use_container_width=True
)

# ami_value = st.number_input("Area Median Income (AMI) in $", min_value=0, value=100000)
# default_pct_edges = "0,0.3,0.5,0.8,1.0,9.9"
# edges_str = st.text_input("Bucket percent edges (0-based, e.g., 0,0.3,0.5,0.8,1,9.9)", value=default_pct_edges)
# labels_str = st.text_input("Bucket labels (comma-separated)", value="0-30% AMI,30-50%,50-80%,80-100%,>100%")

# st.caption("Tip: you can rename labels and bucket edges as needed. Extra-wide last edge captures all outliers.")

# Read File
if file:
    try:
        if file.name.lower().endswith(".csv"):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
            new_header = df.iloc[header_row]
            df = df[5:]
            df.columns = new_header
            df = df.reset_index(drop=True)
    except Exception as e:
        st.error(f"Could not read file: {e}")
        st.stop()

    # User maps columns 
    st.subheader("Map Your Columns")
    cols = list(df.columns)
    unit_col = st.selectbox("Unit column", options=cols)
    resident_col = st.selectbox("Resident name(s) column", options=cols)
    income_col = st.selectbox("Monthly Income column", options=cols)
    rent_col = st.selectbox("Monthly rent column", options=cols)


    # Preview Mapping
    st.write("Preview:")
    st.dataframe(df.head(10))

    # Clean & compute
    if st.button("Process"):
        data = df.copy()

        # Normalize income to numeric
        data["_income"] = (
            data[income_col]
            .astype(str)
            .str.replace(r"[\$,]", "", regex=True)
            .str.strip()
        )
        data["_income"] = pd.to_numeric(data["_income"], errors="coerce")
        data["_income"] = data["_income"]*12

        # Group by unit
        result = data.groupby(unit_col, as_index=False).agg({
            resident_col: lambda x: ", ".join(x.dropna().astype(str)),
            "_income": "sum"
        }).rename(columns={
            resident_col: "Resident Name",
            "_income": "Total Household Income",
            unit_col: "Unit"
        })

        result["# in Household"] = result["Resident Name"].apply(
            lambda x: len(str(x).split(',')) if pd.notna(x) else 1
        )

# Build buckets
        for colname in ["50%", "80%", "120%"]:
            thresholds[colname] = (
                thresholds[colname]
                .astype(str)
                .str.replace(r"[^\d.]", "", regex=True)
                .replace("", np.nan)
                .astype(float)
            )
        
        # Create a lookup dictionary keyed by household size
        thr_dict = thresholds.set_index("Household Size").to_dict("index")

        result["Income Bucket"] = result.apply(assign_bucket, axis=1)

        # Unit Summary
        bucket_order = ["≤50% AMI", "50–80% AMI", "80–120% AMI", ">120% AMI"]
        bucket_counts = (
            result["Income Bucket"]
            .value_counts()
            .rename_axis("Income Bucket")
            .reset_index(name="Units")
        )
        bucket_counts["Income Bucket"] = pd.Categorical(bucket_counts["Income Bucket"], categories=bucket_order, ordered=True)
        bucket_counts = bucket_counts.sort_values("Income Bucket")

        # Display summary
        st.subheader("Bucket Summary")
        st.dataframe(bucket_counts, use_container_width=True)

        st.bar_chart(bucket_counts.set_index("Income Bucket")["Units"])

        detailed_xlsx = result.to_excel(index=False)
        summary_xlsx = bucket_counts.to_excel(index=False)
# Download buttons

st.download_button(
label="⬇️ Download Detailed Results (CSV)",
data=detailed_csv,
            file_name="tenant_bucket_details.csv",
            mime="text/csv"
        )
        
st.download_button(
            label="⬇️ Download Bucket Summary (CSV)",
            data=summary_csv,
            file_name="bucket_summary.csv",
            mime="text/csv"
        )


# In[ ]:




