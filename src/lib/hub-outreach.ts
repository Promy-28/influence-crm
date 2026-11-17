import {createHmac,timingSafeEqual} from 'node:crypto';
export const redditCampaigns=[['2d02d560-a584-4844-948c-3ed035b9e9e8','Green / Yellow Reddit'],['9296d2af-c971-40c5-9572-440860bc2a65','Red Reddit']] as const;
export function approvalToken(id:string,email:string,campaign:string,at:string){return createHmac('sha256',process.env.SESSION_SECRET!).update(JSON.stringify([id,email,campaign,at])).digest('hex')}
export function validApproval(id:string,email:string,campaign:string,at:string,token:string){if(!redditCampaigns.some(([c])=>c===campaign)||!/^\d+$/.test(at)||Math.abs(Date.now()-Number(at))>15*60000)return false;const expected=Buffer.from(approvalToken(id,email,campaign,at)),supplied=Buffer.from(token);return expected.length===supplied.length&&timingSafeEqual(expected,supplied)}
