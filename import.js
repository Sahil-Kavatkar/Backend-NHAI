import mongoose from 'mongoose';
import XLSX from 'xlsx';
import HighwaySegment from './models/HighwaySegment.js';

mongoose.connect('mongodb+srv://sahilkavatkar:AwRJfwGN5u1gYleT@highway.3tlrn4x.mongodb.net/?retryWrites=true&w=majority&appName=highway')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// Load Excel file
const workbook = XLSX.readFile('nhai.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const rows = jsonData.slice(2); // skip first 2 header rows

const threshold = {
  roughness: 2400,
  rutDepth: 5,
  crack: 5,
  ravelling: 1
};

// Safe float parser
function safeParseFloat(val) {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

const laneIndices = {
  L1: [5, 6, 7, 8, 39, 48, 57, 66],
  L2: [9, 10, 11, 12, 40, 49, 58, 67],
  L3: [13, 14, 15, 16, 41, 50, 59, 68],
  L4: [17, 18, 19, 20, 42, 51, 60, 69],
  R1: [21, 22, 23, 24, 43, 52, 61, 70],
  R2: [25, 26, 27, 28, 44, 53, 62, 71],
  R3: [29, 30, 31, 32, 45, 54, 63, 72],
  R4: [33, 34, 35, 36, 46, 55, 64, 73],
};

const allSegments = [];

for (const row of rows) {
  try {
    const lanes = Object.entries(laneIndices).map(([laneId, idx]) => {
      const [startLat, startLng, endLat, endLng, rough, rut, crack, ravel] = idx.map(i => safeParseFloat(row[i]));

      // Skip lane if coordinates are not valid
      if (!startLat || !startLng || !endLat || !endLng) return null;

      return {
        laneId,
        startLat,
        startLng,
        endLat,
        endLng,
        roughness: rough,
        rutDepth: rut,
        crackPercent: crack,
        ravellingPercent: ravel,
        status: {
          roughness: rough > threshold.roughness ? 'critical' : 'normal',
          rutDepth: rut > threshold.rutDepth ? 'critical' : 'normal',
          crackPercent: crack > threshold.crack ? 'critical' : 'normal',
          ravelling: ravel > threshold.ravelling ? 'critical' : 'normal'
        }
      };
    }).filter(Boolean); // remove null entries (invalid lanes)

    // Skip segment if no valid lanes
    if (!lanes.length) continue;

    const structure = (row[4] && typeof row[4] === 'string' && row[4].trim() !== '') ? row[4].trim() : 'plain';

    const segment = new HighwaySegment({
      highway: row[0],
      startChainage: parseInt(row[1]),
      endChainage: parseInt(row[2]),
      segmentLength: parseInt(row[3]),
      structure,
      lanes
    });

    allSegments.push(segment);
  } catch (e) {
    console.error('Skipping row due to error:', e.message);
    continue;
  }
}

// Insert into DB
await HighwaySegment.insertMany(allSegments);
console.log(`✅ Inserted ${allSegments.length} highway segments.`);
await mongoose.disconnect();