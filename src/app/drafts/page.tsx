import {workspaceMode} from '@/lib/workspace-mode';
import {mailSource} from '@/lib/mail-source';
import {draftWorkspace} from '@/lib/draft-workspace';
import {requireSession} from '@/lib/db';
import DraftWorkspace from '@/components/DraftWorkspace';
export const dynamic='force-dynamic';
export default async function Drafts({searchParams}:{searchParams:Promise<{source?:string;email?:string;view?:string}>}){const sp=await searchParams,requested=sp.source,source=requested?mailSource(requested):await workspaceMode();await requireSession();return <DraftWorkspace key={source} initial={await draftWorkspace(source)} initialQuery={sp.email||''} initialFilter={sp.view||'review'}/>}
