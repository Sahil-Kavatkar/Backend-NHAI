import mongoose from 'mongoose';
import csv from 'csv-parser';
import fs from 'fs';
import * as XLSX from 'xlsx';
import HighwaySegment1 from './models/dumy.js'; // Adjust path if needed


const mongoUri = 'mongodb+srv://sahilkavatkar:AwRJfwGN5u1gYleT@highway.3tlrn4x.mongodb.net/?retryWrites=true&w=majority&appName=highway';

async function importData() {
    try {
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB connected successfully!');

        // Optional: Clear existing data for fresh imports during development
        // await HighwaySegment.deleteMany({});
        // console.log('Cleared existing HighwaySegment data.');

        // <<< IMPORTANT: Update this path to your actual XLSX file name >>>
        const filePath = 'nhai1.xlsx'; // Assuming you saved it as nhai.xlsx

        // Read the XLSX file content as a buffer
        const fileBuffer = fs.readFileSync(filePath);

        // Parse the XLSX using XLSX.read
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        // Get the first sheet name
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert the worksheet to an array of arrays.
        // { header: 1 } tells XLSX.utils.sheet_to_json to return rows as arrays,
        // which allows us to process the multi-level headers manually.
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (rawData.length < 3) { // Need at least 2 header rows + 1 data row
            console.error('Spreadsheet has too few rows to contain header information and data.');
            return;
        }

        // Extract the two header rows
        const headerRow1 = rawData[0]; // e.g., ["NH Number", "Lane L1", ...]
        const headerRow2 = rawData[1]; // e.g., ["nan", "Latitude", "Longitude", ...]

        // --- Dynamic Column Mapping Generation ---
        const columnMap = {};
        let currentMajorHeader = ''; // To track headers like "Lane L1", "Limitation of..."
        let currentMajorHeaderStartCol = -1; // Starting column index of the major header block

        // First, process the known fixed-position base segment details
        // These are assumed to be in the very first columns consistently
        columnMap.road = 0;
        columnMap.start_chainage = 1;
        columnMap.end_chainage = 2;
        columnMap.length = 3;
        columnMap.structure = 4;

        // Iterate through headerRow1 to identify major blocks and their sub-headers in headerRow2
        for (let colIdx = 0; colIdx < headerRow1.length; colIdx++) {
            const h1 = String(headerRow1[colIdx] || '').trim();
            const h2 = String(headerRow2[colIdx] || '').trim();

            // Identify start of a new major header block from row 1
            if (h1 && !h1.startsWith('Unnamed:') && !h1.includes('Limitation')) { // Ignore empty or 'Unnamed:' or 'Limitation' which are global
                currentMajorHeader = h1;
                currentMajorHeaderStartCol = colIdx;
            }

            // --- Dynamic Lane Coordinates Mapping ---
            // Pattern: "Lane L" in H1, then "Latitude", "Longitude" in H2 for start/end
            if (currentMajorHeader.startsWith('Lane L')) {
                const laneNum = currentMajorHeader.replace('Lane ', ''); // Extracts 'L1', 'L2', 'L3'

                if (h2 === 'Latitude' && colIdx === currentMajorHeaderStartCol) {
                    columnMap[`${laneNum}_start_lat`] = colIdx;
                } else if (h2 === 'Longitude' && colIdx === currentMajorHeaderStartCol + 1) {
                    columnMap[`${laneNum}_start_lon`] = colIdx;
                } else if (h2 === 'Latitude' && colIdx === currentMajorHeaderStartCol + 2) { // Assuming 2nd Latitude in block is end_lat
                    columnMap[`${laneNum}_end_lat`] = colIdx;
                } else if (h2 === 'Longitude' && colIdx === currentMajorHeaderStartCol + 3) { // Assuming 2nd Longitude in block is end_lon
                    columnMap[`${laneNum}_end_lon`] = colIdx;
                }
            }

            // --- Dynamic Lane Metrics Mapping (using patterns in headerRow2) ---
            // These metrics (IRI, Rutting, Cracking, Ravelling) often have unique names in headerRow2
            // that specify the lane (e.g., "L1 Lane Roughness BI").
            // We'll map these based on pattern matching in headerRow2 regardless of headerRow1's content ('Unnamed:')
            const laneMetricMatch = h2.match(/^(L\d+)\s(.+)/); // Captures "L1", "L2", etc. and the rest of the metric name
            if (laneMetricMatch) {
                const laneId = laneMetricMatch[1]; // e.g., "L1"
                const metricName = laneMetricMatch[2].trim(); // e.g., "Lane Roughness BI (in mm/km)"

                if (metricName.includes('Roughness BI')) {
                    columnMap[`${laneId}_IRI`] = colIdx;
                } else if (metricName.includes('Rut Depth')) {
                    columnMap[`${laneId}_Rutting`] = colIdx;
                } else if (metricName.includes('Crack Area')) {
                    columnMap[`${laneId}_Cracking`] = colIdx;
                } else if (metricName.includes('Area (% area)')) { // For Ravelling
                    columnMap[`${laneId}_Ravelling`] = colIdx;
                }
                // Add similar logic for status columns if they exist, e.g.:
                // else if (metricName.includes('Roughness Status')) {
                //     columnMap[`${laneId}_IRI_Status`] = colIdx;
                // }
                // ...and so on for other statuses
            }

            // --- Global Limitation Metrics (e.g., "Limitation of BI...") ---
            if (h1.includes('Limitation of BI')) columnMap.IRI_Limit = colIdx;
            if (h1.includes('Limitation of Rut Depth')) columnMap.Rutting_Limit = colIdx;
            if (h1.includes('Limitation of Cracking')) columnMap.Cracking_Limit = colIdx;
            if (h1.includes('Limitation of Ravelling')) columnMap.Ravelling_Limit = colIdx;
            if (h1.includes('Remark')) columnMap.remark = colIdx; // Assuming this is also a single col
        }

        console.log('Dynamically generated columnMap:', columnMap); // For debugging: check the generated map

        const highwaySegmentsMap = new Map();

        // Helper function to parse numbers safely
        const parseNumberSafely = (value) => {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? null : parsed;
        };

        // Start processing from the third row (index 2), as the first two are header rows
        for (let i = 2; i < rawData.length; i++) {
            const row = rawData[i];

            // Extract main segment data using the dynamically built columnMap
            const road = columnMap.road !== undefined && row[columnMap.road] ? String(row[columnMap.road]).trim() : null;
            const startChainage = columnMap.start_chainage !== undefined ? parseNumberSafely(row[columnMap.start_chainage]) : null;
            const endChainage = columnMap.end_chainage !== undefined ? parseNumberSafely(row[columnMap.end_chainage]) : null;
            const segmentLength = columnMap.length !== undefined ? parseNumberSafely(row[columnMap.length]) : null;
            const structure = columnMap.structure !== undefined && row[columnMap.structure] ? String(row[columnMap.structure]).trim() : 'plain';


            // Skip rows where essential segment data is missing or invalid
            if (road === null || startChainage === null || endChainage === null || segmentLength === null) {
                console.warn(`Skipping row ${i + 1} due to missing/invalid core highway segment data: ${JSON.stringify(row.slice(0, 5))}`);
                continue;
            }

            const segmentKey = `${road}-${startChainage}-${endChainage}`;

            // Initialize or retrieve the segment in the map
            if (!highwaySegmentsMap.has(segmentKey)) {
                highwaySegmentsMap.set(segmentKey, {
                    highway: road,
                    startChainage: startChainage,
                    endChainage: endChainage,
                    segmentLength: segmentLength,
                    structure: structure,
                    lanes: []
                });
            }

            const currentSegment = highwaySegmentsMap.get(segmentKey);

            // Dynamically find and process data for each lane (L1, L2, L3, etc.)
            // We iterate through all possible 'L' prefixes that were found in the columnMap
            const detectedLanes = new Set();
            for (const key in columnMap) {
                const match = key.match(/^(L\d+)_/); // e.g., extracts "L1" from "L1_start_lat"
                if (match) {
                    detectedLanes.add(match[1]);
                }
            }

            const sortedDetectedLanes = Array.from(detectedLanes).sort((a, b) => {
                const numA = parseInt(a.replace('L', ''));
                const numB = parseInt(b.replace('L', ''));
                return numA - numB;
            });


            for (const laneNum of sortedDetectedLanes) {
                const laneData = {
                    laneId: `Lane ${laneNum}`,
                    startLat: columnMap[`${laneNum}_start_lat`] !== undefined ? parseNumberSafely(row[columnMap[`${laneNum}_start_lat`]]) : null,
                    startLng: columnMap[`${laneNum}_start_lon`] !== undefined ? parseNumberSafely(row[columnMap[`${laneNum}_start_lon`]]) : null,
                    endLat: columnMap[`${laneNum}_end_lat`] !== undefined ? parseNumberSafely(row[columnMap[`${laneNum}_end_lat`]]) : null,
                    endLng: columnMap[`${laneNum}_end_lon`] !== undefined ? parseNumberSafely(row[columnMap[`${laneNum}_end_lon`]]) : null,
                    roughness: columnMap[`${laneNum}_IRI`] !== undefined ? parseNumberSafely(row[columnMap[`${laneNum}_IRI`]]) : null,
                    rutDepth: columnMap[`${laneNum}_Rutting`] !== undefined ? parseNumberSafely(row[columnMap[`${laneNum}_Rutting`]]) : null,
                    crackPercent: columnMap[`${laneNum}_Cracking`] !== undefined ? parseNumberSafely(row[columnMap[`${laneNum}_Cracking`]]) : null,
                    ravellingPercent: columnMap[`${laneNum}_Ravelling`] !== undefined ? parseNumberSafely(row[columnMap[`${laneNum}_Ravelling`]]) : null,
                    status: {
                        // <<< IMPORTANT: Add actual column indices for status fields if they exist >>>
                        // You'd need to add `L1_IRI_Status`, etc. to the dynamic columnMap
                        roughness: columnMap[`${laneNum}_IRI_Status`] !== undefined && row[columnMap[`${laneNum}_IRI_Status`]] ? String(row[columnMap[`${laneNum}_IRI_Status`]]).trim() : 'N/A',
                        rutDepth: columnMap[`${laneNum}_Rutting_Status`] !== undefined && row[columnMap[`${laneNum}_Rutting_Status`]] ? String(row[columnMap[`${laneNum}_Rutting_Status`]]).trim() : 'N/A',
                        crackPercent: columnMap[`${laneNum}_Cracking_Status`] !== undefined && row[columnMap[`${laneNum}_Cracking_Status`]] ? String(row[columnMap[`${laneNum}_Cracking_Status`]]).trim() : 'N/A',
                        ravelling: columnMap[`${laneNum}_Ravelling_Status`] !== undefined && row[columnMap[`${laneNum}_Ravelling_Status`]] ? String(row[columnMap[`${laneNum}_Ravelling_Status`]]).trim() : 'N/A'
                    }
                };

                // Only add lane if its start coordinates are valid
                if (laneData.startLat !== null && laneData.startLng !== null) {
                    currentSegment.lanes.push(laneData);
                } else {
                    console.warn(`Skipping Lane ${laneNum} for segment ${segmentKey} due to missing or invalid coordinates.`);
                }
            }
        }

        const highwaySegmentsToInsert = Array.from(highwaySegmentsMap.values());
        console.log(`Prepared ${highwaySegmentsToInsert.length} highway segments for insertion.`);

        // Insert segments into MongoDB
        let insertedCount = 0;
        for (const segment of highwaySegmentsToInsert) {
            try {
                const newSegment = new HighwaySegment1(segment);
                await newSegment.save();
                insertedCount++;
            } catch (saveError) {
                console.error(`Error saving segment ${segment.highway} from ${segment.startChainage} to ${segment.endChainage}:`, saveError.message);
                // console.error("Failed segment data:", JSON.stringify(segment, null, 2)); // Uncomment for detailed debug of a failed segment
            }
            if (insertedCount % 100 === 0) { // Log progress every 100 segments
                console.log(`Inserted ${insertedCount} segments...`);
            }
        }

        console.log(`Successfully inserted ${insertedCount} highway segments out of ${highwaySegmentsToInsert.length} prepared.`);
        console.log('Data import process completed!');

    } catch (error) {
        console.error('Error during data import:', error);
    } finally {
        // Disconnect from MongoDB after import, or keep open if this script is part of a larger application
        mongoose.disconnect();
    }
}

importData();