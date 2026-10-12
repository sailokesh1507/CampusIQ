import { UNIFIED_HEADERS } from './validators.js';

export function unifiedTemplate(): string {
  return `${UNIFIED_HEADERS.join(',')}\nSYN-001,Synthetic Student Example,Computer Science,B.Tech Computer Science,4,2026-01-15T00:00:00.000Z,8.2,10,81,0,"CS101:82;MATH101:80",88,"CS101:90;MATH101:86",16,84,3,1,1,1,76,72,74,78,80,4,"Synthetic demonstration only"\n`;
}
