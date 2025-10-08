#!/usr/bin/env python
# coding: utf-8

# In[5]:


import streamlit as st
import pandas as pd
import numpy as np
import openpyxl
from io import StringIO


# In[15]:


# Set up page
st.set_page_config(page_title="Compliance Tracker", layout="centered")
st.title("Compliance Tracker")

# Directions to User 
st.markdown("Upload a CSV or Excel with columns for **Unit**, **Resident Name(s)** and **Annual Income**.")

# Import Files 
file = st.file_uploader("Choose a file", type=["xlsx", "csv"])

# Configure Buckets
st.subheader("Income Bucket Rules")

ami_value = st.number_input("Area Median Income (AMI) in $", min_value=0, value=100000)
default_pct_edges = "0,0.3,0.5,0.8,1.0,9.9"
edges_str = st.text_input("Bucket percent edges (0-based, e.g., 0,0.3,0.5,0.8,1,9.9)", value=default_pct_edges)
labels_str = st.text_input("Bucket labels (comma-separated)", value="0-30% AMI,30-50%,50-80%,80-100%,>100%")

st.caption("Tip: you can rename labels and bucket edges as needed. Extra-wide last edge captures all outliers.")

# Read File
if file:
    try:
        if file.name.lower().endswith(".csv"):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
    except Exception as e:
        st.error(f"Could not read file: {e}")
        st.stop()

    # User maps columns 
    st.subheader("Map Your Columns")
    cols = list(df.columns)
    unit_col = st.selectbox("Unit column", options=cols)
    resident_col = st.selectbox("Resident name(s) column", options=cols)
    income_col = st.selectbox("Annual income column", options=cols)
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

        # Group by unit
        result = data.groupby(unit_col, as_index=False).agg({
            resident_col: lambda x: ', '.join(x.dropna().astype(str)),
            "_income": "sum"
        })
    
        # Rename columns for clarity
        result = result.rename(columns={
            resident_col: "Resident Name",
            "_income": "Total Household Income",
            unit_col: "Unit",
        })

        result["# in Household"] = result["Resident Name"].apply(
            lambda x: len(str(x).split(',')) if pd.notna(x) else 0
        )

# Build buckets
    try:
        edges = [float(x) for x in edges_str.split(",")]
        labels = [s.strip() for s in labels_str.split(",")]
        if len(labels) != (len(edges) - 1):
            st.error("Number of labels must be exactly one less than number of edges.")
            st.stop()
    except Exception as e:
        st.error(f"Bucket config error: {e}")
        st.stop()

    values_for_cut = data["Total Income in Unit"] / max(ami_value, 1)
    
    data["Income Bucket"] = pd.cut(values_for_cut, bins=edges, labels=labels, include_lowest=True, right=False)


    # Bucket summary table (counts + residents + total income)
    bucket_summary = (data.groupby("Income Bucket", dropna=False).agg(
        Units=("Income Bucket", "size"),
        Residents=("Total Residents in Unit", "sum"),
        Total_Unit_Income=("Total Income in Unit", "sum"),).reset_index())

    # Order rows by label order
    bucket_summary["Income Bucket"] = pd.Categorical(bucket_summary["Income Bucket"], categories=labels, ordered=True)
    bucket_summary = bucket_summary.sort_values("Income Bucket")

    st.subheader("Bucket Summary (Units bucketed by total **unit** income)")
    st.dataframe(bucket_summary, use_container_width=True)

    # Simple chart
    st.bar_chart(by_bucket["households"])


# In[ ]:




