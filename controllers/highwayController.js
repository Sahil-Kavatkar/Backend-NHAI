import HighwaySegment from '../models/HighwaySegment.js';
import geolib from 'geolib';

export const getHighwayLaneData = async (req, res) => {
  try {
    const { highway, laneId, startLat, startLng } = req.query;

    if (!highway || !laneId || !startLat || !startLng) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }

    const segments = await HighwaySegment.find({ highway });

    let bestMatch = null;
    let closestDistance = Infinity;

    segments.forEach(segment => {
      const lane = segment.lanes.find(l => l.laneId === laneId);

      if (lane) {
        const dist = geolib.getDistance(
          { latitude: parseFloat(startLat), longitude: parseFloat(startLng) },
          { latitude: lane.startLat, longitude: lane.startLng }
        );

        if (dist < closestDistance) {
          closestDistance = dist;
          bestMatch = {
            highway: segment.highway,
            startChainage: segment.startChainage,
            endChainage: segment.endChainage,
            segmentLength: segment.segmentLength,
            structure: segment.structure,
            url: segment.url,
            lane
          };
        }
      }
    });

    if (!bestMatch) {
      return res.status(404).json({ error: 'No matching segment/lane found' });
    }

    res.json(bestMatch);
  } catch (err) {
    console.error('Error fetching segment:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getHighwayConditionStats = async (req, res) => {
  try {
    const { highway } = req.query;
    if (!highway) {
      return res.status(400).json({ error: 'Highway name is required' });
    }

    const segments = await HighwaySegment.find({ highway });
    if (!segments.length) {
      return res.status(404).json({ error: 'No data found for this highway' });
    }

    let totalLanes = 0;
    let criticalCounts = {
      roughness: 0,
      rutDepth: 0,
      crackPercent: 0,
      ravelling: 0
    };

    segments.forEach(segment => {
      segment.lanes.forEach(lane => {
        totalLanes++;
        if (lane.status.roughness === 'critical') criticalCounts.roughness++;
        if (lane.status.rutDepth === 'critical') criticalCounts.rutDepth++;
        if (lane.status.crackPercent === 'critical') criticalCounts.crackPercent++;
        if (lane.status.ravelling === 'critical') criticalCounts.ravelling++;
      });
    });

    // Calculate percentages
    const percent = type => ((criticalCounts[type] / totalLanes) * 100).toFixed(2);

    res.json({
      highway,
      totalLanes,
      criticalCounts,
      percentages: {
        roughness: percent('roughness') + '%',
        rutDepth: percent('rutDepth') + '%',
        crackPercent: percent('crackPercent') + '%',
        ravelling: percent('ravelling') + '%'
      }
    });

  } catch (err) {
    console.error('Error in status route:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getLaneWiseStats = async (req, res) => {
  try {
    const { highway, laneId } = req.query;

    if (!highway || !laneId) {
      return res.status(400).json({ error: 'Missing highway or laneId in query' });
    }

    const segments = await HighwaySegment.find({ highway });

    if (!segments.length) {
      return res.status(404).json({ error: 'No highway segments found' });
    }

    let totalLanes = 0;
    let criticalCounts = {
      roughness: 0,
      rutDepth: 0,
      crackPercent: 0,
      ravelling: 0
    };

    const laneDataList = [];

    segments.forEach(segment => {
      const lane = segment.lanes.find(l => l.laneId === laneId);

      if (lane) {
        totalLanes++;

        // Count critical fields
        if (lane.status.roughness === 'critical') criticalCounts.roughness++;
        if (lane.status.rutDepth === 'critical') criticalCounts.rutDepth++;
        if (lane.status.crackPercent === 'critical') criticalCounts.crackPercent++;
        if (lane.status.ravelling === 'critical') criticalCounts.ravelling++;

        laneDataList.push({
          startChainage: segment.startChainage,
          endChainage: segment.endChainage,
          segmentLength: segment.segmentLength,
          structure: segment.structure,
          lane
        });
      }
    });

    if (laneDataList.length === 0) {
      return res.status(404).json({ error: `No ${laneId} lane data found in highway ${highway}` });
    }

    const percent = type => ((criticalCounts[type] / totalLanes) * 100).toFixed(2);

    res.json({
      highway,
      laneId,
      totalLanes,
      criticalCounts,
      percentages: {
        roughness: percent('roughness') + '%',
        rutDepth: percent('rutDepth') + '%',
        crackPercent: percent('crackPercent') + '%',
        ravelling: percent('ravelling') + '%'
      },
      data: laneDataList
    });

  } catch (err) {
    console.error('Error in lane-wise route:', err);
    res.status(500).json({ error: 'Server error' });
  }
};


export const getCriticalLaneSegments = async (req, res) => {
  try {
    const { highway, laneId } = req.query;

    if (!highway || !laneId) {
      return res.status(400).json({ error: 'Missing highway or laneId in query' });
    }

    const segments = await HighwaySegment.find({ highway });

    if (!segments.length) {
      return res.status(404).json({ error: 'No segments found for this highway' });
    }

    const criticalSegments = [];

    segments.forEach(segment => {
      const lane = segment.lanes.find(l => l.laneId === laneId);

      if (lane) {
        const { status } = lane;
        const hasCritical = Object.values(status).includes('critical');

        if (hasCritical) {
          criticalSegments.push({
            startChainage: segment.startChainage,
            endChainage: segment.endChainage,
            segmentLength: segment.segmentLength,
            structure: segment.structure,
            lane
          });
        }
      }
    });

    if (criticalSegments.length === 0) {
      return res.status(200).json({ message: 'No critical lanes found for this highway and laneId' });
    }

    res.json(criticalSegments);

  } catch (err) {
    console.error('Error in critical-lanes route:', err);
    res.status(500).json({ error: 'Server error' });
  }
};


export const getLaneCoordinatesForPlotting = async (req, res) => {
  try {
    const { highway } = req.query;
    const laneId = 'L1'; // For now, hardcoded to L1

    if (!highway) {
      return res.status(400).json({ error: 'Missing highway query parameter' });
    }

    const segments = await HighwaySegment.find({ highway });

    if (!segments.length) {
      return res.status(404).json({ error: 'No segments found for this highway' });
    }

    const points = [];
    

    segments.forEach(segment => {
      
      const lane = segment.lanes.find(l => l.laneId === laneId);
      if (lane && lane.startLat && lane.startLng) {
        points.push({ startLat: lane.startLat, startLng: lane.startLng });
      }
    });
    
    res.json(points);
  } catch (err) {
    console.error('Error in plot-lane route:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
