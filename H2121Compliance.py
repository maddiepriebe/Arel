import streamlit as st
import pandas as pd
import numpy as np
from io import StringIO
    
# Set up page
st.set_page_config(page_title="H2121 Compliance Tracker", layout="centered")
st.title("Heights2121 Compliance Tracker")

# Directions to User 
st.markdown("Upload Excel File with columns for **Unit**, **Resident Name(s)** and **Annual Income**.")

# Import Files 
tenant_file = st.file_uploader("Choose a file", type=["xlsx", "xls"])

# Define where header is 
header_row = st.number_input("Row Number of Headers", min_value=0, value=6)
st.caption("enter row number where column titles are found in excel file, see column mapping selection below to see if you selected the correct row number")


# Configure Buckets
st.subheader("Income Bucket Rules")

st.markdown("Threshold %s")
low_threshold = st.number_input("Lower Tier Threshold %", min_value=0, value=30)
mid_threshold = st.number_input("Mid Tier Threshold %", min_value=0, value=60)
upper_threshold = st.number_input("Upper Tier Threshold %", min_value=0, value=80)

default_thresholds = pd.DataFrame({
    "Thresholds": [str(low_threshold)+"%", str(mid_threshold)+"%", str(upper_threshold)+"%"],
    1:  [19860,	39720,	52960],
    2:  [22710,	45420,	60560],
    3: [25530, 51060,	68080],
    4: [28380,	56760,	75680],
    5: [30660,	61320,	81760]
})
st.caption("Edit the thresholds as needed. Values should be whole dollars.")
thresholds = st.data_editor(
    default_thresholds,
    num_rows="fixed",
    width=True
)

if file:
    try:
        df = pd.read_excel(file)
        new_header = df.iloc[header_row]
        df = df[header_row + 1:]
        df.columns = new_header
        df = df.reset_index(drop=True)

        # Clean Columns
        df.columns = (
            df.columns.astype(str)
              .str.replace(r'\\n', ' ', regex=True)   # replace literal '\n' if any
              .str.replace('\n', ' ', regex=False)    # replace real line breaks
              .str.replace(r'\s+', ' ', regex=True)   # collapse multiple spaces
              .str.strip()                            # remove leading/trailing spaces
              .str.replace('NaN', '', regex=False)    # remove "NaN" placeholders
        )
        
    except Exception as e:
        st.error(f"Could not read file: {e}")
        st.stop()

    # User maps columns 
    st.subheader("Map Your Columns")
    cols = list(df.columns)
    unit_col = st.selectbox("Unit column", options=cols)
    resident_col = st.selectbox("Resident name(s) column", options=cols)
    income_col = st.selectbox("Annual Income column", options=cols)
    rent_col = st.selectbox("Monthly rent column", options=cols)


    # Preview Mapping
    st.write("Preview:")
    st.dataframe(df.head(10))

    # Clean & compute
    if st.button("Process"):
        data = df.copy()
        data = data[data[unit_col].notna() & (data[unit_col].astype(str).str.strip() != '')]
        data[resident_col] = (
            df[resident_col]
              .astype(str)
              .str.split('\n')
              .str[0]
              .str.strip()
        )
        data = data[[unit_col, resident_col, income_col, rent_col]]
        

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


