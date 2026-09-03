export interface AthleteParams {
  restHr: number;
  maxHr: number;
  gender: "male" | "female";
}

export interface StreamData {
  time?: number[];
  heartrate?: number[];
}

export interface HrZoneDistribution {
  zone1Seconds: number;
  zone2Seconds: number;
  zone3Seconds: number;
  zone4Seconds: number;
  zone5Seconds: number;
  zonePercentages: [number, number, number, number, number];
}

/**
 * Calculates Banister's TRIMP (Training Impulse).
 * Uses second-by-second telemetry streams if available; falls back to summary duration and avg HR.
 */
export function calculateBanisterTrimp(
  durationSeconds: number,
  avgHr: number | null,
  athlete: AthleteParams,
  streams?: StreamData
): number {
  const { restHr, maxHr, gender } = athlete;
  const hrRange = Math.max(1, maxHr - restHr);
  const genderFactor = gender === "female" ? 1.67 : 1.92;
  const genderCoeff = gender === "female" ? 0.86 : 0.64;

  const hrStream = streams?.heartrate;
  const timeStream = streams?.time;

  if (hrStream && timeStream && hrStream.length > 1 && hrStream.length === timeStream.length) {
    let totalTrimp = 0;

    for (let i = 1; i < hrStream.length; i++) {
      const dtMinutes = Math.max(0, (timeStream[i] - timeStream[i - 1]) / 60);
      const currentHr = hrStream[i];
      const deltaHrRatio = Math.min(1, Math.max(0, (currentHr - restHr) / hrRange));
      const expMultiplier = genderCoeff * Math.exp(genderFactor * deltaHrRatio);

      totalTrimp += dtMinutes * deltaHrRatio * expMultiplier;
    }

    return Math.round(totalTrimp * 10) / 10;
  }

  if (!avgHr) return 0;

  const durationMinutes = durationSeconds / 60;
  const deltaHrRatio = Math.min(1, Math.max(0, (avgHr - restHr) / hrRange));
  const expMultiplier = genderCoeff * Math.exp(genderFactor * deltaHrRatio);
  const trimp = durationMinutes * deltaHrRatio * expMultiplier;

  return Math.round(trimp * 10) / 10;
}

/**
 * Calculates 5-zone HR breakdown from heart rate stream.
 */
export function calculateHrZones(
  maxHr: number,
  streams?: StreamData
): HrZoneDistribution {
  const hrStream = streams?.heartrate;
  const timeStream = streams?.time;

  const zones = {
    zone1Seconds: 0,
    zone2Seconds: 0,
    zone3Seconds: 0,
    zone4Seconds: 0,
    zone5Seconds: 0,
    zonePercentages: [0, 0, 0, 0, 0] as [number, number, number, number, number],
  };

  if (!hrStream || !timeStream || hrStream.length < 2) {
    return zones;
  }

  const z1Threshold = maxHr * 0.6;
  const z2Threshold = maxHr * 0.7;
  const z3Threshold = maxHr * 0.8;
  const z4Threshold = maxHr * 0.9;

  let totalDuration = 0;

  for (let i = 1; i < hrStream.length; i++) {
    const dt = Math.max(0, timeStream[i] - timeStream[i - 1]);
    const hr = hrStream[i];
    totalDuration += dt;

    if (hr < z1Threshold) {
      zones.zone1Seconds += dt;
    } else if (hr < z2Threshold) {
      zones.zone2Seconds += dt;
    } else if (hr < z3Threshold) {
      zones.zone3Seconds += dt;
    } else if (hr < z4Threshold) {
      zones.zone4Seconds += dt;
    } else {
      zones.zone5Seconds += dt;
    }
  }

  if (totalDuration > 0) {
    zones.zonePercentages = [
      Math.round((zones.zone1Seconds / totalDuration) * 100),
      Math.round((zones.zone2Seconds / totalDuration) * 100),
      Math.round((zones.zone3Seconds / totalDuration) * 100),
      Math.round((zones.zone4Seconds / totalDuration) * 100),
      Math.round((zones.zone5Seconds / totalDuration) * 100),
    ];
  }

  return zones;
}

export interface AcwrResult {
  acuteLoad7d: number;
  chronicLoad28d: number;
  acwr: number;
  status: "undertraining" | "sweet_spot" | "overreaching" | "danger";
}

/**
 * Calculates 7-day Acute Load, 28-day Chronic Load, and ACWR.
 * Expects 28 daily TRIMP values ordered chronologically (index 0 = 27 days ago, index 27 = today).
 */
export function calculateAcwr(dailyLoads28Days: number[]): AcwrResult {
  const padded = [...Array(Math.max(0, 28 - dailyLoads28Days.length)).fill(0), ...dailyLoads28Days].slice(-28);

  const past7Days = padded.slice(-7);
  const acuteSum = past7Days.reduce((acc, val) => acc + val, 0);
  const acuteLoad7d = Math.round((acuteSum / 7) * 10) / 10;

  const chronicSum = padded.reduce((acc, val) => acc + val, 0);
  const chronicLoad28d = Math.round((chronicSum / 28) * 10) / 10;

  const rawAcwr = chronicLoad28d > 0 ? acuteLoad7d / chronicLoad28d : acuteLoad7d > 0 ? 1.0 : 0.0;
  const acwr = Math.round(rawAcwr * 100) / 100;

  let status: AcwrResult["status"] = "sweet_spot";
  if (acwr < 0.8) {
    status = "undertraining";
  } else if (acwr <= 1.3) {
    status = "sweet_spot";
  } else if (acwr <= 1.5) {
    status = "overreaching";
  } else {
    status = "danger";
  }

  return { acuteLoad7d, chronicLoad28d, acwr, status };
}
