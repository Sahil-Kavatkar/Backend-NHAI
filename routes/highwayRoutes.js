import express from 'express';
import { getHighwayLaneData, getHighwayConditionStats, getLaneWiseStats, getCriticalLaneSegments, getLaneCoordinatesForPlotting} from '../controllers/highwayController.js';

const router = express.Router();

// Example: /api/highway?highway=NH148N&laneId=L2&startLat=26.34&startLng=76.25
router.get('/highway', getHighwayLaneData);

router.get('/status', getHighwayConditionStats);

router.get('/lane-info', getLaneWiseStats);

router.get('/critical-lanes', getCriticalLaneSegments);

router.get('/plot-lane', getLaneCoordinatesForPlotting);


export default router;
