// Shared interpretation of the existing public Uptime Kuma payloads.
// Unknown data takes precedence over an aggregate health claim.
export function heartbeatState(status) {
  if (status === 1 || status === '1') return 'healthy';
  if (status === 0 || status === '0') return 'offline';
  if (status === 3 || status === '3') return 'maintenance';
  return 'unknown';
}

export function publicGroups(config) {
  if (!Array.isArray(config?.publicGroupList)) {
    throw new Error('Invalid monitoring configuration');
  }
  for (const group of config.publicGroupList) {
    if (typeof group?.name !== 'string' || !Array.isArray(group.monitorList) ||
        group.monitorList.some((monitor) => !monitor ||
          typeof monitor.name !== 'string' || !validId(monitor.id))) {
      throw new Error('Invalid monitoring group');
    }
  }
  return config.publicGroupList;
}

function validId(id) {
  return (Number.isSafeInteger(id) && id >= 0) ||
    (typeof id === 'string' && /^\d+$/.test(id));
}

export function heartbeatHistory(data, id) {
  if (!validId(id) || !Object.hasOwn(data?.heartbeatList ?? {}, String(id))) return [];
  const history = data.heartbeatList[String(id)];
  return Array.isArray(history) ? history : [];
}

export function monitorState(data, id) {
  return heartbeatState(heartbeatHistory(data, id).at(-1)?.status);
}

export function monitorUptime(data, id) {
  if (!validId(id)) return null;
  const value = data?.uptimeList?.[`${id}_24`];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value * 100 : null;
}

export function summarizeMonitors(ids, data) {
  const states = ids.map((id) => monitorState(data, id));
  const healthy = states.filter((state) => state === 'healthy').length;
  let state = 'unknown';
  if (states.length && !states.includes('unknown')) {
    if (healthy === states.length) state = 'healthy';
    else if (states.every((value) => value === 'offline')) state = 'offline';
    else if (states.includes('offline')) state = 'degraded';
    else if (states.includes('maintenance')) state = 'maintenance';
  }
  const uptimes = ids.map((id) => monitorUptime(data, id));
  // Do not silently report an average over only the usable subset.
  const uptime = uptimes.length && uptimes.every((value) => value !== null)
    ? uptimes.reduce((sum, value) => sum + value, 0) / uptimes.length : null;
  return { state, healthy, total: ids.length, uptime };
}

export function stateLabel(state) {
  return {
    healthy: 'Operational', offline: 'Offline', degraded: 'Degraded',
    maintenance: 'Maintenance', unknown: 'Unknown', neutral: 'Not monitored'
  }[state] ?? 'Unknown';
}
