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
st.caption("enter row number where column titles are found in excel file")


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
