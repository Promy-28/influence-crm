import type {MailSource} from './mail-source.ts';
export const MODE_COOKIE='promy_workspace_mode';
export function normalizedMode(value:unknown):MailSource|null{return value==='apify'||value==='found'?'apify':value==='reddit'?'reddit':null}
const apifyPages=['/review','/sourcing','/tests','/analytics'];
export function resolveWorkspaceMode(path:string,explicit:unknown,stored:unknown,legacyApify=false):MailSource{
 if(path.startsWith('/outreach/')||path==='/creators/reddit-approval')return 'reddit';
 if(apifyPages.includes(path)||path.startsWith('/creators/'))return 'apify';
 return normalizedMode(explicit)||(path==='/inbox'&&legacyApify?'apify':null)||normalizedMode(stored)||'reddit';
}
export function modeDestination(path:string,mode:MailSource){
 if(path.startsWith('/creators/')||path.startsWith('/outreach/'))path='/creators';
 if(mode==='reddit'&&apifyPages.includes(path))path=path==='/review'?'/creators':'/';
 const allowed=['/','/creators','/inbox','/drafts','/import','/review','/sourcing','/tests','/analytics','/mailboxes','/settings','/guide','/log','/test-email'];
 if(!allowed.includes(path))path='/';
 return path+'?source='+mode;
}
