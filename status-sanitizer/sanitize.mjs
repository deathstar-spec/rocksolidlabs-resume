// Publication policy: labels and IDs below are independent of Kuma's IDs.
// New upstream groups/monitors do not automatically become public.
export const APPROVED_GROUPS = [
  { name: 'Project Orange', monitors: [
    { id: 101, name: 'Nginx Proxy Manager' },
    { id: 102, name: 'Overseerr' },
    { id: 103, name: 'Prowlarr' },
    { id: 104, name: 'Radarr' },
    { id: 105, name: 'Sonarr' },
    { id: 106, name: 'qBittorrent' }
  ] },
  { name: 'Core Infrastructure', monitors: [
    { id: 201, name: 'Proxmox' },
    { id: 202, name: 'TrueNAS' },
    { id: 203, name: 'Pi-Hole' },
    { id: 204, name: 'Plex' }
  ] }
];
for (const group of APPROVED_GROUPS) {
  group.monitors.forEach(Object.freeze);
  Object.freeze(group.monitors);
  Object.freeze(group);
}
Object.freeze(APPROVED_GROUPS);

export const HISTORY_LIMIT = 28;
const invalid = () => { throw new Error('Invalid monitoring data'); };
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => Object.hasOwn(object, key) ? object[key] : undefined;

function upstreamId(value) {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) value = Number(value);
  if (!Number.isSafeInteger(value) || value <= 0) invalid();
  return String(value);
}

function sanitizeBeat(beat) {
  if (!record(beat)) invalid();
  const status = beat.status;
  // Pending (2) is interpreted as unknown by the existing frontend helper.
  if (![0, 1, 2, 3].includes(status)) invalid();
  const result = { status };
  if (beat.ping !== undefined && beat.ping !== null) {
    if (typeof beat.ping !== 'number' || !Number.isFinite(beat.ping) || beat.ping < 0) invalid();
    result.ping = beat.ping;
  }
  return result;
}

export function sanitize(config, heartbeat) {
  if (!record(config) || !Array.isArray(config.publicGroupList) ||
      !record(heartbeat) || !record(heartbeat.heartbeatList) || !record(heartbeat.uptimeList)) invalid();
  const publicGroupList = [];
  const heartbeatList = {};
  const uptimeList = {};
  const usedIds = new Set();

  for (const approved of APPROVED_GROUPS) {
    const matches = config.publicGroupList.filter((group) => group?.name === approved.name);
    // Missing/ambiguous approved inventory fails closed rather than showing a partial healthy lab.
    if (matches.length !== 1 || !Array.isArray(matches[0].monitorList)) invalid();
    const monitorList = [];
    for (const monitor of approved.monitors) {
      const matchesByName = matches[0].monitorList.filter((item) => item?.name === monitor.name);
      if (matchesByName.length !== 1) invalid();
      const id = upstreamId(matchesByName[0].id);
      if (usedIds.has(id)) invalid();
      usedIds.add(id);

      const history = own(heartbeat.heartbeatList, id);
      if (history !== undefined && !Array.isArray(history)) invalid();
      heartbeatList[monitor.id] = (history ?? []).slice(-HISTORY_LIMIT).map(sanitizeBeat);

      const uptime = own(heartbeat.uptimeList, `${id}_24`);
      if (uptime !== undefined && uptime !== null) {
        if (typeof uptime !== 'number' || !Number.isFinite(uptime) || uptime < 0 || uptime > 1) invalid();
        uptimeList[`${monitor.id}_24`] = uptime;
      }
      monitorList.push({ id: monitor.id, name: monitor.name });
    }
    publicGroupList.push({ name: approved.name, monitorList });
  }
  return { config: { publicGroupList }, heartbeat: { heartbeatList, uptimeList } };
}
