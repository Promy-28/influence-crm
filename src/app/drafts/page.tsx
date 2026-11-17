import {draftWorkspace} from '@/lib/draft-workspace';
import {requireSession} from '@/lib/db';
import DraftWorkspace from '@/components/DraftWorkspace';
export const dynamic='force-dynamic';
export default async function Drafts(){await requireSession();return <DraftWorkspace initial={await draftWorkspace()}/>}
