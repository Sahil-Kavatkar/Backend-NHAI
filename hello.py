import pandas as pd
from pymongo import MongoClient
import re
import math
import sys

# --- MongoDB Configuration ---
MONGO_URI = "mongodb+srv://sahilkavatkar:AwRJfwGN5u1gYleT@highway.3tlrn4x.mongodb.net/?retryWrites=true&w=majority&appName=highway"
DB_NAME = "test"
COLLECTION_NAME = "highwaysegment1"
EXCEL_FILE_PATH = sys.argv[1] if len(sys.argv) > 1 else "nhai1.xlsx"

def clean_header_name(header_tuple):
    if not isinstance(header_tuple, tuple):
        return str(header_tuple).strip()
    level0 = str(header_tuple[0]).strip() if pd.notna(header_tuple[0]) else ''
    level1 = str(header_tuple[1]).strip() if pd.notna(header_tuple[1]) else ''
    if level1 and not level1.startswith('Unnamed:') and level1 != 'nan':
        if re.match(r'Lane [LR]\d+', level0) and level1 in ['Start', 'Start.1', 'End', 'End.1']:
            return f"{level0}_{level1}"
        return level1
    elif level0 and not level0.startswith('Unnamed:') and level0 != 'nan':
        return level0
    return ''

def extract_lane_ids(headers):
    lane_ids = set()
    for col in headers:
        match = re.search(r'([LR]\d+)', col)
        if match:
            lane_ids.add(match.group(1))
    return sorted(list(lane_ids))

def import_highway_data():
    try:
        df = pd.read_excel(EXCEL_FILE_PATH, header=[0, 1])
        df.columns = [clean_header_name(col) for col in df.columns]
        df = df.loc[:, df.columns.astype(bool)]

        lane_ids = extract_lane_ids(df.columns)
        print(f"Detected lanes: {lane_ids}")

        rename_map = {
            'NH Number': 'highway',
            'Start Chainage': 'startChainage',
            'End Chainage': 'endChainage',
            'Length': 'segmentLength',
            'Structure Details': 'structure',
            'Remark': 'remark',
            'Limitation of BI as per MoRT&H Circular (in mm/km)': 'IRI_Limit',
            'Limitation of Rut Depth as per Concession Agreement (in mm)': 'Rutting_Limit',
            'Limitation of Cracking as per Concession Agreement (in % area)': 'Cracking_Limit',
            'Limitation of Ravelling as per Concession Agreement (in % area)': 'Ravelling_Limit',
        }

        for lane in lane_ids:
            rename_map[f"Lane {lane}_Start"] = f"{lane}_startLat"
            rename_map[f"Lane {lane}_Start.1"] = f"{lane}_startLng"
            rename_map[f"Lane {lane}_End"] = f"{lane}_endLat"
            rename_map[f"Lane {lane}_End.1"] = f"{lane}_endLng"
            rename_map[f"{lane} Lane Roughness BI (in mm/km)"] = f"{lane}_roughness"
            rename_map[f"{lane} Rut Depth (in mm)"] = f"{lane}_rutDepth"
            rename_map[f"{lane} Crack Area (in % area)"] = f"{lane}_crackPercent"
            rename_map[f"{lane} Area (% area)"] = f"{lane}_ravellingPercent"

        df.rename(columns=rename_map, inplace=True)

        ff_cols = ['highway', 'startChainage', 'endChainage', 'segmentLength', 'structure',
                   'IRI_Limit', 'Rutting_Limit', 'Cracking_Limit', 'Ravelling_Limit', 'remark']
        df[ff_cols] = df[ff_cols].ffill()

        for col in df.columns:
            if any(metric in col for metric in ['Lat', 'Lng', 'roughness', 'rutDepth', 'crackPercent', 'ravellingPercent']):
                df[col] = pd.to_numeric(df[col], errors='coerce')

        final_documents = []
        for _, row in df.iterrows():
            segment = {
                'highway': row['highway'],
                'startChainage': row['startChainage'],
                'endChainage': row['endChainage'],
                'segmentLength': row['segmentLength'],
                'structure': row.get('structure', 'plain'),
                'lanes': []
            }

            for opt in ['IRI_Limit', 'Rutting_Limit', 'Cracking_Limit', 'Ravelling_Limit', 'remark']:
                if opt in row:
                    segment[opt] = row[opt]

            iri = row.get('IRI_Limit', 2400)
            rut = row.get('Rutting_Limit', 5)
            crack = row.get('Cracking_Limit', 5)
            ravel = row.get('Ravelling_Limit', 5)

            for lane in lane_ids:
                lane_doc = {
                    'laneId': lane,
                    'startLat': row.get(f'{lane}_startLat'),
                    'startLng': row.get(f'{lane}_startLng'),
                    'endLat': row.get(f'{lane}_endLat'),
                    'endLng': row.get(f'{lane}_endLng'),
                    'roughness': row.get(f'{lane}_roughness'),
                    'rutDepth': row.get(f'{lane}_rutDepth'),
                    'crackPercent': row.get(f'{lane}_crackPercent'),
                    'ravellingPercent': row.get(f'{lane}_ravellingPercent'),
                }

                lane_doc['status'] = {
                    'roughness': 'critical' if lane_doc['roughness'] and lane_doc['roughness'] > iri else 'normal',
                    'rutDepth': 'critical' if lane_doc['rutDepth'] and lane_doc['rutDepth'] > rut else 'normal',
                    'crackPercent': 'critical' if lane_doc['crackPercent'] and lane_doc['crackPercent'] > crack else 'normal',
                    'ravelling': 'critical' if lane_doc['ravellingPercent'] and lane_doc['ravellingPercent'] > ravel else 'normal',
                }

                if any(lane_doc[k] is not None for k in ['startLat', 'startLng', 'roughness']):
                    segment['lanes'].append(lane_doc)

            if segment['lanes']:
                final_documents.append(segment)

        print(f"Prepared {len(final_documents)} documents for MongoDB insertion.")

        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        result = collection.insert_many(final_documents)
        print(f"Inserted {len(result.inserted_ids)} documents into '{COLLECTION_NAME}'")
        client.close()

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    import_highway_data()
