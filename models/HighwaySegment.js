import mongoose from 'mongoose';

const laneSchema = new mongoose.Schema({
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
    roughness: String, // "normal" or "critical"
    rutDepth: String,
    crackPercent: String,
    ravelling: String
  }
});

const highwaySegmentSchema = new mongoose.Schema({
  highway: String,
  startChainage: Number,
  endChainage: Number,
  segmentLength: Number,
  structure:String,
  url:{
    type:String,
  },
  lanes: [laneSchema],
  created_at: {
    type: Date,
    default: Date.now
  }
});

const HighwaySegment = mongoose.model('HighwaySegment', highwaySegmentSchema);
export default HighwaySegment;

