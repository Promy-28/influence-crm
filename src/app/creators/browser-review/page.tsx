import {requireSession} from '@/lib/db';
import {reviewWorkspace} from '@/lib/creator-review-workspace';
import CreatorBrowserAgent from '@/components/CreatorBrowserAgent';
export const dynamic='force-dynamic';
export default async function BrowserReview(){await requireSession();return <CreatorBrowserAgent initial={await reviewWorkspace()}/>}
