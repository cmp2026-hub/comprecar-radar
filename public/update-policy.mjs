export const POLL_INTERVAL=5*60*1000;
export const cacheFresh=(entry,now=Date.now())=>!!entry&&now>=entry.at&&now-entry.at<POLL_INTERVAL;
export function postsSignature(data){return JSON.stringify([data.groups||[],Object.entries(data.statuses||{}).sort(([a],[b])=>a.localeCompare(b)).map(([network,status])=>[network,status.state,status.confirmed,status.pending])]);}
export function audienceSignature(report){if(!report)return null;return JSON.stringify([report.from,report.to,report.startedAt,report.followers,report.observedDelta,report.comparedPosts,report.networks.map(n=>[n.network,n.followers?.value,n.followers?.approximate,n.followers?.stale,n.observedDelta,n.comparedPosts])]);}
