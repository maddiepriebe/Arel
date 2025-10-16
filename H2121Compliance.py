import streamlit as st
import pandas as pd
import numpy as np
from io import StringIO
import io
import xlrd
import re

def assign_bucket(row):
    if int(row["# in Household"]):
        size = int(row["# in Household"])
    else:
        return "Vacant"
        
    income = row["Total Household Income"]

    # If household size exceeds table, use largest row
    if size not in thr_dict:
        size = max(thr_dict.keys())

    t = thr_dict[size]
    if income <= t["30%"]:
        return "≤30% AMI"
    elif income <= t["60%"]:
        return "30–60% AMI"
    elif income <= t["80%"]:
        return "60–80% AMI"
    else:
        return ">80% AMI"

def clean_name(s):
    if ',' in s:
        parts = [p.strip() for p in s.split(',', 1)]
        last = parts[0]
        first = parts[1]
        s = f"{first} {last}"
    s = re.sub(r'[^\w\s]', '', s).lower()
    s = re.sub(r'\s+', ' ', s).strip()
    return s.title()
    
def clean_household(x):
    if str(x).lower() == 'vacant':
        return 0
    try:
        return int(x)
    except:
        return 1  # for True or other truthy values
    
# Set up page
st.set_page_config(page_title="H2121 Compliance Tracker", layout="centered")
st.title("Heights2121 Compliance Tracker")

# Directions to User 
st.markdown("Upload Excel File with columns for **Unit**, **Resident Name(s)** and **Annual Income**.")

# Import Files 
file = st.file_uploader("Choose a file", type=["xlsx", "xls"])

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
    use_container_width=True
)

thresholds_df = thresholds.set_index("Thresholds")  # index like "30%","60%","80%"
thr_dict = {
    int(hh_size): {
        "30%": float(thresholds_df.loc[f"{low_threshold}%", hh_size]),
        "60%": float(thresholds_df.loc[f"{mid_threshold}%", hh_size]),
        "80%": float(thresholds_df.loc[f"{upper_threshold}%", hh_size]),
    }
    for hh_size in thresholds_df.columns
}

if file:
    try:
        df = pd.read_excel(file)
        new_header = df.iloc[header_row]
        df = df[header_row + 1:]
        df.columns = new_header
        df = df.reset_index(drop=True)

        # Clean Columns
        df = df.loc[:, df.columns.notna()]
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
    on = st.toggle("File contains # occupants in household")
    cols = list(df.columns)
    unit_col = st.selectbox("Unit column", options=cols)
    resident_col = st.selectbox("Resident name(s) column", options=cols)
    income_col = st.selectbox("Annual Income column", options=cols)
    
    if on:
        household_col = st.selectbox("# in Household", options=cols)
    # rent_col = st.selectbox("Monthly rent column", options=cols)


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

        if on:
            data = data[[unit_col, resident_col, income_col, household_col]]
            data[household_col] = data[household_col].apply(clean_household)
        else:
            data = data[[unit_col, resident_col, income_col]]
        

        # Normalize income to numeric
        data["_income"] = (
            data[income_col]
            .astype(str)
            .str.replace(r"[\$,]", "", regex=True)
            .str.strip()
        )
        data["_income"] = pd.to_numeric(data["_income"], errors="coerce")

        data[resident_col] = data[resident_col].apply(clean_name)

        # Group by unit
        result = data.groupby(unit_col, as_index=False).agg({
            resident_col: lambda x: ", ".join(x.dropna().astype(str)),
            "_income": "sum"
        }).rename(columns={
            resident_col: "Resident Name",
            "_income": "Total Household Income",
            unit_col: "Unit"
        })
        if not on:
            result["# in Household"] = result["Resident Name"].apply(
                lambda x: len(str(x).split(',')) if pd.notna(x) else 1
            )

# Build buckets

        result["Income Bucket"] = result.apply(assign_bucket, axis=1)

        # Unit Summary
        bucket_order = ["≤30% AMI", "30–60% AMI", "60–80% AMI", ">80% AMI", "Vacant"]
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

# Download buttons

        st.markdown("### 📤 Export Results")
            
        # One workbook with two sheets (Details + Summary)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
            result.to_excel(writer, index=False, sheet_name="Details")
            bucket_counts.to_excel(writer, index=False, sheet_name="Summary")
        xlsx_bytes = output.getvalue()
            
        st.download_button(
            label="⬇️ Download Results (Excel, 2 tabs)",
            data=xlsx_bytes,
            file_name="compliance_results.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )





