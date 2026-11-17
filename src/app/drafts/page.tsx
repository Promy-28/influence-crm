import {mailSource} from '@/lib/mail-source';
import {draftWorkspace} from '@/lib/draft-workspace';
import {requireSession} from '@/lib/db';
import DraftWorkspace from '@/components/DraftWorkspace';
export const dynamic='force-dynamic';
export default async function Drafts({searchParams}:{searchParams:Promise<{source?:string}>}){const source=mailSource((await searchParams).source);await requireSession();return <DraftWorkspace key={source} initial={await draftWorkspace(source)}/>}
