// Approved, sanitized Rock Solid Labs homelab case studies.
export const incidents = [
  {
    "number": "001",
    "title": "TrueNAS Storage Recovery",
    "impact": "Media storage and dependent services became unavailable after the storage system failed to boot normally.",
    "symptoms": [
      "TrueNAS did not boot into the normal operating environment.",
      "Storage-dependent services could not access expected media datasets.",
      "The system required recovery before normal application access could resume."
    ],
    "investigation": [
      "Confirmed the issue was isolated to the storage VM rather than the entire Proxmox host.",
      "Verified existing datasets and storage structure before recovery.",
      "Evaluated whether the installed operating environment could be repaired safely."
    ],
    "resolution": [
      "Reinstalled TrueNAS SCALE.",
      "Restored the storage configuration and datasets.",
      "Recreated/validated required SMB shares.",
      "Verified application access to the restored media storage.",
      "Confirmed Plex playback after recovery."
    ],
    "lessons": [
      "Separate operating-system recovery from stored datasets.",
      "Maintain documentation of datasets, shares, and dependent services.",
      "Validate storage dependencies after recovery before declaring services healthy.",
      "Preserve backups/configuration information needed to rebuild storage services."
    ],
    "rootCause": "The TrueNAS boot environment became unusable and the system dropped to a bootloader/recovery state.",
    "technologies": [
      "Proxmox VE",
      "TrueNAS SCALE",
      "ZFS/storage management",
      "SMB/CIFS",
      "Linux",
      "Plex"
    ]
  },
  {
    "number": "002",
    "title": "Missing SMB Mounts After Host Recovery",
    "impact": "Media applications appeared healthy, but expected media paths were unavailable, preventing normal access to library content.",
    "symptoms": [
      "Plex/application processes were running.",
      "Network connectivity was available.",
      "Media directories expected by applications were empty or unavailable.",
      "Storage itself remained reachable."
    ],
    "investigation": [
      "Checked application/container health.",
      "Verified network and DNS connectivity.",
      "Confirmed TrueNAS and SMB services were online.",
      "Compared expected application paths with mounted storage paths.",
      "Determined that the storage dependency had not remounted correctly after recovery/reboot."
    ],
    "resolution": [
      "Restored the required SMB mounts.",
      "Verified credentials/configuration used by the mount process.",
      "Validated application path mappings.",
      "Confirmed the media directories populated correctly.",
      "Verified successful Plex playback after storage access was restored."
    ],
    "lessons": [
      "Service health alone does not prove application dependencies are healthy.",
      "Storage mounts should be explicitly checked as part of application troubleshooting.",
      "Startup/recovery procedures should validate dependencies before dependent services are considered operational.",
      "Monitoring should distinguish between “process running” and “application usable.”"
    ],
    "rootCause": "Persistent SMB mounts on the application host were missing even though the upstream storage server and application services were operational.",
    "technologies": [
      "Linux",
      "SMB/CIFS",
      "TrueNAS",
      "Plex",
      "Docker/containers",
      "Proxmox VE",
      "DNS"
    ]
  },
  {
    "number": "003",
    "title": "Nginx Container Restart Loop During Resume-Site Deployment",
    "impact": "The Rock Solid Labs resume site could not start successfully during an early deployment iteration.",
    "symptoms": [
      "Nginx container repeatedly restarted.",
      "The website was unavailable.",
      "Docker reported the container as unhealthy/restarting."
    ],
    "investigation": [
      "Reviewed container status.",
      "Inspected Docker/Nginx logs.",
      "Examined the generated Nginx configuration.",
      "Identified an invalid directive in the configuration file."
    ],
    "resolution": [
      "Rewrote/corrected the Nginx configuration.",
      "Restarted the container.",
      "Verified Nginx started normally.",
      "Confirmed the Astro static site was served successfully."
    ],
    "lessons": [
      "Validate generated configuration before deployment.",
      "Use container logs as an early diagnostic source.",
      "Keep configuration changes under Git version control.",
      "Run syntax/build validation before production deployment.",
      "Small configuration errors can cause complete service failure even when the underlying host and container runtime are healthy."
    ],
    "rootCause": "An unintended EOFcat directive was present in the Nginx configuration, preventing Nginx from parsing the configuration and starting successfully.",
    "technologies": [
      "Nginx",
      "Docker",
      "Ubuntu Linux",
      "Astro",
      "Git",
      "Proxmox VE"
    ]
  }
];
