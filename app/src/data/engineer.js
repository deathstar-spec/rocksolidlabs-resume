import { incidents } from './incidents.js';

// Static, sanitized narrative. Diagnostic examples are illustrative, never executed.
const storageIncident = incidents.find((incident) => incident.number === '002');
if (!storageIncident) throw new Error('The storage walkthrough requires incident 002 in the public catalog.');
export const storageWalkthrough = {
  ...storageIncident,
  title: 'Storage Dependency Failure After Power Event',
  summary: 'After an unexpected power event, an application was running but its expected media/data directories were empty.',
  steps: [
    {
      title: 'Observe', status: 'DEGRADED', dependency: 'Unavailable',
      summary: 'Start with the user-visible failure, then separate service health from application usability.',
      items: ['Application service was running.', 'Storage server was reachable.', 'Application directories were empty.', 'Dependent services could not access expected files.'],
    },
    {
      title: 'Form hypothesis', status: 'INVESTIGATING', dependency: 'Under investigation',
      summary: 'A running application may still have a failed dependency. Check whether storage access recovered after the shutdown.',
      items: ['Consider a missing storage mount before assuming the data is gone.', 'Distinguish remote storage availability from the application host’s mounted paths.'],
    },
    {
      title: 'Test', status: 'INVESTIGATING', dependency: 'Mount missing',
      summary: 'Compare expected mounts and available filesystems; check the mount service and remote reachability.',
      items: ['The storage service was online.', 'The application’s storage mount had not recovered after the power event.', 'Reachability alone does not establish that a share is mounted or usable.'],
      commands: ['mount', 'df -h', 'systemctl status <mount-unit>', 'ping <storage-host>'],
      finding: 'Storage reachable; expected application storage mount missing. This is a sanitized finding, not captured command output.',
    },
    {
      title: 'Identify root cause', status: 'INVESTIGATING', dependency: 'Mount missing',
      summary: 'Storage dependency failed to remount following the unexpected shutdown.',
      items: ['The application process and upstream storage could be operational while the path between them was unavailable.', 'The missing mount explained the empty application directories.'],
    },
    {
      title: 'Resolve', status: 'INVESTIGATING', dependency: 'Restored · verification pending',
      summary: 'Restore the dependency, then validate access before treating the application as recovered.',
      items: ['Verified remote storage availability.', 'Restored the affected mount.', 'Verified permissions.', 'Restarted dependent services where required.', 'Confirmed expected files were visible.', 'Tested application functionality from a client.'],
    },
    {
      title: 'Verify', status: 'RESOLVED', dependency: 'Healthy · verified',
      summary: 'Confirm the full path from storage to the client, not just that a process is running.',
      items: ['Mount healthy.', 'Files accessible.', 'Application healthy.', 'Client functionality confirmed.'],
    },
    {
      title: 'Prevent', status: 'RESOLVED', dependency: 'Healthy · verified',
      summary: 'Recommended improvement: add dependency monitoring and alerting so failed mounts can be detected before a user reports an outage.',
      items: ['Treat mount availability as a separate dependency check.', 'Validate dependencies during recovery before declaring the application healthy.', 'This improvement is a recommendation, not a claim that monitoring is already implemented.'],
    },
  ],
};

// Add approved walkthroughs here as they become available; retain catalog numbering.
export const walkthroughs = [storageWalkthrough];
export const engineerCategories = [
  { label: 'Incidents', href: '#incidents' },
  { label: 'Architecture', href: null },
  { label: 'Runbooks', href: null },
];
