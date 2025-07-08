// models/HighwaySegment.js
import mongoose from 'mongoose';

const laneSchema1 = new mongoose.Schema({
  laneId: String,
  startLat: Number,
  startLng: Number,
  endLat: Number,
  endLng: Number,
  roughness: Number,
  rutDepth: Number,
  crackPercent: Number,
  ravellingPercent: Number,
  status: {
    roughness: String,
    rutDepth: String,
    crackPercent: String,
    ravelling: String
  }
});

const highwaySegmentSchema1 = new mongoose.Schema({
  highway: String,
  startChainage: Number,
  endChainage: Number,
  segmentLength: Number,
  structure: { type: String, default: 'plain' },
  lanes: [laneSchema1]
});

const HighwaySegment1 = mongoose.model('HighwaySegment1', highwaySegmentSchema1);
export default HighwaySegment1;
