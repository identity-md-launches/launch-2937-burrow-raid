export const NOW = Date.parse("2026-11-03T23:00:00.000Z");
export function snapshot(work = "100", options: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    installationId: "test-installation",
    revision: "test-revision",
    generatedAt: new Date(NOW).toISOString(),
    measurement: {
      freshness: "online",
      observedAt: new Date(NOW).toISOString(),
      receivedAt: new Date(NOW).toISOString(),
      staleAfterSeconds: 120,
      counterEpoch: "2f3b9f13-33dd-4d62-9c61-01c6d90a8021",
      cumulativeWorkUnits: work,
      provenance: "hardware",
      coreStatus: "ACTIVE",
      rpmMilli: 40000,
      speedMmPerSecond: 500,
      distanceMm: 200,
      ...options,
    },
    builder: { status: "unavailable", reason: "no_measurement" },
    oracle: {
      state: "accepted",
      reason: null,
      latestAcceptedAt: new Date(NOW).toISOString(),
      latestClosure: null,
    },
    settlementQueue: {
      status: "unavailable",
      reason: "oracle_head_unavailable",
    },
    modules: [],
  };
}
export function nextSnapshot(
  work: string,
  seconds: number,
  options: Record<string, unknown> = {},
) {
  const s = snapshot(work, {
    observedAt: new Date(NOW + seconds * 1000).toISOString(),
    receivedAt: new Date(NOW + seconds * 1000).toISOString(),
    ...options,
  });
  s.generatedAt = new Date(NOW + seconds * 1000).toISOString();
  return s;
}
