export type StageStatus = 'GREEN' | 'AMBER' | 'RED';

export type StageGateSnapshot = {
  windowStart: Date;
  windowEnd: Date;
  waitP50Seconds: number | null;
  waitP90Seconds: number | null;
  abandonmentRate: number | null;
  completionRate: number | null;
  mutualMatchRate: number | null;
  chatActivationRate: number | null;
  severeIncidentPer10k: number | null;
  appealOverturnRate: number | null;
  severeActionLatencyP95: number | null;
  stage0Status: StageStatus;
  stage1Status: StageStatus;
  stage2Status: StageStatus;
  autoPauseTriggered: boolean;
  autoPauseReasons: string[];
};

export type StageGateView = {
  windowStart: string;
  windowEnd: string;
  metrics: {
    waitP50Seconds: number | null;
    waitP90Seconds: number | null;
    abandonmentRate: number | null;
    completionRate: number | null;
    mutualMatchRate: number | null;
    chatActivationRate: number | null;
    severeIncidentPer10k: number | null;
    appealOverturnRate: number | null;
    severeActionLatencyP95: number | null;
  };
  statuses: {
    stage0: StageStatus;
    stage1: StageStatus;
    stage2: StageStatus;
  };
  autoPause: {
    triggered: boolean;
    reasons: string[];
  };
};
